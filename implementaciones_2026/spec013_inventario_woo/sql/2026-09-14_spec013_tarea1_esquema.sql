/* =====================================================================
   SPEC-013 — Sincronización de inventario ERP ↔ WooCommerce
   Tarea 1 — Esquema. Idempotente: se puede ejecutar varias veces.
   Fecha: 2026-09-14
   Repo de referencia: negocio_prettymakeup/specs/013-sincronizacion-inventario-erp-woocommerce.md

   ⚠ Ejecutar primero en PSDATA_PRUEBAS. En producción, con backup previo:
      BACKUP DATABASE PSDATAFEB2024 TO DISK = '...\PSDATAFEB2024_pre_spec013.bak'
   ===================================================================== */
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

/* ---------- 1. Fuente y tipo de comprobante REM (remisión web) ----------
   vwExistencias incluye cualquier fuente distinta de 4, así que la REM
   cuenta en existencias sin tocar la vista. */
IF NOT EXISTS (SELECT 1 FROM dbo.fuentes WHERE fue_cod = 6)
    INSERT INTO dbo.fuentes (fue_cod, fue_nom, fue_est) VALUES (6, 'REMISIONES WEB', 'A');

IF NOT EXISTS (SELECT 1 FROM dbo.tipo_comprobantes WHERE tip_cod = 'REM')
    INSERT INTO dbo.tipo_comprobantes (tip_cod, tip_nom, tip_lon, tip_cli, tip_est, fue_cod, tip_con_sec)
    VALUES ('REM', 'REMISIÓN WEB', 6, 1, 'A', 6, 0);   -- tip_lon/tip_cli/tip_est copiados de VTA

/* ---------- 2. Un solo documento vigente por (pedido Woo, tipo) ----------
   Permite REM 'F' + VTA 'A' del mismo pedido (relevo); bloquea dos REM o
   dos VTA activas del mismo pedido.
   Filtrado por fecha de creación porque el histórico tiene 7 pares
   duplicados (ver README_FASE1.md) que el negocio debe revisar aparte. */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_factura_woo_vigente' AND object_id = OBJECT_ID('dbo.factura'))
    CREATE UNIQUE NONCLUSTERED INDEX UX_factura_woo_vigente
        ON dbo.factura (fac_nro_woo, fac_tip_cod)
        WHERE fac_nro_woo IS NOT NULL
          AND fac_est_fac IN ('A', 'F')
          AND fac_fch_cre >= '20260914';

