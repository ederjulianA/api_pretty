# Performance - Endpoint /api/articulos

## 1. Query `getArticulos` - CTE con calculos redundantes de costo bundle

**Severidad: ALTA**
**Archivo:** articulosModel.js:342-505

La expresion `CASE WHEN ISNULL(a.art_bundle,'N')='S' THEN ISNULL(bundle_costo.costo_total,0) ELSE ISNULL(ad1.art_bod_cos_cat,0) END` se repite **9 veces** en el query dentro del CTE `ArticulosBase`.

Esto obliga al motor SQL a recalcular la misma expresion en cada fila multiples veces.

**Recomendacion:** Usar `CROSS APPLY` o un CTE intermedio para calcular el costo una sola vez:

```sql
WITH CostoArticulo AS (
    SELECT
        a.art_sec,
        CASE
            WHEN ISNULL(a.art_bundle, 'N') = 'S'
            THEN ISNULL(bundle_costo.costo_total, 0)
            ELSE ISNULL(ad1.art_bod_cos_cat, 0)
        END AS costo_efectivo
    FROM dbo.articulos a
    LEFT JOIN ...
),
ArticulosBase AS (
    SELECT
        ...,
        c.costo_efectivo AS costo_promedio,
        CASE WHEN ad1.art_bod_pre > 0
            THEN CAST(((ad1.art_bod_pre - c.costo_efectivo) / ad1.art_bod_pre) * 100 AS DECIMAL(5,2))
            ELSE 0
        END AS rentabilidad_detal,
        ...
    FROM dbo.articulos a
    JOIN CostoArticulo c ON c.art_sec = a.art_sec
    ...
)
```

**Impacto estimado:** Reduccion significativa de calculos por fila, especialmente con catalogo grande.

---

## 2. `articulosdetalle` ya tiene columnas calculadas PERSISTED

**Severidad: ALTA**
**Descubrimiento en BD:**

La tabla `articulosdetalle` tiene columnas calculadas PERSISTED en la BD:

```sql
[rentabilidad] AS (CASE WHEN art_bod_pre > 0 AND art_bod_cos_cat IS NOT NULL
    THEN CONVERT(decimal(5,2), ((art_bod_pre - art_bod_cos_cat) / art_bod_pre) * 100) ELSE 0 END) PERSISTED

[margen_ganancia] AS (CASE WHEN art_bod_cos_cat > 0 AND art_bod_pre IS NOT NULL
    THEN CONVERT(decimal(5,2), ((art_bod_pre - art_bod_cos_cat) / art_bod_cos_cat) * 100) ELSE 0 END) PERSISTED

[utilidad_bruta] AS (CASE WHEN art_bod_pre IS NOT NULL AND art_bod_cos_cat IS NOT NULL
    THEN CONVERT(decimal(17,2), art_bod_pre - art_bod_cos_cat) ELSE 0 END) PERSISTED

[clasificacion_rentabilidad] AS (CASE ... END) PERSISTED
```

**El query en `getArticulos` y `getArticulo` RECALCULA estas metricas manualmente** en vez de usar las columnas PERSISTED que ya existen en la tabla.

**Recomendacion para productos simples (NO bundles):** Usar directamente las columnas persisted:
```sql
SELECT
    ad1.rentabilidad AS rentabilidad_detal,
    ad1.margen_ganancia AS margen_ganancia_detal,
    ad1.utilidad_bruta AS utilidad_bruta_detal,
    ad1.clasificacion_rentabilidad
FROM dbo.articulosdetalle ad1
WHERE ad1.lis_pre_cod = 1 AND ad1.bod_sec = '1'
```

Solo calcular manualmente para bundles (que necesitan sumar costos de componentes).

**Impacto estimado:** Eliminacion de calculos redundantes para ~95% de productos (no bundles).

---

## 3. `CAST(art_sec AS INT)` en ORDER BY

**Severidad: MEDIA**
**Archivo:** articulosModel.js:502

```sql
ORDER BY CAST(art_sec AS INT) DESC
```

`art_sec` es `VARCHAR(30)`. El CAST a INT:
1. Impide el uso de indices en el ORDER BY
2. Falla si hay `art_sec` no numericos
3. Fuerza un SORT en cada ejecucion

**Recomendacion:**
- Si `art_sec` siempre es numerico: agregar una columna `art_sec_num INT` indexada, o usar indice calculado
- Alternativa rapida: ordenar por `art_sec DESC` (ordenamiento lexicografico) si el negocio lo permite
- Si necesita orden numerico: crear un indice calculado en SQL Server:
```sql
CREATE INDEX IX_articulos_art_sec_num ON dbo.articulos (CAST(art_sec AS INT) DESC);
```

---

## 4. `OPTION (RECOMPILE)` en getArticulos

**Severidad: MEDIA**
**Archivo:** articulosModel.js:505

```sql
OPTION (RECOMPILE);
```

Fuerza a SQL Server a recompilar el plan de ejecucion en CADA llamada. Esto es util para queries con parametros altamente variables (parameter sniffing), pero tiene un costo de CPU por compilacion.

**Analisis:** En este caso puede estar justificado porque el query tiene muchos filtros opcionales (`@codigo IS NULL OR`, `@nombre IS NULL OR`, etc.) que generan planes de ejecucion muy diferentes. Sin embargo:

**Recomendacion:**
- Evaluar si la recompilacion es necesaria con un test de performance
- Alternativa: usar queries dinamicos con solo los filtros activos (evita el problema del "catch-all query")
- Si se mantiene RECOMPILE, documentar el motivo

