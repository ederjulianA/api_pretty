-- Script para verificar la tabla eventos_promocionales
-- Fecha: Septiembre 2025
-- Descripción: Verifica la estructura y datos de la tabla eventos_promocionales

-- 1. Verificar estructura de la tabla
SELECT 
    COLUMN_NAME,
    DATA_TYPE,
    IS_NULLABLE,
    COLUMN_DEFAULT,
    NUMERIC_PRECISION,
    NUMERIC_SCALE,
    CHARACTER_MAXIMUM_LENGTH
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'eventos_promocionales'
ORDER BY ORDINAL_POSITION;

-- 2. Verificar índices
SELECT 
    i.name AS index_name,
    i.type_desc AS index_type,
    COL_NAME(ic.object_id, ic.column_id) AS column_name
FROM sys.indexes i
INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
WHERE OBJECT_NAME(i.object_id) = 'eventos_promocionales'
ORDER BY i.name, ic.key_ordinal;

-- 3. Contar registros
SELECT 
    COUNT(*) AS total_eventos,
    SUM(CASE WHEN eve_activo = 'S' THEN 1 ELSE 0 END) AS eventos_activos,
    SUM(CASE WHEN eve_activo = 'N' THEN 1 ELSE 0 END) AS eventos_inactivos
FROM dbo.eventos_promocionales;

-- 4. Listar todos los eventos
SELECT 
    eve_sec,
    eve_nombre,
    eve_fecha_inicio,
    eve_fecha_fin,
    eve_descuento_detal,
    eve_descuento_mayor,
    eve_activo,
    CASE 
        WHEN GETDATE() BETWEEN eve_fecha_inicio AND eve_fecha_fin AND eve_activo = 'S' 
        THEN 'S' 
        ELSE 'N' 
    END AS eve_en_curso,
    eve_fecha_creacion,
    eve_usuario_creacion,
    eve_fecha_modificacion,
    eve_usuario_modificacion
FROM dbo.eventos_promocionales
ORDER BY eve_fecha_inicio DESC;

-- 5. Verificar eventos activos en la fecha actual
SELECT 
    eve_sec,
    eve_nombre,
    eve_fecha_inicio,
    eve_fecha_fin,
    eve_descuento_detal,
    eve_descuento_mayor,
    DATEDIFF(day, GETDATE(), eve_fecha_fin) AS dias_restantes
FROM dbo.eventos_promocionales
WHERE eve_activo = 'S'
AND GETDATE() BETWEEN eve_fecha_inicio AND eve_fecha_fin
ORDER BY eve_fecha_creacion DESC;

-- 6. Verificar eventos que se solapan
SELECT 
    e1.eve_sec AS evento1_sec,
    e1.eve_nombre AS evento1_nombre,
    e1.eve_fecha_inicio AS evento1_inicio,
    e1.eve_fecha_fin AS evento1_fin,
    e2.eve_sec AS evento2_sec,
    e2.eve_nombre AS evento2_nombre,
    e2.eve_fecha_inicio AS evento2_inicio,
    e2.eve_fecha_fin AS evento2_fin
FROM dbo.eventos_promocionales e1
INNER JOIN dbo.eventos_promocionales e2 
    ON e1.eve_sec < e2.eve_sec
    AND e1.eve_activo = 'S'
    AND e2.eve_activo = 'S'
WHERE (
    (e1.eve_fecha_inicio BETWEEN e2.eve_fecha_inicio AND e2.eve_fecha_fin)
    OR (e1.eve_fecha_fin BETWEEN e2.eve_fecha_inicio AND e2.eve_fecha_fin)
    OR (e2.eve_fecha_inicio BETWEEN e1.eve_fecha_inicio AND e1.eve_fecha_fin)
    OR (e2.eve_fecha_fin BETWEEN e1.eve_fecha_inicio AND e1.eve_fecha_fin)
);

