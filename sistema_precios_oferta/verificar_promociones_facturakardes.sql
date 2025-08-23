-- sistema_precios_oferta/verificar_promociones_facturakardes.sql
-- Script para verificar que la información de promociones se está guardando correctamente en facturakardes

-- 1. Verificar que los campos de promociones existen en facturakardes
PRINT '=== VERIFICACIÓN DE CAMPOS DE PROMOCIONES EN FACTURAKARDES ==='
GO

SELECT 
    COLUMN_NAME,
    DATA_TYPE,
    IS_NULLABLE,
    CHARACTER_MAXIMUM_LENGTH
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
GO

-- 2. Contar registros con información de promociones
PRINT '=== ESTADÍSTICAS DE PROMOCIONES EN FACTURAKARDES ==='
GO

SELECT 
    COUNT(*) AS total_registros,
    COUNT(kar_tiene_oferta) AS registros_con_tiene_oferta,
    SUM(CASE WHEN kar_tiene_oferta = 'S' THEN 1 ELSE 0 END) AS registros_con_oferta_activa,
    SUM(CASE WHEN kar_tiene_oferta = 'N' THEN 1 ELSE 0 END) AS registros_sin_oferta,
    COUNT(kar_precio_oferta) AS registros_con_precio_oferta,
    COUNT(kar_descuento_porcentaje) AS registros_con_descuento_porcentaje,
    COUNT(kar_codigo_promocion) AS registros_con_codigo_promocion,
    COUNT(kar_descripcion_promocion) AS registros_con_descripcion_promocion
FROM dbo.facturakardes;
GO

-- 3. Mostrar ejemplos de registros con promociones activas
PRINT '=== EJEMPLOS DE REGISTROS CON PROMOCIONES ACTIVAS ==='
GO

SELECT TOP 10
    fk.fac_sec,
    f.fac_nro,
    f.fac_fec,
    fk.art_sec,
    a.art_cod,
    a.art_nom,
    fk.kar_pre_pub_detal,
    fk.kar_pre_pub_mayor,
    fk.kar_tiene_oferta,
    fk.kar_precio_oferta,
    fk.kar_descuento_porcentaje,
    fk.kar_codigo_promocion,
    fk.kar_descripcion_promocion,
    fk.kar_pre_pub AS precio_final_cobrado
FROM dbo.facturakardes fk
INNER JOIN dbo.factura f ON fk.fac_sec = f.fac_sec
INNER JOIN dbo.articulos a ON fk.art_sec = a.art_sec
WHERE fk.kar_tiene_oferta = 'S'
ORDER BY f.fac_fec DESC;
GO

-- 4. Verificar consistencia de datos de promociones
PRINT '=== VERIFICACIÓN DE CONSISTENCIA DE DATOS ==='
GO

SELECT 
    'Registros con tiene_oferta = S pero sin precio_oferta ni descuento' AS tipo_inconsistencia,
    COUNT(*) AS cantidad
FROM dbo.facturakardes 
WHERE kar_tiene_oferta = 'S' 
    AND (kar_precio_oferta IS NULL OR kar_precio_oferta = 0)
    AND (kar_descuento_porcentaje IS NULL OR kar_descuento_porcentaje = 0)

UNION ALL

SELECT 
    'Registros con precio_oferta pero tiene_oferta = N' AS tipo_inconsistencia,
    COUNT(*) AS cantidad
FROM dbo.facturakardes 
WHERE kar_tiene_oferta = 'N' 
    AND (kar_precio_oferta IS NOT NULL AND kar_precio_oferta > 0)

UNION ALL

SELECT 
    'Registros con descuento_porcentaje pero tiene_oferta = N' AS tipo_inconsistencia,
    COUNT(*) AS cantidad
FROM dbo.facturakardes 
WHERE kar_tiene_oferta = 'N' 
    AND (kar_descuento_porcentaje IS NOT NULL AND kar_descuento_porcentaje > 0);
GO

-- 5. Mostrar pedidos recientes sincronizados desde WooCommerce
PRINT '=== PEDIDOS RECIENTES SINCRONIZADOS DESDE WOOCOMMERCE ==='
GO

SELECT TOP 20
    f.fac_nro,
    f.fac_nro_woo,
    f.fac_fec,
    f.fac_est_fac,
    COUNT(fk.art_sec) AS total_articulos,
    SUM(CASE WHEN fk.kar_tiene_oferta = 'S' THEN 1 ELSE 0 END) AS articulos_con_oferta,
    SUM(CASE WHEN fk.kar_tiene_oferta = 'N' THEN 1 ELSE 0 END) AS articulos_sin_oferta
FROM dbo.factura f
INNER JOIN dbo.facturakardes fk ON f.fac_sec = fk.fac_sec
WHERE f.fac_nro_woo IS NOT NULL 
    AND f.fac_nro_woo != ''
    AND f.fac_fec >= DATEADD(day, -30, GETDATE()) -- Últimos 30 días
GROUP BY f.fac_nro, f.fac_nro_woo, f.fac_fec, f.fac_est_fac
ORDER BY f.fac_fec DESC;
GO

-- 6. Comparar precios originales vs precios con oferta
PRINT '=== COMPARACIÓN DE PRECIOS ORIGINALES VS PRECIOS CON OFERTA ==='
GO

SELECT TOP 15
    f.fac_nro,
    f.fac_fec,
    a.art_cod,
    a.art_nom,
    fk.kar_pre_pub_detal AS precio_detal_original,
    fk.kar_pre_pub_mayor AS precio_mayor_original,
    fk.kar_precio_oferta AS precio_oferta,
    fk.kar_descuento_porcentaje AS descuento_porcentaje,
    fk.kar_pre_pub AS precio_final_cobrado,
    fk.kar_codigo_promocion,
    CASE 
        WHEN fk.kar_precio_oferta IS NOT NULL AND fk.kar_precio_oferta > 0 
        THEN fk.kar_precio_oferta
        WHEN fk.kar_descuento_porcentaje IS NOT NULL AND fk.kar_descuento_porcentaje > 0
        THEN fk.kar_pre_pub_detal * (1 - fk.kar_descuento_porcentaje / 100)
        ELSE fk.kar_pre_pub_detal
    END AS precio_calculado_con_oferta,
    CASE 
        WHEN fk.kar_precio_oferta IS NOT NULL AND fk.kar_precio_oferta > 0 
        THEN 'Precio fijo'
        WHEN fk.kar_descuento_porcentaje IS NOT NULL AND fk.kar_descuento_porcentaje > 0
        THEN 'Descuento porcentual'
        ELSE 'Sin oferta'
    END AS tipo_oferta
FROM dbo.facturakardes fk
INNER JOIN dbo.factura f ON fk.fac_sec = f.fac_sec
INNER JOIN dbo.articulos a ON fk.art_sec = a.art_sec
WHERE fk.kar_tiene_oferta = 'S'
    AND f.fac_fec >= DATEADD(day, -7, GETDATE()) -- Últimos 7 días
ORDER BY f.fac_fec DESC, fk.kar_precio_oferta DESC;
GO

PRINT '=== VERIFICACIÓN COMPLETADA ===' 