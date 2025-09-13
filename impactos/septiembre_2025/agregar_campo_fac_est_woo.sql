-- Script para agregar campo fac_est_woo a la tabla facturas
-- Fecha: Septiembre 2025
-- Descripción: Agrega un nuevo campo para almacenar el estado de WooCommerce de las facturas

-- Agregar el campo fac_est_woo a la tabla factura
ALTER TABLE factura 
ADD fac_est_woo VARCHAR(50) NULL;

-- Verificar que el campo se agregó correctamente
-- SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE 
-- FROM INFORMATION_SCHEMA.COLUMNS 
-- WHERE TABLE_NAME = 'factura' AND COLUMN_NAME = 'fac_est_woo';
