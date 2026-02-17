/**
 * Script SQL: Crear Vista Principal para Dashboard de Ventas BI
 * Fecha: 2026-02-17
 * Base de datos: SQL Server
 * Descripción: Vista optimizada que consolida ventas, productos, costos,
 *              rentabilidad y clientes para análisis de Business Intelligence
 *
 * IMPORTANTE:
 * - Esta vista utiliza las columnas calculadas de rentabilidad ya existentes
 * - Ejecutar después de tener implementado el sistema de rentabilidad
 * - Hacer backup de la base de datos antes de ejecutar en producción
 */

USE [pruebas_ps_02092026]; -- Cambiar por tu base de datos
GO

-- =============================================
-- PASO 1: Verificar prerequisitos
-- =============================================
PRINT '========================================';
PRINT 'Verificando prerequisitos';
PRINT '========================================';
GO

-- Verificar que existen las columnas calculadas de rentabilidad
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.articulosdetalle')
    AND name = 'rentabilidad'
)
BEGIN
    PRINT '❌ ERROR: No existe la columna rentabilidad en articulosdetalle';
    PRINT '   Debe ejecutar primero: implementaciones_2026/sistema_rentabilidad/01_agregar_columnas_calculadas.sql';
    RETURN;
END
ELSE
BEGIN
    PRINT '✓ Columna rentabilidad existe';
END
GO

-- =============================================
-- PASO 2: Eliminar vista si ya existe
-- =============================================
IF OBJECT_ID('dbo.vw_ventas_dashboard', 'V') IS NOT NULL
BEGIN
    PRINT '';
    PRINT 'Eliminando vista existente...';
    DROP VIEW dbo.vw_ventas_dashboard;
    PRINT '✓ Vista anterior eliminada';
END
GO

-- =============================================
-- PASO 3: Crear vista vw_ventas_dashboard
-- =============================================
PRINT '';
PRINT 'Creando vista vw_ventas_dashboard...';
PRINT '-------------------------------------';
GO

CREATE VIEW dbo.vw_ventas_dashboard AS
SELECT
    -- ==========================================
    -- IDENTIFICADORES DE FACTURA
    -- ==========================================
    f.fac_sec,
    f.fac_nro,
    f.fac_fec AS fecha_factura,
    CAST(f.fac_fec AS DATE) AS fecha_venta,

    -- ==========================================
    -- SEGMENTACIÓN TEMPORAL
    -- ==========================================
    DATEPART(YEAR, f.fac_fec) AS anio,
    DATEPART(MONTH, f.fac_fec) AS mes,
    DATEPART(WEEK, f.fac_fec) AS semana,
    DATEPART(WEEKDAY, f.fac_fec) AS dia_semana,
    DATEPART(HOUR, f.fac_fec) AS hora,

    -- ==========================================
    -- CANAL DE VENTA
    -- ==========================================
    CASE
        WHEN f.fac_nro_woo IS NOT NULL THEN 'WooCommerce'
        ELSE 'Local'
    END AS canal_venta,

    -- ==========================================
    -- INFORMACIÓN DEL CLIENTE
    -- ==========================================
    f.nit_sec,
    n.nit_nom AS cliente_nombre,
    n.nit_email AS cliente_email,
    n.nit_tel AS cliente_telefono,
    n.nit_ciudad AS cliente_ciudad,

    -- ==========================================
    -- ESTADOS DE LA ORDEN
    -- ==========================================
    f.fac_est_fac AS estado_interno,
    f.fac_est_woo AS estado_woo,
    f.fac_nro_woo AS numero_orden_woo,
    f.fac_nro_origen,

    -- ==========================================
    -- DETALLES DE PRODUCTOS (desde kardex)
    -- ==========================================
    fk.kar_sec AS linea_numero,
    fk.art_sec,
    a.art_cod,
    a.art_nom,
    fk.kar_uni AS cantidad_vendida,
    fk.kar_pre AS precio_unitario,
    fk.kar_sub_tot AS subtotal_linea,
    fk.kar_total AS total_linea,
    fk.kar_lis_pre_cod AS lista_precios,

    -- ==========================================
    -- COSTOS Y RENTABILIDAD
    -- ==========================================
    ad.art_bod_cos_cat AS costo_promedio_unitario,
    (fk.kar_uni * ISNULL(ad.art_bod_cos_cat, 0)) AS costo_total_linea,
    (fk.kar_total - (fk.kar_uni * ISNULL(ad.art_bod_cos_cat, 0))) AS utilidad_linea,

    -- Columnas calculadas de rentabilidad
    ad.rentabilidad,
    ad.margen_ganancia,
    ad.utilidad_bruta,
    ad.clasificacion_rentabilidad,

    -- ==========================================
    -- CATEGORÍAS
    -- ==========================================
    ig.inv_gru_cod,
    ig.inv_gru_nom AS categoria,
    isg.inv_sub_gru_cod,
    isg.inv_sub_gru_nom AS subcategoria,

    -- ==========================================
    -- INFORMACIÓN ADICIONAL DE PRODUCTO
    -- ==========================================
    a.art_woo_type AS tipo_producto_woo,
    a.art_bundle AS es_bundle

