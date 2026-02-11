/**
 * MIGRACIÓN: Sistema de Optimización de Contenido con IA
 * Fecha: 2026-02-11
 * Descripción: Crear tablas y campos para almacenar contenido generado por IA
 */

USE [PS_ESTRUCTURA]
GO

PRINT '========================================';
PRINT 'Iniciando migración: AI Content Optimization';
PRINT '========================================';
PRINT '';

-- =============================================
-- PASO 1: Agregar campos de control a tabla articulos
-- =============================================

PRINT 'Paso 1: Agregar campos de control en articulos...';

-- Campo: art_optimizar_ia
IF NOT EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.articulos')
    AND name = 'art_optimizar_ia'
)
BEGIN
    ALTER TABLE dbo.articulos
    ADD art_optimizar_ia CHAR(1) NULL DEFAULT 'N';

    PRINT '  ✓ Campo art_optimizar_ia agregado';
END
ELSE
BEGIN
    PRINT '  ⚠ Campo art_optimizar_ia ya existe';
END
GO

-- Constraint para art_optimizar_ia
IF NOT EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE name = 'CK_articulos_art_optimizar_ia'
)
BEGIN
    ALTER TABLE dbo.articulos
    ADD CONSTRAINT CK_articulos_art_optimizar_ia
        CHECK (art_optimizar_ia IN ('S', 'N'));

    PRINT '  ✓ Constraint CK_articulos_art_optimizar_ia agregado';
END
GO

-- Campo: art_tiene_contenido_ia
IF NOT EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.articulos')
    AND name = 'art_tiene_contenido_ia'
)
BEGIN
    ALTER TABLE dbo.articulos
    ADD art_tiene_contenido_ia CHAR(1) NULL DEFAULT 'N';

    PRINT '  ✓ Campo art_tiene_contenido_ia agregado';
END
ELSE
BEGIN
    PRINT '  ⚠ Campo art_tiene_contenido_ia ya existe';
END
GO

-- Constraint para art_tiene_contenido_ia
IF NOT EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE name = 'CK_articulos_art_tiene_contenido_ia'
)
BEGIN
    ALTER TABLE dbo.articulos
    ADD CONSTRAINT CK_articulos_art_tiene_contenido_ia
        CHECK (art_tiene_contenido_ia IN ('S', 'N'));

    PRINT '  ✓ Constraint CK_articulos_art_tiene_contenido_ia agregado';
END
GO

-- Campo: art_fecha_ultima_optimizacion
IF NOT EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.articulos')
    AND name = 'art_fecha_ultima_optimizacion'
)
BEGIN
    ALTER TABLE dbo.articulos
    ADD art_fecha_ultima_optimizacion DATETIME NULL;

    PRINT '  ✓ Campo art_fecha_ultima_optimizacion agregado';
END
ELSE
BEGIN
    PRINT '  ⚠ Campo art_fecha_ultima_optimizacion ya existe';
END
GO

-- Actualizar registros existentes
UPDATE dbo.articulos
SET art_optimizar_ia = 'N',
    art_tiene_contenido_ia = 'N'
WHERE art_optimizar_ia IS NULL
   OR art_tiene_contenido_ia IS NULL;
GO

PRINT '  ✓ Registros existentes actualizados con valores por defecto';

-- =============================================
-- PASO 2: Crear tabla articulos_ai_content
-- =============================================

