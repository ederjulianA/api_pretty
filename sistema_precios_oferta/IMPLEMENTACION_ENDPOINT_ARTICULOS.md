# IMPLEMENTACIÓN ENDPOINT ARTÍCULOS CON OFERTAS

## 📋 Resumen de Cambios

Se ha actualizado el endpoint `GET /api/articulos` para incluir información de ofertas activas usando el **sistema de promociones existente** (`promociones` y `promociones_detalle`).

## 🔧 Archivos Modificados

### 1. `utils/precioUtils.js`
- ✅ **Agregadas nuevas funciones:**
  - `obtenerPreciosConOferta(art_sec, fecha_consulta)` - Obtiene precios de un artículo con ofertas
  - `obtenerPreciosConOfertaMultiples(art_sec_list, fecha_consulta)` - Obtiene precios de múltiples artículos con ofertas

### 2. `models/articulosModel.js`
- ✅ **Modificada función `getArticulos()`:**
  - Agregado JOIN con tablas `promociones` y `promociones_detalle`
  - Incluidos campos de precios originales y con oferta
  - Agregada información de oferta activa y descuentos

### 3. `sistema_precios_oferta/test_endpoint_articulos.js`
- ✅ **Nuevo script de prueba:**
  - Prueba el endpoint actualizado
  - Verifica estructura de respuesta
  - Valida información de ofertas

## 📊 Estructura de Respuesta Actualizada

### Campos Agregados:
```json
{
  "art_sec": "ART001",
  "art_cod": "ART001",
  "art_nom": "Producto de Prueba",
  "precio_detal": 15000,           // Precio con oferta aplicada
  "precio_mayor": 15000,           // Precio con oferta aplicada
  "precio_detal_original": 20000,  // Precio original sin oferta
  "precio_mayor_original": 18000,  // Precio original sin oferta
  "tiene_oferta": "S",             // S/N - Indica si tiene oferta activa
  "precio_oferta": 15000,          // Precio de la oferta (si aplica)
  "descuento_porcentaje": null,    // Descuento porcentual (si aplica)
  "pro_fecha_inicio": "2024-01-01T00:00:00.000Z",
  "pro_fecha_fin": "2024-01-31T23:59:59.000Z",
  "codigo_promocion": "OFERTA001",
  "descripcion_promocion": "Oferta especial de lanzamiento",
  "existencia": 10,
  "categoria": "Electrónicos",
  "sub_categoria": "Smartphones"
}
```

## 🎯 Lógica de Precios

### Sin Oferta Activa:
- `precio_detal` = `precio_detal_original`
- `precio_mayor` = `precio_mayor_original`
- `tiene_oferta` = "N"
- `precio_oferta` = null
- `descuento_porcentaje` = null

### Con Precio de Oferta:
- `precio_detal` = `precio_oferta`
- `precio_mayor` = `precio_oferta`
- `tiene_oferta` = "S"
- `precio_oferta` = valor de la oferta
- `descuento_porcentaje` = null

### Con Descuento Porcentual:
- `precio_detal` = `precio_detal_original` * (1 - `descuento_porcentaje` / 100)
- `precio_mayor` = `precio_mayor_original` * (1 - `descuento_porcentaje` / 100)
- `tiene_oferta` = "S"
- `precio_oferta` = null
- `descuento_porcentaje` = valor del descuento

## 🚀 Pasos para Implementar

### 1. Verificar Tablas Existentes
```sql
-- Verificar que las tablas de promociones existen
SELECT COUNT(*) FROM dbo.promociones;
SELECT COUNT(*) FROM dbo.promociones_detalle;
```

### 2. Insertar Datos de Prueba (Opcional)
```sql
-- Crear una promoción de prueba
INSERT INTO dbo.promociones (pro_codigo, pro_descripcion, pro_fecha_inicio, pro_fecha_fin, pro_activa, pro_tipo)
VALUES ('OFERTA001', 'Oferta especial de lanzamiento', GETDATE(), DATEADD(day, 30, GETDATE()), 'S', 'OFERTA');

-- Obtener el pro_sec generado
DECLARE @pro_sec DECIMAL(18,0) = SCOPE_IDENTITY();

-- Agregar artículos a la promoción
INSERT INTO dbo.promociones_detalle (pro_sec, art_sec, pro_det_precio_oferta, pro_det_estado)
VALUES (@pro_sec, 'ART001', 15000, 'A');
```

