# Sincronización de Categorías con WooCommerce

Documentación completa de la sincronización bidireccional de categorías entre el sistema local y WooCommerce.

---

## 📋 Descripción General

El sistema mantiene las categorías sincronizadas automáticamente entre la base de datos local (`inventario_grupo`) y WooCommerce. Cada operación de crear o actualizar una categoría desencadena una sincronización automática con WooCommerce.

---

## 🔄 Flujo de Sincronización

### Al Crear una Categoría

```
1. Usuario hace POST /api/categorias
2. Sistema genera nuevo código local (inv_gru_cod)
3. Sistema crea categoría en WooCommerce
4. WooCommerce retorna ID (woo_id)
5. Sistema guarda categoría local con woo_id
6. Sistema retorna categoría creada con info de sincronización
```

### Al Actualizar una Categoría

```
1. Usuario hace PUT /api/categorias/:inv_gru_cod
2. Sistema busca categoría local (obtiene woo_id)
3. Si tiene woo_id → Actualiza en WooCommerce
4. Si NO tiene woo_id → Crea en WooCommerce
5. Sistema actualiza categoría local
6. Sistema retorna categoría actualizada con info de sincronización
```

---

## 🗄️ Estructura de Base de Datos

### Campo Existente

La tabla `inventario_grupo` ya cuenta con el campo `inv_gru_woo_id INT NULL` para almacenar el ID de WooCommerce.

**Verificación y optimización:**
```sql
-- Script para verificar y crear índice si no existe
-- Ubicación: EstructuraDatos/AlterTable_InventarioGrupo_WooID.sql

CREATE NONCLUSTERED INDEX IX_inventario_grupo_woo_id
ON dbo.inventario_grupo (inv_gru_woo_id)
WHERE inv_gru_woo_id IS NOT NULL;
```

### Estructura Completa

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `inv_gru_cod` | SMALLINT | Código único local (PK) |
| `inv_gru_nom` | VARCHAR(100) | Nombre de la categoría |
| `inv_gru_des` | VARCHAR(500) | Descripción |
| `inv_gru_woo_id` | INT | ID de la categoría en WooCommerce |

---

## 📡 API de WooCommerce

### Endpoint Utilizado

```
POST   /wp-json/wc/v3/products/categories     - Crear
PUT    /wp-json/wc/v3/products/categories/:id - Actualizar
GET    /wp-json/wc/v3/products/categories/:id - Obtener
DELETE /wp-json/wc/v3/products/categories/:id - Eliminar
```

### Datos Enviados a WooCommerce

```json
{
  "name": "Maquillaje",
  "description": "Productos de maquillaje y cosméticos",
  "slug": "maquillaje-5",
  "meta_data": [
    {
      "key": "_local_category_code",
      "value": "5"
    }
  ]
}
```

**Notas:**
- `slug` se genera automáticamente: `{nombre-normalizado}-{codigo-local}`
- `meta_data._local_category_code` permite buscar categorías por código local
- La normalización del slug elimina acentos y caracteres especiales

---

## 🔧 Funciones de Sincronización

### Ubicación
`utils/wooCategoriasSync.js`

### Funciones Disponibles

#### 1. `createCategoryInWoo(categoryData)`

Crea una categoría en WooCommerce.

```javascript
const result = await createCategoryInWoo({
  inv_gru_cod: 5,
  inv_gru_nom: "Maquillaje",
  inv_gru_des: "Productos de maquillaje"
});

// Retorna:
// {
//   success: true,
//   woo_id: 42,
//   woo_slug: "maquillaje-5",
//   woo_data: { ... }
// }
```

#### 2. `updateCategoryInWoo(woo_id, categoryData)`

Actualiza una categoría existente en WooCommerce.

```javascript
const result = await updateCategoryInWoo(42, {
  inv_gru_nom: "Maquillaje Premium",
  inv_gru_des: "Productos de maquillaje de alta gama",
  inv_gru_cod: 5
});

// Retorna:
// {
//   success: true,
//   woo_data: { ... }
// }
```

