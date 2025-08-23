-- Script para verificar que la actualización de registros fue exitosa
-- Ejecutar este script DESPUÉS de ejecutar cualquiera de los scripts de actualización

PRINT 'Verificando actualización de registros en facturakardes...';
PRINT 'Fecha y hora de verificación: ' + CONVERT(VARCHAR, GETDATE(), 120);
PRINT '';

-- 1. Verificar que los campos existen
PRINT '1. VERIFICACIÓN DE CAMPOS:';
PRINT '========================================';

IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[facturakardes]') AND name = 'kar_pre_pub_detal')
BEGIN
    PRINT '✅ Campo kar_pre_pub_detal: EXISTE';
END
ELSE
BEGIN
    PRINT '❌ Campo kar_pre_pub_detal: NO EXISTE';
END

IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[facturakardes]') AND name = 'kar_pre_pub_mayor')
BEGIN
    PRINT '✅ Campo kar_pre_pub_mayor: EXISTE';
END
ELSE
BEGIN
    PRINT '❌ Campo kar_pre_pub_mayor: NO EXISTE';
END

IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[facturakardes]') AND name = 'kar_tiene_oferta')
BEGIN
    PRINT '✅ Campo kar_tiene_oferta: EXISTE';
END
ELSE
BEGIN
    PRINT '❌ Campo kar_tiene_oferta: NO EXISTE';
END

PRINT '';

-- 2. Contar registros totales y actualizados
PRINT '2. ESTADÍSTICAS DE REGISTROS:';
PRINT '========================================';

DECLARE @TotalRegistros INT = (SELECT COUNT(*) FROM dbo.facturakardes);
DECLARE @RegistrosConPrecioDetal INT = (SELECT COUNT(*) FROM dbo.facturakardes WHERE kar_pre_pub_detal IS NOT NULL);
DECLARE @RegistrosConPrecioMayor INT = (SELECT COUNT(*) FROM dbo.facturakardes WHERE kar_pre_pub_mayor IS NOT NULL);
DECLARE @RegistrosConTieneOferta INT = (SELECT COUNT(*) FROM dbo.facturakardes WHERE kar_tiene_oferta IS NOT NULL);
DECLARE @RegistrosSinDatos INT = (SELECT COUNT(*) FROM dbo.facturakardes WHERE kar_pre_pub_detal IS NULL);

PRINT 'Total de registros en facturakardes: ' + CAST(@TotalRegistros AS VARCHAR);
PRINT 'Registros con precio detal: ' + CAST(@RegistrosConPrecioDetal AS VARCHAR);
PRINT 'Registros con precio mayor: ' + CAST(@RegistrosConPrecioMayor AS VARCHAR);
PRINT 'Registros con indicador de oferta: ' + CAST(@RegistrosConTieneOferta AS VARCHAR);
PRINT 'Registros sin datos (pendientes): ' + CAST(@RegistrosSinDatos AS VARCHAR);

DECLARE @PorcentajeCompletado DECIMAL(5,2) = CASE 
    WHEN @TotalRegistros > 0 THEN (@RegistrosConPrecioDetal * 100.0) / @TotalRegistros 
    ELSE 0 
END;

PRINT 'Porcentaje de completitud: ' + CAST(@PorcentajeCompletado AS VARCHAR(5)) + '%';

PRINT '';

-- 3. Estadísticas de ofertas
PRINT '3. ESTADÍSTICAS DE OFERTAS:';
PRINT '========================================';

DECLARE @ConOfertas INT = (SELECT COUNT(*) FROM dbo.facturakardes WHERE kar_tiene_oferta = 'S');
DECLARE @SinOfertas INT = (SELECT COUNT(*) FROM dbo.facturakardes WHERE kar_tiene_oferta = 'N');
DECLARE @ConPrecioOferta INT = (SELECT COUNT(*) FROM dbo.facturakardes WHERE kar_precio_oferta IS NOT NULL);
DECLARE @ConDescuento INT = (SELECT COUNT(*) FROM dbo.facturakardes WHERE kar_descuento_porcentaje IS NOT NULL);
DECLARE @ConCodigoPromocion INT = (SELECT COUNT(*) FROM dbo.facturakardes WHERE kar_codigo_promocion IS NOT NULL);

PRINT 'Registros con ofertas (S): ' + CAST(@ConOfertas AS VARCHAR);
PRINT 'Registros sin ofertas (N): ' + CAST(@SinOfertas AS VARCHAR);
PRINT 'Registros con precio de oferta: ' + CAST(@ConPrecioOferta AS VARCHAR);
PRINT 'Registros con descuento porcentual: ' + CAST(@ConDescuento AS VARCHAR);
PRINT 'Registros con código de promoción: ' + CAST(@ConCodigoPromocion AS VARCHAR);

PRINT '';

-- 4. Promociones más utilizadas
PRINT '4. PROMOCIONES MÁS UTILIZADAS:';
PRINT '========================================';

SELECT TOP 10
    kar_codigo_promocion AS CodigoPromocion,
    kar_descripcion_promocion AS DescripcionPromocion,
    COUNT(*) AS TotalUsos,
    CAST((COUNT(*) * 100.0) / @TotalRegistros AS DECIMAL(5,2)) AS Porcentaje
