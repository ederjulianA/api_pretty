/* ============================================================================
   Cierre de Mes — estructura de datos
   Fecha: 2026-09-09
   Solicitud: pretty_front/IMPLEMENTACIONES_2026_IA/cierre_de_mes_09-09-2026/

   EJECUTAR MANUALMENTE. El script es idempotente: se puede correr varias veces.

   NOTA DE TIPOS: dbo.factura.fac_sec es DECIMAL(12,0) (verificado en produccion,
   NO DECIMAL(18,0) como indicaba la solicitud). cierre_mes_detalle.fac_sec usa
   el mismo tipo para que la FK contra dbo.factura sea posible.
   ============================================================================ */

SET NOCOUNT ON;
GO

/* ---------------------------------------------------------------------------
   1. Cabecera: dbo.cierre_mes
   --------------------------------------------------------------------------- */
IF OBJECT_ID('dbo.cierre_mes', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.cierre_mes (
        cie_sec                INT IDENTITY(1,1) NOT NULL,
        cie_anio               INT            NOT NULL,
        cie_mes                INT            NOT NULL,
        cie_estado             CHAR(1)        NOT NULL CONSTRAINT DF_cierre_mes_estado DEFAULT ('A'),
        cie_fec_cierre         DATETIME       NOT NULL CONSTRAINT DF_cierre_mes_fec    DEFAULT (GETDATE()),
        cie_usu_cod            VARCHAR(100)   NOT NULL,

        -- Canal WooCommerce
        cie_woo_ordenes        INT            NULL,
        cie_woo_ventas         DECIMAL(17,2)  NULL,
        cie_woo_ticket_prom    DECIMAL(17,2)  NULL,
        cie_woo_pct_comision   DECIMAL(5,2)   NULL,   -- congelado al momento del cierre
        cie_woo_comision       DECIMAL(17,2)  NULL,
        cie_woo_rentabilidad   DECIMAL(17,2)  NULL,   -- utilidad en pesos

        -- Canal Local
        cie_loc_ordenes        INT            NULL,
        cie_loc_ventas         DECIMAL(17,2)  NULL,
        cie_loc_ticket_prom    DECIMAL(17,2)  NULL,
        cie_loc_pct_comision   DECIMAL(5,2)   NULL,   -- congelado al momento del cierre
        cie_loc_comision       DECIMAL(17,2)  NULL,
        cie_loc_rentabilidad   DECIMAL(17,2)  NULL,   -- utilidad en pesos

        -- Totales
        cie_total_ordenes      INT            NULL,
        cie_total_ventas       DECIMAL(17,2)  NULL,
        cie_total_comision     DECIMAL(17,2)  NULL,
        cie_total_rentabilidad DECIMAL(17,2)  NULL,

        cie_obs                VARCHAR(1024)  NULL,

        -- Anulacion (nunca borrado fisico)
        cie_anu_obs            VARCHAR(1024)  NULL,
        cie_anu_fec            DATETIME       NULL,
        cie_anu_usu_cod        VARCHAR(100)   NULL,

        CONSTRAINT PK_cierre_mes        PRIMARY KEY CLUSTERED (cie_sec),
        CONSTRAINT CK_cierre_mes_mes    CHECK (cie_mes BETWEEN 1 AND 12),
        CONSTRAINT CK_cierre_mes_anio   CHECK (cie_anio BETWEEN 2000 AND 2999),
        CONSTRAINT CK_cierre_mes_estado CHECK (cie_estado IN ('A','I'))
    );
    PRINT 'Tabla dbo.cierre_mes creada.';
END
ELSE
    PRINT 'Tabla dbo.cierre_mes ya existe — sin cambios.';
GO

/* Indice unico filtrado: impide dos cierres ACTIVOS del mismo periodo.
   Es la garantia real contra concurrencia; la validacion aplicativa es solo
   para dar un mensaje amable. Al anular (cie_estado='I') el periodo se libera. */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_cierre_mes_periodo' AND object_id = OBJECT_ID('dbo.cierre_mes'))
BEGIN
    CREATE UNIQUE INDEX UX_cierre_mes_periodo
        ON dbo.cierre_mes (cie_anio, cie_mes)
        WHERE cie_estado = 'A';
    PRINT 'Indice UX_cierre_mes_periodo creado.';
END
ELSE
    PRINT 'Indice UX_cierre_mes_periodo ya existe — sin cambios.';
GO

/* ---------------------------------------------------------------------------
   2. Detalle: dbo.cierre_mes_detalle
   --------------------------------------------------------------------------- */
IF OBJECT_ID('dbo.cierre_mes_detalle', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.cierre_mes_detalle (
        cid_sec          INT IDENTITY(1,1) NOT NULL,
        cie_sec          INT            NOT NULL,
        fac_sec          DECIMAL(12,0)  NOT NULL,   -- calza con dbo.factura.fac_sec
        fac_nro          VARCHAR(15)    NULL,       -- denormalizado para auditoria
        cid_canal        VARCHAR(20)    NULL,       -- 'WooCommerce' | 'Local'
        cid_fecha        DATETIME       NULL,
        cid_total        DECIMAL(17,2)  NULL,
        cid_rentabilidad DECIMAL(17,2)  NULL,       -- utilidad en pesos
        cid_comision     DECIMAL(17,2)  NULL,       -- comision imputada a esta factura

        CONSTRAINT PK_cierre_mes_detalle PRIMARY KEY CLUSTERED (cid_sec),
        CONSTRAINT FK_cierre_mes_detalle_cierre FOREIGN KEY (cie_sec)
            REFERENCES dbo.cierre_mes (cie_sec)
    );
    PRINT 'Tabla dbo.cierre_mes_detalle creada.';
END
ELSE
    PRINT 'Tabla dbo.cierre_mes_detalle ya existe — sin cambios.';
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_cierre_mes_detalle_cie' AND object_id = OBJECT_ID('dbo.cierre_mes_detalle'))
BEGIN
    CREATE INDEX IX_cierre_mes_detalle_cie ON dbo.cierre_mes_detalle (cie_sec);
    PRINT 'Indice IX_cierre_mes_detalle_cie creado.';
END
GO

/* ---------------------------------------------------------------------------
   3. Parametros de comision (reemplazan los literales de ventasKpiModel.js)
   --------------------------------------------------------------------------- */
IF NOT EXISTS (SELECT 1 FROM dbo.parametros WHERE par_cod = 'comision_woo')
BEGIN
    INSERT INTO dbo.parametros (par_cod, par_value) VALUES ('comision_woo', '5.0');
    PRINT 'Parametro comision_woo insertado (5.0).';
END
GO

IF NOT EXISTS (SELECT 1 FROM dbo.parametros WHERE par_cod = 'comision_local')
BEGIN
    INSERT INTO dbo.parametros (par_cod, par_value) VALUES ('comision_local', '2.5');
    PRINT 'Parametro comision_local insertado (2.5).';
END
GO

/* ---------------------------------------------------------------------------
   4. RBAC: modulo cierre_mes + acciones + permisos
      Roles actuales: 1=Administrador, 2=Vendedor, 3=Supervisor
      Se concede acceso a Administrador y Supervisor (no a Vendedor).
   --------------------------------------------------------------------------- */
IF NOT EXISTS (SELECT 1 FROM dbo.Modulos WHERE mod_codigo = 'cierre_mes')
BEGIN
    INSERT INTO dbo.Modulos (mod_codigo, mod_nombre, mod_descripcion, mod_activo)
    VALUES ('cierre_mes', 'Cierre de Mes', 'Proceso de cierre contable mensual', 1);
    PRINT 'Modulo cierre_mes insertado.';
END
GO

DECLARE @mod_id INT = (SELECT mod_id FROM dbo.Modulos WHERE mod_codigo = 'cierre_mes');

-- 4.1 Acciones del modulo
INSERT INTO dbo.Acciones (mod_id, acc_codigo, acc_nombre, acc_descripcion)
SELECT @mod_id, v.cod, v.nom, v.descr
FROM (VALUES
    ('view',   'Ver',     'Ver el listado y el detalle de cierres de mes'),
    ('create', 'Crear',   'Ejecutar el wizard y generar un cierre de mes'),
    ('edit',   'Editar',  'Resolver pedidos y cotizaciones durante el cierre'),
    ('delete', 'Anular',  'Anular un cierre de mes ya generado')
) AS v(cod, nom, descr)
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.Acciones a WHERE a.mod_id = @mod_id AND a.acc_codigo = v.cod
);

-- 4.2 Acceso al modulo para Administrador (1) y Supervisor (3)
INSERT INTO dbo.RolesPermisos (rol_id, mod_id, acceso, fecha_creacion)
SELECT r.rol_id, @mod_id, 1, GETDATE()
FROM (VALUES (1), (3)) AS r(rol_id)
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.RolesPermisos rp WHERE rp.rol_id = r.rol_id AND rp.mod_id = @mod_id
);

