/*
 * Script: Diagnóstico de Rentabilidad Negativa
 * Fecha: 2026-02-17
 * Descripción: Analiza en detalle productos con rentabilidad negativa
 *              para identificar la causa raíz del problema
 *
 * Casos a investigar:
 * - art_cod 1892: Bronceador Líquido D'Luchi (-41.7%)
 * - art_cod 1894: SHAMPOO CANABIS ROMERO (-36.7%)
 */

USE SyscomElRedentor; -- ⚠️ CAMBIAR AL NOMBRE DE TU BASE DE DATOS
GO

SET NOCOUNT ON;

-- ============================================
-- PARÁMETROS: Códigos de artículos a analizar
-- ============================================
DECLARE @art_cod_1 VARCHAR(30) = '1892';
DECLARE @art_cod_2 VARCHAR(30) = '1894';

PRINT '====================================';
PRINT 'DIAGNÓSTICO DE RENTABILIDAD NEGATIVA';
PRINT '====================================';
PRINT '';

-- ============================================
-- 1. INFORMACIÓN BÁSICA DEL PRODUCTO
-- ============================================
PRINT '1. INFORMACIÓN BÁSICA DEL PRODUCTO';
PRINT '====================================';
PRINT '';

SELECT
    a.art_cod,
    a.art_sec,
    a.art_nom,
    ad.lis_pre_cod,
    CASE ad.lis_pre_cod
        WHEN 1 THEN 'DETAL'
        WHEN 2 THEN 'MAYOR'
        ELSE 'OTRO'
    END AS tipo_precio,
    ad.art_bod_pre AS precio_lista,
    ad.art_bod_cos_cat AS costo_actual,
    CASE
        WHEN ad.art_bod_pre > 0
        THEN ((ad.art_bod_pre - ad.art_bod_cos_cat) / ad.art_bod_pre * 100)
        ELSE 0
    END AS rentabilidad_teorica
FROM dbo.articulos a
LEFT JOIN dbo.articulosdetalle ad ON a.art_sec = ad.art_sec AND ad.bod_sec = '1'
WHERE a.art_cod IN (@art_cod_1, @art_cod_2)
ORDER BY a.art_cod, ad.lis_pre_cod;

-- ============================================
-- 2. VENTAS REALES DEL PRODUCTO
-- ============================================
PRINT '';
PRINT '2. DETALLE DE VENTAS (Últimas 10 transacciones)';
PRINT '====================================';
PRINT '';

SELECT TOP 20
    f.fac_nro,
    f.fac_fec,
    a.art_cod,
    a.art_nom,
    fk.kar_uni AS cantidad,
    fk.kar_pre_pub AS precio_unitario,
    fk.kar_total AS total_linea,
    fk.kar_cos AS costo_historico_unitario,
    (fk.kar_uni * fk.kar_cos) AS costo_total_linea,
    (fk.kar_total - (fk.kar_uni * fk.kar_cos)) AS utilidad_linea,
    CASE
        WHEN fk.kar_total > 0
        THEN ((fk.kar_total - (fk.kar_uni * fk.kar_cos)) / fk.kar_total * 100)
        ELSE 0
    END AS rentabilidad_real,
    f.fac_tip_cod,
    CASE
        WHEN f.fac_nro_woo IS NOT NULL THEN 'WooCommerce'
        ELSE 'Local'
    END AS canal
FROM dbo.facturakardes fk
INNER JOIN dbo.factura f ON fk.fac_sec = f.fac_sec
INNER JOIN dbo.articulos a ON fk.art_sec = a.art_sec
WHERE a.art_cod IN (@art_cod_1, @art_cod_2)
  AND fk.kar_nat = '-'
  AND f.fac_tip_cod = 'VTA'
ORDER BY f.fac_fec DESC, a.art_cod;

-- ============================================
-- 3. COMPARACIÓN: PRECIO vs COSTO
-- ============================================
PRINT '';
PRINT '3. ANÁLISIS PRECIO vs COSTO';
PRINT '====================================';
PRINT '';

SELECT
    a.art_cod,
    a.art_nom,
    COUNT(*) AS total_ventas,
    MIN(fk.kar_pre_pub) AS precio_min_vendido,
    AVG(fk.kar_pre_pub) AS precio_promedio_vendido,
    MAX(fk.kar_pre_pub) AS precio_max_vendido,
    MIN(fk.kar_cos) AS costo_min,
    AVG(fk.kar_cos) AS costo_promedio,
    MAX(fk.kar_cos) AS costo_max,
    ad.art_bod_pre AS precio_lista_detal,
    ad.art_bod_cos_cat AS costo_actual,
    -- Problema identificado
    CASE
        WHEN AVG(fk.kar_pre_pub) < AVG(fk.kar_cos) THEN '❌ PRECIO MENOR QUE COSTO'
        WHEN AVG(fk.kar_pre_pub) = AVG(fk.kar_cos) THEN '⚠️  PRECIO IGUAL AL COSTO'
        ELSE '✅ PRECIO MAYOR QUE COSTO'
    END AS diagnostico
