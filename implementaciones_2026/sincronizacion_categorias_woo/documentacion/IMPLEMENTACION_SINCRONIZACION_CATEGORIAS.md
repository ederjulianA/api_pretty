# Implementación: Sincronización de Categorías WooCommerce

**Fecha de implementación:** 2026-02-05
**Estado:** ✅ Implementado - Pendiente de pruebas
**Versión:** 1.0
**Documento de análisis:** [ANALISIS_SINCRONIZACION_CATEGORIAS_WOO.md](../analisis_2026/ANALISIS_SINCRONIZACION_CATEGORIAS_WOO.md)

---

## Resumen Ejecutivo

Se implementó un sistema de auditoría y corrección de categorías que permite detectar y resolver discrepancias entre la categorización de productos en el sistema local y WooCommerce.

**Problema resuelto:** Productos con categorías inconsistentes entre ambos sistemas, causando confusión en reportes y gestión de inventario.

**Solución:** Extensión de la tabla `ArticuloHook` para almacenar categorías de ambos sistemas y comparar automáticamente en cada sincronización.

---

## Cambios Implementados

### 1. Base de Datos

#### Tabla ArticuloHook - Nuevos Campos

Se agregaron **10 campos nuevos** a la tabla `ArticuloHook`:

```sql
-- Categorías del Sistema Local
ArtHookCatSysCod NVARCHAR(20) NULL              -- Código de grupo (inv_gru_cod)
ArtHookCatSysNombre NVARCHAR(100) NULL          -- Nombre de grupo
ArtHookSubcatSysCod NVARCHAR(20) NULL           -- Código de subgrupo (inv_sub_gru_cod)
ArtHookSubcatSysNombre NVARCHAR(100) NULL       -- Nombre de subgrupo

-- Categorías de WooCommerce
ArtHookCatWooId INT NULL                        -- ID de categoría padre en WooCommerce
ArtHookCatWooNombre NVARCHAR(100) NULL          -- Nombre de categoría padre
ArtHookSubcatWooId INT NULL                     -- ID de subcategoría en WooCommerce
ArtHookSubcatWooNombre NVARCHAR(100) NULL       -- Nombre de subcategoría

-- Metadata de sincronización
ArtHookCategoriaMatch BIT NULL                  -- 1 = Coinciden, 0 = Discrepancia, NULL = No verificado
ArtHookCatFechaVerificacion DATETIME NULL       -- Última verificación
```

#### Índice para Performance

```sql
CREATE NONCLUSTERED INDEX IX_ArticuloHook_CategoriaMatch
ON dbo.ArticuloHook (ArtHookCategoriaMatch)
INCLUDE (ArtHookCod, ArtHooName, ArtHookCatSysNombre, ArtHookSubcatSysNombre,
         ArtHookCatWooNombre, ArtHookSubcatWooNombre);
```

**Script de migración:** [`/implementaciones_2026/sql/02_alter_articulohook_categorias.sql`](./sql/02_alter_articulohook_categorias.sql)

**Script de validación:** [`/implementaciones_2026/sql/02_validar_migracion.sql`](./sql/02_validar_migracion.sql)

---

### 2. Backend - Controlador

**Archivo modificado:** [`/controllers/wooSyncController.js`](../controllers/wooSyncController.js)

#### 2.1 Función `syncWooProducts()` - Modificada

Se agregó lógica para:

1. **Extraer categorías de WooCommerce** del objeto `product.categories`
2. **Obtener categorías del sistema local** mediante JOIN con `inventario_grupo` e `inventario_subgrupo`
3. **Comparar categorías** (case-insensitive) y calcular `ArtHookCategoriaMatch`
4. **Almacenar en ArticuloHook** tanto en INSERT como en UPDATE

**Código agregado:**

```javascript
// Extraer categorías de WooCommerce
const { sku, name, stock_quantity, regular_price, meta_data, categories } = product;

// Obtener categorías del sistema local
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

// Procesar categorías de WooCommerce
// ... (ver código completo en el archivo)

// Calcular coincidencia
const categoriaMatch = (
    catSysNombre && catWooNombre &&
    catSysNombre.toLowerCase().trim() === catWooNombre.toLowerCase().trim() &&
    subcatSysNombre && subcatWooNombre &&
    subcatSysNombre.toLowerCase().trim() === subcatWooNombre.toLowerCase().trim()
) ? 1 : 0;
```

