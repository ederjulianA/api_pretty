-- Tabla principal de logs de sincronización
CREATE TABLE dbo.woo_sync_logs (
    id INT IDENTITY(1,1) PRIMARY KEY,
    fac_nro_woo VARCHAR(50) NULL,
    fac_nro VARCHAR(50) NULL,
    total_items INT NOT NULL,
    success_count INT NOT NULL,
    error_count INT NOT NULL,
    skipped_count INT NOT NULL,
    duration FLOAT NOT NULL,
    batches_processed INT NOT NULL,
    messages NVARCHAR(MAX) NULL,
    status VARCHAR(20) NOT NULL,
    error_details NVARCHAR(MAX) NULL,
    product_updates NVARCHAR(MAX) NULL,
    debug_logs NVARCHAR(MAX) NULL,
    order_details NVARCHAR(MAX) NULL,
    config NVARCHAR(MAX) NULL,
    created_at DATETIME DEFAULT GETDATE()
);

-- Tabla de logs por lote
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

-- Índices para mejorar el rendimiento de las consultas
CREATE INDEX IX_woo_sync_logs_fac_nro ON dbo.woo_sync_logs(fac_nro);
CREATE INDEX IX_woo_sync_logs_fac_nro_woo ON dbo.woo_sync_logs(fac_nro_woo);
CREATE INDEX IX_woo_sync_logs_created_at ON dbo.woo_sync_logs(created_at);
CREATE INDEX IX_woo_sync_batch_logs_log_id ON dbo.woo_sync_batch_logs(log_id); 