FROM dbo.facturakardes fk
INNER JOIN dbo.factura f ON fk.fac_sec = f.fac_sec
INNER JOIN dbo.articulos a ON fk.art_sec = a.art_sec
LEFT JOIN dbo.articulosdetalle ad ON a.art_sec = ad.art_sec
    AND ad.lis_pre_cod = 1
    AND ad.bod_sec = '1'
WHERE a.art_cod IN (@art_cod_1, @art_cod_2)
  AND fk.kar_nat = '-'
  AND f.fac_tip_cod = 'VTA'
GROUP BY a.art_cod, a.art_nom, ad.art_bod_pre, ad.art_bod_cos_cat
ORDER BY a.art_cod;

-- ============================================
-- 4. VERIFICAR PROMOCIONES/DESCUENTOS
-- ============================================
PRINT '';
PRINT '4. PROMOCIONES Y DESCUENTOS APLICADOS';
PRINT '====================================';
PRINT '';

-- Verificar si hay promociones activas
SELECT
    a.art_cod,
    a.art_nom,
    p.pro_descripcion AS promocion,
    pd.pro_det_precio_oferta AS precio_oferta,
    p.pro_fecha_inicio AS fecha_inicio,
    p.pro_fecha_fin AS fecha_fin,
    ad.art_bod_pre AS precio_lista_normal,
    ad.art_bod_cos_cat AS costo_actual,
    (pd.pro_det_precio_oferta - ad.art_bod_cos_cat) AS utilidad_con_oferta,
    CASE
        WHEN pd.pro_det_precio_oferta > 0
        THEN ((pd.pro_det_precio_oferta - ad.art_bod_cos_cat) / pd.pro_det_precio_oferta * 100)
        ELSE 0
    END AS rentabilidad_con_oferta
FROM dbo.articulos a
INNER JOIN dbo.promociones_detalle pd ON a.art_sec = pd.art_sec
INNER JOIN dbo.promociones p ON pd.pro_sec = p.pro_sec
LEFT JOIN dbo.articulosdetalle ad ON a.art_sec = ad.art_sec
    AND ad.lis_pre_cod = 1
    AND ad.bod_sec = '1'
WHERE a.art_cod IN (@art_cod_1, @art_cod_2)
  AND pro_det_estado = 'A'
ORDER BY a.art_cod, p.pro_fecha_inicio DESC;

-- Verificar eventos promocionales
SELECT
    a.art_cod,
    a.art_nom,
    ep.eve_nombre AS evento,
    ep.eve_descuento_detal AS descuento_detal,
    ep.eve_descuento_mayor AS descuento_mayor,
    ep.eve_fecha_inicio AS fecha_inicio,
    ep.eve_fecha_fin AS fecha_fin,
    ad.art_bod_pre AS precio_lista_detal,
    (ad.art_bod_pre * (1 - ep.eve_descuento_detal / 100.0)) AS precio_con_descuento,
    ad.art_bod_cos_cat AS costo_actual,
    CASE
        WHEN (ad.art_bod_pre * (1 - ep.eve_descuento_detal / 100.0)) > 0
        THEN (((ad.art_bod_pre * (1 - ep.eve_descuento_detal / 100.0)) - ad.art_bod_cos_cat) / (ad.art_bod_pre * (1 - ep.eve_descuento_detal / 100.0)) * 100)
        ELSE 0
    END AS rentabilidad_con_descuento
FROM dbo.articulos a
CROSS JOIN dbo.eventos_promocionales ep
LEFT JOIN dbo.articulosdetalle ad ON a.art_sec = ad.art_sec
    AND ad.lis_pre_cod = 1
    AND ad.bod_sec = '1'
WHERE a.art_cod IN (@art_cod_1, @art_cod_2)
  AND ep.eve_activo = 'S'
  AND GETDATE() BETWEEN ep.eve_fecha_inicio AND ep.eve_fecha_fin
ORDER BY a.art_cod;

-- ============================================
-- 5. HISTORIAL DE CAMBIOS DE COSTO
-- ============================================
PRINT '';
PRINT '5. HISTORIAL DE COSTOS EN VENTAS';
PRINT '====================================';
PRINT '';
PRINT 'Ver cómo ha variado el costo en las ventas:';
PRINT '';

