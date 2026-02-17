/**
 * Script SQL: Crear Índices para Optimizar Performance del Dashboard
 * Fecha: 2026-02-17
 * Base de datos: SQL Server
 * Descripción: Índices optimizados para mejorar el rendimiento de las
 *              consultas del dashboard de ventas BI
 *
 * IMPORTANTE:
 * - Ejecutar DESPUÉS de crear la vista vw_ventas_dashboard
 * - Estos índices mejoran significativamente las consultas por fecha
 * - Hacer backup de la base de datos antes de ejecutar en producción
 * - La creación de índices puede tomar varios minutos en bases grandes
 */

USE [pruebas_ps_02092026]; -- Cambiar por tu base de datos
GO

PRINT '========================================';
PRINT 'Creando índices de performance';
PRINT 'Dashboard de Ventas BI';
PRINT '========================================';
PRINT '';
GO

-- =============================================
-- ÍNDICE 1: factura por fecha
-- =============================================
PRINT 'Creando índice: IX_factura_fac_fec';
PRINT '-----------------------------------';

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.factura')
    AND name = 'IX_factura_fac_fec'
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_factura_fac_fec
    ON dbo.factura (fac_fec DESC)
    INCLUDE (fac_sec, fac_nro, nit_sec, fac_est_fac, fac_est_woo, fac_nro_woo, fac_tip_cod)
    WHERE fac_est_fac = 'A' AND fac_tip_cod = 'FAC';

    PRINT '✓ Índice IX_factura_fac_fec creado exitosamente';
    PRINT '  Optimiza: Consultas por rango de fechas';
END
ELSE
BEGIN
    PRINT '⚠ Índice IX_factura_fac_fec ya existe';
END
GO

PRINT '';

-- =============================================
-- ÍNDICE 2: factura por estado y fecha
-- =============================================
PRINT 'Creando índice: IX_factura_estado_fecha';
PRINT '----------------------------------------';

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.factura')
    AND name = 'IX_factura_estado_fecha'
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_factura_estado_fecha
    ON dbo.factura (fac_est_fac, fac_fec DESC)
    INCLUDE (fac_sec, nit_sec, fac_nro_woo)
    WHERE fac_est_fac = 'A';

    PRINT '✓ Índice IX_factura_estado_fecha creado exitosamente';
    PRINT '  Optimiza: Filtros por estado y fecha';
END
ELSE
BEGIN
    PRINT '⚠ Índice IX_factura_estado_fecha ya existe';
END
GO

PRINT '';

-- =============================================
-- ÍNDICE 3: facturakardes por factura y artículo
-- =============================================
PRINT 'Creando índice: IX_facturakardes_fac_art';
PRINT '-----------------------------------------';

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.facturakardes')
    AND name = 'IX_facturakardes_fac_art'
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_facturakardes_fac_art
    ON dbo.facturakardes (fac_sec, art_sec)
    INCLUDE (kar_sec, kar_uni, kar_pre, kar_sub_tot, kar_total, kar_nat, kar_lis_pre_cod)
    WHERE kar_nat = '-';

    PRINT '✓ Índice IX_facturakardes_fac_art creado exitosamente';
    PRINT '  Optimiza: JOINs entre factura y kardex';
END
ELSE
BEGIN
    PRINT '⚠ Índice IX_facturakardes_fac_art ya existe';
END
GO

PRINT '';

-- =============================================
-- ÍNDICE 4: nit por cliente
-- =============================================
PRINT 'Creando índice: IX_nit_sec_nombre';
PRINT '----------------------------------';

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.nit')
    AND name = 'IX_nit_sec_nombre'
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_nit_sec_nombre
    ON dbo.nit (nit_sec)
    INCLUDE (nit_nom, nit_email, nit_tel, nit_ciudad);

    PRINT '✓ Índice IX_nit_sec_nombre creado exitosamente';
    PRINT '  Optimiza: Búsquedas de clientes';
END
ELSE
BEGIN
    PRINT '⚠ Índice IX_nit_sec_nombre ya existe';
END
GO

PRINT '';

-- =============================================
-- ÍNDICE 5: articulos por código y categoría
-- =============================================
PRINT 'Creando índice: IX_articulos_sec_subgrupo';
PRINT '------------------------------------------';

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.articulos')
    AND name = 'IX_articulos_sec_subgrupo'
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_articulos_sec_subgrupo
    ON dbo.articulos (art_sec, inv_sub_gru_cod)
    INCLUDE (art_cod, art_nom, art_woo_type, art_bundle);

    PRINT '✓ Índice IX_articulos_sec_subgrupo creado exitosamente';
    PRINT '  Optimiza: JOINs con categorías';
