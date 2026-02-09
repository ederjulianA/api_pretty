# Análisis: Sincronización de Categorías WooCommerce vs Sistema Local

**Fecha:** 2026-02-05
**Autor:** Análisis técnico - API Pretty
**Versión:** 1.0
**Estado:** Propuesta para revisión

---

## 1. CONTEXTO Y PROBLEMÁTICA

### 1.1 Situación Actual

El sistema **API Pretty** mantiene una arquitectura de categorización de productos con **dos niveles jerárquicos**:

- **Nivel 1 (Categorías):** Almacenadas en `dbo.inventario_grupo`
  - Ejemplo: "Maquillaje", "Skincare", "Accesorios"
- **Nivel 2 (Subcategorías):** Almacenadas en `dbo.inventario_subgrupo`
  - Ejemplo: "Labiales", "Sombras", "Cremas hidratantes"

Cada producto en `dbo.articulos` se vincula a una subcategoría mediante `inv_sub_gru_cod`, heredando así su categoría padre.

### 1.2 Problema Identificado

**Se han detectado inconsistencias entre la categorización de productos en el sistema local y WooCommerce.** Esto puede ocurrir por diversas razones:

1. **Modificaciones manuales en WooCommerce:** Usuarios con acceso al administrador de WooCommerce cambian categorías directamente en la tienda
2. **Errores en sincronización inicial:** Productos creados en WooCommerce sin pasar por la API
3. **Categorías creadas directamente en WooCommerce:** Sin equivalente en el sistema local
4. **Migraciones previas:** Posibles inconsistencias heredadas de importaciones anteriores
5. **Actualizaciones fallidas:** Errores en el proceso de sincronización que dejaron datos incompletos

### 1.3 Impacto del Problema

- ❌ **Reportes incorrectos:** Los informes de ventas por categoría no reflejan la realidad
- ❌ **Confusión en inventario:** Dificultad para ubicar productos
- ❌ **Inconsistencia de datos:** Imposibilidad de confiar en una única fuente de verdad
- ❌ **Trabajo manual adicional:** Necesidad de revisar y corregir productos uno por uno
- ❌ **Pérdida de control:** No hay visibilidad sobre qué productos tienen discrepancias

---

## 2. ARQUITECTURA ACTUAL DEL SISTEMA

### 2.1 Estructura de Categorías en el Sistema Local

```
┌─────────────────────────────┐
│  inventario_grupo           │
│  (Categorías)               │
│  - inv_gru_cod (PK)         │
│  - inv_gru_nom              │
└──────────┬──────────────────┘
           │
           │ 1:N
           ▼
┌─────────────────────────────┐
│  inventario_subgrupo        │
│  (Subcategorías)            │
│  - inv_sub_gru_cod (PK)     │
│  - inv_gru_cod (FK)         │
│  - inv_sub_gru_nom          │
│  - inv_sub_gru_woo_id       │◄── ID en WooCommerce
│  - inv_sub_gru_parend_woo   │◄── ID del padre en WooCommerce
└──────────┬──────────────────┘
           │
           │ 1:N
           ▼
┌─────────────────────────────┐
│  articulos                  │
│  (Productos)                │
│  - art_sec (PK)             │
│  - art_cod (SKU)            │
│  - inv_sub_gru_cod (FK)     │
│  - art_nom                  │
│  - art_woo_id               │◄── ID en WooCommerce
└─────────────────────────────┘
```

### 2.2 Sincronización Actual: Backend → WooCommerce ✅

**Flujo implementado:**

```javascript
// Al crear un producto en el backend (articulosModel.js)
1. Usuario asigna: inv_sub_gru_cod = "LAB01" (Subcategoría: Labiales)
2. Sistema busca en inventario_subgrupo:
   - inv_sub_gru_woo_id = 45        (ID subcategoría en WooCommerce)
   - inv_sub_gru_parend_woo = 12    (ID categoría padre en WooCommerce)
3. Sistema envía a WooCommerce API:
   {
     "sku": "PROD123",
     "name": "Labial Mate Rojo",
     "categories": [
       { "id": 12 },  // Categoría padre
       { "id": 45 }   // Subcategoría
     ]
   }
4. Producto queda correctamente categorizado en WooCommerce
```

**Estado:** ✅ **FUNCIONAL** - La sincronización de Backend a WooCommerce funciona correctamente.

### 2.3 Sincronización Actual: WooCommerce → Backend ❌

**Flujo NO implementado:**

```javascript
// En wooSyncController.js - función syncWooProducts()
const products = await wooCommerce.get('products', { per_page: 100, page: 1 });

for (const product of products.data) {
  const { sku, name, stock_quantity, regular_price, meta_data } = product;

  // ❌ product.categories NO se procesa ni se guarda
  // ❌ No hay comparación con categorías del sistema local
  // ❌ No hay validación de consistencia

  // Solo se guarda en ArticuloHook:
  await pool.request()
    .input('ArtHookCod', sql.NVarChar(30), sku)
    .input('ArtHooName', sql.NVarChar(100), name)
    .input('ArtHooStok', sql.Int, stock_quantity)
    .input('ArtHookDetal', sql.Decimal(18, 0), Math.round(parseFloat(regular_price)))
    // ... NO hay campos de categorías
    .query('INSERT INTO ArticuloHook ...');
}
```