/* ---------- 3. Seguimiento del importador (Tarea 3) ---------- */
IF OBJECT_ID('dbo.woo_pedidos', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.woo_pedidos (
        woo_order_id        INT            NOT NULL CONSTRAINT PK_woo_pedidos PRIMARY KEY,
        woo_status          VARCHAR(40)    NOT NULL,
        woo_modified_gmt    DATETIME2(0)   NOT NULL,
        woo_total           DECIMAL(17,2)  NULL,
        woo_payment_method  VARCHAR(40)    NULL,
        fac_nro_rem         VARCHAR(15)    NULL,
        fac_nro_vta         VARCHAR(15)    NULL,
        estado_erp          VARCHAR(20)    NOT NULL,   -- SIN_DOC | REM_ACTIVA | FACTURADO | ANULADO | REVISION | ERROR | SIMULADO
        vence_el            DATETIME2(0)   NULL,       -- solo REM_ACTIVA; NULL = sin vencimiento
        error               NVARCHAR(1000) NULL,
        intentos            INT            NOT NULL CONSTRAINT DF_woo_pedidos_intentos DEFAULT 0,
        actualizado_en      DATETIME2(0)   NOT NULL CONSTRAINT DF_woo_pedidos_act DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_woo_pedidos_estado ON dbo.woo_pedidos (estado_erp, vence_el);
END;

/* ---------- 4. Cursor y lock de los jobs ---------- */
IF OBJECT_ID('dbo.woo_sync_cursor', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.woo_sync_cursor (
        nombre        VARCHAR(40)    NOT NULL CONSTRAINT PK_woo_sync_cursor PRIMARY KEY,
        cursor_gmt    DATETIME2(0)   NOT NULL,
        locked_until  DATETIME2(0)   NULL,
        ultimo_ok     DATETIME2(0)   NULL,
        ultimo_error  NVARCHAR(1000) NULL
    );
END;
IF NOT EXISTS (SELECT 1 FROM dbo.woo_sync_cursor WHERE nombre = 'importar_pedidos')
    INSERT INTO dbo.woo_sync_cursor (nombre, cursor_gmt)
    VALUES ('importar_pedidos', DATEADD(DAY, -1, SYSUTCDATETIME()));

/* ---------- 5. Log de pushes: origen y usuario (Tarea 2) ---------- */
IF COL_LENGTH('dbo.woo_sync_logs', 'origen') IS NULL
    ALTER TABLE dbo.woo_sync_logs ADD origen VARCHAR(30) NULL;
IF COL_LENGTH('dbo.woo_sync_logs', 'usuario') IS NULL
    ALTER TABLE dbo.woo_sync_logs ADD usuario VARCHAR(100) NULL;

/* ---------- 6. Cola de pushes que fallaron (Tarea 2) ---------- */
IF OBJECT_ID('dbo.woo_sync_pendientes', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.woo_sync_pendientes (
        art_sec        VARCHAR(30)    NOT NULL CONSTRAINT PK_woo_sync_pendientes PRIMARY KEY,
        origen         VARCHAR(30)    NOT NULL,
        intentos       INT            NOT NULL CONSTRAINT DF_woo_sync_pend_int DEFAULT 0,
        ultimo_error   NVARCHAR(1000) NULL,
        creado_en      DATETIME2(0)   NOT NULL CONSTRAINT DF_woo_sync_pend_cre DEFAULT SYSUTCDATETIME(),
        actualizado_en DATETIME2(0)   NOT NULL CONSTRAINT DF_woo_sync_pend_act DEFAULT SYSUTCDATETIME()
    );
END;

/* ---------- 7. Reporte de reconciliaciones (Tarea 7) ---------- */
IF OBJECT_ID('dbo.woo_reconciliaciones', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.woo_reconciliaciones (
        id               INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_woo_reconciliaciones PRIMARY KEY,
        ejecutada_en     DATETIME2(0)   NOT NULL CONSTRAINT DF_woo_recon_fecha DEFAULT SYSUTCDATETIME(),
        total_comparados INT            NOT NULL,
        total_diferentes INT            NOT NULL,
        corregidos       INT            NOT NULL,
        autocorregir     BIT            NOT NULL,
        diferencias      NVARCHAR(MAX)  NULL,   -- JSON [{art_sec, art_cod, woo_id, erp, woo}]
        invariantes      NVARCHAR(MAX)  NULL    -- JSON con los 4 chequeos de la Tarea 7
    );
END;

COMMIT TRANSACTION;

/* ---------- Verificación ---------- */
SELECT 'fuentes'            AS objeto, COUNT(*) AS ok FROM dbo.fuentes WHERE fue_cod = 6
UNION ALL SELECT 'tipo REM',            COUNT(*) FROM dbo.tipo_comprobantes WHERE tip_cod = 'REM'
UNION ALL SELECT 'UX_factura_woo_vigente', COUNT(*) FROM sys.indexes WHERE name = 'UX_factura_woo_vigente'
UNION ALL SELECT 'woo_pedidos',         COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'woo_pedidos'
UNION ALL SELECT 'woo_sync_cursor',     COUNT(*) FROM dbo.woo_sync_cursor
UNION ALL SELECT 'woo_sync_logs.origen', CASE WHEN COL_LENGTH('dbo.woo_sync_logs','origen') IS NULL THEN 0 ELSE 1 END
UNION ALL SELECT 'woo_sync_pendientes', COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'woo_sync_pendientes'
UNION ALL SELECT 'woo_reconciliaciones', COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'woo_reconciliaciones';
