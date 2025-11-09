-- Script para verificar el campo fac_descuento_general en la tabla factura
-- Fecha: Septiembre 2025
-- Descripción: Verifica si el campo fac_descuento_general existe y muestra información sobre su uso

-- 1. Verificar si el campo existe en la tabla factura
SELECT 
    COLUMN_NAME, 
    DATA_TYPE, 
    IS_NULLABLE,
    NUMERIC_PRECISION,
    NUMERIC_SCALE,
    COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME = 'factura' 
AND COLUMN_NAME = 'fac_descuento_general';

-- 2. Verificar la estructura actual de la tabla factura (campos relacionados con descuentos y totales)
SELECT 
    COLUMN_NAME, 
    DATA_TYPE, 
    IS_NULLABLE,
    NUMERIC_PRECISION,
    NUMERIC_SCALE
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME = 'factura'
AND (
    COLUMN_NAME LIKE '%descuento%' 
    OR COLUMN_NAME LIKE '%total%'
    OR COLUMN_NAME LIKE '%woo%'
)
ORDER BY ORDINAL_POSITION;

-- 3. Verificar si hay registros con fac_descuento_general no nulo o mayor a 0
SELECT 
    COUNT(*) as total_registros,
    COUNT(fac_descuento_general) as registros_con_descuento_no_nulo,
    COUNT(CASE WHEN fac_descuento_general IS NOT NULL AND fac_descuento_general > 0 THEN 1 END) as registros_con_descuento_mayor_cero,
    SUM(CASE WHEN fac_descuento_general IS NOT NULL THEN fac_descuento_general ELSE 0 END) as total_descuentos_aplicados
FROM dbo.factura;

-- 4. Verificar registros recientes con descuento general aplicado
SELECT TOP 10
    fac_sec,
    fac_nro,
    fac_nro_woo,
    fac_tip_cod,
    fac_descuento_general,
    fac_total_woo,
    fac_fec,
    -- Calcular total de detalles para comparar
    (SELECT SUM(kar_total) 
     FROM dbo.facturakardes 
     WHERE fac_sec = f.fac_sec) as total_detalles,
    -- Calcular total final (detalles - descuento)
    (SELECT SUM(kar_total) 
     FROM dbo.facturakardes 
     WHERE fac_sec = f.fac_sec) - ISNULL(fac_descuento_general, 0) as total_final_calculado
FROM dbo.factura f
WHERE fac_descuento_general IS NOT NULL 
AND fac_descuento_general > 0
ORDER BY fac_fec DESC;

-- 5. Verificar facturas de WooCommerce sin descuento general (para comparación)
SELECT TOP 10
    fac_sec,
    fac_nro,
    fac_nro_woo,
    fac_tip_cod,
    fac_descuento_general,
    fac_total_woo,
    fac_fec,
    (SELECT SUM(kar_total) 
     FROM dbo.facturakardes 
     WHERE fac_sec = f.fac_sec) as total_detalles
FROM dbo.factura f
WHERE fac_nro_woo IS NOT NULL 
AND (fac_descuento_general IS NULL OR fac_descuento_general = 0)
ORDER BY fac_fec DESC;

-- 6. Estadísticas de descuentos generales
SELECT 
    fac_tip_cod,
    COUNT(*) as total_facturas,
    COUNT(CASE WHEN fac_descuento_general > 0 THEN 1 END) as facturas_con_descuento,
    AVG(CASE WHEN fac_descuento_general > 0 THEN fac_descuento_general ELSE NULL END) as promedio_descuento,
    MAX(fac_descuento_general) as maximo_descuento,
    MIN(CASE WHEN fac_descuento_general > 0 THEN fac_descuento_general ELSE NULL END) as minimo_descuento
FROM dbo.factura
GROUP BY fac_tip_cod;

