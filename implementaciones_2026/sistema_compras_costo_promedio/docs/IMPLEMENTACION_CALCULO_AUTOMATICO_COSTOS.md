# Implementación: Cálculo Automático de Costos Iniciales

**Fecha inicial:** 2026-02-15
**Última actualización:** 2026-02-19
**Versión:** 2.0
**Archivo principal:** `controllers/cargaCostosController.js`

---

## 📋 Resumen Ejecutivo

Sistema de carga inicial de costos para clientes sin historial de compras (600+ productos). Calcula costos usando fórmula de markup reverso sobre precio mayor o detal según disponibilidad, con validación automática y flujo de aprobación.

---

## 🔑 Conceptos Clave

### Markup vs Margen
El parámetro `margen_mayor` del endpoint es un **markup** (ganancia sobre costo), no un margen comercial (ganancia sobre precio venta):

```
Markup 20% → Margen 16.67%   ← Todos quedan en VALIDADO_CON_ALERTAS
Markup 25% → Margen 20.00%   ← Límite del SP validador
Markup 30% → Margen 23.08%   ← Pasa validación directamente
```

El SP `sp_ValidarCargaInicialCostos` usa umbral `< 20%` (margen sobre precio venta) para determinar alertas.

### Fórmulas

```
Costo = Precio / (1 + markup/100)

Ejemplo markup 25% sobre precio mayor $30,000:
Costo = $30,000 / 1.25 = $24,000
Margen = ($30,000 - $24,000) / $30,000 = 20%
```

---

## 🎯 Funcionalidades Implementadas

### `calcularCostosAutomatico` — v2.0

**Endpoint:** `POST /api/carga-costos/calcular-automatico`

**Cambios v2.0 vs v1.0:**
- ✅ Nuevo parámetro `margen_detal` independiente de `margen_mayor`
- ✅ Incluye artículos con solo precio detal (antes solo procesaba con precio mayor)
- ✅ Incluye artículos sin existencia (antes excluía stock = 0)
- ✅ Respeta artículos con `art_bod_cos_cat > 0` (no sobreescribe costos reales)
- ✅ Nuevos contadores: `ya_con_costo`, `calculados_desde_mayor`, `calculados_desde_detal`, `sin_precio`
- ✅ Campo `metodo` diferencia origen: `REVERSO_MAYOR_25%` vs `REVERSO_DETAL_25%`

**Parámetros v2.0:**
```json
{
  "usu_cod": "admin",    // Opcional (se toma del token JWT)
  "margen_mayor": 25,    // Markup para precio mayor (default: 20)
  "margen_detal": 25     // Markup para precio detal (default: igual a margen_mayor)
}
```

**Prioridad de cálculo por artículo:**
1. `art_bod_cos_cat > 0` → **OMITIR** (ya tiene costo real asignado)
2. `precio_mayor > 0` → `Costo = precio_mayor / (1 + margen_mayor/100)`
3. `precio_detal > 0` (sin precio mayor) → `Costo = precio_detal / (1 + margen_detal/100)`
4. Sin ningún precio → **OMITIR** (contador `sin_precio`)

**Respuesta v2.0:**
```json
{
  "success": true,
  "data": {
    "total_productos": 650,
    "procesados": 500,
    "ya_con_costo": 150,
    "calculados_desde_mayor": 490,
    "calculados_desde_detal": 10,
    "sin_precio": 5,
    "nuevos": 480,
    "actualizados": 20,
    "markup_mayor_aplicado": "25%",
    "markup_detal_aplicado": "25%",
    "formulas": {
      "desde_mayor": "Costo = Precio Mayor / 1.25",
      "desde_detal": "Costo = Precio Detal / 1.25"
    }
  }
}
```

---

### `aprobarCostosMasivo` (PUT /actualizar-estado) — v2.0

**Cambios v2.0:** Soporta dos modos de operación.

**Modo 1 — Por estado (nuevo en v2.0):**
Actualiza TODOS los registros de un estado origen a uno destino en una sola query SQL.
```json
{
  "estado_actual": "VALIDADO_CON_ALERTAS",
  "nuevo_estado": "VALIDADO",
  "usu_cod": "admin"
}
```

**Modo 2 — Por lista (comportamiento original):**
Actualiza solo los artículos especificados.
```json
{
  "art_cods": ["ART001", "ART002"],
  "nuevo_estado": "VALIDADO"
}
```

---

### `exportarPlantillaCostos` — v2.0

