# Commits Subidos a GitHub - 2026-02-21

**Fecha:** 2026-02-21
**Status:** ✅ Exitoso
**Branch:** main
**Commits:** 2

---

## 📋 Commit 1: b4bef4a

### Mensaje
```
docs: Documentación completa de sincronización WooCommerce y variaciones
```

### Archivos Creados
1. **PATRON_SINCRONIZACION_VARIACIONES.md** (⭐ CRÍTICO)
   - Patrón correcto para obtener parent_woo_id
   - Comparativa: ❌ INCORRECTO vs ✅ CORRECTO
   - Checklist para implementaciones nuevas
   - Ejemplos de validación en BD

2. **QUICK_REFERENCE_SYNC_COMPRAS.md**
   - Guía rápida de debugging
   - Checklist de validación
   - Logs esperados
   - Soluciones a errores comunes

3. **SYNC_WOOCOMMERCE_COMPRAS.md**
   - Flujo completo de sincronización
   - Casos de uso: crear, actualizar, agregar detalles
   - Respuestas JSON de ejemplo
   - Validaciones y casos especiales

4. **FIX_STOCK_SYNC_VARIACIONES.md**
   - Problema y solución implementada
   - Query SQL antes/después
   - Lógica bifurcada (simples + variaciones)
   - Detalles críticos para futuras revisiones

5. **RESUMEN_CAMBIOS_2026_02_21.md**
   - Resumen ejecutivo de TODOS los cambios
   - Testing recomendado
   - Validación de BD
   - Archivos modificados con líneas exactas

---

## 🔧 Commit 2: 1fc5582

### Mensaje
```
feat: Agregar soporte para detalles_nuevos al editar compras

- Permite insertar nuevos artículos al actualizar una compra existente
- Genera kar_sec automáticamente para nuevos detalles
- Calcula costo promedio e inserta en historial_costos
- Actualiza fac_total_woo con suma de todos los detalles
- Incluye validación de artículos duplicados

fix: Sincronización automática de stock con WooCommerce en compras

- POST /api/compras: sincroniza automáticamente después de crear
- PUT /api/compras/:fac_nro: sincroniza si hay cambios en detalles
- Modo silencioso para no bloquear respuesta si WooCommerce falla
- Logging detallado para debugging

fix: Soporte completo para variaciones en syncDocumentStockToWoo()

- Query corregida: usa padre.art_woo_id AS art_parent_woo_id (no art_parent_woo_id nulo)
- Lógica bifurcada: productos simples en batch, variaciones individual
- Variaciones usan ruta correcta: products/{parent}/variations/{variation}
- Sincronización de ambos tipos (simple + variable) en un solo flujo

docs: Documentación completa de patrones de sincronización
```

### Archivos Modificados

#### controllers/compraController.js
- **Líneas:** 1028-1063, 1079-1100, 1108-1119
- **Cambios:**
  - ✅ Validación de `detalles_nuevos`
  - ✅ Sincronización automática con WooCommerce
  - ✅ Logging para debugging
  - ✅ Detección de cambios en detalles

#### models/compraModel.js
- **Líneas:** 1502-1610, 1695
- **Cambios:**
  - ✅ Inserción de detalles nuevos (bloque 3B)
  - ✅ Generación automática de kar_sec
  - ✅ Validación de artículos duplicados
  - ✅ Cálculo de costo promedio
  - ✅ Inserción en `facturakardes`
  - ✅ Actualización de `art_bod_cos_cat`
  - ✅ Registro en `historial_costos`
  - ✅ Actualización de `fac_total_woo`
  - ✅ Respuesta incluye `detalles_nuevos_insertados`

#### utils/wooStockSync.js
- **Líneas:** 112-127, 138-149, 152-192, 206-283, 286-360
- **Cambios:**
  - ✅ **CRÍTICO:** Query con `padre.art_woo_id AS art_parent_woo_id`
  - ✅ Lógica bifurcada (productUpdates + variationUpdates)
  - ✅ Batch update para productos simples
  - ✅ Individual update para variaciones
  - ✅ Logging mejorado con detalles de artículos
  - ✅ Manejo en `syncArticleStockToWoo()` también