#### 2.2 Función `auditCategories()` - Nueva

**Endpoint:** `GET /api/woo/audit-categories`

**Parámetros:**
- `onlyMismatches` (query): `'true'` para mostrar solo discrepancias

**Respuesta:**
```json
{
  "success": true,
  "message": "Auditoría completada",
  "stats": {
    "total": 150,
    "coincidencias": 120,
    "discrepancias": 25,
    "sinVerificar": 5
  },
  "data": [
    {
      "sku": "PROD123",
      "nombre": "Labial Mate Rojo",
      "categoria_sistema": "Maquillaje",
      "subcategoria_sistema": "Labiales",
      "categoria_woocommerce": "Makeup",
      "subcategoria_woocommerce": "Labiales",
      "estado": "Discrepancia",
      "fecha_verificacion": "2026-02-05T10:30:00"
    }
  ]
}
```

#### 2.3 Función `fixProductCategory()` - Nueva

**Endpoint:** `POST /api/woo/fix-category`

**Body:**
```json
{
  "art_cod": "PROD123",
  "action": "sync-to-woo"  // o "sync-from-woo"
}
```

**Acciones disponibles:**

| Acción | Descripción | Recomendado |
|--------|-------------|-------------|
| `sync-to-woo` | Sincroniza categorías del **sistema local** a **WooCommerce** | ✅ SÍ (Sistema local es fuente de verdad) |
| `sync-from-woo` | Sincroniza categorías de **WooCommerce** al **sistema local** | ⚠️ NO (Solo casos excepcionales) |

**Respuesta exitosa:**
```json
{
  "success": true,
  "message": "Categorías actualizadas en WooCommerce desde el sistema local",
  "action": "sync-to-woo",
  "product": "PROD123",
  "categories": {
    "categoria": "Maquillaje",
    "subcategoria": "Labiales"
  }
}
```

**Errores posibles:**
- `400` - Parámetros faltantes o inválidos
- `404` - Producto no encontrado
- `400` - Producto sin `art_woo_id` (no sincronizado)
- `400` - Sin categorías mapeadas en `inventario_subgrupo`
- `500` - Error de servidor o API de WooCommerce

---

### 3. Rutas

**Archivo modificado:** [`/routes/wooSyncRoutes.js`](../routes/wooSyncRoutes.js)

Se agregaron las importaciones y rutas:

```javascript
import {
    syncWooProducts,
    auditCategories,      // NUEVO
    fixProductCategory    // NUEVO
} from '../controllers/wooSyncController.js';

router.get('/audit-categories', auditCategories);
router.post('/fix-category', fixProductCategory);
```

---

## Flujo de Uso

### Paso 1: Ejecutar Migración SQL

```bash
# Conectarse a SQL Server
sqlcmd -S localhost -U sa -P password -d artipla_system

# Ejecutar migración
:r /path/to/implementaciones_2026/sql/02_alter_articulohook_categorias.sql
GO

# Validar migración
:r /path/to/implementaciones_2026/sql/02_validar_migracion.sql
GO
```

**Salida esperada:**
```
✅ Tabla ArticuloHook existe.
Campos de categorías encontrados: 10/10
✅ Todos los campos existen.
✅ Índice IX_ArticuloHook_CategoriaMatch existe.
```

---

### Paso 2: Sincronizar Productos

```bash
# Sincronizar todos los productos de WooCommerce
curl -X POST http://localhost:3000/api/woo/sync \
  -H "Content-Type: application/json" \
  -H "x-access-token: YOUR_JWT_TOKEN"
```

**Resultado:**
- Se actualizan los campos de categorías en `ArticuloHook`
- Se calcula `ArtHookCategoriaMatch` para cada producto
- Se registra `ArtHookCatFechaVerificacion`

---

### Paso 3: Auditar Discrepancias

```bash
# Ver todos los productos
curl http://localhost:3000/api/woo/audit-categories \
  -H "x-access-token: YOUR_JWT_TOKEN"

# Ver solo productos con discrepancias
curl "http://localhost:3000/api/woo/audit-categories?onlyMismatches=true" \
  -H "x-access-token: YOUR_JWT_TOKEN"
```

