-- =============================================================
-- SCRIPT DE IMPACTO: Nuevo Formato Cotización — Datos de Pago
-- Fecha: 26/04/2026
-- Autor: DB Explorer (revisado por: Eder)
-- IMPORTANTE: Ejecutar en ambiente de DESARROLLO primero
-- =============================================================

-- ⚠️ PROBLEMA DETECTADO:
-- par_cod es VARCHAR(20) pero 'datos_pago_cotizacion' tiene 22 caracteres.
-- Hay dos opciones: ampliar la columna o usar un código más corto.

-- =============================================================
-- OPCIÓN A (RECOMENDADA): Ampliar par_cod a VARCHAR(50)
-- Impacto: mínimo — la columna solo tiene registros de configuración
-- =============================================================

-- PASO 1: Verificar registros actuales en parametros
SELECT par_cod, LEN(par_cod) AS longitud, LEFT(par_value, 50) AS valor_preview
FROM dbo.parametros
ORDER BY par_cod;

-- PASO 2: Ampliar la columna
ALTER TABLE dbo.parametros
    ALTER COLUMN par_cod VARCHAR(50) NOT NULL;

-- PASO 3: Insertar el registro de datos de pago
-- ⚠️ Ajustar número de cuenta Bancolombia y titular antes de ejecutar
INSERT INTO dbo.parametros (par_cod, par_value)
VALUES (
    'datos_pago_cotizacion',
    '{"bancolombia":{"tipo":"Ahorros","numero":"123 45678901","titular":"Eder Álvarez · CC 1.098.747.037"},"nequi":{"numero":"321 420 7398","instruccion":"Confirma el pago enviando el comprobante"},"daviplata":{"numero":"321 420 7398","instruccion":"Pago contra entrega disponible en Bucaramanga"}}'
);

-- PASO 4: Verificar resultado
SELECT par_cod, LEN(par_cod) AS longitud, par_value
FROM dbo.parametros
WHERE par_cod = 'datos_pago_cotizacion';

-- ROLLBACK en caso de error:
-- DELETE FROM dbo.parametros WHERE par_cod = 'datos_pago_cotizacion';
-- ALTER TABLE dbo.parametros ALTER COLUMN par_cod VARCHAR(20) NOT NULL;
-- (el rollback del ALTER solo funciona si no hay códigos de más de 20 chars)


-- =============================================================
-- OPCIÓN B (sin ALTER TABLE): Usar código corto 'pago_cotizacion' (15 chars)
-- Impacto: hay que usar el mismo código en el código JS
-- =============================================================

-- INSERT INTO dbo.parametros (par_cod, par_value)
-- VALUES (
--     'pago_cotizacion',
--     '{"bancolombia":{"tipo":"Ahorros","numero":"123 45678901","titular":"Eder Álvarez · CC 1.098.747.037"},"nequi":{"numero":"321 420 7398","instruccion":"Confirma el pago enviando el comprobante"},"daviplata":{"numero":"321 420 7398","instruccion":"Pago contra entrega disponible en Bucaramanga"}}'
-- );
