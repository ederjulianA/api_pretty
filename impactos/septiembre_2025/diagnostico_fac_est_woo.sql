-- Script de diagnóstico para el campo fac_est_woo
-- Fecha: Septiembre 2025
-- Descripción: Diagnostica problemas con el campo fac_est_woo

-- 1. Verificar si el campo existe
IF EXISTS (
    SELECT 1 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'factura' 
    AND COLUMN_NAME = 'fac_est_woo'
)
BEGIN
    PRINT '✅ Campo fac_est_woo existe en la tabla factura'
    
    -- Mostrar información del campo
    SELECT 
        COLUMN_NAME, 
        DATA_TYPE, 
        IS_NULLABLE,
        CHARACTER_MAXIMUM_LENGTH
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'factura' 
    AND COLUMN_NAME = 'fac_est_woo'
END
ELSE
BEGIN
    PRINT '❌ Campo fac_est_woo NO existe en la tabla factura'
    PRINT 'Ejecutar el script agregar_campo_fac_est_woo.sql'
END

-- 2. Verificar si hay restricciones o índices que puedan estar causando problemas
SELECT 
    tc.CONSTRAINT_NAME,
    tc.CONSTRAINT_TYPE,
    cc.COLUMN_NAME
FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
INNER JOIN INFORMATION_SCHEMA.CONSTRAINT_COLUMN_USAGE cc 
    ON tc.CONSTRAINT_NAME = cc.CONSTRAINT_NAME
WHERE tc.TABLE_NAME = 'factura' 
AND cc.COLUMN_NAME = 'fac_est_woo'

-- 3. Verificar si hay triggers que puedan estar afectando el campo
SELECT 
    t.TRIGGER_NAME,
    t.TRIGGER_EVENT,
    t.TRIGGER_SCHEMA
FROM INFORMATION_SCHEMA.TRIGGERS t
WHERE t.EVENT_OBJECT_TABLE = 'factura'

-- 4. Verificar registros recientes para ver si el campo se está guardando
SELECT TOP 5
    fac_sec,
    fac_nro,
    fac_nro_woo,
    fac_est_woo,
    fac_tip_cod,
    fac_fec,
    CASE 
        WHEN fac_est_woo IS NULL THEN 'NULL'
        WHEN fac_est_woo = '' THEN 'VACIO'
        ELSE 'CON_VALOR'
    END as estado_campo
FROM dbo.factura 
WHERE fac_nro_woo IS NOT NULL 
ORDER BY fac_fec DESC

-- 5. Contar registros por tipo de estado del campo
SELECT 
    CASE 
        WHEN fac_est_woo IS NULL THEN 'NULL'
        WHEN fac_est_woo = '' THEN 'VACIO'
        ELSE 'CON_VALOR'
    END as estado_campo,
    COUNT(*) as cantidad
FROM dbo.factura 
WHERE fac_nro_woo IS NOT NULL 
GROUP BY 
    CASE 
        WHEN fac_est_woo IS NULL THEN 'NULL'
        WHEN fac_est_woo = '' THEN 'VACIO'
        ELSE 'CON_VALOR'
    END
