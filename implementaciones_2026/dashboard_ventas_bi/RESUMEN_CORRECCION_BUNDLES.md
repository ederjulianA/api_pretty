# Resumen: Corrección de Rentabilidad para Bundles y Productos Variables

**Fecha:** 2026-02-17
**Estado:** ✅ Solución Documentada - Listo para Implementar

---

## 🎯 RESUMEN EJECUTIVO

Se identificó que el dashboard de rentabilidad **NO calcula correctamente** la rentabilidad de **artículos bundle (armados)**, generando:
- ❌ Rentabilidad 0% o infinito negativo en componentes
- ❌ Utilidad total incorrecta
- ❌ Productos duplicados en reportes

**Productos variables NO tienen este problema** y calculan rentabilidad correctamente.

---

## 📊 PROBLEMA TÉCNICO

### Bundles: Estructura en `facturakardes`

Cuando se vende 1 bundle, se crean **múltiples líneas**:

```
fac_sec  kar_sec  art_cod           kar_total  kar_cos  kar_bundle_padre
1000     1        COMBO-AMOR        50000      25000    NULL              ← Bundle
1000     2        LABIAL-ROJO       0          8000     5001              ← Componente
1000     3        MASCARA-NEGRA     0          12000    5001              ← Componente
1000     4        RUBOR-ROSA        0          5000     5001              ← Componente
```

**Total correcto:**
- Ingresos: $50,000 ✅
- Costos: $25,000 (suma de kar_cos de componentes) ✅
- Rentabilidad: 50% ✅

### Vista Actual (INCORRECTA)

La vista `vw_ventas_dashboard` **incluye las 4 líneas**:

```sql
SELECT
    COUNT(*) AS lineas,                    -- 4 líneas ❌ (debería ser 1)
    SUM(total_linea) AS ventas,            -- $50,000 ✅
    SUM(utilidad_linea) AS utilidad        -- $0 ❌ (debería ser $25,000)
FROM vw_ventas_dashboard
```

**Cálculo incorrecto:**
- Línea 1 (bundle): utilidad = 50,000 - 25,000 = 25,000
- Línea 2 (comp): utilidad = 0 - 8,000 = -8,000
- Línea 3 (comp): utilidad = 0 - 12,000 = -12,000
- Línea 4 (comp): utilidad = 0 - 5,000 = -5,000
- **Total:** 25,000 - 8,000 - 12,000 - 5,000 = **$0** ❌

---

## ✅ SOLUCIÓN IMPLEMENTADA

### Script SQL: `13_corregir_vista_bundles.sql`

**Cambio principal:**
```sql
WHERE
    f.fac_est_fac = 'A'
    AND fk.kar_nat = '-'
    AND f.fac_tip_cod = 'VTA'
    -- ✅ NUEVO: Excluir componentes de bundles
    AND (fk.kar_bundle_padre IS NULL OR fk.kar_bundle_padre = '')
```

**Resultado:**
- Solo muestra **1 línea** por bundle (el padre)
- Rentabilidad del bundle **ya incluye** costos de componentes (en `kar_cos`)
- Productos simples y variables **no se afectan**

### Vista Complementaria: `vw_bundles_detalle`

Para análisis detallado de bundles **CON componentes**:

```sql
SELECT * FROM vw_bundles_detalle
WHERE fac_nro = 'VTA1234'
```

Muestra:
- Bundle padre con su precio y costo
- Lista de componentes con sus costos individuales
- Útil para auditoría y análisis

---

## 🔍 VALIDACIÓN DE PRODUCTOS VARIABLES

### ✅ Productos Variables NO tienen este problema

**Razón:** Variaciones se venden como **1 línea** en `facturakardes`:

```
fac_sec  kar_sec  art_sec  art_cod         kar_total  kar_cos  kar_bundle_padre
1001     1        50002    LAB001-ROJO     48000      8000     NULL
```

- Precio: de la variación ✅
- Costo: `kar_cos` de la variación ✅
- **NO se expande** en componentes
- Rentabilidad: (48,000 - 8,000) / 48,000 = **83.33%** ✅

**Conclusión:** Productos variables **no requieren ajustes**.

---

## 📋 ARCHIVOS CREADOS

| Archivo | Descripción |
|---------|-------------|
| `ANALISIS_BUNDLES_RENTABILIDAD.md` | Análisis técnico completo del problema |
| `sql/13_corregir_vista_bundles.sql` | Script para corregir la vista |
| `RESUMEN_CORRECCION_BUNDLES.md` | Este documento (resumen ejecutivo) |

---

## 🚀 PASOS DE IMPLEMENTACIÓN

### 1️⃣ Ejecutar Script SQL

```bash
# Conectar a SQL Server
sqlcmd -S tu_servidor -d tu_base_de_datos -i sql/13_corregir_vista_bundles.sql

# O ejecutar en DBeaver/SSMS
```

**El script:**
- ✅ Verifica prerequisitos (kar_cos, kar_bundle_padre)
- ✅ Analiza bundles existentes
- ✅ Actualiza vista `vw_ventas_dashboard`
- ✅ Crea vista `vw_bundles_detalle`
- ✅ Ejecuta queries de validación

### 2️⃣ Validar Dashboard

```sql
-- Verificar que NO hay componentes en la vista
SELECT COUNT(*) AS componentes_incorrectos
FROM vw_ventas_dashboard
WHERE bundle_padre_art_sec IS NOT NULL;
-- Resultado esperado: 0

-- Comparar métricas antes/después
SELECT
    SUM(total_linea) AS ventas_totales,
    SUM(utilidad_linea) AS utilidad_total,
    AVG(rentabilidad_real) AS rentabilidad_promedio
FROM vw_ventas_dashboard
WHERE fecha_venta >= DATEADD(DAY, -30, GETDATE());
```