**Estado:** ❌ **NO IMPLEMENTADO** - Las categorías de WooCommerce no se sincronizan al sistema.

### 2.4 Tabla ArticuloHook - Estructura Actual

```sql
CREATE TABLE ArticuloHook (
    ArtHookCod NVARCHAR(30) PRIMARY KEY,        -- SKU del producto
    ArtHooName NVARCHAR(100),                   -- Nombre
    ArtHooStok INT,                             -- Stock WooCommerce
    ArtHookDetal DECIMAL(18,0),                 -- Precio detal WooCommerce
    ArtHookMayor DECIMAL(18,0),                 -- Precio mayor WooCommerce
    ArtHookFchCrea DATETIME,                    -- Fecha creación
    ArtHookFchMod DATETIME,                     -- Fecha modificación
    ArtHookFchHra DATETIME,                     -- Hora (redundante)
    ArtHookFchHraMod DATETIME,                  -- Hora modificación
    ArtHooStockSys INT,                         -- Stock sistema local
    ArtHookActualizado NVARCHAR(1)              -- Flag S/N actualizado
)
```

**Propósito de ArticuloHook:**
- Tabla de **staging/comparación** entre WooCommerce y sistema local
- Permite detectar diferencias en precios y stock
- Facilita auditoría de cambios
- **NO almacena información de categorías actualmente**

---

## 3. ANÁLISIS DE LA PROPUESTA: AGREGAR CAMPOS A ARTICULOHOOK

### 3.1 Propuesta del Usuario

Agregar los siguientes campos a `ArticuloHook`:

```sql
ALTER TABLE ArticuloHook ADD
    ArtHookCategoriaSys NVARCHAR(100),          -- Nombre categoría sistema local
    ArtHookSubcategoriaSys NVARCHAR(100),       -- Nombre subcategoría sistema local
    ArtHookCategoriaWoo NVARCHAR(100),          -- Nombre categoría WooCommerce
    ArtHookSubcategoriaWoo NVARCHAR(100),       -- Nombre subcategoría WooCommerce
    ArtHookCategoriaWooId INT,                  -- ID categoría en WooCommerce
    ArtHookSubcategoriaWooId INT;               -- ID subcategoría en WooCommerce
```

### 3.2 Ventajas de Este Enfoque ✅

| Ventaja | Descripción |
|---------|-------------|
| **Consistencia arquitectónica** | Sigue el patrón existente de ArticuloHook para comparar datos |
| **Simplicidad de implementación** | Solo requiere modificar `syncWooProducts()` en `wooSyncController.js` |
| **Bajo riesgo** | No afecta tablas principales de producción |
| **Auditoría inmediata** | Permite comparar categorías de forma directa con un simple query |
| **Reversible** | Si no funciona, se pueden eliminar los campos sin afectar el sistema |
| **Query sencillo** | Para encontrar discrepancias: `SELECT * FROM ArticuloHook WHERE ArtHookCategoriaSys != ArtHookCategoriaWoo` |

### 3.3 Desventajas y Consideraciones ⚠️

| Desventaja | Descripción | Mitigación |
|------------|-------------|------------|
| **Redundancia de datos** | Duplica información que ya existe en otras tablas | Aceptable para tabla de staging |
| **Mantenimiento adicional** | Cada sincronización debe actualizar más campos | Costo computacional mínimo |
| **Desnormalización** | Almacena nombres en lugar de solo IDs | Justificado para facilitar auditoría |
| **Sincronización cíclica** | Si WooCommerce tiene N categorías, ¿cuál guardar? | Necesita lógica de priorización |
| **Escalabilidad limitada** | Si WooCommerce evoluciona a 3+ niveles, requiere refactorización | Documentar limitación |

### 3.4 Casos de Uso que Resuelve

#### Caso 1: Identificar productos con categorías incorrectas
```sql
-- Productos con discrepancias en categorías
SELECT
    ArtHookCod AS SKU,
    ArtHooName AS Producto,
    ArtHookCategoriaSys AS [Categoría Sistema],
    ArtHookCategoriaWoo AS [Categoría WooCommerce],
    ArtHookSubcategoriaSys AS [Subcategoría Sistema],
    ArtHookSubcategoriaWoo AS [Subcategoría WooCommerce]
FROM ArticuloHook
WHERE
    ArtHookCategoriaSys != ArtHookCategoriaWoo
    OR ArtHookSubcategoriaSys != ArtHookSubcategoriaWoo;
```

#### Caso 2: Productos sin categoría en WooCommerce
```sql
-- Productos que perdieron su categorización en WooCommerce
SELECT
    ArtHookCod,
    ArtHooName,
    ArtHookCategoriaSys,
    ArtHookSubcategoriaSys
FROM ArticuloHook
WHERE
    ArtHookCategoriaWoo IS NULL
    OR ArtHookSubcategoriaWoo IS NULL;
```

