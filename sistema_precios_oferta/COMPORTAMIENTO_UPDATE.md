# Comportamiento de Actualización de Promociones

## 🔄 **Nuevo Flujo de Actualización**

### **Antes (DELETE + INSERT)**
```
1. Eliminar TODOS los artículos de la promoción
2. Insertar NUEVOS artículos
3. Perder historial de artículos anteriores
```

### **Ahora (UPDATE + INSERT)**
```
1. Marcar TODOS los artículos existentes como 'I' (Inactivos)
2. Para cada artículo en el request:
   - Si existe → UPDATE (activar y actualizar datos)
   - Si no existe → INSERT (nuevo artículo)
3. Mantener historial completo
```

## 📊 **Ventajas del Nuevo Enfoque**

### **1. Integridad de Datos**
- ✅ **No se pierde información** de artículos que estuvieron en la promoción
- ✅ **Auditoría completa** - puedes rastrear todos los cambios
- ✅ **Historial de modificaciones** - fechas y usuarios de cambios

### **2. Sincronización con WooCommerce**
- ✅ **Más seguro** - no hay riesgo de perder referencias
- ✅ **Rollback fácil** - cambiar estado de 'I' a 'A' es instantáneo
- ✅ **Consistencia garantizada** - siempre sabes qué artículos estuvieron activos

### **3. Performance**
- ✅ **Menos operaciones** - no hay DELETE masivo
- ✅ **Transacciones más simples** - menos puntos de falla
- ✅ **Mejor rendimiento** - UPDATE es más eficiente que DELETE + INSERT

### **4. Flexibilidad de Negocio**
- ✅ **Reactivación rápida** - cambiar de 'I' a 'A' es trivial
- ✅ **Promociones temporales** - desactivar por temporadas sin perder configuración
- ✅ **Testing A/B** - alternar entre grupos de artículos fácilmente

## 🔧 **Detalles Técnicos**

### **Paso 1: Desactivar Artículos Existentes**
```sql
UPDATE dbo.promociones_detalle 
SET pro_det_estado = 'I',
    pro_det_fecha_modificacion = GETDATE(),
    pro_det_usuario_modificacion = @usuario
WHERE pro_sec = @pro_sec
```

### **Paso 2: Procesar Cada Artículo**
```javascript
// Para cada artículo en el request:
1. Verificar si existe en la promoción
2. Si existe → UPDATE (activar y actualizar)
3. Si no existe → INSERT (nuevo artículo)
```

### **Paso 3: Validaciones**
```javascript
// Se mantienen todas las validaciones:
- Precio de oferta válido
- Descuento porcentual válido
- Al menos un artículo activo
- Estados válidos ('A' o 'I')
```

## 🎯 **Casos de Uso**

### **Caso 1: Actualizar Precios**
```json
{
  "articulos": [
    {
      "art_sec": "1855",
      "precio_oferta": 3500,  // Precio actualizado
      "estado": "A"
    }
  ]
}
```
**Resultado**: El artículo se actualiza con el nuevo precio y se mantiene activo.

### **Caso 2: Desactivar Artículo**
```json
{
  "articulos": [
    {
      "art_sec": "1855",
      "precio_oferta": 3500,
      "estado": "I"  // Se desactiva
    }
  ]
}
```
**Resultado**: El artículo se marca como inactivo pero se mantiene en la base de datos.

### **Caso 3: Agregar Nuevo Artículo**
```json
{
  "articulos": [
    {
      "art_sec": "1855",
      "precio_oferta": 3500,
      "estado": "A"
    },
    {
      "art_sec": "1856",  // Nuevo artículo
      "precio_oferta": 4200,
      "estado": "A"
    }
  ]
}
```
**Resultado**: El artículo 1855 se actualiza, el 1856 se inserta como nuevo.

### **Caso 4: Remover Artículo (No Incluirlo)**
```json
{
  "articulos": [
    {
      "art_sec": "1855",
      "precio_oferta": 3500,
      "estado": "A"
    }
    // El artículo 1856 no se incluye
  ]
}
```
**Resultado**: El artículo 1855 se mantiene activo, el 1856 se marca como inactivo.

## 📈 **Beneficios para Reportes**

### **1. Historial Completo**
```sql
-- Puedes ver todos los artículos que estuvieron en la promoción
SELECT * FROM promociones_detalle 
WHERE pro_sec = 1 
ORDER BY pro_det_fecha_modificacion DESC;
```

### **2. Análisis de Efectividad**
```sql
-- Comparar rendimiento de artículos activos vs inactivos
SELECT 
    pro_det_estado,
    COUNT(*) as cantidad,
    AVG(pro_det_precio_oferta) as precio_promedio
FROM promociones_detalle 
WHERE pro_sec = 1 
GROUP BY pro_det_estado;
```

### **3. Auditoría de Cambios**
```sql
-- Ver quién hizo qué cambios y cuándo
SELECT 
    art_sec,
    pro_det_estado,
    pro_det_fecha_modificacion,
    pro_det_usuario_modificacion
FROM promociones_detalle 
WHERE pro_sec = 1 
ORDER BY pro_det_fecha_modificacion DESC;
```

## ⚠️ **Consideraciones**

### **1. Tamaño de Base de Datos**
- Los registros inactivos ocupan espacio
- Considerar limpieza periódica de registros muy antiguos
- Implementar archivo histórico si es necesario

### **2. Consultas de Rendimiento**
- Usar índices en `pro_det_estado` para filtrar artículos activos
- Considerar vistas materializadas para reportes frecuentes
- Optimizar consultas que filtran por estado

### **3. Sincronización con WooCommerce**
- Solo sincronizar artículos con estado 'A'
- Mantener cache de precios originales para reactivación rápida
- Implementar jobs para sincronización diferida si es necesario

## 🎉 **Conclusión**

El nuevo enfoque con UPDATE en lugar de DELETE proporciona:

1. **Mayor seguridad** - no hay pérdida de datos
2. **Mejor flexibilidad** - reactivación fácil de artículos
3. **Auditoría completa** - historial de todos los cambios
4. **Mejor performance** - operaciones más eficientes
5. **Consistencia garantizada** - sincronización más confiable

Este enfoque es especialmente valioso para la integración con WooCommerce, donde la consistencia y la capacidad de rollback son críticas. 