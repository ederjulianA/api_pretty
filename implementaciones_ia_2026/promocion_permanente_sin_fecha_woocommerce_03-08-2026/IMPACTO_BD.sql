-- =============================================================
-- SCRIPT DE IMPACTO: Promoción permanente sin fecha de cierre
-- Fecha: 03/08/2026
-- Autor: DB Explorer (revisado por: Eder)
-- IMPORTANTE: Ejecutar en ambiente de DESARROLLO primero
-- =============================================================

-- CONTEXTO:
-- pro_fecha_fin es NOT NULL y se usa en >6 queries con
-- "BETWEEN p.pro_fecha_inicio AND p.pro_fecha_fin" para determinar
-- si una promoción está vigente. Por eso NO se relaja a NULL (opción A):
-- un NULL en BETWEEN evalúa a NULL/falso y la promoción dejaría de
-- aplicar el precio de oferta en todo el sistema.
-- Se usa un valor centinela (9999-12-31) + nuevo flag pro_permanente,
-- siguiendo el mismo patrón que pro_activa (char(1) 'S'/'N').

-- PASO 1: Verificar estado actual (9 registros al momento de este script)
SELECT COUNT(*) FROM dbo.promociones;

-- PASO 2: Aplicar cambio de esquema
ALTER TABLE dbo.promociones
  ADD pro_permanente CHAR(1) NOT NULL CONSTRAINT DF_promociones_pro_permanente DEFAULT 'N';

-- PASO 3: Verificar resultado
SELECT TOP 5 pro_sec, pro_codigo, pro_fecha_fin, pro_permanente
FROM dbo.promociones;

-- No se requiere backfill: todas las promociones existentes (9 registros)
-- son no permanentes, el DEFAULT 'N' ya las cubre correctamente.

-- ROLLBACK (en caso de error):
-- ALTER TABLE dbo.promociones DROP CONSTRAINT DF_promociones_pro_permanente;
-- ALTER TABLE dbo.promociones DROP COLUMN pro_permanente;
