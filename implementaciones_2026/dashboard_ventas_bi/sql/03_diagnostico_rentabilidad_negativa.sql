-- =============================================
-- Diagnóstico: ¿Por qué hay utilidad negativa?
-- =============================================
USE [pruebas_ps_02092026]; -- Cambiar por tu base de datos
GO

PRINT '========================================';
PRINT 'DIAGNÓSTICO: Utilidad Bruta Negativa';
PRINT '========================================';
PRINT '';

-- =============================================
-- 1. Resumen General
-- =============================================
PRINT '1. Resumen de Ventas y Costos';
PRINT '------------------------------';

SELECT
    COUNT(DISTINCT fac_nro) AS total_ordenes,
    COUNT(*) AS total_lineas,
    SUM(total_linea) AS ventas_totales,
    SUM(costo_total_linea) AS costo_total,
    SUM(utilidad_linea) AS utilidad_total,
    AVG(rentabilidad) AS rentabilidad_promedio_teorica,
    -- Rentabilidad REAL calculada
    CASE
        WHEN SUM(total_linea) > 0
        THEN (SUM(utilidad_linea) / SUM(total_linea) * 100)
        ELSE 0
    END AS rentabilidad_real_porcentaje
FROM dbo.vw_ventas_dashboard;

PRINT '';

-- =============================================
-- 2. Productos con Pérdida (utilidad negativa)
-- =============================================
PRINT '2. Top 10 Productos con MAYOR PÉRDIDA';
PRINT '--------------------------------------';

SELECT TOP 10
    art_cod,
    art_nom,
    SUM(cantidad_vendida) AS unidades_vendidas,
    AVG(precio_unitario) AS precio_venta_promedio,
    AVG(costo_promedio_unitario) AS costo_promedio,
    SUM(total_linea) AS ventas_totales,
    SUM(costo_total_linea) AS costo_total,
    SUM(utilidad_linea) AS utilidad_total,
    AVG(rentabilidad) AS rentabilidad_teorica,
    -- Rentabilidad REAL
    CASE
        WHEN SUM(total_linea) > 0
        THEN (SUM(utilidad_linea) / SUM(total_linea) * 100)
        ELSE 0
    END AS rentabilidad_real
FROM dbo.vw_ventas_dashboard
GROUP BY art_cod, art_nom
HAVING SUM(utilidad_linea) < 0  -- Solo productos con pérdida
ORDER BY utilidad_total ASC;  -- Mayor pérdida primero

PRINT '';

-- =============================================
-- 3. Productos sin Costo Asignado
-- =============================================
PRINT '3. Productos vendidos SIN COSTO asignado';
PRINT '-----------------------------------------';

SELECT
    art_cod,
    art_nom,
    SUM(cantidad_vendida) AS unidades_vendidas,
    SUM(total_linea) AS ventas_totales,
    COUNT(*) AS lineas_venta
FROM dbo.vw_ventas_dashboard
WHERE costo_promedio_unitario IS NULL
   OR costo_promedio_unitario = 0
GROUP BY art_cod, art_nom
ORDER BY ventas_totales DESC;

PRINT '';

-- =============================================
-- 4. Líneas individuales con mayor pérdida
-- =============================================
PRINT '4. Top 20 Líneas de venta con MAYOR PÉRDIDA individual';
PRINT '-------------------------------------------------------';

SELECT TOP 20
    fac_nro,
    fecha_venta,
    art_cod,
    art_nom,
    cantidad_vendida,
    precio_unitario,
    costo_promedio_unitario,
    total_linea AS venta_total,
    costo_total_linea,
    utilidad_linea,
    -- Diferencia unitaria
    (precio_unitario - costo_promedio_unitario) AS diferencia_unitaria,
    -- Rentabilidad real de esta línea
    CASE
        WHEN total_linea > 0
        THEN (utilidad_linea / total_linea * 100)
        ELSE 0
    END AS rentabilidad_real_linea
FROM dbo.vw_ventas_dashboard
WHERE utilidad_linea < 0
ORDER BY utilidad_linea ASC;

PRINT '';

-- =============================================
-- 5. Comparación: Rentabilidad Teórica vs Real
-- =============================================
PRINT '5. Comparación por producto: Teórica vs Real';
PRINT '---------------------------------------------';

SELECT
    art_cod,
    art_nom,
    AVG(rentabilidad) AS rentabilidad_teorica_articulosdetalle,
    CASE
        WHEN SUM(total_linea) > 0
        THEN (SUM(utilidad_linea) / SUM(total_linea) * 100)
        ELSE 0
    END AS rentabilidad_real_ventas,
    -- Diferencia entre teórica y real
    CASE
        WHEN SUM(total_linea) > 0
        THEN AVG(rentabilidad) - (SUM(utilidad_linea) / SUM(total_linea) * 100)
        ELSE 0
    END AS diferencia_rentabilidad,
    SUM(total_linea) AS ventas_totales,
    SUM(utilidad_linea) AS utilidad_total
FROM dbo.vw_ventas_dashboard
GROUP BY art_cod, art_nom
ORDER BY diferencia_rentabilidad DESC;

PRINT '';

-- =============================================
-- 6. Resumen por Clasificación de Rentabilidad
-- =============================================
PRINT '6. Ventas por Clasificación de Rentabilidad';
PRINT '--------------------------------------------';

SELECT
    clasificacion_rentabilidad,
    COUNT(*) AS lineas_vendidas,
    SUM(total_linea) AS ventas_totales,
    SUM(utilidad_linea) AS utilidad_total,
    AVG(rentabilidad) AS rentabilidad_teorica_promedio,
    CASE
        WHEN SUM(total_linea) > 0
        THEN (SUM(utilidad_linea) / SUM(total_linea) * 100)
        ELSE 0
    END AS rentabilidad_real_promedio
FROM dbo.vw_ventas_dashboard
WHERE clasificacion_rentabilidad IS NOT NULL
GROUP BY clasificacion_rentabilidad
ORDER BY
    CASE clasificacion_rentabilidad
        WHEN 'ALTA' THEN 1
        WHEN 'MEDIA' THEN 2
        WHEN 'BAJA' THEN 3
        WHEN 'MINIMA' THEN 4
        WHEN 'PERDIDA' THEN 5
        ELSE 6
    END;

PRINT '';
PRINT '========================================';
PRINT 'FIN DEL DIAGNÓSTICO';
PRINT '========================================';
PRINT '';
PRINT 'ANÁLISIS:';
PRINT '';
PRINT 'Si hay productos con pérdida:';
PRINT '  → Revisar si los costos están actualizados';
PRINT '  → Verificar si hay descuentos excesivos';
PRINT '  → Validar precios de venta vs costo promedio';
PRINT '';
PRINT 'Si hay productos sin costo:';
PRINT '  → Actualizar art_bod_cos_cat en articulosdetalle';
PRINT '  → Ejecutar sistema de costo promedio';
PRINT '';
GO
