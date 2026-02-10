# API - Gestión de Categorías (Inventario Grupo)

Documentación completa de los endpoints para administrar categorías del inventario.

**Base URL:** `/api/categorias`
**Autenticación:** Requerida (JWT token en header `x-access-token`)

---

## 📋 Tabla de Contenidos

1. [Listar Categorías (Paginado)](#1-listar-categorías-paginado)
2. [Obtener Categoría por Código](#2-obtener-categoría-por-código)
3. [Crear Nueva Categoría](#3-crear-nueva-categoría)
4. [Actualizar Categoría](#4-actualizar-categoría)
5. [Verificar Subcategorías](#5-verificar-subcategorías)

---

## 1. Listar Categorías (Paginado)

Obtiene un listado de categorías con soporte para paginación y filtros.

### **Endpoint**
```
GET /api/categorias
```

### **Query Parameters**

| Parámetro | Tipo | Requerido | Default | Descripción |
|-----------|------|-----------|---------|-------------|
| `page` | number | No | 1 | Número de página |
| `limit` | number | No | 10 | Registros por página |
| `inv_gru_cod` | number | No | - | Filtro por código exacto de categoría |
| `inv_gru_nom` | string | No | - | Filtro por nombre (búsqueda parcial con LIKE) |

### **Headers**
```
x-access-token: <JWT_TOKEN>
```

### **Ejemplo de Request**

**Sin filtros (paginado básico):**
```bash
GET /api/categorias?page=1&limit=10
```

**Con filtro por código:**
```bash
GET /api/categorias?inv_gru_cod=5
```

**Con filtro por nombre:**
```bash
GET /api/categorias?inv_gru_nom=Maquillaje&page=1&limit=20
```

### **Respuesta Exitosa (200 OK)**

```json
{
  "success": true,
  "data": [
    {
      "inv_gru_cod": 1,
      "inv_gru_nom": "Maquillaje",
      "inv_gru_des": "Productos de maquillaje y cosméticos"
    },
    {
      "inv_gru_cod": 2,
      "inv_gru_nom": "Cuidado de la Piel",
      "inv_gru_des": "Productos para el cuidado facial y corporal"
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "totalRecords": 45,
    "limit": 10,
    "hasNextPage": true,
    "hasPreviousPage": false
  }
}
```

### **Errores Posibles**

- `401 Unauthorized`: Token no proporcionado o inválido
- `500 Internal Server Error`: Error en el servidor

---

## 2. Obtener Categoría por Código

Obtiene los detalles de una categoría específica.

### **Endpoint**
```
GET /api/categorias/:inv_gru_cod
```

### **Path Parameters**

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `inv_gru_cod` | number | Código único de la categoría |

### **Headers**
```
x-access-token: <JWT_TOKEN>
```

### **Ejemplo de Request**

```bash
GET /api/categorias/5
```

### **Respuesta Exitosa (200 OK)**

```json
{
  "success": true,
  "data": {
    "inv_gru_cod": 5,
    "inv_gru_nom": "Perfumes",
    "inv_gru_des": "Fragancias y perfumes para hombre y mujer"
  }
}
```

### **Errores Posibles**

- `400 Bad Request`: Código de categoría inválido
  ```json
  {
    "success": false,
    "message": "Código de categoría inválido"
  }
  ```

- `404 Not Found`: Categoría no encontrada
  ```json
  {
    "success": false,
    "message": "Categoría no encontrada"
  }
  ```

- `401 Unauthorized`: Token no proporcionado o inválido
- `500 Internal Server Error`: Error en el servidor

---

## 3. Crear Nueva Categoría

Crea una nueva categoría en el sistema.

### **Endpoint**
```
POST /api/categorias
```

### **Headers**
```
Content-Type: application/json
x-access-token: <JWT_TOKEN>
```

### **Body Parameters**

| Parámetro | Tipo | Requerido | Max Length | Descripción |
|-----------|------|-----------|------------|-------------|
| `inv_gru_nom` | string | Sí | 100 | Nombre de la categoría |
| `inv_gru_des` | string | No | 500 | Descripción de la categoría |

### **Ejemplo de Request**

```bash
POST /api/categorias
Content-Type: application/json
x-access-token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

{
  "inv_gru_nom": "Accesorios",
  "inv_gru_des": "Accesorios de belleza y cuidado personal"
}
```

### **Respuesta Exitosa (201 Created)**

```json
{
  "success": true,
  "message": "Categoría creada exitosamente",
  "data": {
    "inv_gru_cod": 15,
    "inv_gru_nom": "Accesorios",
    "inv_gru_des": "Accesorios de belleza y cuidado personal"
  }
}
```

**Nota:** El código `inv_gru_cod` se genera automáticamente (MAX + 1).

### **Errores Posibles**

- `400 Bad Request`: Validación fallida
  ```json
  {
    "success": false,
    "message": "El nombre de la categoría es requerido"
  }
  ```

  ```json
  {
    "success": false,
    "message": "El nombre de la categoría no puede exceder 100 caracteres"
  }
  ```

- `401 Unauthorized`: Token no proporcionado o inválido
- `500 Internal Server Error`: Error en el servidor

---

## 4. Actualizar Categoría

Actualiza los datos de una categoría existente.

### **Endpoint**
```
PUT /api/categorias/:inv_gru_cod
```

### **Path Parameters**

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `inv_gru_cod` | number | Código único de la categoría a actualizar |

### **Headers**
```
Content-Type: application/json
x-access-token: <JWT_TOKEN>
```

### **Body Parameters**

| Parámetro | Tipo | Requerido | Max Length | Descripción |
|-----------|------|-----------|------------|-------------|
| `inv_gru_nom` | string | No* | 100 | Nombre de la categoría |
| `inv_gru_des` | string | No* | 500 | Descripción de la categoría |

**\*Nota:** Se debe proporcionar al menos uno de los dos campos.

### **Ejemplo de Request**

**Actualizar solo el nombre:**
```bash
PUT /api/categorias/15
Content-Type: application/json
x-access-token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

{
  "inv_gru_nom": "Accesorios Premium"
}
```

**Actualizar nombre y descripción:**
```bash
PUT /api/categorias/15
Content-Type: application/json

{
  "inv_gru_nom": "Accesorios de Lujo",
  "inv_gru_des": "Accesorios premium de belleza y cuidado personal de alta gama"
}
```

### **Respuesta Exitosa (200 OK)**

```json
{
  "success": true,
  "message": "Categoría actualizada exitosamente",
  "data": {
    "inv_gru_cod": 15,
    "inv_gru_nom": "Accesorios de Lujo",
    "inv_gru_des": "Accesorios premium de belleza y cuidado personal de alta gama"
  }
}
```

### **Errores Posibles**

- `400 Bad Request`: Validación fallida
  ```json
  {
    "success": false,
    "message": "Código de categoría inválido"
  }
  ```

  ```json
  {
    "success": false,
    "message": "Debe proporcionar al menos un campo para actualizar"
  }
  ```

- `404 Not Found`: Categoría no encontrada
  ```json
  {
    "success": false,
    "message": "Categoría no encontrada"
  }
  ```

- `401 Unauthorized`: Token no proporcionado o inválido
- `500 Internal Server Error`: Error en el servidor

---

## 5. Verificar Subcategorías

Verifica si una categoría tiene subcategorías asociadas. Útil antes de eliminar una categoría (operación futura).

### **Endpoint**
```
GET /api/categorias/:inv_gru_cod/subcategorias/exists
```

### **Path Parameters**

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `inv_gru_cod` | number | Código único de la categoría |

### **Headers**
```
x-access-token: <JWT_TOKEN>
```

### **Ejemplo de Request**

```bash
GET /api/categorias/5/subcategorias/exists
```

### **Respuesta Exitosa (200 OK)**

**Con subcategorías:**
```json
{
  "success": true,
  "data": {
    "inv_gru_cod": 5,
    "hasSubcategories": true
  }
}
```

**Sin subcategorías:**
```json
{
  "success": true,
  "data": {
    "inv_gru_cod": 15,
    "hasSubcategories": false
  }
}
```

### **Errores Posibles**

- `400 Bad Request`: Código de categoría inválido
- `401 Unauthorized`: Token no proporcionado o inválido
- `500 Internal Server Error`: Error en el servidor

---

## 🔐 Autenticación

Todos los endpoints requieren autenticación mediante JWT token.

### **Obtener Token**

Primero debes autenticarte en:
```
POST /api/auth/login
```

```json
{
  "usu_cod": "admin",
  "usu_pass": "password123"
}
```

**Respuesta:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": { ... }
}
```

Luego usa el token en el header `x-access-token` de cada petición.

---

## 📊 Estructura de la Tabla

**Tabla:** `dbo.inventario_grupo`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `inv_gru_cod` | SMALLINT | Código único de categoría (auto-generado) |
| `inv_gru_nom` | VARCHAR(100) | Nombre de la categoría |
| `inv_gru_des` | VARCHAR(500) | Descripción de la categoría |

---

## 🧪 Colección Postman

Para facilitar las pruebas, puedes importar la colección Postman que incluye todos los endpoints configurados.

**Archivo:** `documentacion/Postman_Categorias.json`

---

## 📝 Notas Adicionales

1. **Paginación:** Por defecto retorna 10 registros por página. Puedes ajustar con `limit` (máx recomendado: 100).

2. **Búsqueda parcial:** El filtro por nombre (`inv_gru_nom`) usa `LIKE %valor%`, permitiendo búsquedas parciales.

3. **Códigos auto-generados:** Al crear una categoría, el sistema calcula automáticamente el siguiente código disponible.

4. **Validaciones:** Todos los campos de texto se limpian con `.trim()` antes de guardarse.

5. **Relaciones:** Antes de eliminar una categoría (funcionalidad futura), verifica que no tenga subcategorías asociadas usando el endpoint `/subcategorias/exists`.

---

## 🚀 Ejemplos de Uso con cURL

### Listar categorías
```bash
curl -X GET "http://localhost:3000/api/categorias?page=1&limit=10" \
  -H "x-access-token: YOUR_TOKEN"
```

### Crear categoría
```bash
curl -X POST "http://localhost:3000/api/categorias" \
  -H "Content-Type: application/json" \
  -H "x-access-token: YOUR_TOKEN" \
  -d '{
    "inv_gru_nom": "Nueva Categoría",
    "inv_gru_des": "Descripción de la categoría"
  }'
```

### Actualizar categoría
```bash
curl -X PUT "http://localhost:3000/api/categorias/15" \
  -H "Content-Type: application/json" \
  -H "x-access-token: YOUR_TOKEN" \
  -d '{
    "inv_gru_nom": "Categoría Actualizada"
  }'
```

---

**Última actualización:** 2026-02-09
**Versión API:** 1.0
