# SISTEMA DE PRECIOS EN OFERTA
=============================

Esta carpeta contiene toda la documentación y análisis para implementar un sistema de precios en oferta por artículo en el proyecto API Pretty.

## 📁 ESTRUCTURA DE ARCHIVOS

### 📋 DOCUMENTOS DE ANÁLISIS

#### 1. `ANALISIS_ENDPOINTS_PRECIOS.txt`
**Descripción:** Análisis completo de todos los endpoints del proyecto que consultan precios
**Contenido:**
- ✅ Endpoints críticos que requieren actualización (5 endpoints)
- ❌ Endpoints que no requieren cambios
- Consultas SQL actuales de cada endpoint
- Plan de implementación por fases
- Impacto de los cambios

**Uso:** Guía para identificar qué endpoints modificar

---

### 🛠️ SOLUCIONES PROPUESTAS

#### 2. `SOLUCION_SISTEMA_PRECIOS_OFERTA.txt`
**Descripción:** Primera versión de la solución usando la estructura existente
**Contenido:**
- Análisis de la tabla `articulosdetalle` actual
- Función SQL para calcular precios con oferta
- Vista para artículos con precios actualizados
- Modelo, controlador y rutas para gestión de ofertas
- Scripts de implementación

**Estado:** ❌ **NO RECOMENDADA** - No cumple con el requerimiento de validación

#### 3. `SOLUCION_SISTEMA_PRECIOS_OFERTA_V2.txt`
**Descripción:** Solución final recomendada con nueva estructura
**Contenido:**
- Nueva tabla `articulos_ofertas`
- Función de validación automática de precios
- Función para calcular precios con oferta
- API completa para gestión de ofertas
- Scripts de implementación completos

**Estado:** ✅ **RECOMENDADA** - Cumple todos los requerimientos

---

## 🎯 REQUERIMIENTOS CUMPLIDOS

### ✅ Precio en oferta por artículo
- Sistema parametrizable por artículo
- Precio único que aplica para ambos tipos (detal y mayor)

### ✅ Parametrización de precio y período
- Fecha inicial y final configurables
- Precio de oferta personalizable

### ✅ Validación automática
- El precio de oferta debe ser inferior tanto al precio detal como al mayor
- Validación en tiempo real al crear ofertas

### ✅ Integración en todas las consultas
- 5 endpoints críticos identificados y documentados
- Función SQL que se aplica automáticamente

---

## 🚀 PLAN DE IMPLEMENTACIÓN

### FASE 1: Base de Datos
1. Crear tabla `articulos_ofertas`
2. Crear función `fn_GetPrecioConOferta()`
3. Crear función `fn_ValidarPrecioOferta()`

### FASE 2: Backend
1. Crear `models/ofertaModel.js`
2. Crear `controllers/ofertaController.js`
3. Crear `routes/ofertaRoutes.js`

### FASE 3: Actualización de Endpoints
1. Actualizar `models/articulosModel.js`
2. Actualizar `models/orderModel.js`
3. Actualizar `controllers/wooSyncController.js`
4. Actualizar `jobs/syncWooOrders.js`

### FASE 4: Testing
1. Probar endpoints actualizados
2. Validar integración con WooCommerce
3. Verificar validaciones de precios

---

## 📊 ENDPOINTS A ACTUALIZAR

### ✅ CRÍTICOS (5 endpoints):
1. `GET /api/articulos` - Lista principal de artículos
2. `GET /api/articulos/:id_articulo` - Artículo individual
3. `GET /api/order/:fac_nro` - Detalle de pedido
4. `POST /api/woo/sync` - Sincronización WooCommerce
5. `jobs/syncWooOrders.js` - Job de sincronización

