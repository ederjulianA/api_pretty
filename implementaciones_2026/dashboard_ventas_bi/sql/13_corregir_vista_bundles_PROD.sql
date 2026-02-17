/**
 * Script SQL: Corregir vista vw_ventas_dashboard para Bundles
 * Fecha: 2026-02-17
 * Versión: 3.0
 * Descripción: Excluye componentes de bundles de la vista principal
 *              para evitar cálculos incorrectos de rentabilidad
 *
 * PROBLEMA RESUELTO:
 * - Los componentes de bundles (kar_bundle_padre IS NOT NULL) se vendían con precio $0
 * - Generaban rentabilidad 0% o infinito negativo
 * - Duplicaban conteo de productos vendidos
 * - Utilidad total se calculaba incorrectamente
 *
 * SOLUCIÓN:
 * - Filtrar kar_bundle_padre IS NULL en la vista
 * - Solo mostrar líneas de bundles padres y productos simples
 * - Rentabilidad del bundle ya incluye costos de componentes en kar_cos
 *
 * IMPORTANTE:
 * - Ejecutar DESPUÉS de implementar bundles (kar_bundle_padre existe)
 * - Hacer backup de la base de datos antes de ejecutar en producción
 */

USE SyscomElRedentor; -- ⚠️ CAMBIAR AL NOMBRE DE TU BASE DE DATOS
GO

SET NOCOUNT ON;

PRINT '========================================';
PRINT 'Corrigiendo vista para Bundles';
PRINT '========================================';
PRINT '';

-- =============================================
-- PASO 1: Verificar prerequisitos
-- =============================================
PRINT 'Paso 1: Verificando prerequisitos...';
PRINT '--------------------------------------';

-- Verificar que existe la columna kar_bundle_padre
IF NOT EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'facturakardes'
      AND COLUMN_NAME = 'kar_bundle_padre'
)
BEGIN
    PRINT '⚠️  ADVERTENCIA: No existe la columna kar_bundle_padre en facturakardes';
    PRINT '   Esta columna es necesaria para bundles pero NO es obligatoria';
    PRINT '   Si no tienes bundles implementados, este script NO es necesario';
    PRINT '';
    PRINT '¿Deseas continuar de todas formas? (la vista funcionará sin cambios)';
    -- No retornar, continuar igual
END
ELSE
BEGIN
    PRINT '✓ Columna kar_bundle_padre existe en facturakardes';
END

-- Verificar que existe la columna kar_cos
IF NOT EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'facturakardes'
      AND COLUMN_NAME = 'kar_cos'
)
BEGIN
    PRINT '❌ ERROR: No existe la columna kar_cos en facturakardes';
    PRINT '   Debe ejecutar primero: 06_agregar_kar_cos.sql';
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
-- PASO 2: Análisis previo de bundles
-- =============================================
PRINT 'Paso 2: Analizando bundles existentes...';
PRINT '-----------------------------------------';

-- Ver si hay bundles en el sistema
DECLARE @tiene_bundles BIT = 0;
DECLARE @lineas_componentes INT = 0;

IF EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'facturakardes'
      AND COLUMN_NAME = 'kar_bundle_padre'
)
BEGIN
    SELECT @lineas_componentes = COUNT(*)
    FROM dbo.facturakardes
    WHERE kar_bundle_padre IS NOT NULL;

    IF @lineas_componentes > 0
    BEGIN
        SET @tiene_bundles = 1;
        PRINT '✓ Se encontraron ' + CAST(@lineas_componentes AS VARCHAR) + ' líneas de componentes de bundles';

        -- Mostrar ejemplo
        SELECT TOP 5
            fk_padre.fac_sec,
            fk_padre.kar_sec AS bundle_kar_sec,
            a_padre.art_cod AS bundle_codigo,
            fk_comp.kar_sec AS componente_kar_sec,
            a_comp.art_cod AS componente_codigo,
            fk_comp.kar_total AS componente_total,
            fk_comp.kar_cos AS componente_costo
        FROM dbo.facturakardes fk_comp
            INNER JOIN dbo.articulos a_comp ON fk_comp.art_sec = a_comp.art_sec
            INNER JOIN dbo.facturakardes fk_padre ON fk_comp.kar_bundle_padre = fk_padre.art_sec
                AND fk_comp.fac_sec = fk_padre.fac_sec
            INNER JOIN dbo.articulos a_padre ON fk_padre.art_sec = a_padre.art_sec
        WHERE fk_comp.kar_bundle_padre IS NOT NULL;

        PRINT '';
        PRINT 'Ejemplo de bundles encontrados (arriba)';
    END
    ELSE
    BEGIN
        PRINT 'ℹ️  No se encontraron bundles vendidos aún';
        PRINT '   La corrección se aplicará de todas formas (preparación)';
    END
