-- =============================================
-- Script de Impactos: Sistema de Compras y Costo Promedio
-- Fecha: 2026-02-09
-- Autor: Sistema API Pretty
-- Descripción: Creación de estructuras necesarias para implementar
--              el sistema de compras con costo promedio ponderado
-- =============================================

-- IMPORTANTE: Este script debe ejecutarse en el siguiente orden:
-- 1. Tablas
-- 2. Índices
-- 3. Vistas
-- 4. Procedimientos almacenados

-- NOTA: Asegúrate de estar conectado a la base de datos correcta antes de ejecutar
-- USE [PRETTY_DB];

PRINT '=========================================';
PRINT 'Iniciando script de impactos';
PRINT 'Fase 0: Carga Inicial de Costos';
PRINT '=========================================';

-- =============================================
-- SECCIÓN 1: TABLAS
-- =============================================

PRINT '';
PRINT '--- Creando Tablas ---';

-- ---------------------------------------------
-- Tabla: carga_inicial_costos
-- Descripción: Tabla temporal para validar y cargar costos iniciales
--              antes de aplicarlos a articulosdetalle
-- ---------------------------------------------
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[carga_inicial_costos]') AND type in (N'U'))
BEGIN
    PRINT 'Creando tabla: carga_inicial_costos'

    CREATE TABLE [dbo].[carga_inicial_costos] (
        -- Identificación
        [cic_id] INT IDENTITY(1,1) NOT NULL,
        [cic_art_sec] VARCHAR(30) NOT NULL,

        -- Datos de contexto (auto-completados desde articulos/articulosdetalle)
        [cic_art_cod] VARCHAR(30) NULL,
        [cic_art_nom] VARCHAR(100) NULL,
        [cic_existencia] DECIMAL(17,2) NULL,
        [cic_precio_venta_detal] DECIMAL(17,2) NULL,
        [cic_precio_venta_mayor] DECIMAL(17,2) NULL,

        -- Costo propuesto (lo importante)
        [cic_costo_propuesto] DECIMAL(17,2) NOT NULL,
        [cic_metodo_calculo] VARCHAR(50) NULL,  -- ULTIMA_COMPRA, REVERSO_50%, ESTIMADO, MANUAL

        -- Validación automática (calculados por sp_ValidarCargaInicialCostos)
        [cic_margen_resultante_detal] DECIMAL(5,2) NULL,
        [cic_margen_resultante_mayor] DECIMAL(5,2) NULL,

        -- Control de flujo
        [cic_estado] VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',  -- PENDIENTE, VALIDADO, VALIDADO_CON_ALERTAS, RECHAZADO, APLICADO
        [cic_observaciones] VARCHAR(500) NULL,

        -- Auditoría
        [cic_fecha_carga] DATETIME NOT NULL DEFAULT GETDATE(),
        [cic_usuario_carga] VARCHAR(100) NULL,
        [cic_fecha_validacion] DATETIME NULL,
        [cic_usuario_validacion] VARCHAR(100) NULL,

        -- Constraints
        CONSTRAINT [PK_carga_inicial_costos] PRIMARY KEY CLUSTERED ([cic_id] ASC),
        CONSTRAINT [FK_carga_inicial_costos_articulos] FOREIGN KEY ([cic_art_sec])
            REFERENCES [dbo].[articulos]([art_sec]),
        CONSTRAINT [CK_carga_inicial_costos_costo_positivo] CHECK ([cic_costo_propuesto] >= 0),
        CONSTRAINT [CK_carga_inicial_costos_estado] CHECK ([cic_estado] IN ('PENDIENTE', 'VALIDADO', 'VALIDADO_CON_ALERTAS', 'RECHAZADO', 'APLICADO'))
    ) ON [PRIMARY]

    PRINT '✓ Tabla carga_inicial_costos creada exitosamente';
END
ELSE
BEGIN
    PRINT '⚠ Tabla carga_inicial_costos ya existe, omitiendo creación';
END;

