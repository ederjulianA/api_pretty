-- Script para actualizar registros existentes en facturakardes con información de precios y ofertas
-- Ejecutar este script DESPUÉS de haber ejecutado el script 02_agregar_campos_precios_facturakardes.sql

PRINT 'Iniciando actualización de registros existentes en facturakardes...';
PRINT 'Fecha y hora de inicio: ' + CONVERT(VARCHAR, GETDATE(), 120);
PRINT '';

-- Verificar que los campos existen antes de proceder
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[facturakardes]') AND name = 'kar_pre_pub_detal')
BEGIN
    PRINT 'ERROR: Los campos de precios no han sido creados. Ejecute primero el script 02_agregar_campos_precios_facturakardes.sql';
    RETURN;
END

-- Contar registros a actualizar
DECLARE @TotalRegistros INT;
SELECT @TotalRegistros = COUNT(*) 
FROM dbo.facturakardes fk
WHERE fk.kar_pre_pub_detal IS NULL;

PRINT 'Total de registros a actualizar: ' + CAST(@TotalRegistros AS VARCHAR);
PRINT '';

-- Crear tabla temporal para el progreso
CREATE TABLE #ProgresoActualizacion (
    FacSec DECIMAL(18,0),
    TotalDetalles INT,
    Actualizados INT,
    FechaInicio DATETIME,
    FechaFin DATETIME
);

-- Obtener todas las facturas que necesitan actualización
INSERT INTO #ProgresoActualizacion (FacSec, TotalDetalles, Actualizados, FechaInicio, FechaFin)
SELECT 
    f.fac_sec,
    COUNT(fk.kar_sec) AS TotalDetalles,
    0 AS Actualizados,
    f.fac_fec AS FechaInicio,
    f.fac_fec AS FechaFin
FROM dbo.factura f
INNER JOIN dbo.facturakardes fk ON f.fac_sec = fk.fac_sec
WHERE fk.kar_pre_pub_detal IS NULL
GROUP BY f.fac_sec, f.fac_fec
ORDER BY f.fac_fec;

