/**
 * FASE 1: Preparación de Base de Datos para Sistema de Compras
 * Costo Promedio Ponderado
 * Fecha: 2026-02-09
 * Descripción: Procedimientos y estructuras para registro de compras
 */

-- =============================================
-- PUNTO 4: Procedimiento Almacenado para Cálculo de Costo Promedio
-- =============================================

IF OBJECT_ID('dbo.sp_CalcularCostoPromedio', 'P') IS NOT NULL
BEGIN
    DROP PROCEDURE dbo.sp_CalcularCostoPromedio;
END
GO

CREATE PROCEDURE dbo.sp_CalcularCostoPromedio
    @art_sec VARCHAR(30),
    @cantidad_compra DECIMAL(17,2),
    @costo_unitario_compra DECIMAL(17,2),
    @nuevo_costo_promedio DECIMAL(17,2) OUTPUT,
    @existencia_anterior DECIMAL(17,2) OUTPUT,
    @valor_inventario_anterior DECIMAL(17,2) OUTPUT,
    @mensaje VARCHAR(500) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @costo_actual DECIMAL(17,2);
    DECLARE @existencia_actual DECIMAL(17,2);
    DECLARE @valor_anterior DECIMAL(17,2);
    DECLARE @valor_compra DECIMAL(17,2);
    DECLARE @nueva_existencia DECIMAL(17,2);
    DECLARE @nuevo_valor DECIMAL(17,2);

    BEGIN TRY
        -- Validar que el artículo existe
        IF NOT EXISTS (SELECT 1 FROM dbo.articulos WHERE art_sec = @art_sec)
        BEGIN
            SET @mensaje = 'ERROR: El artículo no existe';
            RETURN -1;
        END

        -- Obtener costo actual y existencia desde historial_costos
        SELECT TOP 1
            @costo_actual = hc_costo_despues,
            @existencia_actual = hc_cantidad_despues
        FROM dbo.historial_costos
        WHERE hc_art_sec = @art_sec
        ORDER BY hc_fecha DESC;

        -- Si no hay historial, obtener de vwExistencias (primera vez)
        IF @costo_actual IS NULL
        BEGIN
            SELECT @existencia_actual = ISNULL(existencia, 0)
            FROM dbo.vwExistencias
            WHERE art_sec = @art_sec;

            SET @costo_actual = 0;
            SET @existencia_actual = ISNULL(@existencia_actual, 0);
        END

        -- Calcular valores
        SET @valor_anterior = @existencia_actual * @costo_actual;
        SET @valor_compra = @cantidad_compra * @costo_unitario_compra;
        SET @nueva_existencia = @existencia_actual + @cantidad_compra;
        SET @nuevo_valor = @valor_anterior + @valor_compra;

        -- Fórmula de Costo Promedio Ponderado
        -- Nuevo Costo = (Valor Inventario Anterior + Valor Compra) / (Existencia Anterior + Cantidad Compra)
        IF @nueva_existencia > 0
        BEGIN
            SET @nuevo_costo_promedio = @nuevo_valor / @nueva_existencia;
        END
        ELSE
        BEGIN
            SET @nuevo_costo_promedio = 0;
        END

        -- Asignar valores de salida
        SET @existencia_anterior = @existencia_actual;
        SET @valor_inventario_anterior = @valor_anterior;

        -- Mensaje de éxito con detalle del cálculo
        SET @mensaje = CONCAT(
            'Cálculo exitoso. ',
            'Existencia anterior: ', CAST(@existencia_actual AS VARCHAR(20)), ', ',
            'Costo anterior: $', CAST(@costo_actual AS VARCHAR(20)), ', ',
            'Valor anterior: $', CAST(@valor_anterior AS VARCHAR(20)), '. ',
            'Compra: ', CAST(@cantidad_compra AS VARCHAR(20)), ' x $', CAST(@costo_unitario_compra AS VARCHAR(20)),
            ' = $', CAST(@valor_compra AS VARCHAR(20)), '. ',
            'Nueva existencia: ', CAST(@nueva_existencia AS VARCHAR(20)), ', ',
            'Nuevo costo promedio: $', CAST(@nuevo_costo_promedio AS VARCHAR(20))
        );

        RETURN 0;

    END TRY
    BEGIN CATCH
        SET @mensaje = CONCAT('ERROR: ', ERROR_MESSAGE());
        RETURN -1;
    END CATCH
