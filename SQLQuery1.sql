select * from vwExistencias 
select count(*) from producto_fotos

select * from articulos where art_sec = '100'

CREATE TABLE producto_fotos (
    id VARCHAR(36) PRIMARY KEY,          -- Identificador único de la foto
    art_sec VARCHAR(30),                 -- Referencia al artículo (FK)
    nombre VARCHAR(255),                 -- Nombre original del archivo
    url VARCHAR(255),                    -- URL donde está almacenada la foto
    tipo VARCHAR(50),                    -- Tipo de archivo (jpg, png, etc)
    tamanio INT,                         -- Tamaño en bytes
    fecha_creacion DATETIME,             -- Fecha de subida
    woo_photo_id VARCHAR(36),            -- ID de la foto en WooCommerce
    es_principal BIT DEFAULT 0,          -- Indica si es la foto principal (0 = No, 1 = Sí)
    posicion INT,                        -- Orden de la foto en la galería
    estado VARCHAR(20) DEFAULT 'temp',   -- Estado: 'temp', 'woo', 'error'
    FOREIGN KEY (art_sec) REFERENCES articulos(art_sec) ON DELETE CASCADE,
    CONSTRAINT chk_estado CHECK (estado IN ('temp', 'woo', 'error'))
);

-- Índices para optimización
CREATE INDEX idx_producto_fotos_art_sec ON producto_fotos(art_sec);
CREATE INDEX idx_producto_fotos_estado ON producto_fotos(estado);
CREATE INDEX idx_producto_fotos_orden ON producto_fotos(art_sec, posicion);

-- Restricción para asegurar una sola foto principal por artículo
CREATE UNIQUE INDEX idx_foto_principal ON producto_fotos(art_sec, es_principal) WHERE es_principal = 1;