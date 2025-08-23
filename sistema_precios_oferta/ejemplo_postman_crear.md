# Ejemplo Completo - Crear Promoción con Postman

## 📝 Configuración del Request

### **Método**: `POST`
### **URL**: `http://localhost:3000/api/promociones`

### **Headers**:
```
Content-Type: application/json
Authorization: Bearer TU_TOKEN_JWT_AQUI
```

## 🔄 Ejemplos de Body

### Ejemplo 1: Promoción Básica con Precio de Oferta

```json
{
  "codigo": "OFERTA_VERANO_2024",
  "descripcion": "Descuentos especiales en productos de verano",
  "fecha_inicio": "2024-06-01T00:00:00.000Z",
  "fecha_fin": "2024-08-31T23:59:59.000Z",
  "tipo": "OFERTA",
  "observaciones": "Promoción de verano con descuentos especiales en productos seleccionados",
  "articulos": [
    {
      "art_sec": "1855",
      "precio_oferta": 3500,
      "estado": "A",
      "observaciones": "Descuento especial en producto de verano"
    },
    {
      "art_sec": "1856",
      "precio_oferta": 4200,
      "estado": "A",
      "observaciones": "Oferta limitada"
    },
    {
      "art_sec": "1857",
      "precio_oferta": 3800,
      "estado": "I",
      "observaciones": "Producto temporalmente inactivo"
    }
  ]
}
```

### Ejemplo 2: Promoción con Descuento Porcentual

```json
{
  "codigo": "DESCUENTO_15_PORCIENTO",
  "descripcion": "15% de descuento en productos seleccionados",
  "fecha_inicio": "2024-07-01T00:00:00.000Z",
  "fecha_fin": "2024-07-31T23:59:59.000Z",
  "tipo": "DESCUENTO",
  "observaciones": "Descuento del 15% aplicado automáticamente",
  "articulos": [
    {
      "art_sec": "1855",
      "descuento_porcentaje": 15.0,
      "estado": "A",
      "observaciones": "15% de descuento aplicado"
    },
    {
      "art_sec": "1856",
      "descuento_porcentaje": 15.0,
      "estado": "A",
      "observaciones": "15% de descuento aplicado"
    }
  ]
}
```

### Ejemplo 3: Promoción Mixta (Precio + Descuento)

```json
{
  "codigo": "OFERTA_MIXTA_2024",
  "descripcion": "Promoción con precios especiales y descuentos",
  "fecha_inicio": "2024-08-01T00:00:00.000Z",
  "fecha_fin": "2024-08-31T23:59:59.000Z",
  "tipo": "OFERTA_ESPECIAL",
  "observaciones": "Combinación de precios especiales y descuentos porcentuales",
  "articulos": [
    {
      "art_sec": "1855",
      "precio_oferta": 3500,
      "estado": "A",
      "observaciones": "Precio especial fijo"
    },
    {
      "art_sec": "1856",
      "descuento_porcentaje": 20.5,
      "estado": "A",
      "observaciones": "20.5% de descuento"
    },
    {
      "art_sec": "1857",
      "precio_oferta": 3800,
      "estado": "I",
      "observaciones": "Producto inactivo temporalmente"
    }
  ]
}
```

### Ejemplo 4: Promoción sin Especificar Estado (Por Defecto 'A')

```json
{
  "codigo": "OFERTA_DEFAULT_2024",
  "descripcion": "Promoción con estado por defecto",
  "fecha_inicio": "2024-09-01T00:00:00.000Z",
  "fecha_fin": "2024-09-30T23:59:59.000Z",
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
      "descuento_porcentaje": 10.0,
      "observaciones": "Estado será 'A' automáticamente"
    }
  ]
}
```

### Ejemplo 5: Promoción Black Friday

```json
{
  "codigo": "BLACK_FRIDAY_2024",
  "descripcion": "Los mejores precios del año - Black Friday",
  "fecha_inicio": "2024-11-29T00:00:00.000Z",
  "fecha_fin": "2024-11-30T23:59:59.000Z",
  "tipo": "BLACK_FRIDAY",
  "observaciones": "Ofertas especiales solo por 48 horas",
  "articulos": [
    {
      "art_sec": "1855",
      "precio_oferta": 2800,
      "estado": "A",
      "observaciones": "Precio Black Friday - 30% descuento"
    },
    {
      "art_sec": "1856",
      "precio_oferta": 3500,
      "estado": "A",
      "observaciones": "Precio Black Friday - 25% descuento"
    },
    {
      "art_sec": "1857",
      "precio_oferta": 4200,
      "estado": "A",
      "observaciones": "Precio Black Friday - 20% descuento"
    },
    {
      "art_sec": "1858",
      "precio_oferta": 5500,
      "estado": "A",
      "observaciones": "Precio Black Friday - 15% descuento"
    }
  ]
}
```