-- 4.3 Todas las acciones permitidas para esos roles
INSERT INTO dbo.RolesPermisosAcciones (rolperm_id, acc_id, permitido)
SELECT rp.rolperm_id, a.acc_id, 1
FROM dbo.RolesPermisos rp
CROSS JOIN dbo.Acciones a
WHERE rp.mod_id = @mod_id
  AND a.mod_id  = @mod_id
  AND NOT EXISTS (
      SELECT 1 FROM dbo.RolesPermisosAcciones rpa
      WHERE rpa.rolperm_id = rp.rolperm_id AND rpa.acc_id = a.acc_id
  );

PRINT 'RBAC de cierre_mes configurado.';
GO

/* ---------------------------------------------------------------------------
   5. Verificacion
   --------------------------------------------------------------------------- */
SELECT 'cierre_mes'          AS objeto, COUNT(*) AS filas FROM dbo.cierre_mes
UNION ALL SELECT 'cierre_mes_detalle', COUNT(*) FROM dbo.cierre_mes_detalle
UNION ALL SELECT 'parametros_comision', COUNT(*) FROM dbo.parametros WHERE par_cod IN ('comision_woo','comision_local')
UNION ALL SELECT 'acciones_cierre_mes', COUNT(*) FROM dbo.Acciones WHERE mod_id = (SELECT mod_id FROM dbo.Modulos WHERE mod_codigo='cierre_mes');
GO
