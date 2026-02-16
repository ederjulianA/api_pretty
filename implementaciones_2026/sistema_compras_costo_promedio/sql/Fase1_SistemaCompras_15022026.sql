/**
 * FASE 1: Sistema de Compras con Costo Promedio Ponderado
 * Fecha: 2026-02-15
 * Descripción: Scripts SQL para preparar el sistema de compras
 *              SIN Stored Procedures (lógica en JavaScript)
 *              Database-agnostic para facilitar migración futura
 */

-- =============================================
-- IMPORTANTE: Este script usa SQL estándar
-- para facilitar migración a PostgreSQL
-- =============================================

PRINT '=========================================';
PRINT 'Iniciando script de Fase 1';
PRINT 'Sistema de Compras (Database-Agnostic)';
PRINT '=========================================';

-- =============================================
-- 1. TIPO DE COMPROBANTE PARA COMPRAS
-- =============================================

PRINT '';
PRINT '--- Creando Tipo de Comprobante COM ---';

-- Verificar si ya existe
IF NOT EXISTS (SELECT 1 FROM dbo.tipo_comprobantes WHERE tip_cod = 'COM')
BEGIN
    PRINT 'Insertando tipo de comprobante COM (Compra)';

    INSERT INTO dbo.tipo_comprobantes (
        tip_cod,
        tip_nom,
        tip_lon,
        tip_cli,
        tip_est,
        fue_cod,
        tip_con_sec
    ) VALUES (
        'COM',                    -- Código del comprobante
        'Compra de Mercancía',    -- Nombre descriptivo
        6,                        -- Longitud del consecutivo (COM000001)
        0,                        -- No aplica para clientes
        'A',                      -- Estado: Activo
        1,                        -- Fuente (ajustar según tu sistema)
        0                         -- Consecutivo inicial
    );

    PRINT '✓ Tipo de comprobante COM creado exitosamente';
END
ELSE
BEGIN
    PRINT '⚠ Tipo de comprobante COM ya existe, omitiendo creación';
END;

-- =============================================
-- 2. VISTA: Costo Promedio Actual de Artículos
-- =============================================

PRINT '';
PRINT '--- Creando Vista vwCostoPromedioArticulos ---';

IF EXISTS (SELECT 1 FROM sys.views WHERE name = 'vwCostoPromedioArticulos')
BEGIN
    PRINT 'Eliminando vista existente';
    DROP VIEW dbo.vwCostoPromedioArticulos;
END;

PRINT 'Creando vista vwCostoPromedioArticulos';

