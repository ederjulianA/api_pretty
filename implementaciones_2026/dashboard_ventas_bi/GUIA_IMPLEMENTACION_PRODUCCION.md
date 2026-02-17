# Guía de Implementación en Producción - Dashboard de Ventas BI

**Fecha:** 2026-02-17
**Base de datos:** SyscomElRedentor
**Versión:** 3.0 (Incluye corrección de bundles)

---

## ⚠️ PREREQUISITOS IMPORTANTES

### Antes de Comenzar:

1. **✅ HACER BACKUP COMPLETO de la base de datos**
   ```sql
   BACKUP DATABASE [SyscomElRedentor]
   TO DISK = 'C:\Backups\SyscomElRedentor_PreDashboard_2026-02-17.bak'
   WITH FORMAT, INIT, NAME = 'Full Backup Before Dashboard BI Implementation';
   ```

2. **✅ Verificar acceso exclusivo (opcional pero recomendado)**
   ```sql
   -- Verificar conexiones activas
   SELECT * FROM sys.dm_exec_sessions WHERE database_id = DB_ID('SyscomElRedentor');
   ```

3. **✅ Tiempo estimado:** 20-30 minutos
4. **✅ Ventana de mantenimiento:** Preferiblemente fuera de horario laboral

---

## 📋 SCRIPTS PARA PRODUCCIÓN

### Scripts Obligatorios (DEBEN ejecutarse en orden):

| Orden | Script | Descripción | Tiempo | Marca |
|-------|--------|-------------|--------|-------|
| 1 | `06_agregar_kar_cos.sql` | Agrega columna kar_cos a facturakardes | 2 min | 🟢 PROD |
| 2 | `07_poblar_kar_cos_historico.sql` | Puebla kar_cos con datos históricos | 5-10 min | 🟢 PROD |
| 3 | `01_crear_vista_ventas_dashboard.sql` | Crea vista principal | 1 min | 🟢 PROD |
| 4 | `02_indices_performance.sql` | Crea índices para optimización | 2 min | 🟢 PROD |
| 5 | `13_corregir_vista_bundles.sql` | Actualiza vista para bundles + crea vw_bundles_detalle | 2 min | 🟢 PROD |

### Scripts Opcionales (solo si es necesario):

| Script | Cuándo Ejecutar | Marca |
|--------|-----------------|-------|
| `09_corregir_secuencia_factura.sql` | Solo si tienes errores de PRIMARY KEY en fac_sec | 🟡 OPCIONAL |
| `10_corregir_todas_secuencias.sql` | Para prevenir errores de secuencias (recomendado) | 🟡 OPCIONAL |
| `11_actualizar_kar_cos_faltantes.sql` | Ejecutar periódicamente para actualizar costos faltantes | 🔄 PERIÓDICO |

### Scripts de Diagnóstico (NO ejecutar, solo para análisis):

| Script | Uso |
|--------|-----|
| `03_diagnostico_rentabilidad_negativa.sql` | Analizar productos con rentabilidad negativa |
| `04_diagnostico_periodo_especifico.sql` | Analizar ventas de un período específico |
| `05_verificar_kar_cos.sql` | Verificar estado de kar_cos |
| `12_diagnostico_rentabilidad_negativa.sql` | Diagnóstico detallado (versión mejorada) |

---

## 🚀 ORDEN DE EJECUCIÓN EN PRODUCCIÓN

### PASO 1: Backup
```sql
BACKUP DATABASE [SyscomElRedentor]
TO DISK = 'C:\Backups\SyscomElRedentor_PreDashboard_2026-02-17.bak'
WITH FORMAT, INIT;
```

### PASO 2: Ejecutar Scripts Obligatorios

#### Script 1: Agregar kar_cos
```bash
# Archivo: 06_agregar_kar_cos_PROD.sql
```
**Qué hace:**
- Agrega columna `kar_cos DECIMAL(18,4)` a `facturakardes`
- Crea índice en `kar_cos`
- NO rompe código existente (DEFAULT NULL)

**Validación:**
```sql
SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'facturakardes' AND COLUMN_NAME = 'kar_cos';
-- Resultado esperado: 1
```

---

#### Script 2: Poblar kar_cos histórico
```bash
# Archivo: 07_poblar_kar_cos_historico_PROD.sql
```
**Qué hace:**
- Puebla `kar_cos` con costos históricos (desde `art_bod_cos_cat`)
- Solo para ventas (fac_tip_cod = 'VTA')
- Puede tardar 5-10 minutos dependiendo del volumen

