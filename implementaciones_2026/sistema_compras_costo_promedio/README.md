# Sistema de Compras con Costo Promedio Ponderado

**Fecha de Implementación:** Febrero 2026
**Estado:** ✅ Completado
**Versión:** 1.0

---

## 📋 Descripción General

Implementación completa de un **Sistema de Compras con Cálculo Automático de Costo Promedio Ponderado** según NIC 2 Colombia.

**Características principales:**
- ✅ Carga inicial automatizada de costos (600+ productos)
- ✅ Registro de compras con cálculo automático de costo promedio
- ✅ Arquitectura database-agnostic (preparada para PostgreSQL)
- ✅ Lógica 100% en JavaScript (sin stored procedures en Fase 1)
- ✅ Sistema completo de reportes

---

## 🎯 Fases Implementadas

### ✅ Fase 0: Carga Inicial de Costos

**Objetivo:** Cargar costos iniciales para 600+ productos sin historial de compras

**Implementación:**
- Cálculo automático desde precio mayorista (fórmula de costo reverso)
- Sistema de validación en dos pasos (tabla temporal)
- Importación/exportación Excel para ajustes manuales
- Validación de márgenes y alertas automáticas

**Archivos:**
- 📄 [docs/FASE_0_CARGA_INICIAL_COSTOS.md](docs/FASE_0_CARGA_INICIAL_COSTOS.md)
- 📄 [docs/IMPLEMENTACION_CALCULO_AUTOMATICO_COSTOS.md](docs/IMPLEMENTACION_CALCULO_AUTOMATICO_COSTOS.md)
- 📄 [docs/API_ENDPOINTS_CARGA_COSTOS.md](docs/API_ENDPOINTS_CARGA_COSTOS.md)
- 🗄️ [sql/Fase1_PreparacionCompras_09022026.sql](sql/Fase1_PreparacionCompras_09022026.sql)
- 🗄️ [sql/ImpactosCostoPromedio_09022026.sql](sql/ImpactosCostoPromedio_09022026.sql)
- 🔌 [postman/Postman_CargaCostos_Collection.json](postman/Postman_CargaCostos_Collection.json)
- 💻 [backend/cargaCostosController.js](backend/cargaCostosController.js)
- 💻 [backend/cargaCostosRoutes.js](backend/cargaCostosRoutes.js)

---

### ✅ Fase 1: Sistema de Compras

**Objetivo:** Registro de compras con cálculo automático de costo promedio ponderado

**Implementación:**
- Fórmula NIC 2: `Nuevo Costo = (Valor Actual + Valor Compra) / (Cantidad Actual + Cantidad Compra)`
- Generación automática de consecutivos de compra (COM000001, COM000002, etc.)
- Registro completo en kárdex (facturakardes)
- Actualización automática de costos en articulosdetalle
- Historial completo de cambios de costos
- Reportes de variación y proveedores

**Arquitectura Database-Agnostic:**
- ✅ Lógica de cálculo en JavaScript
- ✅ Transacciones manejadas en Node.js
- ✅ SQL estándar únicamente
- ✅ Preparado para migración a PostgreSQL

**Archivos:**
- 📄 [docs/IMPLEMENTACION_FASE1_SISTEMA_COMPRAS.md](docs/IMPLEMENTACION_FASE1_SISTEMA_COMPRAS.md)
- 📄 [docs/API_ENDPOINTS_COMPRAS.md](docs/API_ENDPOINTS_COMPRAS.md)
- 🗄️ [sql/Fase1_SistemaCompras_15022026.sql](sql/Fase1_SistemaCompras_15022026.sql)
- 🔌 [postman/Postman_Compras_Collection.json](postman/Postman_Compras_Collection.json)
- 💻 [backend/compraModel.js](backend/compraModel.js)
- 💻 [backend/compraController.js](backend/compraController.js)
- 💻 [backend/compraRoutes.js](backend/compraRoutes.js)

---

## 📁 Estructura de Carpetas

```
implementaciones_2026/sistema_compras_costo_promedio/
│
├── README.md (este archivo)
│
├── docs/                                              # Documentación completa
│   ├── ANALISIS_SISTEMA_COMPRAS_COSTO_PROMEDIO.md    # Análisis inicial (Fases 0-7)
│   ├── FASE_0_CARGA_INICIAL_COSTOS.md                # Especificación Fase 0
│   ├── IMPLEMENTACION_CALCULO_AUTOMATICO_COSTOS.md   # Implementación cálculo automático
│   ├── API_ENDPOINTS_CARGA_COSTOS.md                 # Endpoints Fase 0
│   ├── IMPLEMENTACION_FASE1_SISTEMA_COMPRAS.md       # Implementación Fase 1
│   └── API_ENDPOINTS_COMPRAS.md                      # Endpoints Fase 1
│
├── sql/                                               # Scripts de base de datos
│   ├── Fase1_PreparacionCompras_09022026.sql         # Preparación inicial (tablas, SPs Fase 0)
│   ├── ImpactosCostoPromedio_09022026.sql            # Scripts de análisis de impacto
│   └── Fase1_SistemaCompras_15022026.sql             # Setup Fase 1 (sin SPs)
│
├── postman/                                           # Colecciones para testing
│   ├── Postman_CargaCostos_Collection.json           # Endpoints Fase 0
│   └── Postman_Compras_Collection.json               # Endpoints Fase 1
│
└── backend/                                           # Código fuente (copia referencia)
    ├── cargaCostosController.js                      # Controlador Fase 0
    ├── cargaCostosRoutes.js                          # Rutas Fase 0
    ├── compraModel.js                                # Modelo Fase 1 (lógica en JS)
    ├── compraController.js                           # Controlador Fase 1
    └── compraRoutes.js                               # Rutas Fase 1

NOTA: Los archivos en backend/ son COPIAS de referencia.
Los archivos funcionales están en:
  - /models/compraModel.js
  - /controllers/compraController.js
  - /controllers/cargaCostosController.js
  - /routes/compraRoutes.js
  - /routes/cargaCostosRoutes.js
```

