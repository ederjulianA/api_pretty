# Implementación Fase 1: Sistema de Compras con Costo Promedio

**Fecha:** 2026-02-15
**Tipo:** Feature - Sistema Completo de Compras
**Relacionado:** ANALISIS_SISTEMA_COMPRAS_COSTO_PROMEDIO.md, FASE_0_CARGA_INICIAL_COSTOS.md

---

## 📋 Resumen Ejecutivo

Se implementó el **Sistema Completo de Compras con Cálculo Automático de Costo Promedio Ponderado** según NIC 2 Colombia.

**Decisión arquitectónica crítica:**
- ✅ **Lógica 100% en JavaScript** (NO stored procedures)
- ✅ **Database-agnostic** (preparado para migración a PostgreSQL)
- ✅ **Transacciones manejadas en Node.js**
- ✅ **SQL estándar únicamente**

**Fórmula implementada:**
```
Nuevo Costo Promedio = (Valor Actual + Valor Compra) / (Cantidad Actual + Cantidad Compra)

Donde:
- Valor Actual = Costo Actual × Existencia Actual
- Valor Compra = Costo Unitario Compra × Cantidad Compra
```

---

## 🎯 Componentes Implementados

### 1. Scripts SQL (Database Setup)

**Archivo:** `EstructuraDatos/Fase1_SistemaCompras_15022026.sql`

**Componentes creados:**
- ✅ Tipo de comprobante `COM` (Compra de Mercancía)
- ✅ Vista `vwCostoPromedioArticulos` (consultas optimizadas)
- ✅ Índices de optimización:
  - `IX_facturakardes_art_nat` (para consultas de kárdex)
  - `IX_factura_tip_fecha` (para filtros de compras)
  - `IX_historial_costos_art_fecha` (para reportes)

**IMPORTANTE:** Sin stored procedures (lógica en JavaScript)

**Ejecutar:**
```sql
-- En SQL Server Management Studio o Azure Data Studio
-- Conectar a la base de datos
USE tu_base_datos;
GO

-- Ejecutar el script completo
-- Ver: EstructuraDatos/Fase1_SistemaCompras_15022026.sql
```

**Validación:**
```sql
-- Verificar tipo de comprobante
SELECT * FROM dbo.tipo_comprobantes WHERE tip_cod = 'COM';

-- Verificar vista
SELECT TOP 10 * FROM dbo.vwCostoPromedioArticulos;

-- Verificar índices
EXEC sp_helpindex 'dbo.facturakardes';
EXEC sp_helpindex 'dbo.factura';
EXEC sp_helpindex 'dbo.historial_costos';
```

---

### 2. Modelo de Datos (Business Logic)

**Archivo:** `models/compraModel.js`

**Funciones implementadas:**

#### `calcularCostoPromedio(art_sec, cantidad_compra, costo_unitario_compra, transaction)`
- Calcula nuevo costo promedio ponderado
- Implementa fórmula NIC 2 Colombia en JavaScript
- Retorna: costo_anterior, costo_nuevo, diferencia, existencias

#### `generarNumeroCompra(transaction)`
- Genera consecutivo seguro (UPDLOCK, HOLDLOCK)
- Formato: COM000001, COM000002, etc.
- Actualiza `tipo_comprobantes.tip_con_sec`

#### `registrarCompra(datosCompra)`
- Función principal para registrar compras
- Maneja transacción completa:
  1. Genera número de compra
  2. Inserta encabezado (`factura`)
  3. Por cada detalle:
     - Calcula costo promedio
     - Inserta kárdex (`facturakardes`)
     - Actualiza costo (`articulosdetalle`)
     - Registra historial (`historial_costos`)
  4. Commit o rollback

#### `obtenerHistorialCompras(filtros)`
- Lista compras con filtros opcionales
- Soporta: fecha_desde, fecha_hasta, nit_cod, limit

#### `obtenerDetalleCompra(fac_nro)`
- Obtiene encabezado + detalles de una compra
- Incluye información del proveedor y artículos

**Características:**
- ✅ CommonJS (require/module.exports)
- ✅ Manejo de transacciones SQL con `mssql` driver
- ✅ Validaciones en código
- ✅ Sin dependencia de stored procedures

---

### 3. Controlador (API Handlers)

**Archivo:** `controllers/compraController.js`

**Endpoints implementados:**

#### `crearCompra(req, res)` - POST /api/compras
- Valida datos de entrada
- Llama a `registrarCompra()` del modelo
- Retorna detalles de actualización de costos

#### `listarCompras(req, res)` - GET /api/compras
- Lista compras con filtros opcionales
- Query params: fecha_desde, fecha_hasta, nit_cod, limit