END
GO

-- =============================================
-- PUNTO 5: Procedimiento para Registrar Historial de Costo
-- (Se ejecutará después del cálculo exitoso)
-- =============================================

IF OBJECT_ID('dbo.sp_RegistrarHistorialCosto', 'P') IS NOT NULL
BEGIN
    DROP PROCEDURE dbo.sp_RegistrarHistorialCosto;
END
GO

CREATE PROCEDURE dbo.sp_RegistrarHistorialCosto
    @art_sec VARCHAR(30),
    @documento_referencia VARCHAR(50),
    @tipo_movimiento VARCHAR(20),
    @cantidad_movimiento DECIMAL(17,2),
    @costo_unitario_movimiento DECIMAL(17,2),
    @nuevo_costo_promedio DECIMAL(17,2),
    @existencia_anterior DECIMAL(17,2),
    @existencia_nueva DECIMAL(17,2),
    @usuario VARCHAR(100),
    @mensaje VARCHAR(500) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @art_cod VARCHAR(30);
    DECLARE @art_nom VARCHAR(100);
    DECLARE @valor_anterior DECIMAL(17,2);
    DECLARE @valor_nuevo DECIMAL(17,2);
    DECLARE @costo_anterior DECIMAL(17,2);

    BEGIN TRY
        -- Obtener datos del artículo
        SELECT @art_cod = art_cod, @art_nom = art_nom
        FROM dbo.articulos
        WHERE art_sec = @art_sec;

        -- Obtener costo anterior del historial
        SELECT TOP 1 @costo_anterior = hc_costo_despues
        FROM dbo.historial_costos
        WHERE hc_art_sec = @art_sec
        ORDER BY hc_fecha DESC;

        SET @costo_anterior = ISNULL(@costo_anterior, 0);

        -- Calcular valores de inventario
        SET @valor_anterior = @existencia_anterior * @costo_anterior;
        SET @valor_nuevo = @existencia_nueva * @nuevo_costo_promedio;

        -- Insertar en historial usando la estructura de Fase 0
        INSERT INTO dbo.historial_costos (
            hc_art_sec,
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
        ) VALUES (
            @art_sec,
            @tipo_movimiento,
            @existencia_anterior,
            @costo_anterior,
            @valor_anterior,
            @cantidad_movimiento,
            @costo_unitario_movimiento,
            @cantidad_movimiento * @costo_unitario_movimiento,
            @existencia_nueva,
            @nuevo_costo_promedio,
            @valor_nuevo,
            @usuario,
            @documento_referencia
        );

        SET @mensaje = 'Historial registrado exitosamente';
        RETURN 0;

    END TRY
    BEGIN CATCH
        SET @mensaje = CONCAT('ERROR al registrar historial: ', ERROR_MESSAGE());
        RETURN -1;
    END CATCH
END
GO

-- =============================================
-- PUNTO 6: Vista para Consultar Costos Actuales
-- =============================================

IF OBJECT_ID('dbo.vwCostosActuales', 'V') IS NOT NULL
BEGIN
    DROP VIEW dbo.vwCostosActuales;
END
GO