---

## 5. `getNextArticuloCodigo` - Loop de queries N+1

**Severidad: MEDIA**
**Archivo:** articulosModel.js:1267-1285

```javascript
while (!codigoDisponible && intentos < 1000) {
    const checkResult = await pool.request()
        .input('codigo', sql.VarChar(50), codigoFinal)
        .query(checkQuery);
    // ...
    codigoFinal = (parseInt(codigoFinal) + 1).toString();
    intentos++;
}
```

En el peor caso hace **1000 queries** a la BD para encontrar un codigo disponible.

**Recomendacion:** Resolverlo en un solo query:

```sql
-- Encontrar el siguiente codigo disponible en un solo query
SELECT TOP 1 CAST(t.n AS VARCHAR(30)) AS next_code
FROM (
    SELECT TOP 1000 ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) + @base_code - 1 AS n
    FROM sys.objects a CROSS JOIN sys.objects b
) t
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.articulos WHERE art_cod = CAST(t.n AS VARCHAR(30))
)
ORDER BY t.n
```

O mas simple:
```sql
SELECT TOP 1 CAST(CAST(art_cod AS INT) + 1 AS VARCHAR(30)) AS next_code
FROM dbo.articulos
WHERE LEN(art_cod) = 4
  AND art_cod NOT LIKE '%[^0-9]%'
  AND NOT EXISTS (
    SELECT 1 FROM dbo.articulos a2
    WHERE a2.art_cod = CAST(CAST(art_cod AS INT) + 1 AS VARCHAR(30))
  )
ORDER BY CAST(art_cod AS INT) DESC
```

---

## 6. Query duplicado entre `getArticulos` y `getArticulo`

**Severidad: MEDIA**
**Archivo:** articulosModel.js:342-505 vs 852-1029

Ambas funciones contienen queries SQL casi identicos (~160 lineas cada uno) con:
- Mismos JOINs a `articulosdetalle`, `inventario_subgrupo`, `inventario_grupo`
- Mismo LEFT JOIN a `bundle_costo`
- Mismo LEFT JOIN a `oferta_prioritaria`
- Mismos calculos de rentabilidad/margen/clasificacion

La unica diferencia: `getArticulos` tiene filtros WHERE y paginacion, `getArticulo` filtra por `art_sec`.

**Impacto:** Mantenimiento duplicado - cualquier cambio en la logica de precios/ofertas debe hacerse en 2 lugares.

**Recomendacion:** Extraer el query base a una funcion o vista SQL compartida.

---

## 7. `getArticulo` devuelve `costo_promedio` con 5 alias diferentes

**Severidad: BAJA**
**Archivo:** articulosModel.js:869-893

```sql
CASE WHEN ... END AS costo_promedio,
CASE WHEN ... END AS costo_promedio_ponderado,   -- MISMO CALCULO
CASE WHEN ... END AS costo_promedio_actual,       -- MISMO CALCULO
CASE WHEN ... END AS kar_cos_pro,                 -- MISMO CALCULO
CASE WHEN ... END AS art_bod_cos_cat,             -- MISMO CALCULO
```

La misma expresion CASE se calcula 5 veces y se devuelve con 5 nombres diferentes.

**Impacto:** Overhead en calculo y transferencia de datos, confusion en la API response.

**Recomendacion:** Calcular una sola vez y usar CROSS APPLY o devolver un solo campo. Si el frontend necesita multiples nombres, hacerlo en el controller:
```javascript
const articulo = result.recordset[0];
articulo.costo_promedio_ponderado = articulo.costo_promedio;
articulo.costo_promedio_actual = articulo.costo_promedio;
// etc.
```

---

## 8. `updateWooCommerceProduct` hace query adicional para obtener `art_sec`

**Severidad: BAJA**
**Archivo:** articulosModel.js:115-126

```javascript
// Recibe art_cod como parametro pero necesita art_sec para contenido IA
const artSecResult = await pool.request()
    .input('art_cod', sql.VarChar(50), art_cod)
    .query('SELECT art_sec FROM dbo.articulos WHERE art_cod = @art_cod');
```

En `updateArticulo`, ya se tiene el `id_articulo` (que es `art_sec`), pero se llama a `updateWooCommerceProduct` sin pasarlo, forzando un query extra.

**Recomendacion:** Agregar `art_sec` como parametro de `updateWooCommerceProduct`.

---

## Indices recomendados

Basado en las queries analizadas:

```sql
-- Para el filtro de getArticulos por codigo
CREATE INDEX IX_articulos_art_cod ON dbo.articulos (art_cod);

-- Para el filtro de getArticulos por nombre (si no existe)
-- NOTA: LIKE '%nombre%' no puede usar indice B-tree. Considerar Full-Text Index.

-- Para el JOIN de bundle_costo
CREATE INDEX IX_articulosArmado_art_sec ON dbo.articulosArmado (art_sec) INCLUDE (ComArtSec, ConKarUni);

-- Para las promociones activas (filtro frecuente)
CREATE INDEX IX_promociones_activas ON dbo.promociones (pro_activa, pro_fecha_inicio, pro_fecha_fin) INCLUDE (pro_sec, pro_codigo, pro_descripcion);

-- Para el ORDER BY numerico de art_sec
-- (Solo si se mantiene CAST(art_sec AS INT))
CREATE INDEX IX_articulos_art_sec_computed ON dbo.articulos (art_sec);
```