SELECT
    a.art_cod,
    a.art_nom,
    CONVERT(DATE, f.fac_fec) AS fecha,
    COUNT(*) AS ventas_ese_dia,
    AVG(fk.kar_pre_pub) AS precio_promedio,
    AVG(fk.kar_cos) AS costo_promedio,
    AVG(fk.kar_total - (fk.kar_uni * fk.kar_cos)) AS utilidad_promedio,
    AVG(
        CASE
            WHEN fk.kar_total > 0
            THEN ((fk.kar_total - (fk.kar_uni * fk.kar_cos)) / fk.kar_total * 100)
            ELSE 0
        END
    ) AS rentabilidad_promedio
FROM dbo.facturakardes fk
INNER JOIN dbo.factura f ON fk.fac_sec = f.fac_sec
INNER JOIN dbo.articulos a ON fk.art_sec = a.art_sec
WHERE a.art_cod IN (@art_cod_1, @art_cod_2)
  AND fk.kar_nat = '-'
  AND f.fac_tip_cod = 'VTA'
GROUP BY a.art_cod, a.art_nom, CONVERT(DATE, f.fac_fec)
ORDER BY a.art_cod, fecha DESC;

-- ============================================
-- 6. RESUMEN Y DIAGNÓSTICO FINAL
-- ============================================
PRINT '';
PRINT '====================================';
PRINT 'DIAGNÓSTICO FINAL';
PRINT '====================================';
PRINT '';

DECLARE @diagnostico_1 VARCHAR(500);
DECLARE @diagnostico_2 VARCHAR(500);

-- Producto 1
SELECT @diagnostico_1 =
    CASE
        WHEN AVG(fk.kar_pre_pub) < AVG(fk.kar_cos)
            THEN 'CAUSA: Se está vendiendo por DEBAJO del costo. Precio promedio: $' + CAST(CAST(AVG(fk.kar_pre_pub) AS INT) AS VARCHAR) + ', Costo promedio: $' + CAST(CAST(AVG(fk.kar_cos) AS INT) AS VARCHAR)
        WHEN AVG(fk.kar_cos) = 0
            THEN 'CAUSA: Costo histórico no capturado (kar_cos = 0)'
        WHEN AVG(fk.kar_pre_pub) = AVG(fk.kar_cos)
            THEN 'CAUSA: Precio de venta igual al costo (margen = 0)'
        ELSE 'CAUSA: Desconocida - revisar datos manualmente'
    END
FROM dbo.facturakardes fk
INNER JOIN dbo.factura f ON fk.fac_sec = f.fac_sec
INNER JOIN dbo.articulos a ON fk.art_sec = a.art_sec
WHERE a.art_cod = @art_cod_1
  AND fk.kar_nat = '-'
  AND f.fac_tip_cod = 'VTA';

-- Producto 2
SELECT @diagnostico_2 =
    CASE
        WHEN AVG(fk.kar_pre_pub) < AVG(fk.kar_cos)
            THEN 'CAUSA: Se está vendiendo por DEBAJO del costo. Precio promedio: $' + CAST(CAST(AVG(fk.kar_pre_pub) AS INT) AS VARCHAR) + ', Costo promedio: $' + CAST(CAST(AVG(fk.kar_cos) AS INT) AS VARCHAR)
        WHEN AVG(fk.kar_cos) = 0
            THEN 'CAUSA: Costo histórico no capturado (kar_cos = 0)'
        WHEN AVG(fk.kar_pre_pub) = AVG(fk.kar_cos)
            THEN 'CAUSA: Precio de venta igual al costo (margen = 0)'
        ELSE 'CAUSA: Desconocida - revisar datos manualmente'
    END
FROM dbo.facturakardes fk
INNER JOIN dbo.factura f ON fk.fac_sec = f.fac_sec
INNER JOIN dbo.articulos a ON fk.art_sec = a.art_sec
WHERE a.art_cod = @art_cod_2
  AND fk.kar_nat = '-'
  AND f.fac_tip_cod = 'VTA';

PRINT 'Producto ' + @art_cod_1 + ':';
PRINT @diagnostico_1;
PRINT '';
PRINT 'Producto ' + @art_cod_2 + ':';
PRINT @diagnostico_2;
PRINT '';
PRINT '====================================';
PRINT 'POSIBLES SOLUCIONES:';
PRINT '====================================';
PRINT '';
PRINT '1. Si el costo es incorrecto:';
PRINT '   - Actualizar art_bod_cos_cat en articulosdetalle';
PRINT '   - Ejecutar script 11_actualizar_kar_cos_faltantes.sql';
PRINT '';
PRINT '2. Si hay promociones muy agresivas:';
PRINT '   - Revisar promociones activas';
PRINT '   - Ajustar precios de oferta para mantener margen';
PRINT '';
PRINT '3. Si el precio de lista es muy bajo:';
PRINT '   - Actualizar pre_val en articulosdetalle';
PRINT '   - Revisar estrategia de precios';
PRINT '';

GO