PRINT '';
PRINT 'Paso 2: Crear tabla articulos_ai_content...';

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'articulos_ai_content')
BEGIN
    CREATE TABLE dbo.articulos_ai_content (
        ai_sec INT IDENTITY(1,1) PRIMARY KEY,
        art_sec VARCHAR(30) NOT NULL,
        ai_tipo VARCHAR(20) NOT NULL,  -- 'seo_title', 'meta_desc', 'long_desc', etc
        ai_contenido TEXT NOT NULL,
        ai_version INT NOT NULL DEFAULT 1,
        ai_estado CHAR(1) DEFAULT 'P' CHECK (ai_estado IN ('P', 'A', 'R')), -- P=Pendiente, A=Aprobado, R=Rechazado
        ai_idioma VARCHAR(5) DEFAULT 'es',
        ai_modelo VARCHAR(50) NOT NULL,  -- 'gpt-4-turbo-preview', 'gemini-1.5-pro', etc
        ai_prompt_hash VARCHAR(64),  -- SHA256 del prompt usado (para cache)
        ai_tokens_usados INT DEFAULT 0,
        ai_costo_usd DECIMAL(10,6) DEFAULT 0,
        ai_fecha_generacion DATETIME DEFAULT GETDATE(),
        ai_usuario_aprobador VARCHAR(20),
        ai_fecha_aprobacion DATETIME,
        ai_comentarios TEXT,

        CONSTRAINT FK_ai_content_articulos FOREIGN KEY (art_sec)
            REFERENCES dbo.articulos(art_sec) ON DELETE CASCADE,
        CONSTRAINT UQ_ai_content_version UNIQUE (art_sec, ai_tipo, ai_version, ai_idioma)
    );

    PRINT '  ✓ Tabla articulos_ai_content creada';
END
ELSE
BEGIN
    PRINT '  ⚠ Tabla articulos_ai_content ya existe';
END
GO

-- =============================================
-- PASO 3: Crear índices para performance
-- =============================================

PRINT '';
PRINT 'Paso 3: Crear índices en articulos_ai_content...';

-- Índice para búsqueda de contenido activo
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_ai_content_active'
    AND object_id = OBJECT_ID('dbo.articulos_ai_content')
)
BEGIN
    CREATE NONCLUSTERED INDEX IDX_ai_content_active
    ON dbo.articulos_ai_content (art_sec, ai_tipo, ai_estado, ai_idioma)
    INCLUDE (ai_contenido, ai_version, ai_modelo);

    PRINT '  ✓ Índice IDX_ai_content_active creado';
END
ELSE
BEGIN
    PRINT '  ⚠ Índice IDX_ai_content_active ya existe';
END
GO

-- Índice para cache por prompt hash
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_ai_content_prompts'
    AND object_id = OBJECT_ID('dbo.articulos_ai_content')
)
BEGIN
    CREATE NONCLUSTERED INDEX IDX_ai_content_prompts
    ON dbo.articulos_ai_content (ai_prompt_hash)
    INCLUDE (ai_contenido, ai_modelo, ai_estado)
    WHERE ai_prompt_hash IS NOT NULL;

    PRINT '  ✓ Índice IDX_ai_content_prompts creado';
END
ELSE
BEGIN
    PRINT '  ⚠ Índice IDX_ai_content_prompts ya existe';
END
GO

-- Índice para búsqueda por fecha
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_ai_content_fecha'
    AND object_id = OBJECT_ID('dbo.articulos_ai_content')
)
BEGIN
    CREATE NONCLUSTERED INDEX IDX_ai_content_fecha
    ON dbo.articulos_ai_content (ai_fecha_generacion DESC)
    INCLUDE (art_sec, ai_modelo, ai_costo_usd);

    PRINT '  ✓ Índice IDX_ai_content_fecha creado';
END
ELSE
BEGIN
    PRINT '  ⚠ Índice IDX_ai_content_fecha ya existe';
END
GO

-- =============================================
-- PASO 4: Crear tabla ai_usage_log (métricas)
-- =============================================

PRINT '';
PRINT 'Paso 4: Crear tabla ai_usage_log...';

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ai_usage_log')
BEGIN
    CREATE TABLE dbo.ai_usage_log (
        log_sec INT IDENTITY(1,1) PRIMARY KEY,
        ai_sec INT,
        log_evento VARCHAR(50),  -- 'generacion', 'aprobacion', 'rechazo', 'error'
        log_modelo VARCHAR(50),
        log_tokens_input INT,
        log_tokens_output INT,
        log_costo_usd DECIMAL(10,6),
        log_latencia_ms INT,
        log_error TEXT,
        log_usuario VARCHAR(20),
        log_fecha DATETIME DEFAULT GETDATE(),

        CONSTRAINT FK_usage_log_ai_content FOREIGN KEY (ai_sec)
            REFERENCES dbo.articulos_ai_content(ai_sec) ON DELETE SET NULL
    );

    PRINT '  ✓ Tabla ai_usage_log creada';
