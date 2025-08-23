-- Script SIMPLE para actualizar registros existentes en facturakardes
-- Versión rápida sin cursor - para bases de datos pequeñas o medianas
-- Ejecutar este script DESPUÉS de haber ejecutado el script 02_agregar_campos_precios_facturakardes.sql

PRINT 'Iniciando actualización SIMPLE de registros existentes...';
PRINT 'Fecha y hora de inicio: ' + CONVERT(VARCHAR, GETDATE(), 120);
PRINT '';

-- Verificar que los campos existen
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

IF @TotalRegistros = 0
BEGIN
    PRINT 'No hay registros que actualizar. Todos los registros ya tienen datos.';
    RETURN;
END

-- Actualizar registros directamente sin tabla temporal
PRINT 'Actualizando registros...';

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
INNER JOIN dbo.factura f ON fk.fac_sec = f.fac_sec
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
        AND GETDATE() BETWEEN p.pro_fecha_inicio AND p.pro_fecha_fin
) precio_info ON a.art_sec = precio_info.art_sec
WHERE fk.kar_pre_pub_detal IS NULL;

DECLARE @RegistrosActualizados INT = @@ROWCOUNT;

PRINT '========================================';
PRINT 'RESUMEN DE ACTUALIZACIÓN';
PRINT '========================================';
PRINT 'Fecha y hora de finalización: ' + CONVERT(VARCHAR, GETDATE(), 120);
PRINT 'Registros actualizados: ' + CAST(@RegistrosActualizados AS VARCHAR) + ' de ' + CAST(@TotalRegistros AS VARCHAR);

-- Verificar registros pendientes
DECLARE @RegistrosRestantes INT = (SELECT COUNT(*) FROM dbo.facturakardes WHERE kar_pre_pub_detal IS NULL);
PRINT 'Registros pendientes: ' + CAST(@RegistrosRestantes AS VARCHAR);

-- Estadísticas básicas
DECLARE @ConOfertas INT = (SELECT COUNT(*) FROM dbo.facturakardes WHERE kar_tiene_oferta = 'S');
DECLARE @SinOfertas INT = (SELECT COUNT(*) FROM dbo.facturakardes WHERE kar_tiene_oferta = 'N');

PRINT '';
PRINT 'ESTADÍSTICAS:';
PRINT 'Registros con ofertas: ' + CAST(@ConOfertas AS VARCHAR);
PRINT 'Registros sin ofertas: ' + CAST(@SinOfertas AS VARCHAR);

PRINT '';
PRINT 'Actualización completada!'; 