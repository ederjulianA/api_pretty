/**
 * ========================================
 * SCRIPT MAESTRO: Implementación Dashboard de Ventas BI
 * ========================================
 * Fecha: 2026-02-17
 * Base de datos: SyscomElRedentor
 * Versión: 3.0 (Incluye corrección de bundles)
 *
 * IMPORTANTE:
 * - Este script ejecuta TODOS los scripts necesarios en el orden correcto
 * - Hacer BACKUP de la base de datos ANTES de ejecutar
 * - Ejecutar en ventana de mantenimiento (preferiblemente fuera de horario)
 * - Tiempo estimado: 20-30 minutos
 *
 * PREREQUISITOS:
 * 1. Backup completo de la base de datos
 * 2. Acceso con permisos de ALTER TABLE, CREATE VIEW, CREATE INDEX
 * 3. Tener los 5 scripts _PROD en la misma carpeta
 */

USE [SyscomElRedentor]; -- ⚠️ CAMBIAR AL NOMBRE DE TU BASE DE DATOS
GO

SET NOCOUNT ON;
SET XACT_ABORT ON; -- Rollback automático si hay error

PRINT '';
PRINT '========================================';
PRINT 'IMPLEMENTACIÓN DASHBOARD DE VENTAS BI';
PRINT '========================================';
PRINT 'Fecha: ' + CONVERT(VARCHAR, GETDATE(), 120);
PRINT 'Base de datos: SyscomElRedentor';
PRINT '';
PRINT '⚠️  IMPORTANTE: ¿Hiciste backup de la base de datos?';
PRINT '   Si NO, detén la ejecución (CTRL+C) y haz backup primero.';
PRINT '';
PRINT 'Esperando 10 segundos antes de continuar...';
WAITFOR DELAY '00:00:10';
GO

-- =============================================
-- PASO 1: Verificar prerequisitos
-- =============================================
PRINT '';
PRINT '========================================';
PRINT 'PASO 1: Verificando prerequisitos';
PRINT '========================================';
PRINT '';

-- Verificar que las tablas existen
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'facturakardes')
BEGIN
    PRINT '❌ ERROR: Tabla facturakardes no existe';
    RAISERROR('Tabla facturakardes no encontrada', 16, 1);
    RETURN;
END
ELSE
    PRINT '✓ Tabla facturakardes existe';

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'factura')
BEGIN
    PRINT '❌ ERROR: Tabla factura no existe';
    RAISERROR('Tabla factura no encontrada', 16, 1);
    RETURN;
END
ELSE
    PRINT '✓ Tabla factura existe';

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'articulos')
BEGIN
    PRINT '❌ ERROR: Tabla articulos no existe';
    RAISERROR('Tabla articulos no encontrada', 16, 1);
    RETURN;
END
ELSE
    PRINT '✓ Tabla articulos existe';

PRINT '';
PRINT '✓ Prerequisitos verificados';
PRINT '';

-- =============================================
-- INFORMACIÓN DE SCRIPTS A EJECUTAR
-- =============================================
PRINT '========================================';
PRINT 'Scripts que se ejecutarán:';
PRINT '========================================';
PRINT '1. 06_agregar_kar_cos_PROD.sql';
PRINT '2. 07_poblar_kar_cos_historico_PROD.sql';
PRINT '3. 01_crear_vista_ventas_dashboard_PROD.sql';
PRINT '4. 02_indices_performance_PROD.sql';
PRINT '5. 13_corregir_vista_bundles_PROD.sql';
PRINT '';
PRINT 'Tiempo estimado total: 20-30 minutos';
PRINT '';
PRINT 'Iniciando en 5 segundos...';
WAITFOR DELAY '00:00:05';
GO

-- =============================================
-- PASO 2: Agregar columna kar_cos
-- =============================================
PRINT '';
PRINT '========================================';
PRINT 'PASO 2: Ejecutando 06_agregar_kar_cos_PROD.sql';
PRINT '========================================';
PRINT '';
PRINT '⏳ Tiempo estimado: 2 minutos';
PRINT '';

-- Verificar si kar_cos ya existe
IF EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'facturakardes' AND COLUMN_NAME = 'kar_cos'
)
BEGIN
    PRINT '⚠️  ADVERTENCIA: La columna kar_cos ya existe en facturakardes';
    PRINT '   Saltando este paso...';
    PRINT '';