END
ELSE
BEGIN
    PRINT '  ⚠ Tabla ai_usage_log ya existe';
END
GO

-- Índices para ai_usage_log
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_usage_log_fecha'
    AND object_id = OBJECT_ID('dbo.ai_usage_log')
)
BEGIN
    CREATE NONCLUSTERED INDEX IDX_usage_log_fecha
    ON dbo.ai_usage_log (log_fecha DESC)
    INCLUDE (log_modelo, log_costo_usd, log_tokens_input, log_tokens_output);

    PRINT '  ✓ Índice IDX_usage_log_fecha creado';
END
GO

-- =============================================
-- PASO 5: Crear vista para contenido activo
-- =============================================

PRINT '';
PRINT 'Paso 5: Crear vista vw_articulos_contenido_ia_activo...';

IF NOT EXISTS (SELECT 1 FROM sys.views WHERE name = 'vw_articulos_contenido_ia_activo')
BEGIN
    EXEC('
    CREATE VIEW dbo.vw_articulos_contenido_ia_activo AS
    SELECT
        a.art_sec,
        a.art_cod,
        a.art_nom,
        aic.ai_tipo,
        aic.ai_contenido,
        aic.ai_version,
        aic.ai_modelo,
        aic.ai_idioma,
        aic.ai_fecha_generacion,
        aic.ai_usuario_aprobador
    FROM dbo.articulos a
    INNER JOIN dbo.articulos_ai_content aic ON a.art_sec = aic.art_sec
    WHERE aic.ai_estado = ''A''
      AND aic.ai_version = (
        SELECT MAX(ai_version)
        FROM dbo.articulos_ai_content
        WHERE art_sec = a.art_sec
          AND ai_tipo = aic.ai_tipo
          AND ai_idioma = aic.ai_idioma
          AND ai_estado = ''A''
      );
    ');

    PRINT '  ✓ Vista vw_articulos_contenido_ia_activo creada';
END
ELSE
BEGIN
    PRINT '  ⚠ Vista vw_articulos_contenido_ia_activo ya existe';
END
GO

-- =============================================
-- PASO 6: Crear stored procedures útiles
-- =============================================

PRINT '';
PRINT 'Paso 6: Crear stored procedures...';

-- SP: Limpiar versiones antiguas
IF NOT EXISTS (SELECT 1 FROM sys.procedures WHERE name = 'sp_limpiar_versiones_ai_antiguas')
BEGIN
    EXEC('
    CREATE PROCEDURE dbo.sp_limpiar_versiones_ai_antiguas
        @dias_mantener INT = 90
    AS
    BEGIN
        DELETE FROM dbo.articulos_ai_content
        WHERE ai_estado = ''R''
          AND ai_fecha_generacion < DATEADD(day, -@dias_mantener, GETDATE());

        SELECT @@ROWCOUNT AS registros_eliminados;
    END;
    ');

    PRINT '  ✓ SP sp_limpiar_versiones_ai_antiguas creado';
END
GO

-- SP: Obtener estadísticas de uso
IF NOT EXISTS (SELECT 1 FROM sys.procedures WHERE name = 'sp_estadisticas_uso_ia')
BEGIN
    EXEC('
    CREATE PROCEDURE dbo.sp_estadisticas_uso_ia
        @fecha_desde DATETIME = NULL,
        @fecha_hasta DATETIME = NULL
    AS
    BEGIN
        IF @fecha_desde IS NULL SET @fecha_desde = DATEADD(month, -1, GETDATE());
        IF @fecha_hasta IS NULL SET @fecha_hasta = GETDATE();

        SELECT
            ai_modelo,
            COUNT(*) as total_generaciones,
            SUM(ai_tokens_usados) as total_tokens,
            SUM(ai_costo_usd) as costo_total_usd,
            AVG(ai_tokens_usados) as promedio_tokens,
            AVG(ai_costo_usd) as promedio_costo_usd,
            SUM(CASE WHEN ai_estado = ''A'' THEN 1 ELSE 0 END) as aprobados,
            SUM(CASE WHEN ai_estado = ''R'' THEN 1 ELSE 0 END) as rechazados,
            SUM(CASE WHEN ai_estado = ''P'' THEN 1 ELSE 0 END) as pendientes
        FROM dbo.articulos_ai_content
        WHERE ai_fecha_generacion BETWEEN @fecha_desde AND @fecha_hasta
        GROUP BY ai_modelo
        ORDER BY costo_total_usd DESC;
    END;
    ');

    PRINT '  ✓ SP sp_estadisticas_uso_ia creado';
END
GO

-- =============================================
-- PASO 7: Crear función para calcular costo
-- =============================================

PRINT '';
PRINT 'Paso 7: Crear función fn_calcular_costo_ai_producto...';

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE name = 'fn_calcular_costo_ai_producto' AND type = 'FN')
BEGIN
    EXEC('
    CREATE FUNCTION dbo.fn_calcular_costo_ai_producto(@art_sec VARCHAR(30))
    RETURNS DECIMAL(10,2)
    AS
    BEGIN
        DECLARE @costo DECIMAL(10,2);

        SELECT @costo = SUM(ai_costo_usd)
        FROM dbo.articulos_ai_content
        WHERE art_sec = @art_sec;

        RETURN ISNULL(@costo, 0);
    END;
    ');

    PRINT '  ✓ Función fn_calcular_costo_ai_producto creada';
END
GO

-- =============================================
-- PASO 8: Resumen de migración
-- =============================================

PRINT '';
PRINT '========================================';
PRINT 'Migración completada';
PRINT '========================================';
PRINT '';
PRINT 'Tablas creadas:';
PRINT '  - articulos_ai_content';
PRINT '  - ai_usage_log';
PRINT '';
PRINT 'Campos agregados a articulos:';
PRINT '  - art_optimizar_ia';
PRINT '  - art_tiene_contenido_ia';
PRINT '  - art_fecha_ultima_optimizacion';
PRINT '';
PRINT 'Índices creados:';
PRINT '  - IDX_ai_content_active';
PRINT '  - IDX_ai_content_prompts';
PRINT '  - IDX_ai_content_fecha';
PRINT '  - IDX_usage_log_fecha';
PRINT '';
PRINT 'Vistas creadas:';
PRINT '  - vw_articulos_contenido_ia_activo';
PRINT '';
PRINT 'Stored Procedures:';
PRINT '  - sp_limpiar_versiones_ai_antiguas';
PRINT '  - sp_estadisticas_uso_ia';
PRINT '';
PRINT 'Funciones:';
PRINT '  - fn_calcular_costo_ai_producto';
PRINT '';
PRINT 'SIGUIENTE PASO: Configurar OpenAI API Key en .env';
PRINT '';

-- =============================================
-- QUERIES DE VERIFICACIÓN
-- =============================================

PRINT 'Verificación de estructura:';
PRINT '';

-- Contar artículos con flag optimizar activado
DECLARE @opt_count INT;
SELECT @opt_count = COUNT(*) FROM dbo.articulos WHERE art_optimizar_ia = 'S';
PRINT CONCAT('  Artículos con optimización IA habilitada: ', @opt_count);

-- Contar contenido IA generado
DECLARE @ai_count INT;
SELECT @ai_count = COUNT(*) FROM dbo.articulos_ai_content;
PRINT CONCAT('  Registros de contenido IA: ', @ai_count);

PRINT '';
PRINT '¡Migración exitosa!';
PRINT 'Sistema listo para integración con OpenAI/Gemini.';
GO
