# Resumen: Gestión de Categorías con Sincronización WooCommerce

## ✅ Estado Actual

La implementación de gestión de categorías con sincronización automática a WooCommerce está **100% completa y lista para usar**.

---

## 📂 Archivos Implementados

### Backend - API REST

1. **[models/inventarioGrupoModel.js](../models/inventarioGrupoModel.js)**
   - ✅ CRUD completo de categorías
   - ✅ Paginación y filtros
   - ✅ Sincronización automática con WooCommerce
   - ✅ Manejo de transacciones SQL

2. **[controllers/inventarioGrupoController.js](../controllers/inventarioGrupoController.js)**
   - ✅ 5 endpoints implementados
   - ✅ Validaciones completas
   - ✅ Manejo de errores robusto

3. **[routes/inventarioGrupoRoutes.js](../routes/inventarioGrupoRoutes.js)**
   - ✅ Rutas protegidas con autenticación
   - ✅ Documentación inline

### Sincronización WooCommerce

4. **[utils/wooCategoriasSync.js](../utils/wooCategoriasSync.js)** ⭐ NUEVO
   - ✅ 7 funciones de sincronización
   - ✅ Creación automática en WooCommerce
   - ✅ Actualización automática en WooCommerce
   - ✅ Búsqueda por código local
   - ✅ Generación de slugs únicos
   - ✅ Tolerancia a fallos

### Base de Datos

5. **Campo existente:** `inv_gru_woo_id INT NULL`
   - ✅ Ya existe en tabla `inventario_grupo`
   - ✅ Almacena ID de categoría en WooCommerce

6. **[EstructuraDatos/AlterTable_InventarioGrupo_WooID.sql](../EstructuraDatos/AlterTable_InventarioGrupo_WooID.sql)**
   - ✅ Script de verificación
   - ✅ Crea índice optimizado (si no existe)

### Documentación

7. **[documentacion/API_CATEGORIAS.md](./API_CATEGORIAS.md)**
   - ✅ Documentación completa de endpoints
   - ✅ Ejemplos de uso con cURL
   - ✅ Códigos de error

8. **[documentacion/SINCRONIZACION_CATEGORIAS_WOO.md](./SINCRONIZACION_CATEGORIAS_WOO.md)**
   - ✅ Guía completa de sincronización
   - ✅ Troubleshooting
   - ✅ Ejemplos de integración

---

## 🎯 Endpoints Disponibles

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/categorias` | Listar categorías (paginado, filtros) |
| GET | `/api/categorias/:inv_gru_cod` | Obtener categoría específica |
| POST | `/api/categorias` | Crear categoría + WooCommerce |
| PUT | `/api/categorias/:inv_gru_cod` | Actualizar categoría + WooCommerce |
| GET | `/api/categorias/:inv_gru_cod/subcategorias/exists` | Verificar subcategorías |

**Nota:** Todos requieren autenticación con token JWT en header `x-access-token`.

---

## 🔄 Sincronización Automática

### ¿Cuándo se sincroniza?

✅ **Al crear categoría (POST):**
```
Sistema local → WooCommerce → Guarda woo_id
```

✅ **Al actualizar categoría (PUT):**
```
Sistema local → WooCommerce (usando woo_id) → Actualiza ambos
```

### ¿Qué se envía a WooCommerce?

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

---

## 📊 Estructura de Datos

### Tabla: `inventario_grupo`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `inv_gru_cod` | SMALLINT | PK - Código local (auto-generado) |
| `inv_gru_nom` | VARCHAR(100) | Nombre de categoría |
| `inv_gru_des` | VARCHAR(500) | Descripción |
| `inv_gru_woo_id` | INT | **ID en WooCommerce** (nullable) |

### Respuesta de API

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

---

## ⚙️ Configuración Requerida

### Variables de Entorno

Asegúrate de tener en `.env`:

```env
WC_URL=https://tu-tienda.com
WC_CONSUMER_KEY=ck_xxxxxxxxxxxxxxxxxxxxx
WC_CONSUMER_SECRET=cs_xxxxxxxxxxxxxxxxxxxxx
```

### Permisos en WooCommerce

El API key debe tener permisos de **lectura/escritura** para:
- ✅ Products
- ✅ Product categories

---

## 🚀 Cómo Usar

### 1. Crear Categoría

```bash
POST /api/categorias
Content-Type: application/json
x-access-token: YOUR_JWT_TOKEN

{
  "inv_gru_nom": "Accesorios",
  "inv_gru_des": "Accesorios de belleza y cuidado personal"
}
```

**Resultado:**
- ✅ Categoría creada en BD local (código auto-generado)
- ✅ Categoría creada en WooCommerce (slug único)
- ✅ `woo_id` guardado en BD local
- ✅ Retorna información completa con estado de sincronización

### 2. Actualizar Categoría

```bash
PUT /api/categorias/15
Content-Type: application/json
x-access-token: YOUR_JWT_TOKEN

