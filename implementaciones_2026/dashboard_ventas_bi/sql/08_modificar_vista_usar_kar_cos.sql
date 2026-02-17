/**
 * Script SQL: Modificar vista vw_ventas_dashboard para usar kar_cos
 * Fecha: 2026-02-17
 * Versión: 2.0
 * Descripción: Actualiza la vista para calcular rentabilidad real
 *              usando kar_cos (costo histórico) en lugar de art_bod_cos_cat
 *
 * IMPORTANTE:
 * - Ejecutar DESPUÉS de 06_agregar_kar_cos.sql y 07_poblar_kar_cos_historico.sql
 * - Este cambio afectará inmediatamente al dashboard de ventas
 * - La rentabilidad se calculará sobre precio final real (kar_total)
 * - Hacer backup de la base de datos antes de ejecutar en producción
 */

USE [pruebas_ps_02092026]; -- Cambiar por tu base de datos
GO

PRINT '========================================';
PRINT 'Modificar vista vw_ventas_dashboard';
PRINT '========================================';
PRINT '';

-- =============================================
-- PASO 1: Verificar prerequisitos
-- =============================================
PRINT 'Paso 1: Verificando prerequisitos...';
PRINT '--------------------------------------';

-- Verificar que existe la columna kar_cos
IF NOT EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'facturakardes'
      AND COLUMN_NAME = 'kar_cos'
)
BEGIN
    PRINT '❌ ERROR: No existe la columna kar_cos en facturakardes';
    PRINT '   Debe ejecutar primero:';
    PRINT '   1. 06_agregar_kar_cos.sql';
    PRINT '   2. 07_poblar_kar_cos_historico.sql';
    RETURN;
END
ELSE
BEGIN
    PRINT '✓ Columna kar_cos existe en facturakardes';
END

-- Verificar que existe la vista
IF NOT EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.VIEWS
    WHERE TABLE_NAME = 'vw_ventas_dashboard'
)
BEGIN
    PRINT '❌ ERROR: No existe la vista vw_ventas_dashboard';
    PRINT '   Debe ejecutar primero: 01_crear_vista_ventas_dashboard.sql';
    RETURN;
END
ELSE
BEGIN
    PRINT '✓ Vista vw_ventas_dashboard existe';
END

PRINT '';

-- =============================================
-- PASO 2: Eliminar vista anterior
-- =============================================
PRINT 'Paso 2: Eliminando vista anterior...';
PRINT '--------------------------------------';

DROP VIEW dbo.vw_ventas_dashboard;

PRINT '✓ Vista anterior eliminada';
PRINT '';

-- =============================================
-- PASO 3: Crear vista actualizada con kar_cos
-- =============================================
PRINT 'Paso 3: Creando vista actualizada...';
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
    -- COSTOS Y RENTABILIDAD REAL
    -- ==========================================
    -- NUEVO: Usar kar_cos (costo histórico) en lugar de art_bod_cos_cat
    fk.kar_cos AS costo_historico_unitario,
    (fk.kar_uni * ISNULL(fk.kar_cos, 0)) AS costo_total_linea,
    (fk.kar_total - (fk.kar_uni * ISNULL(fk.kar_cos, 0))) AS utilidad_linea,

    -- Rentabilidad REAL calculada sobre precio final
    CASE
        WHEN fk.kar_total > 0
        THEN ((fk.kar_total - (fk.kar_uni * ISNULL(fk.kar_cos, 0))) / fk.kar_total * 100)
        ELSE 0
    END AS rentabilidad_real,

    -- Margen REAL calculado sobre precio final
    CASE
        WHEN fk.kar_total > 0
        THEN ((fk.kar_total - (fk.kar_uni * ISNULL(fk.kar_cos, 0))) / (fk.kar_uni * ISNULL(fk.kar_cos, 0)) * 100)
        ELSE 0
    END AS margen_real,

    -- Columnas calculadas de rentabilidad TEÓRICA (de articulosdetalle)
    -- Se mantienen para comparación
    ad.rentabilidad AS rentabilidad_teorica,
    ad.margen_ganancia AS margen_teorico,
    ad.utilidad_bruta AS utilidad_teorica,
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
PRINT 'Paso 4: Verificando creación...';
PRINT '--------------------------------';

IF OBJECT_ID('dbo.vw_ventas_dashboard', 'V') IS NOT NULL
BEGIN
    PRINT '✓ Vista vw_ventas_dashboard actualizada exitosamente';
END
ELSE
BEGIN
    PRINT '❌ ERROR: No se pudo actualizar la vista';
    RETURN;
END

PRINT '';

-- =============================================
-- PASO 5: Query de validación
-- =============================================
PRINT 'Paso 5: Query de validación...';
PRINT '-------------------------------';

-- Comparar rentabilidad teórica vs real
SELECT TOP 10
    art_cod,
    art_nom,
    precio_unitario,
    costo_historico_unitario,
    total_linea,
    costo_total_linea,
    utilidad_linea,
    rentabilidad_real,
    rentabilidad_teorica,
    (rentabilidad_real - rentabilidad_teorica) AS diferencia_rentabilidad
FROM dbo.vw_ventas_dashboard
WHERE costo_historico_unitario > 0
ORDER BY ABS(rentabilidad_real - rentabilidad_teorica) DESC;

PRINT '';
PRINT '========================================';
PRINT '✓ Script completado exitosamente';
PRINT '========================================';
PRINT '';
PRINT 'CAMBIOS REALIZADOS:';
PRINT '- Rentabilidad ahora se calcula con kar_cos (costo histórico)';
PRINT '- Utilidad se calcula sobre kar_total (precio final con descuentos)';
PRINT '- Se agregó rentabilidad_real y margen_real';
PRINT '- Se mantienen columnas teóricas para comparación';
PRINT '';
PRINT 'IMPACTO:';
PRINT '- El dashboard mostrará rentabilidad REAL inmediatamente';
PRINT '- Los reportes reflejarán promociones, combos y descuentos';
PRINT '';
PRINT 'Próximos pasos:';
PRINT '1. Validar dashboard de ventas BI';
PRINT '2. Modificar backend para incluir kar_cos en nuevas ventas';
PRINT '3. Actualizar modelos que usan rentabilidad para usar rentabilidad_real';
PRINT '';
GO