### 3. Probar el Endpoint
```bash
# Ejecutar script de prueba
node sistema_precios_oferta/test_endpoint_articulos.js
```

## 🔍 Consulta SQL Actualizada

La consulta principal ahora incluye:

```sql
-- Precios originales
ISNULL(ad1.art_bod_pre, 0) AS precio_detal_original,
ISNULL(ad2.art_bod_pre, 0) AS precio_mayor_original,

-- Precios con oferta aplicada
CASE 
    WHEN pd.pro_det_precio_oferta IS NOT NULL AND pd.pro_det_precio_oferta > 0 
    THEN pd.pro_det_precio_oferta 
    WHEN pd.pro_det_descuento_porcentaje IS NOT NULL AND pd.pro_det_descuento_porcentaje > 0 
    THEN ISNULL(ad1.art_bod_pre, 0) * (1 - (pd.pro_det_descuento_porcentaje / 100))
    ELSE ISNULL(ad1.art_bod_pre, 0) 
END AS precio_detal,

-- Información de oferta
pd.pro_det_precio_oferta AS precio_oferta,
pd.pro_det_descuento_porcentaje AS descuento_porcentaje,
p.pro_fecha_inicio,
p.pro_fecha_fin,
p.pro_codigo AS codigo_promocion,
p.pro_descripcion AS descripcion_promocion,
CASE 
    WHEN (pd.pro_det_precio_oferta IS NOT NULL AND pd.pro_det_precio_oferta > 0) 
         OR (pd.pro_det_descuento_porcentaje IS NOT NULL AND pd.pro_det_descuento_porcentaje > 0)
    THEN 'S' 
    ELSE 'N' 
END AS tiene_oferta
```

## ✅ Beneficios de la Implementación

1. **🔄 Reutilización:** Usa el sistema de promociones existente
2. **📈 Flexibilidad:** Soporta tanto precios de oferta como descuentos porcentuales
3. **⚡ Rendimiento:** Usa índices y JOINs optimizados existentes
4. **🎯 Compatibilidad:** Mantiene toda la funcionalidad existente
5. **📅 Validación Temporal:** Solo considera promociones activas en el rango de fechas

## 🧪 Testing

### Casos de Prueba:
1. ✅ Artículos sin promoción activa
2. ✅ Artículos con precio de oferta
3. ✅ Artículos con descuento porcentual
4. ✅ Filtros existentes (nombre, categoría, etc.)
5. ✅ Paginación
6. ✅ Estructura de respuesta

### Comandos de Prueba:
```bash
# Probar endpoint completo
curl -H "Authorization: Bearer TOKEN" http://localhost:3000/api/articulos

# Probar con filtros
curl -H "Authorization: Bearer TOKEN" "http://localhost:3000/api/articulos?nombre=test&PageSize=5"
```

## 📝 Próximos Pasos

1. **🔧 Actualizar otros endpoints:** Aplicar la misma lógica a `GET /api/articulos/:id_articulo`
2. **🎨 Frontend:** Actualizar interfaces para mostrar información de ofertas
3. **📊 Dashboard:** Usar las vistas existentes de gestión de promociones
4. **🔄 Sincronización:** Actualizar sincronización con WooCommerce

## ⚠️ Consideraciones

- **Base de Datos:** Las tablas `promociones` y `promociones_detalle` ya deben existir
- **Permisos:** Verificar permisos de usuario para acceder a las tablas
- **Performance:** Monitorear rendimiento con grandes volúmenes de datos
- **Consistencia:** Asegurar que las promociones estén correctamente configuradas

## 🎯 Ventajas del Sistema Existente

- ✅ **Ya implementado:** Sistema completo de promociones
- ✅ **Validaciones:** Funciones de validación de precios y descuentos
- ✅ **Gestión:** Endpoints para crear, actualizar y consultar promociones
- ✅ **Flexibilidad:** Soporta múltiples tipos de ofertas
- ✅ **Auditoría:** Trazabilidad completa de cambios

---

**Estado:** ✅ **IMPLEMENTADO Y LISTO PARA PRUEBAS** 