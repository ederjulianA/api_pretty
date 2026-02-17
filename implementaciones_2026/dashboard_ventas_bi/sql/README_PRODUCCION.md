# Scripts SQL para Producción - Dashboard de Ventas BI

**Fecha:** 2026-02-17
**Versión:** 3.0

---

## 🎯 SCRIPTS PARA PRODUCCIÓN (Ejecutar en este orden)

### ✅ Scripts Obligatorios:

| Orden | Script | Descripción | Tiempo |
|-------|--------|-------------|--------|
| 1️⃣ | **06_agregar_kar_cos_PROD.sql** | Agrega columna kar_cos a facturakardes | 2 min |
| 2️⃣ | **07_poblar_kar_cos_historico_PROD.sql** | Puebla kar_cos con datos históricos | 5-10 min |
| 3️⃣ | **01_crear_vista_ventas_dashboard_PROD.sql** | Crea vista principal vw_ventas_dashboard | 1 min |
| 4️⃣ | **02_indices_performance_PROD.sql** | Crea índices de optimización | 2 min |
| 5️⃣ | **13_corregir_vista_bundles_PROD.sql** | Actualiza vista para bundles | 2 min |

**Tiempo total:** ~20-30 minutos

---

## 📋 ANTES DE EMPEZAR

### ⚠️ PREREQUISITOS OBLIGATORIOS:

```sql
-- 1. HACER BACKUP COMPLETO
BACKUP DATABASE [SyscomElRedentor]
TO DISK = 'C:\Backups\SyscomElRedentor_PreDashboard_2026-02-17.bak'
WITH FORMAT, INIT;
```

### 2. Cambiar nombre de base de datos:

Todos los scripts tienen esta línea al inicio:
```sql
USE [SyscomElRedentor]; -- ⚠️ CAMBIAR AL NOMBRE DE TU BASE DE DATOS
```

**Cambia `SyscomElRedentor` por el nombre de tu base de datos.**

---

## 🚀 EJECUCIÓN PASO A PASO

### Paso 1: Agregar kar_cos
```sql
-- Ejecutar: 06_agregar_kar_cos_PROD.sql
```
**Validación:**
```sql
SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'facturakardes' AND COLUMN_NAME = 'kar_cos';
-- Resultado esperado: 1
```

### Paso 2: Poblar kar_cos histórico
```sql
-- Ejecutar: 07_poblar_kar_cos_historico_PROD.sql
```
**Validación:**
```sql
SELECT
    COUNT(*) AS total_ventas,
    COUNT(CASE WHEN kar_cos > 0 THEN 1 END) AS con_costo
FROM dbo.facturakardes fk
INNER JOIN dbo.factura f ON fk.fac_sec = f.fac_sec
WHERE f.fac_tip_cod = 'VTA' AND fk.kar_nat = '-';
```

### Paso 3: Crear vista principal
```sql
-- Ejecutar: 01_crear_vista_ventas_dashboard_PROD.sql
```
**Validación:**
```sql
SELECT COUNT(*) FROM INFORMATION_SCHEMA.VIEWS
WHERE TABLE_NAME = 'vw_ventas_dashboard';
-- Resultado esperado: 1
```

### Paso 4: Crear índices
```sql
-- Ejecutar: 02_indices_performance_PROD.sql
```
**Validación:**
```sql
SELECT name FROM sys.indexes
WHERE object_id = OBJECT_ID('dbo.factura')
AND name LIKE 'IX_factura_%';
```

### Paso 5: Corregir vista para bundles
```sql
-- Ejecutar: 13_corregir_vista_bundles_PROD.sql
```
**Validación:**
```sql
-- Verificar que NO hay componentes en la vista
SELECT COUNT(*) FROM dbo.vw_ventas_dashboard
WHERE bundle_padre_art_sec IS NOT NULL;
-- Resultado esperado: 0

-- Verificar vista de bundles
SELECT COUNT(*) FROM INFORMATION_SCHEMA.VIEWS
WHERE TABLE_NAME = 'vw_bundles_detalle';
-- Resultado esperado: 1
```

---

## ✅ VALIDACIÓN FINAL

Ejecutar este query para verificar que todo está correcto:

```sql
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
    ) THEN '✓' ELSE '✗' END
UNION ALL
SELECT
    'índice IX_factura_fac_fec',
    CASE WHEN EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = 'IX_factura_fac_fec'
    ) THEN '✓' ELSE '✗' END
UNION ALL
SELECT
    'índice IX_facturakardes_kar_cos',
    CASE WHEN EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = 'IX_facturakardes_kar_cos'
    ) THEN '✓' ELSE '✗' END;
```