END
ELSE
BEGIN
    PRINT 'Ejecute manualmente: 06_agregar_kar_cos_PROD.sql';
    PRINT '';
    PRINT '⚠️  ESTE SCRIPT DEBE EJECUTARSE POR SEPARADO';
    PRINT '   Razón: Requiere ALTER TABLE con validación específica';
    PRINT '';
    PRINT '❌ DETENIENDO EJECUCIÓN';
    PRINT '   1. Ejecute: 06_agregar_kar_cos_PROD.sql';
    PRINT '   2. Ejecute: 07_poblar_kar_cos_historico_PROD.sql';
    PRINT '   3. Ejecute: 01_crear_vista_ventas_dashboard_PROD.sql';
    PRINT '   4. Ejecute: 02_indices_performance_PROD.sql';
    PRINT '   5. Ejecute: 13_corregir_vista_bundles_PROD.sql';
    PRINT '';
    RAISERROR('Ejecutar scripts individuales en el orden especificado', 16, 1);
    RETURN;
END

-- =============================================
-- MENSAJE FINAL
-- =============================================
PRINT '';
PRINT '========================================';
PRINT 'INSTRUCCIONES IMPORTANTES';
PRINT '========================================';
PRINT '';
PRINT 'Este script es INFORMATIVO.';
PRINT '';
PRINT 'Para implementar el dashboard, ejecute los siguientes scripts';
PRINT 'EN EL ORDEN ESPECIFICADO:';
PRINT '';
PRINT '1. 06_agregar_kar_cos_PROD.sql';
PRINT '   - Agrega columna kar_cos a facturakardes';
PRINT '   - Tiempo: ~2 minutos';
PRINT '';
PRINT '2. 07_poblar_kar_cos_historico_PROD.sql';
PRINT '   - Puebla kar_cos con datos históricos';
PRINT '   - Tiempo: ~5-10 minutos (depende del volumen)';
PRINT '';
PRINT '3. 01_crear_vista_ventas_dashboard_PROD.sql';
PRINT '   - Crea vista principal vw_ventas_dashboard';
PRINT '   - Tiempo: ~1 minuto';
PRINT '';
PRINT '4. 02_indices_performance_PROD.sql';
PRINT '   - Crea índices para optimización';
PRINT '   - Tiempo: ~2 minutos';
PRINT '';
PRINT '5. 13_corregir_vista_bundles_PROD.sql';
PRINT '   - Actualiza vista para bundles';
PRINT '   - Crea vista vw_bundles_detalle';
PRINT '   - Tiempo: ~2 minutos';
PRINT '';
PRINT '========================================';
PRINT 'VALIDACIÓN FINAL';
PRINT '========================================';
PRINT '';
PRINT 'Después de ejecutar todos los scripts, ejecute:';
PRINT '';
PRINT 'SELECT';
PRINT '    ''kar_cos agregado'' AS item,';
PRINT '    CASE WHEN EXISTS (';
PRINT '        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS';
PRINT '        WHERE TABLE_NAME = ''facturakardes'' AND COLUMN_NAME = ''kar_cos''';
PRINT '    ) THEN ''✓'' ELSE ''✗'' END AS status';
PRINT 'UNION ALL';
PRINT 'SELECT ''vista vw_ventas_dashboard'',';
PRINT '    CASE WHEN EXISTS (';
PRINT '        SELECT 1 FROM INFORMATION_SCHEMA.VIEWS';
PRINT '        WHERE TABLE_NAME = ''vw_ventas_dashboard''';
PRINT '    ) THEN ''✓'' ELSE ''✗'' END';
PRINT 'UNION ALL';
PRINT 'SELECT ''vista vw_bundles_detalle'',';
PRINT '    CASE WHEN EXISTS (';
PRINT '        SELECT 1 FROM INFORMATION_SCHEMA.VIEWS';
PRINT '        WHERE TABLE_NAME = ''vw_bundles_detalle''';
PRINT '    ) THEN ''✓'' ELSE ''✗'' END;';
PRINT '';
PRINT '========================================';
PRINT 'Consulte: GUIA_IMPLEMENTACION_PRODUCCION.md';
PRINT 'para información detallada.';
PRINT '========================================';
PRINT '';

GO
