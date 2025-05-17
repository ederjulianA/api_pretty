-- Script para agregar el campo product_updates a la tabla woo_sync_logs
ALTER TABLE dbo.woo_sync_logs ADD product_updates NVARCHAR(MAX) NULL; 