# Instrucciones para Probar el Endpoint de Promociones con Postman

## 📋 Requisitos Previos

1. **Servidor ejecutándose**: Asegúrate de que tu API esté corriendo en `http://localhost:3000`
2. **Base de datos configurada**: Las tablas de promociones deben estar creadas
3. **Token de autenticación**: Necesitas un JWT válido para las pruebas

## 🚀 Pasos para Configurar Postman

### 1. Importar la Colección

1. Abre Postman
2. Haz clic en "Import" (esquina superior izquierda)
3. Selecciona el archivo `ejemplo_postman_promocion.json`
4. La colección se importará automáticamente

### 2. Configurar Variables de Entorno

1. En Postman, ve a la pestaña "Environments"
2. Crea un nuevo environment llamado "API Academia Local"
3. Agrega las siguientes variables:

| Variable | Valor Inicial | Descripción |
|----------|---------------|-------------|
| `base_url` | `http://localhost:3000` | URL base de tu API |
| `auth_token` | `TU_TOKEN_JWT_AQUI` | Token de autenticación |

### 3. Obtener Token de Autenticación

Si no tienes un token, primero debes autenticarte:

```http
POST {{base_url}}/api/auth/login
Content-Type: application/json

{
  "email": "tu_email@ejemplo.com",
  "password": "tu_password"
}
```

Copia el token del response y actualiza la variable `auth_token` en tu environment.

## 📝 Ejemplos de Prueba

### Ejemplo 1: Promoción con Descuento por Porcentaje

**Endpoint**: `POST {{base_url}}/api/promociones`

**Headers**:
- `Content-Type: application/json`
- `Authorization: Bearer {{auth_token}}`

**Body**:
```json
{
  "nombre": "Oferta de Verano 2024",
  "descripcion": "Descuentos especiales en productos de verano",
  "fecha_inicio": "2024-06-01T00:00:00.000Z",
  "fecha_fin": "2024-08-31T23:59:59.000Z",
  "tipo_descuento": "porcentaje",
  "valor_descuento": 15.5,
  "activa": true,
  "articulos": [
    {
      "codigo_articulo": "ART001",
      "precio_promocion": 85000,
      "stock_disponible": 50
    },
    {
      "codigo_articulo": "ART002",
      "precio_promocion": 120000,
      "stock_disponible": 30
    }
  ]
}
```

### Ejemplo 2: Promoción con Descuento por Monto Fijo

**Body**:
```json
{
  "nombre": "Liquidación de Inventario",
  "descripcion": "Precios especiales para liquidar stock",
  "fecha_inicio": "2024-12-01T00:00:00.000Z",
  "fecha_fin": "2024-12-31T23:59:59.000Z",
  "tipo_descuento": "monto_fijo",
  "valor_descuento": 25000,
  "activa": true,
  "articulos": [
    {
      "codigo_articulo": "ART003",
      "precio_promocion": 75000,
      "stock_disponible": 25
    }
  ]
}
```

### Ejemplo 3: Promoción con Precio Especial

**Body**:
```json
{
  "nombre": "Black Friday 2024",
  "descripcion": "Los mejores precios del año",
  "fecha_inicio": "2024-11-29T00:00:00.000Z",
  "fecha_fin": "2024-11-30T23:59:59.000Z",
  "tipo_descuento": "precio_especial",
  "valor_descuento": 0,
  "activa": true,
  "articulos": [
    {
      "codigo_articulo": "ART004",
      "precio_promocion": 95000,
      "stock_disponible": 100
    },
    {
      "codigo_articulo": "ART005",
      "precio_promocion": 180000,
      "stock_disponible": 75
    },
    {
      "codigo_articulo": "ART006",
      "precio_promocion": 65000,
      "stock_disponible": 200
    }
  ]
}
```

## 🔍 Endpoints de Consulta

### Obtener Todas las Promociones
```http
GET {{base_url}}/api/promociones
Authorization: Bearer {{auth_token}}
```

### Obtener Promoción por ID
```http
GET {{base_url}}/api/promociones/1
Authorization: Bearer {{auth_token}}
```

## ✅ Respuestas Esperadas

### Respuesta Exitosa (201 Created)
```json
{
  "success": true,
  "message": "Promoción creada exitosamente",
  "data": {
    "id": 1,
    "nombre": "Oferta de Verano 2024",
    "descripcion": "Descuentos especiales en productos de verano",
    "fecha_inicio": "2024-06-01T00:00:00.000Z",
    "fecha_fin": "2024-08-31T23:59:59.000Z",
    "tipo_descuento": "porcentaje",
    "valor_descuento": 15.5,
    "activa": true,
    "created_at": "2024-01-15T10:30:00.000Z",
    "articulos": [
      {
        "id": 1,
        "promocion_id": 1,
        "codigo_articulo": "ART001",
        "precio_promocion": 85000,
        "stock_disponible": 50,
        "created_at": "2024-01-15T10:30:00.000Z"
      }
    ]
  }
}
```

### Respuesta de Error (400 Bad Request)
```json
{
  "success": false,
  "message": "Error de validación",
  "errors": [
    "El precio de promoción debe ser menor al precio detal",
    "El precio de promoción debe ser mayor al precio mayor"
  ]
}
```

## 🧪 Casos de Prueba Recomendados

1. **Caso exitoso**: Usar códigos de artículos que existan en tu base de datos
2. **Validación de precios**: Intentar crear promociones con precios inválidos
3. **Fechas**: Probar con fechas pasadas o fechas de fin anteriores a inicio
4. **Artículos duplicados**: Intentar agregar el mismo artículo dos veces
5. **Sin autenticación**: Probar sin token para verificar middleware de auth

## 🔧 Troubleshooting

### Error 401 Unauthorized
- Verifica que el token sea válido
- Asegúrate de que el usuario tenga permisos para crear promociones

### Error 500 Internal Server Error
- Revisa los logs del servidor
- Verifica que las tablas de la base de datos existan
- Confirma que la conexión a la base de datos esté funcionando

### Error de Validación
- Revisa que los códigos de artículos existan en `articulosdetalle`
- Verifica que los precios estén dentro del rango válido
- Confirma que las fechas tengan el formato correcto

## 📊 Monitoreo

Después de crear promociones, puedes verificar en la base de datos:

```sql
-- Ver promociones creadas
SELECT * FROM promociones ORDER BY created_at DESC;

-- Ver artículos en promoción
SELECT * FROM promocion_articulos ORDER BY created_at DESC;

-- Verificar precios
SELECT 
    pa.codigo_articulo,
    pa.precio_promocion,
    ad.precio_detal,
    ad.precio_mayor
FROM promocion_articulos pa
JOIN articulosdetalle ad ON pa.codigo_articulo = ad.codigo_articulo
WHERE pa.promocion_id = 1;
``` 