#### `obtenerCompra(req, res)` - GET /api/compras/:fac_nro
- Obtiene detalle completo de una compra
- Error 404 si no existe

#### `reporteVariacionCostos(req, res)` - GET /api/compras/reportes/variacion-costos
- Reporte de artículos con mayor variación de costos
- Calcula: costo min/max, promedio, variación absoluta/porcentual
- Ordenado por variación descendente

#### `reporteComprasPorProveedor(req, res)` - GET /api/compras/reportes/por-proveedor
- Reporte agrupado por proveedor
- Totales, promedios, primera y última compra

**Validaciones:**
- Campos requeridos: nit_cod, fac_fec, detalles
- Detalles con art_sec, cantidad > 0, costo_unitario > 0
- Retorna errores 400 si validación falla

---

### 4. Rutas (Routing)

**Archivo:** `routes/compraRoutes.js`

**Rutas registradas:**
```javascript
POST   /api/compras                              // Registrar compra
GET    /api/compras                              // Listar compras
GET    /api/compras/:fac_nro                     // Detalle de compra
GET    /api/compras/reportes/variacion-costos   // Reporte variación
GET    /api/compras/reportes/por-proveedor      // Reporte proveedores
```

**Autenticación:**
- Todas las rutas requieren middleware `auth` (JWT)

**Registro en index.js:**
```javascript
const compraRoutes = require('./routes/compraRoutes.js');
app.use("/api/compras", compraRoutes);
```

---

### 5. Documentación

**Archivo:** `analisis_2026/API_ENDPOINTS_COMPRAS.md`

**Contenido:**
- ✅ Descripción de cada endpoint
- ✅ Parámetros y respuestas detalladas
- ✅ Ejemplos con cURL
- ✅ Escenarios de uso (primera compra, compra múltiple, etc.)
- ✅ Validaciones y reglas de negocio
- ✅ Códigos de error
- ✅ Notas técnicas (database-agnostic, performance, migración)

**Secciones destacadas:**
- Fórmula de costo promedio explicada
- Proceso interno paso a paso
- Ejemplos de cálculos reales
- Consideraciones para PostgreSQL

---

### 6. Colección Postman

**Archivo:** `analisis_2026/Postman_Compras_Collection.json`

**Estructura:**
1. **Autenticación** - Login (guarda token automáticamente)
2. **Registrar Compra**
   - Compra simple (1 artículo)
   - Compra múltiple (3 artículos)
3. **Listar Compras**
   - Todas las compras
   - Filtrar por fecha
   - Filtrar por proveedor
   - Limitar resultados
4. **Detalle de Compra**
   - Obtener por número
5. **Reportes**
   - Variación de costos
   - Variación por período
   - Por proveedor
   - Proveedores por período

**Características:**
- ✅ Variables de entorno (base_url, token)
- ✅ Scripts automáticos para guardar token
- ✅ Tests globales (status code, JSON, campo success)
- ✅ Ejemplos de respuestas
- ✅ Descripciones detalladas

**Importar en Postman:**
1. Abrir Postman
2. Import → Upload Files
3. Seleccionar `Postman_Compras_Collection.json`
4. Crear environment con `base_url: http://localhost:3000`
5. Ejecutar Login para obtener token

---

## 🔍 Flujo Completo de Uso

### Paso 1: Configurar Base de Datos

```bash
# 1. Ejecutar script SQL
# Ver: EstructuraDatos/Fase1_SistemaCompras_15022026.sql

# 2. Verificar creación
SELECT * FROM tipo_comprobantes WHERE tip_cod = 'COM';
SELECT TOP 5 * FROM vwCostoPromedioArticulos;
```

---

### Paso 2: Iniciar Backend

```bash
# Desarrollo
npm run dev

# Producción
npm start
# o con PM2
pm2 start index.js --name api_pretty
pm2 logs api_pretty
```

**Verificar:**
```bash
# Logs deben mostrar:
# ✅ Servidor escuchando en 0.0.0.0:3000
# ✅ Sin errores de importación de módulos
```

---

### Paso 3: Autenticación

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "usu_cod": "admin",
    "usu_pass": "tu_password"
  }'

# Respuesta: { "success": true, "token": "eyJhbGc..." }
# Guardar token para siguientes requests
```

---

### Paso 4: Registrar Primera Compra

```bash
curl -X POST http://localhost:3000/api/compras \
  -H "x-access-token: eyJhbGc..." \
  -H "Content-Type: application/json" \
  -d '{
    "nit_cod": "900123456",
    "fac_fec": "2026-02-15",
    "fac_obs": "Primera compra - prueba sistema",
    "detalles": [
      {
        "art_sec": "ART001",
        "cantidad": 100,
        "costo_unitario": 25000
      }
    ]
  }'