#### Caso 3: Productos en categorías no mapeadas
```sql
-- Productos con categorías de WooCommerce que no existen en el sistema
SELECT
    ArtHookCod,
    ArtHookCategoriaWoo,
    ArtHookSubcategoriaWoo
FROM ArticuloHook
WHERE
    ArtHookCategoriaWooId NOT IN (
        SELECT inv_sub_gru_woo_id FROM inventario_subgrupo
    );
```

---

## 4. ALTERNATIVAS EVALUADAS

### 4.1 Alternativa A: Tabla de Auditoría Independiente

**Descripción:**
Crear una tabla separada `CategoriaAuditoria` para almacenar discrepancias.

```sql
CREATE TABLE CategoriaAuditoria (
    audit_id INT IDENTITY(1,1) PRIMARY KEY,
    art_cod NVARCHAR(30),
    fecha_auditoria DATETIME DEFAULT GETDATE(),
    categoria_sistema NVARCHAR(100),
    subcategoria_sistema NVARCHAR(100),
    categoria_woo NVARCHAR(100),
    subcategoria_woo NVARCHAR(100),
    estado_correccion NVARCHAR(20) -- 'pendiente', 'corregido', 'ignorado'
);
```

**Ventajas:**
- ✅ Separación de responsabilidades (ArticuloHook solo precios/stock)
- ✅ Historial de auditorías (múltiples registros por producto)
- ✅ Estado de corrección por cada discrepancia

**Desventajas:**
- ❌ Mayor complejidad de implementación
- ❌ Queries más complejas (joins adicionales)
- ❌ No sigue el patrón existente de ArticuloHook

**Evaluación:** ⚠️ Válida para historial de auditorías, pero **excesiva** para el problema actual.

### 4.2 Alternativa B: Agregar Campos a la Tabla `articulos`

**Descripción:**
Agregar campos de categoría WooCommerce directamente en `dbo.articulos`.

```sql
ALTER TABLE articulos ADD
    art_cat_woo_id INT,
    art_cat_woo_nombre NVARCHAR(100),
    art_subcat_woo_id INT,
    art_subcat_woo_nombre NVARCHAR(100);
```

**Ventajas:**
- ✅ Información centralizada en la tabla principal
- ✅ No requiere joins para consultas

**Desventajas:**
- ❌ **Alto riesgo:** Modifica tabla crítica de producción
- ❌ Duplica información (ya existe `inv_sub_gru_cod`)
- ❌ Desnormalización de tabla maestra
- ❌ Dificulta rollback en caso de error

**Evaluación:** ❌ **NO RECOMENDADA** - Riesgo innecesario para el objetivo de auditoría.

### 4.3 Alternativa C: Vista SQL de Comparación

**Descripción:**
Crear una vista que compare en tiempo real sin almacenar datos adicionales.

```sql
CREATE VIEW vwCategoriaComparacion AS
SELECT
    a.art_cod,
    a.art_nom,
    ig.inv_gru_nom AS categoria_sistema,
    isg.inv_sub_gru_nom AS subcategoria_sistema,
    -- Obtener categorías de WooCommerce vía API o tabla temporal
    NULL AS categoria_woo, -- Requiere implementación
    NULL AS subcategoria_woo
FROM articulos a
JOIN inventario_subgrupo isg ON a.inv_sub_gru_cod = isg.inv_sub_gru_cod
JOIN inventario_grupo ig ON isg.inv_gru_cod = ig.inv_gru_cod;
```

**Ventajas:**
- ✅ Sin almacenamiento redundante
- ✅ Siempre datos actualizados

**Desventajas:**
- ❌ **Imposible obtener categorías de WooCommerce en tiempo real desde SQL**
- ❌ Requeriría llamadas API síncronas (extremadamente lento)
- ❌ No escalable para miles de productos

**Evaluación:** ❌ **NO VIABLE** - Limitaciones técnicas de SQL Server con APIs externas.

### 4.4 Alternativa D: Job de Validación Periódico

**Descripción:**
Crear un job que ejecute validación de categorías y genere reportes.

**Implementación:**
- Endpoint: `POST /api/woo/audit-categories`
- Frecuencia: Diario/semanal (configurable)
- Output: Archivo JSON o Excel con discrepancias

**Ventajas:**
- ✅ No modifica estructura de base de datos
- ✅ Flexibilidad en formato de reporte

**Desventajas:**
- ❌ No permite consultas SQL ad-hoc
- ❌ Datos solo disponibles después de ejecutar el job
- ❌ Requiere sistema de notificaciones

**Evaluación:** ⚠️ **Complementaria** - Útil como herramienta adicional, no como solución principal.

---

## 5. RECOMENDACIÓN TÉCNICA

### 5.1 Solución Propuesta: Híbrida (ArticuloHook + Endpoint de Corrección)

**Fase 1: Detección (Agregar campos a ArticuloHook)** ✅ RECOMENDADO

Implementar la propuesta original con las siguientes mejoras:

