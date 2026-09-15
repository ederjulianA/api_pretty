/**
 * utils/documentosUtils.js — SPEC-014
 * Reglas comunes de los documentos comerciales (COT / REM / VTA) que antes vivían repartidas
 * entre orderModel, pedidosWebModel y los jobs. ESM sin dependencias de modelos para que
 * cualquiera pueda importarlo sin crear ciclos (incidente Node 23 del 14/sep/2026).
 */
import { sql } from '../db.js';

/** Naturalezas de kardex. Solo '+' y '-' mueven vwExistencias; el resto cae en ELSE 0. */
export const NATURALEZA = Object.freeze({
  ENTRADA: '+',        // compras, ajustes de entrada
  SALIDA: '-',         // ventas, remisiones, ajustes de salida
  COTIZACION: 'C',     // cotización: no mueve kardex (además fue_cod 4 está excluido de la vista)
  RESPALDADA: 'R'      // línea de una VTA que nace de una REM: la REM ya descontó, la VTA no repite
});

/**
 * Naturaleza que le corresponde a un documento nuevo o editado por tipo (spec §5.1).
 * La VTA que nace de una REM NO pasa por aquí: la crea facturarRemision con 'R'.
 */
export const naturalezaKardex = (fac_tip_cod) => (fac_tip_cod === 'COT' ? NATURALEZA.COTIZACION : NATURALEZA.SALIDA);

/** Tipos "posteriores" a cada tipo: un documento cruzado con uno de estos activo queda bloqueado. */
export const TIPOS_POSTERIORES = Object.freeze({ COT: ['REM', 'VTA'], REM: ['VTA'], VTA: [] });

export const diasVencimientoRem = () => Math.max(1, parseInt(process.env.REM_DIAS_VENCIMIENTO || '5', 10));
export const calcularVencimientoRem = (desde = new Date()) => new Date(desde.getTime() + diasVencimientoRem() * 24 * 60 * 60 * 1000);

/**
 * Documento activo de tipo posterior cruzado con `fac_sec` (por fac_nro_origen de la cabecera).
 * COT → REM o VTA activa; REM → VTA activa; VTA → nunca. Devuelve { fac_nro, fac_tip_cod } o null.
 * @param {sql.Request|{request:Function}} ctx  pool o transacción (se crea un Request nuevo sobre él)
 */
export const destinoActivo = async (ctx, { fac_sec = null, fac_nro = null }) => {
  const req = typeof ctx.request === 'function' ? ctx.request() : new sql.Request(ctx);
  const rs = await req
    .input('fac_sec', sql.Decimal(18, 0), fac_sec)
    .input('fac_nro', sql.VarChar(20), fac_nro)
    .query(`
      SELECT TOP 1 d.fac_nro, d.fac_tip_cod
      FROM dbo.factura o
      INNER JOIN dbo.factura d ON d.fac_nro = o.fac_nro_origen AND d.fac_est_fac = 'A'
      WHERE ((@fac_sec IS NOT NULL AND o.fac_sec = @fac_sec) OR (@fac_sec IS NULL AND o.fac_nro = @fac_nro))
        AND ((o.fac_tip_cod = 'COT' AND d.fac_tip_cod IN ('REM', 'VTA'))
          OR (o.fac_tip_cod = 'REM' AND d.fac_tip_cod = 'VTA'))
    `);
  return rs.recordset[0] || null;
};

/** Error con statusCode para que los controladores respondan 4xx en vez de 500. */
export const errorNegocio = (mensaje, statusCode = 409) => {
  const e = new Error(mensaje);
  e.statusCode = statusCode;
  return e;
};