```

**Respuesta esperada:**
```json
{
  "success": true,
  "message": "Compra registrada exitosamente",
  "data": {
    "fac_nro": "COM000001",
    "total_items": 1,
    "total_valor": 2500000,
    "detalles_actualizacion": [
      {
        "art_sec": "ART001",
        "cantidad": 100,
        "costo_unitario": 25000,
        "costo_anterior": 24000,
        "costo_nuevo": 24333.33,
        "diferencia": 333.33,
        "existencia_anterior": 200,
        "existencia_nueva": 300
      }
    ]
  }
}
```

---

### Paso 5: Verificar en Base de Datos

```sql
-- Ver compra registrada
SELECT * FROM factura WHERE fac_nro = 'COM000001';

-- Ver detalle en kárdex
SELECT * FROM facturakardes WHERE fac_nro = 'COM000001';

-- Ver actualización de costo
SELECT art_sec, art_bod_cos_cat
FROM articulosdetalle
WHERE art_sec = 'ART001' AND bod_sec = '1' AND lis_pre_cod = 1;

-- Ver historial
SELECT TOP 5 *
FROM historial_costos
WHERE hc_art_sec = 'ART001'
ORDER BY hc_fecha DESC;
```

---

### Paso 6: Consultar Historial

```bash
# Listar todas las compras
curl -X GET http://localhost:3000/api/compras \
  -H "x-access-token: eyJhbGc..."

# Filtrar por fecha
curl -X GET "http://localhost:3000/api/compras?fecha_desde=2026-02-01&fecha_hasta=2026-02-28" \
  -H "x-access-token: eyJhbGc..."

# Ver detalle de compra
curl -X GET http://localhost:3000/api/compras/COM000001 \
  -H "x-access-token: eyJhbGc..."
```

---

### Paso 7: Generar Reportes

```bash
# Reporte de variación de costos
curl -X GET "http://localhost:3000/api/compras/reportes/variacion-costos?limit=10" \
  -H "x-access-token: eyJhbGc..."

# Reporte por proveedor
curl -X GET http://localhost:3000/api/compras/reportes/por-proveedor \
  -H "x-access-token: eyJhbGc..."
```

---

## ⚙️ Arquitectura Database-Agnostic

### Principios Aplicados

**1. Lógica en JavaScript, NO en SQL**
```javascript
// ✅ CORRECTO - compraModel.js
const calcularCostoPromedio = (costo_actual, existencia_actual, costo_compra, cantidad_compra) => {
  const valor_actual = costo_actual * existencia_actual;
  const valor_compra = costo_compra * cantidad_compra;
  const cantidad_total = existencia_actual + cantidad_compra;
  return (valor_actual + valor_compra) / cantidad_total;
};

// ❌ EVITADO - Stored Procedure
CREATE PROCEDURE sp_CalcularCostoPromedio ...
```

**2. Transacciones en Node.js**
```javascript
// ✅ CORRECTO - Manejo con mssql driver
const transaction = new sql.Transaction(pool);
await transaction.begin();
try {
  // ... operaciones ...
  await transaction.commit();
} catch (error) {
  await transaction.rollback();
}

// ❌ EVITADO - Transacciones en SP
BEGIN TRANSACTION
  -- operaciones
COMMIT TRANSACTION
```

**3. SQL Estándar Únicamente**
```javascript
// ✅ CORRECTO - Compatible con PostgreSQL
query = `
  SELECT a.art_sec, a.art_cod
  FROM articulos a
  WHERE a.art_sec = @art_sec
`;

// ❌ EVITADO - Sintaxis específica de SQL Server
EXEC sp_helpindex 'articulos'
```

---

### Preparación para Migración a PostgreSQL

**Cambios necesarios (mínimos):**

1. **Driver de base de datos**
```javascript
// SQL Server (actual)
const { poolPromise, sql } = require('../db');

// PostgreSQL (futuro)
const { Pool } = require('pg');
const pool = new Pool({ ... });
```

2. **Sintaxis de parámetros**
```javascript
// SQL Server
.input('art_sec', sql.VarChar(30), art_sec)
.query('SELECT * FROM articulos WHERE art_sec = @art_sec')

// PostgreSQL
.query('SELECT * FROM articulos WHERE art_sec = $1', [art_sec])
```

3. **Funciones de fecha**
```javascript
// SQL Server
query = `SELECT GETDATE() AS fecha_actual`;

