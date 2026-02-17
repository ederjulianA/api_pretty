/*
 * Script: Corregir todas las secuencias desincronizadas
 * Fecha: 2026-02-17
 * Descripción: Sincroniza todas las secuencias con los valores máximos de sus tablas
 *
 * Tablas afectadas:
 * - FACTURA -> dbo.factura (fac_sec)
 * - ARTICULO -> dbo.articulos (art_sec)
 * - NIT -> dbo.nit (nit_sec)
 * - COMPRA -> dbo.compra (com_sec) si existe
 */

USE SyscomElRedentor; -- ⚠️ CAMBIAR AL NOMBRE DE TU BASE DE DATOS
GO

PRINT '====================================';
PRINT 'Verificando y corrigiendo secuencias';
PRINT '====================================';
PRINT '';

-- 1. FACTURA
PRINT '1. Corrigiendo secuencia FACTURA...';
DECLARE @current_factura INT;
DECLARE @max_factura INT;

SELECT @current_factura = sec_num FROM dbo.secuencia WHERE sec_cod = 'FACTURA';
SELECT @max_factura = ISNULL(MAX(CAST(fac_sec AS INT)), 0) FROM dbo.factura;

PRINT '   Actual: ' + CAST(@current_factura AS VARCHAR);
PRINT '   Máximo en tabla: ' + CAST(@max_factura AS VARCHAR);

IF @current_factura < @max_factura
BEGIN
    UPDATE dbo.secuencia
    SET sec_num = @max_factura
    WHERE sec_cod = 'FACTURA';
    PRINT '   ✅ Actualizado a: ' + CAST(@max_factura AS VARCHAR);
END
ELSE
BEGIN
    PRINT '   ✅ No requiere actualización';
END
PRINT '';

-- 2. ARTICULO
PRINT '2. Corrigiendo secuencia ARTICULO...';
DECLARE @current_articulo INT;
DECLARE @max_articulo INT;

SELECT @current_articulo = sec_num FROM dbo.secuencia WHERE sec_cod = 'ARTICULO';

-- art_sec es VARCHAR, obtener el máximo numérico
SELECT @max_articulo = ISNULL(MAX(
    CASE
        WHEN ISNUMERIC(art_sec) = 1 THEN CAST(art_sec AS INT)
        ELSE 0
    END
), 0) FROM dbo.articulos;

PRINT '   Actual: ' + CAST(@current_articulo AS VARCHAR);
PRINT '   Máximo en tabla: ' + CAST(@max_articulo AS VARCHAR);

IF @current_articulo < @max_articulo
BEGIN
    UPDATE dbo.secuencia
    SET sec_num = @max_articulo
    WHERE sec_cod = 'ARTICULO';
    PRINT '   ✅ Actualizado a: ' + CAST(@max_articulo AS VARCHAR);
END
ELSE
BEGIN
    PRINT '   ✅ No requiere actualización';
END
PRINT '';

-- 3. NIT
PRINT '3. Corrigiendo secuencia NIT...';
DECLARE @current_nit INT;
DECLARE @max_nit INT;

SELECT @current_nit = sec_num FROM dbo.secuencia WHERE sec_cod = 'NIT';

-- nit_sec es VARCHAR, obtener el máximo numérico
SELECT @max_nit = ISNULL(MAX(
    CASE
        WHEN ISNUMERIC(nit_sec) = 1 THEN CAST(nit_sec AS INT)
        ELSE 0
    END
), 0) FROM dbo.nit;

PRINT '   Actual: ' + CAST(@current_nit AS VARCHAR);
PRINT '   Máximo en tabla: ' + CAST(@max_nit AS VARCHAR);

IF @current_nit < @max_nit
BEGIN
    UPDATE dbo.secuencia
    SET sec_num = @max_nit
    WHERE sec_cod = 'NIT';
    PRINT '   ✅ Actualizado a: ' + CAST(@max_nit AS VARCHAR);
END
ELSE
BEGIN
    PRINT '   ✅ No requiere actualización';
END
PRINT '';

-- 4. Verificación final
PRINT '====================================';
PRINT 'Verificación final de secuencias:';
PRINT '====================================';

SELECT
    sec_cod AS secuencia,
    sec_num AS valor_actual,
    sec_num + 1 AS proximo_valor,
    CASE sec_cod
        WHEN 'FACTURA' THEN (SELECT MAX(CAST(fac_sec AS INT)) FROM dbo.factura)
        WHEN 'ARTICULO' THEN (SELECT MAX(CASE WHEN ISNUMERIC(art_sec) = 1 THEN CAST(art_sec AS INT) ELSE 0 END) FROM dbo.articulos)
        WHEN 'NIT' THEN (SELECT MAX(CASE WHEN ISNUMERIC(nit_sec) = 1 THEN CAST(nit_sec AS INT) ELSE 0 END) FROM dbo.nit)
        ELSE NULL
    END AS max_en_tabla,
    CASE
        WHEN sec_cod = 'FACTURA' AND sec_num >= (SELECT MAX(CAST(fac_sec AS INT)) FROM dbo.factura) THEN '✅'
        WHEN sec_cod = 'ARTICULO' AND sec_num >= (SELECT MAX(CASE WHEN ISNUMERIC(art_sec) = 1 THEN CAST(art_sec AS INT) ELSE 0 END) FROM dbo.articulos) THEN '✅'
        WHEN sec_cod = 'NIT' AND sec_num >= (SELECT MAX(CASE WHEN ISNUMERIC(nit_sec) = 1 THEN CAST(nit_sec AS INT) ELSE 0 END) FROM dbo.nit) THEN '✅'
        ELSE '❌'
    END AS estado
FROM dbo.secuencia
WHERE sec_cod IN ('FACTURA', 'ARTICULO', 'NIT')
ORDER BY sec_cod;

PRINT '';
PRINT '====================================';
PRINT 'Proceso completado';
PRINT '====================================';

GO
