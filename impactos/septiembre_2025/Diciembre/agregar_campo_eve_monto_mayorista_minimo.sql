-- Script para agregar campo eve_monto_mayorista_minimo a la tabla eventos_promocionales
-- Fecha: Diciembre 2025
-- Descripción: Agrega el campo que almacena el monto mínimo que debe cumplir una compra
--              para poder obtener el porcentaje de descuento al mayor

-- Verificar si el campo ya existe
IF NOT EXISTS (
    SELECT * 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'eventos_promocionales' 
    AND COLUMN_NAME = 'eve_monto_mayorista_minimo'
)
BEGIN
    -- Agregar el campo eve_monto_mayorista_minimo
    ALTER TABLE [dbo].[eventos_promocionales]
    ADD [eve_monto_mayorista_minimo] [decimal](17, 2) NULL;
    
    PRINT 'Campo eve_monto_mayorista_minimo agregado exitosamente a la tabla eventos_promocionales';
    
    -- Agregar comentario descriptivo (si el sistema lo soporta)
    EXEC sp_addextendedproperty 
        @name = N'MS_Description', 
        @value = N'Monto mínimo que debe cumplir una compra para obtener el descuento al mayor', 
        @level0type = N'SCHEMA', @level0name = N'dbo', 
        @level1type = N'TABLE', @level1name = N'eventos_promocionales', 
        @level2type = N'COLUMN', @level2name = N'eve_monto_mayorista_minimo';
    
    PRINT 'Comentario descriptivo agregado al campo';
END
ELSE
BEGIN
    PRINT 'El campo eve_monto_mayorista_minimo ya existe en la tabla eventos_promocionales';
END

-- Verificar que el campo se agregó correctamente
SELECT 
    COLUMN_NAME,
    DATA_TYPE,
    NUMERIC_PRECISION,
    NUMERIC_SCALE,
    IS_NULLABLE,
    COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'eventos_promocionales'
AND COLUMN_NAME = 'eve_monto_mayorista_minimo';

-- Mostrar la estructura completa de la tabla actualizada
SELECT 
    COLUMN_NAME,
    DATA_TYPE,
    IS_NULLABLE,
    COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'eventos_promocionales'
ORDER BY ORDINAL_POSITION;

PRINT 'Script ejecutado exitosamente';

