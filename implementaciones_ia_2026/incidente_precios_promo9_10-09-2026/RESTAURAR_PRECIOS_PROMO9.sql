-- =============================================================
-- SCRIPT DE IMPACTO: Restaurar precios base sobrescritos en promo 9 (Mercadillo Virtual)
-- Fecha: 10/09/2026
-- Autor: DB Explorer (revisado por: Eder)
-- IMPORTANTE: Ejecutar en ambiente de DESARROLLO primero. NO ejecutado por Claude.
--
-- Causa: el lote de estimación IA de peso/dimensiones del 2026-08-12 (19:20-19:47)
-- hizo GET /api/articulos/:id -> PUT /api/articulos/:id devolviendo precio_detal /
-- precio_mayor, que ese GET entrega CON la oferta aplicada. Resultado: 34 artículos
-- de la promo 9 quedaron con detal = mayor = precio oferta en articulosdetalle.
--
-- Fuente de los valores: dbo.carga_inicial_costos (snapshot feb-2026), validada
-- contra (a) pro_det_descuento_porcentaje de la promo y (b) kar_pre_pub_detal /
-- kar_pre_pub_mayor de la última venta previa al incidente. Las 3 fuentes coinciden.
-- Ver INCIDENTE_PRECIOS_PROMO9.md en esta carpeta.
-- =============================================================

SET XACT_ABORT ON;

-- PASO 1: Backup de las filas que se van a tocar (68 filas: 34 artículos x listas 1 y 2)
IF OBJECT_ID('dbo.bak_articulosdetalle_promo9_20260910') IS NOT NULL
    DROP TABLE dbo.bak_articulosdetalle_promo9_20260910;

SELECT ad.*
INTO dbo.bak_articulosdetalle_promo9_20260910
FROM dbo.articulosdetalle ad
JOIN dbo.promociones_detalle pd ON pd.art_sec = ad.art_sec AND pd.pro_sec = 9
WHERE ad.bod_sec = '1' AND ad.lis_pre_cod IN (1, 2);

-- PASO 2: Valores a restaurar
DECLARE @restaurar TABLE (
    art_sec VARCHAR(30) NOT NULL,
    art_cod VARCHAR(30) NOT NULL,
    art_nom VARCHAR(100) NULL,
    precio_detal DECIMAL(17,2) NOT NULL,
    precio_mayor DECIMAL(17,2) NOT NULL,
    precio_oferta DECIMAL(17,2) NOT NULL
);

INSERT INTO @restaurar (art_sec, art_cod, art_nom, precio_detal, precio_mayor, precio_oferta) VALUES
    ('1046', '1879', 'TERMO MOTIVACIONAL TRIO HT 9709', 65000, 40000, 26000),
    ('1140', '3027', 'COSMETIQUERA LOVE X3', 23000, 16000, 11500),
    ('1145', '3032', 'BROCHAS X6 RUBY FACE', 15000, 9000, 7500),
    ('1171', '4025', 'Primer Spray Miss', 15000, 9000, 7500),
    ('1461', '4089', 'Polvo de Hadas Karite Brocha Ref 002', 14000, 8800, 7000),
    ('1597', '4364', 'Rubor Cremoso Cappuvini', 15000, 9500, 7500),
    ('1599', '4366', 'Lip Stick Cremoso Cappuvini', 16000, 10800, 8000),
    ('1603', '4370', 'Crema Humectante Miis', 23000, 18000, 11500),
    ('1621', '4388', 'Rubor en Crema Stick Engol', 20000, 13000, 10000),
    ('1624', '4391', 'Iluminador Compacto Alissha', 17500, 10900, 8750),
    ('1628', '4395', 'Polvo Suelto Banana o Traslucido Alissha', 25000, 15000, 14000),
    ('1632', '4399', 'Protector Solar Facial SPF 50+ Sun Scree', 45000, 28000, 22500),
    ('1639', '4406', 'Gloss Forever Kit x 8 Und Trendy', 25000, 17000, 15000),
    ('1682', '4449', 'Kit de Brochas Black x6 Para Ojos y Rost', 20000, 14500, 10000),
    ('1684', '4451', 'Diadema de Lujo Perlas Linea o Diamond B', 16000, 12000, 8000),
    ('1692', '4459', 'Kit de Brochas x10 Singalore Montoc', 49900, 38500, 34930),
    ('1703', '4470', 'Splash Disney Pixar Intensamente 2, Elsa', 29900, 23900, 14950),
    ('1705', '4472', 'Desmaquillante en Barra Delicate Miis', 22900, 15900, 11450),
    ('1706', '4473', 'Set de Rubores Liquidos x5 Love Rush Mii', 30000, 21000, 18000),
    ('1709', '4476', 'Colinia Kids Princesa Cenicienta Disney', 23000, 18000, 13800),
    ('1710', '4477', 'Crema Humectante Kids Princesa Tiana Dis', 17500, 13900, 8750),
    ('1726', '4493', 'Set De Labiales Tipo Airpod Case Corazon', 25000, 15500, 12500),
    ('1732', '4499', 'Lip Gloss Camaleon Bloomshell', 15000, 7900, 7500),
    ('1741', '4507', 'Rubor Liquido Boul 6 Tonos Kiss Beauty', 14000, 7500, 7000),
    ('1756', '4522', 'Exfoliante Corporal Stitch Trendy', 25000, 19500, 15000),
    ('1761', '4527', 'Kit Furia Intensamente (Delineador de La', 25000, 19000, 17500),
    ('1787', '4552', 'Tarjetero Stitch Trendy', 25000, 19500, 12500),
    ('1789', '4554', 'Agenda 2025 Trendy', 70000, 60000, 39000),
    ('1791', '4556', 'Borlas Intensamente Trendy', 10000, 7000, 5000),
    ('1801', '4566', 'Kit de Cejas Villanos Trendy', 25000, 19000, 15000),
    ('1803', '4568', 'Contorno y Rubor Villanos Trendy', 25000, 19000, 15000),
    ('1811', '4576', 'Mantequilla Corporal Mojito o Daiquiri M', 23000, 16000, 13800),
    ('1813', '4578', 'Gel Fijador de Cejas Cosmos Miis', 15000, 9000, 7500),
    ('1829', '4593', 'RUBOR RUBY ROSE LIQUIDO BOMBON', 27900, 18800, 13950);