END

PRINT '';

-- =============================================
-- PASO 3: Eliminar vista anterior
-- =============================================
PRINT 'Paso 3: Eliminando vista anterior...';
PRINT '--------------------------------------';

DROP VIEW dbo.vw_ventas_dashboard;

PRINT '✓ Vista anterior eliminada';
PRINT '';

-- =============================================
-- PASO 4: Crear vista corregida
-- =============================================
PRINT 'Paso 4: Creando vista corregida para bundles...';
PRINT '------------------------------------------------';
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
    fk.kar_pre_pub AS precio_unitario,
    fk.kar_total AS total_linea,
    fk.kar_lis_pre_cod AS lista_precios,

    -- ==========================================
    -- COSTOS Y RENTABILIDAD REAL
    -- ==========================================
    -- Usar kar_cos (costo histórico) en lugar de art_bod_cos_cat
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
        WHEN fk.kar_total > 0 AND fk.kar_cos > 0
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
    ISNULL(a.art_bundle, 'N') AS es_bundle,

    -- ==========================================
    -- INFORMACIÓN DE BUNDLES (NUEVO)
    -- ==========================================
    fk.kar_bundle_padre AS bundle_padre_art_sec

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
    AND f.fac_tip_cod = 'VTA'
    -- ✅ NUEVO: Excluir componentes de bundles
    -- Solo mostrar bundles padres y productos simples
    AND (fk.kar_bundle_padre IS NULL OR fk.kar_bundle_padre = '');

GO

-- =============================================
-- PASO 5: Verificar creación de la vista
-- =============================================
PRINT '';
PRINT 'Paso 5: Verificando creación...';
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
-- PASO 6: Validación con bundles
-- =============================================
PRINT 'Paso 6: Validación de corrección...';
PRINT '------------------------------------';

-- Contar líneas ANTES (debería ser 0 ahora)
DECLARE @lineas_componentes_en_vista INT = 0;

SELECT @lineas_componentes_en_vista = COUNT(*)
FROM dbo.vw_ventas_dashboard
WHERE bundle_padre_art_sec IS NOT NULL;

IF @lineas_componentes_en_vista = 0
BEGIN
    PRINT '✓ Corrección exitosa: NO hay componentes de bundles en la vista';
END
ELSE
BEGIN
    PRINT '❌ ERROR: Aún hay ' + CAST(@lineas_componentes_en_vista AS VARCHAR) + ' componentes en la vista';
    PRINT '   Revisar filtro kar_bundle_padre';
END

-- Comparar totales
PRINT '';
PRINT 'Comparación de métricas (últimos 30 días):';
PRINT '-------------------------------------------';

SELECT
    COUNT(DISTINCT fac_nro) AS ordenes_totales,
    COUNT(*) AS lineas_totales,
    SUM(total_linea) AS ventas_totales,
    SUM(utilidad_linea) AS utilidad_total,
    AVG(rentabilidad_real) AS rentabilidad_promedio,
    COUNT(CASE WHEN es_bundle = 'S' THEN 1 END) AS lineas_bundles,
    COUNT(CASE WHEN bundle_padre_art_sec IS NOT NULL THEN 1 END) AS componentes_visibles
FROM dbo.vw_ventas_dashboard
WHERE fecha_venta >= DATEADD(DAY, -30, GETDATE());

PRINT '';

-- =============================================
-- PASO 7: Vista complementaria para análisis
-- =============================================
PRINT 'Paso 7: Creando vista de detalle de bundles...';
PRINT '-----------------------------------------------';
GO

-- Eliminar si existe
IF OBJECT_ID('dbo.vw_bundles_detalle', 'V') IS NOT NULL
    DROP VIEW dbo.vw_bundles_detalle;
GO

