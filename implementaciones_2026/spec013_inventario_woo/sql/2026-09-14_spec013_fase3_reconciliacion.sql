/* =====================================================================
   SPEC-013 — Fase 3 (Tarea 7): columnas de apoyo en dbo.woo_reconciliaciones
   Idempotente. Fecha: 2026-09-14
   ⚠ Ejecutar primero en PSDATA_PRUEBAS. En producción, con backup previo.
   ===================================================================== */
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF COL_LENGTH('dbo.woo_reconciliaciones', 'origen') IS NULL
    ALTER TABLE dbo.woo_reconciliaciones ADD origen VARCHAR(20) NULL;        -- CRON | MANUAL
IF COL_LENGTH('dbo.woo_reconciliaciones', 'usuario') IS NULL
    ALTER TABLE dbo.woo_reconciliaciones ADD usuario VARCHAR(100) NULL;      -- quien la pidió (MANUAL)
IF COL_LENGTH('dbo.woo_reconciliaciones', 'duracion_ms') IS NULL
    ALTER TABLE dbo.woo_reconciliaciones ADD duracion_ms INT NULL;

COMMIT TRANSACTION;

SELECT 'woo_reconciliaciones.origen' AS objeto, CASE WHEN COL_LENGTH('dbo.woo_reconciliaciones','origen') IS NULL THEN 0 ELSE 1 END AS ok
UNION ALL SELECT 'woo_reconciliaciones.usuario',     CASE WHEN COL_LENGTH('dbo.woo_reconciliaciones','usuario') IS NULL THEN 0 ELSE 1 END
UNION ALL SELECT 'woo_reconciliaciones.duracion_ms', CASE WHEN COL_LENGTH('dbo.woo_reconciliaciones','duracion_ms') IS NULL THEN 0 ELSE 1 END;