FROM dbo.factura f
    LEFT JOIN dbo.nit n
        ON f.nit_sec = n.nit_sec
    LEFT JOIN dbo.facturakardes fk
        ON f.fac_sec = fk.fac_sec
    LEFT JOIN dbo.articulos a
        ON fk.art_sec = a.art_sec
    LEFT JOIN dbo.articulosdetalle ad
        ON a.art_sec = ad.art_sec
        AND ad.lis_pre_cod = 1  -- Precio al detal
        AND ad.bod_sec = '1'    -- Bodega principal
    LEFT JOIN dbo.inventario_subgrupo isg
        ON a.inv_sub_gru_cod = isg.inv_sub_gru_cod
    LEFT JOIN dbo.inventario_grupo ig
        ON isg.inv_gru_cod = ig.inv_gru_cod

WHERE
    -- Solo facturas activas
    f.fac_est_fac = 'A'
    -- Solo salidas (ventas)
    AND fk.kar_nat = '-'
    -- Solo facturas de venta (excluir ajustes, devoluciones, etc.)
    AND f.fac_tip_cod = 'VTA';

GO

-- =============================================
-- PASO 4: Verificar creación de la vista
-- =============================================
PRINT '';
PRINT '========================================';
PRINT 'Verificando creación de la vista';
PRINT '========================================';
GO

IF OBJECT_ID('dbo.vw_ventas_dashboard', 'V') IS NOT NULL
BEGIN
    PRINT '✓ Vista vw_ventas_dashboard creada exitosamente';
END
ELSE
BEGIN
    PRINT '❌ ERROR: No se pudo crear la vista';
    RETURN;
END
GO

-- =============================================
-- PASO 5: Query de prueba
-- =============================================
PRINT '';
PRINT '========================================';
PRINT 'Ejecutando query de prueba';
PRINT '========================================';
GO

-- Contar registros de los últimos 30 días
DECLARE @fecha_inicio DATE = DATEADD(DAY, -30, GETDATE());
DECLARE @fecha_fin DATE = GETDATE();

SELECT
    COUNT(DISTINCT fac_nro) AS total_ordenes,
    COUNT(*) AS total_lineas,
    SUM(total_linea) AS ventas_totales,
    SUM(utilidad_linea) AS utilidad_total,
    AVG(rentabilidad) AS rentabilidad_promedio
FROM dbo.vw_ventas_dashboard
WHERE fecha_venta >= @fecha_inicio
  AND fecha_venta <= @fecha_fin;

PRINT '';
PRINT '✓ Query de prueba ejecutada exitosamente';
GO

-- =============================================
-- PASO 6: Ejemplos de uso
-- =============================================
PRINT '';
PRINT '========================================';
PRINT 'Ejemplos de uso de la vista';
PRINT '========================================';
PRINT '';
PRINT '-- KPIs principales de los últimos 7 días:';
PRINT 'SELECT';
PRINT '    COUNT(DISTINCT fac_nro) AS numero_ordenes,';
PRINT '    SUM(total_linea) AS ventas_totales,';
PRINT '    AVG(total_linea) AS ticket_promedio,';
PRINT '    SUM(utilidad_linea) AS utilidad_total';
PRINT 'FROM dbo.vw_ventas_dashboard';
PRINT 'WHERE fecha_venta >= DATEADD(DAY, -7, GETDATE());';
PRINT '';
PRINT '-- Top 10 productos más vendidos:';
PRINT 'SELECT TOP 10';
PRINT '    art_cod,';
PRINT '    art_nom,';
PRINT '    SUM(cantidad_vendida) AS unidades_vendidas,';
PRINT '    SUM(total_linea) AS ingresos_totales';
PRINT 'FROM dbo.vw_ventas_dashboard';
PRINT 'WHERE fecha_venta >= DATEADD(DAY, -30, GETDATE())';
PRINT 'GROUP BY art_cod, art_nom';
PRINT 'ORDER BY SUM(total_linea) DESC;';
PRINT '';
PRINT '-- Ventas por categoría:';
PRINT 'SELECT';
PRINT '    categoria,';
PRINT '    SUM(total_linea) AS ventas_totales,';
PRINT '    AVG(rentabilidad) AS rentabilidad_promedio';
PRINT 'FROM dbo.vw_ventas_dashboard';
PRINT 'WHERE fecha_venta >= DATEADD(DAY, -30, GETDATE())';
PRINT 'GROUP BY categoria';
PRINT 'ORDER BY ventas_totales DESC;';
PRINT '';

PRINT '========================================';
PRINT '✓ Script completado exitosamente';
PRINT '========================================';
PRINT '';
PRINT 'Próximos pasos:';
PRINT '1. Ejecutar: sql/02_indices_performance.sql';
PRINT '2. Implementar backend: models/ventasKpiModel.js';
PRINT '3. Probar endpoints del API';
PRINT '';
GO