**Análisis SQL directo:**

```sql
-- Contar discrepancias
SELECT
    COUNT(*) AS total_discrepancias
FROM ArticuloHook
WHERE ArtHookCategoriaMatch = 0;

-- Ver detalles de discrepancias
SELECT
    ArtHookCod AS SKU,
    ArtHooName AS Producto,
    ArtHookCatSysNombre AS [Categoría Sistema],
    ArtHookSubcatSysNombre AS [Subcategoría Sistema],
    ArtHookCatWooNombre AS [Categoría WooCommerce],
    ArtHookSubcatWooNombre AS [Subcategoría WooCommerce]
FROM ArticuloHook
WHERE ArtHookCategoriaMatch = 0
ORDER BY ArtHookCod;
```

---

### Paso 4: Corregir Productos

#### Opción A: Corrección Individual

```bash
# Corregir un producto específico
curl -X POST http://localhost:3000/api/woo/fix-category \
  -H "Content-Type: application/json" \
  -H "x-access-token: YOUR_JWT_TOKEN" \
  -d '{
    "art_cod": "PROD123",
    "action": "sync-to-woo"
  }'
```

#### Opción B: Corrección Masiva (Script)

```javascript
// Script Node.js para corregir múltiples productos
import axios from 'axios';

const API_URL = 'http://localhost:3000/api/woo';
const TOKEN = 'YOUR_JWT_TOKEN';

// Obtener productos con discrepancias
const response = await axios.get(`${API_URL}/audit-categories?onlyMismatches=true`, {
  headers: { 'x-access-token': TOKEN }
});

const productos = response.data.data;

console.log(`Se encontraron ${productos.length} productos con discrepancias`);

// Corregir cada uno
for (const producto of productos) {
  try {
    const result = await axios.post(`${API_URL}/fix-category`, {
      art_cod: producto.sku,
      action: 'sync-to-woo'
    }, {
      headers: { 'x-access-token': TOKEN }
    });

    console.log(`✅ ${producto.sku}: ${result.data.message}`);
  } catch (error) {
    console.error(`❌ ${producto.sku}: ${error.response?.data?.message || error.message}`);
  }

  // Esperar 500ms entre requests para no saturar la API de WooCommerce
  await new Promise(resolve => setTimeout(resolve, 500));
}
```

---

## Validación de Implementación

### Checklist de Pruebas

- [ ] **SQL**
  - [ ] Script de migración ejecutado sin errores
  - [ ] Índice creado correctamente
  - [ ] Campos visibles en `ArticuloHook`

- [ ] **Backend**
  - [ ] `syncWooProducts()` actualiza campos de categorías
  - [ ] `auditCategories()` retorna datos correctos
  - [ ] `fixProductCategory()` actualiza WooCommerce correctamente
  - [ ] Logs informativos en consola

- [ ] **API**
  - [ ] `POST /api/woo/sync` funciona
  - [ ] `GET /api/woo/audit-categories` retorna JSON
  - [ ] `POST /api/woo/fix-category` actualiza y retorna éxito

- [ ] **Datos**
  - [ ] `ArtHookCategoriaMatch` se calcula correctamente
  - [ ] Comparación case-insensitive funciona
  - [ ] Fecha de verificación se registra

---

## Queries SQL Útiles

### Ver estado de sincronización

```sql
SELECT
    COUNT(*) AS total,
    SUM(CASE WHEN ArtHookCategoriaMatch = 1 THEN 1 ELSE 0 END) AS coincidencias,
    SUM(CASE WHEN ArtHookCategoriaMatch = 0 THEN 1 ELSE 0 END) AS discrepancias,
    SUM(CASE WHEN ArtHookCategoriaMatch IS NULL THEN 1 ELSE 0 END) AS sin_verificar
FROM ArticuloHook;
```

### Productos sin categoría en sistema local

```sql
SELECT
    ArtHookCod,
    ArtHooName,
    ArtHookCatWooNombre,
    ArtHookSubcatWooNombre
FROM ArticuloHook
WHERE ArtHookCatSysNombre IS NULL
  AND ArtHookCatWooNombre IS NOT NULL;
```

### Productos sin categoría en WooCommerce