#### 3. `findCategoryInWooByLocalCode(inv_gru_cod)`

Busca una categoría en WooCommerce por código local.

```javascript
const category = await findCategoryInWooByLocalCode(5);

// Retorna categoría completa de WooCommerce o null
```

#### 4. `syncCategoryWithWoo(categoryData)`

Sincronización inteligente: crea si no existe, actualiza si existe.

```javascript
const result = await syncCategoryWithWoo({
  inv_gru_cod: 5,
  inv_gru_nom: "Maquillaje",
  inv_gru_des: "...",
  woo_id: 42 // Opcional
});

// Retorna:
// {
//   success: true,
//   action: 'updated', // o 'created'
//   woo_id: 42,
//   woo_data: { ... }
// }
```

---

## 📝 Uso en Endpoints

### Crear Categoría

**Request:**
```bash
POST /api/categorias
Content-Type: application/json
x-access-token: YOUR_TOKEN

{
  "inv_gru_nom": "Accesorios",
  "inv_gru_des": "Accesorios de belleza"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Categoría creada exitosamente",
  "data": {
    "inv_gru_cod": 15,
    "inv_gru_nom": "Accesorios",
    "inv_gru_des": "Accesorios de belleza",
    "inv_gru_woo_id": 52,
    "woo_sync": {
      "synced": true,
      "woo_id": 52,
      "error": null
    }
  }
}
```

### Actualizar Categoría

**Request:**
```bash
PUT /api/categorias/15
Content-Type: application/json
x-access-token: YOUR_TOKEN

{
  "inv_gru_nom": "Accesorios Premium"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Categoría actualizada exitosamente",
  "data": {
    "inv_gru_cod": 15,
    "inv_gru_nom": "Accesorios Premium",
    "inv_gru_des": "Accesorios de belleza",
    "inv_gru_woo_id": 52,
    "woo_sync": {
      "synced": true,
      "woo_id": 52,
      "error": null
    }
  }
}
```

---

## ⚙️ Configuración

### Variables de Entorno Requeridas

Asegúrate de tener estas variables en tu `.env`:

```env
WC_URL=https://tu-tienda.com
WC_CONSUMER_KEY=ck_xxxxxxxxxxxxxxxxxxxxx
WC_CONSUMER_SECRET=cs_xxxxxxxxxxxxxxxxxxxxx
```

### Permisos en WooCommerce

El API key de WooCommerce debe tener permisos de **lectura/escritura** para:
- Products
- Product categories

---

## 🚨 Manejo de Errores

### Si WooCommerce no está disponible

La sincronización NO bloqueará la creación/actualización local:

```json
{
  "success": true,
  "message": "Categoría creada exitosamente",
  "data": {
    "inv_gru_cod": 15,
    "inv_gru_nom": "Accesorios",
    "inv_gru_des": "Accesorios de belleza",
    "inv_gru_woo_id": null,
    "woo_sync": {
      "synced": false,
      "woo_id": null,
      "error": "Connection timeout"
    }
  }
}
```

**Nota:** La categoría se crea correctamente en la BD local. La sincronización puede intentarse posteriormente.

### Logs de Sincronización

El sistema registra todos los intentos de sincronización en la consola:

```
✓ Categoría creada en WooCommerce - ID: 52, Nombre: Accesorios
✓ Categoría actualizada en WooCommerce - ID: 52, Nombre: Accesorios Premium
```

O en caso de error:

```
Error creando categoría en WooCommerce: Invalid API credentials
Error actualizando categoría en WooCommerce: Category not found
```

---

## 🔄 Sincronización Manual

### Endpoint para Re-sincronizar

Puedes crear un endpoint adicional para re-sincronizar categorías que fallaron:

