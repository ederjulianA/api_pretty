/*
  SPEC-014 — Quitar el estado 'F' de las remisiones (modelo de respaldo).
  Regla de negocio (Eder, 22/sep/2026): factura.fac_est_fac solo indica si el documento está
  Activo ('A'), Inactivo ('I') o Pendiente ('P'). "Facturada" NO es un estado: se determina por
  el vínculo cruzado (factura.fac_nro_origen ↔ el documento destino activo).

  Dos caminos, los dos neutros en inventario:

  A. REM 'F' con una VTA ACTIVA cruzada que descuenta exactamente lo mismo → modelo de respaldo:
     1. Las líneas de la VTA pasan de '-' a 'R' (respaldada: la REM ya descontó, la VTA no repite).
     2. La REM vuelve a 'A' y deja de vencer (fac_vence_el = NULL), igual que la deja facturarRemision
        en modo respaldo. Conserva fac_nro_origen (el cruce con la VTA) y su fac_obs.

  B. REM 'F' cuya VTA fue ANULADA ('I') → la remisión ya no respalda nada y su mercancía volvió al
     inventario con la anulación: pasa a 'I'. Neutro por construcción (ni 'F' ni 'I' entran en
     vwExistencias, que solo mira documentos 'A').

  Cualquier otra REM en 'F' (sin cruce, con líneas distintas a las de su VTA, etc.) NO se toca: se
  reporta como 'omitida' para decidirla a mano.

  La existencia NO cambia: vwExistencias solo suma '+' y '-' sobre documentos 'A', así que en (A) el
  descuento se mueve de la VTA a la REM y el neto por artículo queda idéntico, y en (B) no se mueve nada.

  Idempotente: si no quedan REM en 'F', no toca nada y devuelve 0 filas migradas.
  NO abre transacción: la maneja quien lo ejecuta (scripts/migrar-rem-estado-F.mjs), para poder
  correrlo en seco y revertir. Ejecutarlo suelto aplica los cambios sin red de seguridad.

  Devuelve un único result set: una fila por REM, con accion = 'respaldo' | 'anulada' | 'omitida' + motivo.
*/
SET NOCOUNT ON;

IF OBJECT_ID('tempdb..#diag') IS NOT NULL DROP TABLE #diag;
IF OBJECT_ID('tempdb..#pares') IS NOT NULL DROP TABLE #pares;

-- Cada REM en 'F' con su VTA cruzada (si la tiene) y el motivo por el que NO se puede migrar.
-- motivo NULL = pasa todas las verificaciones.
SELECT
    r.fac_sec  AS rem_sec,
    r.fac_nro  AS rem_nro,
    r.fac_nro_woo,
    v.fac_sec  AS vta_sec,
    v.fac_nro  AS vta_nro,
    CASE
        -- Caso B: la VTA que la relevó fue anulada; la REM no respalda nada y su mercancía ya volvió.
        WHEN v.fac_sec IS NULL AND anul.fac_sec IS NOT NULL THEN NULL
        WHEN v.fac_sec IS NULL
            THEN 'sin VTA activa cruzada: fac_nro_origen no apunta a una VTA en estado A'
        WHEN NOT EXISTS (SELECT 1 FROM dbo.facturakardes k WHERE k.fac_sec = v.fac_sec)
            THEN 'la VTA no tiene lineas'
        WHEN EXISTS (SELECT 1 FROM dbo.facturakardes k WHERE k.fac_sec = v.fac_sec AND k.kar_nat <> '-')
            THEN 'la VTA tiene lineas con naturaleza distinta de -'
        WHEN EXISTS (SELECT 1 FROM dbo.facturakardes k WHERE k.fac_sec = r.fac_sec AND k.kar_nat <> '-')
            THEN 'la REM tiene lineas con naturaleza distinta de -'
        WHEN EXISTS (
                SELECT k.art_sec, SUM(k.kar_uni) AS u FROM dbo.facturakardes k WHERE k.fac_sec = r.fac_sec GROUP BY k.art_sec
                EXCEPT
                SELECT k.art_sec, SUM(k.kar_uni)      FROM dbo.facturakardes k WHERE k.fac_sec = v.fac_sec GROUP BY k.art_sec)
          OR EXISTS (
                SELECT k.art_sec, SUM(k.kar_uni) AS u FROM dbo.facturakardes k WHERE k.fac_sec = v.fac_sec GROUP BY k.art_sec
                EXCEPT
                SELECT k.art_sec, SUM(k.kar_uni)      FROM dbo.facturakardes k WHERE k.fac_sec = r.fac_sec GROUP BY k.art_sec)
            THEN 'REM y VTA no descuentan lo mismo articulo por articulo'
        ELSE NULL
    END AS motivo,
    CASE WHEN v.fac_sec IS NULL AND anul.fac_sec IS NOT NULL THEN 'anulada' ELSE 'respaldo' END AS camino
INTO #diag
FROM dbo.factura r
LEFT JOIN dbo.factura v
       ON v.fac_nro = r.fac_nro_origen
      AND v.fac_tip_cod = 'VTA'
      AND v.fac_est_fac = 'A'
LEFT JOIN dbo.factura anul
       ON anul.fac_nro = r.fac_nro_origen
      AND anul.fac_tip_cod = 'VTA'
      AND anul.fac_est_fac = 'I'
WHERE r.fac_tip_cod = 'REM'
  AND r.fac_est_fac = 'F';

SELECT rem_sec, rem_nro, vta_sec, vta_nro INTO #pares
FROM #diag WHERE motivo IS NULL AND camino = 'respaldo';

-- A.1 La VTA deja de descontar: sus líneas pasan a 'R'.
UPDATE k
   SET k.kar_nat = 'R'
  FROM dbo.facturakardes k
 INNER JOIN #pares p ON p.vta_sec = k.fac_sec;

-- A.2 La REM vuelve a ser el movimiento vigente: 'A' y sin vencimiento.
UPDATE f
   SET f.fac_est_fac     = 'A',
       f.fac_vence_el    = NULL,
       f.fac_usu_cod_mod = 'MIGRA_SPEC014',
       f.fac_fch_mod     = GETDATE()
  FROM dbo.factura f
 INNER JOIN #pares p ON p.rem_sec = f.fac_sec;

-- B. REM cuya VTA fue anulada: el documento queda inactivo (no movía kardex en 'F' ni lo mueve en 'I').
UPDATE f
   SET f.fac_est_fac     = 'I',
       f.fac_vence_el    = NULL,
       f.fac_obs         = LEFT(CONCAT(ISNULL(f.fac_obs, ''), ' | inactivada por SPEC-014: su factura fue anulada'), 1024),
       f.fac_usu_cod_mod = 'MIGRA_SPEC014',
       f.fac_fch_mod     = GETDATE()
  FROM dbo.factura f
 INNER JOIN #diag d ON d.rem_sec = f.fac_sec
 WHERE d.motivo IS NULL AND d.camino = 'anulada';

SELECT
    CASE WHEN motivo IS NOT NULL THEN 'omitida' ELSE camino END AS accion,
    rem_nro, vta_nro, fac_nro_woo, motivo
FROM #diag
ORDER BY accion, rem_nro;

DROP TABLE #pares;
DROP TABLE #diag;
