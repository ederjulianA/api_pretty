# Artículos Armados (Bundles)

Sistema para crear productos compuestos por múltiples artículos del catálogo.

## 📋 Resumen

**Estado:** En planificación
**Fecha:** 2026-02-10
**Duración estimada:** 13 días hábiles

### Ejemplo de Uso
```
Bundle: "Combo Amor y Amistad" ($50.000)
  ├─ 1x Labial Rojo Pasión
  ├─ 1x Máscara de Pestañas Negra
  └─ 1x Rubor Rosa Suave
```

## 🎯 Características Principales

1. **Gestión de Bundles**
   - Crear bundles con múltiples componentes y cantidades
   - Editar componentes libremente
   - Precio independiente (manual, no calculado)

2. **Inventario**
   - Bundle tiene stock propio (físico/pre-ensamblado)
   - Validación de stock de componentes antes de vender
   - Afectación automática de kardex

3. **Facturación**
   - Bundle aparece como línea principal con precio
   - Componentes aparecen con precio $0 (no suman al total)
   - Todos los items afectan kardex normalmente

4. **WooCommerce**
   - Sincroniza como producto simple
   - Descripción HTML con lista de componentes
   - Meta data: `_es_bundle`, `_precio_mayorista`

## 📂 Archivos

- `IMPLEMENTACION_ARTICULOS_BUNDLE.md` - Documento técnico completo
- `01_migracion_bundles.sql` - Script de migración de base de datos
- `API_Bundles.postman_collection.json` - Colección Postman (pendiente)

## 🗄️ Base de Datos

### Tabla Existente (✅ Ya existe)
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

-- facturakardes
kar_bundle_padre VARCHAR(30)    -- Referencia al bundle padre (NULL si no es componente)
```

## 🚀 Endpoints API

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/bundles` | Crear bundle |
| GET | `/api/bundles/:art_sec/componentes` | Listar componentes |
| PUT | `/api/bundles/:art_sec/componentes` | Actualizar componentes |
| DELETE | `/api/bundles/:art_sec/componentes/:comp` | Eliminar componente |
| POST | `/api/bundles/:art_sec/validar-stock` | Validar stock disponible |

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

**Kardex generado:**
- 4 líneas (bundle + 3 componentes)
- Solo el bundle suma al total
- Componentes tienen `kar_bundle_padre` apuntando al bundle
- Todos afectan inventario normalmente

## ⚠️ Restricciones

1. ❌ **No bundles anidados** - Componentes solo pueden ser productos simples o variables
2. ✅ **Precio manual** - El bundle tiene precio independiente
3. ✅ **Stock físico** - Bundle pre-ensamblado con stock propio
4. ✅ **Validación requerida** - Verificar stock de componentes antes de facturar
5. ✅ **Edición libre** - Se pueden modificar componentes sin restricciones

## 📊 Plan de Implementación

| Fase | Duración | Tareas |
|------|----------|--------|
| 0 - BD | 1 día | Scripts SQL, migrations |
| 1 - Modelo | 2 días | bundleModel.js, utilidades |
| 2 - API | 2 días | Controllers, routes |
| 3 - Facturación | 3 días | Integración orderModel |
| 4 - WooCommerce | 2 días | Sincronización |
| 5 - Consultas | 1 día | Endpoints adicionales |
| 6 - Testing | 2 días | Pruebas, documentación |

**Total:** 13 días hábiles

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
SELECT
  c.art_cod,
  c.art_nom,
  aa.ConKarUni as cantidad,
  ve.existencia as stock
FROM articulosArmado aa
INNER JOIN articulos c ON c.art_sec = aa.ComArtSec
LEFT JOIN vwExistencias ve ON ve.art_sec = c.art_sec
WHERE aa.art_sec = 'ART100';
```

## 📖 Documentación Completa

Ver `IMPLEMENTACION_ARTICULOS_BUNDLE.md` para:
- Especificación técnica detallada
- Diagramas de flujo
- Casos de prueba
- Riesgos y mitigaciones
- Métricas de éxito
