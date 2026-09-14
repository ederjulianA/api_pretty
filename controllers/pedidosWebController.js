/**
 * controllers/pedidosWebController.js — SPEC-013, Fase 2 (Tareas 4, 5 y pantalla mínima de la Tarea 8)
 * Endpoints de la pantalla "Pedidos web". Todas las rutas llevan verifyToken (routes/pedidosWebRoutes.js).
 */
import {
  listarPedidosWeb, contarPedidosWebPorEstado, facturarRemision, anularRemision, fijarCursor, obtenerDocumentosPedidoWoo, obtenerLineasDocumento
} from '../models/pedidosWebModel.js';
import { ejecutarCiclo, estadoImportador, config as configImportador } from '../jobs/importarPedidosWeb.js';

const usuarioDe = (req) => req.user?.usu_cod || 'SISTEMA';

/** GET /api/pedidos-web?estado=&desde=&hasta=&limite= */
export const listar = async (req, res) => {
  try {
    const { estado, desde, hasta, limite } = req.query;
    const [pedidos, conteos, salud] = await Promise.all([
      listarPedidosWeb({ estado: estado || null, desde: desde || null, hasta: hasta || null, limite: limite || 300 }),
      contarPedidosWebPorEstado(),
      estadoImportador()
    ]);
    res.json({ success: true, pedidos, conteos, salud });
  } catch (error) {
    console.error('[PEDIDOS_WEB] listar:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

/** GET /api/pedidos-web/salud */
export const salud = async (req, res) => {
  try {
    res.json({ success: true, salud: await estadoImportador() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/** GET /api/pedidos-web/:woo_order_id/documentos — REM/VTA/COT del pedido con sus líneas (detalle de la pantalla). */
export const documentos = async (req, res) => {
  try {
    const docs = await obtenerDocumentosPedidoWoo(req.params.woo_order_id);
    const conLineas = [];
    for (const d of docs.todos) {
      conLineas.push({ ...d, lineas: await obtenerLineasDocumento(d.fac_sec) });
    }
    res.json({ success: true, documentos: conLineas });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * POST /api/pedidos-web/:fac_nro_rem/facturar — confirmar pago desde el ERP (Tarea 4).
 * Crea la VTA por relevo y pasa el pedido Woo a `processing` con nota.
 */
export const facturar = async (req, res) => {
  const { fac_nro_rem } = req.params;
  try {
    const r = await facturarRemision({ fac_nro_rem, usuario: usuarioDe(req), notificarWoo: true });
    res.json({
      success: true,
      ...r,
      message: r.ya_facturada
        ? `La remisión ${fac_nro_rem} ya estaba facturada en ${r.fac_nro_vta}`
        : `Remisión ${fac_nro_rem} facturada en ${r.fac_nro_vta}${r.estadoWoo && !r.estadoWoo.ok ? ` — ATENCIÓN: el pedido Woo no pasó a "processing" (${r.estadoWoo.error})` : ''}`
    });
  } catch (error) {
    console.error(`[PEDIDOS_WEB] facturar ${fac_nro_rem}:`, error.message);
    res.status(400).json({ success: false, error: error.message });
  }
};

/** POST /api/pedidos-web/:fac_nro_rem/anular  body {motivo} — Tarea 5. Cancela también el pedido en Woo. */
export const anular = async (req, res) => {
  const { fac_nro_rem } = req.params;
  const motivo = (req.body?.motivo || '').trim();
  if (!motivo) return res.status(400).json({ success: false, error: 'El motivo es obligatorio' });
  try {
    const r = await anularRemision({ fac_nro_rem, motivo, usuario: usuarioDe(req), notificarWoo: true });
    res.json({
      success: true,
      ...r,
      message: r.ya_anulada ? `La remisión ${fac_nro_rem} ya estaba anulada` : `Remisión ${fac_nro_rem} anulada y pedido Woo cancelado`
    });
  } catch (error) {
    console.error(`[PEDIDOS_WEB] anular ${fac_nro_rem}:`, error.message);
    res.status(400).json({ success: false, error: error.message });
  }
};

/**
 * POST /api/pedidos-web/importar-ahora — ejecuta un ciclo del importador sin esperar al intervalo.
 * Respeta WOO_IMPORT_MODO. Útil para probar y para "traer ya" un pedido desde la pantalla.
 * body opcional {cursor: 'YYYY-MM-DDTHH:mm:ssZ'} reposiciona el cursor antes (soporte).
 */
export const importarAhora = async (req, res) => {
  try {
    if (req.body?.cursor) {
      const d = await fijarCursor(req.body.cursor);
      console.log(`[PEDIDOS_WEB] cursor reposicionado a ${d.toISOString()} por ${usuarioDe(req)}`);
    }
    const resumen = await ejecutarCiclo({ forzar: false });
    res.json({ success: !resumen.error, modo: configImportador().modo, resumen });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
