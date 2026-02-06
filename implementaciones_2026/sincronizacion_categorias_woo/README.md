# Sincronización de Categorías WooCommerce

**Fecha de implementación:** Febrero 2026
**Estado:** ✅ Completado
**Autor:** Claude Code

## Descripción

Sistema completo de sincronización bidireccional de categorías entre el sistema local (SQL Server) y WooCommerce, con **WooCommerce como fuente de verdad**. Permite identificar, auditar y corregir discrepancias de categorización entre ambos sistemas.

## Problema que resuelve

El cliente ha estado actualizando las categorías de productos directamente desde la página web de WooCommerce, dejando el sistema local desactualizado. Esto genera:

- ❌ Inconsistencias entre sistemas
- ❌ Reportes incorrectos en el sistema local
- ❌ Dificultad para mantener la sincronización
- ❌ Pérdida de trazabilidad de cambios

## Solución implementada

Sistema de sincronización que:

1. **Detecta discrepancias** - Compara categorías por IDs de WooCommerce (no por nombres)
2. **Audita diferencias** - Lista productos con categorías diferentes
3. **Sincroniza masivamente** - Actualiza el sistema local desde WooCommerce
4. **Modo simulación** - Permite previsualizar cambios antes de aplicarlos

## Estructura del proyecto

```
sincronizacion_categorias_woo/
├── README.md                                                      # Este archivo
├── POSTMAN_GUIDE.md                                              # Guía de uso de Postman
├── Sincronizacion_Categorias_WooCommerce.postman_collection.json # Collection de Postman
├── API_Pretty_Local.postman_environment.json                     # Environment de Postman
├── documentacion/
│   ├── IMPLEMENTACION_SINCRONIZACION_CATEGORIAS.md
│   ├── PRUEBAS_SINCRONIZACION_CATEGORIAS.md
│   ├── SISTEMA_LOGS_PROGRESO.md
│   └── FLUJO_VISUAL_SINCRONIZACION.md
├── sql/
│   ├── 02_alter_articulohook_categorias.sql  # Migración principal
│   ├── 02_validar_migracion.sql              # Validación de la migración
│   ├── diagnostico_categoria_null.sql        # Diagnóstico de problemas
│   └── test_producto_713.sql                 # Pruebas de caso específico
└── scripts/
    └── test-endpoints.sh                      # Script de testing de endpoints
```

## Cambios en la base de datos

### Tabla `ArticuloHook` - Nuevos campos

```sql
-- Categorías del sistema local
ArtHookCatSysCod NVARCHAR(20)
ArtHookCatSysNombre NVARCHAR(100)
ArtHookSubcatSysCod NVARCHAR(20)
ArtHookSubcatSysNombre NVARCHAR(100)

-- Categorías de WooCommerce
ArtHookCatWooId INT
ArtHookCatWooNombre NVARCHAR(100)
ArtHookSubcatWooId INT
ArtHookSubcatWooNombre NVARCHAR(100)

-- Metadata de sincronización
ArtHookCategoriaMatch BIT
ArtHookCatFechaVerificacion DATETIME
```

## Endpoints disponibles

### 1. Sincronizar productos desde WooCommerce
```bash
POST /api/woo/sync
Query params:
  - stock_status: 'instock' | 'outofstock' | 'onbackorder'
  - status: 'publish' | 'draft' | 'pending' (default: 'publish')
  - limit: número máximo de productos (default: todos)
  - min_stock: stock mínimo para procesar
  - process_images: 'true' | 'false' (default: 'false')
```

### 2. Auditar categorías
```bash
GET /api/woo/audit-categories
Query params:
  - onlyMismatches: 'true' | 'false' (default: 'false')
```

### 3. Corregir categoría de un producto
```bash
POST /api/woo/fix-category
Body:
  - art_cod: SKU del producto
  - action: 'sync-from-woo' (recomendado) | 'sync-to-woo'
```

### 4. Sincronización masiva de categorías
```bash
POST /api/woo/fix-all-categories
Query params:
  - dry_run: 'true' (default, simulación) | 'false' (aplicar cambios)
```

## Flujo de trabajo recomendado

### Paso 1: Sincronizar productos
```bash
curl -X POST "http://localhost:3000/api/woo/sync?stock_status=instock" \
  -H "x-access-token: $TOKEN"
```

### Paso 2: Auditar discrepancias
```bash
curl -X GET "http://localhost:3000/api/woo/audit-categories?onlyMismatches=true" \
  -H "x-access-token: $TOKEN"
```

### Paso 3: Simular sincronización masiva
```bash
curl -X POST "http://localhost:3000/api/woo/fix-all-categories?dry_run=true" \
  -H "x-access-token: $TOKEN"
```

### Paso 4: Aplicar sincronización masiva
```bash
curl -X POST "http://localhost:3000/api/woo/fix-all-categories?dry_run=false" \
  -H "x-access-token: $TOKEN"
```

## Características principales

### ✅ Validación por IDs (no por nombres)
La comparación se hace usando los IDs de WooCommerce mapeados en `inventario_grupo.inv_gru_woo_id` e `inventario_subgrupo.inv_sub_gru_woo_id`, evitando problemas con:
- Diferencias de mayúsculas/minúsculas
- Espacios extras
- Tildes y caracteres especiales

