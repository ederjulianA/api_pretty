# Ejemplo Postman - Actualizar Promoción

## 📝 Endpoint

**URL**: `PUT http://localhost:3000/api/promociones/1`

**Headers**:
```
Content-Type: application/json
Authorization: Bearer TU_TOKEN_JWT_AQUI
```

## 🔄 Ejemplos de Body

### Ejemplo 1: Actualizar Solo Encabezado (Mantener Artículos Existentes)

```json
{
  "descripcion": "Oferta de Verano 2024 - ACTUALIZADA",
  "fecha_fin": "2024-09-30T23:59:59.000Z",
  "observaciones": "Promoción extendida hasta septiembre con nuevos términos"
}
```

**Resultado esperado**: Solo se actualiza el encabezado, los artículos mantienen su estado actual.

### Ejemplo 2: Actualizar Precios y Estados

```json
{
  "descripcion": "Promoción con precios actualizados",
  "articulos": [
    {
      "art_sec": "1855",
      "precio_oferta": 3200,
      "estado": "A",
      "observaciones": "Precio reducido de 3500 a 3200"
    },
    {
      "art_sec": "1856",
      "precio_oferta": 4000,
      "estado": "I",
      "observaciones": "Artículo desactivado temporalmente"
    }
  ]
}
```

**Resultado esperado**: 
- Artículo 1855: Precio actualizado y mantiene estado activo
- Artículo 1856: Precio actualizado pero se desactiva
- Otros artículos existentes: Se marcan como inactivos

### Ejemplo 3: Agregar Nuevo Artículo

```json
{
  "articulos": [
    {
      "art_sec": "1855",
      "precio_oferta": 3500,
      "estado": "A",
      "observaciones": "Mantener artículo existente"
    },
    {
      "art_sec": "1857",
      "precio_oferta": 4500,
      "estado": "A",
      "observaciones": "Nuevo artículo agregado a la promoción"
    }
  ]
}
```

**Resultado esperado**:
- Artículo 1855: Se mantiene activo
- Artículo 1857: Se inserta como nuevo artículo activo
- Artículo 1856 (si existía): Se marca como inactivo

### Ejemplo 4: Cambiar Estados Masivamente

```json
{
  "descripcion": "Promoción con cambios de estado masivos",
  "articulos": [
    {
      "art_sec": "1855",
      "precio_oferta": 3500,
      "estado": "I",
      "observaciones": "Desactivado por falta de stock"
    },
    {
      "art_sec": "1856",
      "precio_oferta": 4200,
      "estado": "A",
      "observaciones": "Reactivado con nuevo stock"
    },
    {
      "art_sec": "1857",
      "precio_oferta": 3800,
      "estado": "A",
      "observaciones": "Mantener activo"
    },
    {
      "art_sec": "1858",
      "precio_oferta": 5200,
      "estado": "A",
      "observaciones": "Nuevo producto en oferta"
    }
  ]
}
```

**Resultado esperado**:
- Artículo 1855: Se desactiva
- Artículo 1856: Se reactiva
- Artículo 1857: Se mantiene activo
- Artículo 1858: Se inserta como nuevo
- Otros artículos existentes: Se marcan como inactivos

### Ejemplo 5: Remover Artículos (No Incluirlos)

```json
{
  "descripcion": "Promoción simplificada",
  "articulos": [
    {
      "art_sec": "1855",
      "precio_oferta": 3500,
      "estado": "A",
      "observaciones": "Único artículo en promoción"
    }
  ]
}
```

**Resultado esperado**:
- Artículo 1855: Se mantiene activo
- Artículos 1856, 1857, 1858 (si existían): Se marcan como inactivos

### Ejemplo 6: Actualización Completa

```json
{
  "codigo": "OFERTA_VERANO_2024_V2",
  "descripcion": "Oferta de Verano 2024 - Segunda Edición",
  "fecha_inicio": "2024-07-01T00:00:00.000Z",
  "fecha_fin": "2024-09-30T23:59:59.000Z",
  "tipo": "OFERTA_ESPECIAL",
  "observaciones": "Promoción completamente renovada con nuevos productos y fechas",
  "articulos": [
    {
      "art_sec": "1855",
      "precio_oferta": 3200,
      "estado": "A",
      "observaciones": "Precio reducido"
    },
    {
      "art_sec": "1856",
      "precio_oferta": 4000,
      "estado": "A",
      "observaciones": "Precio ajustado"
    },
    {
      "art_sec": "1859",
      "precio_oferta": 5500,
      "estado": "A",
      "observaciones": "Nuevo producto premium"
    }
  ]
}
```

**Resultado esperado**:
- Encabezado: Todos los campos actualizados
- Artículos 1855, 1856: Precios actualizados y activos
- Artículo 1859: Nuevo artículo activo
- Otros artículos existentes: Se marcan como inactivos

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

## ❌ Respuestas de Error

### Error: Promoción No Existe
```json
{
  "success": false,
  "error": "La promoción no existe"
}
```

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

### Error: Fechas Inválidas
```json
{
  "success": false,
  "error": "La fecha de inicio debe ser menor a la fecha de fin"
}
```

## 🧪 Casos de Prueba Recomendados

### **1. Prueba Básica**
- Actualizar solo descripción
- Verificar que los artículos mantienen su estado

### **2. Prueba de Estados**
- Cambiar algunos artículos a 'I'
- Verificar que se mantienen en la base de datos
- Probar reactivación cambiando de 'I' a 'A'

### **3. Prueba de Nuevos Artículos**
- Agregar artículos que no existían
- Verificar que se insertan correctamente

### **4. Prueba de Remoción**
- No incluir artículos existentes
- Verificar que se marcan como inactivos

### **5. Prueba de Validaciones**
- Probar con estados inválidos
- Probar sin artículos válidos
- Probar con fechas incorrectas

## 🔍 Verificación en Base de Datos

Después de cada prueba, puedes verificar el estado en la base de datos:

```sql
-- Ver todos los artículos de la promoción
SELECT 
    art_sec,
    pro_det_precio_oferta,
    pro_det_estado,
    pro_det_observaciones,
    pro_det_fecha_modificacion,
    pro_det_usuario_modificacion
FROM promociones_detalle 
WHERE pro_sec = 1 
ORDER BY pro_det_fecha_modificacion DESC;

-- Ver solo artículos activos
SELECT * FROM promociones_detalle 
WHERE pro_sec = 1 AND pro_det_estado = 'A';

-- Ver solo artículos inactivos
SELECT * FROM promociones_detalle 
WHERE pro_sec = 1 AND pro_det_estado = 'I';
``` 