---

## 🚀 Guía de Uso Rápida

### Paso 1: Ejecutar Scripts SQL

```sql
-- 1. Ejecutar preparación (Fase 0)
-- Archivo: sql/Fase1_PreparacionCompras_09022026.sql

-- 2. Ejecutar setup de compras (Fase 1)
-- Archivo: sql/Fase1_SistemaCompras_15022026.sql
```

### Paso 2: Cargar Costos Iniciales (Fase 0)

```bash
# Autenticación
POST /api/auth/login
{
  "usu_cod": "admin",
  "usu_pass": "password"
}

# Calcular costos automáticamente
POST /api/carga-costos/calcular-automatico
{
  "margen_mayor": 20
}

# Verificar resumen
GET /api/carga-costos/resumen

# Aplicar costos
POST /api/carga-costos/aplicar
{
  "usu_cod": "admin"
}
```

### Paso 3: Registrar Compras (Fase 1)

```bash
# Registrar primera compra
POST /api/compras
{
  "nit_cod": "900123456",
  "fac_fec": "2026-02-15",
  "fac_obs": "Compra febrero",
  "detalles": [
    {
      "art_sec": "ART001",
      "cantidad": 100,
      "costo_unitario": 25000
    }
  ]
}

# Ver historial
GET /api/compras

# Ver detalle
GET /api/compras/COM000001

# Reporte de variación
GET /api/compras/reportes/variacion-costos
```

---

## 📊 Fórmulas Implementadas

### Fase 0: Costo Inicial (Cálculo Reverso)

```
Costo Inicial = Precio Mayor / (1 + margen/100)

Ejemplo (margen 20%):
  Precio Mayor: $30,000
  Divisor: 1.20
  Costo Inicial: $30,000 / 1.20 = $25,000
```

### Fase 1: Costo Promedio Ponderado (NIC 2)

```
Nuevo Costo Promedio = (Valor Actual + Valor Compra) / (Cantidad Actual + Cantidad Compra)

Donde:
  Valor Actual = Costo Actual × Existencia Actual
  Valor Compra = Costo Unitario Compra × Cantidad Compra

Ejemplo:
  Costo Actual: $24,000
  Existencia Actual: 200 unidades
  Compra: 100 unidades a $25,000

  Valor Actual = 24,000 × 200 = 4,800,000
  Valor Compra = 25,000 × 100 = 2,500,000
  Cantidad Total = 200 + 100 = 300

  Nuevo Costo = (4,800,000 + 2,500,000) / 300 = $24,333.33
```

---

## 🎯 Endpoints Implementados

### Fase 0: Carga de Costos

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/carga-costos/exportar` | Exportar plantilla Excel |
| POST | `/api/carga-costos/importar` | Importar costos desde Excel |
| POST | `/api/carga-costos/calcular-automatico` | Calcular costos automáticamente |
| GET | `/api/carga-costos/resumen` | Resumen de validación |
| GET | `/api/carga-costos/alertas` | Productos con alertas |
| POST | `/api/carga-costos/aplicar` | Aplicar costos validados |

### Fase 1: Compras

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/compras` | Registrar compra |
| GET | `/api/compras` | Listar compras (con filtros) |
| GET | `/api/compras/:fac_nro` | Detalle de compra |
| GET | `/api/compras/reportes/variacion-costos` | Reporte de variación |
| GET | `/api/compras/reportes/por-proveedor` | Reporte por proveedor |
| GET | `/api/compras/reportes/valorizado-inventario` | 🆕 Valorizado con análisis ABC |
| GET | `/api/compras/reportes/articulos-sin-costo` | 🆕 Artículos sin costo asignado |

---

## 🔧 Tecnologías Utilizadas

- **Backend:** Node.js + Express
- **Base de Datos:** SQL Server (preparado para PostgreSQL)
- **Driver DB:** mssql
- **Autenticación:** JWT
- **Transacciones:** Manejadas en Node.js
- **Estilo de Código:** CommonJS (require/module.exports)

---

## ✅ Decisiones Arquitectónicas

