-- Script para agregar campos de precios y ofertas a la tabla facturakardes
-- Ejecutar este script para garantizar la consistencia de datos históricos

-- Verificar si los campos ya existen antes de crearlos
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[facturakardes]') AND name = 'kar_pre_pub_detal')
BEGIN
    -- Agregar campo para precio detal
    ALTER TABLE [dbo].[facturakardes]
    ADD [kar_pre_pub_detal] [decimal](17, 2) NULL;
    
    PRINT 'Campo kar_pre_pub_detal agregado exitosamente';
END
ELSE
BEGIN
    PRINT 'El campo kar_pre_pub_detal ya existe';
END

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[facturakardes]') AND name = 'kar_pre_pub_mayor')
BEGIN
    -- Agregar campo para precio mayor
    ALTER TABLE [dbo].[facturakardes]
    ADD [kar_pre_pub_mayor] [decimal](17, 2) NULL;
    
    PRINT 'Campo kar_pre_pub_mayor agregado exitosamente';
END
ELSE
BEGIN
    PRINT 'El campo kar_pre_pub_mayor ya existe';
END

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[facturakardes]') AND name = 'kar_tiene_oferta')
BEGIN
    -- Agregar campo para indicar si tenía oferta
    ALTER TABLE [dbo].[facturakardes]
    ADD [kar_tiene_oferta] [char](1) DEFAULT 'N';
    
    PRINT 'Campo kar_tiene_oferta agregado exitosamente';
END
ELSE
BEGIN
    PRINT 'El campo kar_tiene_oferta ya existe';
END

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[facturakardes]') AND name = 'kar_precio_oferta')
BEGIN
    -- Agregar campo para precio de oferta
    ALTER TABLE [dbo].[facturakardes]
    ADD [kar_precio_oferta] [decimal](17, 2) NULL;
    
    PRINT 'Campo kar_precio_oferta agregado exitosamente';
END
ELSE
BEGIN
    PRINT 'El campo kar_precio_oferta ya existe';
END

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[facturakardes]') AND name = 'kar_descuento_porcentaje')
BEGIN
    -- Agregar campo para descuento porcentual
    ALTER TABLE [dbo].[facturakardes]
    ADD [kar_descuento_porcentaje] [decimal](5, 2) NULL;
    
    PRINT 'Campo kar_descuento_porcentaje agregado exitosamente';
END
ELSE
BEGIN
    PRINT 'El campo kar_descuento_porcentaje ya existe';
END

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[facturakardes]') AND name = 'kar_codigo_promocion')
BEGIN
    -- Agregar campo para código de promoción
    ALTER TABLE [dbo].[facturakardes]
    ADD [kar_codigo_promocion] [varchar](20) NULL;
    
    PRINT 'Campo kar_codigo_promocion agregado exitosamente';
END
ELSE
BEGIN
    PRINT 'El campo kar_codigo_promocion ya existe';
END

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[facturakardes]') AND name = 'kar_descripcion_promocion')
BEGIN
    -- Agregar campo para descripción de promoción
    ALTER TABLE [dbo].[facturakardes]
    ADD [kar_descripcion_promocion] [varchar](200) NULL;
    
    PRINT 'Campo kar_descripcion_promocion agregado exitosamente';
END
ELSE
BEGIN
    PRINT 'El campo kar_descripcion_promocion ya existe';
END

-- Crear índices para optimizar consultas
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE object_id = OBJECT_ID(N'[dbo].[facturakardes]') AND name = 'IX_facturakardes_tiene_oferta')
BEGIN
    CREATE NONCLUSTERED INDEX [IX_facturakardes_tiene_oferta]
    ON [dbo].[facturakardes] ([kar_tiene_oferta]);
    
    PRINT 'Índice IX_facturakardes_tiene_oferta creado exitosamente';
END
ELSE
BEGIN
    PRINT 'El índice IX_facturakardes_tiene_oferta ya existe';
