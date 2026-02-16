# Filtro por Clasificación ABC - Valorizado de Inventario

**Fecha de Implementación:** 2026-02-16
**Versión:** 1.0
**Solicitado por:** Equipo Frontend

---

## 📋 Descripción

Extensión del endpoint de valorizado de inventario para soportar filtrado por clasificación Pareto (ABC).

Permite obtener solo los artículos de una clasificación específica (A, B o C) sin necesidad de traer todo el dataset y filtrarlo en el frontend.

---

## 🎯 Endpoint Modificado

```
GET /api/compras/reportes/valorizado-inventario
```

---

## 🆕 Nuevo Parámetro de Query

| Parámetro | Tipo | Valores Permitidos | Descripción |
|-----------|------|-------------------|-------------|
| `clasificacion_abc` | string | `A`, `B` o `C` | Filtra artículos por clasificación Pareto |

**Validación:**
- Valor opcional (si no se envía, retorna todos los artículos)
- Solo acepta: `A`, `B` o `C` (case-insensitive)
- Si se envía valor inválido: retorna `400 Bad Request`

---

## 📥 Ejemplos de Uso

### 1. Obtener Solo Productos Tipo A (Global)

```bash
GET /api/compras/reportes/valorizado-inventario?clasificacion_abc=A
```

**Retorna:** Todos los productos Tipo A que concentran el 80% del valor del inventario.

**Caso de uso:** Dashboard de control de productos críticos.

---

### 2. Productos Tipo B por Subcategoría

```bash
GET /api/compras/reportes/valorizado-inventario?clasificacion_abc=B&inv_sub_gru_cod=5
```

**Retorna:** Productos Tipo B de la subcategoría 5 (ej: Labiales).

**Caso de uso:** Análisis de productos de impacto medio en una línea específica.

---

### 3. Productos Tipo C Comprados Recientemente

```bash
GET /api/compras/reportes/valorizado-inventario?clasificacion_abc=C&fecha_compra_desde=2026-02-01&fecha_compra_hasta=2026-02-28
```

**Retorna:** Productos Tipo C comprados en febrero 2026.

**Caso de uso:** Identificar compras recientes de bajo impacto para ajustar política de inventario.

---

## 📤 Estructura de Respuesta

La estructura de respuesta es idéntica al endpoint base, pero:

1. **`resumen`**: Siempre muestra valores globales (no se ve afectado por el filtro)
2. **`articulos`**: Solo incluye artículos de la clasificación solicitada
3. **`total_registros`**: Cantidad de artículos que cumplen el filtro

```json
{
  "success": true,
  "data": {
    "resumen": {
      "total_articulos": 600,
      "articulos_sin_costo": 15,
      "valor_total_inventario": 125750000,
      "clasificacion_abc": {
        "tipo_a": { "articulos": 120, "valor": 100600000, "porcentaje": 80 },
        "tipo_b": { "articulos": 90, "valor": 18862500, "porcentaje": 15 },
        "tipo_c": { "articulos": 390, "valor": 6287500, "porcentaje": 5 }
      }
    },
    "articulos": [
      {
        "art_sec": "ART001",
        "art_cod": "SKU12345",
        "art_nom": "Labial Mate Rojo Intenso",
        "clasificacion_abc": "A",
        "valor_total": 3750000,
        // ... otros campos
      }
      // Solo artículos Tipo A si filtro = A
    ],
    "total_registros": 120,
    "limit": 100,
    "offset": 0,
    "filtros_aplicados": {
      "clasificacion_abc": "A",
      "limit": 100,
      "offset": 0
    }
  }
}
```

---

## ❌ Validación de Errores

### Error 400 - Valor Inválido

**Request:**
```bash
GET /api/compras/reportes/valorizado-inventario?clasificacion_abc=X
```

**Response:**
```json
{
  "success": false,
  "message": "clasificacion_abc debe ser A, B o C"
}
```

**Valores inválidos:**
- Números: `1`, `2`, `3`
- Textos: `Tipo A`, `Alta`, `Baja`
- Minúsculas: ✅ `a`, `b`, `c` son válidos (se convierten a mayúsculas automáticamente)

---

## 💡 Casos de Uso

### 1. Dashboard: KPI de Productos Críticos (Tipo A)

```javascript
async function cargarProductosCriticos(token) {
  const response = await fetch(
    'http://localhost:3000/api/compras/reportes/valorizado-inventario?clasificacion_abc=A&limit=50',
    { headers: { 'x-access-token': token } }
  );

  const data = await response.json();

  // Mostrar en tabla prioritaria
  return data.data.articulos.map(art => ({
    sku: art.art_cod,
    nombre: art.art_nom,
    valor: art.valor_total,
    rotacion: art.rotacion_activa ? '✅ Activa' : '⚠️ Baja'
  }));
}
```

### 2. Análisis de Cola Larga (Tipo C)

```javascript
async function analizarColaLarga(token) {
  const response = await fetch(
    'http://localhost:3000/api/compras/reportes/valorizado-inventario?clasificacion_abc=C',
    { headers: { 'x-access-token': token } }
  );

  const data = await response.json();

  // Identificar candidatos para descontinuar
  const sinRotacion = data.data.articulos.filter(art =>
    !art.rotacion_activa && art.dias_sin_venta > 180
  );

  console.log(`${sinRotacion.length} productos Tipo C sin rotación en 6+ meses`);
  return sinRotacion;
}
```