```sql
-- Script de migración
ALTER TABLE ArticuloHook ADD
    -- Categorías del Sistema Local
    ArtHookCatSysCod NVARCHAR(20),              -- Código de grupo (inv_gru_cod)
    ArtHookCatSysNombre NVARCHAR(100),          -- Nombre de grupo
    ArtHookSubcatSysCod NVARCHAR(20),           -- Código de subgrupo (inv_sub_gru_cod)
    ArtHookSubcatSysNombre NVARCHAR(100),       -- Nombre de subgrupo

    -- Categorías de WooCommerce
    ArtHookCatWooId INT,                        -- ID de categoría padre en WooCommerce
    ArtHookCatWooNombre NVARCHAR(100),          -- Nombre de categoría padre
    ArtHookSubcatWooId INT,                     -- ID de subcategoría en WooCommerce
    ArtHookSubcatWooNombre NVARCHAR(100),       -- Nombre de subcategoría

    -- Metadata de sincronización
    ArtHookCategoriaMatch BIT,                  -- 1 = Coinciden, 0 = Discrepancia
    ArtHookCatFechaVerificacion DATETIME;       -- Última verificación
```

**Justificación:**
- ✅ Incluye **códigos** además de nombres (facilita correcciones automáticas)
- ✅ Campo calculado `ArtHookCategoriaMatch` para filtrar rápidamente
- ✅ Timestamp de verificación para auditoría

**Fase 2: Corrección Automática (Endpoint dedicado)**

Crear endpoint para corregir discrepancias:

```javascript
// POST /api/woo/fix-categories
// Body: { action: 'sync-from-woo' | 'sync-to-woo', art_cod: 'PROD123' }

export const fixProductCategories = async (req, res) => {
  const { action, art_cod } = req.body;

  if (action === 'sync-from-woo') {
    // Actualizar sistema local con categorías de WooCommerce
    // 1. Buscar en ArticuloHook las categorías de WooCommerce
    // 2. Mapear a inv_sub_gru_cod del sistema
    // 3. Actualizar articulos.inv_sub_gru_cod
  }

  if (action === 'sync-to-woo') {
    // Actualizar WooCommerce con categorías del sistema local
    // 1. Obtener inv_sub_gru_cod de articulos
    // 2. Buscar inv_sub_gru_woo_id e inv_sub_gru_parend_woo
    // 3. Actualizar producto en WooCommerce vía API
  }
};
```

**Fase 3: Dashboard de Auditoría (Interfaz de usuario)**

Crear vista en frontend para:
- Listar productos con discrepancias
- Botón "Sincronizar desde WooCommerce"
- Botón "Sincronizar a WooCommerce"
- Filtros por categoría
- Exportar a Excel

---

## 6. PLAN DE IMPLEMENTACIÓN

### 6.1 Fase 1: Preparación de Base de Datos (1-2 días)

**Tareas:**
1. ✅ Crear script de migración SQL
2. ✅ Ejecutar en ambiente de desarrollo
3. ✅ Validar que no rompe queries existentes
4. ✅ Ejecutar en producción en horario de bajo tráfico

**Entregables:**
- `/implementaciones_2026/sql/02_alter_articulohook_categorias.sql`

**Código del script:**
```sql
-- Script: 02_alter_articulohook_categorias.sql
-- Fecha: 2026-02-05
-- Descripción: Agrega campos de categorías a ArticuloHook para auditoría

USE [tu_base_de_datos];
GO

-- Verificar que la tabla existe
IF OBJECT_ID('dbo.ArticuloHook', 'U') IS NOT NULL
BEGIN
    PRINT 'Agregando campos de categorías a ArticuloHook...';

    -- Agregar campos si no existen
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ArticuloHook') AND name = 'ArtHookCatSysCod')
    BEGIN
        ALTER TABLE dbo.ArticuloHook ADD
            -- Categorías del Sistema Local
            ArtHookCatSysCod NVARCHAR(20) NULL,
            ArtHookCatSysNombre NVARCHAR(100) NULL,
            ArtHookSubcatSysCod NVARCHAR(20) NULL,
            ArtHookSubcatSysNombre NVARCHAR(100) NULL,

            -- Categorías de WooCommerce
            ArtHookCatWooId INT NULL,
            ArtHookCatWooNombre NVARCHAR(100) NULL,
            ArtHookSubcatWooId INT NULL,
            ArtHookSubcatWooNombre NVARCHAR(100) NULL,

            -- Metadata
            ArtHookCategoriaMatch BIT NULL,
            ArtHookCatFechaVerificacion DATETIME NULL;

        PRINT 'Campos agregados exitosamente.';
    END
    ELSE
    BEGIN
        PRINT 'Los campos ya existen. Operación cancelada.';
    END
END
ELSE
BEGIN
    PRINT 'ERROR: La tabla ArticuloHook no existe.';
END
GO
```

### 6.2 Fase 2: Modificación del Controlador (2-3 días)

**Archivo:** `/controllers/wooSyncController.js`

**Modificaciones necesarias:**