**Resultado esperado:** Todos los items con '✓'

---

## 📊 QUERY DE PRUEBA FINAL

```sql
-- KPIs de los últimos 7 días
SELECT
    COUNT(DISTINCT fac_nro) AS ordenes,
    SUM(total_linea) AS ventas_totales,
    SUM(utilidad_linea) AS utilidad_total,
    AVG(rentabilidad_real) AS rentabilidad_promedio
FROM dbo.vw_ventas_dashboard
WHERE fecha_venta >= DATEADD(DAY, -7, GETDATE());
```

---

## 🔄 OTROS SCRIPTS (Información)

### Scripts Opcionales:

| Script | Cuándo Ejecutar |
|--------|-----------------|
| `09_corregir_secuencia_factura.sql` | Solo si tienes errores de PRIMARY KEY en fac_sec |
| `10_corregir_todas_secuencias.sql` | Mantenimiento preventivo (cada 3 meses) |
| `11_actualizar_kar_cos_faltantes.sql` | Mensualmente para actualizar costos faltantes |

### Scripts de Diagnóstico (NO ejecutar en producción):

| Script | Uso |
|--------|-----|
| `03_diagnostico_rentabilidad_negativa.sql` | Analizar rentabilidad negativa (desarrollo) |
| `04_diagnostico_periodo_especifico.sql` | Análisis de período (desarrollo) |
| `05_verificar_kar_cos.sql` | Verificar estado de kar_cos (desarrollo) |
| `12_diagnostico_rentabilidad_negativa.sql` | Diagnóstico detallado (desarrollo) |

### Scripts Originales (SIN sufijo _PROD):

Los scripts **sin** el sufijo `_PROD` son las versiones originales que pueden tener el nombre de base de datos de desarrollo. **NO ejecutar en producción.**

---

## 📞 DOCUMENTACIÓN COMPLETA

Para información detallada, consulta:
- **`../GUIA_IMPLEMENTACION_PRODUCCION.md`** - Guía completa con validaciones
- **`../ANALISIS_BUNDLES_RENTABILIDAD.md`** - Análisis técnico de bundles
- **`../COSTOS_HISTORICOS.md`** - Documentación del sistema de costos

---

## ⚠️ EN CASO DE PROBLEMAS

### Rollback Completo:

```sql
-- Restaurar desde backup
RESTORE DATABASE [SyscomElRedentor]
FROM DISK = 'C:\Backups\SyscomElRedentor_PreDashboard_2026-02-17.bak'
WITH REPLACE;
```

### Rollback Parcial (solo vistas e índices):

```sql
-- Eliminar vistas
DROP VIEW IF EXISTS dbo.vw_bundles_detalle;
DROP VIEW IF EXISTS dbo.vw_ventas_dashboard;

-- Eliminar índices
DROP INDEX IF EXISTS IX_factura_fac_fec ON dbo.factura;
DROP INDEX IF EXISTS IX_factura_fac_tip_cod ON dbo.factura;
DROP INDEX IF EXISTS IX_facturakardes_kar_nat ON dbo.facturakardes;
DROP INDEX IF EXISTS IX_facturakardes_kar_bundle_padre ON dbo.facturakardes;
DROP INDEX IF EXISTS IX_facturakardes_kar_cos ON dbo.facturakardes;
```

---

## ✅ CHECKLIST

- [ ] Backup de base de datos realizado
- [ ] Nombre de base de datos actualizado en scripts
- [ ] Script 1: 06_agregar_kar_cos_PROD.sql ejecutado y validado
- [ ] Script 2: 07_poblar_kar_cos_historico_PROD.sql ejecutado y validado
- [ ] Script 3: 01_crear_vista_ventas_dashboard_PROD.sql ejecutado y validado
- [ ] Script 4: 02_indices_performance_PROD.sql ejecutado y validado
- [ ] Script 5: 13_corregir_vista_bundles_PROD.sql ejecutado y validado
- [ ] Validación final ejecutada (todos con ✓)
- [ ] Query de prueba ejecutado correctamente
- [ ] Backend funciona correctamente
- [ ] Frontend muestra datos correctos

---

**✅ Implementación lista para producción**

**Última actualización:** 2026-02-17