{
  "inv_gru_nom": "Accesorios Premium"
}
```

**Resultado:**
- ✅ Categoría actualizada en BD local
- ✅ Categoría actualizada en WooCommerce (usando `woo_id`)
- ✅ Si no tenía `woo_id`, se crea en WooCommerce
- ✅ Retorna información con estado de sincronización

### 3. Listar Categorías

```bash
GET /api/categorias?page=1&limit=10&inv_gru_nom=Maquillaje
x-access-token: YOUR_JWT_TOKEN
```

**Resultado:**
- ✅ Lista paginada de categorías
- ✅ Incluye `inv_gru_woo_id` en cada registro
- ✅ Metadata de paginación completa

---

## 🔍 Verificación de Sincronización

### SQL: Ver estado de sincronización

```sql
SELECT
  inv_gru_cod AS codigo_local,
  inv_gru_nom AS nombre,
  inv_gru_woo_id AS woo_id,
  CASE
    WHEN inv_gru_woo_id IS NULL THEN '❌ NO SINCRONIZADO'
    ELSE '✅ SINCRONIZADO'
  END AS estado
FROM dbo.inventario_grupo
ORDER BY inv_gru_cod;
```

### SQL: Categorías pendientes de sincronización

```sql
SELECT
  inv_gru_cod,
  inv_gru_nom,
  inv_gru_des
FROM dbo.inventario_grupo
WHERE inv_gru_woo_id IS NULL;
```

---

## 🚨 Manejo de Errores

### Si WooCommerce falla

La sincronización **NO bloquea** la operación local:

```json
{
  "success": true,
  "message": "Categoría creada exitosamente",
  "data": {
    "inv_gru_cod": 15,
    "inv_gru_nom": "Accesorios",
    "inv_gru_woo_id": null,
    "woo_sync": {
      "synced": false,
      "woo_id": null,
      "error": "Connection timeout"
    }
  }
}
```

**Acción:** La categoría queda creada localmente. Puedes re-sincronizar después actualizándola.

### Logs de Sincronización

El sistema registra en consola:

```
✓ Categoría creada en WooCommerce - ID: 52, Nombre: Accesorios
✓ Categoría actualizada en WooCommerce - ID: 52, Nombre: Accesorios Premium
```

O errores:

```
Error creando categoría en WooCommerce: Invalid API credentials
Error actualizando categoría en WooCommerce: Category not found
```

---

## 📋 Checklist de Implementación

### Listo para Usar ✅

- [x] Modelo de datos implementado
- [x] Controladores implementados
- [x] Rutas configuradas
- [x] Autenticación integrada
- [x] Sincronización WooCommerce implementada
- [x] Campo `inv_gru_woo_id` existe en BD
- [x] Validaciones completas
- [x] Manejo de errores robusto
- [x] Documentación completa

### Tareas Opcionales

- [ ] Ejecutar script de índice (opcional - optimización)
- [ ] Crear endpoint de re-sincronización manual
- [ ] Implementar job para sincronizar categorías pendientes
- [ ] Implementar lo mismo para subcategorías

---

## 🎯 Próximos Pasos Sugeridos

### 1. Testing Inmediato

```bash
# 1. Autenticarse
POST /api/auth/login
{ "usu_cod": "admin", "usu_pass": "..." }

# 2. Crear categoría de prueba
POST /api/categorias
{ "inv_gru_nom": "Prueba Sync", "inv_gru_des": "Categoría de prueba" }

# 3. Verificar en WooCommerce
# (Revisar que aparezca en Productos → Categorías)

# 4. Actualizar categoría
PUT /api/categorias/{codigo}
{ "inv_gru_nom": "Prueba Sync Actualizada" }

# 5. Verificar actualización en WooCommerce
```

### 2. Optimización (Opcional)

```sql
-- Ejecutar script de índice
-- EstructuraDatos/AlterTable_InventarioGrupo_WooID.sql
```

### 3. Replicar para Subcategorías

Aplicar el mismo patrón para `inventario_subgrupo`:
- Agregar campo `inv_sub_gru_woo_id`
- Crear `wooSubcategoriasSync.js`
- Actualizar model y controller

---

## 📚 Referencias

- **Documentación API:** [API_CATEGORIAS.md](./API_CATEGORIAS.md)
- **Sincronización WooCommerce:** [SINCRONIZACION_CATEGORIAS_WOO.md](./SINCRONIZACION_CATEGORIAS_WOO.md)
- **WooCommerce API:** [Products Categories Endpoint](https://woocommerce.github.io/woocommerce-rest-api-docs/#product-categories)

---

**Última actualización:** 2026-02-09
**Estado:** ✅ Producción Ready
**Versión:** 1.0