END
ELSE
BEGIN
    PRINT '⚠ Índice IX_articulos_sec_subgrupo ya existe';
END
GO

PRINT '';

-- =============================================
-- ÍNDICE 6: articulosdetalle por artículo (costo y rentabilidad)
-- =============================================
PRINT 'Creando índice: IX_articulosdetalle_art_bodega_lista';
PRINT '-----------------------------------------------------';

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.articulosdetalle')
    AND name = 'IX_articulosdetalle_art_bodega_lista'
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_articulosdetalle_art_bodega_lista
    ON dbo.articulosdetalle (art_sec, bod_sec, lis_pre_cod)
    INCLUDE (art_bod_cos_cat, art_bod_pre, rentabilidad, margen_ganancia,
             utilidad_bruta, clasificacion_rentabilidad)
    WHERE bod_sec = '1' AND lis_pre_cod = 1;

    PRINT '✓ Índice IX_articulosdetalle_art_bodega_lista creado exitosamente';
    PRINT '  Optimiza: Búsquedas de costos y rentabilidad';
END
ELSE
BEGIN
    PRINT '⚠ Índice IX_articulosdetalle_art_bodega_lista ya existe';
END
GO

PRINT '';

-- =============================================
-- PASO FINAL: Actualizar estadísticas
-- =============================================
PRINT '========================================';
PRINT 'Actualizando estadísticas de tablas';
PRINT '========================================';
PRINT '';

UPDATE STATISTICS dbo.factura WITH FULLSCAN;
PRINT '✓ Estadísticas de factura actualizadas';

UPDATE STATISTICS dbo.facturakardes WITH FULLSCAN;
PRINT '✓ Estadísticas de facturakardes actualizadas';

UPDATE STATISTICS dbo.nit WITH FULLSCAN;
PRINT '✓ Estadísticas de nit actualizadas';

UPDATE STATISTICS dbo.articulos WITH FULLSCAN;
PRINT '✓ Estadísticas de articulos actualizadas';

UPDATE STATISTICS dbo.articulosdetalle WITH FULLSCAN;
PRINT '✓ Estadísticas de articulosdetalle actualizadas';

PRINT '';

-- =============================================
-- RESUMEN
-- =============================================
PRINT '========================================';
PRINT '✓ Script completado exitosamente';
PRINT '========================================';
PRINT '';
PRINT 'Índices creados:';
PRINT '  1. IX_factura_fac_fec';
PRINT '  2. IX_factura_estado_fecha';
PRINT '  3. IX_facturakardes_fac_art';
PRINT '  4. IX_nit_sec_nombre';
PRINT '  5. IX_articulos_sec_subgrupo';
PRINT '  6. IX_articulosdetalle_art_bodega_lista';
PRINT '';
PRINT 'Beneficios esperados:';
PRINT '  • Consultas por fecha: 50-70% más rápidas';
PRINT '  • JOINs optimizados: 40-60% más rápidos';
PRINT '  • Análisis de rentabilidad: 30-50% más rápido';
PRINT '';
PRINT 'Próximos pasos:';
PRINT '  1. Probar performance de queries del dashboard';
PRINT '  2. Monitorear uso de índices con: sys.dm_db_index_usage_stats';
PRINT '  3. Ajustar índices según patrones de uso real';
PRINT '';
GO

-- =============================================
-- QUERY DE MONITOREO (opcional)
-- =============================================
PRINT 'Query para monitorear uso de índices:';
PRINT '--------------------------------------';
PRINT '';
PRINT 'SELECT';
PRINT '    OBJECT_NAME(s.object_id) AS tabla,';
PRINT '    i.name AS nombre_indice,';
PRINT '    s.user_seeks AS busquedas,';
PRINT '    s.user_scans AS escaneos,';
PRINT '    s.user_lookups AS busquedas_lookup,';
PRINT '    s.user_updates AS actualizaciones';
PRINT 'FROM sys.dm_db_index_usage_stats s';
PRINT 'INNER JOIN sys.indexes i ON s.object_id = i.object_id AND s.index_id = i.index_id';
PRINT 'WHERE OBJECTPROPERTY(s.object_id, ''IsUserTable'') = 1';
PRINT '  AND i.name LIKE ''IX_%''';
PRINT '  AND s.database_id = DB_ID()';
PRINT 'ORDER BY (s.user_seeks + s.user_scans + s.user_lookups) DESC;';
PRINT '';
GO
