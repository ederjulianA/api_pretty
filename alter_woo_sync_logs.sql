-- Script para agregar el campo product_updates a la tabla woo_sync_logs
ALTER TABLE dbo.woo_sync_logs ADD product_updates NVARCHAR(MAX) NULL;

-- Agregar nuevos campos a la tabla existente woo_sync_logs
ALTER TABLE dbo.woo_sync_logs ADD debug_logs NVARCHAR(MAX) NULL;
ALTER TABLE dbo.woo_sync_logs ADD order_details NVARCHAR(MAX) NULL;
ALTER TABLE dbo.woo_sync_logs ADD config NVARCHAR(MAX) NULL;

-- Crear tabla de logs por lote
CREATE TABLE dbo.woo_sync_batch_logs (
    id INT IDENTITY(1,1) PRIMARY KEY,
    log_id INT NOT NULL,
    batch_index INT NOT NULL,
    batch_data NVARCHAR(MAX) NULL,
    success_count INT NOT NULL,
    error_count INT NOT NULL,
    success_details NVARCHAR(MAX) NULL,
    error_details NVARCHAR(MAX) NULL,
    created_at DATETIME DEFAULT GETDATE(),
    FOREIGN KEY (log_id) REFERENCES dbo.woo_sync_logs(id)
);

-- Índice para mejorar el rendimiento de las consultas de lotes
CREATE INDEX IX_woo_sync_batch_logs_log_id ON dbo.woo_sync_batch_logs(log_id); 