-- Script para agregar campo estado a promociones_detalle
-- Ejecutar este script para actualizar la estructura de la base de datos

-- Agregar campo estado con valor por defecto 'A' (Activo)
ALTER TABLE dbo.promociones_detalle 
ADD pro_det_estado CHAR(1) DEFAULT 'A';

-- Agregar constraint para validar valores permitidos
ALTER TABLE dbo.promociones_detalle 
ADD CONSTRAINT CK_promociones_detalle_estado 
CHECK (pro_det_estado IN ('A', 'I'));

-- Agregar campos de auditoría para modificaciones
ALTER TABLE dbo.promociones_detalle 
ADD pro_det_fecha_modificacion DATETIME NULL,
    pro_det_usuario_modificacion VARCHAR(50) NULL;

-- Actualizar registros existentes para que tengan estado 'A'
UPDATE dbo.promociones_detalle 
SET pro_det_estado = 'A' 
WHERE pro_det_estado IS NULL;

-- Crear índice para mejorar performance en consultas por estado
CREATE INDEX IX_promociones_detalle_estado 
ON dbo.promociones_detalle (pro_det_estado);

-- Verificar la estructura actualizada
SELECT 
    COLUMN_NAME,
    DATA_TYPE,
    IS_NULLABLE,
    COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME = 'promociones_detalle' 
AND TABLE_SCHEMA = 'dbo'
ORDER BY ORDINAL_POSITION; 