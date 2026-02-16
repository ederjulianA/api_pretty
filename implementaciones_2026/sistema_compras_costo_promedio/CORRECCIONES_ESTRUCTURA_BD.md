# Correcciones de Estructura de Base de Datos

**Fecha:** 2026-02-16
**Versión:** 1.1 (Corrección)

---

## 🐛 Problemas Detectados

### Error 1: Columna inexistente

Al ejecutar el endpoint `/api/compras/reportes/por-proveedor` se generó el siguiente error:

```json
{
  "success": false,
  "message": "Error generando reporte por proveedor",
  "error": "Invalid column name 'fac_tot'."
}
```

### Error 2: Campo mal usado

El campo `fac_total_woo` es **específico para pedidos de WooCommerce**, NO debe usarse para compras. El total de una compra se obtiene sumando `kar_total` de la tabla `facturakardes`.

### Error 3: Campos de historial_costos incorrectos

La tabla `historial_costos` tiene una estructura completamente diferente:

**Campos incorrectos usados:**
- ❌ `hc_tipo_operacion` → ✅ `hc_tipo_mov`
- ❌ `hc_costo_anterior` → ✅ `hc_costo_antes`
- ❌ `hc_costo_nuevo` → ✅ `hc_costo_despues`
- ❌ `hc_documento_referencia` → ✅ `hc_fac_sec` (FK numérica)
- ❌ `hc_cantidad` → ✅ `hc_cantidad_mov`, `hc_cantidad_antes`, `hc_cantidad_despues`

**Causa raíz:** La implementación inicial usó nombres de columnas **incorrectos** basándose en una estructura supuesta de la tabla `factura`, pero la estructura **real** de la base de datos es diferente.

---

## 📊 Estructura Real de las Tablas

### Tabla `factura`

**Campos reales:**
```sql
CREATE TABLE [dbo].[factura] (
  [fac_sec] [decimal](12, 0) NOT NULL PRIMARY KEY,  -- PK numérica, NO fac_nro
  [fac_fec] [datetime] NOT NULL,
  [fac_tip_cod] [varchar](5) NOT NULL,
  [nit_sec] [varchar](16) NULL,                     -- Usa nit_sec, NO nit_cod
  [fac_nro] [varchar](15) NULL,                     -- Es texto, NO PK
  [fac_est_fac] [char](1) NULL,
  [fac_obs] [varchar](1024) NULL,
  [fac_total_woo] [decimal](17, 2) NULL,            -- Usa fac_total_woo, NO fac_tot/fac_sub
  [fac_usu_cod_cre] [varchar](100) NULL,            -- Usuario creación
  [fac_fch_cre] [datetime] NULL,
  [f_tip_cod] [varchar](5) NULL,
  -- otros campos...
)
```

**Campos que NO existen:**
- ❌ `fac_tot` (total)
- ❌ `fac_sub` (subtotal)
- ❌ `nit_cod` (usa `nit_sec`)
- ❌ `usu_cod` (usa `fac_usu_cod_cre`)

**Campo con uso específico:**
- ⚠️ `fac_total_woo` - Solo para pedidos WooCommerce, NO para compras
- ✅ Para compras: calcular total sumando `kar_total` de `facturakardes`

### Tabla `facturakardes`

**Campos reales:**
```sql
CREATE TABLE [dbo].[facturakardes] (
  [fac_sec] [decimal](12, 0) NOT NULL,              -- FK a factura.fac_sec
  [kar_sec] [int] NOT NULL,
  [art_sec] [varchar](30) NOT NULL,
  [kar_bod_sec] [varchar](16) NOT NULL,             -- Usa kar_bod_sec, NO bod_sec
  [kar_uni] [decimal](17, 2) NULL,                  -- Usa kar_uni, NO kar_can
  [kar_nat] [char](1) NULL,
  [kar_pre] [decimal](17, 2) NULL,                  -- Precio (costo)
  [kar_pre_pub] [decimal](17, 2) NULL,
  [kar_total] [decimal](17, 2) NULL,
  -- otros campos...
  PRIMARY KEY (fac_sec, kar_sec)
)
```

**Campos que NO existen:**
- ❌ `kar_can` (cantidad - usa `kar_uni`)
- ❌ `kar_cos` (costo - usa `kar_pre`)
- ❌ `kar_val` (valor - usa `kar_total`)
- ❌ `bod_sec` (usa `kar_bod_sec`)
- ❌ `fac_nro` (usa `fac_sec`)

