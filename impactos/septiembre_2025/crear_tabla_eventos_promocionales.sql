-- Script para crear tabla de eventos promocionales
-- Fecha: Septiembre 2025
-- Descripción: Tabla para gestionar eventos promocionales que aplican descuentos automáticos
--              según el tipo de compra (detal o mayorista)

-- Verificar si la tabla ya existe
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[eventos_promocionales]') AND type in (N'U'))
BEGIN
    -- Crear tabla eventos_promocionales
    CREATE TABLE [dbo].[eventos_promocionales](
        [eve_sec] [decimal](18, 0) IDENTITY(1,1) NOT NULL,
        [eve_nombre] [varchar](100) NOT NULL,
        [eve_fecha_inicio] [datetime] NOT NULL,
        [eve_fecha_fin] [datetime] NOT NULL,
        [eve_descuento_detal] [decimal](5, 2) NOT NULL,
        [eve_descuento_mayor] [decimal](5, 2) NOT NULL,
        [eve_activo] [char](1) DEFAULT 'S',
        [eve_observaciones] [varchar](500) NULL,
        [eve_fecha_creacion] [datetime] DEFAULT GETDATE(),
        [eve_usuario_creacion] [varchar](50) NULL,
        [eve_fecha_modificacion] [datetime] NULL,
        [eve_usuario_modificacion] [varchar](50) NULL,
        PRIMARY KEY CLUSTERED ([eve_sec] ASC)
    );
    
    PRINT 'Tabla eventos_promocionales creada exitosamente';
END
ELSE
BEGIN
    PRINT 'La tabla eventos_promocionales ya existe';
END

-- Crear índices para optimización
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IDX_EventosPromocionales_Fechas' AND object_id = OBJECT_ID('dbo.eventos_promocionales'))
BEGIN
    CREATE NONCLUSTERED INDEX IDX_EventosPromocionales_Fechas
    ON dbo.eventos_promocionales (eve_fecha_inicio, eve_fecha_fin, eve_activo);
    
    PRINT 'Índice IDX_EventosPromocionales_Fechas creado exitosamente';
END

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IDX_EventosPromocionales_Activo' AND object_id = OBJECT_ID('dbo.eventos_promocionales'))
BEGIN
    CREATE NONCLUSTERED INDEX IDX_EventosPromocionales_Activo
    ON dbo.eventos_promocionales (eve_activo, eve_fecha_inicio, eve_fecha_fin);
    
    PRINT 'Índice IDX_EventosPromocionales_Activo creado exitosamente';
END

-- Verificar que la tabla se creó correctamente
SELECT 
    'Tabla eventos_promocionales' as tabla,
    COUNT(*) as total_registros 
FROM dbo.eventos_promocionales;

-- Mostrar estructura de la tabla
SELECT 
    COLUMN_NAME,
    DATA_TYPE,
    IS_NULLABLE,
    COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'eventos_promocionales'
ORDER BY ORDINAL_POSITION;

