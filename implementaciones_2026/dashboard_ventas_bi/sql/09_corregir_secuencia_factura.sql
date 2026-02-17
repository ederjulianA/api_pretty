/*
 * Script: Corregir secuencia FACTURA
 * Fecha: 2026-02-17
 * Descripción: Sincroniza sec_num con el máximo fac_sec existente en la tabla factura
 *
 * Problema: Error "Violation of PRIMARY KEY constraint" al insertar nuevas facturas
 * Causa: sec_num en dbo.secuencia está desincronizado con los datos reales
 * Solución: Actualizar sec_num al máximo fac_sec actual
 */

USE SyscomElRedentor; -- ⚠️ CAMBIAR AL NOMBRE DE TU BASE DE DATOS
GO

-- 1. Ver el estado actual
PRINT '====================================';
PRINT 'Estado ANTES de la corrección:';
PRINT '====================================';

SELECT
    'Secuencia FACTURA' AS origen,
    sec_num AS valor_actual,
    sec_num + 1 AS proximo_valor
FROM dbo.secuencia
WHERE sec_cod = 'FACTURA';

SELECT
    'Tabla factura' AS origen,
    MAX(fac_sec) AS max_fac_sec,
    MAX(fac_sec) + 1 AS proximo_deberia_ser
FROM dbo.factura;

-- 2. Corregir la secuencia
PRINT '';
PRINT '====================================';
PRINT 'Corrigiendo secuencia...';
PRINT '====================================';

UPDATE dbo.secuencia
SET sec_num = (SELECT ISNULL(MAX(fac_sec), 0) FROM dbo.factura)
WHERE sec_cod = 'FACTURA';

PRINT 'Secuencia actualizada exitosamente.';

-- 3. Verificar el resultado
PRINT '';
PRINT '====================================';
PRINT 'Estado DESPUÉS de la corrección:';
PRINT '====================================';

SELECT
    'Secuencia FACTURA' AS origen,
    sec_num AS valor_actual,
    sec_num + 1 AS proximo_valor
FROM dbo.secuencia
WHERE sec_cod = 'FACTURA';

SELECT
    'Tabla factura' AS origen,
    MAX(fac_sec) AS max_fac_sec,
    MAX(fac_sec) + 1 AS proximo_deberia_ser
FROM dbo.factura;

-- 4. Validación
PRINT '';
PRINT '====================================';
PRINT 'Validación:';
PRINT '====================================';

DECLARE @sec_num INT;
DECLARE @max_fac_sec INT;

SELECT @sec_num = sec_num FROM dbo.secuencia WHERE sec_cod = 'FACTURA';
SELECT @max_fac_sec = MAX(fac_sec) FROM dbo.factura;

IF @sec_num = @max_fac_sec
BEGIN
    PRINT '✅ Secuencia correctamente sincronizada';
    PRINT 'Próximo fac_sec será: ' + CAST(@sec_num + 1 AS VARCHAR);
END
ELSE
BEGIN
    PRINT '❌ ERROR: Secuencia NO sincronizada';
    PRINT 'sec_num: ' + CAST(@sec_num AS VARCHAR);
    PRINT 'max_fac_sec: ' + CAST(@max_fac_sec AS VARCHAR);
END

GO
