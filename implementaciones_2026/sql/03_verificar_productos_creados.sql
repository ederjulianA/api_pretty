-- =====================================================
-- Script: Verificar productos variables creados
-- Fecha: 2026-02-04
-- =====================================================

USE [NombreDeBaseDeDatos]; -- CAMBIAR POR EL NOMBRE REAL DE LA BD
GO

PRINT '================================================';
PRINT 'VERIFICACIÓN DE PRODUCTOS VARIABLES CREADOS';
PRINT '================================================';
PRINT '';

-- Resumen de productos por tipo
SELECT
    'PRODUCTOS PADRES' AS tipo,
    COUNT(*) AS cantidad
FROM dbo.articulos
WHERE art_woo_type = 'variable'

UNION ALL

SELECT
    'VARIACIONES',
    COUNT(*)
FROM dbo.articulos
WHERE art_woo_type = 'variation'

UNION ALL

SELECT
    'PRODUCTOS SIMPLES',
    COUNT(*)
FROM dbo.articulos
WHERE art_woo_type = 'simple' OR art_woo_type IS NULL;

PRINT '';
PRINT 'Detalle de productos variables y sus variaciones:';
PRINT '';

-- Detalle de productos variables y sus variaciones
SELECT
    padre.art_sec AS padre_art_sec,
    padre.art_cod AS padre_codigo,
    padre.art_nom AS padre_nombre,
    padre.art_woo_id AS padre_woo_id,
    COUNT(hijo.art_sec) AS cantidad_variaciones
FROM dbo.articulos padre
LEFT JOIN dbo.articulos hijo
    ON padre.art_sec = hijo.art_parent_sec
WHERE padre.art_woo_type = 'variable'
GROUP BY padre.art_sec, padre.art_cod, padre.art_nom, padre.art_woo_id
ORDER BY padre.art_sec;

PRINT '';
PRINT '================================================';
PRINT 'Detalle completo de familias de productos';
PRINT '(Cambiar @parent_code para ver diferentes productos)';
PRINT '================================================';
PRINT '';

-- Detalle completo de una familia de productos
DECLARE @parent_code VARCHAR(50) = 'LAB001'; -- Cambiar según necesidad

SELECT
    a.art_sec,
    a.art_cod,
    a.art_nom,
    a.art_woo_type,
    a.art_woo_id,
    a.art_woo_variation_id,
    a.art_variation_attributes,
    ad1.art_bod_pre AS precio_detal,
    ad2.art_bod_pre AS precio_mayor,
    ISNULL(e.existencia, 0) AS stock
FROM dbo.articulos a
LEFT JOIN dbo.articulosdetalle ad1
    ON a.art_sec = ad1.art_sec AND ad1.lis_pre_cod = 1
LEFT JOIN dbo.articulosdetalle ad2
    ON a.art_sec = ad2.art_sec AND ad2.lis_pre_cod = 2
LEFT JOIN dbo.vwExistencias e
    ON a.art_sec = e.art_sec
WHERE a.art_cod = @parent_code
   OR a.art_parent_sec = (
       SELECT art_sec FROM dbo.articulos WHERE art_cod = @parent_code
   )
ORDER BY
    CASE WHEN a.art_woo_type = 'variable' THEN 0 ELSE 1 END,
    a.art_cod;

PRINT '';
PRINT '================================================';
