# Endpoint Kardex: Información de Rentabilidad

**Fecha:** 2026-02-17
**Endpoint:** `GET /api/kardex/:art_cod`
**Versión:** 2.0

---

## 🎯 CAMBIOS IMPLEMENTADOS

Se agregó información de **costo y rentabilidad** en el endpoint de movimientos de artículos (kardex).

### ✅ Campos Nuevos (solo para ventas):

Para registros con `tipo_documento = 'VTA'`:
- `precio_unitario_venta`: Precio unitario de venta (kar_pre_pub)
- `total_venta`: Total de la línea de venta (kar_total)
- `costo_unitario`: Costo histórico unitario (kar_cos)
- `costo_total`: Costo total de la línea (kar_uni × kar_cos)
- `utilidad`: Utilidad de la línea (total_venta - costo_total)
- `rentabilidad_real`: % de rentabilidad real ((utilidad / total_venta) × 100)

Para otros tipos de documento (ajustes, compras, devoluciones):
- Todos los campos de costo/rentabilidad son `null`

---

## 📊 EJEMPLO DE RESPUESTA

### Request:
```http
GET /api/kardex/1892
```

### Response:
```json
{
  "success": true,
  "article": {
    "art_cod": "1892",
    "art_nom": "Bronceador Líquido D'Luchi",
    "stock_actual": 25
  },
  "movements": [
    {
      "documento": "COM001",
      "fecha": "2026-01-15T00:00:00.000Z",
      "tipo_documento": "COM",
      "naturaleza": "+",
      "cantidad": 50,
      "precio_unitario_venta": null,
      "total_venta": null,
      "costo_unitario": null,
      "costo_total": null,
      "utilidad": null,
      "rentabilidad_real": null,
      "saldo": 50
    },
    {
      "documento": "VTA1234",
      "fecha": "2026-01-20T10:30:00.000Z",
      "tipo_documento": "VTA",
      "naturaleza": "-",
      "cantidad": 5,
      "precio_unitario_venta": 45000.00,
      "total_venta": 225000.00,
      "costo_unitario": 25000.00,
      "costo_total": 125000.00,
      "utilidad": 100000.00,
      "rentabilidad_real": 44.44,
      "saldo": 45
    },
    {
      "documento": "AJT002",
      "fecha": "2026-01-25T14:00:00.000Z",
      "tipo_documento": "AJT",
      "naturaleza": "-",
      "cantidad": 10,
      "precio_unitario_venta": null,
      "total_venta": null,
      "costo_unitario": null,
      "costo_total": null,
      "utilidad": null,
      "rentabilidad_real": null,
      "saldo": 35
    },
    {
      "documento": "VTA1911",
      "fecha": "2026-02-10T16:45:00.000Z",
      "tipo_documento": "VTA",
      "naturaleza": "-",
      "cantidad": 3,
      "precio_unitario_venta": 42000.00,
      "total_venta": 126000.00,
      "costo_unitario": 26000.00,
      "costo_total": 78000.00,
      "utilidad": 48000.00,
      "rentabilidad_real": 38.10,
      "saldo": 32
    },
    {
      "documento": "DEV003",
      "fecha": "2026-02-12T09:00:00.000Z",
      "tipo_documento": "DEV",
      "naturaleza": "+",
      "cantidad": 2,
      "precio_unitario_venta": null,
      "total_venta": null,
      "costo_unitario": null,
      "costo_total": null,
      "utilidad": null,
      "rentabilidad_real": null,
      "saldo": 34
    }
  ],
  "summary": {
    "totalEntries": 5,
    "finalBalance": 34
  }
}
```

---

## 🔍 INTERPRETACIÓN DE LOS DATOS

### Movimiento 1: COMPRA (COM001)
```json
{
  "tipo_documento": "COM",
  "cantidad": 50,
  "costo_unitario": null,  // ← NULL porque no es venta
  "rentabilidad_real": null
}
```
**Interpretación:** Entrada de inventario, no tiene información de rentabilidad.

### Movimiento 2: VENTA (VTA1234)
```json
{
  "tipo_documento": "VTA",
  "cantidad": 5,
  "precio_unitario_venta": 45000.00,  // Precio por unidad
  "total_venta": 225000.00,            // 5 × 45,000
  "costo_unitario": 25000.00,          // Costo histórico
  "costo_total": 125000.00,            // 5 × 25,000
  "utilidad": 100000.00,               // 225,000 - 125,000
  "rentabilidad_real": 44.44           // (100,000 / 225,000) × 100
}
```
**Interpretación:**
- Se vendieron 5 unidades a $45,000 cada una
- Costo total: $125,000
- Ganancia: $100,000
- Rentabilidad: 44.44%

### Movimiento 3: AJUSTE (AJT002)
```json
{
  "tipo_documento": "AJT",
  "cantidad": 10,
  "costo_unitario": null,  // ← NULL porque es ajuste de inventario
  "rentabilidad_real": null
}
```
**Interpretación:** Ajuste de inventario (salida), no tiene información de rentabilidad.

