# Ejemplos con Campo Estado - Promociones

## 📝 Endpoint de Creación

**URL**: `POST http://localhost:3000/api/promociones`

**Headers**:
```
Content-Type: application/json
Authorization: Bearer TU_TOKEN_JWT_AQUI
```

## 🔄 Ejemplos de Body

### Ejemplo 1: Crear Promoción con Estados Mixtos

```json
{
  "codigo": "OFERTA_ESTADO_2024",
  "descripcion": "Promoción con artículos activos e inactivos",
  "fecha_inicio": "2024-06-01T00:00:00.000Z",
  "fecha_fin": "2024-08-31T23:59:59.000Z",
  "tipo": "OFERTA",
  "observaciones": "Promoción para probar estados de artículos",
  "articulos": [
    {
      "art_sec": "1855",
      "precio_oferta": 3500,
      "estado": "A",
      "observaciones": "Artículo activo en promoción"
    },
    {
      "art_sec": "1856",
      "precio_oferta": 4200,
      "estado": "I",
      "observaciones": "Artículo inactivo temporalmente"
    },
    {
      "art_sec": "1857",
      "precio_oferta": 3800,
      "estado": "A",
      "observaciones": "Artículo activo"
    }
  ]
}
```

### Ejemplo 2: Crear Promoción sin Especificar Estado (Por Defecto 'A')

```json
{
  "codigo": "OFERTA_DEFAULT_2024",
  "descripcion": "Promoción con estado por defecto",
  "fecha_inicio": "2024-06-01T00:00:00.000Z",
  "fecha_fin": "2024-08-31T23:59:59.000Z",
  "tipo": "OFERTA",
  "observaciones": "Los artículos tendrán estado 'A' por defecto",
  "articulos": [
    {
      "art_sec": "1855",
      "precio_oferta": 3500,
      "observaciones": "Estado será 'A' automáticamente"
    },
    {
      "art_sec": "1856",
      "descuento_porcentaje": 15.5,
      "observaciones": "Estado será 'A' automáticamente"
    }
  ]
}
```

### Ejemplo 3: Crear Promoción Solo con Artículos Activos

```json
{
  "codigo": "OFERTA_ACTIVOS_2024",
  "descripcion": "Promoción solo con artículos activos",
  "fecha_inicio": "2024-06-01T00:00:00.000Z",
  "fecha_fin": "2024-08-31T23:59:59.000Z",
  "tipo": "OFERTA",
  "observaciones": "Todos los artículos están activos",
  "articulos": [
    {
      "art_sec": "1855",
      "precio_oferta": 3500,
      "estado": "A",
      "observaciones": "Artículo activo"
    },
    {
      "art_sec": "1856",
      "precio_oferta": 4200,
      "estado": "A",
      "observaciones": "Artículo activo"
    }
  ]
}
```

## 🔄 Endpoint de Actualización

**URL**: `PUT http://localhost:3000/api/promociones/1`

### Ejemplo 1: Cambiar Estados de Artículos

```json
{
  "descripcion": "Promoción actualizada con cambios de estado",
  "articulos": [
    {
      "art_sec": "1855",
      "precio_oferta": 3500,
      "estado": "I",
      "observaciones": "Artículo desactivado"
    },
    {
      "art_sec": "1856",
      "precio_oferta": 4200,
      "estado": "A",
      "observaciones": "Artículo reactivado"
    },
    {
      "art_sec": "1857",
      "precio_oferta": 3800,
      "estado": "A",
      "observaciones": "Nuevo artículo activo"
    }
  ]
}
```

### Ejemplo 2: Actualizar Solo Encabezado (Mantener Artículos Existentes)

```json
{
  "descripcion": "Solo actualizar descripción de la promoción",
  "fecha_fin": "2024-09-30T23:59:59.000Z",
  "observaciones": "Promoción extendida hasta septiembre"
}
```

## ✅ Respuesta Esperada

```json
{
  "success": true,
  "message": "Promoción creada exitosamente",
  "data": {
    "pro_sec": 1,
    "codigo": "OFERTA_ESTADO_2024",
    "descripcion": "Promoción con artículos activos e inactivos",
    "fecha_inicio": "2024-06-01T00:00:00.000Z",
    "fecha_fin": "2024-08-31T23:59:59.000Z",
    "articulos_count": 3
  }
}
```

## ❌ Respuestas de Error

### Error: Estado Inválido
```json
{
  "success": false,
  "error": "Estado inválido para artículo 1855. Solo se permiten 'A' (Activo) o 'I' (Inactivo)"
}
```

### Error: Sin Artículos Válidos
```json
{
  "success": false,
  "error": "Al menos un artículo debe tener precio de oferta o descuento porcentual y estado válido (A o I)"
}
```

## 🔍 Validaciones Implementadas

### ✅ **Estados Permitidos**
- `'A'` - Activo (aplica descuento)
- `'I'` - Inactivo (no aplica descuento)

### ✅ **Validaciones de Estado**
- Si no se especifica estado → Por defecto `'A'`
- Solo se permiten valores `'A'` o `'I'`
- Al menos un artículo debe estar activo (`'A'`)

### ✅ **Comportamiento**
- Artículos con estado `'A'` → Se sincronizan con WooCommerce
- Artículos con estado `'I'` → No se sincronizan (mantienen precio original)
- Se pueden cambiar estados sin eliminar registros

## 🧪 Casos de Prueba

1. **Crear con estados mixtos** - Algunos 'A', otros 'I'
2. **Crear sin especificar estado** - Debe usar 'A' por defecto
3. **Actualizar estados** - Cambiar de 'A' a 'I' y viceversa
4. **Estado inválido** - Probar con valores no permitidos
5. **Solo inactivos** - Debe dar error (al menos uno activo) 