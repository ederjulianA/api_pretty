/**
 * CORRECCIÓN: Eliminar columnas TEXT de índices
 * Fecha: 2026-02-12
 * Descripción: Corrige los índices que intentan incluir la columna TEXT ai_contenido
 */

USE [PS_ESTRUCTURA]
GO

PRINT '========================================';
PRINT 'Corrigiendo índices de articulos_ai_content';
PRINT '========================================';
PRINT '';

-- Eliminar y recrear IDX_ai_content_active sin ai_contenido
IF EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_ai_content_active'
    AND object_id = OBJECT_ID('dbo.articulos_ai_content')
)
BEGIN
    DROP INDEX IDX_ai_content_active ON dbo.articulos_ai_content;
    PRINT '  ✓ Índice IDX_ai_content_active eliminado';
END
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_ai_content_active'
    AND object_id = OBJECT_ID('dbo.articulos_ai_content')
)
BEGIN
    CREATE NONCLUSTERED INDEX IDX_ai_content_active
    ON dbo.articulos_ai_content (art_sec, ai_tipo, ai_estado, ai_idioma)
    INCLUDE (ai_version, ai_modelo, ai_fecha_generacion);

    PRINT '  ✓ Índice IDX_ai_content_active recreado correctamente';
END
GO

-- Eliminar y recrear IDX_ai_content_prompts sin ai_contenido
IF EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_ai_content_prompts'
    AND object_id = OBJECT_ID('dbo.articulos_ai_content')
)
BEGIN
    DROP INDEX IDX_ai_content_prompts ON dbo.articulos_ai_content;
    PRINT '  ✓ Índice IDX_ai_content_prompts eliminado';
END
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_ai_content_prompts'
    AND object_id = OBJECT_ID('dbo.articulos_ai_content')
)
BEGIN
    CREATE NONCLUSTERED INDEX IDX_ai_content_prompts
    ON dbo.articulos_ai_content (ai_prompt_hash)
    INCLUDE (ai_modelo, ai_estado, ai_fecha_generacion)
    WHERE ai_prompt_hash IS NOT NULL;

    PRINT '  ✓ Índice IDX_ai_content_prompts recreado correctamente';
END
GO

PRINT '';
PRINT '========================================';
PRINT 'Corrección completada';
PRINT '========================================';
PRINT '';
PRINT 'Los índices han sido corregidos eliminando la columna TEXT ai_contenido';
PRINT 'de las columnas INCLUDE. Esto no afecta la funcionalidad ya que el';
PRINT 'contenido se obtiene mediante consultas directas cuando es necesario.';
PRINT '';
