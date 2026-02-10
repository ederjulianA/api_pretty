/**
 * Script: Verificar y optimizar campo woo_id en inventario_grupo
 * Fecha: 2026-02-09
 * Descripción: Verifica campo para rastrear ID de categoría en WooCommerce
 *              y crea índice si no existe
 */

PRINT '=========================================';
PRINT 'Verificando campo woo_id en inventario_grupo';
PRINT '=========================================';

-- Verificar si la columna ya existe
IF EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'inventario_grupo'
    AND COLUMN_NAME = 'inv_gru_woo_id'
)
BEGIN
    PRINT '✓ La columna inv_gru_woo_id ya existe';

    -- Verificar tipo de datos
    DECLARE @dataType VARCHAR(50);
    SELECT @dataType = DATA_TYPE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'inventario_grupo'
    AND COLUMN_NAME = 'inv_gru_woo_id';

    PRINT '  Tipo de dato actual: ' + @dataType;
END
ELSE
BEGIN
    -- Agregar columna para ID de WooCommerce
    ALTER TABLE dbo.inventario_grupo
    ADD inv_gru_woo_id INT NULL;

    PRINT '✓ Columna inv_gru_woo_id agregada exitosamente';
END;

-- Verificar si el índice ya existe
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_inventario_grupo_woo_id'
    AND object_id = OBJECT_ID('dbo.inventario_grupo')
)
BEGIN
    -- Crear índice para búsquedas rápidas por woo_id
    CREATE NONCLUSTERED INDEX IX_inventario_grupo_woo_id
    ON dbo.inventario_grupo (inv_gru_woo_id)
    WHERE inv_gru_woo_id IS NOT NULL;

    PRINT '✓ Índice IX_inventario_grupo_woo_id creado exitosamente';
END
ELSE
BEGIN
    PRINT '⚠ El índice IX_inventario_grupo_woo_id ya existe';
END;

PRINT '';
PRINT '=========================================';
PRINT 'Script ejecutado exitosamente';
PRINT '=========================================';
PRINT '';
PRINT 'NOTA: Ejecuta este mismo script en la tabla inventario_subgrupo';
PRINT '      para sincronización de subcategorías con WooCommerce';

GO