END

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE object_id = OBJECT_ID(N'[dbo].[facturakardes]') AND name = 'IX_facturakardes_codigo_promocion')
BEGIN
    CREATE NONCLUSTERED INDEX [IX_facturakardes_codigo_promocion]
    ON [dbo].[facturakardes] ([kar_codigo_promocion]);
    
    PRINT 'Índice IX_facturakardes_codigo_promocion creado exitosamente';
END
ELSE
BEGIN
    PRINT 'El índice IX_facturakardes_codigo_promocion ya existe';
END

-- Agregar constraints para validación de datos
IF NOT EXISTS (SELECT * FROM sys.check_constraints WHERE name = 'CK_facturakardes_tiene_oferta')
BEGIN
    ALTER TABLE [dbo].[facturakardes]
    ADD CONSTRAINT [CK_facturakardes_tiene_oferta]
    CHECK ([kar_tiene_oferta] IN ('S', 'N'));
    
    PRINT 'Constraint CK_facturakardes_tiene_oferta agregado exitosamente';
END
ELSE
BEGIN
    PRINT 'El constraint CK_facturakardes_tiene_oferta ya existe';
END

-- Script para actualizar registros existentes con información de precios
-- (Opcional: Descomentar si se desea actualizar datos históricos)
/*
PRINT 'Actualizando registros existentes con información de precios...';

UPDATE fk
SET 
    fk.kar_pre_pub_detal = ISNULL(ad1.art_bod_pre, 0),
    fk.kar_pre_pub_mayor = ISNULL(ad2.art_bod_pre, 0),
    fk.kar_tiene_oferta = CASE 
        WHEN (pd.pro_det_precio_oferta IS NOT NULL AND pd.pro_det_precio_oferta > 0) 
             OR (pd.pro_det_descuento_porcentaje IS NOT NULL AND pd.pro_det_descuento_porcentaje > 0)
        THEN 'S' 
        ELSE 'N' 
    END,
    fk.kar_precio_oferta = pd.pro_det_precio_oferta,
    fk.kar_descuento_porcentaje = pd.pro_det_descuento_porcentaje,
    fk.kar_codigo_promocion = p.pro_codigo,
    fk.kar_descripcion_promocion = p.pro_descripcion
FROM dbo.facturakardes fk
INNER JOIN dbo.factura f ON fk.fac_sec = f.fac_sec
INNER JOIN dbo.articulos a ON fk.art_sec = a.art_sec
LEFT JOIN dbo.articulosdetalle ad1 ON a.art_sec = ad1.art_sec AND ad1.lis_pre_cod = 1
LEFT JOIN dbo.articulosdetalle ad2 ON a.art_sec = ad2.art_sec AND ad2.lis_pre_cod = 2
LEFT JOIN dbo.promociones_detalle pd ON a.art_sec = pd.art_sec AND pd.pro_det_estado = 'A'
LEFT JOIN dbo.promociones p ON pd.pro_sec = p.pro_sec 
    AND p.pro_activa = 'S' 
    AND f.fac_fec BETWEEN p.pro_fecha_inicio AND p.pro_fecha_fin
WHERE fk.kar_pre_pub_detal IS NULL; -- Solo actualizar registros que no tengan datos

PRINT 'Actualización de registros existentes completada';
*/

-- Verificar la estructura final
PRINT 'Estructura final de la tabla facturakardes:';
SELECT 
    COLUMN_NAME,
    DATA_TYPE,
    IS_NULLABLE,
    COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME = 'facturakardes' 
    AND COLUMN_NAME IN (
        'kar_pre_pub_detal', 
        'kar_pre_pub_mayor', 
        'kar_tiene_oferta', 
        'kar_precio_oferta', 
        'kar_descuento_porcentaje', 
        'kar_codigo_promocion', 
        'kar_descripcion_promocion'
    )
ORDER BY COLUMN_NAME;

PRINT 'Script completado exitosamente!'; 