### 3️⃣ Testing con Bundle Real

1. Crear un bundle de prueba (si no existe)
2. Vender el bundle
3. Ejecutar queries del dashboard
4. Verificar:
   - ✅ Solo 1 línea aparece por bundle
   - ✅ Rentabilidad es positiva y correcta
   - ✅ Utilidad = precio - suma(costos de componentes)

### 4️⃣ Validar Backend (Opcional)

**Verificar que `kar_cos` del bundle incluye costos de componentes:**

```javascript
// En utils/costoUtils.js o donde se calcule kar_cos para bundles
// Asegurar que:
// kar_cos_bundle = SUMA(kar_cos de cada componente × cantidad)
```

**Nota:** Si el backend ya calcula `kar_cos` del bundle correctamente, **NO requiere cambios**.

---

## 📊 IMPACTO ESPERADO

### Antes de la corrección:

| Métrica | Valor INCORRECTO |
|---------|------------------|
| Líneas vendidas | 4 (bundle + 3 componentes) |
| Ventas totales | $50,000 ✅ |
| Utilidad total | $0 ❌ |
| Rentabilidad promedio | ~12.5% ❌ |

### Después de la corrección:

| Métrica | Valor CORRECTO |
|---------|----------------|
| Líneas vendidas | 1 (solo bundle) |
| Ventas totales | $50,000 ✅ |
| Utilidad total | $25,000 ✅ |
| Rentabilidad promedio | 50% ✅ |

---

## ⚠️ CONSIDERACIONES IMPORTANTES

### 1. Compatibilidad con Código Existente

**✅ NO rompe código existente:**
- Productos simples: Sin cambios
- Productos variables: Sin cambios
- Bundles: Se muestran correctamente como 1 línea

### 2. Queries del Backend

**Modelos que usan la vista:**
- `ventasKpiModel.js` → **Sin cambios necesarios** ✅
- Todos los queries automáticamente correctos

**Ejemplo:**
```javascript
// Este query ahora devuelve rentabilidad correcta automáticamente
const obtenerKPIsPrincipales = async (fechaInicio, fechaFin) => {
  const result = await pool.request()
    .query(`
      SELECT
        SUM(utilidad_linea) AS utilidad_total,  // ✅ Ahora correcto
        AVG(rentabilidad_real) AS rentabilidad  // ✅ Ahora correcto
      FROM vw_ventas_dashboard
      WHERE fecha_venta >= @fecha_inicio
    `);
};
```

### 3. Reportes de Detalle

**Para ver componentes del bundle:**
```javascript
// Usar la vista complementaria
const obtenerDetalleBundle = async (fac_nro) => {
  const result = await pool.request()
    .input('fac_nro', sql.VarChar(15), fac_nro)
    .query(`
      SELECT * FROM vw_bundles_detalle
      WHERE fac_nro = @fac_nro
    `);
};
```

---

## 🧪 QUERIES DE TESTING

### Test 1: Verificar Exclusión de Componentes

```sql
-- Debe devolver 0
SELECT COUNT(*) AS componentes_en_vista
FROM vw_ventas_dashboard
WHERE bundle_padre_art_sec IS NOT NULL;
```

### Test 2: Comparar Rentabilidad Bundle

```sql
-- Ver bundles con su rentabilidad
SELECT
    fac_nro,
    art_cod,
    art_nom,
    total_linea,
    costo_total_linea,
    utilidad_linea,
    rentabilidad_real,
    es_bundle
FROM vw_ventas_dashboard
WHERE es_bundle = 'S'
  AND fecha_venta >= DATEADD(DAY, -30, GETDATE())
ORDER BY fecha_venta DESC;
```

### Test 3: Detalle Completo de un Bundle

```sql
-- Ver bundle con componentes
SELECT
    bundle_codigo,
    bundle_nombre,
    bundle_precio_venta,
    componente_codigo,
    componente_nombre,
    componente_costo_total
FROM vw_bundles_detalle
WHERE fac_nro = 'VTA1234';  -- Cambiar por número real
```

---

## ✅ CHECKLIST DE IMPLEMENTACIÓN

- [ ] Leer `ANALISIS_BUNDLES_RENTABILIDAD.md` completo
- [ ] Hacer **BACKUP** de la base de datos
- [ ] Ejecutar `sql/13_corregir_vista_bundles.sql` en desarrollo
- [ ] Verificar que NO hay componentes en `vw_ventas_dashboard`
- [ ] Probar dashboard con bundle real
- [ ] Validar métricas (ventas, utilidad, rentabilidad)
- [ ] Verificar queries del backend funcionan sin cambios
- [ ] Ejecutar en **PRODUCCIÓN** (con backup previo)
- [ ] Monitorear dashboard por 24 horas

---

## 📞 SOPORTE

**Archivos de referencia:**
- Documentación técnica: `ANALISIS_BUNDLES_RENTABILIDAD.md`
- Script SQL: `sql/13_corregir_vista_bundles.sql`
- Implementación bundles: `../articulos_bundle/IMPLEMENTACION_ARTICULOS_BUNDLE.md`

**Dudas o problemas:**
- Revisar el análisis técnico completo
- Verificar prerequisitos (kar_cos, kar_bundle_padre)
- Validar con queries de testing

---

**✅ Solución lista para implementar**

**Última actualización:** 2026-02-17
