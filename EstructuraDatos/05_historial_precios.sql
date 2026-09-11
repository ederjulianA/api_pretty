-- =============================================================
-- SCRIPT DE IMPACTO: Historial de cambios de precio en articulosdetalle
-- Fecha: 10/09/2026
-- Autor: DB Explorer (revisado por: Eder)
-- IMPORTANTE: Ejecutar en ambiente de DESARROLLO primero. Idempotente.
--
-- Motivo: articulosdetalle no tiene fecha ni usuario de modificación. En el
-- incidente del 2026-08-12 (34 precios sobrescritos por un script) la única
-- huella fue la respuesta de WooCommerce guardada en articulos.art_woo_sync_message.
--
-- El trigger cubre CUALQUIER vía de escritura (API, scripts, SQL directo).
-- El usuario de la app llega vía SESSION_CONTEXT('usu_cod'), que updateArticulo
-- y updateProductVariation dejan antes del UPDATE (models/articulosModel.js).
-- Si el UPDATE no pasa por esas funciones, hp_usuario queda NULL pero
-- hp_login_sql / hp_aplicacion / hp_host siguen identificando el origen.
-- =============================================================

-- PASO 1: Tabla de historial
IF OBJECT_ID('dbo.historial_precios', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.historial_precios (
        hp_id            INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_historial_precios PRIMARY KEY,
        hp_art_sec       VARCHAR(30)   NOT NULL,
        hp_bod_sec       VARCHAR(16)   NOT NULL,
        hp_lis_pre_cod   SMALLINT      NOT NULL,   -- 1 = detal, 2 = mayor, 3 = distribuidor
        hp_precio_antes  DECIMAL(17,2) NULL,
        hp_precio_nuevo  DECIMAL(17,2) NULL,
        hp_fecha         DATETIME      NOT NULL CONSTRAINT DF_historial_precios_fecha DEFAULT (GETDATE()),
        hp_usuario       VARCHAR(100)  NULL,       -- usu_cod de la app (SESSION_CONTEXT)
        hp_login_sql     NVARCHAR(128) NULL,       -- SUSER_SNAME()
        hp_aplicacion    NVARCHAR(128) NULL,       -- APP_NAME()
        hp_host          NVARCHAR(128) NULL        -- HOST_NAME()
    );

    CREATE INDEX IX_historial_precios_art_fecha ON dbo.historial_precios (hp_art_sec, hp_fecha DESC);
    CREATE INDEX IX_historial_precios_fecha ON dbo.historial_precios (hp_fecha DESC);
END
GO

-- PASO 2: Trigger AFTER UPDATE — solo cuando cambia art_bod_pre
IF OBJECT_ID('dbo.trg_articulosdetalle_historial_precios', 'TR') IS NOT NULL
    DROP TRIGGER dbo.trg_articulosdetalle_historial_precios;
GO

CREATE TRIGGER dbo.trg_articulosdetalle_historial_precios
ON dbo.articulosdetalle
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT UPDATE(art_bod_pre)
        RETURN;

    INSERT INTO dbo.historial_precios
        (hp_art_sec, hp_bod_sec, hp_lis_pre_cod, hp_precio_antes, hp_precio_nuevo,
         hp_usuario, hp_login_sql, hp_aplicacion, hp_host)
    SELECT
        i.art_sec, i.bod_sec, i.lis_pre_cod, d.art_bod_pre, i.art_bod_pre,
        CAST(SESSION_CONTEXT(N'usu_cod') AS VARCHAR(100)),
        SUSER_SNAME(), APP_NAME(), HOST_NAME()
    FROM inserted i
    INNER JOIN deleted d
        ON d.art_sec = i.art_sec AND d.bod_sec = i.bod_sec AND d.lis_pre_cod = i.lis_pre_cod
    WHERE ISNULL(i.art_bod_pre, -1) <> ISNULL(d.art_bod_pre, -1);
END
GO

-- PASO 3: Verificar
SELECT OBJECT_ID('dbo.historial_precios', 'U') AS tabla,
       OBJECT_ID('dbo.trg_articulosdetalle_historial_precios', 'TR') AS trigger_creado;
GO

-- Consulta de auditoría (ejemplo): quién cambió qué en los últimos 30 días
-- SELECT h.hp_fecha, a.art_cod, h.hp_lis_pre_cod, h.hp_precio_antes, h.hp_precio_nuevo,
--        h.hp_usuario, h.hp_login_sql, h.hp_aplicacion, h.hp_host
-- FROM dbo.historial_precios h JOIN dbo.articulos a ON a.art_sec = h.hp_art_sec
-- WHERE h.hp_fecha >= DATEADD(DAY, -30, GETDATE()) ORDER BY h.hp_fecha DESC;

-- ROLLBACK:
-- DROP TRIGGER dbo.trg_articulosdetalle_historial_precios;
-- DROP TABLE dbo.historial_precios;