### Tabla `nit`

**Campo PK real:**
```sql
CREATE TABLE [dbo].[nit] (
  [nit_sec] [varchar](16) NOT NULL PRIMARY KEY,     -- PK es nit_sec, NO nit_cod
  [nit_nom] [varchar](100) NULL,
  -- otros campos...
)
```

### Tabla `historial_costos`

**Campos reales:**
```sql
CREATE TABLE [dbo].[historial_costos] (
  [hc_id] INT IDENTITY(1,1) NOT NULL,
  [hc_art_sec] VARCHAR(30) NOT NULL,
  [hc_fac_sec] DECIMAL(12,0) NULL,                 -- FK a factura.fac_sec
  [hc_fecha] DATETIME NOT NULL,
  [hc_tipo_mov] VARCHAR(20) NOT NULL,              -- CARGA_INICIAL, COMPRA, AJUSTE_MANUAL
  -- Estado anterior
  [hc_cantidad_antes] DECIMAL(17,2) NOT NULL,
  [hc_costo_antes] DECIMAL(17,2) NOT NULL,
  [hc_valor_antes] DECIMAL(17,2) NOT NULL,
  -- Movimiento
  [hc_cantidad_mov] DECIMAL(17,2) NOT NULL,
  [hc_costo_mov] DECIMAL(17,2) NOT NULL,
  [hc_valor_mov] DECIMAL(17,2) NOT NULL,
  -- Estado después
  [hc_cantidad_despues] DECIMAL(17,2) NOT NULL,
  [hc_costo_despues] DECIMAL(17,2) NOT NULL,
  [hc_valor_despues] DECIMAL(17,2) NOT NULL,
  -- Auditoría
  [hc_usu_cod] VARCHAR(100) NULL,
  [hc_observaciones] VARCHAR(500) NULL,
  PRIMARY KEY (hc_id)
)
```

**Campos que NO existen:**
- ❌ `hc_tipo_operacion` (usa `hc_tipo_mov`)
- ❌ `hc_costo_anterior` (usa `hc_costo_antes`)
- ❌ `hc_costo_nuevo` (usa `hc_costo_despues`)
- ❌ `hc_documento_referencia` (usa `hc_fac_sec`)
- ❌ `hc_cantidad` (usa `hc_cantidad_mov`, `hc_cantidad_antes`, `hc_cantidad_despues`)

---

## ✅ Correcciones Realizadas

### 1. Archivo: `models/compraModel.js`

#### Cambios en `registrarCompra()`:

**ANTES (incorrecto):**
```javascript
await transaction.request()
  .input('fac_nro', sql.VarChar(15), fac_nro)
  .input('fac_tip_cod', sql.VarChar(3), 'COM')
  .input('nit_cod', sql.VarChar(15), datosCompra.nit_cod)  // ❌ nit_cod
  .input('fac_sub', sql.Decimal(17, 2), total_valor)       // ❌ fac_sub
  .input('fac_tot', sql.Decimal(17, 2), total_valor)       // ❌ fac_tot
  .query(`
    INSERT INTO dbo.factura (
      fac_nro, fac_tip_cod, nit_cod, fac_fec, fac_sub, fac_tot, ...
    ) VALUES (...)
  `);
```

**DESPUÉS (correcto):**
```javascript
// 1. Generar fac_sec primero
const fac_sec = await generarFacSec(transaction);
const fac_nro = await generarNumeroCompra(transaction);

// 2. Insertar encabezado SIN fac_total_woo (es solo para WooCommerce)
// El total se calcula sumando kar_total de facturakardes
await transaction.request()
  .input('fac_sec', sql.Decimal(12, 0), fac_sec)           // ✅ PK numérica
  .input('fac_nro', sql.VarChar(15), fac_nro)              // ✅ Texto
  .input('fac_tip_cod', sql.VarChar(5), 'COM')             // ✅ 5 chars
  .input('f_tip_cod', sql.VarChar(5), 'COM')               // ✅ Requerido
  .input('nit_sec', sql.VarChar(16), datosCompra.nit_sec)  // ✅ nit_sec
  .input('fac_usu_cod_cre', sql.VarChar(100), datosCompra.usu_cod)  // ✅ Campo correcto
  .query(`
    INSERT INTO dbo.factura (
      fac_sec, fac_fec, fac_tip_cod, f_tip_cod, nit_sec, fac_nro,
      fac_est_fac, fac_obs, fac_fch_cre, fac_usu_cod_cre
    ) VALUES (
      @fac_sec, @fac_fec, @fac_tip_cod, @f_tip_cod, @nit_sec, @fac_nro,
      @fac_est_fac, @fac_obs, GETDATE(), @fac_usu_cod_cre
    )
  `);
```