// PostgreSQL
query = `SELECT NOW() AS fecha_actual`;
```

4. **Tipos de datos**
```sql
-- SQL Server
DECIMAL(17, 2)

-- PostgreSQL
NUMERIC(17, 2)
```

**✅ NO hay que migrar:**
- Lógica de cálculo de costo promedio (está en JS)
- Validaciones (están en controladores)
- Generación de consecutivos (está en JS)
- Manejo de transacciones (se adapta cambiando driver)

---

## 📊 Casos de Uso Reales

### Caso 1: Primera Compra de un Producto Nuevo

**Escenario:** Producto sin costo previo ni inventario

**Datos iniciales:**
- Costo actual: $0
- Existencia: 0 unidades

**Compra:**
- Cantidad: 50 unidades
- Costo unitario: $30,000

**Cálculo:**
```
Valor Actual = 0 × 0 = 0
Valor Compra = 30,000 × 50 = 1,500,000
Cantidad Total = 0 + 50 = 50

Nuevo Costo Promedio = (0 + 1,500,000) / 50 = $30,000
```

**Actualización:**
```sql
UPDATE articulosdetalle
SET art_bod_cos_cat = 30000
WHERE art_sec = 'NUEVO001' AND bod_sec = '1' AND lis_pre_cod = 1;
```

---

### Caso 2: Compra con Inventario Existente

**Escenario:** Producto con inventario y costo previo

**Datos iniciales:**
- Costo actual: $24,000
- Existencia: 200 unidades

**Compra:**
- Cantidad: 100 unidades
- Costo unitario: $25,000

**Cálculo:**
```
Valor Actual = 24,000 × 200 = 4,800,000
Valor Compra = 25,000 × 100 = 2,500,000
Cantidad Total = 200 + 100 = 300

Nuevo Costo Promedio = (4,800,000 + 2,500,000) / 300 = $24,333.33
```

**Actualización:**
```sql
UPDATE articulosdetalle
SET art_bod_cos_cat = 24333.33
WHERE art_sec = 'ART001' AND bod_sec = '1' AND lis_pre_cod = 1;
```

**Historial:**
```sql
INSERT INTO historial_costos (
  hc_art_sec, hc_costo_anterior, hc_costo_nuevo,
  hc_fecha, hc_tipo_operacion, hc_documento_referencia,
  hc_cantidad, hc_usu_cod, hc_observaciones
) VALUES (
  'ART001', 24000, 24333.33,
  GETDATE(), 'COMPRA', 'COM000001',
  100, 'admin',
  'Compra: 100 unidades a $25000. Existencia anterior: 200, Existencia nueva: 300'
);
```

---

### Caso 3: Compra Múltiple (varios productos)

**Compra:**
```json
{
  "nit_cod": "900123456",
  "fac_fec": "2026-02-15",
  "detalles": [
    { "art_sec": "ART001", "cantidad": 100, "costo_unitario": 25000 },
    { "art_sec": "ART002", "cantidad": 50, "costo_unitario": 45000 },
    { "art_sec": "ART003", "cantidad": 200, "costo_unitario": 15000 }
  ]
}
```

**Proceso:**
1. Genera fac_nro = "COM000001"
2. Calcula costo promedio para ART001 → 24,333.33
3. Calcula costo promedio para ART002 → 43,000.00
4. Calcula costo promedio para ART003 → 14,666.67
5. Inserta 3 líneas en facturakardes
6. Actualiza 3 registros en articulosdetalle
7. Crea 3 entradas en historial_costos
8. Total compra: $7,750,000

---

## 🎯 Ventajas de la Implementación

### ✅ Portabilidad

**Migración a PostgreSQL:**
- Solo cambiar driver de BD
- Ajustar sintaxis de queries (mínimo)
- NO hay lógica que reescribir
- Tiempo estimado: 1-2 días

### ✅ Mantenibilidad

**Desarrollo:**
- Lógica en JavaScript (lenguaje familiar)
- Debugging con console.log/breakpoints
- No requiere conocimiento profundo de SQL Server

**Testing:**
- Unit tests para funciones de cálculo
- Integration tests para controladores
- No depende de stored procedures en BD

### ✅ Escalabilidad

**Arquitectura:**
- Separación clara: modelo, controlador, rutas
- Fácil agregar nuevos endpoints
- Reutilización de funciones de cálculo

**Performance:**
- Índices optimizados para queries frecuentes
- Transacciones eficientes
- Vista pre-calculada para consultas

### ✅ Trazabilidad

**Auditoría:**
- Historial completo en `historial_costos`
- Registra: usuario, fecha, operación, documento
- Observaciones detalladas de cada cambio

**Debugging:**
- Logs de errores con stack trace
- Retorna detalles de actualización en respuesta
- Fácil verificar cálculos en BD

---

## 🔧 Troubleshooting

### Error: "Tipo de comprobante COM no existe"

**Causa:** No se ejecutó el script SQL de Fase 1

**Solución:**
```sql
-- Ejecutar EstructuraDatos/Fase1_SistemaCompras_15022026.sql
```

---

### Error: "Artículo ART001 no encontrado"

**Causa:** art_sec no existe en tabla `articulos`

**Solución:**
```sql
-- Verificar artículo
SELECT * FROM articulos WHERE art_sec = 'ART001';