DECLARE @TotalFacturas INT = (SELECT COUNT(*) FROM #ProgresoActualizacion);
PRINT 'Total de facturas a procesar: ' + CAST(@TotalFacturas AS VARCHAR);
PRINT '';

-- Variables para el progreso
DECLARE @FacturaActual INT = 0;
DECLARE @RegistrosActualizados INT = 0;
DECLARE @InicioProceso DATETIME = GETDATE();

-- Procesar cada factura
DECLARE factura_cursor CURSOR FOR
SELECT FacSec, FechaInicio, FechaFin
FROM #ProgresoActualizacion
ORDER BY FechaInicio;

DECLARE @FacSec DECIMAL(18,0);
DECLARE @FechaFactura DATE;

OPEN factura_cursor;
FETCH NEXT FROM factura_cursor INTO @FacSec, @FechaFactura, @FechaFactura;

WHILE @@FETCH_STATUS = 0
BEGIN
    SET @FacturaActual = @FacturaActual + 1;
    
    PRINT 'Procesando factura ' + CAST(@FacturaActual AS VARCHAR) + ' de ' + CAST(@TotalFacturas AS VARCHAR) + 
          ' (fac_sec: ' + CAST(@FacSec AS VARCHAR) + ', fecha: ' + CONVERT(VARCHAR, @FechaFactura, 103) + ')';
    
    -- Actualizar registros de esta factura
    UPDATE fk
    SET 
        fk.kar_pre_pub_detal = ISNULL(precio_info.precio_detal, 0),
        fk.kar_pre_pub_mayor = ISNULL(precio_info.precio_mayor, 0),
        fk.kar_tiene_oferta = ISNULL(precio_info.tiene_oferta, 'N'),
        fk.kar_precio_oferta = precio_info.precio_oferta,
        fk.kar_descuento_porcentaje = precio_info.descuento_porcentaje,
        fk.kar_codigo_promocion = precio_info.codigo_promocion,
        fk.kar_descripcion_promocion = precio_info.descripcion_promocion
    FROM dbo.facturakardes fk
    INNER JOIN dbo.articulos a ON fk.art_sec = a.art_sec
    LEFT JOIN (
        SELECT 
            a.art_sec,
            ISNULL(ad1.art_bod_pre, 0) AS precio_detal,
            ISNULL(ad2.art_bod_pre, 0) AS precio_mayor,
            pd.pro_det_precio_oferta AS precio_oferta,
            pd.pro_det_descuento_porcentaje AS descuento_porcentaje,
            p.pro_codigo AS codigo_promocion,
            p.pro_descripcion AS descripcion_promocion,
            CASE 
                WHEN (pd.pro_det_precio_oferta IS NOT NULL AND pd.pro_det_precio_oferta > 0) 
                     OR (pd.pro_det_descuento_porcentaje IS NOT NULL AND pd.pro_det_descuento_porcentaje > 0)
                THEN 'S' 
                ELSE 'N' 
            END AS tiene_oferta
        FROM dbo.articulos a
        LEFT JOIN dbo.articulosdetalle ad1 ON a.art_sec = ad1.art_sec AND ad1.lis_pre_cod = 1
        LEFT JOIN dbo.articulosdetalle ad2 ON a.art_sec = ad2.art_sec AND ad2.lis_pre_cod = 2
        LEFT JOIN dbo.promociones_detalle pd ON a.art_sec = pd.art_sec AND pd.pro_det_estado = 'A'
        LEFT JOIN dbo.promociones p ON pd.pro_sec = p.pro_sec 
            AND p.pro_activa = 'S' 
            AND @FechaFactura BETWEEN p.pro_fecha_inicio AND p.pro_fecha_fin
    ) precio_info ON a.art_sec = precio_info.art_sec
    WHERE fk.fac_sec = @FacSec
        AND fk.kar_pre_pub_detal IS NULL;
    
    -- Contar registros actualizados en esta factura
    DECLARE @RegistrosEnFactura INT = @@ROWCOUNT;
    SET @RegistrosActualizados = @RegistrosActualizados + @RegistrosEnFactura;
    
    -- Actualizar tabla de progreso
    UPDATE #ProgresoActualizacion 
    SET Actualizados = @RegistrosEnFactura
    WHERE FacSec = @FacSec;
    
    PRINT '  - Registros actualizados en esta factura: ' + CAST(@RegistrosEnFactura AS VARCHAR);
    PRINT '  - Progreso total: ' + CAST(@RegistrosActualizados AS VARCHAR) + ' de ' + CAST(@TotalRegistros AS VARCHAR);
    
    -- Mostrar progreso cada 100 facturas
    IF @FacturaActual % 100 = 0
    BEGIN
        DECLARE @Porcentaje DECIMAL(5,2) = (@FacturaActual * 100.0) / @TotalFacturas;
        DECLARE @TiempoTranscurrido INT = DATEDIFF(SECOND, @InicioProceso, GETDATE());
        DECLARE @TiempoEstimado INT = CASE 
            WHEN @FacturaActual > 0 THEN (@TiempoTranscurrido * @TotalFacturas) / @FacturaActual - @TiempoTranscurrido
            ELSE 0 
        END;
        
        PRINT '  - Progreso: ' + CAST(@Porcentaje AS VARCHAR(5)) + '% completado';
        PRINT '  - Tiempo transcurrido: ' + CAST(@TiempoTranscurrido / 60 AS VARCHAR) + ' minutos';
        PRINT '  - Tiempo estimado restante: ' + CAST(@TiempoEstimado / 60 AS VARCHAR) + ' minutos';
    END
    
    PRINT '';
    
    FETCH NEXT FROM factura_cursor INTO @FacSec, @FechaFactura, @FechaFactura;
END

CLOSE factura_cursor;
DEALLOCATE factura_cursor;

-- Mostrar resumen final
DECLARE @TiempoTotal INT = DATEDIFF(SECOND, @InicioProceso, GETDATE());
DECLARE @RegistrosRestantes INT = (SELECT COUNT(*) FROM dbo.facturakardes WHERE kar_pre_pub_detal IS NULL);

PRINT '========================================';
PRINT 'RESUMEN DE ACTUALIZACIÓN';
PRINT '========================================';
PRINT 'Fecha y hora de finalización: ' + CONVERT(VARCHAR, GETDATE(), 120);
PRINT 'Tiempo total de ejecución: ' + CAST(@TiempoTotal / 60 AS VARCHAR) + ' minutos y ' + CAST(@TiempoTotal % 60 AS VARCHAR) + ' segundos';
PRINT 'Facturas procesadas: ' + CAST(@FacturaActual AS VARCHAR) + ' de ' + CAST(@TotalFacturas AS VARCHAR);
PRINT 'Registros actualizados: ' + CAST(@RegistrosActualizados AS VARCHAR) + ' de ' + CAST(@TotalRegistros AS VARCHAR);
PRINT 'Registros pendientes: ' + CAST(@RegistrosRestantes AS VARCHAR);

-- Mostrar estadísticas de ofertas
PRINT '';
PRINT 'ESTADÍSTICAS DE OFERTAS:';
PRINT '========================================';

DECLARE @ConOfertas INT = (SELECT COUNT(*) FROM dbo.facturakardes WHERE kar_tiene_oferta = 'S');
DECLARE @SinOfertas INT = (SELECT COUNT(*) FROM dbo.facturakardes WHERE kar_tiene_oferta = 'N');
DECLARE @TotalConDatos INT = (SELECT COUNT(*) FROM dbo.facturakardes WHERE kar_pre_pub_detal IS NOT NULL);

PRINT 'Registros con ofertas: ' + CAST(@ConOfertas AS VARCHAR);
PRINT 'Registros sin ofertas: ' + CAST(@SinOfertas AS VARCHAR);
PRINT 'Total de registros con datos: ' + CAST(@TotalConDatos AS VARCHAR);

-- Mostrar promociones más utilizadas
PRINT '';
PRINT 'PROMOCIONES MÁS UTILIZADAS:';
PRINT '========================================';

SELECT TOP 10
    kar_codigo_promocion AS CodigoPromocion,
    kar_descripcion_promocion AS DescripcionPromocion,
    COUNT(*) AS TotalUsos
FROM dbo.facturakardes 
WHERE kar_codigo_promocion IS NOT NULL
GROUP BY kar_codigo_promocion, kar_descripcion_promocion
ORDER BY TotalUsos DESC;

-- Verificar integridad de datos
PRINT '';
PRINT 'VERIFICACIÓN DE INTEGRIDAD:';
PRINT '========================================';

DECLARE @RegistrosSinPrecioDetal INT = (SELECT COUNT(*) FROM dbo.facturakardes WHERE kar_pre_pub_detal IS NULL);
DECLARE @RegistrosSinPrecioMayor INT = (SELECT COUNT(*) FROM dbo.facturakardes WHERE kar_pre_pub_mayor IS NULL);
DECLARE @RegistrosSinTieneOferta INT = (SELECT COUNT(*) FROM dbo.facturakardes WHERE kar_tiene_oferta IS NULL);

PRINT 'Registros sin precio detal: ' + CAST(@RegistrosSinPrecioDetal AS VARCHAR);
PRINT 'Registros sin precio mayor: ' + CAST(@RegistrosSinPrecioMayor AS VARCHAR);
PRINT 'Registros sin indicador de oferta: ' + CAST(@RegistrosSinTieneOferta AS VARCHAR);

-- Limpiar tabla temporal
DROP TABLE #ProgresoActualizacion;

PRINT '';
PRINT 'Actualización completada exitosamente!';
PRINT '';

-- Recomendaciones post-actualización
PRINT 'RECOMENDACIONES:';
PRINT '========================================';
PRINT '1. Verificar que no hay registros pendientes de actualización';
PRINT '2. Revisar las estadísticas de ofertas mostradas arriba';
PRINT '3. Probar las consultas de órdenes para verificar el rendimiento';
PRINT '4. Monitorear el uso de los nuevos campos en producción';
PRINT '5. Considerar crear índices adicionales si es necesario'; 