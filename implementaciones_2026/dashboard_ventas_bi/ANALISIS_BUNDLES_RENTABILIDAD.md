# Análisis: Problema de Rentabilidad en Bundles

**Fecha:** 2026-02-17
**Autor:** Claude Code
**Versión:** 1.0

---

## 🔴 PROBLEMA IDENTIFICADO

La vista `vw_ventas_dashboard` y los queries de rentabilidad **NO están considerando la estructura especial de bundles**, lo que genera cálculos INCORRECTOS de rentabilidad.

---

## 📊 Estructura Actual de Bundles

### Ejemplo: "Combo Amor y Amistad" ($50,000)

Cuando se vende 1 bundle, se crean **4 líneas** en `facturakardes`:

| kar_sec | art_sec | art_cod | kar_uni | kar_pre_pub | kar_total | kar_cos | kar_bundle_padre |
|---------|---------|---------|---------|-------------|-----------|---------|------------------|
| 1 | 5001 | COMBO-AMOR | 1 | 50000 | 50000 | 25000 | NULL |
| 2 | 2001 | LABIAL-ROJO | 1 | 0 | 0 | 8000 | 5001 |
| 3 | 3002 | MASCARA-NEGRA | 1 | 0 | 0 | 12000 | 5001 |
| 4 | 4003 | RUBOR-ROSA | 1 | 0 | 0 | 5000 | 5001 |

**Totales:**
- **Ingresos:** $50,000 (solo línea del bundle)
- **Costo real:** $8,000 + $12,000 + $5,000 = **$25,000** (suma de componentes)
- **Rentabilidad real:** (50,000 - 25,000) / 50,000 = **50%** ✅

---

## ❌ PROBLEMA 1: Vista Cuenta Líneas de Componentes

### Query Actual en `vw_ventas_dashboard`:

```sql
SELECT
    fk.kar_total AS total_linea,
    fk.kar_cos AS costo_historico_unitario,
    (fk.kar_uni * ISNULL(fk.kar_cos, 0)) AS costo_total_linea,
    (fk.kar_total - (fk.kar_uni * ISNULL(fk.kar_cos, 0))) AS utilidad_linea,
    CASE
        WHEN fk.kar_total > 0
        THEN ((fk.kar_total - (fk.kar_uni * ISNULL(fk.kar_cos, 0))) / fk.kar_total * 100)
        ELSE 0
    END AS rentabilidad_real
FROM dbo.facturakardes fk
WHERE fk.kar_nat = '-'
```

### Resultado INCORRECTO para el bundle:

| Línea | total_linea | costo_total_linea | utilidad_linea | rentabilidad_real |
|-------|-------------|-------------------|----------------|-------------------|
| Bundle | 50,000 | 25,000 | 25,000 | 50% |
| Componente 1 | 0 | 8,000 | -8,000 | **❌ ERROR: División por 0** |
| Componente 2 | 0 | 12,000 | -12,000 | **❌ ERROR: División por 0** |
| Componente 3 | 0 | 5,000 | -5,000 | **❌ ERROR: División por 0** |

### Problemas:
1. **Se cuentan 4 líneas de venta** en lugar de 1
2. **Componentes tienen rentabilidad = 0 o infinito negativo**
3. **Utilidad de componentes es negativa** (-8,000, -12,000, -5,000)
4. **Al sumar utilidad_linea:** 25,000 - 8,000 - 12,000 - 5,000 = **0** ❌

---

## ❌ PROBLEMA 2: KPIs Incorrectos

### En `obtenerKPIsPrincipales()`:

```javascript
SELECT
    COUNT(DISTINCT fac_nro) AS numero_ordenes,  // ✅ Correcto
    SUM(total_linea) AS ventas_totales,         // ✅ Correcto (50,000)
    SUM(utilidad_linea) AS utilidad_bruta_total, // ❌ INCORRECTO (0 en lugar de 25,000)
    AVG(rentabilidad_real) AS rentabilidad_promedio // ❌ INCORRECTO (promedia líneas con rentabilidad 0/-∞)
FROM dbo.vw_ventas_dashboard
```