```javascript
// En la función syncWooProducts(), agregar después de la línea 169

const {
    sku,
    name,
    stock_quantity,
    regular_price,
    meta_data,
    categories  // ◄── NUEVO: Obtener categorías desde WooCommerce
} = product;

// ... código existente ...

// NUEVO BLOQUE: Obtener categorías del sistema local
const pool = await poolPromise;
const localCategories = await pool.request()
    .input('art_cod', sql.VarChar(50), sku)
    .query(`
        SELECT
            ig.inv_gru_cod AS cat_sys_cod,
            ig.inv_gru_nom AS cat_sys_nombre,
            isg.inv_sub_gru_cod AS subcat_sys_cod,
            isg.inv_sub_gru_nom AS subcat_sys_nombre
        FROM dbo.articulos a
        JOIN dbo.inventario_subgrupo isg ON a.inv_sub_gru_cod = isg.inv_sub_gru_cod
        JOIN dbo.inventario_grupo ig ON isg.inv_gru_cod = ig.inv_gru_cod
        WHERE a.art_cod = @art_cod
    `);

let catSysCod = null, catSysNombre = null, subcatSysCod = null, subcatSysNombre = null;

if (localCategories.recordset.length > 0) {
    const local = localCategories.recordset[0];
    catSysCod = local.cat_sys_cod;
    catSysNombre = local.cat_sys_nombre;
    subcatSysCod = local.subcat_sys_cod;
    subcatSysNombre = local.subcat_sys_nombre;
}

// NUEVO BLOQUE: Procesar categorías de WooCommerce
let catWooId = null, catWooNombre = null, subcatWooId = null, subcatWooNombre = null;

if (categories && categories.length > 0) {
    // WooCommerce devuelve array de categorías con estructura:
    // [{ id: 12, name: "Maquillaje" }, { id: 45, name: "Labiales" }]

    // Ordenar por ID para que el padre sea primero (IDs menores = padres)
    const sortedCategories = categories.sort((a, b) => a.id - b.id);

    if (sortedCategories.length >= 1) {
        catWooId = sortedCategories[0].id;
        catWooNombre = sortedCategories[0].name;
    }

    if (sortedCategories.length >= 2) {
        subcatWooId = sortedCategories[1].id;
        subcatWooNombre = sortedCategories[1].name;
    }
}

// Calcular si hay coincidencia
const categoriaMatch = (
    catSysNombre && catWooNombre &&
    catSysNombre.toLowerCase() === catWooNombre.toLowerCase() &&
    subcatSysNombre && subcatWooNombre &&
    subcatSysNombre.toLowerCase() === subcatWooNombre.toLowerCase()
) ? 1 : 0;

// Modificar el UPDATE de ArticuloHook (línea 336)
await pool.request()
    .input('ArtHooName', sql.NVarChar(100), name)
    .input('ArtHooStok', sql.Int, stock_quantity)
    .input('ArtHookDetal', sql.Decimal(18, 0), retailPrice || 0)
    .input('ArtHookMayor', sql.Decimal(18, 0), wholesalePrice || 0)
    .input('ArtHookFchMod', sql.DateTime, currentDate)
    .input('ArtHookFchHraMod', sql.DateTime, currentDate)
    .input('ArtHookActualizado', sql.NVarChar(1), 'S')
    .input('ArtHooStockSys', sql.Int, systemStock)

    // NUEVOS PARÁMETROS
    .input('ArtHookCatSysCod', sql.NVarChar(20), catSysCod)
    .input('ArtHookCatSysNombre', sql.NVarChar(100), catSysNombre)
    .input('ArtHookSubcatSysCod', sql.NVarChar(20), subcatSysCod)
    .input('ArtHookSubcatSysNombre', sql.NVarChar(100), subcatSysNombre)
    .input('ArtHookCatWooId', sql.Int, catWooId)
    .input('ArtHookCatWooNombre', sql.NVarChar(100), catWooNombre)
    .input('ArtHookSubcatWooId', sql.Int, subcatWooId)
    .input('ArtHookSubcatWooNombre', sql.NVarChar(100), subcatWooNombre)
    .input('ArtHookCategoriaMatch', sql.Bit, categoriaMatch)
    .input('ArtHookCatFechaVerificacion', sql.DateTime, currentDate)

    .input('ArtHookCod', sql.NVarChar(30), sku)
    .query(`
        UPDATE ArticuloHook
        SET ArtHooName = @ArtHooName,
            ArtHooStok = @ArtHooStok,
            ArtHookDetal = @ArtHookDetal,
            ArtHookMayor = @ArtHookMayor,
            ArtHookFchMod = @ArtHookFchMod,
            ArtHookFchHraMod = @ArtHookFchHraMod,
            ArtHookActualizado = @ArtHookActualizado,
            ArtHooStockSys = @ArtHooStockSys,
            ArtHookCatSysCod = @ArtHookCatSysCod,
            ArtHookCatSysNombre = @ArtHookCatSysNombre,
            ArtHookSubcatSysCod = @ArtHookSubcatSysCod,
            ArtHookSubcatSysNombre = @ArtHookSubcatSysNombre,
            ArtHookCatWooId = @ArtHookCatWooId,
            ArtHookCatWooNombre = @ArtHookCatWooNombre,
            ArtHookSubcatWooId = @ArtHookSubcatWooId,
            ArtHookSubcatWooNombre = @ArtHookSubcatWooNombre,
            ArtHookCategoriaMatch = @ArtHookCategoriaMatch,
            ArtHookCatFechaVerificacion = @ArtHookCatFechaVerificacion
        WHERE ArtHookCod = @ArtHookCod
    `);

// Aplicar lo mismo al INSERT (línea 361)
```