-- ---------------------------------------------
-- Tabla: historial_costos
-- Descripción: Registro histórico de todos los cambios de costo
--              para auditoría y análisis de variaciones
-- ---------------------------------------------
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[historial_costos]') AND type in (N'U'))
BEGIN
    PRINT 'Creando tabla: historial_costos'

    CREATE TABLE [dbo].[historial_costos] (
        -- Identificación
        [hc_id] INT IDENTITY(1,1) NOT NULL,
        [hc_art_sec] VARCHAR(30) NOT NULL,
        [hc_fac_sec] DECIMAL(12,0) NULL,  -- FK a factura de compra (NULL para carga inicial)

        -- Datos del movimiento
        [hc_fecha] DATETIME NOT NULL DEFAULT GETDATE(),
        [hc_tipo_mov] VARCHAR(20) NOT NULL,  -- CARGA_INICIAL, COMPRA, AJUSTE_MANUAL

        -- Estado anterior
        [hc_cantidad_antes] DECIMAL(17,2) NOT NULL,
        [hc_costo_antes] DECIMAL(17,2) NOT NULL,
        [hc_valor_antes] DECIMAL(17,2) NOT NULL,

        -- Movimiento
        [hc_cantidad_mov] DECIMAL(17,2) NOT NULL,
        [hc_costo_mov] DECIMAL(17,2) NOT NULL,
        [hc_valor_mov] DECIMAL(17,2) NOT NULL,

        -- Estado después
        [hc_cantidad_despues] DECIMAL(17,2) NOT NULL,
        [hc_costo_despues] DECIMAL(17,2) NOT NULL,
        [hc_valor_despues] DECIMAL(17,2) NOT NULL,

        -- Auditoría
        [hc_usu_cod] VARCHAR(100) NULL,
        [hc_observaciones] VARCHAR(500) NULL,

        -- Constraints
        CONSTRAINT [PK_historial_costos] PRIMARY KEY CLUSTERED ([hc_id] ASC),
        CONSTRAINT [FK_historial_costos_articulos] FOREIGN KEY ([hc_art_sec])
            REFERENCES [dbo].[articulos]([art_sec]),
        CONSTRAINT [FK_historial_costos_factura] FOREIGN KEY ([hc_fac_sec])
            REFERENCES [dbo].[factura]([fac_sec]),
        CONSTRAINT [CK_historial_costos_tipo] CHECK ([hc_tipo_mov] IN ('CARGA_INICIAL', 'COMPRA', 'AJUSTE_MANUAL'))
    ) ON [PRIMARY]

    PRINT '✓ Tabla historial_costos creada exitosamente';
END
ELSE
BEGIN
    PRINT '⚠ Tabla historial_costos ya existe, omitiendo creación';
END;

-- =============================================
-- SECCIÓN 2: ÍNDICES
-- =============================================

PRINT '';
PRINT '--- Creando Índices ---';

-- Índices para carga_inicial_costos
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_carga_inicial_costos_estado' AND object_id = OBJECT_ID('carga_inicial_costos'))
BEGIN
    CREATE NONCLUSTERED INDEX [IX_carga_inicial_costos_estado]
    ON [dbo].[carga_inicial_costos] ([cic_estado]);
    PRINT '✓ Índice IX_carga_inicial_costos_estado creado';
END
ELSE
    PRINT '⚠ Índice IX_carga_inicial_costos_estado ya existe';

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_carga_inicial_costos_art_sec' AND object_id = OBJECT_ID('carga_inicial_costos'))
BEGIN
    CREATE NONCLUSTERED INDEX [IX_carga_inicial_costos_art_sec]
    ON [dbo].[carga_inicial_costos] ([cic_art_sec])
    INCLUDE ([cic_costo_propuesto], [cic_estado]);
    PRINT '✓ Índice IX_carga_inicial_costos_art_sec creado';
END
ELSE
    PRINT '⚠ Índice IX_carga_inicial_costos_art_sec ya existe';

-- Índices para historial_costos
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_historial_costos_art_fecha' AND object_id = OBJECT_ID('historial_costos'))
BEGIN
    CREATE NONCLUSTERED INDEX [IX_historial_costos_art_fecha]
    ON [dbo].[historial_costos] ([hc_art_sec], [hc_fecha] DESC)
    INCLUDE ([hc_tipo_mov], [hc_costo_antes], [hc_costo_despues]);
    PRINT '✓ Índice IX_historial_costos_art_fecha creado';
END
ELSE
    PRINT '⚠ Índice IX_historial_costos_art_fecha ya existe';

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_historial_costos_tipo_fecha' AND object_id = OBJECT_ID('historial_costos'))
BEGIN
    CREATE NONCLUSTERED INDEX [IX_historial_costos_tipo_fecha]
    ON [dbo].[historial_costos] ([hc_tipo_mov], [hc_fecha] DESC);
    PRINT '✓ Índice IX_historial_costos_tipo_fecha creado';