### Database-Agnostic

**Problema:** Futura migración a PostgreSQL

**Solución:**
- Lógica de negocio 100% en JavaScript
- Sin stored procedures en Fase 1
- SQL estándar únicamente
- Transacciones manejadas en Node.js

**Ventajas:**
- Migración más sencilla (solo cambiar driver)
- Código más testeable
- Versionamiento completo en Git
- No requiere privilegios de DB para desarrollo

### Cálculo en JavaScript vs SQL

**Cálculo de Costo Promedio:**
```javascript
// ✅ Implementado en compraModel.js
const valor_actual = costo_actual * existencia_actual;
const valor_compra = costo_unitario * cantidad_compra;
const nuevo_costo = (valor_actual + valor_compra) / (existencia_actual + cantidad_compra);
```

**NO implementado como:**
```sql
-- ❌ Evitado (stored procedure)
CREATE PROCEDURE sp_CalcularCostoPromedio ...
```

**Razón:** Portabilidad, mantenibilidad, testabilidad

---

## 📚 Documentación Adicional

### Documentos Principales

1. **[ANALISIS_SISTEMA_COMPRAS_COSTO_PROMEDIO.md](docs/ANALISIS_SISTEMA_COMPRAS_COSTO_PROMEDIO.md)**
   - Análisis completo del sistema (Fases 0-7)
   - Fórmulas y ejemplos
   - Arquitectura propuesta

2. **[IMPLEMENTACION_FASE1_SISTEMA_COMPRAS.md](docs/IMPLEMENTACION_FASE1_SISTEMA_COMPRAS.md)**
   - Guía completa de implementación
   - Casos de uso reales
   - Troubleshooting

3. **[API_ENDPOINTS_COMPRAS.md](docs/API_ENDPOINTS_COMPRAS.md)**
   - Especificación completa de endpoints
   - Ejemplos con cURL
   - Códigos de error

4. **[API_ENDPOINT_VALORIZADO_INVENTARIO.md](docs/API_ENDPOINT_VALORIZADO_INVENTARIO.md)** 🆕
   - Endpoint de valorizado de inventario
   - Clasificación ABC (Pareto)
   - Análisis de rotación
   - Casos de uso para dashboards

5. **[EJEMPLOS_USO_VALORIZADO_FRONTEND.md](docs/EJEMPLOS_USO_VALORIZADO_FRONTEND.md)** 🆕
   - Guía práctica para desarrolladores frontend
   - Ejemplos JavaScript/React/Vue
   - KPIs y gráficos para dashboards
   - Optimización de performance
   - Troubleshooting común

6. **[API_ENDPOINT_ARTICULOS_SIN_COSTO.md](docs/API_ENDPOINT_ARTICULOS_SIN_COSTO.md)** 🆕
   - Endpoint para identificar artículos sin costo
   - Costo sugerido automático
   - Filtros y casos de uso
   - Integración con valorizado

### Testing

1. **Importar colecciones Postman:**
   - `postman/Postman_CargaCostos_Collection.json`
   - `postman/Postman_Compras_Collection.json`

2. **Configurar variables:**
   - `base_url`: http://localhost:3000
   - `token`: (se obtiene automáticamente al hacer login)

3. **Ejecutar flujos:**
   - Fase 0: Login → Calcular → Resumen → Aplicar
   - Fase 1: Login → Crear Compra → Ver Historial → Reportes

---

## 🚀 Roadmap - Fases Futuras

### 📍 Fase 2: Módulo de Ventas (Pendiente)

- [ ] Tipo de comprobante VEN
- [ ] Registro de ventas con costo promedio
- [ ] Cálculo de margen de utilidad
- [ ] Descuento de inventario (kárdex con naturaleza `-`)
- [ ] Reportes de rentabilidad

### 📍 Fase 3: Ajustes de Inventario (Pendiente)

- [ ] Tipo de comprobante AJT
- [ ] Ajustes positivos/negativos
- [ ] Recálculo de costo promedio en ajustes
- [ ] Auditoría de ajustes

### 📍 Fase 4: Devoluciones (Pendiente)

- [ ] Devoluciones de compras
- [ ] Devoluciones de ventas
- [ ] Reversión de costos

Ver detalles en: [docs/ANALISIS_SISTEMA_COMPRAS_COSTO_PROMEDIO.md](docs/ANALISIS_SISTEMA_COMPRAS_COSTO_PROMEDIO.md)

---

## 👥 Contacto y Soporte

**Desarrollado por:** Claude Code
**Fecha:** Febrero 2026
**Versión:** 1.0

**Documentación actualizada:** 2026-02-15

---

## 📝 Changelog

### v1.0 (2026-02-15)
- ✅ Fase 0 completada: Carga inicial de costos
- ✅ Fase 1 completada: Sistema de compras
- ✅ Arquitectura database-agnostic implementada
- ✅ Documentación completa
- ✅ Colecciones Postman
- ✅ Scripts SQL optimizados

---

**Estado del Proyecto:** ✅ Producción - Fases 0 y 1 Completadas
