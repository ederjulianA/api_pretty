-- Script para agregar campo fac_descuento_general a la tabla factura
-- Fecha: Septiembre 2025
-- Descripción: Agrega un nuevo campo para almacenar el descuento general aplicado a nivel de encabezado de factura
--              Este descuento proviene de fee_lines de WooCommerce y NO afecta el cálculo de lista de precios (detal/mayor)

-- Verificar si el campo ya existe antes de agregarlo
IF NOT EXISTS (
    SELECT * 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'factura' 
    AND COLUMN_NAME = 'fac_descuento_general'
)
BEGIN
    -- Agregar el campo fac_descuento_general a la tabla factura
    ALTER TABLE dbo.factura 
    ADD fac_descuento_general DECIMAL(17, 2) NULL DEFAULT 0;
    
    PRINT 'Campo fac_descuento_general agregado exitosamente a la tabla factura';
END
ELSE
BEGIN
    PRINT 'El campo fac_descuento_general ya existe en la tabla factura';
END

-- Verificar que el campo se agregó correctamente
-- SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, NUMERIC_PRECISION, NUMERIC_SCALE
-- FROM INFORMATION_SCHEMA.COLUMNS 
-- WHERE TABLE_NAME = 'factura' AND COLUMN_NAME = 'fac_descuento_general';