-- PASO 3: Verificar estado actual (todos deben tener detal = mayor = oferta ANTES de corregir)
SELECT r.art_cod, r.art_nom,
       d1.art_bod_pre AS detal_actual, d2.art_bod_pre AS mayor_actual, r.precio_oferta,
       r.precio_detal AS detal_a_restaurar, r.precio_mayor AS mayor_a_restaurar
FROM @restaurar r
JOIN dbo.articulosdetalle d1 ON d1.art_sec = r.art_sec AND d1.bod_sec = '1' AND d1.lis_pre_cod = 1
JOIN dbo.articulosdetalle d2 ON d2.art_sec = r.art_sec AND d2.bod_sec = '1' AND d2.lis_pre_cod = 2
ORDER BY r.art_cod;

-- Guardia: si algún artículo ya no está en estado "dañado", abortar para no pisar un precio corregido a mano
IF EXISTS (
    SELECT 1 FROM @restaurar r
    JOIN dbo.articulosdetalle d1 ON d1.art_sec = r.art_sec AND d1.bod_sec = '1' AND d1.lis_pre_cod = 1
    JOIN dbo.articulosdetalle d2 ON d2.art_sec = r.art_sec AND d2.bod_sec = '1' AND d2.lis_pre_cod = 2
    WHERE d1.art_bod_pre <> r.precio_oferta OR d2.art_bod_pre <> r.precio_oferta
)
BEGIN
    RAISERROR('Hay artículos cuyo precio actual ya no es igual al precio oferta. Revisar antes de continuar.', 16, 1);
    RETURN;
END

-- PASO 4: Aplicar corrección
BEGIN TRANSACTION;

UPDATE d SET d.art_bod_pre = r.precio_detal
FROM dbo.articulosdetalle d
JOIN @restaurar r ON r.art_sec = d.art_sec
WHERE d.bod_sec = '1' AND d.lis_pre_cod = 1;
-- Esperado: 34 filas

UPDATE d SET d.art_bod_pre = r.precio_mayor
FROM dbo.articulosdetalle d
JOIN @restaurar r ON r.art_sec = d.art_sec
WHERE d.bod_sec = '1' AND d.lis_pre_cod = 2;
-- Esperado: 34 filas

COMMIT TRANSACTION;

-- PASO 5: Verificar resultado (0 filas = todo corregido)
SELECT r.art_cod, d1.art_bod_pre AS detal, d2.art_bod_pre AS mayor, r.precio_oferta
FROM @restaurar r
JOIN dbo.articulosdetalle d1 ON d1.art_sec = r.art_sec AND d1.bod_sec = '1' AND d1.lis_pre_cod = 1
JOIN dbo.articulosdetalle d2 ON d2.art_sec = r.art_sec AND d2.bod_sec = '1' AND d2.lis_pre_cod = 2
WHERE d1.art_bod_pre <= r.precio_oferta OR d2.art_bod_pre <= r.precio_oferta;

-- PASO 6 (fuera de SQL, en este orden):
--   a) Re-sincronizar precios de la promo 9 a WooCommerce (regular_price, _precio_mayorista,
--      sale_price, fechas). Guardar la promo 9 desde /promociones en pretty_front o
--      llamar el endpoint de sync de promociones. NO usar PUT /api/articulos/:id
--      para esto: ese camino reemplaza las categorías en Woo.
--   b) Restaurar la categoría 769 "Mercadillo virtual":
--        node scripts/asignar-categoria-woo-promo.js 9 769
--   c) Verificar en Woo un afectado (ej. SKU 4593): on_sale=true, regular=27900,
--      sale=13950, _precio_mayorista=18800, categoría 769 presente.

-- ROLLBACK (en caso de error, después del COMMIT):
-- UPDATE d SET d.art_bod_pre = b.art_bod_pre
-- FROM dbo.articulosdetalle d
-- JOIN dbo.bak_articulosdetalle_promo9_20260910 b
--   ON b.art_sec = d.art_sec AND b.bod_sec = d.bod_sec AND b.lis_pre_cod = d.lis_pre_cod;