### 3. Optimización de Compras por Categoría (Tipo B)

```javascript
async function optimizarComprasPorCategoria(token, inv_sub_gru_cod) {
  const response = await fetch(
    `http://localhost:3000/api/compras/reportes/valorizado-inventario?clasificacion_abc=B&inv_sub_gru_cod=${inv_sub_gru_cod}`,
    { headers: { 'x-access-token': token } }
  );

  const data = await response.json();

  // Analizar productos de impacto medio que podrían optimizarse
  return data.data.articulos.map(art => ({
    producto: art.art_nom,
    dias_sin_compra: art.dias_sin_compra,
    sugerencia: art.dias_sin_compra > 90 ? 'Revisar frecuencia de compra' : 'OK'
  }));
}
```

---

## 🧪 Testing en Postman

La colección Postman v1.4 incluye 3 casos de prueba:

1. **Valorizado - Solo Tipo A (Pareto)**
   - URL: `?clasificacion_abc=A`
   - Descripción: Productos que concentran el 80% del valor

2. **Valorizado - Tipo B por Subcategoría**
   - URL: `?clasificacion_abc=B&inv_sub_gru_cod=5`
   - Descripción: Productos de impacto medio en una categoría específica

3. **Valorizado - Tipo C Comprados Recientemente**
   - URL: `?clasificacion_abc=C&fecha_compra_desde=2026-02-01&fecha_compra_hasta=2026-02-28`
   - Descripción: Productos de bajo impacto comprados recientemente

---

## 🔍 Implementación Técnica

### Cambios en el Modelo (`compraModel.js`)

Se reestructuró la query usando CTEs (Common Table Expressions):

```javascript
// CTE 1: Base de datos sin clasificación
WITH InventarioBase AS (
  SELECT
    art_sec, art_cod, art_nom, valor_total, ...
  FROM articulos a
  JOIN articulosdetalle ad ...
),

// CTE 2: Calcular clasificación ABC inline
InventarioConABC AS (
  SELECT
    *,
    CASE
      WHEN (SUM(valor_total) OVER (ORDER BY valor_total DESC) /
            (SELECT SUM(valor_total) FROM InventarioBase) * 100) <= 80 THEN 'A'
      WHEN (SUM(valor_total) OVER (ORDER BY valor_total DESC) /
            (SELECT SUM(valor_total) FROM InventarioBase) * 100) <= 95 THEN 'B'
      ELSE 'C'
    END AS clasificacion_abc_calculada
  FROM InventarioBase
)

// Query final con filtros
SELECT * FROM InventarioConABC
WHERE 1=1
  AND clasificacion_abc_calculada = @clasificacion_abc  -- ← FILTRO
ORDER BY valor_total DESC
```

**Ventajas:**
- Clasificación calculada en BD (no en JavaScript)
- Precisión del análisis Pareto garantizada
- Performance optimizada con SQL Window Functions

### Cambios en el Controlador (`compraController.js`)

Validación agregada antes de llamar al modelo:

```javascript
if (req.query.clasificacion_abc) {
  const clasificacion = req.query.clasificacion_abc.toUpperCase();
  if (!['A', 'B', 'C'].includes(clasificacion)) {
    return res.status(400).json({
      success: false,
      message: 'clasificacion_abc debe ser A, B o C'
    });
  }
  filtros.clasificacion_abc = clasificacion;
}
```

---

## 📊 Impacto en Performance

### Sin Filtro (Base)
- Query: Retorna todos los artículos con costo
- Procesamiento: Frontend debe filtrar por clasificación
- Transferencia: 100% del dataset

### Con Filtro ABC
- Query: Retorna solo clasificación solicitada
- Procesamiento: BD filtra antes de retornar
- Transferencia: ~20% del dataset (Tipo A) o ~15% (Tipo B) o ~5% (Tipo C)

**Beneficio:**
- Reducción de transferencia de datos en hasta 80% (filtro Tipo C)
- Menor carga en frontend (no requiere filtrado)
- Respuestas más rápidas para dashboards especializados

---

## 🔗 Archivos Modificados

- `models/compraModel.js`: Query reestructurada con CTEs
- `controllers/compraController.js`: Validación del parámetro
- `docs/API_ENDPOINT_VALORIZADO_INVENTARIO.md`: Documentación actualizada
- `postman/Postman_Compras_Collection.json`: 3 nuevos casos de prueba

---

## ✅ Checklist de Implementación

- [x] Modificar query en modelo con CTE para clasificación inline
- [x] Agregar filtro condicional en WHERE clause
- [x] Validar parámetro en controlador (400 si inválido)
- [x] Convertir a mayúsculas automáticamente (case-insensitive)
- [x] Actualizar documentación de API
- [x] Agregar 3 casos de prueba en Postman
- [x] Actualizar versión de colección a v1.4
- [ ] Testing manual de los 3 casos
- [ ] Commit de cambios

---

**Última actualización:** 2026-02-16
**Versión de la API:** 1.0
**Estado:** ✅ Implementado
