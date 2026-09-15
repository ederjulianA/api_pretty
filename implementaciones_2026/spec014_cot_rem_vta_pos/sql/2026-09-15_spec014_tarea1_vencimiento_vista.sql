/* =====================================================================
   SPEC-014 — Tarea 1: vencimiento en la cabecera y naturaleza 'R' en la vista de ventas
   Idempotente. Fecha: 2026-09-15
   ⚠ Ejecutar primero en PSDATA_PRUEBAS. En producción, con backup previo
     (backup-y-restaurar-bd.js) y CONFIRMO_PRODUCCION=si.

   1. dbo.factura.fac_vence_el (DATETIME2(0) NULL): vencimiento de toda REM sin VTA activa
      (antes solo existía en woo_pedidos.vence_el para las REM de Woo). NULL = sin vencimiento.
      Se copia el valor actual de woo_pedidos para las REM activas.
   2. dbo.vw_ventas_dashboard: las líneas de venta son kar_nat IN ('-','R'). 'R' = línea de
      una VTA que nace de una REM (la REM ya descontó kardex; la VTA no repite). Regla: "es venta"
      = fac_tip_cod='VTA' AND fac_est_fac='A'; nunca por naturaleza sola (spec §5.8).
   Compatible con el código anterior: hoy no existe ninguna línea 'R'.
   ===================================================================== */
SET NOCOUNT ON;
SET XACT_ABORT ON;

IF COL_LENGTH('dbo.factura', 'fac_vence_el') IS NULL
    ALTER TABLE dbo.factura ADD fac_vence_el DATETIME2(0) NULL;