CREATE VIEW dbo.vwCostosActuales
AS
WITH UltimosCostos AS (
    SELECT
        hc_art_sec,
        hc_costo_despues,
        hc_cantidad_despues,
        hc_valor_despues,
        hc_fecha,
        hc_tipo_mov,
        hc_observaciones,
        ROW_NUMBER() OVER (PARTITION BY hc_art_sec ORDER BY hc_fecha DESC) AS rn
    FROM dbo.historial_costos
)
SELECT
    a.art_sec,
    a.art_cod,
    a.art_nom,
    uc.hc_costo_despues AS costo_promedio_actual,
    uc.hc_cantidad_despues AS existencia_calculada,
    ve.existencia AS existencia_sistema,
    CASE
        WHEN ISNULL(ve.existencia, 0) <> uc.hc_cantidad_despues
        THEN 'DESCUADRADO'
        ELSE 'OK'
    END AS estado_inventario,
    uc.hc_valor_despues AS valor_inventario,
    uc.hc_fecha AS fecha_ultimo_calculo,
    uc.hc_tipo_mov AS ultimo_movimiento,
    uc.hc_observaciones AS ultimo_documento,
    ad_detal.art_bod_pre AS precio_venta_detal,
    ad_mayor.art_bod_pre AS precio_venta_mayor,
    CASE
        WHEN ad_detal.art_bod_pre > 0 AND uc.hc_costo_despues > 0
        THEN ROUND(((ad_detal.art_bod_pre - uc.hc_costo_despues) / ad_detal.art_bod_pre) * 100, 2)
        ELSE NULL
    END AS margen_detal_porcentaje,
    CASE
        WHEN ad_mayor.art_bod_pre > 0 AND uc.hc_costo_despues > 0
        THEN ROUND(((ad_mayor.art_bod_pre - uc.hc_costo_despues) / ad_mayor.art_bod_pre) * 100, 2)
        ELSE NULL
    END AS margen_mayor_porcentaje
FROM UltimosCostos uc
INNER JOIN dbo.articulos a ON a.art_sec = uc.hc_art_sec
LEFT JOIN dbo.vwExistencias ve ON ve.art_sec = uc.hc_art_sec
LEFT JOIN dbo.articulosdetalle ad_detal ON ad_detal.art_sec = uc.hc_art_sec
    AND ad_detal.bod_sec = '1' AND ad_detal.lis_pre_cod = 1
LEFT JOIN dbo.articulosdetalle ad_mayor ON ad_mayor.art_sec = uc.hc_art_sec
    AND ad_mayor.bod_sec = '1' AND ad_mayor.lis_pre_cod = 2
WHERE uc.rn = 1;
GO

-- =============================================
-- SCRIPTS DE PRUEBA
-- =============================================

PRINT '=========================================';
PRINT 'Fase 1: Estructuras creadas exitosamente';
PRINT '=========================================';
PRINT '';
PRINT 'Procedimientos creados:';
PRINT '  - sp_CalcularCostoPromedio';
PRINT '  - sp_RegistrarHistorialCosto';
PRINT '';
PRINT 'Vistas creadas:';
PRINT '  - vwCostosActuales';
PRINT '';
PRINT 'NOTA: Estos procedimientos se usarán en la Fase 2';
PRINT '      para el registro de compras y ajustes de inventario';
PRINT '';

-- Ejemplo de uso (comentado - solo para referencia):
/*
DECLARE @nuevo_costo DECIMAL(17,2);
DECLARE @exist_ant DECIMAL(17,2);
DECLARE @valor_ant DECIMAL(17,2);
DECLARE @msg VARCHAR(500);

-- Simular compra de 10 unidades a $15.00 c/u
EXEC dbo.sp_CalcularCostoPromedio
    @art_sec = 'ART001',
    @cantidad_compra = 10,
    @costo_unitario_compra = 15.00,
    @nuevo_costo_promedio = @nuevo_costo OUTPUT,
    @existencia_anterior = @exist_ant OUTPUT,
    @valor_inventario_anterior = @valor_ant OUTPUT,
    @mensaje = @msg OUTPUT;

PRINT @msg;
PRINT CONCAT('Nuevo costo calculado: $', @nuevo_costo);

-- Registrar en historial
DECLARE @nueva_existencia DECIMAL(17,2) = @exist_ant + 10;

EXEC dbo.sp_RegistrarHistorialCosto
    @art_sec = 'ART001',
    @documento_referencia = 'COMP-001',
    @tipo_movimiento = 'COMPRA',
    @cantidad_movimiento = 10,
    @costo_unitario_movimiento = 15.00,
    @nuevo_costo_promedio = @nuevo_costo,
    @existencia_anterior = @exist_ant,
    @existencia_nueva = @nueva_existencia,
    @usuario = 'SYSTEM',
    @mensaje = @msg OUTPUT;

PRINT @msg;

-- Consultar costos actuales
SELECT * FROM dbo.vwCostosActuales WHERE art_sec = 'ART001';
*/
GO