**Testing:**
- Ejecutar `POST /api/woo/sync-products`
- Verificar en SQL que se poblaron los nuevos campos
- Validar que `ArtHookCategoriaMatch` se calcula correctamente

### 6.3 Fase 3: Endpoint de Auditoría (1 día)

**Archivo:** `/controllers/wooSyncController.js`

**Nueva función:**

```javascript
/**
 * Obtiene productos con discrepancias en categorías
 * GET /api/woo/audit-categories?onlyMismatches=true
 */
export const auditCategories = async (req, res) => {
    const { onlyMismatches = 'false' } = req.query;

    try {
        const pool = await poolPromise;

        let query = `
            SELECT
                ArtHookCod AS sku,
                ArtHooName AS nombre,
                ArtHookCatSysNombre AS categoria_sistema,
                ArtHookSubcatSysNombre AS subcategoria_sistema,
                ArtHookCatWooNombre AS categoria_woocommerce,
                ArtHookSubcatWooNombre AS subcategoria_woocommerce,
                ArtHookCategoriaMatch AS coincide,
                ArtHookCatFechaVerificacion AS fecha_verificacion
            FROM ArticuloHook
        `;

        if (onlyMismatches === 'true') {
            query += ' WHERE ArtHookCategoriaMatch = 0 OR ArtHookCategoriaMatch IS NULL';
        }

        query += ' ORDER BY ArtHookCod';

        const result = await pool.request().query(query);

        res.json({
            success: true,
            totalRecords: result.recordset.length,
            data: result.recordset
        });

    } catch (error) {
        console.error('Error en auditoría de categorías:', error);
        res.status(500).json({
            success: false,
            message: 'Error al auditar categorías',
            error: error.message
        });
    }
};
```

**Ruta:** `/routes/wooSyncRoutes.js`

```javascript
import { syncWooProducts, auditCategories } from '../controllers/wooSyncController.js';

router.get('/audit-categories', auditCategories);
```

**Testing:**
```bash
# Obtener todos los productos con su estado de categorización
curl http://localhost:3000/api/woo/audit-categories

# Solo productos con discrepancias
curl http://localhost:3000/api/woo/audit-categories?onlyMismatches=true
```

### 6.4 Fase 4: Endpoint de Corrección (2-3 días)

**Archivo:** `/controllers/wooSyncController.js`

```javascript
/**
 * Corrige categorías de un producto
 * POST /api/woo/fix-category
 * Body: { art_cod: "PROD123", action: "sync-to-woo" | "sync-from-woo" }
 */
export const fixProductCategory = async (req, res) => {
    const { art_cod, action } = req.body;

    if (!art_cod || !action) {
        return res.status(400).json({
            success: false,
            message: 'Parámetros requeridos: art_cod, action'
        });
    }

    if (!['sync-to-woo', 'sync-from-woo'].includes(action)) {
        return res.status(400).json({
            success: false,
            message: 'action debe ser "sync-to-woo" o "sync-from-woo"'
        });
    }

    try {
        const pool = await poolPromise;

        if (action === 'sync-to-woo') {
            // Sincronizar desde sistema local a WooCommerce

            // 1. Obtener categorías del sistema local
            const localData = await pool.request()
                .input('art_cod', sql.VarChar(50), art_cod)
                .query(`
                    SELECT
                        a.art_woo_id,
                        isg.inv_sub_gru_woo_id,
                        isg.inv_sub_gru_parend_woo
                    FROM dbo.articulos a
                    JOIN dbo.inventario_subgrupo isg ON a.inv_sub_gru_cod = isg.inv_sub_gru_cod
                    WHERE a.art_cod = @art_cod
                `);

            if (localData.recordset.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Producto no encontrado en el sistema local'
                });
            }

            const { art_woo_id, inv_sub_gru_woo_id, inv_sub_gru_parend_woo } = localData.recordset[0];

            if (!art_woo_id) {
                return res.status(400).json({
                    success: false,
                    message: 'El producto no tiene art_woo_id. No está sincronizado con WooCommerce.'
                });
            }

            // 2. Actualizar en WooCommerce
            const categories = [];
            if (inv_sub_gru_parend_woo) categories.push({ id: parseInt(inv_sub_gru_parend_woo) });
            if (inv_sub_gru_woo_id) categories.push({ id: parseInt(inv_sub_gru_woo_id) });

            await wooCommerce.put(`products/${art_woo_id}`, {
                categories: categories
            });

            // 3. Actualizar ArticuloHook para reflejar el cambio
            await pool.request()
                .input('art_cod', sql.VarChar(50), art_cod)
                .query(`
                    UPDATE ArticuloHook
                    SET ArtHookCategoriaMatch = 1,
                        ArtHookCatFechaVerificacion = GETDATE()
                    WHERE ArtHookCod = @art_cod
                `);

            return res.json({
                success: true,
                message: 'Categorías actualizadas en WooCommerce',
                action: 'sync-to-woo',
                product: art_cod
            });

        } else if (action === 'sync-from-woo') {
            // Sincronizar desde WooCommerce al sistema local

            // 1. Obtener categorías de ArticuloHook
            const hookData = await pool.request()
                .input('art_cod', sql.VarChar(50), art_cod)
                .query(`
                    SELECT
                        ArtHookSubcatWooId,
                        ArtHookSubcatWooNombre
                    FROM ArticuloHook
                    WHERE ArtHookCod = @art_cod
                `);

            if (hookData.recordset.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Producto no encontrado en ArticuloHook'
                });
            }

            const { ArtHookSubcatWooId } = hookData.recordset[0];

            if (!ArtHookSubcatWooId) {
                return res.status(400).json({
                    success: false,
                    message: 'No hay subcategoría de WooCommerce para este producto'
                });
            }

            // 2. Mapear ID de WooCommerce a código del sistema local
            const mapping = await pool.request()
                .input('woo_id', sql.Int, ArtHookSubcatWooId)
                .query(`
                    SELECT inv_sub_gru_cod
                    FROM dbo.inventario_subgrupo
                    WHERE inv_sub_gru_woo_id = @woo_id
                `);

            if (mapping.recordset.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'No se encontró mapeo para la categoría de WooCommerce. Necesita configurarse manualmente.'
                });
            }

            const { inv_sub_gru_cod } = mapping.recordset[0];

            // 3. Actualizar en articulos
            await pool.request()
                .input('art_cod', sql.VarChar(50), art_cod)
                .input('inv_sub_gru_cod', sql.VarChar(20), inv_sub_gru_cod)
                .query(`
                    UPDATE dbo.articulos
                    SET inv_sub_gru_cod = @inv_sub_gru_cod
                    WHERE art_cod = @art_cod
                `);

            // 4. Actualizar ArticuloHook
            await pool.request()
                .input('art_cod', sql.VarChar(50), art_cod)
                .query(`
                    UPDATE ArticuloHook
                    SET ArtHookCategoriaMatch = 1,
                        ArtHookCatFechaVerificacion = GETDATE()
                    WHERE ArtHookCod = @art_cod
                `);

            return res.json({
                success: true,
                message: 'Categoría actualizada en el sistema local',
                action: 'sync-from-woo',
                product: art_cod,
                newCategory: inv_sub_gru_cod
            });
        }

    } catch (error) {
        console.error('Error al corregir categoría:', error);
        res.status(500).json({
            success: false,
            message: 'Error al corregir categoría',
            error: error.message
        });
    }
};
```