FROM dbo.facturakardes 
WHERE kar_codigo_promocion IS NOT NULL
GROUP BY kar_codigo_promocion, kar_descripcion_promocion
ORDER BY TotalUsos DESC;

-- 5. Verificar integridad de datos
PRINT '';
PRINT '5. VERIFICACIÓN DE INTEGRIDAD:';
PRINT '========================================';

-- Verificar que los registros con ofertas tienen datos completos
DECLARE @OfertasIncompletas INT = (
    SELECT COUNT(*) 
    FROM dbo.facturakardes 
    WHERE kar_tiene_oferta = 'S' 
        AND (kar_precio_oferta IS NULL AND kar_descuento_porcentaje IS NULL)
);

-- Verificar que los registros sin ofertas no tienen datos de oferta
DECLARE @SinOfertasConDatos INT = (
    SELECT COUNT(*) 
    FROM dbo.facturakardes 
    WHERE kar_tiene_oferta = 'N' 
        AND (kar_precio_oferta IS NOT NULL OR kar_descuento_porcentaje IS NOT NULL)
);

-- Verificar precios válidos
DECLARE @PreciosNegativos INT = (
    SELECT COUNT(*) 
    FROM dbo.facturakardes 
    WHERE kar_pre_pub_detal < 0 OR kar_pre_pub_mayor < 0
);

-- Verificar descuentos válidos
DECLARE @DescuentosInvalidos INT = (
    SELECT COUNT(*) 
    FROM dbo.facturakardes 
    WHERE kar_descuento_porcentaje < 0 OR kar_descuento_porcentaje > 100
);

PRINT 'Ofertas con datos incompletos: ' + CAST(@OfertasIncompletas AS VARCHAR);
PRINT 'Registros sin oferta pero con datos de oferta: ' + CAST(@SinOfertasConDatos AS VARCHAR);
PRINT 'Precios negativos: ' + CAST(@PreciosNegativos AS VARCHAR);
PRINT 'Descuentos inválidos: ' + CAST(@DescuentosInvalidos AS VARCHAR);

-- 6. Muestra de registros para verificación manual
PRINT '';
PRINT '6. MUESTRA DE REGISTROS (primeros 5 con ofertas):';
PRINT '========================================';

SELECT TOP 5
    fk.fac_sec,
    fk.art_sec,
    fk.kar_pre_pub_detal,
    fk.kar_pre_pub_mayor,
    fk.kar_tiene_oferta,
    fk.kar_precio_oferta,
    fk.kar_descuento_porcentaje,
    fk.kar_codigo_promocion,
    fk.kar_descripcion_promocion
FROM dbo.facturakardes fk
WHERE fk.kar_tiene_oferta = 'S'
ORDER BY fk.fac_sec, fk.kar_sec;

PRINT '';
PRINT '7. MUESTRA DE REGISTROS (primeros 5 sin ofertas):';
PRINT '========================================';

SELECT TOP 5
    fk.fac_sec,
    fk.art_sec,
    fk.kar_pre_pub_detal,
    fk.kar_pre_pub_mayor,
    fk.kar_tiene_oferta,
    fk.kar_precio_oferta,
    fk.kar_descuento_porcentaje,
    fk.kar_codigo_promocion,
    fk.kar_descripcion_promocion
FROM dbo.facturakardes fk
WHERE fk.kar_tiene_oferta = 'N'
ORDER BY fk.fac_sec, fk.kar_sec;

-- 7. Resumen final
PRINT '';
PRINT '7. RESUMEN DE VERIFICACIÓN:';
PRINT '========================================';

IF @RegistrosSinDatos = 0
BEGIN
    PRINT '✅ TODOS LOS REGISTROS HAN SIDO ACTUALIZADOS CORRECTAMENTE';
END
ELSE
BEGIN
    PRINT '⚠️  HAY ' + CAST(@RegistrosSinDatos AS VARCHAR) + ' REGISTROS PENDIENTES DE ACTUALIZACIÓN';
END

IF @OfertasIncompletas = 0 AND @SinOfertasConDatos = 0 AND @PreciosNegativos = 0 AND @DescuentosInvalidos = 0
BEGIN
    PRINT '✅ INTEGRIDAD DE DATOS: CORRECTA';
END
ELSE
BEGIN
    PRINT '⚠️  SE DETECTARON PROBLEMAS DE INTEGRIDAD EN LOS DATOS';
END

IF @PorcentajeCompletado >= 95
BEGIN
    PRINT '✅ ACTUALIZACIÓN: EXITOSA (' + CAST(@PorcentajeCompletado AS VARCHAR(5)) + '% completado)';
END
ELSE
BEGIN
    PRINT '⚠️  ACTUALIZACIÓN: PARCIAL (' + CAST(@PorcentajeCompletado AS VARCHAR(5)) + '% completado)';
END

PRINT '';
PRINT 'Verificación completada!';
PRINT 'Fecha y hora de finalización: ' + CONVERT(VARCHAR, GETDATE(), 120); 