```sql
SELECT
    ArtHookCod,
    ArtHooName,
    ArtHookCatSysNombre,
    ArtHookSubcatSysNombre
FROM ArticuloHook
WHERE ArtHookCatWooNombre IS NULL
  AND ArtHookCatSysNombre IS NOT NULL;
```

### Top 10 categorías con más discrepancias

```sql
SELECT TOP 10
    ArtHookCatSysNombre AS categoria_sistema,
    COUNT(*) AS cantidad_discrepancias
FROM ArticuloHook
WHERE ArtHookCategoriaMatch = 0
GROUP BY ArtHookCatSysNombre
ORDER BY cantidad_discrepancias DESC;
```

---

## Mantenimiento y Monitoreo

### Frecuencia de Sincronización Recomendada

| Acción | Frecuencia | Justificación |
|--------|------------|---------------|
| `POST /api/woo/sync` | Diaria (nocturna) | Mantener datos actualizados sin impactar performance |
| `GET /api/woo/audit-categories` | Semanal (reporte) | Revisar discrepancias acumuladas |
| `POST /api/woo/fix-category` | Bajo demanda | Solo cuando se detectan discrepancias |

### Alertas Recomendadas

- **Alerta Crítica:** > 10% de productos con discrepancias
- **Alerta Warning:** Productos sin categoría en alguno de los sistemas
- **Alerta Info:** Sincronización completada exitosamente

### Logs a Monitorear

```javascript
// En syncWooProducts()
console.warn('Discrepancia de categorías detectada:', {
    sku,
    sistema: { categoria: catSysNombre, subcategoria: subcatSysNombre },
    woocommerce: { categoria: catWooNombre, subcategoria: subcatWooNombre }
});

// En fixProductCategory()
console.log('Sincronización Sistema Local → WooCommerce completada:', { art_cod });
console.warn('⚠️  Sincronización WooCommerce → Sistema Local (NO RECOMENDADO):', { art_cod });
```

---

## Rollback

Si necesitas revertir la implementación:

### 1. Eliminar índice

```sql
DROP INDEX IF EXISTS IX_ArticuloHook_CategoriaMatch ON dbo.ArticuloHook;
```

### 2. Eliminar columnas

```sql
ALTER TABLE dbo.ArticuloHook DROP COLUMN IF EXISTS
    ArtHookCatSysCod,
    ArtHookCatSysNombre,
    ArtHookSubcatSysCod,
    ArtHookSubcatSysNombre,
    ArtHookCatWooId,
    ArtHookCatWooNombre,
    ArtHookSubcatWooId,
    ArtHookSubcatWooNombre,
    ArtHookCategoriaMatch,
    ArtHookCatFechaVerificacion;
```

### 3. Revertir código

```bash
# Revertir al commit anterior a la implementación
git revert <commit-hash>
```

---

## Mejoras Futuras

### Fase 2 (Planificada)

- [ ] **Dashboard de auditoría** en frontend
  - Visualización gráfica de discrepancias
  - Filtros por categoría
  - Corrección en lote desde UI

- [ ] **Job automático de corrección**
  - Ejecutar `sync-to-woo` automáticamente para discrepancias
  - Notificaciones por email/Slack

- [ ] **Historial de cambios**
  - Tabla `CategoriaAuditoriaHistorial` para tracking de cambios
  - Auditoría de quién y cuándo corrigió cada producto

- [ ] **Integración con productos variables**
  - Sincronizar categorías de variaciones
  - Ver análisis en [`IMPLEMENTACION_PRODUCTOS_VARIABLES.md`](./IMPLEMENTACION_PRODUCTOS_VARIABLES.md)

---

## Soporte y Contacto

**Documentación relacionada:**
- [Análisis original](../analisis_2026/ANALISIS_SINCRONIZACION_CATEGORIAS_WOO.md)
- [CLAUDE.md](../CLAUDE.md) - Guía general del proyecto

**Para reportar problemas:**
- Revisar logs de Winston en `/logs`
- Verificar estado de API de WooCommerce
- Contactar al equipo de desarrollo

---

**Última actualización:** 2026-02-05
**Autor:** API Pretty Team
**Estado:** ✅ Implementado - Pendiente de pruebas en producción
