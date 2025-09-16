-- Script para verificar el campo fac_est_woo en la tabla factura
-- Fecha: Septiembre 2025
-- Descripción: Verifica si el campo fac_est_woo existe y muestra información sobre su uso

-- 1. Verificar si el campo existe en la tabla factura
SELECT 
    COLUMN_NAME, 
    DATA_TYPE, 
    IS_NULLABLE,
    CHARACTER_MAXIMUM_LENGTH
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME = 'factura' 
AND COLUMN_NAME = 'fac_est_woo';

-- 2. Verificar la estructura actual de la tabla factura (primeras 10 columnas)
SELECT TOP 10
    COLUMN_NAME, 
    DATA_TYPE, 
    IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME = 'factura'
ORDER BY ORDINAL_POSITION;

-- 3. Verificar si hay registros con fac_est_woo no nulo
SELECT 
    COUNT(*) as total_registros,
    COUNT(fac_est_woo) as registros_con_estado_woo,
    COUNT(CASE WHEN fac_est_woo IS NOT NULL AND fac_est_woo != '' THEN 1 END) as registros_con_estado_no_vacio
FROM dbo.factura;

-- 4. Verificar registros recientes con fac_nro_woo
SELECT TOP 10
    fac_sec,
    fac_nro,
    fac_nro_woo,
    fac_est_woo,
    fac_tip_cod,
    fac_fec
FROM dbo.factura 
WHERE fac_nro_woo IS NOT NULL 
ORDER BY fac_fec DESC;

-- 5. Verificar si hay errores en la estructura de la tabla
SELECT 
    TABLE_NAME,
    COLUMN_NAME,
    DATA_TYPE,
    IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME = 'factura' 
AND COLUMN_NAME LIKE '%woo%';
