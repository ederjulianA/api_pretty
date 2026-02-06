-- ============================================================================
-- Test específico para art_sec 713 (SKU E69707445)
-- ============================================================================

-- 1. Verificar datos del artículo
SELECT
    '1. DATOS DEL ARTÍCULO' AS Sección,
    art_sec,
    art_cod AS SKU,
    art_nom AS Nombre,
    art_woo_id AS [WooCommerce ID],
    inv_sub_gru_cod AS [Código Subcategoría]
FROM dbo.articulos
WHERE art_sec = '713';

-- 2. Verificar la query exacta que usa el código (por SKU)
SELECT
    '2. QUERY POR SKU (como en el código)' AS Sección,
    ig.inv_gru_cod AS cat_sys_cod,
    ig.inv_gru_nom AS cat_sys_nombre,
    isg.inv_sub_gru_cod AS subcat_sys_cod,
    isg.inv_sub_gru_nom AS subcat_sys_nombre
FROM dbo.articulos a
JOIN dbo.inventario_subgrupo isg ON a.inv_sub_gru_cod = isg.inv_sub_gru_cod
JOIN dbo.inventario_grupo ig ON isg.inv_gru_cod = ig.inv_gru_cod
WHERE a.art_cod = 'E69707445';  -- El SKU del artículo

-- 3. Verificar en ArticuloHook
SELECT
    '3. ESTADO EN ARTICULOHOOK' AS Sección,
    ArtHookCod AS SKU,
    ArtHooName AS Nombre,
    ArtHookCatSysCod AS [Cód Cat Sys],
    ArtHookCatSysNombre AS [Cat Sistema],
    ArtHookSubcatSysCod AS [Cód Subcat Sys],
    ArtHookSubcatSysNombre AS [Subcat Sistema],
    ArtHookCatWooId AS [ID Cat Woo],
    ArtHookCatWooNombre AS [Cat WooCommerce],
    ArtHookSubcatWooId AS [ID Subcat Woo],
    ArtHookSubcatWooNombre AS [Subcat WooCommerce],
    ArtHookCategoriaMatch AS [Match],
    ArtHookCatFechaVerificacion AS [Fecha Verificación],
    ArtHookFchMod AS [Fecha Modificación]
FROM ArticuloHook
WHERE ArtHookCod = 'E69707445';

-- 4. Verificar si el registro existe en ArticuloHook
SELECT
    '4. ¿EXISTE EN ARTICULOHOOK?' AS Sección,
    CASE
        WHEN EXISTS (SELECT 1 FROM ArticuloHook WHERE ArtHookCod = 'E69707445')
        THEN '✅ SÍ existe'
        ELSE '❌ NO existe'
    END AS Resultado;

-- 5. Ver última actualización del producto
SELECT
    '5. ÚLTIMA ACTUALIZACIÓN' AS Sección,
    ArtHookCod AS SKU,
    ArtHookFchMod AS [Última Modificación],
    ArtHookCatFechaVerificacion AS [Última Verificación Categorías],
    ArtHookActualizado AS [Flag Actualizado],
    DATEDIFF(MINUTE, ArtHookFchMod, GETDATE()) AS [Minutos desde última actualización]
FROM ArticuloHook
WHERE ArtHookCod = 'E69707445';

-- 6. Verificar si la sincronización llegó hasta este producto
SELECT
    '6. PRODUCTOS SINCRONIZADOS DESPUÉS' AS Sección,
    COUNT(*) AS [Total productos con fecha verificación mayor]
FROM ArticuloHook
WHERE ArtHookCatFechaVerificacion > (
    SELECT ISNULL(ArtHookCatFechaVerificacion, '1900-01-01')
    FROM ArticuloHook
    WHERE ArtHookCod = 'E69707445'
);