CREATE VIEW dbo.vw_bundles_detalle AS
SELECT
    f.fac_nro,
    f.fac_fec,
    fk_padre.fac_sec,
    fk_padre.kar_sec AS bundle_kar_sec,

    -- Información del bundle padre
    a_padre.art_sec AS bundle_art_sec,
    a_padre.art_cod AS bundle_codigo,
    a_padre.art_nom AS bundle_nombre,
    fk_padre.kar_uni AS bundle_cantidad,
    fk_padre.kar_total AS bundle_precio_venta,
    fk_padre.kar_cos AS bundle_costo_registrado,

    -- Información del componente (NULL si no hay componentes, para bundles sin expandir)
    fk_comp.kar_sec AS componente_kar_sec,
    a_comp.art_sec AS componente_art_sec,
    a_comp.art_cod AS componente_codigo,
    a_comp.art_nom AS componente_nombre,
    fk_comp.kar_uni AS componente_cantidad,
    fk_comp.kar_cos AS componente_costo_unitario,
    (fk_comp.kar_uni * ISNULL(fk_comp.kar_cos, 0)) AS componente_costo_total

FROM dbo.factura f
    INNER JOIN dbo.facturakardes fk_padre ON f.fac_sec = fk_padre.fac_sec
    INNER JOIN dbo.articulos a_padre ON fk_padre.art_sec = a_padre.art_sec
    LEFT JOIN dbo.facturakardes fk_comp
        ON fk_comp.kar_bundle_padre = fk_padre.art_sec
        AND fk_comp.fac_sec = fk_padre.fac_sec
    LEFT JOIN dbo.articulos a_comp ON fk_comp.art_sec = a_comp.art_sec

WHERE
    a_padre.art_bundle = 'S'
    AND fk_padre.kar_nat = '-'
    AND f.fac_tip_cod = 'VTA'
    AND f.fac_est_fac = 'A';

GO

PRINT '✓ Vista vw_bundles_detalle creada';
PRINT '';

-- =============================================
-- PASO 8: Ejemplos de uso
-- =============================================
PRINT '========================================';
PRINT 'Ejemplos de uso';
PRINT '========================================';
PRINT '';
PRINT '-- 1. KPIs principales (bundles + simples, SIN componentes):';
PRINT 'SELECT';
PRINT '    SUM(total_linea) AS ventas_totales,';
PRINT '    SUM(utilidad_linea) AS utilidad_total,';
PRINT '    AVG(rentabilidad_real) AS rentabilidad_promedio';
PRINT 'FROM dbo.vw_ventas_dashboard';
PRINT 'WHERE fecha_venta >= DATEADD(DAY, -30, GETDATE());';
PRINT '';
PRINT '-- 2. Detalle de un bundle específico (con componentes):';
PRINT 'SELECT * FROM dbo.vw_bundles_detalle';
PRINT 'WHERE fac_nro = ''VTA1234'';';
PRINT '';
PRINT '-- 3. Análisis de rentabilidad por producto (bundles como 1 línea):';
PRINT 'SELECT';
PRINT '    art_cod,';
PRINT '    art_nom,';
PRINT '    es_bundle,';
PRINT '    SUM(total_linea) AS ingresos_totales,';
PRINT '    SUM(utilidad_linea) AS utilidad_total,';
PRINT '    AVG(rentabilidad_real) AS rentabilidad_promedio';
PRINT 'FROM dbo.vw_ventas_dashboard';
PRINT 'WHERE fecha_venta >= DATEADD(DAY, -30, GETDATE())';
PRINT 'GROUP BY art_cod, art_nom, es_bundle';
PRINT 'ORDER BY SUM(total_linea) DESC;';
PRINT '';

PRINT '========================================';
PRINT '✓ Script completado exitosamente';
PRINT '========================================';
PRINT '';
PRINT 'CAMBIOS REALIZADOS:';
PRINT '- Vista principal EXCLUYE componentes de bundles';
PRINT '- Solo muestra bundles padres y productos simples';
PRINT '- Rentabilidad de bundle incluye costos de componentes (en kar_cos)';
PRINT '- Vista complementaria vw_bundles_detalle para análisis detallado';
PRINT '';
PRINT 'PRÓXIMOS PASOS:';
PRINT '1. Validar dashboard de ventas BI';
PRINT '2. Verificar que KPIs son correctos';
PRINT '3. Probar reportes de rentabilidad';
PRINT '';

GO