EXEC('
CREATE VIEW dbo.vwCostoPromedioArticulos AS
SELECT
    a.art_sec,
    a.art_cod,
    a.art_nom,
    ISNULL(ad.art_bod_cos_cat, 0) AS costo_promedio,
    ISNULL(ve.existencia, 0) AS existencia,
    ISNULL(ad.art_bod_cos_cat, 0) * ISNULL(ve.existencia, 0) AS valor_inventario,
    ISNULL(ad_detal.art_bod_pre, 0) AS precio_venta_detal,
    ISNULL(ad_mayor.art_bod_pre, 0) AS precio_venta_mayor,
    -- Calcular márgenes
    CASE
        WHEN ISNULL(ad_detal.art_bod_pre, 0) > 0
        THEN ((ad_detal.art_bod_pre - ISNULL(ad.art_bod_cos_cat, 0)) / ad_detal.art_bod_pre * 100)
        ELSE 0
    END AS margen_detal,
    CASE
        WHEN ISNULL(ad_mayor.art_bod_pre, 0) > 0
        THEN ((ad_mayor.art_bod_pre - ISNULL(ad.art_bod_cos_cat, 0)) / ad_mayor.art_bod_pre * 100)
        ELSE 0
    END AS margen_mayor
FROM dbo.articulos a
LEFT JOIN dbo.articulosdetalle ad ON ad.art_sec = a.art_sec
    AND ad.bod_sec = ''1'' AND ad.lis_pre_cod = 1
LEFT JOIN dbo.articulosdetalle ad_detal ON ad_detal.art_sec = a.art_sec
    AND ad_detal.bod_sec = ''1'' AND ad_detal.lis_pre_cod = 1
LEFT JOIN dbo.articulosdetalle ad_mayor ON ad_mayor.art_sec = a.art_sec
    AND ad_mayor.bod_sec = ''1'' AND ad_mayor.lis_pre_cod = 2
LEFT JOIN dbo.vwExistencias ve ON ve.art_sec = a.art_sec
');

PRINT '✓ Vista vwCostoPromedioArticulos creada exitosamente';

-- =============================================
-- 3. ÍNDICES PARA OPTIMIZACIÓN
-- =============================================

PRINT '';
PRINT '--- Creando Índices de Optimización ---';

-- Índice para facturakardes por artículo y naturaleza
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_facturakardes_art_nat' AND object_id = OBJECT_ID('dbo.facturakardes'))
BEGIN
    PRINT 'Creando índice IX_facturakardes_art_nat';
    CREATE INDEX IX_facturakardes_art_nat
    ON dbo.facturakardes(art_sec, kar_nat);
    PRINT '✓ Índice IX_facturakardes_art_nat creado';
END
ELSE
BEGIN
    PRINT '⚠ Índice IX_facturakardes_art_nat ya existe';
END;

-- Índice para factura por tipo y fecha
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_factura_tip_fecha' AND object_id = OBJECT_ID('dbo.factura'))
BEGIN
    PRINT 'Creando índice IX_factura_tip_fecha';
    CREATE INDEX IX_factura_tip_fecha
    ON dbo.factura(fac_tip_cod, fac_fec DESC);
    PRINT '✓ Índice IX_factura_tip_fecha creado';
END
ELSE
BEGIN
    PRINT '⚠ Índice IX_factura_tip_fecha ya existe';
END;

-- Índice para historial_costos por artículo y fecha
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_historial_costos_art_fecha' AND object_id = OBJECT_ID('dbo.historial_costos'))
BEGIN
    PRINT 'Creando índice IX_historial_costos_art_fecha';
    CREATE INDEX IX_historial_costos_art_fecha
    ON dbo.historial_costos(hc_art_sec, hc_fecha DESC);
    PRINT '✓ Índice IX_historial_costos_art_fecha creado';
END
ELSE
BEGIN
    PRINT '⚠ Índice IX_historial_costos_art_fecha ya existe';
END;

-- =============================================
-- 4. VALIDACIÓN FINAL
-- =============================================

PRINT '';
PRINT '--- Validación Final ---';

-- Validar tipo de comprobante
IF EXISTS (SELECT 1 FROM dbo.tipo_comprobantes WHERE tip_cod = 'COM')
BEGIN
    PRINT '✓ Tipo de comprobante COM: OK';
END
ELSE
BEGIN
    PRINT '✗ ERROR: Tipo de comprobante COM no existe';
END;

-- Validar vista
IF EXISTS (SELECT 1 FROM sys.views WHERE name = 'vwCostoPromedioArticulos')
BEGIN
    PRINT '✓ Vista vwCostoPromedioArticulos: OK';
END
ELSE
BEGIN
    PRINT '✗ ERROR: Vista vwCostoPromedioArticulos no existe';
END;

-- Validar tabla historial_costos (debe existir de Fase 0)
IF EXISTS (SELECT 1 FROM sys.tables WHERE name = 'historial_costos')
BEGIN
    PRINT '✓ Tabla historial_costos: OK';
END
ELSE
BEGIN
    PRINT '✗ ERROR: Tabla historial_costos no existe (ejecutar Fase 0 primero)';
END;

-- =============================================
-- RESUMEN
-- =============================================

PRINT '';
PRINT '=========================================';
PRINT 'Script de Fase 1 completado';
PRINT '=========================================';
PRINT '';
PRINT 'Componentes creados:';
PRINT '✓ Tipo de comprobante COM';
PRINT '✓ Vista vwCostoPromedioArticulos';
PRINT '✓ Índices de optimización';
PRINT '';
PRINT 'NOTA IMPORTANTE:';
PRINT 'Este script NO usa Stored Procedures.';
PRINT 'Toda la lógica de negocio está en JavaScript.';
PRINT 'Esto facilita migración futura a PostgreSQL.';
PRINT '';
PRINT 'Siguiente paso:';
PRINT 'Ejecutar backend con npm start y probar endpoints de compras.';
PRINT '=========================================';
