/* =====================================================================
   SPEC-013 — Fase 2 (Tarea 3): columnas de apoyo en dbo.woo_pedidos
   Idempotente. Se puede ejecutar varias veces.
   Fecha: 2026-09-14

   Por qué: la pantalla "Pedidos web" necesita mostrar fecha del pedido y
   nombre de la clienta también para pedidos SIN documento en el ERP
   (SIMULADO, SIN_DOC, ERROR de mapeo), donde todavía no hay REM ni nit.
   woo_pedidos (Tarea 1) solo guardaba la fecha de modificación.

   ⚠ Ejecutar primero en PSDATA_PRUEBAS. En producción, con backup previo.
   ===================================================================== */
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF COL_LENGTH('dbo.woo_pedidos', 'woo_created_gmt') IS NULL
    ALTER TABLE dbo.woo_pedidos ADD woo_created_gmt DATETIME2(0) NULL;

IF COL_LENGTH('dbo.woo_pedidos', 'woo_cliente') IS NULL
    ALTER TABLE dbo.woo_pedidos ADD woo_cliente NVARCHAR(150) NULL;

IF COL_LENGTH('dbo.woo_pedidos', 'woo_email') IS NULL
    ALTER TABLE dbo.woo_pedidos ADD woo_email NVARCHAR(150) NULL;

/* Resumen legible de lo que el importador hizo (o habría hecho en simulación)
   en el último ciclo que tocó el pedido. `error` queda solo para errores. */
IF COL_LENGTH('dbo.woo_pedidos', 'ultima_accion') IS NULL
    ALTER TABLE dbo.woo_pedidos ADD ultima_accion NVARCHAR(1000) NULL;

/* Alerta de inventario (spec §4.6): la REM se crea aunque no haya saldo suficiente —la venta ya
   ocurrió— pero queda marcada para que una persona lo revise. Distinto de `error`: no es un
   fallo transitorio ni se reintenta. NULL = sin alerta. */
IF COL_LENGTH('dbo.woo_pedidos', 'alerta') IS NULL
    ALTER TABLE dbo.woo_pedidos ADD alerta NVARCHAR(500) NULL;

COMMIT TRANSACTION;

/* ---------- Verificación ---------- */
SELECT 'woo_pedidos.woo_created_gmt' AS objeto, CASE WHEN COL_LENGTH('dbo.woo_pedidos','woo_created_gmt') IS NULL THEN 0 ELSE 1 END AS ok
UNION ALL SELECT 'woo_pedidos.woo_cliente',     CASE WHEN COL_LENGTH('dbo.woo_pedidos','woo_cliente') IS NULL THEN 0 ELSE 1 END
UNION ALL SELECT 'woo_pedidos.woo_email',       CASE WHEN COL_LENGTH('dbo.woo_pedidos','woo_email') IS NULL THEN 0 ELSE 1 END
UNION ALL SELECT 'woo_pedidos.ultima_accion',   CASE WHEN COL_LENGTH('dbo.woo_pedidos','ultima_accion') IS NULL THEN 0 ELSE 1 END
UNION ALL SELECT 'woo_pedidos.alerta',          CASE WHEN COL_LENGTH('dbo.woo_pedidos','alerta') IS NULL THEN 0 ELSE 1 END;