**Ruta:** `/routes/wooSyncRoutes.js`

```javascript
import { syncWooProducts, auditCategories, fixProductCategory } from '../controllers/wooSyncController.js';

router.post('/fix-category', fixProductCategory);
```

**Testing:**
```bash
# Sincronizar categoría DEL SISTEMA a WooCommerce
curl -X POST http://localhost:3000/api/woo/fix-category \
  -H "Content-Type: application/json" \
  -d '{"art_cod": "PROD123", "action": "sync-to-woo"}'

# Sincronizar categoría DESDE WooCommerce al sistema
curl -X POST http://localhost:3000/api/woo/fix-category \
  -H "Content-Type: application/json" \
  -d '{"art_cod": "PROD123", "action": "sync-from-woo"}'
```

### 6.5 Fase 5: Documentación y Capacitación (1 día)

**Entregables:**
1. Actualizar `CLAUDE.md` con nueva funcionalidad
2. Crear guía de usuario en `/documentacion/GUIA_AUDITORIA_CATEGORIAS.md`
3. Actualizar Postman collection con nuevos endpoints
4. Capacitar al equipo sobre el uso del sistema

---

## 7. CONSIDERACIONES TÉCNICAS Y RIESGOS

### 7.1 Manejo de Casos Edge

| Caso | Solución Propuesta |
|------|-------------------|
| **Producto sin categoría en sistema local** | Mostrar en auditoría con alerta especial. Requiere asignación manual. |
| **Producto con múltiples categorías en WooCommerce** | Guardar solo las dos primeras (padre e hija más relevantes). |
| **Categoría de WooCommerce no mapeada** | `fixProductCategory` con `sync-from-woo` devolverá error informativo. Requiere crear mapeo en `inventario_subgrupo`. |
| **Producto sin `art_woo_id`** | No se puede sincronizar a WooCommerce. Debe crearse primero en WooCommerce. |
| **Nombres similares pero no idénticos** | El sistema es case-insensitive para comparación. Si aún así difieren, se marca como discrepancia. |

### 7.2 Impacto en Performance

| Operación | Impacto | Mitigación |
|-----------|---------|------------|
| `syncWooProducts()` | +30% tiempo de ejecución (queries adicionales) | Optimizar con single query para categorías usando LEFT JOIN |
| `auditCategories` | Bajo (query simple en ArticuloHook) | Agregar índice en `ArtHookCategoriaMatch` |
| `fixProductCategory` | Medio (llamada API a WooCommerce) | Implementar retry logic y timeout |

**Optimización recomendada:**

```sql
-- Agregar índice para mejorar filtrado
CREATE INDEX IX_ArticuloHook_CategoriaMatch
ON dbo.ArticuloHook (ArtHookCategoriaMatch)
INCLUDE (ArtHookCod, ArtHooName);
```

### 7.3 Seguridad

