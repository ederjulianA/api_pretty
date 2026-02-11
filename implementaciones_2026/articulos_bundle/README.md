# Artículos Armados (Bundles)

Sistema para crear productos compuestos por múltiples artículos del catálogo.

## ✅ DOCUMENTACIÓN CORREGIDA

**Estado:** Listo para revisión y aprobación
**Fecha:** 2026-02-10

### ⚠️ Correcciones Aplicadas

Esta documentación corrige **7 problemas críticos** encontrados tras analizar el código existente:

| # | Problema Inicial | Corrección Aplicada |
|---|---------------|-----------------|
| 1 | Campos incorrectos (kar_can, kar_vuni, kar_sec_item) | Nombres correctos (kar_uni, kar_pre_pub, kar_sec) |
| 2 | WooCommerce type 'bundle' (no existe) | WooCommerce type 'simple' con descripción HTML |
| 3 | Transaction pattern incorrecto | `new sql.Request(transaction)` correcto |
| 4 | Ignoraba 7 campos promocionales | Incluye TODOS los campos kar_* |
| 5 | No consideraba ES Modules | orderModel.js usa ES Modules (import/export) |
| 6 | Validación dentro transaction | Validación PRE-transaction para evitar bloqueos |
| 7 | Sin DEFAULT en kar_bundle_padre | DEFAULT NULL para compatibilidad con código existente |

---

## 📋 Resumen

**Ejemplo de Uso:**
```
Bundle: "Combo Amor y Amistad" ($50.000)
  ├─ 1x Labial Rojo Pasión
  ├─ 1x Máscara de Pestañas Negra
  └─ 1x Rubor Rosa Suave
```

**Características:**
- ✅ Precio independiente (manual)
- ✅ Stock físico propio
- ✅ Validación de stock de componentes
- ✅ Factura con bundle + componentes (precio $0)
- ✅ WooCommerce: producto simple con descripción
- ❌ NO bundles anidados

---

## 📂 Archivos

| Archivo | Descripción |
|---------|-------------|
| `LEEME_PRIMERO.md` | **Guía de navegación - EMPIEZA AQUÍ** |
| `README.md` | Resumen ejecutivo |
| `PLAN_FASES_IMPLEMENTACION.md` | **Orden de fases y validación (implementar por etapas)** |
| `MODELO_DATOS_REFERENCIA.md` | **Referencia de tablas/campos (EstructuraDatos)** |
| `IMPLEMENTACION_ARTICULOS_BUNDLE.md` | Documento técnico completo con código |
| `ANALISIS_COMPATIBILIDAD.md` | Análisis de problemas encontrados y correcciones |
| `01_migracion_bundles.sql` | Script SQL con DEFAULT NULL para compatibilidad |
| `API_Pretty_Bundles.postman_collection.json` | **Colección Postman** (auth + todos los endpoints bundles) |
| `FLUJO_PRUEBAS.md` | **Flujo de pruebas** (facturación, regresión, stock) |
| `BUNDLE_WOOCOMMERCE_SYNC_BACKEND.md` | **Spec backend** sync bundles → WooCommerce |

---

## 🗄️ Base de Datos

### Tabla Existente ✅
```sql
articulosArmado (
  art_sec VARCHAR(30),      -- Bundle padre
  ComArtSec VARCHAR(30),    -- Componente
  ConKarUni INT             -- Cantidad
)
```

### Campos Nuevos
```sql
-- articulos
art_bundle CHAR(1) DEFAULT 'N'  -- 'S' = bundle, 'N' = normal

-- facturakardes (CRITICAL: DEFAULT NULL para compatibilidad)
kar_bundle_padre VARCHAR(30) NULL DEFAULT NULL
```

---

## 🔧 Estructura REAL de facturakardes

```sql
fac_sec              DECIMAL(18,0)  -- NOT VARCHAR
kar_sec              INT             -- Secuencia MAX+1 (NOT kar_sec_item)
art_sec              VARCHAR(30)
kar_bod_sec          VARCHAR(1)     -- Siempre '1'
kar_uni              DECIMAL(17,2)  -- Cantidad (NOT kar_can)
kar_nat              VARCHAR(1)     -- '+' o '-'
kar_pre_pub          DECIMAL(17,2)  -- Precio (NOT kar_vuni)
kar_total            DECIMAL(17,2)
kar_lis_pre_cod      INT            -- 1=detal, 2=mayor
kar_des_uno          DECIMAL(11,5)

-- 7 campos promocionales (OBLIGATORIOS)
kar_pre_pub_detal, kar_pre_pub_mayor, kar_tiene_oferta,
kar_precio_oferta, kar_descuento_porcentaje,
kar_codigo_promocion, kar_descripcion_promocion

-- NUEVO
kar_bundle_padre     VARCHAR(30) NULL  -- art_sec del bundle padre
```

---

