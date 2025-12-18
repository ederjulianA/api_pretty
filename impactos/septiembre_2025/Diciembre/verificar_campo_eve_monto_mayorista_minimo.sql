-- Script para verificar el campo eve_monto_mayorista_minimo
-- Fecha: Diciembre 2025
-- Descripción: Verifica que el campo fue agregado correctamente y muestra su uso

-- 1. Verificar que el campo existe
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT * 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'eventos_promocionales' 
            AND COLUMN_NAME = 'eve_monto_mayorista_minimo'
        ) 
        THEN 'Campo existe correctamente' 
        ELSE 'Campo NO existe' 
    END AS estado_campo;

-- 2. Mostrar información detallada del campo
SELECT 
    COLUMN_NAME,
    DATA_TYPE,
    NUMERIC_PRECISION,
    NUMERIC_SCALE,
    IS_NULLABLE,
    COLUMN_DEFAULT,
    CHARACTER_MAXIMUM_LENGTH
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'eventos_promocionales'
AND COLUMN_NAME = 'eve_monto_mayorista_minimo';

-- 3. Mostrar todos los eventos con el nuevo campo
SELECT 
    eve_sec,
    eve_nombre,
    eve_fecha_inicio,
    eve_fecha_fin,
    eve_descuento_detal,
    eve_descuento_mayor,
    eve_monto_mayorista_minimo,
    eve_activo,
    CASE 
        WHEN GETDATE() BETWEEN eve_fecha_inicio AND eve_fecha_fin AND eve_activo = 'S' 
        THEN 'S' 
        ELSE 'N' 
    END AS eve_en_curso,
    eve_fecha_creacion
FROM dbo.eventos_promocionales
ORDER BY eve_fecha_inicio DESC;

-- 4. Estadísticas del campo
SELECT 
    COUNT(*) AS total_eventos,
    COUNT(eve_monto_mayorista_minimo) AS eventos_con_monto_minimo,
    COUNT(*) - COUNT(eve_monto_mayorista_minimo) AS eventos_sin_monto_minimo,
    MIN(eve_monto_mayorista_minimo) AS monto_minimo_mas_bajo,
    MAX(eve_monto_mayorista_minimo) AS monto_minimo_mas_alto,
    AVG(eve_monto_mayorista_minimo) AS promedio_monto_minimo
FROM dbo.eventos_promocionales;

-- 5. Eventos activos con monto mínimo configurado
SELECT 
    eve_sec,
    eve_nombre,
    eve_descuento_mayor,
    eve_monto_mayorista_minimo,
    DATEDIFF(day, GETDATE(), eve_fecha_fin) AS dias_restantes
FROM dbo.eventos_promocionales
WHERE eve_activo = 'S'
AND GETDATE() BETWEEN eve_fecha_inicio AND eve_fecha_fin
AND eve_monto_mayorista_minimo IS NOT NULL
ORDER BY eve_monto_mayorista_minimo;

PRINT 'Verificación completada';