END
ELSE
    PRINT '⚠ Índice IX_historial_costos_tipo_fecha ya existe';

-- =============================================
-- SECCIÓN 3: VISTAS
-- =============================================

PRINT '';
PRINT '--- Creando Vistas ---';

-- ---------------------------------------------
-- Vista: vwCostoPromedioArticulos
-- Descripción: Consulta rápida del costo promedio actual de cada artículo
--              con existencias y valor de inventario calculado
-- ---------------------------------------------
IF EXISTS (SELECT * FROM sys.views WHERE name = 'vwCostoPromedioArticulos')
BEGIN
    DROP VIEW [dbo].[vwCostoPromedioArticulos];
    PRINT '⚠ Vista vwCostoPromedioArticulos existente eliminada';
END;

CREATE VIEW [dbo].[vwCostoPromedioArticulos]
AS
SELECT
    a.art_sec,
    a.art_cod,
    a.art_nom,
    ad.art_bod_cos_cat AS costo_promedio,
    ISNULL(ve.existencia, 0) AS existencia,
    (ISNULL(ad.art_bod_cos_cat, 0) * ISNULL(ve.existencia, 0)) AS valor_inventario,
    ad.art_bod_pre AS precio_venta_detal,
    CASE
        WHEN ad.art_bod_pre > 0 AND ad.art_bod_cos_cat > 0
        THEN ((ad.art_bod_pre - ad.art_bod_cos_cat) / ad.art_bod_pre * 100)
        ELSE NULL
    END AS margen_porcentaje,
    a.inv_sub_gru_cod
FROM dbo.articulos a
LEFT JOIN dbo.articulosdetalle ad ON ad.art_sec = a.art_sec
    AND ad.bod_sec = '1'
    AND ad.lis_pre_cod = 1
LEFT JOIN dbo.vwExistencias ve ON ve.art_sec = a.art_sec
WHERE a.art_sec IS NOT NULL;

PRINT '✓ Vista vwCostoPromedioArticulos creada exitosamente';

-- =============================================
-- SECCIÓN 4: PROCEDIMIENTOS ALMACENADOS
-- =============================================

PRINT '';
PRINT '--- Creando Procedimientos Almacenados ---';

-- ---------------------------------------------
-- Procedimiento: sp_ValidarCargaInicialCostos
-- Descripción: Valida automáticamente los costos propuestos
--              calculando márgenes y aplicando reglas de negocio
-- ---------------------------------------------
IF EXISTS (SELECT * FROM sys.procedures WHERE name = 'sp_ValidarCargaInicialCostos')
BEGIN
    DROP PROCEDURE [dbo].[sp_ValidarCargaInicialCostos];
    PRINT '⚠ Procedimiento sp_ValidarCargaInicialCostos existente eliminado';
END;