#### Cambios en INSERT de `facturakardes`:

**ANTES (incorrecto):**
```javascript
INSERT INTO dbo.facturakardes (
  fac_nro,      // ❌ No existe
  kar_sec,
  art_sec,
  kar_can,      // ❌ No existe (usar kar_uni)
  kar_cos,      // ❌ No existe (usar kar_pre)
  kar_val,      // ❌ No existe (usar kar_total)
  kar_nat,
  fac_tip_cod,  // ❌ No pertenece a esta tabla
  bod_sec       // ❌ No existe (usar kar_bod_sec)
) VALUES (...)
```

**DESPUÉS (correcto):**
```javascript
INSERT INTO dbo.facturakardes (
  fac_sec,      // ✅ FK a factura
  kar_sec,
  art_sec,
  kar_uni,      // ✅ Cantidad
  kar_pre,      // ✅ Precio/costo
  kar_pre_pub,  // ✅ Precio público
  kar_total,    // ✅ Total
  kar_nat,
  kar_bod_sec   // ✅ Bodega
) VALUES (
  @fac_sec,
  @kar_sec,
  @art_sec,
  @kar_uni,
  @kar_pre,
  @kar_pre_pub,
  @kar_total,
  @kar_nat,
  @kar_bod_sec
)
```

#### Nueva función: `generarFacSec()`

```javascript
/**
 * Genera el siguiente fac_sec (secuencial único)
 */
const generarFacSec = async (transaction) => {
  const result = await transaction.request()
    .query(`
      SELECT ISNULL(MAX(fac_sec), 0) + 1 AS nuevo_fac_sec
      FROM dbo.factura WITH (UPDLOCK, HOLDLOCK)
    `);

  return result.recordset[0].nuevo_fac_sec;
};
```

#### Cambios en `obtenerHistorialCompras()`:

**ANTES (incorrecto):**
```javascript
SELECT
  f.nit_cod,              // ❌
  n.nit_nom AS proveedor,
  f.fac_tot AS total,     // ❌
  f.usu_cod               // ❌
FROM dbo.factura f
LEFT JOIN dbo.nit n ON n.nit_cod = f.nit_cod  // ❌
```

**DESPUÉS (correcto):**
```javascript
SELECT
  f.nit_sec,                                    // ✅
  n.nit_nom AS proveedor,
  ISNULL(SUM(fk.kar_total), 0) AS total,       // ✅ Calcular desde kárdex
  f.fac_usu_cod_cre AS usu_cod                  // ✅
FROM dbo.factura f
LEFT JOIN dbo.nit n ON n.nit_sec = f.nit_sec   // ✅
LEFT JOIN dbo.facturakardes fk ON fk.fac_sec = f.fac_sec  // ✅ JOIN kárdex
GROUP BY f.fac_nro, f.fac_fec, f.nit_sec, n.nit_nom, f.fac_obs, f.fac_usu_cod_cre
```

---

### 2. Archivo: `controllers/compraController.js`

#### Cambios en `crearCompra()`:

**ANTES (incorrecto):**
```javascript
const { nit_cod, fac_fec, detalles } = req.body;

if (!nit_cod) {
  return res.status(400).json({
    message: 'El código del proveedor (nit_cod) es requerido'
  });
}

const resultado = await registrarCompra({
  nit_cod,
  fac_fec,
  detalles
});
```

**DESPUÉS (correcto):**
```javascript
const { nit_sec, fac_fec, detalles } = req.body;

if (!nit_sec) {
  return res.status(400).json({
    message: 'El código del proveedor (nit_sec) es requerido'
  });
}

const resultado = await registrarCompra({
  nit_sec,
  fac_fec,
  detalles
});

res.status(201).json({
  success: true,
  data: {
    fac_sec: resultado.fac_sec,  // ✅ Agregar PK
    fac_nro: resultado.fac_nro,
    ...
  }
});
```

#### Cambios en `listarCompras()`:

