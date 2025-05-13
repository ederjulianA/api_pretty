-- Actualizar el fac_nro_origen en factura table basado en kar_fac_sec_ori
UPDATE f
SET f.fac_nro_origen = fo.fac_nro
FROM dbo.factura f
INNER JOIN dbo.facturakardes fk ON f.fac_sec = fk.fac_sec
INNER JOIN dbo.factura fo ON fk.kar_fac_sec_ori = fo.fac_sec
WHERE fk.kar_fac_sec_ori IS NOT NULL
  AND fo.fac_est_fac = 'A';

-- Verificar la actualización
SELECT f.fac_nro, f.fac_nro_origen, fk.kar_fac_sec_ori, fo.fac_nro as expected_fac_nro,
       f.fac_est_fac as current_doc_status, fo.fac_est_fac as origin_doc_status
FROM dbo.factura f
INNER JOIN dbo.facturakardes fk ON f.fac_sec = fk.fac_sec
INNER JOIN dbo.factura fo ON fk.kar_fac_sec_ori = fo.fac_sec
WHERE fk.kar_fac_sec_ori IS NOT NULL
  AND fo.fac_est_fac = 'A'
ORDER BY f.fac_nro;

-- Actualizar el fac_nro_origen en las cotizaciones con el número de factura generado
UPDATE f_cot
SET f_cot.fac_nro_origen = f_vta.fac_nro
FROM dbo.factura f_cot  -- Tabla de cotizaciones
INNER JOIN dbo.facturakardes fk ON fk.kar_fac_sec_ori = f_cot.fac_sec  -- Detalles que apuntan a la cotización
INNER JOIN dbo.factura f_vta ON f_vta.fac_sec = fk.fac_sec  -- Facturas que se generaron
WHERE f_cot.fac_tip_cod = 'COT'  -- Solo cotizaciones
  AND f_vta.fac_tip_cod = 'VTA'  -- Solo facturas de venta
  AND f_vta.fac_est_fac = 'A'    -- Solo facturas activas
  AND fk.kar_fac_sec_ori IS NOT NULL;

-- Verificar la actualización
SELECT 
    f_cot.fac_nro as cotizacion,
    f_cot.fac_nro_origen as factura_generada,
    f_vta.fac_nro as numero_factura,
    f_cot.fac_est_fac as estado_cotizacion,
    f_vta.fac_est_fac as estado_factura
FROM dbo.factura f_cot
INNER JOIN dbo.facturakardes fk ON fk.kar_fac_sec_ori = f_cot.fac_sec
INNER JOIN dbo.factura f_vta ON f_vta.fac_sec = fk.fac_sec
WHERE f_cot.fac_tip_cod = 'COT'
  AND f_vta.fac_tip_cod = 'VTA'
  AND f_vta.fac_est_fac = 'A'
  AND fk.kar_fac_sec_ori IS NOT NULL
ORDER BY f_cot.fac_nro; 