```bash
POST /api/categorias/:inv_gru_cod/sync-woo
```

**Implementación sugerida:**

```javascript
// En controller
const syncCategoryManually = async (req, res) => {
  try {
    const { inv_gru_cod } = req.params;

    const category = await inventarioGrupoModel.getCategoryByCode(inv_gru_cod);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Categoría no encontrada'
      });
    }

    const wooResult = await wooSync.syncCategoryWithWoo({
      inv_gru_cod: category.inv_gru_cod,
      inv_gru_nom: category.inv_gru_nom,
      inv_gru_des: category.inv_gru_des,
      woo_id: category.inv_gru_woo_id
    });

    // Actualizar woo_id si se creó
    if (wooResult.success && wooResult.woo_id && !category.inv_gru_woo_id) {
      await inventarioGrupoModel.updateCategory(inv_gru_cod, {
        inv_gru_woo_id: wooResult.woo_id,
        syncWoo: false // No volver a sincronizar
      });
    }

    res.json({
      success: true,
      message: 'Sincronización manual completada',
      data: wooResult
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error en sincronización manual',
      error: error.message
    });
  }
};
```

---

## 📊 Monitoreo de Sincronización

### Consulta SQL para Verificar Estado

```sql
SELECT
  inv_gru_cod AS codigo_local,
  inv_gru_nom AS nombre,
  inv_gru_woo_id AS woo_id,
  CASE
    WHEN inv_gru_woo_id IS NULL THEN 'NO SINCRONIZADO'
    ELSE 'SINCRONIZADO'
  END AS estado_sync
FROM dbo.inventario_grupo
ORDER BY inv_gru_cod;
```

### Categorías No Sincronizadas

```sql
SELECT
  inv_gru_cod,
  inv_gru_nom,
  inv_gru_des
FROM dbo.inventario_grupo
WHERE inv_gru_woo_id IS NULL;
```

---

## 🎯 Mejores Prácticas

1. **Siempre sincronizar:** Mantén la sincronización activada (`syncWoo: true`) por defecto

2. **Verificar respuesta:** Revisa el campo `woo_sync` en la respuesta para confirmar sincronización

3. **No depender de WooCommerce:** El sistema debe funcionar aunque WooCommerce falle

4. **Logs:** Monitorea los logs para detectar problemas de sincronización

5. **Re-sincronización:** Implementa un job periódico para re-sincronizar categorías fallidas

6. **Testing:** Prueba con WooCommerce en modo sandbox antes de producción

---

## 🛠️ Solución de Problemas

### Error: "Invalid API credentials"

**Causa:** Las credenciales de WooCommerce son incorrectas.

**Solución:**
1. Verifica `WC_CONSUMER_KEY` y `WC_CONSUMER_SECRET` en `.env`
2. Genera nuevas credenciales en WooCommerce → Settings → Advanced → REST API

### Error: "Category not found"

**Causa:** La categoría fue eliminada en WooCommerce pero existe localmente.

**Solución:**
```sql
-- Limpiar woo_id de categoría huérfana
UPDATE dbo.inventario_grupo
SET inv_gru_woo_id = NULL
WHERE inv_gru_cod = 15;
```

Luego actualiza la categoría para re-sincronizar.

### Error: "Connection timeout"

**Causa:** WooCommerce no responde o hay problemas de red.

**Solución:**
1. Verifica que `WC_URL` sea correcto
2. Confirma que el servidor tiene acceso a Internet
3. Revisa firewall y DNS

---

## 📚 Recursos Adicionales

- [WooCommerce REST API Documentation](https://woocommerce.github.io/woocommerce-rest-api-docs/)
- [Product Categories Endpoint](https://woocommerce.github.io/woocommerce-rest-api-docs/#product-categories)
- [Authentication](https://woocommerce.github.io/woocommerce-rest-api-docs/#authentication)

---

**Última actualización:** 2026-02-09
**Versión:** 1.0
