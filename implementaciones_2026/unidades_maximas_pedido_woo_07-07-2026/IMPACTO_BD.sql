-- =============================================================
-- SCRIPT DE IMPACTO: Unidades Máximas por Pedido (sync WooCommerce)
-- Fecha: 07/07/2026
-- IMPORTANTE: Ejecutar en ambiente de DESARROLLO primero
-- =============================================================

-- PASO 1: Verificar que la columna no exista (ya confirmado: no existe)
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'articulos' AND COLUMN_NAME = 'art_max_unidades_pedido';

-- PASO 2: Aplicar cambio
ALTER TABLE dbo.articulos ADD art_max_unidades_pedido INT NULL;

-- PASO 3: Verificar resultado
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'articulos' AND COLUMN_NAME = 'art_max_unidades_pedido';

-- ROLLBACK (en caso de error):
-- ALTER TABLE dbo.articulos DROP COLUMN art_max_unidades_pedido;