**ANTES (incorrecto):**
```javascript
const filtros = {
  nit_cod: req.query.nit_cod,  // ❌
  ...
};
```

**DESPUÉS (correcto):**
```javascript
const filtros = {
  nit_sec: req.query.nit_sec,  // ✅
  ...
};
```

#### Cambios en `reporteComprasPorProveedor()`:

**ANTES (incorrecto):**
```javascript
SELECT
  f.nit_cod,                        // ❌
  COUNT(DISTINCT f.fac_nro) AS total_compras,
  SUM(f.fac_tot) AS valor_total,   // ❌
  AVG(f.fac_tot) AS valor_promedio // ❌
FROM dbo.factura f
LEFT JOIN dbo.nit n ON n.nit_cod = f.nit_cod  // ❌
GROUP BY f.nit_cod, n.nit_nom     // ❌
```

**DESPUÉS (correcto):**
```javascript
SELECT
  f.nit_sec,                                        // ✅
  COUNT(DISTINCT f.fac_nro) AS total_compras,
  ISNULL(SUM(fk.kar_total), 0) AS valor_total,     // ✅ Calcular desde kárdex
  ISNULL(AVG(fk.kar_total), 0) AS valor_promedio   // ✅ Calcular desde kárdex
FROM dbo.factura f
LEFT JOIN dbo.nit n ON n.nit_sec = f.nit_sec       // ✅
LEFT JOIN dbo.facturakardes fk ON fk.fac_sec = f.fac_sec  // ✅ JOIN kárdex
GROUP BY f.nit_sec, n.nit_nom                      // ✅
```

---

## 💡 Concepto Importante: Cálculo de Totales

### ¿Por qué NO usar `fac_total_woo` para compras?

**Contexto del sistema:**
- La tabla `factura` se usa para **múltiples tipos de documentos**: pedidos WooCommerce (FAC), compras (COM), ajustes (AJT), etc.
- El campo `fac_total_woo` es **específico para pedidos de WooCommerce** (tipo FAC)
- Para otros tipos de documentos (como COM), el total se calcula dinámicamente

**Razones técnicas:**
1. **Normalización:** El total ya está almacenado en `facturakardes.kar_total` por cada línea
2. **Consistencia:** Evita duplicación de datos y posibles inconsistencias
3. **Flexibilidad:** Permite recalcular totales si hay cambios en el detalle

**Cómo obtener el total de una compra:**

```sql
-- Opción 1: Subconsulta (para un registro)
SELECT
  f.fac_nro,
  (SELECT SUM(kar_total)
   FROM facturakardes
   WHERE fac_sec = f.fac_sec) AS total
FROM factura f
WHERE f.fac_nro = 'COM000001'

-- Opción 2: JOIN + GROUP BY (para múltiples registros)
SELECT
  f.fac_nro,
  ISNULL(SUM(fk.kar_total), 0) AS total
FROM factura f
LEFT JOIN facturakardes fk ON fk.fac_sec = f.fac_sec
WHERE f.fac_tip_cod = 'COM'
GROUP BY f.fac_nro
```

---

## 📝 Resumen de Campos Corregidos

| Tabla | Campo INCORRECTO | Campo CORRECTO | Tipo | Notas |
|-------|------------------|----------------|------|-------|
| factura | `fac_tot` | N/A | - | ⚠️ Calcular sumando `kar_total` |
| factura | `fac_sub` | N/A | - | No existe |
| factura | `fac_total_woo` | N/A | DECIMAL(17,2) | ⚠️ Solo para pedidos WooCommerce, NO usar en compras |
| factura | `nit_cod` | `nit_sec` | VARCHAR(16) | |
| factura | `usu_cod` | `fac_usu_cod_cre` | VARCHAR(100) | |
| factura | (PK) `fac_nro` | (PK) `fac_sec` | DECIMAL(12,0) | |
| facturakardes | `kar_can` | `kar_uni` | DECIMAL(17,2) |
| facturakardes | `kar_cos` | `kar_pre` | DECIMAL(17,2) |
| facturakardes | `kar_val` | `kar_total` | DECIMAL(17,2) |
| facturakardes | `bod_sec` | `kar_bod_sec` | VARCHAR(16) |
| facturakardes | `fac_nro` | `fac_sec` | DECIMAL(12,0) | |
| nit | `nit_cod` | `nit_sec` | VARCHAR(16) | |
| historial_costos | `hc_tipo_operacion` | `hc_tipo_mov` | VARCHAR(20) | |
| historial_costos | `hc_costo_anterior` | `hc_costo_antes` | DECIMAL(17,2) | |
| historial_costos | `hc_costo_nuevo` | `hc_costo_despues` | DECIMAL(17,2) | |
| historial_costos | `hc_documento_referencia` | `hc_fac_sec` | DECIMAL(12,0) | FK numérica |
| historial_costos | `hc_cantidad` | `hc_cantidad_mov` | DECIMAL(17,2) | + antes/despues |

