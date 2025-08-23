# Ejemplo para Actualizar Promoción

## 📝 Endpoint

**URL**: `PUT http://localhost:3000/api/promociones/1`

**Headers**:
```
Content-Type: application/json
Authorization: Bearer TU_TOKEN_JWT_AQUI
```

## 🔄 Ejemplos de Body

### Ejemplo 1: Actualizar Solo Encabezado

```json
{
  "descripcion": "Oferta de Verano 2024 - ACTUALIZADA",
  "fecha_fin": "2024-09-30T23:59:59.000Z",
  "observaciones": "Promoción extendida hasta septiembre"
}
```

### Ejemplo 2: Actualizar Solo Artículos

```json
{
  "articulos": [
    {
      "art_sec": "ART001",
      "precio_oferta": 80000,
      "descuento_porcentaje": null,
      "observaciones": "Precio reducido"
    },
    {
      "art_sec": "ART003",
      "precio_oferta": 95000,
      "descuento_porcentaje": null,
      "observaciones": "Nuevo artículo agregado"
    }
  ]
}
```

### Ejemplo 3: Actualización Completa

```json
{
  "codigo": "OFERTA_VERANO_2024_V2",
  "descripcion": "Oferta de Verano 2024 - Segunda Edición",
  "fecha_inicio": "2024-07-01T00:00:00.000Z",
  "fecha_fin": "2024-09-30T23:59:59.000Z",
  "tipo": "OFERTA_ESPECIAL",
  "observaciones": "Promoción actualizada con nuevos productos y fechas",
  "articulos": [
    {
      "art_sec": "ART001",
      "precio_oferta": 80000,
      "descuento_porcentaje": null,
      "observaciones": "Precio reducido"
    },
    {
      "art_sec": "ART002",
      "precio_oferta": 110000,
      "descuento_porcentaje": null,
      "observaciones": "Precio ajustado"
    },
    {
      "art_sec": "ART004",
      "precio_oferta": 90000,
      "descuento_porcentaje": null,
      "observaciones": "Nuevo producto en oferta"
    }
  ]
}
```

### Ejemplo 4: Actualizar con Descuento Porcentual

```json
{
  "descripcion": "Oferta con Descuentos Porcentuales",
  "articulos": [
    {
      "art_sec": "ART001",
      "precio_oferta": null,
      "descuento_porcentaje": 20.5,
      "observaciones": "20.5% de descuento"
    },
    {
      "art_sec": "ART002",
      "precio_oferta": null,
      "descuento_porcentaje": 15.0,
      "observaciones": "15% de descuento"
    }
  ]
}
```

## ✅ Respuesta Esperada

```json
{
  "success": true,
  "message": "Promoción actualizada exitosamente",
  "data": {
    "pro_sec": 1,
    "codigo": "OFERTA_VERANO_2024_V2",
    "descripcion": "Oferta de Verano 2024 - Segunda Edición",
    "fecha_inicio": "2024-07-01T00:00:00.000Z",
    "fecha_fin": "2024-09-30T23:59:59.000Z",
    "articulos_count": 3
  }
}
```

## ❌ Respuesta de Error

```json
{
  "success": false,
  "error": "La promoción no existe"
}
```

## 🔍 Características del Endpoint

### ✅ **Actualización Parcial**
- Puedes actualizar solo los campos que necesites
- Los campos no enviados mantienen sus valores originales

### ✅ **Validaciones**
- Verifica que la promoción existe
- Valida fechas (inicio < fin)
- Valida precios usando las funciones globales
- Requiere al menos precio_oferta o descuento_porcentaje por artículo

### ✅ **Transaccional**
- Si algo falla, se revierten todos los cambios
- Mantiene la integridad de los datos

### ✅ **Artículos**
- Si envías `articulos`, reemplaza completamente la lista anterior
- Si no envías `articulos`, mantiene los existentes

## 🧪 Casos de Prueba

1. **Actualizar promoción existente**: Usar un `proSec` válido
2. **Promoción inexistente**: Usar un `proSec` que no existe
3. **Fechas inválidas**: Fecha fin anterior a fecha inicio
4. **Precios inválidos**: Precios fuera del rango permitido
5. **Sin artículos**: Actualizar solo el encabezado
6. **Artículos vacíos**: Enviar array de artículos vacío 