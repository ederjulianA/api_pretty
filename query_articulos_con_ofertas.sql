-- Query para obtener artículos con ofertas - Versión para SQL Server
-- Parámetros de ejemplo (ajusta según tus necesidades)
DECLARE @codigo NVARCHAR(50) = NULL;           -- NULL para todos, o 'ABC' para filtrar por código
DECLARE @nombre NVARCHAR(200) = NULL;          -- NULL para todos, o 'Producto' para filtrar por nombre
DECLARE @inv_gru_cod INT = NULL;               -- NULL para todos, o 1 para filtrar por grupo
DECLARE @inv_sub_gru_cod INT = NULL;           -- NULL para todos, o 1 para filtrar por subgrupo
DECLARE @tieneExistencia BIT = NULL;           -- NULL para todos, 1 para con existencia, 0 para sin existencia
DECLARE @PageNumber INT = 1;                   -- Número de página (empezando en 1)
DECLARE @PageSize INT = 50;                    -- Tamaño de página

WITH ArticulosBase AS (
    SELECT
        a.art_sec,
        a.art_cod,
        a.art_woo_id,
        a.art_nom,
        a.art_url_img_servi,
        ig.inv_gru_cod,
        ig.inv_gru_nom AS categoria,
        isg.inv_sub_gru_cod,
        isg.inv_sub_gru_nom AS sub_categoria,
        -- Precios originales
        ISNULL(ad1.art_bod_pre, 0) AS precio_detal_original,
        ISNULL(ad2.art_bod_pre, 0) AS precio_mayor_original,
        -- Precios con oferta aplicada (usando la promoción más prioritaria)
        CASE 
            WHEN oferta_prioritaria.pro_det_precio_oferta IS NOT NULL AND oferta_prioritaria.pro_det_precio_oferta > 0 
            THEN oferta_prioritaria.pro_det_precio_oferta 
            WHEN oferta_prioritaria.pro_det_descuento_porcentaje IS NOT NULL AND oferta_prioritaria.pro_det_descuento_porcentaje > 0 
            THEN ISNULL(ad1.art_bod_pre, 0) * (1 - (oferta_prioritaria.pro_det_descuento_porcentaje / 100))
            ELSE ISNULL(ad1.art_bod_pre, 0) 
        END AS precio_detal,
        CASE 
            WHEN oferta_prioritaria.pro_det_precio_oferta IS NOT NULL AND oferta_prioritaria.pro_det_precio_oferta > 0 
            THEN oferta_prioritaria.pro_det_precio_oferta 
            WHEN oferta_prioritaria.pro_det_descuento_porcentaje IS NOT NULL AND oferta_prioritaria.pro_det_descuento_porcentaje > 0 
            THEN ISNULL(ad2.art_bod_pre, 0) * (1 - (oferta_prioritaria.pro_det_descuento_porcentaje / 100))
            ELSE ISNULL(ad2.art_bod_pre, 0) 
        END AS precio_mayor,
        -- Información de oferta (de la promoción más prioritaria)
        oferta_prioritaria.pro_det_precio_oferta AS precio_oferta,
        oferta_prioritaria.pro_det_descuento_porcentaje AS descuento_porcentaje,
        oferta_prioritaria.pro_fecha_inicio,
        oferta_prioritaria.pro_fecha_fin,
        oferta_prioritaria.pro_codigo AS codigo_promocion,
        oferta_prioritaria.pro_descripcion AS descripcion_promocion,
        CASE 
            WHEN oferta_prioritaria.pro_sec IS NOT NULL 
                 AND ((oferta_prioritaria.pro_det_precio_oferta IS NOT NULL AND oferta_prioritaria.pro_det_precio_oferta > 0) 
                      OR (oferta_prioritaria.pro_det_descuento_porcentaje IS NOT NULL AND oferta_prioritaria.pro_det_descuento_porcentaje > 0))
            THEN 'S' 
            ELSE 'N' 
        END AS tiene_oferta,
        ISNULL(e.existencia, 0) AS existencia,
        a.art_woo_sync_status,
        a.art_woo_sync_message
    FROM dbo.articulos a
        INNER JOIN dbo.inventario_subgrupo isg
            ON a.inv_sub_gru_cod = isg.inv_sub_gru_cod
        INNER JOIN dbo.inventario_grupo ig
            ON isg.inv_gru_cod = ig.inv_gru_cod
        LEFT JOIN dbo.articulosdetalle ad1
            ON a.art_sec = ad1.art_sec AND ad1.lis_pre_cod = 1
        LEFT JOIN dbo.articulosdetalle ad2
            ON a.art_sec = ad2.art_sec AND ad2.lis_pre_cod = 2
        LEFT JOIN dbo.vwExistencias e
            ON a.art_sec = e.art_sec
        -- Subquery para obtener la promoción más prioritaria por artículo
        LEFT JOIN (
            SELECT 
                pd.art_sec,
                pd.pro_det_precio_oferta,
                pd.pro_det_descuento_porcentaje,
                p.pro_sec,
                p.pro_fecha_inicio,
                p.pro_fecha_fin,
                p.pro_codigo,
                p.pro_descripcion,
                ROW_NUMBER() OVER (
                    PARTITION BY pd.art_sec 
                    ORDER BY 
                        -- Prioridad 1: Precio de oferta (más alto primero)
                        ISNULL(pd.pro_det_precio_oferta, 0) DESC,
                        -- Prioridad 2: Descuento porcentual (más alto primero)
                        ISNULL(pd.pro_det_descuento_porcentaje, 0) DESC,
                        -- Prioridad 3: Fecha de inicio (más reciente primero)
                        p.pro_fecha_inicio DESC
                ) as rn
            FROM dbo.promociones_detalle pd
            INNER JOIN dbo.promociones p
                ON pd.pro_sec = p.pro_sec 
                AND p.pro_activa = 'S'
                AND GETDATE() BETWEEN p.pro_fecha_inicio AND p.pro_fecha_fin
            WHERE pd.pro_det_estado = 'A'
        ) oferta_prioritaria
            ON a.art_sec = oferta_prioritaria.art_sec 
            AND oferta_prioritaria.rn = 1
    WHERE 1 = 1
      AND (@codigo IS NULL OR a.art_cod LIKE @codigo+'%')
      AND (@nombre IS NULL OR a.art_nom LIKE '%' + @nombre + '%')
      AND (@inv_gru_cod IS NULL OR ig.inv_gru_cod = @inv_gru_cod)
      AND (@inv_sub_gru_cod IS NULL OR isg.inv_sub_gru_cod = @inv_sub_gru_cod)
      AND (
             @tieneExistencia IS NULL 
             OR (@tieneExistencia = 1 AND ISNULL(e.existencia, 0) > 0)
             OR (@tieneExistencia = 0 AND ISNULL(e.existencia, 0) = 0)
          )
)
SELECT *
FROM ArticulosBase
ORDER BY art_nom
OFFSET (@PageNumber - 1) * @PageSize ROWS
FETCH NEXT @PageSize ROWS ONLY
OPTION (RECOMPILE);

-- Para ver el total de registros sin paginación, ejecuta esto por separado:
/*
SELECT COUNT(*) as TotalArticulos
FROM dbo.articulos a
    INNER JOIN dbo.inventario_subgrupo isg
        ON a.inv_sub_gru_cod = isg.inv_sub_gru_cod
    INNER JOIN dbo.inventario_grupo ig
        ON isg.inv_gru_cod = ig.inv_gru_cod
    LEFT JOIN dbo.vwExistencias e
        ON a.art_sec = e.art_sec
WHERE 1 = 1
  AND (@codigo IS NULL OR a.art_cod LIKE @codigo+'%')
  AND (@nombre IS NULL OR a.art_nom LIKE '%' + @nombre + '%')
  AND (@inv_gru_cod IS NULL OR ig.inv_gru_cod = @inv_gru_cod)
  AND (@inv_sub_gru_cod IS NULL OR isg.inv_sub_gru_cod = @inv_sub_gru_cod)
  AND (
         @tieneExistencia IS NULL 
         OR (@tieneExistencia = 1 AND ISNULL(e.existencia, 0) > 0)
         OR (@tieneExistencia = 0 AND ISNULL(e.existencia, 0) = 0)
      );
*/ 