**Validación:**
```sql
-- Ver cuántos registros tienen kar_cos
SELECT
    COUNT(*) AS total_ventas,
    COUNT(CASE WHEN kar_cos > 0 THEN 1 END) AS con_costo,
    COUNT(CASE WHEN kar_cos IS NULL OR kar_cos = 0 THEN 1 END) AS sin_costo
FROM dbo.facturakardes fk
INNER JOIN dbo.factura f ON fk.fac_sec = f.fac_sec
WHERE f.fac_tip_cod = 'VTA' AND fk.kar_nat = '-';
```

---

#### Script 3: Crear vista principal
```bash
# Archivo: 01_crear_vista_ventas_dashboard_PROD.sql
```
**Qué hace:**
- Crea vista `vw_ventas_dashboard`
- Incluye cálculos de rentabilidad, costos, categorías
- Base para todos los reportes del dashboard

**Validación:**
```sql
-- Verificar que la vista existe
SELECT COUNT(*) FROM INFORMATION_SCHEMA.VIEWS
WHERE TABLE_NAME = 'vw_ventas_dashboard';
-- Resultado esperado: 1

-- Query de prueba
SELECT COUNT(*) FROM dbo.vw_ventas_dashboard;
```

---

#### Script 4: Crear índices
```bash
# Archivo: 02_indices_performance_PROD.sql
```
**Qué hace:**
- Crea índices en `factura.fac_fec`, `factura.fac_tip_cod`
- Crea índices en `facturakardes.kar_nat`, `facturakardes.kar_bundle_padre`
- Optimiza queries del dashboard

**Validación:**
```sql
-- Verificar índices creados
SELECT name FROM sys.indexes
WHERE object_id = OBJECT_ID('dbo.factura')
AND name LIKE 'IX_factura_%';
```

---

#### Script 5: Corregir vista para bundles
```bash
# Archivo: 13_corregir_vista_bundles_PROD.sql
```
**Qué hace:**
- Actualiza `vw_ventas_dashboard` para excluir componentes de bundles
- Crea vista complementaria `vw_bundles_detalle`
- Corrige cálculos de rentabilidad para bundles

**Validación:**
```sql
-- Verificar que NO hay componentes en la vista principal
SELECT COUNT(*) FROM dbo.vw_ventas_dashboard
WHERE bundle_padre_art_sec IS NOT NULL;
-- Resultado esperado: 0

-- Verificar que existe la vista de bundles
SELECT COUNT(*) FROM INFORMATION_SCHEMA.VIEWS
WHERE TABLE_NAME = 'vw_bundles_detalle';
-- Resultado esperado: 1
```

---

### PASO 3: Validación Final

```sql
-- 1. Verificar estructura completa
SELECT
    'kar_cos agregado' AS item,
    CASE WHEN EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'facturakardes' AND COLUMN_NAME = 'kar_cos'
    ) THEN '✓' ELSE '✗' END AS status
UNION ALL
SELECT
    'vista vw_ventas_dashboard',
    CASE WHEN EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.VIEWS
        WHERE TABLE_NAME = 'vw_ventas_dashboard'
    ) THEN '✓' ELSE '✗' END
UNION ALL
SELECT
    'vista vw_bundles_detalle',
    CASE WHEN EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.VIEWS
        WHERE TABLE_NAME = 'vw_bundles_detalle'
    ) THEN '✓' ELSE '✗' END;

-- 2. Query de prueba del dashboard (últimos 7 días)
SELECT
    COUNT(DISTINCT fac_nro) AS ordenes,
    SUM(total_linea) AS ventas_totales,
    SUM(utilidad_linea) AS utilidad_total,
    AVG(rentabilidad_real) AS rentabilidad_promedio
FROM dbo.vw_ventas_dashboard
WHERE fecha_venta >= DATEADD(DAY, -7, GETDATE());
```

---

## 🔄 SCRIPTS OPCIONALES

### Script: Corregir Secuencias (Recomendado)
```bash
# Archivo: 10_corregir_todas_secuencias_PROD.sql
```
**Cuándo ejecutar:**
- Si has tenido errores de PRIMARY KEY violation
- Como prevención después de importar datos
- Ejecutar cada 3 meses como mantenimiento