### ✅ Logs optimizados
- Progreso en tiempo real cada 10 productos
- Estimación de tiempo restante
- Velocidad de procesamiento (productos/segundo)
- Resumen de errores al finalizar

### ✅ Manejo de errores robusto
- Validación de tipos de datos
- Conversión automática a String cuando es necesario
- Identificación de productos sin mapeo de categorías
- Logs detallados del primer error para debugging

### ✅ Modo simulación
- Permite previsualizar cambios sin aplicarlos
- Identifica problemas antes de la ejecución real
- Muestra qué productos se actualizarían

### ✅ Optimización de rendimiento
- Procesamiento por lotes de 100 productos
- Opción de omitir imágenes (5-10x más rápido)
- Filtros por stock y estado
- Límite configurable de productos

## Archivos modificados

### Controladores
- `controllers/wooSyncController.js`
  - `syncWooProducts()` - Sincronización principal con categorías
  - `auditCategories()` - Auditoría de discrepancias
  - `fixProductCategory()` - Corrección individual
  - `fixAllCategories()` - Sincronización masiva (NUEVO)

### Rutas
- `routes/wooSyncRoutes.js`
  - Nuevos endpoints agregados
  - Documentación actualizada

### Jobs
- `jobs/updateWooOrderStatusAndStock.js`
  - Modo silencioso agregado a funciones auxiliares

## Casos de uso

### Caso 1: Sincronización inicial
Para productos sin categorías en el sistema local:
```bash
POST /api/woo/sync?stock_status=instock
POST /api/woo/fix-all-categories?dry_run=false
```

### Caso 2: Actualización periódica
Para mantener sincronizadas las categorías:
```bash
# Ejecutar diariamente
POST /api/woo/sync?stock_status=instock
GET /api/woo/audit-categories?onlyMismatches=true
# Si hay discrepancias:
POST /api/woo/fix-all-categories?dry_run=false
```

### Caso 3: Corrección específica
Para un producto individual:
```bash
POST /api/woo/fix-category
Body: { "art_cod": "SKU123", "action": "sync-from-woo" }
```

## Notas importantes

### ⚠️ WooCommerce es la fuente de verdad
- La acción recomendada es siempre `sync-from-woo`
- `sync-to-woo` debe usarse solo en casos muy específicos

### ⚠️ Requisito de mapeo
Todas las categorías de WooCommerce deben estar mapeadas en:
- `inventario_grupo.inv_gru_woo_id`
- `inventario_subgrupo.inv_sub_gru_woo_id`

Si falta un mapeo, el producto se saltará y aparecerá en los errores.

### ⚠️ Migración de base de datos
La migración SQL debe ejecutarse **UNA SOLA VEZ** antes de usar el sistema:
```bash
sql/02_alter_articulohook_categorias.sql
```

## Troubleshooting

### Problema: "No se encontró mapeo para la categoría"
**Causa:** La categoría de WooCommerce no está mapeada en `inventario_subgrupo`
**Solución:** Agregar el `inv_sub_gru_woo_id` correspondiente en la tabla

### Problema: "Validation failed for parameter"
**Causa:** El código de categoría es NULL o de tipo incorrecto
**Solución:** Verificar que los códigos en `inventario_subgrupo` sean válidos (no NULL)

### Problema: Sincronización muy lenta
**Causa:** El parámetro `process_images=true` está activado
**Solución:** Usar `process_images=false` (default) para solo sincronizar datos

### Problema: Categorías aparecen como NULL
**Causa:** El producto no tiene categoría asignada en el sistema local o WooCommerce
**Solución:** Verificar que el producto tenga `inv_sub_gru_cod` válido y categoría en WooCommerce

## Testing

### Opción 1: Postman (Recomendado)

La forma más fácil de probar los endpoints es usando la collection de Postman incluida:

1. Importar los archivos en Postman:
   - `Sincronizacion_Categorias_WooCommerce.postman_collection.json`
   - `API_Pretty_Local.postman_environment.json`

2. Seguir la [Guía de Postman](POSTMAN_GUIDE.md)

3. Ejecutar los endpoints en orden:
   - Login → Sincronizar → Auditar → Corregir

**Ventajas:**
- ✅ Interfaz visual amigable
- ✅ Scripts automáticos incluidos
- ✅ Token se guarda automáticamente
- ✅ Documentación integrada en cada endpoint
- ✅ Ejemplos de respuestas

### Opción 2: Script de Bash

Para pruebas automáticas desde terminal:

```bash
# Configurar token
export TOKEN="tu_jwt_token_aqui"

# Ejecutar tests
./scripts/test-endpoints.sh
```

## Métricas de rendimiento

- **Sin imágenes:** ~2-3 productos/segundo → 600 productos en ~3-4 minutos
- **Con imágenes:** ~0.5-1 producto/segundo → 600 productos en ~10-20 minutos

## Próximos pasos sugeridos

1. ✅ Implementar job automático de sincronización diaria
2. ✅ Agregar notificaciones por email cuando hay discrepancias
3. ✅ Dashboard de visualización de estado de sincronización
4. ✅ Exportar reporte de auditoría a Excel/CSV

## Contacto y soporte

Para preguntas o problemas con esta implementación, consultar:
- Documentación técnica en `documentacion/`
- Scripts SQL de validación en `sql/`
- Scripts de prueba en `scripts/`

---

**Última actualización:** Febrero 6, 2026
**Versión:** 1.0.0
