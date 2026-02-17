-- =============================================
-- Diagnóstico: Utilidad por Período Específico
-- =============================================
USE [pruebas_ps_02092026]; -- Cambiar por tu base de datos
GO

PRINT '========================================';
PRINT 'DIAGNÓSTICO: Período Específico';
PRINT '========================================';
PRINT '';

-- =============================================
-- Configurar período (ajustar según necesites)
-- =============================================
DECLARE @fecha_inicio DATE = DATEADD(DAY, -30, GETDATE());  -- Últimos 30 días
DECLARE @fecha_fin DATE = GETDATE();

PRINT 'Período analizado:';
PRINT 'Desde: ' + CAST(@fecha_inicio AS VARCHAR);
PRINT 'Hasta: ' + CAST(@fecha_fin AS VARCHAR);
PRINT '';

-- =============================================
-- 1. KPIs del Período (lo mismo que el dashboard)
-- =============================================
PRINT '1. KPIs Principales (Dashboard)';
PRINT '--------------------------------';

SELECT
    SUM(total_linea) AS ventas_totales,
    COUNT(DISTINCT fac_nro) AS numero_ordenes,
    CASE
        WHEN COUNT(DISTINCT fac_nro) > 0
        THEN SUM(total_linea) / COUNT(DISTINCT fac_nro)
        ELSE 0
    END AS ticket_promedio,
    COUNT(DISTINCT nit_sec) AS clientes_unicos,
    SUM(cantidad_vendida) AS unidades_vendidas,
    SUM(utilidad_linea) AS utilidad_bruta_total,
    AVG(rentabilidad) AS rentabilidad_promedio,
    SUM(costo_total_linea) AS costo_total_ventas,
    -- Rentabilidad REAL del período
    CASE
        WHEN SUM(total_linea) > 0
        THEN (SUM(utilidad_linea) / SUM(total_linea) * 100)
        ELSE 0
    END AS rentabilidad_real_porcentaje
FROM dbo.vw_ventas_dashboard
WHERE fecha_venta >= @fecha_inicio
  AND fecha_venta <= @fecha_fin;

PRINT '';

-- =============================================
-- 2. Productos con PÉRDIDA en el período
-- =============================================
PRINT '2. Top 10 Productos con PÉRDIDA en el período';
PRINT '----------------------------------------------';

SELECT TOP 10
    art_cod,
    art_nom,
    SUM(cantidad_vendida) AS unidades_vendidas,
    AVG(precio_unitario) AS precio_venta_promedio,
    AVG(costo_promedio_unitario) AS costo_promedio,
    SUM(total_linea) AS ventas_totales,
    SUM(costo_total_linea) AS costo_total,
    SUM(utilidad_linea) AS utilidad_total,
    CASE
        WHEN SUM(total_linea) > 0
        THEN (SUM(utilidad_linea) / SUM(total_linea) * 100)
        ELSE 0
    END AS rentabilidad_real
FROM dbo.vw_ventas_dashboard
WHERE fecha_venta >= @fecha_inicio
  AND fecha_venta <= @fecha_fin
GROUP BY art_cod, art_nom
HAVING SUM(utilidad_linea) < 0  -- Solo productos con pérdida
ORDER BY SUM(utilidad_linea) ASC;

PRINT '';

-- =============================================
-- 3. Productos SIN COSTO en el período
-- =============================================
PRINT '3. Productos SIN COSTO en el período';
PRINT '-------------------------------------';

SELECT
    art_cod,
    art_nom,
    SUM(cantidad_vendida) AS unidades_vendidas,
    SUM(total_linea) AS ventas_totales,
    COUNT(*) AS lineas_venta
FROM dbo.vw_ventas_dashboard
WHERE fecha_venta >= @fecha_inicio
  AND fecha_venta <= @fecha_fin
  AND (costo_promedio_unitario IS NULL OR costo_promedio_unitario = 0)
GROUP BY art_cod, art_nom
ORDER BY ventas_totales DESC;

PRINT '';

-- =============================================
-- 4. Distribución de Utilidad (Positiva vs Negativa)
-- =============================================
PRINT '4. Distribución de Utilidad';
PRINT '----------------------------';

SELECT
    CASE
        WHEN utilidad_linea > 0 THEN 'Con Utilidad Positiva'
        WHEN utilidad_linea < 0 THEN 'Con Pérdida'
        ELSE 'Sin Utilidad'
    END AS tipo_utilidad,
    COUNT(*) AS lineas,
    SUM(total_linea) AS ventas_totales,
    SUM(utilidad_linea) AS utilidad_total
FROM dbo.vw_ventas_dashboard
WHERE fecha_venta >= @fecha_inicio
  AND fecha_venta <= @fecha_fin
GROUP BY
    CASE
        WHEN utilidad_linea > 0 THEN 'Con Utilidad Positiva'
        WHEN utilidad_linea < 0 THEN 'Con Pérdida'
        ELSE 'Sin Utilidad'
    END
ORDER BY utilidad_total ASC;

PRINT '';

-- =============================================
-- 5. Tendencia diaria de utilidad
-- =============================================
PRINT '5. Tendencia Diaria de Utilidad';
PRINT '--------------------------------';

SELECT
    fecha_venta,
    COUNT(DISTINCT fac_nro) AS ordenes,
    SUM(total_linea) AS ventas,
    SUM(utilidad_linea) AS utilidad,
    CASE
        WHEN SUM(total_linea) > 0
        THEN (SUM(utilidad_linea) / SUM(total_linea) * 100)
        ELSE 0
    END AS rentabilidad_real
FROM dbo.vw_ventas_dashboard
WHERE fecha_venta >= @fecha_inicio
  AND fecha_venta <= @fecha_fin
GROUP BY fecha_venta
ORDER BY fecha_venta DESC;

PRINT '';
PRINT '========================================';
PRINT 'FIN DEL DIAGNÓSTICO';
PRINT '========================================';
GO