### ❌ NO REQUIEREN CAMBIOS (6 endpoints):
1. `GET /api/articulos/articulo/:art_cod` - Solo información básica
2. `GET /api/order` - Solo encabezados
3. `POST /api/sync-orders` - Usa precios WooCommerce
4. `GET /api/sales` - Solo resúmenes
5. `GET /api/kardex/:art_cod` - Solo movimientos
6. `GET /api/articulos/validar` - Solo validación

---

## 🔧 NUEVOS ENDPOINTS A CREAR

### Gestión de Ofertas:
- `POST /api/ofertas/crear` - Crear nueva oferta
- `GET /api/ofertas/activas` - Obtener ofertas activas
- `GET /api/ofertas/articulo/:art_sec` - Obtener oferta por artículo
- `DELETE /api/ofertas/cancelar/:art_sec` - Cancelar oferta

---

## 📝 ESTRUCTURA DE LA NUEVA TABLA

```sql
CREATE TABLE [dbo].[articulos_ofertas](
    [ofe_sec] [decimal](18, 0) IDENTITY(1,1) NOT NULL,
    [art_sec] [varchar](30) NOT NULL,
    [ofe_precio] [decimal](17, 2) NOT NULL,
    [ofe_fecha_inicio] [datetime] NOT NULL,
    [ofe_fecha_fin] [datetime] NOT NULL,
    [ofe_activa] [char](1) DEFAULT 'S',
    [ofe_observaciones] [varchar](500) NULL,
    [ofe_fecha_creacion] [datetime] DEFAULT GETDATE(),
    [ofe_usuario_creacion] [varchar](50) NULL,
    [ofe_fecha_modificacion] [datetime] NULL,
    [ofe_usuario_modificacion] [varchar](50) NULL,
    PRIMARY KEY CLUSTERED ([ofe_sec] ASC)
);
```

---

## ⚡ FUNCIÓN PRINCIPAL

```sql
CREATE FUNCTION dbo.fn_GetPrecioConOferta
(
    @art_sec VARCHAR(30),
    @lis_pre_cod SMALLINT,
    @fecha_consulta DATETIME = NULL
)
RETURNS DECIMAL(17, 2)
```

**Comportamiento:**
- Si hay oferta activa → Retorna precio de oferta
- Si no hay oferta → Retorna precio normal
- Aplica automáticamente en todas las consultas

---

## 🔍 VALIDACIÓN AUTOMÁTICA

```sql
CREATE FUNCTION dbo.fn_ValidarPrecioOferta
(
    @art_sec VARCHAR(30),
    @precio_oferta DECIMAL(17, 2)
)
RETURNS TABLE
```

**Validaciones:**
- ✅ Precio de oferta > 0
- ✅ Precio de oferta < precio detal
- ✅ Precio de oferta < precio mayor

---

## 📈 BENEFICIOS DE LA SOLUCIÓN

### ✅ Automatización
- Precios se calculan automáticamente según fechas
- No requiere intervención manual

### ✅ Flexibilidad
- Ofertas independientes por artículo
- Fechas personalizables
- Fácil gestión y cancelación

### ✅ Integración
- Compatible con sistema existente
- Integración con WooCommerce
- Mantiene estructura actual

### ✅ Escalabilidad
- Fácil agregar nuevas funcionalidades
- Preparado para futuras expansiones

---

## 🎯 PRÓXIMOS PASOS

1. **Revisar documentación** en `SOLUCION_SISTEMA_PRECIOS_OFERTA_V2.txt`
2. **Implementar base de datos** siguiendo los scripts SQL
3. **Crear archivos del backend** según la estructura propuesta
4. **Actualizar endpoints críticos** identificados en el análisis
5. **Realizar testing completo** de la implementación

---

## 📞 CONTACTO

Para dudas o consultas sobre la implementación, revisar la documentación completa en los archivos correspondientes.

**Archivo principal:** `SOLUCION_SISTEMA_PRECIOS_OFERTA_V2.txt`
**Análisis de endpoints:** `ANALISIS_ENDPOINTS_PRECIOS.txt` 