- ✅ Endpoints requieren autenticación JWT
- ✅ Validación de parámetros en `fixProductCategory`
- ✅ Uso de queries parametrizadas (prevención de SQL injection)
- ⚠️ `fixProductCategory` modifica datos críticos → Requiere permisos de administrador
- ⚠️ Agregar logs de auditoría para cambios de categorías

**Implementar en `authMiddleware.js`:**

```javascript
export const requireAdminRole = (req, res, next) => {
    if (req.userRole !== 'admin') {
        return res.status(403).json({
            success: false,
            message: 'Requiere permisos de administrador'
        });
    }
    next();
};
```

**Aplicar en rutas:**

```javascript
router.post('/fix-category', verifyToken, requireAdminRole, fixProductCategory);
```

### 7.4 Monitoreo y Logging

Agregar logs detallados en Winston:

```javascript
import winston from 'winston';

// En syncWooProducts()
winston.info('Sincronización de categorías', {
    product: sku,
    catSys: catSysNombre,
    subcatSys: subcatSysNombre,
    catWoo: catWooNombre,
    subcatWoo: subcatWooNombre,
    match: categoriaMatch
});

// En fixProductCategory()
winston.warn('Corrección de categoría solicitada', {
    user: req.userId,
    product: art_cod,
    action: action,
    timestamp: new Date()
});
```

---

## 8. MÉTRICAS DE ÉXITO

### 8.1 KPIs Técnicos

- ✅ **100% de productos sincronizados** tienen valores en campos de categoría de ArticuloHook
- ✅ **< 5% de discrepancias** después de corrección masiva inicial
- ✅ **Tiempo de sincronización** no aumenta más del 30%
- ✅ **API de WooCommerce** responde en < 2s para actualizaciones de categorías

### 8.2 KPIs de Negocio

- ✅ **Reportes de ventas por categoría** son confiables
- ✅ **Reducción del 90%** en tiempo dedicado a correcciones manuales
- ✅ **Visibilidad completa** de productos mal categorizados
- ✅ **Proceso de corrección** < 1 minuto por producto

---

## 9. CRONOGRAMA ESTIMADO

| Fase | Duración | Dependencias |
|------|----------|--------------|
| Fase 1: Migración BD | 1-2 días | Aprobación de DBA |
| Fase 2: Modificar controlador | 2-3 días | Fase 1 completa |
| Fase 3: Endpoint auditoría | 1 día | Fase 2 completa |
| Fase 4: Endpoint corrección | 2-3 días | Fase 3 completa |
| Fase 5: Documentación | 1 día | Fase 4 completa |
| **Total** | **7-10 días hábiles** | Testing en paralelo |

---

## 10. CONCLUSIONES Y PRÓXIMOS PASOS

### 10.1 Resumen Ejecutivo

✅ **La propuesta de agregar campos a ArticuloHook es CORRECTA y RECOMENDADA.**

**Razones:**
1. Sigue el patrón arquitectónico existente
2. Bajo riesgo de implementación
3. Permite auditoría rápida y efectiva
4. Facilita correcciones automáticas
5. No afecta tablas críticas de producción

### 10.2 Enfoque Recomendado

**Implementar solución híbrida:**
1. ✅ **Fase 1 (Detección):** Agregar campos a ArticuloHook con metadata extendida
2. ✅ **Fase 2 (Auditoría):** Endpoint para consultar discrepancias
3. ✅ **Fase 3 (Corrección):** Endpoint para sincronizar en ambas direcciones
4. ⏳ **Fase 4 (Automatización):** Job nocturno que detecta y corrige automáticamente

### 10.3 Decisiones Pendientes

- ❓ **Dirección de sincronización por defecto:** ¿Sistema local → WooCommerce o viceversa?
- ❓ **Corrección automática vs manual:** ¿Permitir corrección en lote automática o requiere aprobación?
- ❓ **Frecuencia de sincronización:** ¿Diaria, semanal o bajo demanda?

### 10.4 Próximos Pasos Inmediatos

1. ✅ **Aprobación de stakeholders** sobre el enfoque propuesto
2. ✅ **Revisión de script SQL** con DBA
3. ✅ **Decisión sobre dirección de sincronización** (local o WooCommerce como fuente de verdad)
4. ✅ **Asignación de recursos** para implementación

---

## 11. REFERENCIAS

**Archivos relacionados:**
- `/controllers/wooSyncController.js` - Controlador actual de sincronización
- `/models/inventarioGrupoModel.js` - Modelo de categorías
- `/models/inventarioSubgrupoModel.js` - Modelo de subcategorías
- `/models/articulosModel.js` - Modelo de productos
- `/CLAUDE.md` - Documentación arquitectónica del proyecto

**Documentación WooCommerce:**
- [WooCommerce REST API - Products](https://woocommerce.github.io/woocommerce-rest-api-docs/#products)
- [WooCommerce REST API - Product Categories](https://woocommerce.github.io/woocommerce-rest-api-docs/#product-categories)

**Tickets relacionados (si aplica):**
- [Pendiente: crear ticket en sistema de gestión de proyectos]

---

**Fin del análisis**

*Este documento será actualizado conforme avance la implementación.*
