# ÍNDICE RÁPIDO - SISTEMA DE PRECIOS EN OFERTA
==============================================

## 🚀 INICIO RÁPIDO

### ¿Qué necesitas hacer?

| **Si quieres...** | **Lee este archivo:** |
|-------------------|----------------------|
| 📋 Ver qué endpoints modificar | `ANALISIS_ENDPOINTS_PRECIOS.txt` |
| 🛠️ Implementar la solución completa | `SOLUCION_SISTEMA_PRECIOS_OFERTA_V2.txt` |
| 📖 Ver la documentación general | `README.md` |
| 🔍 Comparar soluciones | `SOLUCION_SISTEMA_PRECIOS_OFERTA.txt` |

---

## 📋 RESUMEN EJECUTIVO

### ✅ **SOLUCIÓN RECOMENDADA**
- **Archivo:** `SOLUCION_SISTEMA_PRECIOS_OFERTA_V2.txt`
- **Estado:** Lista para implementar
- **Cumple:** Todos los requerimientos

### 🎯 **REQUERIMIENTOS CUMPLIDOS**
- ✅ Precio en oferta por artículo
- ✅ Parametrización de precio y período
- ✅ Validación automática (precio < detal Y mayor)
- ✅ Integración en todas las consultas

### 📊 **IMPACTO**
- **Endpoints a modificar:** 5 críticos
- **Endpoints sin cambios:** 6
- **Nuevos endpoints:** 4 para gestión de ofertas

---

## 🔧 IMPLEMENTACIÓN RÁPIDA

### PASO 1: Base de Datos
```sql
-- Ejecutar scripts de SOLUCION_SISTEMA_PRECIOS_OFERTA_V2.txt
-- Sección 7: SCRIPT DE IMPLEMENTACIÓN
```

### PASO 2: Backend
```bash
# Crear archivos según SOLUCION_SISTEMA_PRECIOS_OFERTA_V2.txt
# Sección 2.3: MODELO PARA GESTIÓN DE OFERTAS
# Sección 2.4: CONTROLADOR PARA GESTIÓN DE OFERTAS
# Sección 2.5: RUTAS PARA GESTIÓN DE OFERTAS
```

### PASO 3: Actualizar Endpoints
```bash
# Seguir ANALISIS_ENDPOINTS_PRECIOS.txt
# Sección 6: RESUMEN DE ENDPOINTS A ACTUALIZAR
```

---

## 📁 ESTRUCTURA DE ARCHIVOS

```
sistema_precios_oferta/
├── README.md                              # 📖 Documentación general
├── INDICE_RAPIDO.md                       # 🚀 Este archivo
├── ANALISIS_ENDPOINTS_PRECIOS.txt         # 📋 Análisis de endpoints
├── SOLUCION_SISTEMA_PRECIOS_OFERTA.txt    # ❌ Solución inicial (no usar)
└── SOLUCION_SISTEMA_PRECIOS_OFERTA_V2.txt # ✅ Solución final (usar)
```

---

## 🎯 ENDPOINTS CRÍTICOS (5)

| Endpoint | Archivo | Estado |
|----------|---------|--------|
| `GET /api/articulos` | `models/articulosModel.js` | ✅ Actualizar |
| `GET /api/articulos/:id` | `models/articulosModel.js` | ✅ Actualizar |
| `GET /api/order/:fac_nro` | `models/orderModel.js` | ✅ Actualizar |
| `POST /api/woo/sync` | `controllers/wooSyncController.js` | ✅ Actualizar |
| `jobs/syncWooOrders.js` | `jobs/syncWooOrders.js` | ✅ Actualizar |

---

## 🔧 NUEVOS ENDPOINTS (4)

| Endpoint | Función |
|----------|---------|
| `POST /api/ofertas/crear` | Crear oferta |
| `GET /api/ofertas/activas` | Listar ofertas activas |
| `GET /api/ofertas/articulo/:art_sec` | Obtener oferta por artículo |
| `DELETE /api/ofertas/cancelar/:art_sec` | Cancelar oferta |

---

## 📝 ESTRUCTURA DE TABLA

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
-- Reemplaza todas las consultas de art_bod_pre
dbo.fn_GetPrecioConOferta(art_sec, lis_pre_cod, GETDATE())
```

---

## 🔍 VALIDACIÓN

```sql
-- Valida automáticamente que precio_oferta < precio_detal Y precio_mayor
SELECT * FROM dbo.fn_ValidarPrecioOferta(@art_sec, @precio_oferta)
```

---

## 📞 AYUDA RÁPIDA

### ¿Dónde empezar?
1. **Lee** `SOLUCION_SISTEMA_PRECIOS_OFERTA_V2.txt` (sección 7)
2. **Ejecuta** los scripts SQL
3. **Crea** los archivos del backend
4. **Actualiza** los endpoints críticos

### ¿Qué archivo contiene qué?
- **Análisis completo:** `ANALISIS_ENDPOINTS_PRECIOS.txt`
- **Solución completa:** `SOLUCION_SISTEMA_PRECIOS_OFERTA_V2.txt`
- **Documentación general:** `README.md`

### ¿Necesitas ayuda específica?
- **Endpoints:** Sección 6 de `ANALISIS_ENDPOINTS_PRECIOS.txt`
- **Implementación:** Sección 7 de `SOLUCION_SISTEMA_PRECIOS_OFERTA_V2.txt`
- **API:** Sección 4 de `SOLUCION_SISTEMA_PRECIOS_OFERTA_V2.txt`

---

## ✅ CHECKLIST DE IMPLEMENTACIÓN

- [ ] Ejecutar scripts SQL de base de datos
- [ ] Crear `models/ofertaModel.js`
- [ ] Crear `controllers/ofertaController.js`
- [ ] Crear `routes/ofertaRoutes.js`
- [ ] Actualizar `models/articulosModel.js`
- [ ] Actualizar `models/orderModel.js`
- [ ] Actualizar `controllers/wooSyncController.js`
- [ ] Actualizar `jobs/syncWooOrders.js`
- [ ] Actualizar `app.js` (nuevas rutas)
- [ ] Testing de endpoints
- [ ] Validación de integración WooCommerce

---

**📖 Para información detallada, consulta `README.md`** 