CREATE PROCEDURE [dbo].[sp_ValidarCargaInicialCostos]
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @registros_validados INT = 0
    DECLARE @registros_con_alertas INT = 0
    DECLARE @registros_rechazados INT = 0

    BEGIN TRY
        -- 1. Calcular márgenes resultantes
        UPDATE carga_inicial_costos
        SET
            cic_margen_resultante_detal = CASE
                WHEN cic_precio_venta_detal > 0
                THEN ((cic_precio_venta_detal - cic_costo_propuesto) / cic_precio_venta_detal * 100)
                ELSE NULL
            END,
            cic_margen_resultante_mayor = CASE
                WHEN cic_precio_venta_mayor > 0
                THEN ((cic_precio_venta_mayor - cic_costo_propuesto) / cic_precio_venta_mayor * 100)
                ELSE NULL
            END
        WHERE cic_estado = 'PENDIENTE'

        -- 2. Validar costos negativos (ERROR CRÍTICO)
        UPDATE carga_inicial_costos
        SET
            cic_observaciones = ISNULL(cic_observaciones, '') + ' | ERROR: Costo negativo no permitido',
            cic_estado = 'RECHAZADO'
        WHERE cic_estado = 'PENDIENTE'
          AND cic_costo_propuesto < 0

        SET @registros_rechazados = @@ROWCOUNT

        -- 3. Validar costos mayores que precio de venta (ERROR)
        UPDATE carga_inicial_costos
        SET
            cic_observaciones = ISNULL(cic_observaciones, '') + ' | ERROR: Costo mayor o igual que precio venta',
            cic_estado = 'RECHAZADO'
        WHERE cic_estado = 'PENDIENTE'
          AND cic_costo_propuesto >= cic_precio_venta_detal
          AND cic_costo_propuesto > 0  -- Excluir costos cero (muestras)

        SET @registros_rechazados = @registros_rechazados + @@ROWCOUNT

        -- 4. Validar márgenes muy bajos (ALERTA)
        UPDATE carga_inicial_costos
        SET
            cic_observaciones = ISNULL(cic_observaciones, '') + ' | ALERTA: Margen muy bajo (<20%)',
            cic_estado = 'VALIDADO_CON_ALERTAS'
        WHERE cic_estado = 'PENDIENTE'
          AND cic_margen_resultante_detal < 20
          AND cic_costo_propuesto > 0

        SET @registros_con_alertas = @@ROWCOUNT

        -- 5. Aprobar costos normales
        UPDATE carga_inicial_costos
        SET cic_estado = 'VALIDADO'
        WHERE cic_estado = 'PENDIENTE'
          AND (
              (cic_margen_resultante_detal >= 20 AND cic_costo_propuesto < cic_precio_venta_detal)
              OR cic_costo_propuesto = 0  -- Permitir muestras gratis
          )

        SET @registros_validados = @@ROWCOUNT

        -- Retornar resumen
        SELECT
            @registros_validados AS registros_validados,
            @registros_con_alertas AS registros_con_alertas,
            @registros_rechazados AS registros_rechazados,
            (@registros_validados + @registros_con_alertas + @registros_rechazados) AS total_procesados

        RETURN 0

    END TRY
    BEGIN CATCH
        DECLARE @ErrorMessage NVARCHAR(4000) = ERROR_MESSAGE()
        DECLARE @ErrorSeverity INT = ERROR_SEVERITY()
        DECLARE @ErrorState INT = ERROR_STATE()

        RAISERROR(@ErrorMessage, @ErrorSeverity, @ErrorState);
        RETURN 1;
    END CATCH
END;

PRINT '✓ Procedimiento sp_ValidarCargaInicialCostos creado exitosamente';

-- ---------------------------------------------
-- Procedimiento: sp_AplicarCargaInicialCostos
-- Descripción: Aplica los costos validados a articulosdetalle
--              y registra en historial_costos
-- Parámetros: @usuario - Usuario que ejecuta la aplicación
-- ---------------------------------------------
IF EXISTS (SELECT * FROM sys.procedures WHERE name = 'sp_AplicarCargaInicialCostos')
BEGIN
    DROP PROCEDURE [dbo].[sp_AplicarCargaInicialCostos];
    PRINT '⚠ Procedimiento sp_AplicarCargaInicialCostos existente eliminado';
END;