---

### Script: Actualizar kar_cos Faltantes (Periódico)
```bash
# Archivo: 11_actualizar_kar_cos_faltantes_PROD.sql
```
**Cuándo ejecutar:**
- Después de asignar costos a artículos nuevos
- Mensualmente para mantener datos actualizados
- Cuando reportes muestren productos sin costo

---

## 📊 MONITOREO POST-IMPLEMENTACIÓN

### Durante las primeras 24 horas:

1. **Monitorear performance de queries:**
```sql
-- Verificar tiempo de ejecución de la vista
SET STATISTICS TIME ON;
SELECT COUNT(*) FROM dbo.vw_ventas_dashboard;
SET STATISTICS TIME OFF;
```

2. **Verificar que backend funciona:**
```bash
# Probar endpoints del dashboard
GET /api/ventas/kpis?fechaInicio=2026-02-01&fechaFin=2026-02-17
GET /api/ventas/productos-top?fechaInicio=2026-02-01&fechaFin=2026-02-17
```

3. **Revisar logs de errores:**
```sql
-- Buscar errores relacionados con la vista
SELECT * FROM sys.messages
WHERE message_id IN (SELECT message_id FROM sys.messages WHERE text LIKE '%vw_ventas_dashboard%');
```

---

## ⚠️ ROLLBACK (En caso de problemas)

Si algo sale mal, ejecutar en orden:

```sql
-- 1. Eliminar vistas
DROP VIEW IF EXISTS dbo.vw_bundles_detalle;
DROP VIEW IF EXISTS dbo.vw_ventas_dashboard;

-- 2. Eliminar índices creados
DROP INDEX IF EXISTS IX_factura_fac_fec ON dbo.factura;
DROP INDEX IF EXISTS IX_factura_fac_tip_cod ON dbo.factura;
DROP INDEX IF EXISTS IX_facturakardes_kar_nat ON dbo.facturakardes;
DROP INDEX IF EXISTS IX_facturakardes_kar_bundle_padre ON dbo.facturakardes;
DROP INDEX IF EXISTS IX_facturakardes_kar_cos ON dbo.facturakardes;

-- 3. Eliminar columna kar_cos (solo si es crítico)
ALTER TABLE dbo.facturakardes DROP COLUMN IF EXISTS kar_cos;

-- 4. Restaurar backup
RESTORE DATABASE [SyscomElRedentor]
FROM DISK = 'C:\Backups\SyscomElRedentor_PreDashboard_2026-02-17.bak'
WITH REPLACE;
```

---

## 📝 CHECKLIST DE IMPLEMENTACIÓN

### Pre-implementación:
- [ ] Backup completo de la base de datos
- [ ] Ventana de mantenimiento coordinada
- [ ] Scripts renombrados con sufijo _PROD
- [ ] Conexión a producción verificada

### Durante implementación:
- [ ] Script 1: Agregar kar_cos (06_agregar_kar_cos_PROD.sql)
- [ ] Script 2: Poblar kar_cos histórico (07_poblar_kar_cos_historico_PROD.sql)
- [ ] Script 3: Crear vista principal (01_crear_vista_ventas_dashboard_PROD.sql)
- [ ] Script 4: Crear índices (02_indices_performance_PROD.sql)
- [ ] Script 5: Corregir vista bundles (13_corregir_vista_bundles_PROD.sql)
- [ ] Validación final ejecutada

### Post-implementación:
- [ ] Verificar que endpoints del backend funcionan
- [ ] Probar dashboard desde frontend
- [ ] Monitorear performance durante 24 horas
- [ ] Validar cálculos de rentabilidad
- [ ] Documentar cualquier issue

---

## 📞 SOPORTE

**Documentación técnica:**
- Análisis de bundles: `ANALISIS_BUNDLES_RENTABILIDAD.md`
- Costos históricos: `COSTOS_HISTORICOS.md`
- Estructura: `ESTRUCTURA_ARCHIVOS.md`

**Scripts de diagnóstico:**
- `05_verificar_kar_cos.sql` - Estado de kar_cos
- `12_diagnostico_rentabilidad_negativa.sql` - Análisis de rentabilidad

---

**✅ Implementación lista para producción**

**Tiempo total estimado:** 20-30 minutos
**Última actualización:** 2026-02-17