**Cambios v2.0:**
- `INNER JOIN vwExistencias` → `LEFT JOIN` (incluye artículos sin existencia)
- Eliminado filtro `WHERE ve.existencia > 0`
- 4 nuevas columnas de solo lectura (informativas):
  - `H: costo_promedio_actual` — costo actual en `art_bod_cos_cat`
  - `I: rentabilidad_detal_pct` — `(precio_detal - costo) / precio_detal * 100`
  - `J: rentabilidad_mayor_pct` — `(precio_mayor - costo) / precio_mayor * 100`
  - `K: total_unidades_vendidas` — SUM de `kar_uni` donde `kar_nat='-'`, `fac_tip_cod='VTA'`, `fac_est_fac='A'`
- `costo_inicial` movido a columna **L** (era columna H)
- Total: 14 columnas (antes 10)

---

## 🔄 Flujo Completo Recomendado

```
┌─────────────────────────────────────────────────────────┐
│              FLUJO CARGA INICIAL DE COSTOS               │
└─────────────────────────────────────────────────────────┘

PASO 0 (si reimportando):
  SQL: DELETE FROM carga_inicial_costos WHERE cic_estado != 'APLICADO'

PASO 1:
  POST /calcular-automatico
  Body: { margen_mayor: 25, margen_detal: 25 }
  → Calcula costos para artículos sin costo asignado

PASO 2:
  GET /resumen
  → Verificar distribución de estados

PASO 3 (si hay VALIDADO_CON_ALERTAS):
  PUT /actualizar-estado
  Body: { estado_actual: "VALIDADO_CON_ALERTAS", nuevo_estado: "VALIDADO" }
  → Aprobar masivamente

PASO 4 (revisar RECHAZADOS):
  GET /alertas
  → Artículos RECHAZADOS tienen precios invertidos (precio_mayor > precio_detal)
  → Corregir precios en articulosdetalle y volver al PASO 1

PASO 5:
  POST /aplicar
  → Aplica SOLO los VALIDADO a articulosdetalle.art_bod_cos_cat
  → Registra en historial_costos tipo 'CARGA_INICIAL'
```

---

## ⚠️ Problemas Conocidos y Soluciones

### `total_aplicados: 0` en POST /aplicar
**Causa:** El SP `sp_AplicarCargaInicialCostos` solo procesa `cic_estado = 'VALIDADO'`. Con markup 25%, muchos quedan en `VALIDADO_CON_ALERTAS`.
**Solución:** Ejecutar `PUT /actualizar-estado` antes de `/aplicar`.

### Artículos RECHAZADOS con margen negativo
**Causa:** `precio_mayor > precio_detal` — precios invertidos en el sistema.
**Ejemplo:** Precio mayor $40,000, precio detal $27,000 → Costo calculado $32,000 > precio detal.
**Solución:** Corregir los precios del artículo en `articulosdetalle` antes de reprocesar.

### Costos aplicados con margen < 20% (corrección posterior)
```sql
-- Corregir artículos con margen insuficiente ya aplicados
UPDATE ad_d
SET ad_d.art_bod_cos_cat = ROUND(ad.art_bod_pre / 1.25, 2)
FROM dbo.articulosdetalle ad_d
INNER JOIN dbo.articulos a ON a.art_sec = ad_d.art_sec
INNER JOIN dbo.articulosdetalle ad ON ad.art_sec = ad_d.art_sec
    AND ad.bod_sec = '1' AND ad.lis_pre_cod = 2
WHERE ad_d.bod_sec = '1' AND ad_d.lis_pre_cod = 1
  AND ad_d.art_bod_cos_cat > 0 AND ad_d.art_bod_pre > 0
  AND (ad_d.art_bod_pre - ad_d.art_bod_cos_cat) / ad_d.art_bod_pre * 100 < 20
  AND ad.art_bod_pre > 0;
```

---

## 📁 Archivos Relacionados

| Archivo | Descripción |
|---------|-------------|
| `controllers/cargaCostosController.js` | Lógica principal |
| `routes/cargaCostosRoutes.js` | Definición de rutas |
| `docs/API_ENDPOINTS_CARGA_COSTOS.md` | Documentación completa de API |
| `postman/Postman_CargaCostos_Collection.json` | Colección Postman v2.0 |
| `sql/Fase1_PreparacionCompras_09022026.sql` | SP `sp_ValidarCargaInicialCostos`, `sp_AplicarCargaInicialCostos` |

---

**Última actualización:** 2026-02-19
**Versión:** 2.0