---

## 📋 FILTRADO POR FECHAS

### Request con filtros:
```http
GET /api/kardex/1892?startDate=2026-01-01&endDate=2026-01-31
```

Solo mostrará movimientos del mes de enero 2026.

---

## 💡 CASOS DE USO

### 1. Análisis de Rentabilidad por Venta
```javascript
// Frontend puede filtrar solo ventas y calcular rentabilidad promedio
const ventas = movements.filter(m => m.tipo_documento === 'VTA');
const rentabilidadPromedio = ventas.reduce((sum, v) => sum + v.rentabilidad_real, 0) / ventas.length;
```

### 2. Total Vendido vs Total Utilidad
```javascript
const ventas = movements.filter(m => m.tipo_documento === 'VTA');
const totalVendido = ventas.reduce((sum, v) => sum + v.total_venta, 0);
const utilidadTotal = ventas.reduce((sum, v) => sum + v.utilidad, 0);
const rentabilidadGlobal = (utilidadTotal / totalVendido) * 100;
```

### 3. Identificar Ventas con Baja Rentabilidad
```javascript
const ventasBajaRentabilidad = movements.filter(m =>
  m.tipo_documento === 'VTA' && m.rentabilidad_real < 20
);
```

---

## ⚙️ QUERY SQL IMPLEMENTADO

```sql
SELECT
  f.fac_nro as documento,
  f.fac_fec as fecha,
  f.fac_tip_cod as tipo_documento,
  fk.kar_nat as naturaleza,
  fk.kar_uni as cantidad,

  -- Solo para ventas (VTA)
  CASE
    WHEN f.fac_tip_cod = 'VTA' THEN fk.kar_pre_pub
    ELSE NULL
  END as precio_unitario_venta,

  CASE
    WHEN f.fac_tip_cod = 'VTA' THEN fk.kar_total
    ELSE NULL
  END as total_venta,

  CASE
    WHEN f.fac_tip_cod = 'VTA' THEN fk.kar_cos
    ELSE NULL
  END as costo_unitario,

  CASE
    WHEN f.fac_tip_cod = 'VTA' THEN (fk.kar_uni * ISNULL(fk.kar_cos, 0))
    ELSE NULL
  END as costo_total,

  CASE
    WHEN f.fac_tip_cod = 'VTA' THEN (fk.kar_total - (fk.kar_uni * ISNULL(fk.kar_cos, 0)))
    ELSE NULL
  END as utilidad,

  CASE
    WHEN f.fac_tip_cod = 'VTA' AND fk.kar_total > 0
    THEN ((fk.kar_total - (fk.kar_uni * ISNULL(fk.kar_cos, 0))) / fk.kar_total * 100)
    ELSE NULL
  END as rentabilidad_real

FROM dbo.facturakardes fk
INNER JOIN dbo.factura f ON f.fac_sec = fk.fac_sec
WHERE fk.art_sec = @art_sec
  AND f.fac_est_fac = 'A'
  AND fk.kar_nat IN ('+', '-')
```

---

## ✅ COMPATIBILIDAD

### Backend:
- ✅ No rompe código existente
- ✅ Campos adicionales solo para ventas
- ✅ `null` para otros tipos de documento

### Frontend:
- ✅ Puede ignorar campos nuevos si no los necesita
- ✅ Puede filtrar `tipo_documento === 'VTA'` para análisis de rentabilidad
- ✅ Compatible con versiones anteriores

---

## 🧪 TESTING

### Test 1: Verificar que ventas tienen costo
```sql
SELECT
  fac_nro,
  tipo_documento,
  costo_unitario,
  rentabilidad_real
FROM (
  -- Query del endpoint
) AS kardex
WHERE tipo_documento = 'VTA'
  AND (costo_unitario IS NULL OR rentabilidad_real IS NULL);

-- Resultado esperado: 0 registros (todas las ventas deben tener costo)
```

### Test 2: Verificar que ajustes NO tienen costo
```sql
SELECT
  fac_nro,
  tipo_documento,
  costo_unitario,
  rentabilidad_real
FROM (
  -- Query del endpoint
) AS kardex
WHERE tipo_documento != 'VTA'
  AND (costo_unitario IS NOT NULL OR rentabilidad_real IS NOT NULL);

-- Resultado esperado: 0 registros (ajustes no deben tener costo)
```

---

## 📝 NOTAS IMPORTANTES

1. **Rentabilidad real:** Se calcula con `kar_cos` (costo histórico al momento de venta)
2. **Precio final:** Usa `kar_total` que incluye descuentos/promociones
3. **Ajustes/Compras:** No tienen información de rentabilidad (campos `null`)
4. **Bundles:** Si el artículo es componente de bundle, aparecerá con precio $0 pero con costo
5. **Formato de fechas:** ISO 8601 (YYYY-MM-DD para filtros)

---

**✅ Endpoint actualizado y listo para usar**

**Archivo modificado:** `models/kardexModel.js`
**Última actualización:** 2026-02-17