## 🚀 Endpoints API

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/bundles` | Crear bundle |
| GET | `/api/bundles/:art_sec/componentes` | Listar componentes |
| PUT | `/api/bundles/:art_sec/componentes` | Actualizar componentes |
| POST | `/api/bundles/:art_sec/validar-stock` | Validar stock disponible |

---

## 📝 Ejemplo de Factura

```
┌─────────────────────────────────────────────────────┐
│ FACTURA FAC-12345                                   │
├─────────────────────────────────────────────────────┤
│ 2x Combo Amor Amistad        $50.000   $100.000    │
│   ├─ 2x Labial Rojo           $0         $0        │
│   ├─ 2x Máscara Negra         $0         $0        │
│   └─ 2x Rubor Rosa            $0         $0        │
│                                                     │
│ TOTAL:                                  $100.000    │
└─────────────────────────────────────────────────────┘
```

**Kardex (facturakardes):**
- 4 líneas: 1 bundle padre + 3 componentes
- Bundle: kar_pre_pub=$50.000, kar_bundle_padre=NULL
- Componentes: kar_pre_pub=$0, kar_bundle_padre='ART_BUNDLE'
- Solo el bundle suma al total

---

## ⚠️ Restricciones

1. ❌ **NO bundles anidados** - Componentes solo pueden ser simples o variables
2. ✅ **Precio manual** - No se calcula automáticamente
3. ✅ **Stock físico** - Bundle pre-ensamblado
4. ✅ **Validación PRE-transaction** - Verificar stock antes de crear orden
5. ✅ **Compatibilidad** - DEFAULT NULL en kar_bundle_padre

---

## 📊 Plan de Implementación

| Fase | Días | Tareas |
|------|------|--------|
| 0 - BD | 1 | SQL migration con DEFAULT NULL, testing compatibilidad |
| 1 - Modelo | 2 | bundleModel.js (CommonJS), WooCommerce sync |
| 2 - API | 2 | Controllers, routes, validaciones |
| 3 - Facturación | 3 | Integración orderModel.js (ES Modules), testing |
| 4 - WooCommerce | 2 | Sincronización bidireccional |
| 5 - Testing | 2 | Regresión, rollback plan |

**Total:** 12 días hábiles

---

## 🔍 Queries Útiles

**Listar bundles:**
```sql
SELECT a.art_sec, a.art_nom, COUNT(aa.ComArtSec) as componentes
FROM articulos a
LEFT JOIN articulosArmado aa ON aa.art_sec = a.art_sec
WHERE a.art_bundle = 'S'
GROUP BY a.art_sec, a.art_nom;
```

**Ver componentes:**
```sql
SELECT c.art_cod, c.art_nom, aa.ConKarUni, ve.existencia
FROM articulosArmado aa
INNER JOIN articulos c ON c.art_sec = aa.ComArtSec
LEFT JOIN vwExistencias ve ON ve.art_sec = c.art_sec
WHERE aa.art_sec = '100';
```

**Kardex con bundles:**
```sql
SELECT
  fk.kar_sec,  -- NO kar_sec_item
  a.art_cod,
  fk.kar_uni,  -- NO kar_can
  fk.kar_pre_pub,  -- NO kar_vuni
  CASE
    WHEN fk.kar_bundle_padre IS NULL THEN 'Normal/Bundle'
    ELSE 'Componente'
  END as tipo
FROM facturakardes fk
INNER JOIN articulos a ON a.art_sec = fk.art_sec
WHERE fk.fac_sec = 12345;
```

---

## ✅ Checklist Pre-Implementación

### Base de Datos
- [ ] Ejecutar 01_migracion_bundles.sql en desarrollo
- [ ] Validar que INSERTs existentes siguen funcionando
- [ ] Verificar índices creados
- [ ] Ejecutar en producción

### Código
- [ ] bundleModel.js (CommonJS) con todas las funciones
- [ ] bundleController.js con validaciones
- [ ] Modificar orderModel.js (ES Modules) mínimamente
- [ ] Validación pre-transaction en orderController.js
- [ ] Testing exhaustivo

### Compatibilidad
- [ ] Productos simples siguen funcionando
- [ ] Productos variables siguen funcionando
- [ ] Facturación normal sin cambios
- [ ] WooCommerce sync mantiene funcionalidad

---

## 🎯 Criterios de Aceptación

1. ✅ Crear bundle con componentes
2. ✅ Facturar bundle expandiendo componentes en kardex
3. ✅ Validar stock de componentes antes de venta
4. ✅ Sync a WooCommerce como producto simple
5. ✅ Código existente NO se rompe
6. ✅ Pruebas de regresión pasan

---

## 📖 Documentación Completa

- **IMPLEMENTACION_ARTICULOS_BUNDLE_V2.md** - Documento principal con código completo
- **ANALISIS_COMPATIBILIDAD.md** - Problemas encontrados y soluciones
- **01_migracion_bundles.sql** - Script de migración seguro

---

## ⚠️ IMPORTANTE: Revisar Antes de Implementar

1. Leer `ANALISIS_COMPATIBILIDAD.md` completo
2. Validar que se entiende estructura de facturakardes
3. Confirmar que ES Modules en orderModel.js está claro
4. Revisar patrón de transactions
5. Aprobar cambios antes de comenzar

**NO IMPLEMENTAR SIN APROBACIÓN**
