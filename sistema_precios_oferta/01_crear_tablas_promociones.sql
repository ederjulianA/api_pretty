-- SCRIPT PARA CREAR TABLAS DE PROMOCIONES
-- Ejecutar paso a paso en SQL Server

-- 1. Crear tabla encabezado de promociones
CREATE TABLE [dbo].[promociones](
    [pro_sec] [decimal](18, 0) IDENTITY(1,1) NOT NULL,
    [pro_codigo] [varchar](20) NOT NULL,
    [pro_descripcion] [varchar](200) NOT NULL,
    [pro_fecha_inicio] [datetime] NOT NULL,
    [pro_fecha_fin] [datetime] NOT NULL,
    [pro_activa] [char](1) DEFAULT 'S',
    [pro_tipo] [varchar](20) DEFAULT 'OFERTA',
    [pro_observaciones] [varchar](500) NULL,
    [pro_fecha_creacion] [datetime] DEFAULT GETDATE(),
    [pro_usuario_creacion] [varchar](50) NULL,
    [pro_fecha_modificacion] [datetime] NULL,
    [pro_usuario_modificacion] [varchar](50) NULL,
    PRIMARY KEY CLUSTERED ([pro_sec] ASC)
);

-- 2. Crear tabla detalle de promociones
CREATE TABLE [dbo].[promociones_detalle](
    [pro_det_sec] [decimal](18, 0) IDENTITY(1,1) NOT NULL,
    [pro_sec] [decimal](18, 0) NOT NULL,
    [art_sec] [varchar](30) NOT NULL,
    [pro_det_precio_oferta] [decimal](17, 2) NULL,
    [pro_det_descuento_porcentaje] [decimal](5, 2) NULL,
    [pro_det_observaciones] [varchar](200) NULL,
    [pro_det_fecha_creacion] [datetime] DEFAULT GETDATE(),
    [pro_det_usuario_creacion] [varchar](50) NULL,
    PRIMARY KEY CLUSTERED ([pro_det_sec] ASC)
);

-- 3. Crear índices para optimización
CREATE NONCLUSTERED INDEX IDX_Promociones_Codigo
ON dbo.promociones (pro_codigo);

CREATE NONCLUSTERED INDEX IDX_Promociones_Fechas
ON dbo.promociones (pro_fecha_inicio, pro_fecha_fin, pro_activa);

CREATE NONCLUSTERED INDEX IDX_PromocionesDetalle_ProSec
ON dbo.promociones_detalle (pro_sec);

CREATE NONCLUSTERED INDEX IDX_PromocionesDetalle_ArtSec
ON dbo.promociones_detalle (art_sec);

-- 4. Crear foreign keys
ALTER TABLE [dbo].[promociones_detalle] 
ADD CONSTRAINT [FK_PromocionesDetalle_Promociones] 
FOREIGN KEY([pro_sec]) REFERENCES [dbo].[promociones] ([pro_sec]);

ALTER TABLE [dbo].[promociones_detalle] 
ADD CONSTRAINT [FK_PromocionesDetalle_Articulos] 
FOREIGN KEY([art_sec]) REFERENCES [dbo].[articulos] ([art_sec]);

-- Verificar que las tablas se crearon correctamente
SELECT 'Tabla promociones creada' as resultado;
SELECT COUNT(*) as registros_promociones FROM dbo.promociones;

SELECT 'Tabla promociones_detalle creada' as resultado;
SELECT COUNT(*) as registros_promociones_detalle FROM dbo.promociones_detalle; 