---

## 📊 Estadísticas

### Líneas de Código
- **Documentación:** +1,261 líneas (5 archivos nuevos)
- **Código:** +362 líneas en 3 archivos
- **Total:** +1,623 líneas

### Archivos Impactados
- **Nuevos:** 5 archivos
- **Modificados:** 3 archivos
- **Total:** 8 archivos

### Funcionalidades Agregadas
1. ✅ Soporte para `detalles_nuevos` al editar compras
2. ✅ Sincronización automática con WooCommerce (POST/PUT)
3. ✅ Soporte completo para variaciones
4. ✅ Logging mejorado para debugging
5. ✅ Documentación crítica para futuras revisiones

---

## ⚠️ Lo Más Importante

### El Patrón Crítico Descubierto

Cuando sincronizas variaciones con WooCommerce, **DEBES** usar:

```sql
-- ✅ CORRECTO
SELECT padre.art_woo_id AS art_parent_woo_id
FROM dbo.articulos a
LEFT JOIN dbo.articulos padre ON padre.art_sec = a.art_sec_padre
```

**NO USES:**
```sql
-- ❌ INCORRECTO
SELECT padre.art_parent_woo_id  -- Será NULL
```

### Por Qué Es Importante
- Las variaciones NO tienen `art_woo_id`
- El ID del padre en WooCommerce está en `art_woo_id` del padre
- Se obtiene via JOIN, no como campo directo
- Este patrón también se usa en `jobs/updateWooOrderStatusAndStock.js`

### Documentación de Referencia
- **PATRON_SINCRONIZACION_VARIACIONES.md** - Patrón completo
- **FIX_STOCK_SYNC_VARIACIONES.md** - Detalles técnicos
- **MEMORY.md** - Actualizado con este patrón

---

## 🚀 Próximos Pasos

### Testing Recomendado
```bash
# Ver logs en tiempo real
pm2 logs api_pretty | grep "COMPRA-SYNC\|WOO-SYNC"

# Crear compra con producto + variación
curl -X POST http://localhost:3000/api/compras \
  -H "x-access-token: TOKEN" \
  -d '{"nit_sec":"123","detalles":[...]}'

# Editar compra con detalles nuevos
curl -X PUT http://localhost:3000/api/compras/COM00062 \
  -H "x-access-token: TOKEN" \
  -d '{"detalles_nuevos":[...]}'
```

### Validación en BD
```sql
-- Verificar variaciones completas
SELECT art_cod, art_woo_type, art_woo_variation_id,
       (SELECT art_woo_id FROM dbo.articulos p WHERE p.art_sec = a.art_sec_padre) AS parent_woo_id
FROM dbo.articulos a
WHERE art_woo_type = 'variation'
-- Resultado: Todos NOT NULL
```

---

## 📚 Documentación Relacionada

| Documento | Propósito |
|-----------|-----------|
| PATRON_SINCRONIZACION_VARIACIONES.md | ⭐ Patrón JOIN correcto |
| QUICK_REFERENCE_SYNC_COMPRAS.md | Guía rápida debugging |
| SYNC_WOOCOMMERCE_COMPRAS.md | Flujo completo |
| FIX_STOCK_SYNC_VARIACIONES.md | Detalles técnicos |
| RESUMEN_CAMBIOS_2026_02_21.md | Resumen ejecutivo |
| MEMORY.md | Actualizado con patrones |

---

## ✅ Verificación Final

```
✓ Commits: 2
✓ Push: Exitoso
✓ Branch: main
✓ Status: Up to date with origin/main
✓ Archivos: 8 (5 nuevos, 3 modificados)
✓ Líneas: +1,623
✓ Documentación: Completa
✓ Patrón crítico: Documentado
```