---

## 🎯 Cambios en API

### Request Body (cambio de parámetro)

**ANTES:**
```json
{
  "nit_cod": "900123456",
  "fac_fec": "2026-02-15",
  "detalles": [...]
}
```

**DESPUÉS:**
```json
{
  "nit_sec": "900123456",
  "fac_fec": "2026-02-15",
  "detalles": [...]
}
```

### Response (agregar fac_sec)

**ANTES:**
```json
{
  "success": true,
  "data": {
    "fac_nro": "COM000001",
    "total_items": 1,
    ...
  }
}
```

**DESPUÉS:**
```json
{
  "success": true,
  "data": {
    "fac_sec": 12345,
    "fac_nro": "COM000001",
    "total_items": 1,
    ...
  }
}
```

### Query Params (cambio de filtro)

**ANTES:**
```
GET /api/compras?nit_cod=900123456
```

**DESPUÉS:**
```
GET /api/compras?nit_sec=900123456
```

---

## ✅ Archivos Corregidos

1. ✅ `/models/compraModel.js`
   - Función `generarFacSec()` (nueva)
   - Función `registrarCompra()` (corregida)
   - Función `obtenerHistorialCompras()` (corregida)
   - Función `obtenerDetalleCompra()` (corregida)

2. ✅ `/controllers/compraController.js`
   - Función `crearCompra()` (corregida)
   - Función `listarCompras()` (corregida)
   - Función `reporteComprasPorProveedor()` (corregida)

3. 📋 Pendiente: Actualizar documentación
   - `docs/API_ENDPOINTS_COMPRAS.md`
   - `postman/Postman_Compras_Collection.json`
   - `docs/IMPLEMENTACION_FASE1_SISTEMA_COMPRAS.md`

---

## 🧪 Testing Recomendado

### 1. Probar registro de compra
```bash
POST /api/compras
{
  "nit_sec": "900123456",  # CAMBIO: usar nit_sec
  "fac_fec": "2026-02-16",
  "fac_obs": "Prueba con campos corregidos",
  "detalles": [
    {
      "art_sec": "ART001",
      "cantidad": 10,
      "costo_unitario": 25000
    }
  ]
}
```

**Verificar respuesta incluye `fac_sec`:**
```json
{
  "success": true,
  "data": {
    "fac_sec": 12345,       // ✅ Nuevo campo
    "fac_nro": "COM000001",
    ...
  }
}
```

### 2. Verificar en base de datos
```sql
-- Ver compra registrada
SELECT * FROM factura WHERE fac_nro = 'COM000001';
-- Verificar fac_sec, nit_sec, fac_total_woo

-- Ver kárdex
SELECT * FROM facturakardes WHERE fac_sec = 12345;
-- Verificar kar_uni, kar_pre, kar_total, kar_bod_sec
```

### 3. Probar reporte de proveedores
```bash
GET /api/compras/reportes/por-proveedor
```

**Debe funcionar sin error de columna inválida.**

---

## 📚 Lecciones Aprendidas

1. **Siempre verificar estructura real:** No asumir nombres de columnas sin consultar `INFORMATION_SCHEMA.COLUMNS` o scripts de creación.

2. **Revisar código existente:** Los archivos `orderModel.js`, `inventoryModel.js` y `syncWooOrdersController.js` ya usaban correctamente `fac_sec`, `nit_sec`, etc.

3. **Database-agnostic no significa ignorar esquema:** Aunque la lógica esté en JavaScript, los nombres de columnas deben ser exactos.

4. **Testing temprano:** Ejecutar queries de prueba antes de implementar toda la lógica.

---

**Documento creado por:** Claude Code
**Fecha:** 2026-02-16
**Versión:** 1.1 (Corrección de estructura)
**Estado:** ✅ Corregido y documentado