-- Usar art_sec válido en request
```

---

### Error: "Transaction failed"

**Causa:** Error en algún paso de la transacción

**Solución:**
1. Ver logs del servidor (console.error)
2. Verificar estructura de datos enviados
3. Validar que proveedor (nit_cod) exista
4. Validar que artículos existan

---

### Costos no se actualizan

**Causa:** Posible filtro incorrecto en UPDATE

**Verificar:**
```sql
-- Ver estructura de articulosdetalle
SELECT *
FROM articulosdetalle
WHERE art_sec = 'ART001';

-- Debe tener registro con:
-- bod_sec = '1'
-- lis_pre_cod = 1
```

**Solución:**
- Asegurar que exista registro en articulosdetalle
- Si no existe, crear manualmente:
```sql
INSERT INTO articulosdetalle (art_sec, bod_sec, lis_pre_cod, art_bod_cos_cat)
VALUES ('ART001', '1', 1, 0);
```

---

## 📚 Archivos Creados/Modificados

### Nuevos Archivos

1. ✅ `EstructuraDatos/Fase1_SistemaCompras_15022026.sql`
2. ✅ `models/compraModel.js`
3. ✅ `controllers/compraController.js`
4. ✅ `routes/compraRoutes.js`
5. ✅ `analisis_2026/API_ENDPOINTS_COMPRAS.md`
6. ✅ `analisis_2026/Postman_Compras_Collection.json`
7. ✅ `analisis_2026/IMPLEMENTACION_FASE1_SISTEMA_COMPRAS.md` (este archivo)

### Archivos Modificados

1. ✅ `index.js` - Registro de rutas de compras

---

## 🚀 Próximos Pasos

### ✅ Completado - Fase 1

- [x] Scripts SQL (tipo comprobante, vista, índices)
- [x] Modelo con cálculo de costo promedio en JS
- [x] Controlador con endpoints CRUD y reportes
- [x] Rutas registradas y autenticadas
- [x] Documentación completa de API
- [x] Colección Postman con ejemplos

### 📍 Siguiente: Fase 2 - Módulo de Ventas

Ver: `ANALISIS_SISTEMA_COMPRAS_COSTO_PROMEDIO.md` → Fase 2

**Tareas Fase 2:**
1. Crear tipo de comprobante `VEN` (Venta)
2. Endpoints para registrar ventas
3. Descuento de inventario con kárdex (naturaleza `-`)
4. Cálculo automático de margen de utilidad
5. Reportes de rentabilidad por producto
6. Reportes de ventas por período

**Características:**
- Usar costo promedio actual al vender (no recalcular)
- Registrar costo en facturakardes para cálculo de utilidad
- Mantener arquitectura database-agnostic
- Continuar con lógica en JavaScript

---

## 📝 Notas Finales

### Decisiones Arquitectónicas

**¿Por qué JavaScript en lugar de Stored Procedures?**

1. **Portabilidad:** Migración a PostgreSQL más sencilla
2. **Mantenibilidad:** Código más legible y testeable
3. **Desarrollo:** No requiere privilegios de DB para desarrollo
4. **Versionamiento:** Todo el código en Git
5. **CI/CD:** Más fácil automatizar tests y despliegues

**¿Pérdida de performance?**

NO. Las queries ejecutadas son las mismas. La lógica de cálculo (división, multiplicación) es trivial y no impacta performance.

**¿Cuándo usar Stored Procedures?**

Solo para operaciones críticas que requieren:
- Procesamiento masivo de datos (millones de registros)
- Operaciones complejas que SQL hace mejor que JS
- Procesos batch nocturnos

Para este caso de uso (compras transaccionales), JavaScript es la opción correcta.

---

**Documento creado por:** Claude Code
**Fecha:** 2026-02-15
**Versión:** 1.0
**Estado:** ✅ Implementado, Documentado y Listo para Producción