-- La columna recién creada no se puede referenciar en el mismo lote: SQL dinámico.
EXEC('
UPDATE f
SET f.fac_vence_el = p.vence_el
FROM dbo.factura f
INNER JOIN dbo.woo_pedidos p ON p.fac_nro_rem = f.fac_nro
WHERE f.fac_tip_cod = ''REM'' AND f.fac_est_fac = ''A''
  AND f.fac_vence_el IS NULL AND p.vence_el IS NOT NULL AND p.estado_erp = ''REM_ACTIVA''
');

-- ALTER VIEW debe ser la única sentencia de su lote: SQL dinámico.
EXEC('

ALTER VIEW dbo.vw_ventas_dashboard AS
SELECT
    -- ==========================================
    -- IDENTIFICADORES DE FACTURA
    -- ==========================================
    f.fac_sec,
    f.fac_nro,
    f.fac_fec AS fecha_factura,
    CAST(f.fac_fec AS DATE) AS fecha_venta,

    -- ==========================================
    -- SEGMENTACIÓN TEMPORAL
    -- ==========================================
    DATEPART(YEAR, f.fac_fec) AS anio,
    DATEPART(MONTH, f.fac_fec) AS mes,
    DATEPART(WEEK, f.fac_fec) AS semana,
    DATEPART(WEEKDAY, f.fac_fec) AS dia_semana,
    DATEPART(HOUR, f.fac_fec) AS hora,

    -- ==========================================
    -- CANAL DE VENTA
    -- ==========================================
    CASE
        WHEN f.fac_nro_woo IS NOT NULL THEN ''WooCommerce''
        ELSE ''Local''
    END AS canal_venta,

    -- ==========================================
    -- INFORMACIÓN DEL CLIENTE
    -- ==========================================
    f.nit_sec,
    n.nit_nom AS cliente_nombre,
    n.nit_email AS cliente_email,
    n.nit_tel AS cliente_telefono,
    n.nit_ciudad AS cliente_ciudad,

    -- ==========================================
    -- ESTADOS DE LA ORDEN
    -- ==========================================
    f.fac_est_fac AS estado_interno,
    f.fac_est_woo AS estado_woo,
    f.fac_nro_woo AS numero_orden_woo,
    f.fac_nro_origen,

    -- ==========================================
    -- DETALLES DE PRODUCTOS (desde kardex)
    -- ==========================================
    fk.kar_sec AS linea_numero,
    fk.art_sec,
    a.art_cod,
    a.art_nom,
    fk.kar_uni AS cantidad_vendida,
    fk.kar_pre_pub AS precio_unitario,
    fk.kar_total AS total_linea,
    fk.kar_lis_pre_cod AS lista_precios,

    -- ==========================================
    -- COSTOS Y RENTABILIDAD REAL
    -- ==========================================
    -- Usar kar_cos (costo histórico) en lugar de art_bod_cos_cat
    fk.kar_cos AS costo_historico_unitario,
    (fk.kar_uni * ISNULL(fk.kar_cos, 0)) AS costo_total_linea,
    (fk.kar_total - (fk.kar_uni * ISNULL(fk.kar_cos, 0))) AS utilidad_linea,

    -- Rentabilidad REAL calculada sobre precio final
    CASE
        WHEN fk.kar_total > 0
        THEN ((fk.kar_total - (fk.kar_uni * ISNULL(fk.kar_cos, 0))) / fk.kar_total * 100)
        ELSE 0
    END AS rentabilidad_real,

    -- Margen REAL calculado sobre precio final
    CASE
        WHEN fk.kar_total > 0 AND fk.kar_cos > 0
        THEN ((fk.kar_total - (fk.kar_uni * ISNULL(fk.kar_cos, 0))) / (fk.kar_uni * ISNULL(fk.kar_cos, 0)) * 100)
        ELSE 0
    END AS margen_real,

    -- Columnas calculadas de rentabilidad TEÓRICA (de articulosdetalle)
    -- Se mantienen para comparación
    ad.rentabilidad AS rentabilidad_teorica,
    ad.margen_ganancia AS margen_teorico,
    ad.utilidad_bruta AS utilidad_teorica,
    ad.clasificacion_rentabilidad,

    -- ==========================================
    -- CATEGORÍAS
    -- ==========================================
    ig.inv_gru_cod,
    ig.inv_gru_nom AS categoria,
    isg.inv_sub_gru_cod,
    isg.inv_sub_gru_nom AS subcategoria,

    -- ==========================================
    -- INFORMACIÓN ADICIONAL DE PRODUCTO
    -- ==========================================
    a.art_woo_type AS tipo_producto_woo,
    ISNULL(a.art_bundle, ''N'') AS es_bundle,

    -- ==========================================
    -- INFORMACIÓN DE BUNDLES (NUEVO)
    -- ==========================================
    fk.kar_bundle_padre AS bundle_padre_art_sec

FROM dbo.factura f
    LEFT JOIN dbo.nit n
        ON f.nit_sec = n.nit_sec
    LEFT JOIN dbo.facturakardes fk
        ON f.fac_sec = fk.fac_sec
    LEFT JOIN dbo.articulos a
        ON fk.art_sec = a.art_sec
    LEFT JOIN dbo.articulosdetalle ad
        ON a.art_sec = ad.art_sec
        AND ad.lis_pre_cod = 1  -- Precio al detal
        AND ad.bod_sec = ''1''    -- Bodega principal
    LEFT JOIN dbo.inventario_subgrupo isg
        ON a.inv_sub_gru_cod = isg.inv_sub_gru_cod
    LEFT JOIN dbo.inventario_grupo ig
        ON isg.inv_gru_cod = ig.inv_gru_cod

WHERE
    -- Solo facturas activas
    f.fac_est_fac = ''A''
    -- Líneas de venta: ''-'' (descuenta kardex) y ''R'' (respaldada por una remisión que ya descontó) — SPEC-014
    AND fk.kar_nat IN (''-'', ''R'')
    -- Solo facturas de venta (excluir ajustes, devoluciones, etc.)
    AND f.fac_tip_cod = ''VTA''
    -- ✅ NUEVO: Excluir componentes de bundles
    -- Solo mostrar bundles padres y productos simples
    AND (fk.kar_bundle_padre IS NULL OR fk.kar_bundle_padre = '''')
');

-- Verificación (la columna nueva solo se puede leer por SQL dinámico en este mismo lote).
DECLARE @con_venc INT = 0;
EXEC sp_executesql
  N'SELECT @c = COUNT(*) FROM dbo.factura WHERE fac_tip_cod = ''REM'' AND fac_est_fac = ''A'' AND fac_vence_el IS NOT NULL',
  N'@c INT OUTPUT', @c = @con_venc OUTPUT;

SELECT 'factura.fac_vence_el' AS objeto, CASE WHEN COL_LENGTH('dbo.factura','fac_vence_el') IS NULL THEN 0 ELSE 1 END AS ok
UNION ALL SELECT 'vw_ventas_dashboard IN (-,R)', CASE WHEN OBJECT_DEFINITION(OBJECT_ID('dbo.vw_ventas_dashboard')) LIKE '%kar_nat IN (''-'', ''R'')%' THEN 1 ELSE 0 END
UNION ALL SELECT 'REM activas con vencimiento', @con_venc;