### Resultado:
- **ventas_totales:** $50,000 ✅
- **utilidad_bruta_total:** $0 ❌ (debería ser $25,000)
- **rentabilidad_promedio:** ~12.5% ❌ (debería ser 50%)

---

## ❌ PROBLEMA 3: Top Productos

### En `obtenerTopProductos()`:

```javascript
SELECT
    art_cod,
    art_nom,
    SUM(cantidad_vendida) AS unidades_vendidas,
    SUM(total_linea) AS ingresos_totales,
    AVG(rentabilidad_real) AS rentabilidad_promedio
FROM dbo.vw_ventas_dashboard
GROUP BY art_cod, art_nom
```

### Resultado INCORRECTO:

| art_cod | art_nom | unidades_vendidas | ingresos_totales | rentabilidad_promedio |
|---------|---------|-------------------|------------------|-----------------------|
| COMBO-AMOR | Combo Amor y Amistad | 1 | 50,000 | 50% ✅ |
| LABIAL-ROJO | Labial Rojo Pasión | 1 | 0 | **0% ❌** |
| MASCARA-NEGRA | Máscara de Pestañas | 1 | 0 | **0% ❌** |
| RUBOR-ROSA | Rubor Rosa Suave | 1 | 0 | **0% ❌** |

**Problema:** Los componentes aparecen como productos vendidos con $0 de ingresos y 0% rentabilidad.

---

## ✅ SOLUCIÓN PROPUESTA

### Opción 1: Filtrar Componentes en la Vista (RECOMENDADO)

Modificar `vw_ventas_dashboard` para **EXCLUIR componentes de bundles**:

```sql
CREATE VIEW dbo.vw_ventas_dashboard AS
SELECT
    -- ... todos los campos existentes ...
FROM dbo.factura f
    LEFT JOIN dbo.facturakardes fk ON f.fac_sec = fk.fac_sec
    -- ... otros JOINs ...
WHERE
    f.fac_est_fac = 'A'
    AND fk.kar_nat = '-'
    AND f.fac_tip_cod = 'VTA'
    -- ✅ NUEVO: Excluir componentes de bundles
    AND fk.kar_bundle_padre IS NULL
```

**Ventajas:**
- ✅ Cálculos automáticamente correctos en todos los queries
- ✅ No duplica productos en reportes
- ✅ Rentabilidad de bundle ya incluye costos de componentes (capturados en kar_cos del bundle)

**Desventaja:**
- ❌ NO muestra detalle de qué componentes se vendieron

---

### Opción 2: Agregar Campo Calculado (ALTERNATIVA)

Agregar un campo que identifique el tipo de línea:

```sql
CREATE VIEW dbo.vw_ventas_dashboard AS
SELECT
    -- ... campos existentes ...

    -- Nuevo campo para identificar tipo de línea
    CASE
        WHEN fk.kar_bundle_padre IS NULL AND a.art_bundle = 'S' THEN 'BUNDLE'
        WHEN fk.kar_bundle_padre IS NOT NULL THEN 'COMPONENTE_BUNDLE'
        ELSE 'SIMPLE'
    END AS tipo_linea_venta,

    -- Rentabilidad ajustada (0 para componentes)
    CASE
        WHEN fk.kar_bundle_padre IS NOT NULL THEN 0  -- Componente: rentabilidad 0
        WHEN fk.kar_total > 0
        THEN ((fk.kar_total - (fk.kar_uni * ISNULL(fk.kar_cos, 0))) / fk.kar_total * 100)
        ELSE 0
    END AS rentabilidad_real,

    -- Utilidad ajustada (0 para componentes)
    CASE
        WHEN fk.kar_bundle_padre IS NOT NULL THEN 0
        ELSE (fk.kar_total - (fk.kar_uni * ISNULL(fk.kar_cos, 0)))
    END AS utilidad_linea

FROM dbo.factura f
    -- ... JOINs existentes ...
WHERE
    f.fac_est_fac = 'A'
    AND fk.kar_nat = '-'
    AND f.fac_tip_cod = 'VTA'
```

**Uso en queries:**

