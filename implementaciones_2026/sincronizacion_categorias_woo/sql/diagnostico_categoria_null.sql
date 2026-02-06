-- ============================================================================
-- Script de Diagnóstico: Categorías NULL en ArticuloHook
-- Fecha: 2026-02-05
-- ============================================================================

-- Caso 1: Verificar el artículo específico art_sec = 713
SELECT
    'Artículo 713 en ArticuloHook' AS Tabla,
    ArtHookCod AS SKU,
    ArtHooName AS Nombre,
    ArtHookCatSysCod AS [Código Cat Sistema],
    ArtHookCatSysNombre AS [Cat Sistema],
    ArtHookSubcatSysNombre AS [Subcat Sistema],
    ArtHookCatWooNombre AS [Cat WooCommerce],
    ArtHookSubcatWooNombre AS [Subcat WooCommerce],
    ArtHookCategoriaMatch AS [Match],
    ArtHookCatFechaVerificacion AS [Fecha Verificación]
FROM ArticuloHook
WHERE ArtHookCod IN (
    SELECT art_cod FROM dbo.articulos WHERE art_sec = '713'
);

-- Caso 2: Verificar el artículo en la tabla articulos
SELECT
    'Artículo 713 en articulos' AS Tabla,
    a.art_sec AS [art_sec],
    a.art_cod AS SKU,
    a.art_nom AS Nombre,
    a.inv_sub_gru_cod AS [Código Subcategoría],
    isg.inv_sub_gru_nom AS [Subcategoría],
    isg.inv_gru_cod AS [Código Grupo],
    ig.inv_gru_nom AS [Categoría]
FROM dbo.articulos a
LEFT JOIN dbo.inventario_subgrupo isg ON a.inv_sub_gru_cod = isg.inv_sub_gru_cod
LEFT JOIN dbo.inventario_grupo ig ON isg.inv_gru_cod = ig.inv_gru_cod
WHERE a.art_sec = '713';

-- Caso 3: Verificar si el artículo tiene categoría asignada
SELECT
    'Diagnóstico' AS Resultado,
    CASE
        WHEN a.inv_sub_gru_cod IS NULL THEN '❌ El artículo NO tiene subcategoría asignada (inv_sub_gru_cod es NULL)'
        WHEN isg.inv_sub_gru_cod IS NULL THEN '❌ La subcategoría no existe en inventario_subgrupo'
        WHEN ig.inv_gru_cod IS NULL THEN '❌ La categoría padre no existe en inventario_grupo'
        ELSE '✅ El artículo tiene categoría correctamente asignada'
    END AS Diagnostico,
    a.inv_sub_gru_cod AS [inv_sub_gru_cod en articulos],
    isg.inv_sub_gru_cod AS [inv_sub_gru_cod encontrado],
    ig.inv_gru_cod AS [inv_gru_cod encontrado]
FROM dbo.articulos a
LEFT JOIN dbo.inventario_subgrupo isg ON a.inv_sub_gru_cod = isg.inv_sub_gru_cod
LEFT JOIN dbo.inventario_grupo ig ON isg.inv_gru_cod = ig.inv_gru_cod
WHERE a.art_sec = '713';

-- Caso 4: Contar cuántos artículos tienen este problema
SELECT
    COUNT(*) AS [Total Artículos en ArticuloHook],
    SUM(CASE WHEN ArtHookCatSysNombre IS NULL THEN 1 ELSE 0 END) AS [Sin Categoría Sistema],
    SUM(CASE WHEN ArtHookCatWooNombre IS NULL THEN 1 ELSE 0 END) AS [Sin Categoría WooCommerce],
    SUM(CASE WHEN ArtHookCatSysNombre IS NULL AND ArtHookCatWooNombre IS NULL THEN 1 ELSE 0 END) AS [Sin Ninguna Categoría],
    CAST(SUM(CASE WHEN ArtHookCatSysNombre IS NULL THEN 1 ELSE 0 END) * 100.0 / COUNT(*) AS DECIMAL(5,2)) AS [% Sin Cat Sistema]
FROM ArticuloHook
WHERE ArtHookCatFechaVerificacion IS NOT NULL; -- Solo productos ya sincronizados

-- Caso 5: Encontrar artículos sin categoría en el sistema local
SELECT TOP 20
    a.art_sec,
    a.art_cod AS SKU,
    a.art_nom AS Nombre,
    a.inv_sub_gru_cod AS [Subcategoría Asignada],
    CASE
        WHEN a.inv_sub_gru_cod IS NULL THEN '❌ NULL en articulos'
        WHEN isg.inv_sub_gru_cod IS NULL THEN '❌ No existe en inventario_subgrupo'
        ELSE '✅ OK'
    END AS Estado
FROM dbo.articulos a
LEFT JOIN dbo.inventario_subgrupo isg ON a.inv_sub_gru_cod = isg.inv_sub_gru_cod
WHERE a.art_woo_id IS NOT NULL  -- Solo productos que están en WooCommerce
  AND (a.inv_sub_gru_cod IS NULL OR isg.inv_sub_gru_cod IS NULL)
ORDER BY a.art_sec;

-- Caso 6: Verificar la estructura de la query que usa el código
-- Esta es la misma query que ejecuta el código
DECLARE @art_cod VARCHAR(50) = (SELECT art_cod FROM dbo.articulos WHERE art_sec = '713');

SELECT
    ig.inv_gru_cod AS cat_sys_cod,
    ig.inv_gru_nom AS cat_sys_nombre,
    isg.inv_sub_gru_cod AS subcat_sys_cod,
    isg.inv_sub_gru_nom AS subcat_sys_nombre
FROM dbo.articulos a
JOIN dbo.inventario_subgrupo isg ON a.inv_sub_gru_cod = isg.inv_sub_gru_cod
JOIN dbo.inventario_grupo ig ON isg.inv_gru_cod = ig.inv_gru_cod
WHERE a.art_cod = @art_cod;

-- Si esta query no retorna nada, entonces el artículo no tiene categoría asignada
-- y por eso las categorías quedan NULL en ArticuloHook
