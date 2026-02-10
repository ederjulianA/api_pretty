# API de Subcategorías - Documentación

Documentación completa de los endpoints para gestión de subcategorías con sincronización WooCommerce.

---

## 📋 Tabla de Contenidos

1. [Autenticación](#autenticación)
2. [Endpoints Disponibles](#endpoints-disponibles)
3. [Ejemplos de Uso](#ejemplos-de-uso)
4. [Códigos de Error](#códigos-de-error)
5. [Sincronización WooCommerce](#sincronización-woocommerce)

---

## 🔐 Autenticación

Todos los endpoints (excepto `/old`) requieren autenticación mediante token JWT en el header:

```http
x-access-token: YOUR_JWT_TOKEN
```

---

## 📡 Endpoints Disponibles

### 1. Listar Subcategorías con Paginación

Obtiene todas las subcategorías con soporte para paginación y filtros múltiples.

**Endpoint:** `GET /api/subcategorias`

**Query Parameters:**

| Parámetro | Tipo | Requerido | Default | Descripción |
|-----------|------|-----------|---------|-------------|
| `page` | Integer | No | 1 | Número de página |
| `limit` | Integer | No | 10 | Registros por página |
| `inv_gru_cod` | Integer | No | - | Filtrar por categoría padre |
| `inv_sub_gru_cod` | Integer | No | - | Filtrar por código de subcategoría |
| `inv_sub_gru_nom` | String | No | - | Filtrar por nombre (búsqueda parcial LIKE) |

**Response 200 OK:**

```json
{
  "success": true,
  "message": "Subcategorías obtenidas exitosamente",
  "data": [
    {
      "inv_sub_gru_cod": 1,
      "inv_sub_gru_nom": "Labiales",
      "inv_sub_gru_des": "Labiales de larga duración",
      "inv_gru_cod": 5,
      "categoria_nombre": "Maquillaje",
      "inv_sub_gru_woo_id": 42,
      "categoria_woo_id": 38
    },
    {
      "inv_sub_gru_cod": 2,
      "inv_sub_gru_nom": "Bases",
      "inv_sub_gru_des": "Bases y correctores",
      "inv_gru_cod": 5,
      "categoria_nombre": "Maquillaje",
      "inv_sub_gru_woo_id": 43,
      "categoria_woo_id": 38
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "totalRecords": 48,
    "limit": 10,
    "hasNextPage": true,
    "hasPreviousPage": false
  }
}
```

---

### 2. Obtener Subcategoría por Código

Obtiene los datos completos de una subcategoría específica incluyendo información de su categoría padre.

**Endpoint:** `GET /api/subcategorias/:inv_sub_gru_cod`

**Path Parameters:**

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `inv_sub_gru_cod` | Integer | Código de la subcategoría |

**Response 200 OK:**

```json
{
  "success": true,
  "message": "Subcategoría obtenida exitosamente",
  "data": {
    "inv_sub_gru_cod": 1,
    "inv_sub_gru_nom": "Labiales",
    "inv_sub_gru_des": "Labiales de larga duración",
    "inv_gru_cod": 5,
    "categoria_nombre": "Maquillaje",
    "inv_sub_gru_woo_id": 42,
    "categoria_woo_id": 38
  }
}
```

**Response 404 Not Found:**

```json
{
  "success": false,
  "message": "Subcategoría no encontrada"
}
```

---

### 3. Crear Nueva Subcategoría

Crea una nueva subcategoría y automáticamente la sincroniza con WooCommerce.

**Endpoint:** `POST /api/subcategorias`

**Request Body:**

| Campo | Tipo | Requerido | Max Length | Descripción |
|-------|------|-----------|------------|-------------|
| `inv_sub_gru_nom` | String | Sí | 100 | Nombre de la subcategoría |
| `inv_sub_gru_des` | String | No | 500 | Descripción de la subcategoría |
| `inv_gru_cod` | Integer | Sí | - | Código de categoría padre (debe existir) |
| `syncWoo` | Boolean | No | - | Sincronizar con WooCommerce (default: true) |

**Request Example:**

```json
{
  "inv_sub_gru_nom": "Máscaras de Pestañas",
  "inv_sub_gru_des": "Máscaras de pestañas resistentes al agua",
  "inv_gru_cod": 5,
  "syncWoo": true
}
```

**Response 201 Created:**

```json
{
  "success": true,
  "message": "Subcategoría creada exitosamente",
  "data": {
    "inv_sub_gru_cod": 15,
    "inv_sub_gru_nom": "Máscaras de Pestañas",
    "inv_sub_gru_des": "Máscaras de pestañas resistentes al agua",
    "inv_gru_cod": 5,
    "categoria_nombre": "Maquillaje",
    "inv_sub_gru_woo_id": 55,
    "categoria_woo_id": 38,
    "woo_sync": {
      "synced": true,
      "woo_id": 55,
      "error": null
    }
  }
}
```

**Validaciones:**

- `inv_sub_gru_nom` es requerido y no puede estar vacío
- `inv_sub_gru_nom` no puede exceder 100 caracteres
- `inv_sub_gru_des` no puede exceder 500 caracteres
- `inv_gru_cod` es requerido y la categoría padre debe existir

**Response 400 Bad Request:**

```json
{
  "success": false,
  "message": "El nombre de la subcategoría es requerido"
}
```

**Response 404 Not Found:**

```json
{
  "success": false,
  "message": "Categoría padre no encontrada"
}
```

---

### 4. Actualizar Subcategoría

Actualiza una subcategoría existente y sincroniza los cambios con WooCommerce.

**Endpoint:** `PUT /api/subcategorias/:inv_sub_gru_cod`

**Path Parameters:**

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `inv_sub_gru_cod` | Integer | Código de la subcategoría a actualizar |

**Request Body:**

| Campo | Tipo | Requerido | Max Length | Descripción |
|-------|------|-----------|------------|-------------|
| `inv_sub_gru_nom` | String | No* | 100 | Nuevo nombre de la subcategoría |
| `inv_sub_gru_des` | String | No* | 500 | Nueva descripción |
| `inv_gru_cod` | Integer | No* | - | Nuevo código de categoría padre |
| `syncWoo` | Boolean | No | - | Sincronizar con WooCommerce (default: true) |

*Al menos uno de estos campos debe ser proporcionado.

**Request Example:**

```json
{
  "inv_sub_gru_nom": "Máscaras de Pestañas Premium",
  "inv_sub_gru_des": "Máscaras de pestañas de alta gama resistentes al agua",
  "syncWoo": true
}
```

**Response 200 OK:**

```json
{
  "success": true,
  "message": "Subcategoría actualizada exitosamente",
  "data": {
    "inv_sub_gru_cod": 15,
    "inv_sub_gru_nom": "Máscaras de Pestañas Premium",
    "inv_sub_gru_des": "Máscaras de pestañas de alta gama resistentes al agua",
    "inv_gru_cod": 5,
    "categoria_nombre": "Maquillaje",
    "inv_sub_gru_woo_id": 55,
    "categoria_woo_id": 38,
    "woo_sync": {
      "synced": true,
      "woo_id": 55,
      "error": null
    }
  }
}
```

**Response 400 Bad Request:**

```json
{
  "success": false,
  "message": "Debe proporcionar al menos un campo para actualizar"
}
```

**Response 404 Not Found:**

```json
{
  "success": false,
  "message": "Subcategoría no encontrada"
}
```

---

### 5. Verificar Productos Asociados

Verifica si una subcategoría tiene productos asociados (útil antes de eliminar).

**Endpoint:** `GET /api/subcategorias/:inv_sub_gru_cod/productos/exists`

**Path Parameters:**

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `inv_sub_gru_cod` | Integer | Código de la subcategoría |

**Response 200 OK:**

```json
{
  "success": true,
  "message": "Verificación completada",
  "data": {
    "inv_sub_gru_cod": 15,
    "hasProducts": true
  }
}
```

---

### 6. Listar Subcategorías (Legacy)

Endpoint heredado para compatibilidad con código existente. **No requiere autenticación.**

**Endpoint:** `GET /api/subcategorias/old`

**Query Parameters:**

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `inv_gru_cod` | Integer | No | Filtrar por categoría padre |

**Response 200 OK:**

```json
{
  "success": true,
  "subcategorias": [
    {
      "inv_sub_gru_cod": 1,
      "inv_sub_gru_nom": "Labiales",
      "inv_sub_gru_des": "Labiales de larga duración",
      "inv_gru_cod": 5,
      "categoria_nombre": "Maquillaje",
      "inv_sub_gru_woo_id": 42,
      "categoria_woo_id": 38
    }
  ]
}
```

---

## 🔧 Ejemplos de Uso

### Ejemplo 1: Listar Subcategorías de Maquillaje (Paginado)

```bash
curl -X GET "http://localhost:3000/api/subcategorias?inv_gru_cod=5&page=1&limit=20" \
  -H "x-access-token: YOUR_JWT_TOKEN"
```

### Ejemplo 2: Buscar Subcategorías por Nombre

```bash
curl -X GET "http://localhost:3000/api/subcategorias?inv_sub_gru_nom=labial&page=1&limit=10" \
  -H "x-access-token: YOUR_JWT_TOKEN"
```

### Ejemplo 3: Crear Subcategoría

```bash
curl -X POST "http://localhost:3000/api/subcategorias" \
  -H "Content-Type: application/json" \
  -H "x-access-token: YOUR_JWT_TOKEN" \
  -d '{
    "inv_sub_gru_nom": "Delineadores",
    "inv_sub_gru_des": "Delineadores de ojos y labios",
    "inv_gru_cod": 5
  }'
```

### Ejemplo 4: Actualizar Subcategoría

```bash
curl -X PUT "http://localhost:3000/api/subcategorias/15" \
  -H "Content-Type: application/json" \
  -H "x-access-token: YOUR_JWT_TOKEN" \
  -d '{
    "inv_sub_gru_nom": "Delineadores Premium",
    "inv_sub_gru_des": "Delineadores de larga duración"
  }'
```

### Ejemplo 5: Cambiar Categoría Padre de Subcategoría

```bash
curl -X PUT "http://localhost:3000/api/subcategorias/15" \
  -H "Content-Type: application/json" \
  -H "x-access-token: YOUR_JWT_TOKEN" \
  -d '{
    "inv_gru_cod": 8
  }'
```

---

## 🚨 Códigos de Error

### 400 Bad Request

**Casos:**
- Nombre de subcategoría vacío o no proporcionado
- Nombre excede 100 caracteres
- Descripción excede 500 caracteres
- Código de categoría padre no proporcionado
- No se proporcionó ningún campo para actualizar

**Ejemplo:**
```json
{
  "success": false,
  "message": "El nombre de la subcategoría no puede exceder 100 caracteres"
}
```

### 404 Not Found

**Casos:**
- Subcategoría no encontrada
- Categoría padre no encontrada

**Ejemplo:**
```json
{
  "success": false,
  "message": "Categoría padre no encontrada"
}
```

### 401 Unauthorized

**Casos:**
- Token JWT no proporcionado
- Token JWT inválido o expirado

**Ejemplo:**
```json
{
  "success": false,
  "message": "Token no proporcionado"
}
```

### 500 Internal Server Error

**Casos:**
- Error en base de datos
- Error en sincronización WooCommerce (no bloquea operación local)
- Error inesperado del servidor

**Ejemplo:**
```json
{
  "success": false,
  "message": "Error al crear subcategoría",
  "error": "Connection timeout"
}
```

---

## 🔄 Sincronización WooCommerce

### Flujo de Sincronización

#### Al Crear Subcategoría:

```
1. Usuario → POST /api/subcategorias
2. Sistema valida datos
3. Sistema genera nuevo código (inv_sub_gru_cod)
4. Sistema verifica que categoría padre existe
5. Sistema crea subcategoría en WooCommerce
6. WooCommerce retorna ID (woo_id)
7. Sistema guarda subcategoría local con woo_id
8. Sistema retorna subcategoría creada + info sync
```

#### Al Actualizar Subcategoría:

```
1. Usuario → PUT /api/subcategorias/:id
2. Sistema verifica que subcategoría existe
3. Si cambia inv_gru_cod → verifica nueva categoría padre
4. Si tiene woo_id → actualiza en WooCommerce
5. Si NO tiene woo_id → crea en WooCommerce
6. Sistema actualiza subcategoría local
7. Sistema retorna subcategoría actualizada + info sync
```

### Respuesta de Sincronización

Todas las operaciones de creación y actualización incluyen un objeto `woo_sync`:

```json
{
  "woo_sync": {
    "synced": true,        // Indica si la sincronización fue exitosa
    "woo_id": 55,          // ID de la subcategoría en WooCommerce
    "error": null          // Mensaje de error si falló (o null si exitoso)
  }
}
```

### Tolerancia a Fallos

Si WooCommerce no está disponible o falla la sincronización:

- ✅ La subcategoría **SÍ se crea/actualiza** en la base de datos local
- ⚠️ El campo `inv_sub_gru_woo_id` queda en `NULL`
- 📝 El campo `woo_sync.synced` será `false`
- 📝 El campo `woo_sync.error` contendrá el mensaje de error
- 🔄 Se puede re-sincronizar posteriormente

**Ejemplo de respuesta con fallo de sincronización:**

```json
{
  "success": true,
  "message": "Subcategoría creada exitosamente",
  "data": {
    "inv_sub_gru_cod": 15,
    "inv_sub_gru_nom": "Delineadores",
    "inv_sub_gru_des": "Delineadores de ojos",
    "inv_gru_cod": 5,
    "categoria_nombre": "Maquillaje",
    "inv_sub_gru_woo_id": null,
    "categoria_woo_id": 38,
    "woo_sync": {
      "synced": false,
      "woo_id": null,
      "error": "Connection timeout"
    }
  }
}
```

### Relación Jerárquica en WooCommerce

Las subcategorías se crean en WooCommerce como categorías hijas usando el campo `parent`:

```javascript
// Datos enviados a WooCommerce
{
  "name": "Labiales",
  "description": "Labiales de larga duración",
  "slug": "labiales-1",
  "parent": 38,  // ID de la categoría padre en WooCommerce (inv_gru_woo_id)
  "meta_data": [
    {
      "key": "_local_subcategory_code",
      "value": "1"  // inv_sub_gru_cod local
    },
    {
      "key": "_local_category_code",
      "value": "5"  // inv_gru_cod local
    }
  ]
}
```

### Desactivar Sincronización

Puedes desactivar la sincronización WooCommerce enviando `syncWoo: false`:

```json
{
  "inv_sub_gru_nom": "Subcategoría Local",
  "inv_sub_gru_des": "Esta subcategoría no se sincroniza",
  "inv_gru_cod": 5,
  "syncWoo": false
}
```

---

## 📊 Estructura de Datos

### Tabla: inventario_subgrupo

| Campo | Tipo | Null | Descripción |
|-------|------|------|-------------|
| `inv_sub_gru_cod` | SMALLINT | No | Código único de subcategoría (PK) |
| `inv_sub_gru_nom` | VARCHAR(100) | No | Nombre de la subcategoría |
| `inv_sub_gru_des` | VARCHAR(500) | Sí | Descripción de la subcategoría |
| `inv_gru_cod` | SMALLINT | No | Código de categoría padre (FK) |
| `inv_sub_gru_woo_id` | INT | Sí | ID de la subcategoría en WooCommerce |

---

## 📚 Recursos Relacionados

- [API de Categorías](./API_CATEGORIAS.md)
- [Sincronización WooCommerce - Categorías](./SINCRONIZACION_CATEGORIAS_WOO.md)
- [Documentación WooCommerce REST API](https://woocommerce.github.io/woocommerce-rest-api-docs/)

---

**Última actualización:** 2026-02-09
**Versión:** 1.0
