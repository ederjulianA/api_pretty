# Sistema de Apartado de Inventario para Pedidos WooCommerce

## 📋 Índice
1. [Contexto y Problema](#contexto-y-problema)
2. [Análisis de la Situación Actual](#análisis-de-la-situación-actual)
3. [Solución Propuesta](#solución-propuesta)
4. [Mejoras Adicionales Recomendadas](#mejoras-adicionales-recomendadas)
5. [Plan de Implementación](#plan-de-implementación)
6. [Consideraciones Técnicas](#consideraciones-técnicas)
7. [Impacto en el Sistema](#impacto-en-el-sistema)
8. [Casos de Uso y Escenarios](#casos-de-uso-y-escenarios)
9. [Pruebas y Validación](#pruebas-y-validación)

---

## 🎯 Contexto y Problema

### Problema Identificado
Los pedidos que vienen de WooCommerce están causando descuadres de inventario debido a que:

1. **Pedidos no pagados**: Muchos pedidos se demoran más de 48 horas en pagar o nunca se pagan, pero el inventario no se está apartando desde el momento de la sincronización.

2. **Sobreventa**: Al no apartar el inventario inmediatamente, se pueden generar ventas de productos que ya están comprometidos en pedidos pendientes de pago.

3. **Descuadres**: La falta de control sobre el inventario comprometido genera inconsistencias entre el stock disponible y el stock real.

### Objetivo
Implementar un sistema de apartado de inventario que:
- Aparte automáticamente el inventario al sincronizar pedidos de WooCommerce
- Evite doble descuento al facturar un pedido que ya tiene apartado
- Permita liberar inventario de pedidos que no se pagan o se cancelan
- Mantenga el inventario lo más saneado posible

---

## 🔍 Análisis de la Situación Actual

### Flujo Actual de Sincronización

#### 1. Sincronización de Pedidos (`syncWooOrdersController.js`)

**Ubicación**: `controllers/syncWooOrdersController.js`

**Proceso actual**:
```javascript
// Línea 521 - createOrder
.input('kar_nat', sql.VarChar(1), 'C')  // ❌ No afecta inventario

// Línea 688 - updateOrder  
.input('kar_nat', sql.VarChar(1), 'C')  // ❌ No afecta inventario
```

**Problema**: Los registros en `facturakardes` se crean con `kar_nat = 'C'`, lo que significa que **NO afectan el inventario**.

#### 2. Facturación de Pedidos (`orderModel.js`)

**Ubicación**: `models/orderModel.js`

**Proceso actual**:
- Cuando se convierte una COT (cotización) a VTA (factura de venta):
  - Se crea una nueva factura tipo VTA
  - Se crean nuevos registros en `facturakardes` con `kar_nat = '-'` (afecta inventario)
  - Los registros originales de la COT permanecen con `kar_nat = 'C'`

**Problema**: Si en el futuro se cambia `kar_nat` a `'-'` en la sincronización, al facturar se generaría un **doble descuento** de inventario.

#### 3. Cálculo de Kardex (`kardexModel.js`)

**Ubicación**: `models/kardexModel.js`

**Lógica actual**:
```sql
WHERE fk.kar_nat IN ('+', '-')  -- Solo considera entradas y salidas
```

**Implicación**: Los registros con `kar_nat = 'C'` o `kar_nat = 'c'` **NO se consideran** en el cálculo del kardex, lo cual es correcto para nuestro propósito.

### Valores de `kar_nat` y su Significado

| Valor | Significado | Afecta Inventario | Uso Actual |
|-------|-------------|-------------------|------------|
| `'+'` | Entrada | ✅ Sí (aumenta) | Ajustes de inventario positivos |
| `'-'` | Salida | ✅ Sí (disminuye) | Facturas de venta |
| `'C'` | Cotización/Compensado | ❌ No | Pedidos sincronizados (actual) |
| `'c'` | Cancelado/Compensado | ❌ No | Propuesto para apartados cancelados |

---

## 💡 Solución Propuesta

### Enfoque Principal

1. **Al Sincronizar**: Crear registros con `kar_nat = '-'` para apartar el inventario inmediatamente
2. **Al Facturar**: Cambiar `kar_nat = 'c'` en los registros de la cotización original para evitar doble descuento
3. **Al Cancelar/Vencer**: Cambiar `kar_nat = 'c'` para liberar el inventario apartado

### Diagrama de Flujo

```
┌─────────────────────────────────────────────────────────────┐
│  PEDIDO WOOCOMMERCE SINCRONIZADO                            │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
         ┌───────────────────────┐
         │ Crear COT con         │
         │ kar_nat = '-'          │  ← APARTA INVENTARIO
         └───────────┬───────────┘
                     │
        ┌────────────┴────────────┐
        │                          │
        ▼                          ▼
┌───────────────┐         ┌──────────────────┐
│ PEDIDO PAGADO │         │ PEDIDO NO PAGADO │
│ (Facturado)   │         │ (Vencido/Cancel) │
└───────┬───────┘         └────────┬─────────┘
        │                           │
        ▼                           ▼
┌──────────────────┐      ┌──────────────────┐
│ Cambiar kar_nat  │      │ Cambiar kar_nat  │
│ = 'c' en COT     │      │ = 'c' en COT     │
│ Crear VTA con    │      │ (Libera invent.) │
│ kar_nat = '-'    │      └──────────────────┘
└──────────────────┘
```

### Cambios Específicos Requeridos

#### 1. Modificar Sincronización de Pedidos

**Archivo**: `controllers/syncWooOrdersController.js`

**Cambio en `createOrder` (línea ~521)**:
```javascript
// ANTES
.input('kar_nat', sql.VarChar(1), 'C')

// DESPUÉS
.input('kar_nat', sql.VarChar(1), '-')  // ✅ Aparta inventario
```

**Cambio en `updateOrder` (línea ~688)**:
```javascript
// ANTES
.input('kar_nat', sql.VarChar(1), 'C')

// DESPUÉS
.input('kar_nat', sql.VarChar(1), '-')  // ✅ Aparta inventario
```

**Consideraciones**:
- Validar inventario disponible antes de apartar
- Considerar el estado del pedido en WooCommerce
- Manejar casos donde no hay suficiente inventario

#### 2. Modificar Proceso de Facturación

**Archivo**: `models/orderModel.js`

**Cambio en `createCompleteOrder` (cuando `fac_tip_cod = 'VTA'` y existe `kar_fac_sec_ori`)**:

Agregar lógica para actualizar los registros de la cotización original:

```javascript
// Después de insertar los detalles de la factura VTA
// Si existe kar_fac_sec_ori, actualizar la cotización original
if (detalle.kar_fac_sec_ori && fac_tip_cod === 'VTA') {
  // Actualizar fac_nro_origen (ya existe)
  await updateOriginRequest
    .input('kar_fac_sec_ori', sql.Decimal(18, 0), detalle.kar_fac_sec_ori)
    .input('FinalFacNro', sql.VarChar(20), FinalFacNro)
    .query(updateOriginQuery);
  
  // NUEVO: Cambiar kar_nat = 'c' en los detalles de la cotización original
  const updateCotizacionRequest = new sql.Request(transaction);
  await updateCotizacionRequest
    .input('fac_sec_cotizacion', sql.Decimal(18, 0), detalle.kar_fac_sec_ori)
    .query(`
      UPDATE dbo.facturakardes
      SET kar_nat = 'c'
      WHERE fac_sec = @fac_sec_cotizacion
        AND kar_nat = '-'
    `);
}
```

**Cambio en `updateOrder` (cuando se actualiza a VTA)**:

Similar lógica cuando se actualiza un pedido y se cambia a factura.

---

## 🚀 Mejoras Adicionales Recomendadas

### 1. Sistema de Vencimiento Automático de Apartados

**Objetivo**: Liberar automáticamente el inventario de pedidos que no se pagan después de X días.

**Implementación**:
- Crear un job/proceso programado que se ejecute diariamente
- Identificar cotizaciones con `kar_nat = '-'` y más de X días sin facturar
- Cambiar `kar_nat = 'c'` para liberar el inventario
- Registrar la acción en un log

**Parámetros configurables**:
- Días de vencimiento (ej: 48 horas, 3 días, 7 días)
- Estados de WooCommerce a considerar
- Notificaciones antes de vencer

**Archivo sugerido**: `jobs/vencerApartados.js`

```javascript
const vencimientoApartados = async () => {
  const pool = await poolPromise;
  const diasVencimiento = 2; // 48 horas
  
  const query = `
    UPDATE fk
    SET fk.kar_nat = 'c'
    FROM dbo.facturakardes fk
    INNER JOIN dbo.factura f ON f.fac_sec = fk.fac_sec
    WHERE f.fac_tip_cod = 'COT'
      AND fk.kar_nat = '-'
      AND f.fac_est_fac = 'A'
      AND DATEDIFF(day, f.fac_fec, GETDATE()) > @diasVencimiento
      AND f.fac_nro_woo IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 
        FROM dbo.factura f_vta 
        WHERE f_vta.fac_nro_origen = f.fac_nro 
          AND f_vta.fac_tip_cod = 'VTA'
          AND f_vta.fac_est_fac = 'A'
      )
  `;
  
  // Ejecutar y registrar resultados
};
```

### 2. Validación de Inventario Disponible

**Objetivo**: Verificar que haya suficiente inventario antes de apartar.

**Implementación**:
- Antes de crear/actualizar un pedido, calcular el inventario disponible
- Inventario disponible = Stock actual - Apartados activos (`kar_nat = '-'`)
- Si no hay suficiente, opciones:
  - Marcar pedido con observación "Sin stock disponible"
  - Crear con `kar_nat = 'C'` (no apartar)
  - Rechazar la sincronización

**Función sugerida**:
```javascript
const validarInventarioDisponible = async (art_sec, cantidad) => {
  const pool = await poolPromise;
  
  const query = `
    SELECT 
      ISNULL(SUM(CASE WHEN fk.kar_nat = '+' THEN fk.kar_uni ELSE 0 END), 0) -
      ISNULL(SUM(CASE WHEN fk.kar_nat = '-' THEN fk.kar_uni ELSE 0 END), 0) AS stock_disponible
    FROM dbo.facturakardes fk
    INNER JOIN dbo.factura f ON f.fac_sec = fk.fac_sec
    WHERE fk.art_sec = @art_sec
      AND f.fac_est_fac = 'A'
      AND fk.kar_nat IN ('+', '-')
  `;
  
  const result = await pool.request()
    .input('art_sec', sql.VarChar(30), art_sec)
    .query(query);
  
  const stockDisponible = result.recordset[0].stock_disponible;
  return stockDisponible >= cantidad;
};
```

### 3. Campo de Control de Apartado en Factura

**Objetivo**: Facilitar el seguimiento y reportes de apartados.

**Cambio en BD**:
```sql
ALTER TABLE dbo.factura
ADD fac_apartado CHAR(1) DEFAULT 'N',
    fac_fecha_vencimiento_apartado DATETIME NULL;
```

**Lógica**:
- `fac_apartado = 'S'` cuando la cotización tiene `kar_nat = '-'`
- `fac_fecha_vencimiento_apartado` se calcula al crear (fecha creación + días vencimiento)

### 4. Reporte de Apartados Activos

**Objetivo**: Visualizar y gestionar apartados pendientes.

**Endpoint sugerido**: `GET /api/reportes/apartados`

**Información a mostrar**:
- Número de pedido WooCommerce
- Cliente
- Artículos apartados
- Fecha de apartado
- Días pendientes
- Estado en WooCommerce
- Alerta de vencimiento próximo

### 5. Integración con Estados de WooCommerce

**Objetivo**: Solo apartar pedidos en estados específicos.

**Estados que DEBEN apartar**:
- `pending` - Pendiente de pago
- `on-hold` - En espera
- `processing` - En proceso

**Estados que NO deben apartar**:
- `cancelled` - Cancelado
- `refunded` - Reembolsado
- `failed` - Fallido
- `completed` - Completado (ya facturado)

**Lógica**:
```javascript
const estadosQueApartan = ['pending', 'on-hold', 'processing'];
const debeApartar = estadosQueApartan.includes(orderData.status.toLowerCase());
const karNat = debeApartar ? '-' : 'C';
```

### 6. Reversión Automática al Cancelar en WooCommerce

**Objetivo**: Liberar inventario cuando un pedido se cancela en WooCommerce.

**Implementación**:
- En la sincronización, detectar si el estado cambió a `cancelled`
- Si la cotización tiene `kar_nat = '-'`, cambiar a `kar_nat = 'c'`
- Registrar la acción

---

## 📋 Plan de Implementación

### Fase 1: Cambios Básicos (Críticos)

**Prioridad**: 🔴 ALTA

1. **Modificar sincronización** (`syncWooOrdersController.js`)
   - Cambiar `kar_nat = 'C'` → `kar_nat = '-'` en `createOrder`
   - Cambiar `kar_nat = 'C'` → `kar_nat = '-'` en `updateOrder`
   - Agregar validación de estados de WooCommerce

2. **Modificar facturación** (`orderModel.js`)
   - Agregar lógica para cambiar `kar_nat = 'c'` en cotización original al facturar
   - Implementar en `createCompleteOrder` y `updateOrder`

**Tiempo estimado**: 2-3 horas

### Fase 2: Validación de Inventario (Importante)

**Prioridad**: 🟡 MEDIA

3. **Crear función de validación de inventario**
   - Función para calcular stock disponible
   - Integrar en sincronización
   - Manejar casos de stock insuficiente

**Tiempo estimado**: 3-4 horas

### Fase 3: Sistema de Vencimiento (Recomendado)

**Prioridad**: 🟡 MEDIA

4. **Crear job de vencimiento de apartados**
   - Proceso programado (cron job)
   - Identificar apartados vencidos
   - Liberar inventario automáticamente
   - Registrar acciones

**Tiempo estimado**: 4-5 horas

### Fase 4: Mejoras y Reportes (Opcional)

**Prioridad**: 🟢 BAJA

5. **Agregar campos de control en factura**
   - Script SQL para agregar campos
   - Actualizar lógica de creación/actualización

6. **Crear reporte de apartados**
   - Endpoint de API
   - Frontend para visualización

7. **Reversión automática por cancelación**
   - Detectar cancelaciones en WooCommerce
   - Liberar inventario automáticamente

**Tiempo estimado**: 6-8 horas

---

## ⚙️ Consideraciones Técnicas

### 1. Impacto en Performance

**Consulta de inventario disponible**:
- Puede ser costosa con muchos registros
- **Solución**: Agregar índices en `facturakardes`
  ```sql
  CREATE INDEX IX_facturakardes_art_sec_kar_nat 
  ON dbo.facturakardes(art_sec, kar_nat) 
  INCLUDE (kar_uni, fac_sec);
  
  CREATE INDEX IX_facturakardes_fac_sec_kar_nat 
  ON dbo.facturakardes(fac_sec, kar_nat);
  ```

**Validación por pedido**:
- Validar cada artículo puede ser lento
- **Solución**: Validar solo artículos críticos o con stock bajo

### 2. Transacciones y Consistencia

**Importante**: Todos los cambios deben estar dentro de transacciones SQL para garantizar consistencia:
- Cambio de `kar_nat` en cotización al facturar
- Creación de factura VTA
- Actualización de inventario

**Ejemplo**:
```javascript
const transaction = new sql.Transaction(pool);
try {
  await transaction.begin();
  
  // 1. Crear factura VTA
  // 2. Cambiar kar_nat en COT original
  // 3. Actualizar fac_nro_origen
  
  await transaction.commit();
} catch (error) {
  await transaction.rollback();
  throw error;
}
```

### 3. Auditoría y Logging

**Recomendación**: Registrar todas las acciones importantes:
- Apartado de inventario
- Liberación de apartado
- Vencimiento de apartados
- Cambios de `kar_nat`

**Tabla sugerida** (opcional):
```sql
CREATE TABLE dbo.auditoria_apartados (
  aud_sec DECIMAL(18,0) IDENTITY(1,1) PRIMARY KEY,
  fac_sec DECIMAL(18,0) NOT NULL,
  accion VARCHAR(50) NOT NULL, -- 'APARTAR', 'LIBERAR', 'VENCER', 'FACTURAR'
  kar_nat_anterior CHAR(1),
  kar_nat_nuevo CHAR(1),
  usuario VARCHAR(50),
  fecha DATETIME DEFAULT GETDATE(),
  observaciones VARCHAR(500)
);
```

### 4. Compatibilidad con Sistema Existente

**Consideraciones**:
- Los reportes de kardex ya filtran por `kar_nat IN ('+', '-')`, por lo que no se verán afectados
- Los reportes de inventario deben considerar apartados si es necesario
- Validar que no haya scripts o procesos que dependan de `kar_nat = 'C'`

### 5. Manejo de Errores

**Escenarios a considerar**:
1. **Stock insuficiente**: Decidir si rechazar o crear sin apartar
2. **Error al cambiar kar_nat**: Rollback completo de la transacción
3. **Pedido ya facturado**: No permitir cambios en la cotización original
4. **Sincronización duplicada**: Validar que no se dupliquen apartados

---

## 📊 Impacto en el Sistema

### Impacto en Inventario

**Antes**:
- Stock disponible = Stock físico
- No se consideran pedidos pendientes

**Después**:
- Stock disponible = Stock físico - Apartados activos
- Mejor control de inventario comprometido

### Impacto en Reportes

**Reportes afectados**:
1. **Kardex**: No afectado (solo considera `'+'` y `'-'`)
2. **Inventario disponible**: Debe considerar apartados
3. **Reportes de ventas**: No afectado directamente

**Nuevos reportes necesarios**:
- Apartados activos
- Apartados vencidos
- Historial de apartados

### Impacto en WooCommerce

**Sincronización**:
- Más lenta (validación de inventario)
- Puede rechazar pedidos sin stock

**Stock en WooCommerce**:
- Considerar si se actualiza el stock en WooCommerce basado en apartados
- Opción: Reducir stock disponible en WooCommerce cuando se aparta

---

## 🎬 Casos de Uso y Escenarios

### Escenario 1: Pedido Normal (Pago Inmediato)

1. Cliente realiza pedido en WooCommerce
2. Pedido sincronizado → COT creada con `kar_nat = '-'` (inventario apartado)
3. Cliente paga en 2 horas
4. Pedido facturado → COT: `kar_nat = 'c'`, VTA: `kar_nat = '-'`
5. ✅ Inventario correctamente gestionado

### Escenario 2: Pedido No Pagado (Vencimiento)

1. Cliente realiza pedido en WooCommerce
2. Pedido sincronizado → COT creada con `kar_nat = '-'` (inventario apartado)
3. Cliente NO paga después de 48 horas
4. Job de vencimiento ejecuta → COT: `kar_nat = 'c'` (inventario liberado)
5. ✅ Inventario disponible para otros pedidos

### Escenario 3: Pedido Cancelado en WooCommerce

1. Cliente realiza pedido en WooCommerce
2. Pedido sincronizado → COT creada con `kar_nat = '-'` (inventario apartado)
3. Cliente cancela pedido en WooCommerce
4. Próxima sincronización detecta cancelación → COT: `kar_nat = 'c'` (inventario liberado)
5. ✅ Inventario liberado automáticamente

### Escenario 4: Stock Insuficiente

1. Cliente realiza pedido en WooCommerce
2. Sincronización valida inventario → Stock insuficiente
3. Opciones:
   - **Opción A**: Crear COT con `kar_nat = 'C'` (no apartar) + observación
   - **Opción B**: Rechazar sincronización
4. ✅ Prevención de sobreventa

### Escenario 5: Actualización de Pedido

1. Pedido sincronizado → COT con `kar_nat = '-'`
2. Cliente modifica pedido en WooCommerce (agrega/quita productos)
3. Sincronización actualiza → Elimina detalles antiguos, crea nuevos con `kar_nat = '-'`
4. ✅ Apartado actualizado correctamente

---

## ✅ Pruebas y Validación

### Pruebas Unitarias

1. **Sincronización con apartado**:
   - Verificar que `kar_nat = '-'` en registros creados
   - Verificar que inventario se reduce correctamente

2. **Facturación con compensación**:
   - Verificar que `kar_nat = 'c'` en COT original
   - Verificar que `kar_nat = '-'` en VTA nueva
   - Verificar que no hay doble descuento

3. **Vencimiento de apartados**:
   - Verificar que apartados vencidos cambian a `kar_nat = 'c'`
   - Verificar que inventario se libera correctamente

### Pruebas de Integración

1. **Flujo completo**:
   - Sincronizar pedido → Verificar apartado
   - Facturar pedido → Verificar compensación
   - Verificar inventario final

2. **Múltiples pedidos**:
   - Sincronizar varios pedidos del mismo artículo
   - Verificar que apartados se suman correctamente
   - Facturar uno → Verificar que otros siguen apartados

### Pruebas de Carga

1. **Sincronización masiva**:
   - Sincronizar 100+ pedidos
   - Verificar performance
   - Verificar consistencia de inventario

### Validación de Datos

1. **Verificar consistencia**:
   ```sql
   -- Verificar que no hay doble apartados
   SELECT art_sec, SUM(kar_uni) as total_apartado
   FROM dbo.facturakardes fk
   INNER JOIN dbo.factura f ON f.fac_sec = fk.fac_sec
   WHERE f.fac_tip_cod = 'COT'
     AND fk.kar_nat = '-'
     AND f.fac_est_fac = 'A'
   GROUP BY art_sec
   HAVING SUM(kar_uni) < 0;
   ```

2. **Verificar apartados sin facturar**:
   ```sql
   -- Apartados activos sin factura asociada
   SELECT f.fac_nro, f.fac_nro_woo, f.fac_fec, DATEDIFF(day, f.fac_fec, GETDATE()) as dias_pendientes
   FROM dbo.factura f
   INNER JOIN dbo.facturakardes fk ON f.fac_sec = fk.fac_sec
   WHERE f.fac_tip_cod = 'COT'
     AND fk.kar_nat = '-'
     AND f.fac_est_fac = 'A'
     AND f.fac_nro_woo IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 
       FROM dbo.factura f_vta 
       WHERE f_vta.fac_nro_origen = f.fac_nro 
         AND f_vta.fac_tip_cod = 'VTA'
         AND f_vta.fac_est_fac = 'A'
     )
   GROUP BY f.fac_nro, f.fac_nro_woo, f.fac_fec;
   ```

---

## 📝 Scripts SQL Necesarios

### Script 1: Verificar Estado Actual

```sql
-- Verificar pedidos WooCommerce actuales
SELECT 
  f.fac_nro,
  f.fac_nro_woo,
  f.fac_tip_cod,
  f.fac_fec,
  fk.kar_nat,
  COUNT(*) as total_detalles,
  SUM(CASE WHEN fk.kar_nat = '-' THEN fk.kar_uni ELSE 0 END) as unidades_apartadas
FROM dbo.factura f
INNER JOIN dbo.facturakardes fk ON f.fac_sec = fk.fac_sec
WHERE f.fac_nro_woo IS NOT NULL
  AND f.fac_tip_cod = 'COT'
GROUP BY f.fac_nro, f.fac_nro_woo, f.fac_tip_cod, f.fac_fec, fk.kar_nat
ORDER BY f.fac_fec DESC;
```

### Script 2: Migración de Datos Existentes (Opcional)

```sql
-- Si se decide migrar pedidos existentes
-- CUIDADO: Solo ejecutar después de análisis exhaustivo

-- Opción 1: Apartar pedidos recientes (últimos 7 días)
UPDATE fk
SET fk.kar_nat = '-'
FROM dbo.facturakardes fk
INNER JOIN dbo.factura f ON f.fac_sec = fk.fac_sec
WHERE f.fac_tip_cod = 'COT'
  AND f.fac_nro_woo IS NOT NULL
  AND fk.kar_nat = 'C'
  AND f.fac_fec >= DATEADD(day, -7, GETDATE())
  AND NOT EXISTS (
    SELECT 1 
    FROM dbo.factura f_vta 
    WHERE f_vta.fac_nro_origen = f.fac_nro 
      AND f_vta.fac_tip_cod = 'VTA'
      AND f_vta.fac_est_fac = 'A'
  );
```

### Script 3: Índices para Performance

```sql
-- Índice para consultas de inventario disponible
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_facturakardes_art_sec_kar_nat')
BEGIN
  CREATE INDEX IX_facturakardes_art_sec_kar_nat 
  ON dbo.facturakardes(art_sec, kar_nat) 
  INCLUDE (kar_uni, fac_sec);
END

-- Índice para consultas de apartados por factura
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_facturakardes_fac_sec_kar_nat')
BEGIN
  CREATE INDEX IX_facturakardes_fac_sec_kar_nat 
  ON dbo.facturakardes(fac_sec, kar_nat);
END
```

### Script 4: Campos Adicionales (Opcional)

```sql
-- Agregar campos de control de apartado
IF NOT EXISTS (SELECT * FROM sys.columns 
               WHERE object_id = OBJECT_ID(N'[dbo].[factura]') 
               AND name = 'fac_apartado')
BEGIN
  ALTER TABLE dbo.factura
  ADD fac_apartado CHAR(1) DEFAULT 'N',
      fac_fecha_vencimiento_apartado DATETIME NULL;
  
  PRINT 'Campos de apartado agregados exitosamente';
END
ELSE
BEGIN
  PRINT 'Los campos de apartado ya existen';
END
```

---

## 🔄 Resumen Ejecutivo

### Problema
Los pedidos de WooCommerce no están apartando inventario, causando sobreventa y descuadres.

### Solución
1. **Apartar al sincronizar**: `kar_nat = '-'` en cotizaciones
2. **Compensar al facturar**: `kar_nat = 'c'` en cotización original
3. **Liberar al vencer**: Job automático para apartados vencidos

### Beneficios
- ✅ Inventario más preciso
- ✅ Prevención de sobreventa
- ✅ Control automático de apartados
- ✅ Liberación automática de inventario no pagado

### Riesgos y Mitigación
- **Riesgo**: Doble descuento al facturar
  - **Mitigación**: Cambiar `kar_nat = 'c'` en COT original
  
- **Riesgo**: Performance en validación de inventario
  - **Mitigación**: Índices y validación selectiva

- **Riesgo**: Apartados que nunca se liberan
  - **Mitigación**: Job de vencimiento automático

### Próximos Pasos
1. Revisar y aprobar solución propuesta
2. Implementar Fase 1 (cambios básicos)
3. Probar en ambiente de desarrollo
4. Implementar Fase 2 y 3 (validación y vencimiento)
5. Desplegar a producción con monitoreo

---

## 📚 Referencias

- **Archivos principales**:
  - `controllers/syncWooOrdersController.js` - Sincronización de pedidos
  - `models/orderModel.js` - Creación y actualización de pedidos
  - `models/kardexModel.js` - Cálculo de kardex

- **Documentación relacionada**:
  - `implementacion/DOCUMENTACION_DESCUENTOS_EVENTOS.md` - Sistema de descuentos
  - `impactos/septiembre_2025/` - Cambios recientes en factura

---

**Fecha de creación**: 2025-01-XX  
**Última actualización**: 2025-01-XX  
**Autor**: Sistema de Análisis  
**Versión**: 1.0