```javascript
// Para KPIs principales (solo bundles y simples)
SELECT ...
FROM vw_ventas_dashboard
WHERE tipo_linea_venta != 'COMPONENTE_BUNDLE'

// Para detalle de bundle (con componentes)
SELECT ...
FROM vw_ventas_dashboard
WHERE fac_nro = 'VTA1234'
ORDER BY
    CASE WHEN tipo_linea_venta = 'BUNDLE' THEN 0 ELSE 1 END,
    kar_sec
```

**Ventajas:**
- ✅ Permite ver detalle de componentes cuando se necesita
- ✅ Rentabilidad se calcula correctamente filtrando componentes
- ✅ Más flexible para análisis

**Desventaja:**
- ⚠️ Requiere filtrar `tipo_linea_venta` en TODOS los queries

---

## 🎯 IMPACTO EN PRODUCTOS VARIABLES

### Productos Variables (Variaciones) NO tienen este problema:

**Cuando se vende una variación:**
- Se crea **1 línea** en `facturakardes` con el `art_sec` de la variación
- Precio: precio de la variación ✅
- Costo: `kar_cos` de la variación ✅
- **NO se expande en componentes**

**Ejemplo:**
```
fac_sec  kar_sec  art_sec  art_cod         kar_uni  kar_pre_pub  kar_total  kar_cos  kar_bundle_padre
1001     1        50002    LAB001-ROJO     1        48000        48000      8000     NULL
```

**Rentabilidad:** (48,000 - 8,000) / 48,000 = 83.33% ✅ CORRECTO

---

## 📝 RECOMENDACIÓN FINAL

### Implementar **Opción 1** (Filtrar en vista):

**Razones:**
1. **Simplicidad:** Un solo cambio en la vista soluciona todo
2. **Consistencia:** Todos los queries automáticamente correctos
3. **Performance:** No requiere filtros adicionales en cada query
4. **Semántica:** Una venta de bundle = 1 línea de venta, no 4

### Si necesitas detalle de componentes:

Crear **segunda vista** específica para análisis de bundles:

```sql
CREATE VIEW dbo.vw_bundles_detalle AS
SELECT
    f.fac_nro,
    padre.art_cod AS bundle_codigo,
    padre.art_nom AS bundle_nombre,
    padre.kar_total AS bundle_precio,
    padre.kar_cos AS bundle_costo_registrado,
    componente.art_cod AS componente_codigo,
    componente.art_nom AS componente_nombre,
    fk_comp.kar_uni AS componente_cantidad,
    fk_comp.kar_cos AS componente_costo_unitario,
    (fk_comp.kar_uni * fk_comp.kar_cos) AS componente_costo_total
FROM dbo.facturakardes fk_padre
    INNER JOIN dbo.articulos padre ON fk_padre.art_sec = padre.art_sec
    INNER JOIN dbo.factura f ON fk_padre.fac_sec = f.fac_sec
    LEFT JOIN dbo.facturakardes fk_comp ON fk_comp.kar_bundle_padre = fk_padre.art_sec
        AND fk_comp.fac_sec = fk_padre.fac_sec
    LEFT JOIN dbo.articulos componente ON fk_comp.art_sec = componente.art_sec
WHERE
    padre.art_bundle = 'S'
    AND fk_padre.kar_nat = '-'
    AND f.fac_tip_cod = 'VTA'
    AND f.fac_est_fac = 'A'
```

---

## 📊 PRÓXIMOS PASOS

1. **Revisar scripts SQL:**
   - Modificar `08_modificar_vista_usar_kar_cos.sql`
   - Agregar filtro `kar_bundle_padre IS NULL`

2. **Validar backend:**
   - Verificar que `kar_cos` del bundle incluye suma de costos de componentes
   - O ajustar `obtenerCostosPromedioMultiples()` para bundles

3. **Testing:**
   - Crear bundle de prueba
   - Vender bundle
   - Verificar dashboard muestra rentabilidad correcta

4. **Documentar:**
   - Actualizar `COSTOS_HISTORICOS.md` con consideraciones de bundles
   - Agregar ejemplos de queries para bundles

---

**FIN DEL ANÁLISIS**