## ✅ Respuesta Esperada

### Respuesta Exitosa (201 Created)
```json
{
  "success": true,
  "message": "Promoción creada exitosamente",
  "data": {
    "pro_sec": 1,
    "codigo": "OFERTA_VERANO_2024",
    "descripcion": "Descuentos especiales en productos de verano",
    "fecha_inicio": "2024-06-01T00:00:00.000Z",
    "fecha_fin": "2024-08-31T23:59:59.000Z",
    "articulos_count": 3
  }
}
```

## ❌ Respuestas de Error

### Error: Campos Requeridos Faltantes
```json
{
  "success": false,
  "error": "codigo, descripcion, fecha_inicio, fecha_fin y articulos son requeridos"
}
```

### Error: Sin Artículos Válidos
```json
{
  "success": false,
  "error": "Al menos un artículo debe tener precio de oferta o descuento porcentual y estado válido (A o I)"
}
```

### Error: Estado Inválido
```json
{
  "success": false,
  "error": "Estado inválido para artículo 1855. Solo se permiten 'A' (Activo) o 'I' (Inactivo)"
}
```

### Error: Precio Inválido
```json
{
  "success": false,
  "error": "El precio de promoción debe ser menor al precio detal"
}
```

### Error: Fechas Inválidas
```json
{
  "success": false,
  "error": "La fecha de inicio debe ser menor a la fecha de fin"
}
```

## 🧪 Pasos para Probar en Postman

### **Paso 1: Configurar Request**
1. Abrir Postman
2. Crear nuevo request
3. Seleccionar método `POST`
4. Ingresar URL: `http://localhost:3000/api/promociones`

### **Paso 2: Configurar Headers**
1. Ir a la pestaña "Headers"
2. Agregar:
   - `Content-Type`: `application/json`
   - `Authorization`: `Bearer TU_TOKEN_JWT_AQUI`

### **Paso 3: Configurar Body**
1. Ir a la pestaña "Body"
2. Seleccionar "raw"
3. Seleccionar "JSON" en el dropdown
4. Copiar y pegar uno de los ejemplos de arriba

### **Paso 4: Ejecutar Request**
1. Hacer clic en "Send"
2. Verificar la respuesta
3. Revisar el status code (debe ser 201)

## 🔍 Verificación en Base de Datos

Después de crear la promoción, puedes verificar en la base de datos:

```sql
-- Ver la promoción creada
SELECT 
    pro_sec,
    pro_codigo,
    pro_descripcion,
    pro_fecha_inicio,
    pro_fecha_fin,
    pro_tipo,
    pro_observaciones
FROM promociones 
WHERE pro_codigo = 'OFERTA_VERANO_2024';

-- Ver los artículos de la promoción
SELECT 
    art_sec,
    pro_det_precio_oferta,
    pro_det_descuento_porcentaje,
    pro_det_estado,
    pro_det_observaciones,
    pro_det_usuario_creacion,
    pro_det_fecha_creacion
FROM promociones_detalle 
WHERE pro_sec = 1 
ORDER BY pro_det_fecha_creacion DESC;
```

## 📋 Checklist de Validación

### **Antes de Enviar:**
- [ ] URL correcta: `http://localhost:3000/api/promociones`
- [ ] Método: `POST`
- [ ] Headers configurados correctamente
- [ ] Token de autorización válido
- [ ] Body en formato JSON válido

### **Después de Enviar:**
- [ ] Status code: 201 (Created)
- [ ] Respuesta exitosa con `success: true`
- [ ] `pro_sec` generado correctamente
- [ ] Artículos creados en la base de datos
- [ ] Estados configurados correctamente

### **Validaciones a Verificar:**
- [ ] Código único de promoción
- [ ] Fechas válidas (inicio < fin)
- [ ] Al menos un artículo activo
- [ ] Precios válidos (dentro del rango permitido)
- [ ] Estados válidos ('A' o 'I')

## 🎯 Ejemplo Rápido para Probar

```json
{
  "codigo": "TEST_2024",
  "descripcion": "Promoción de prueba",
  "fecha_inicio": "2024-12-01T00:00:00.000Z",
  "fecha_fin": "2024-12-31T23:59:59.000Z",
  "tipo": "OFERTA",
  "observaciones": "Promoción para pruebas",
  "articulos": [
    {
      "art_sec": "1855",
      "precio_oferta": 3500,
      "estado": "A",
      "observaciones": "Artículo de prueba"
    }
  ]
}
```

Este ejemplo es simple y debería funcionar sin problemas para probar la funcionalidad básica. 