CREATE PROCEDURE [dbo].[sp_AplicarCargaInicialCostos]
    @usuario VARCHAR(100)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @total_aplicados INT = 0
    DECLARE @errores INT = 0

    BEGIN TRANSACTION

    BEGIN TRY
        -- 1. Actualizar costos en articulosdetalle (lista precio 1 = detal)
        UPDATE ad
        SET ad.art_bod_cos_cat = cic.cic_costo_propuesto
        FROM dbo.articulosdetalle ad
        INNER JOIN dbo.carga_inicial_costos cic ON cic.cic_art_sec = ad.art_sec
        WHERE ad.bod_sec = '1'
          AND ad.lis_pre_cod = 1
          AND cic.cic_estado = 'VALIDADO'

        SET @total_aplicados = @@ROWCOUNT

        -- 2. Marcar como aplicado en carga_inicial_costos
        UPDATE carga_inicial_costos
        SET
            cic_estado = 'APLICADO',
            cic_fecha_validacion = GETDATE(),
            cic_usuario_validacion = @usuario
        WHERE cic_estado = 'VALIDADO'

        -- 3. Registrar en historial de costos
        INSERT INTO dbo.historial_costos (
            hc_art_sec,
            hc_fac_sec,
            hc_fecha,
            hc_tipo_mov,
            hc_cantidad_antes,
            hc_costo_antes,
            hc_valor_antes,
            hc_cantidad_mov,
            hc_costo_mov,
            hc_valor_mov,
            hc_cantidad_despues,
            hc_costo_despues,
            hc_valor_despues,
            hc_usu_cod,
            hc_observaciones
        )
        SELECT
            cic.cic_art_sec,
            NULL,  -- No hay fac_sec en carga inicial
            GETDATE(),
            'CARGA_INICIAL',
            ISNULL(ve.existencia, 0),
            0,  -- Costo antes = 0
            0,  -- Valor antes = 0
            0,  -- No es una compra, es inicialización
            cic.cic_costo_propuesto,
            0,  -- Valor movimiento = 0 (no es compra)
            ISNULL(ve.existencia, 0),
            cic.cic_costo_propuesto,
            ISNULL(ve.existencia, 0) * cic.cic_costo_propuesto,
            @usuario,
            'Carga inicial - Método: ' + ISNULL(cic.cic_metodo_calculo, 'N/A')
        FROM dbo.carga_inicial_costos cic
        LEFT JOIN dbo.vwExistencias ve ON ve.art_sec = cic.cic_art_sec
        WHERE cic.cic_estado = 'APLICADO'

        COMMIT TRANSACTION

        -- Retornar resumen
        SELECT
            @total_aplicados AS total_aplicados,
            @errores AS errores,
            'Carga inicial aplicada exitosamente' AS mensaje

        RETURN 0

    END TRY
    BEGIN CATCH
        ROLLBACK TRANSACTION

        DECLARE @ErrorMessage NVARCHAR(4000) = ERROR_MESSAGE()
        DECLARE @ErrorSeverity INT = ERROR_SEVERITY()
        DECLARE @ErrorState INT = ERROR_STATE()

        SELECT
            0 AS total_aplicados,
            1 AS errores,
            @ErrorMessage AS mensaje;

        RAISERROR(@ErrorMessage, @ErrorSeverity, @ErrorState);
        RETURN 1;
    END CATCH
END;

PRINT '✓ Procedimiento sp_AplicarCargaInicialCostos creado exitosamente';

-- =============================================
-- SECCIÓN 5: VALIDACIÓN FINAL
-- =============================================

PRINT '';
PRINT '--- Validación de Estructuras Creadas ---';

DECLARE @errores INT = 0;

-- Validar tablas
IF NOT EXISTS (SELECT * FROM sys.objects WHERE name = 'carga_inicial_costos' AND type = 'U')
BEGIN
    PRINT '✗ ERROR: Tabla carga_inicial_costos NO fue creada';
    SET @errores = @errores + 1;
END
ELSE
    PRINT '✓ Tabla carga_inicial_costos verificada';

IF NOT EXISTS (SELECT * FROM sys.objects WHERE name = 'historial_costos' AND type = 'U')
BEGIN
    PRINT '✗ ERROR: Tabla historial_costos NO fue creada';
    SET @errores = @errores + 1;
END
ELSE
    PRINT '✓ Tabla historial_costos verificada';

-- Validar vista
IF NOT EXISTS (SELECT * FROM sys.views WHERE name = 'vwCostoPromedioArticulos')
BEGIN
    PRINT '✗ ERROR: Vista vwCostoPromedioArticulos NO fue creada';
    SET @errores = @errores + 1;
END
ELSE
    PRINT '✓ Vista vwCostoPromedioArticulos verificada';

-- Validar procedimientos
IF NOT EXISTS (SELECT * FROM sys.procedures WHERE name = 'sp_ValidarCargaInicialCostos')
BEGIN
    PRINT '✗ ERROR: Procedimiento sp_ValidarCargaInicialCostos NO fue creado';
    SET @errores = @errores + 1;
END
ELSE
    PRINT '✓ Procedimiento sp_ValidarCargaInicialCostos verificado';

IF NOT EXISTS (SELECT * FROM sys.procedures WHERE name = 'sp_AplicarCargaInicialCostos')
BEGIN
    PRINT '✗ ERROR: Procedimiento sp_AplicarCargaInicialCostos NO fue creado';
    SET @errores = @errores + 1;
END
ELSE
    PRINT '✓ Procedimiento sp_AplicarCargaInicialCostos verificado';

-- Resultado final
PRINT '';
PRINT '=========================================';
IF @errores = 0
BEGIN
    PRINT 'Script ejecutado exitosamente ✓';
    PRINT 'Todas las estructuras fueron creadas';
END
ELSE
BEGIN
    PRINT 'Script completado con errores ✗';
    PRINT 'Errores encontrados: ' + CAST(@errores AS VARCHAR(10));
END
PRINT '=========================================';

-- =============================================
-- FIN DEL SCRIPT
-- =============================================
