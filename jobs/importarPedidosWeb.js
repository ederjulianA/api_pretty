/**
 * jobs/importarPedidosWeb.js — SPEC-013, Tarea 3
 * Importador automático de pedidos web: cada WOO_IMPORT_INTERVALO_SEG (60 s) consulta a
 * WooCommerce los pedidos modificados desde el cursor y aplica la máquina de estados del
 * spec §4.3 sobre los documentos del ERP (REM / VTA).
 *
 *   Estado Woo                         | sin documento          | REM 'A'                    | REM 'F' + VTA 'A'
 *   -----------------------------------+------------------------+----------------------------+------------------
 *   pending (y borradores)             | nada                   | nada                       | nada
 *   on-hold                            | crear REM              | si cambió: reemplazar REM  | nada
 *   processing/completed/epayco-*      | crear REM + relevo VTA | relevo REM→VTA             | nada
 *   cancelled/failed/epayco-cancelled… | nada                   | anular REM                 | REVISION
 *   refunded/epayco-refunded           | nada                   | anular REM                 | REVISION
 *   otro                               | nada + WARN            | nada                       | nada
 *
 * Transporte: polling desde el ERP (spec §4.5). GET /wc/v3/orders?modified_after=cursor−5min
 * &dates_are_gmt=true&status=any&orderby=modified&order=asc. `status=any` a propósito: si el
 * plugin de ePayco no está activo (p. ej. en el staging) sus estados custom no están en el enum
 * de la REST y un `status=epayco-processing` devuelve 400; con `any` llegan igual y el filtro lo
 * hace la máquina de estados. `modified_after` es EXCLUSIVO (verificado el 14/sep/2026 contra
 * el staging), por eso el solape de 5 min no es opcional.
 *
 * Idempotencia: llave fac_nro_woo + índice UX_factura_woo_vigente; reprocesar un pedido nunca
 * crea documentos de más. Los pedidos con error se reintentan por id en cada ciclo (hasta 20
 * intentos → estado ERROR, visible en la pantalla) sin frenar el cursor.
 *
 * Modo simulación (WOO_IMPORT_MODO=simulacion): recorre y mapea todo, escribe woo_pedidos con
 * estado_erp='SIMULADO' y en ultima_accion lo que HABRÍA hecho; no toca factura ni Woo ni crea
 * clientes. Es el primer despliegue (spec §7, fase 2).
 */
import { getWcApi } from '../services/wooClient.js';
import { mapearPedidoWoo, resolverNitSec, lineasDifieren, CLASIFICACION } from '../services/wooPedidoMapper.js';
import {
  ESTADO_ERP, NOMBRE_CURSOR_IMPORTADOR,
  obtenerDocumentosPedidoWoo, obtenerLineasDocumento, upsertWooPedido, obtenerWooPedido,
  tomarLockCursor, renovarLockCursor, liberarLockCursor, avanzarCursor, obtenerCursor,
  crearRemision, facturarRemision, anularRemision, calcularVencimiento,
  evaluarSaldoParaLineas, textoAlertaSaldo, articulosSinSaldoDeDocumento
} from '../models/pedidosWebModel.js';
import { poolPromise, sql } from '../db.js';

// ---------------------------------------------------------------------------
// Configuración (se lee en cada ciclo para poder cambiar el modo sin reiniciar la lectura del código,
// aunque en la práctica el .env solo se relee al reiniciar pm2)
// ---------------------------------------------------------------------------
export const config = () => ({
  enabled: String(process.env.WOO_IMPORT_ENABLED || 'false').toLowerCase() === 'true',
  modo: String(process.env.WOO_IMPORT_MODO || 'simulacion').toLowerCase() === 'real' ? 'real' : 'simulacion',
  intervaloSeg: Math.max(15, parseInt(process.env.WOO_IMPORT_INTERVALO_SEG || '60', 10)),
  solapeMin: Math.max(0, parseInt(process.env.WOO_IMPORT_SOLAPE_MIN || '5', 10)),
  maxIntentos: Math.max(1, parseInt(process.env.WOO_IMPORT_MAX_INTENTOS || '20', 10)),
  usuario: process.env.WOO_IMPORT_USUARIO || 'SISTEMA',
  timeoutMs: 60000
});

const log = (nivel, msg, datos) => {
  const linea = `[${new Date().toISOString()}] [${nivel}] [IMPORT-WEB] ${msg}`;
  if (datos !== undefined) console.log(linea, typeof datos === 'string' ? datos : JSON.stringify(datos));
  else console.log(linea);
};

const fmtGmt = (d) => new Date(d).toISOString().slice(0, 19); // 'YYYY-MM-DDTHH:mm:ss' para la REST con dates_are_gmt=true

// ---------------------------------------------------------------------------
// Lectura de Woo
// ---------------------------------------------------------------------------
const leerPedidosModificados = async (cursorGmt, cfg) => {
  const api = getWcApi({ timeoutMs: cfg.timeoutMs });
  const desde = new Date(new Date(cursorGmt).getTime() - cfg.solapeMin * 60 * 1000);
  const pedidos = [];
  let page = 1;
  let totalPages = 1;
  do {
    const r = await api.get('orders', {
      modified_after: fmtGmt(desde),
      dates_are_gmt: true,
      status: 'any',
      per_page: 100,
      page,
      orderby: 'modified',
      order: 'asc'
    });
    if (!Array.isArray(r.data)) throw new Error('Respuesta inválida de WooCommerce (orders)');
    pedidos.push(...r.data);
    totalPages = parseInt(r.headers?.['x-wp-totalpages'] || '1', 10) || 1;
    page++;
  } while (page <= totalPages && page <= 20); // 2.000 pedidos por ciclo es más que suficiente
  // Orden estable por fecha de modificación (Woo ya lo manda así; se garantiza igual)
  pedidos.sort((a, b) => String(a.date_modified_gmt).localeCompare(String(b.date_modified_gmt)) || (a.id - b.id));
  return { pedidos, desde };
};

const leerPedidoPorId = async (id, cfg) => {
  const api = getWcApi({ timeoutMs: cfg.timeoutMs });
  const r = await api.get(`orders/${id}`);
  return r.data;
};

// ---------------------------------------------------------------------------
// Máquina de estados (spec §4.3)
// ---------------------------------------------------------------------------
/**
 * Decide qué hacer con un pedido dado su estado en Woo y sus documentos en el ERP.
 * Devuelve un plan { accion, motivo } sin ejecutar nada (se usa igual en simulación y en real).
 *   acciones: NADA | CREAR_REM | CREAR_REM_Y_FACTURAR | FACTURAR | ANULAR_REM | REEMPLAZAR_REM | REVISION | BLOQUEADO_COT
 */
export const decidirAccion = ({ clasificacion, docs, lineasCambiaron = false }) => {
  const { rem_activa, vta_activa, cot_activa } = docs;

  if (vta_activa && rem_activa) {
    return { accion: 'REVISION', motivo: `REM ${rem_activa.fac_nro} activa y VTA ${vta_activa.fac_nro} activa a la vez: doble descuento, revisar` };
  }

  switch (clasificacion) {
    case CLASIFICACION.SIN_COMPROMISO:
      return { accion: 'NADA', motivo: 'Woo no ha comprometido stock (pending/borrador)' };

    case CLASIFICACION.PENDIENTE_PAGO:
      if (vta_activa) return { accion: 'NADA', motivo: `ya facturado en ${vta_activa.fac_nro}` };
      if (rem_activa) {
        if (lineasCambiaron) return { accion: 'REEMPLAZAR_REM', motivo: `pedido editado en Woo: reemplazar ${rem_activa.fac_nro}` };
        return { accion: 'NADA', motivo: `REM ${rem_activa.fac_nro} ya activa` };
      }
      if (cot_activa) return { accion: 'BLOQUEADO_COT', motivo: `existe ${cot_activa.fac_nro} (COT legada sin facturar); facturarla o anularla en el ERP antes de que el importador cree la REM` };
      return { accion: 'CREAR_REM', motivo: 'pedido en espera de pago' };

    case CLASIFICACION.PAGADO:
      if (vta_activa) return { accion: 'NADA', motivo: `ya facturado en ${vta_activa.fac_nro}` };
      if (rem_activa) return { accion: 'FACTURAR', motivo: `pago confirmado en Woo: relevo ${rem_activa.fac_nro} → VTA` };
      if (cot_activa) return { accion: 'BLOQUEADO_COT', motivo: `existe ${cot_activa.fac_nro} (COT legada sin facturar); facturarla desde el ERP` };
      return { accion: 'CREAR_REM_Y_FACTURAR', motivo: 'pedido ya pagado sin documento: REM + VTA en la misma corrida' };

    case CLASIFICACION.CANCELADO:
    case CLASIFICACION.REEMBOLSADO:
      if (vta_activa) return { accion: 'REVISION', motivo: `pedido ${clasificacion.toLowerCase()} en Woo pero ${vta_activa.fac_nro} sigue activa: una persona decide la devolución` };
      if (rem_activa) return { accion: 'ANULAR_REM', motivo: `pedido ${clasificacion.toLowerCase()} en Woo` };
      return { accion: 'NADA', motivo: `pedido ${clasificacion.toLowerCase()} sin documento en el ERP` };

    default:
      return { accion: 'NADA', motivo: 'estado de Woo desconocido (se registra y no se toca nada)', warn: true };
  }
};

/** estado_erp que corresponde a los documentos actuales (para filas sin acción). */
const estadoDesdeDocs = (docs) => {
  if (docs.vta_activa) return ESTADO_ERP.FACTURADO;
  if (docs.rem_activa) return ESTADO_ERP.REM_ACTIVA;
  if (docs.rem_anulada) return ESTADO_ERP.ANULADO; // el pedido tuvo REM y se anuló: no es "sin documento"
  return ESTADO_ERP.SIN_DOC;
};

/** REM de referencia para la fila de seguimiento: activa > facturada > anulada más reciente. */
const remDeReferencia = (docs) => docs.rem_activa?.fac_nro || docs.rem_facturada?.fac_nro || docs.rem_anulada?.fac_nro || null;

// ---------------------------------------------------------------------------
// Procesamiento de un pedido
// ---------------------------------------------------------------------------
const descripcionLineas = (mapeo) => mapeo.detalles.map((d) => `${d.art_cod}×${d.kar_uni}`).join(', ');

/**
 * Procesa un pedido (JSON de Woo). Nunca lanza: devuelve { ok, accion, detalle } y deja la fila en woo_pedidos.
 */
export const procesarPedido = async (order, cfg, { previo = null } = {}) => {
  const base = {
    woo_order_id: Number(order.id),
    woo_status: String(order.status || ''),
    woo_modified_gmt: order.date_modified_gmt || null,
    woo_created_gmt: order.date_created_gmt || null,
    woo_total: parseFloat(order.total) || 0,
    woo_payment_method: order.payment_method || null,
    woo_cliente: `${order.billing?.first_name || ''} ${order.billing?.last_name || ''}`.trim() || null,
    woo_email: order.billing?.email || null
  };
  const intentosPrevios = previo?.intentos || 0;

  try {
    const mapeo = await mapearPedidoWoo(order);
    const docs = await obtenerDocumentosPedidoWoo(mapeo.fac_nro_woo);

    let lineasCambiaron = false;
    if (docs.rem_activa && mapeo.clasificacion === CLASIFICACION.PENDIENTE_PAGO && mapeo.errores.length === 0) {
      const lineasRem = await obtenerLineasDocumento(docs.rem_activa.fac_sec);
      lineasCambiaron = lineasDifieren(lineasRem, mapeo.detalles);
    }

    const plan = decidirAccion({ clasificacion: mapeo.clasificacion, docs, lineasCambiaron });
    if (plan.warn) log('WARN', `Pedido #${mapeo.fac_nro_woo} con estado Woo desconocido "${mapeo.estado_woo}"`);

    // Acciones que necesitan crear documento exigen mapeo completo (spec §4.6: nunca REM parcial)
    const requiereMapeo = ['CREAR_REM', 'CREAR_REM_Y_FACTURAR', 'REEMPLAZAR_REM'].includes(plan.accion);
    if (requiereMapeo && mapeo.errores.length > 0) {
      const intentos = intentosPrevios + 1;
      const agotado = intentos >= cfg.maxIntentos;
      await upsertWooPedido({
        ...base,
        estado_erp: agotado ? ESTADO_ERP.ERROR : (cfg.modo === 'simulacion' ? ESTADO_ERP.SIMULADO : estadoDesdeDocs(docs)),
        error: `No se puede crear la REM: ${mapeo.errores.join('; ')}`,
        ultima_accion: `${plan.accion} pendiente por líneas sin mapear (intento ${intentos}/${cfg.maxIntentos})`,
        intentos
      });
      log('WARN', `#${mapeo.fac_nro_woo}: líneas sin mapear (${intentos}/${cfg.maxIntentos})`, mapeo.errores);
      return { ok: false, accion: plan.accion, detalle: mapeo.errores.join('; ') };
    }

    // ----- Modo simulación: describir, no ejecutar -----
    if (cfg.modo === 'simulacion') {
      const cliente = mapeo.cliente.nuevo ? `cliente NUEVO (${mapeo.cliente.email})` : `cliente nit_sec=${mapeo.cliente.nit_sec}`;
      const lineas = mapeo.detalles.length ? ` líneas [${descripcionLineas(mapeo)}]` : '';
      let alertaSim = null;
      if (requiereMapeo) {
        try { alertaSim = textoAlertaSaldo(await evaluarSaldoParaLineas(mapeo.detalles)); } catch (e) { /* solo informativo */ }
      }
      const texto = {
        NADA: `Sin acción: ${plan.motivo}`,
        CREAR_REM: `Habría creado REM (${cliente};${lineas}; lista ${mapeo.lis_pre_cod}; total Woo ${mapeo.total_woo}) y empujado stock (REM_CREADA)`,
        CREAR_REM_Y_FACTURAR: `Habría creado REM + VTA por relevo (${cliente};${lineas}; total Woo ${mapeo.total_woo}) y empujado stock (REM_FACTURADA)`,
        FACTURAR: `Habría facturado ${docs.rem_activa?.fac_nro} → VTA por relevo (REM_FACTURADA)`,
        ANULAR_REM: `Habría anulado ${docs.rem_activa?.fac_nro} (REM_ANULADA): ${plan.motivo}`,
        REEMPLAZAR_REM: `Habría anulado ${docs.rem_activa?.fac_nro} y creado una REM nueva con${lineas}`,
        REVISION: `Marcaría REVISIÓN: ${plan.motivo}`,
        BLOQUEADO_COT: `Bloqueado: ${plan.motivo}`
      }[plan.accion] || `Acción ${plan.accion}: ${plan.motivo}`;
      await upsertWooPedido({
        ...base,
        estado_erp: ESTADO_ERP.SIMULADO,
        fac_nro_rem: remDeReferencia(docs),
        fac_nro_vta: docs.vta_activa?.fac_nro || null,
        error: mapeo.errores.length ? mapeo.errores.join('; ') : null,
        alerta: requiereMapeo ? alertaSim : undefined,
        ultima_accion: `[SIMULACIÓN] ${texto}${alertaSim ? ` — ⚠ ${alertaSim}` : ''}`,
        intentos: 0
      });
      return { ok: true, accion: plan.accion, detalle: texto, simulado: true };
    }

    // ----- Modo real -----
    let fila = { ...base, error: null, intentos: 0 };
    let fac_nro_rem = remDeReferencia(docs);
    let fac_nro_vta = docs.vta_activa?.fac_nro || null;
    let ultima_accion = '';

    const crear = async () => {
      const { nit_sec } = await resolverNitSec(mapeo.cliente, { crear: true });
      const rem = await crearRemision({ mapeo, nit_sec, usuario: cfg.usuario });
      fac_nro_rem = rem.fac_nro;
      // Alerta de inventario (spec §4.6): la REM ya existe y Woo ya recibió el negativo; se deja
      // la marca para revisión humana. null limpia una alerta anterior (p. ej. REM reemplazada).
      fila.alerta = rem.alerta || null;
      if (rem.alerta) log('WARN', `#${mapeo.fac_nro_woo} ${rem.fac_nro}: ${rem.alerta}`);
      return rem;
    };

    switch (plan.accion) {
      case 'NADA':
        ultima_accion = `Sin acción: ${plan.motivo}`;
        fila.estado_erp = estadoDesdeDocs(docs); // vence_el no se toca: conserva el ya fijado
        break;

      case 'CREAR_REM': {
        const rem = await crear();
        fila.estado_erp = ESTADO_ERP.REM_ACTIVA;
        fila.vence_el = calcularVencimiento();
        ultima_accion = `REM ${rem.fac_nro} creada (${descripcionLineas(mapeo)}); push ${rem.push?.ok ? 'OK' : 'con pendientes'}${rem.alerta ? ' — ⚠ stock insuficiente' : ''}`;
        break;
      }

      case 'CREAR_REM_Y_FACTURAR': {
        const rem = await crear();
        const vta = await facturarRemision({ fac_nro_rem: rem.fac_nro, usuario: cfg.usuario, notificarWoo: false });
        fac_nro_vta = vta.fac_nro_vta;
        fila.estado_erp = ESTADO_ERP.FACTURADO;
        fila.vence_el = null;
        ultima_accion = `REM ${rem.fac_nro} creada y facturada en ${vta.fac_nro_vta} (pago ya confirmado en Woo: ${mapeo.estado_woo})${rem.alerta ? ' — ⚠ stock insuficiente' : ''}`;
        break;
      }

      case 'FACTURAR': {
        const vta = await facturarRemision({ fac_nro_rem: docs.rem_activa.fac_nro, usuario: cfg.usuario, notificarWoo: false });
        fac_nro_vta = vta.fac_nro_vta;
        fila.estado_erp = ESTADO_ERP.FACTURADO;
        fila.vence_el = null;
        ultima_accion = vta.ya_facturada
          ? `${docs.rem_activa.fac_nro} ya estaba facturada en ${vta.fac_nro_vta}`
          : `Relevo ${docs.rem_activa.fac_nro} → ${vta.fac_nro_vta} (pago confirmado en Woo: ${mapeo.estado_woo})`;
        break;
      }

      case 'ANULAR_REM': {
        await anularRemision({ fac_nro_rem: docs.rem_activa.fac_nro, motivo: `Pedido web #${mapeo.fac_nro_woo} ${mapeo.estado_woo} en Woo`, usuario: cfg.usuario, notificarWoo: false });
        fila.estado_erp = ESTADO_ERP.ANULADO;
        fila.vence_el = null;
        fila.alerta = null; // el stock volvió
        ultima_accion = `REM ${docs.rem_activa.fac_nro} anulada: pedido ${mapeo.estado_woo} en Woo`;
        break;
      }

      case 'REEMPLAZAR_REM': {
        const vieja = docs.rem_activa.fac_nro;
        await anularRemision({ fac_nro_rem: vieja, motivo: `Reemplazada por edición del pedido web #${mapeo.fac_nro_woo} en Woo`, usuario: cfg.usuario, notificarWoo: false });
        const rem = await crear();
        fila.estado_erp = ESTADO_ERP.REM_ACTIVA;
        fila.vence_el = previo?.vence_el ?? calcularVencimiento();
        ultima_accion = `REM ${vieja} reemplazada por ${rem.fac_nro} (pedido editado en Woo: ${descripcionLineas(mapeo)})`;
        break;
      }

      case 'REVISION':
        fila.estado_erp = ESTADO_ERP.REVISION;
        fila.error = plan.motivo;
        ultima_accion = `Marcado para revisión: ${plan.motivo}`;
        log('WARN', `#${mapeo.fac_nro_woo} → REVISION: ${plan.motivo}`);
        break;

      case 'BLOQUEADO_COT':
        fila.estado_erp = ESTADO_ERP.REVISION;
        fila.error = plan.motivo;
        ultima_accion = `Bloqueado: ${plan.motivo}`;
        log('WARN', `#${mapeo.fac_nro_woo} bloqueado por COT legada: ${plan.motivo}`);
        break;

      default:
        ultima_accion = `Acción no implementada: ${plan.accion}`;
        fila.estado_erp = estadoDesdeDocs(docs);
    }

    // Mantener fac_est_woo del documento vigente al día (lo leen Orders.jsx y el cierre de mes)
    await actualizarEstadoWooEnDocumentos(mapeo.fac_nro_woo, mapeo.estado_woo_normalizado);

    await upsertWooPedido({ ...fila, fac_nro_rem, fac_nro_vta, ultima_accion });
    if (plan.accion !== 'NADA') log('INFO', `#${mapeo.fac_nro_woo} ${plan.accion}: ${ultima_accion}`);
    return { ok: true, accion: plan.accion, detalle: ultima_accion };

  } catch (e) {
    const intentos = intentosPrevios + 1;
    const agotado = intentos >= cfg.maxIntentos;
    log('ERROR', `#${order.number || order.id} falló (intento ${intentos}/${cfg.maxIntentos}): ${e.message}`);
    try {
      await upsertWooPedido({
        ...base,
        estado_erp: agotado ? ESTADO_ERP.ERROR : undefined, // conserva el estado anterior mientras se reintenta
        error: e.message,
        ultima_accion: `Error (intento ${intentos}/${cfg.maxIntentos}): ${e.message}`,
        intentos
      });
    } catch (e2) {
      log('ERROR', `No se pudo registrar el error de #${order.number || order.id} en woo_pedidos: ${e2.message}`);
    }
    return { ok: false, accion: 'ERROR', detalle: e.message };
  }
};

/** fac_est_woo de las REM/VTA del pedido (vigentes o anuladas) = último estado visto en Woo (solo si cambió). */
const actualizarEstadoWooEnDocumentos = async (fac_nro_woo, estadoNormalizado) => {
  if (!estadoNormalizado) return;
  try {
    const pool = await poolPromise;
    await pool.request()
      .input('woo', sql.VarChar(15), String(fac_nro_woo))
      .input('est', sql.VarChar(50), estadoNormalizado)
      .query(`
        UPDATE dbo.factura SET fac_est_woo = @est
        WHERE fac_nro_woo = @woo AND fac_tip_cod IN ('REM', 'VTA')
          AND ISNULL(fac_est_woo, '') <> @est
      `);
  } catch (e) {
    log('WARN', `No se pudo actualizar fac_est_woo de #${fac_nro_woo}: ${e.message}`);
  }
};

// ---------------------------------------------------------------------------
// Alertas de saldo como estado vivo (spec §4.6, decisión del 14/sep/2026)
// ---------------------------------------------------------------------------
/**
 * Re-evalúa cada ciclo el saldo de las REM activas y de las filas que ya tienen alerta:
 *  - si entró la compra/ajuste que faltaba, la alerta se apaga sola;
 *  - si una venta de mostrador dejó sin saldo una REM activa creada con stock, la alerta aparece.
 * Consulta barata (solo REM_ACTIVA + filas con alerta) y nunca lanza.
 */
const revisarAlertasSaldo = async () => {
  const resumen = { revisadas: 0, nuevas: 0, resueltas: 0 };
  try {
    const pool = await poolPromise;
    const rs = await pool.request().query(`
      SELECT woo_order_id, estado_erp, fac_nro_rem, fac_nro_vta, alerta
      FROM dbo.woo_pedidos
      WHERE estado_erp = '${ESTADO_ERP.REM_ACTIVA}' OR (alerta IS NOT NULL AND estado_erp = '${ESTADO_ERP.FACTURADO}')
    `);
    for (const p of rs.recordset) {
      // El documento que carga el '-' hoy: la VTA si ya se facturó, si no la REM.
      const fac_nro = p.estado_erp === ESTADO_ERP.FACTURADO ? (p.fac_nro_vta || p.fac_nro_rem) : p.fac_nro_rem;
      if (!fac_nro) continue;
      resumen.revisadas++;
      const alertaNueva = textoAlertaSaldo(await articulosSinSaldoDeDocumento(fac_nro));
      if ((alertaNueva || null) === (p.alerta || null)) continue;
      if (alertaNueva && !p.alerta) {
        resumen.nuevas++;
        log('WARN', `#${p.woo_order_id} ${fac_nro}: ${alertaNueva}`);
        await upsertWooPedido({ woo_order_id: p.woo_order_id, alerta: alertaNueva, ultima_accion: `⚠ ${alertaNueva} (detectado después de crear la REM: venta de mostrador o ajuste)` });
      } else if (!alertaNueva && p.alerta) {
        resumen.resueltas++;
        log('INFO', `#${p.woo_order_id} ${fac_nro}: alerta de saldo resuelta (stock corregido)`);
        await upsertWooPedido({ woo_order_id: p.woo_order_id, alerta: null, ultima_accion: `Alerta de saldo resuelta: el stock ya cubre el pedido (${p.alerta.slice(0, 120)})` });
      } else {
        await upsertWooPedido({ woo_order_id: p.woo_order_id, alerta: alertaNueva }); // cambió el detalle (otro artículo, otra cantidad)
      }
    }
  } catch (e) {
    log('WARN', `No se pudieron re-evaluar las alertas de saldo: ${e.message}`);
  }
  return resumen;
};

// ---------------------------------------------------------------------------
// Ciclo
// ---------------------------------------------------------------------------
let enCurso = false;   // bandera en memoria (además del lock en BD)
let timer = null;
let ultimoResumen = null;

/**
 * Un ciclo completo: lock → reintentos por id → pedidos modificados → cursor → unlock.
 * Devuelve un resumen. Nunca lanza (deja ultimo_error en el cursor).
 */
export const ejecutarCiclo = async ({ forzar = false } = {}) => {
  const cfg = config();
  if (enCurso && !forzar) return { omitido: true, motivo: 'ciclo anterior aún en curso' };
  enCurso = true;
  const inicio = Date.now();
  const resumen = { modo: cfg.modo, inicio: new Date(inicio).toISOString(), leidos: 0, procesados: 0, conError: 0, reintentados: 0, acciones: {}, cursorAntes: null, cursorDespues: null };

  let lockTomado = false;
  try {
    const cursor = await tomarLockCursor(NOMBRE_CURSOR_IMPORTADOR);
    if (cursor === null) {
      return { omitido: true, motivo: 'lock de woo_sync_cursor ocupado (otro ciclo/instancia)' };
    }
    lockTomado = true;
    resumen.cursorAntes = new Date(cursor).toISOString();

    // 1. Reintentar por id los pedidos que quedaron con error y aún tienen intentos
    const pool = await poolPromise;
    const pendientes = await pool.request()
      .input('max', sql.Int, cfg.maxIntentos)
      .query(`SELECT woo_order_id, intentos, vence_el FROM dbo.woo_pedidos WHERE error IS NOT NULL AND estado_erp <> 'ERROR' AND estado_erp <> 'REVISION' AND intentos < @max ORDER BY actualizado_en`);
    const idsReintentados = new Set();
    for (const p of pendientes.recordset) {
      try {
        const order = await leerPedidoPorId(p.woo_order_id, cfg);
        const r = await procesarPedido(order, cfg, { previo: p });
        idsReintentados.add(Number(p.woo_order_id));
        resumen.reintentados++;
        await renovarLockCursor();
        resumen.acciones[r.accion] = (resumen.acciones[r.accion] || 0) + 1;
        if (!r.ok) resumen.conError++;
      } catch (e) {
        log('WARN', `Reintento de #${p.woo_order_id} no pudo leer el pedido: ${e.message}`);
      }
    }

    // 2. Pedidos modificados desde el cursor (con solape)
    const { pedidos } = await leerPedidosModificados(cursor, cfg);
    resumen.leidos = pedidos.length;
    let ultimoOk = null;
    for (const order of pedidos) {
      if (idsReintentados.has(Number(order.id))) { ultimoOk = order.date_modified_gmt; continue; }
      const previo = await obtenerWooPedido(order.id);
      // Saltar si ya se procesó exactamente esta versión (misma date_modified_gmt), sin error y en el
      // mismo modo: un pedido visto en simulación se vuelve a procesar al pasar a modo real.
      // REVISION guarda el motivo en `error` pero no es un fallo transitorio: solo se vuelve a mirar si Woo cambió el pedido.
      const yaAtendido = previo && (previo.error == null || previo.estado_erp === ESTADO_ERP.REVISION);
      if (yaAtendido && previo.woo_modified_gmt && order.date_modified_gmt) {
        const mismaVersion = new Date(previo.woo_modified_gmt).getTime() === new Date(`${order.date_modified_gmt}Z`).getTime();
        const mismoModo = (previo.estado_erp === ESTADO_ERP.SIMULADO) === (cfg.modo === 'simulacion');
        if (mismaVersion && mismoModo) { ultimoOk = order.date_modified_gmt; continue; }
      }
      const r = await procesarPedido(order, cfg, { previo });
      resumen.procesados++;
      resumen.acciones[r.accion] = (resumen.acciones[r.accion] || 0) + 1;
      if (!r.ok) resumen.conError++;
      // El cursor avanza aunque un pedido falle: ese pedido queda en woo_pedidos con error y se
      // reintenta por id en el siguiente ciclo (paso 1), así un pedido roto no frena a los demás.
      ultimoOk = order.date_modified_gmt;
      await renovarLockCursor();
    }
    if (ultimoOk) {
      await avanzarCursor(ultimoOk);
    }
    // 3. Alertas de saldo como estado vivo (solo tiene sentido en modo real: en simulación no hay REM)
    if (cfg.modo === 'real') resumen.alertas = await revisarAlertasSaldo();
    const c2 = await obtenerCursor();
    resumen.cursorDespues = c2 ? new Date(c2.cursor_gmt).toISOString() : null;
    resumen.duracionMs = Date.now() - inicio;
    await liberarLockCursor({ ok: true });
    lockTomado = false;
    ultimoResumen = resumen;
    if (resumen.procesados || resumen.reintentados) log('INFO', `ciclo ${cfg.modo}: ${resumen.leidos} leídos, ${resumen.procesados} procesados, ${resumen.reintentados} reintentados, ${resumen.conError} con error`, resumen.acciones);
    return resumen;
  } catch (e) {
    log('ERROR', `ciclo falló: ${e.message}`);
    resumen.error = e.message;
    resumen.duracionMs = Date.now() - inicio;
    if (lockTomado) { try { await liberarLockCursor({ ok: false, error: e.message }); } catch (_) { /* nada */ } }
    ultimoResumen = resumen;
    return resumen;
  } finally {
    enCurso = false;
  }
};

/** Arranque desde index.js, después de app.listen. */
export const iniciarImportadorPedidosWeb = () => {
  const cfg = config();
  if (!cfg.enabled) {
    log('INFO', 'WOO_IMPORT_ENABLED no es true: importador de pedidos web apagado');
    return null;
  }
  if (timer) return timer;
  log('INFO', `importador de pedidos web ACTIVO · modo=${cfg.modo} · cada ${cfg.intervaloSeg}s · solape ${cfg.solapeMin} min · usuario ${cfg.usuario}`);
  // Primer ciclo a los 5 s (deja que el pool de BD termine de conectar), luego el intervalo.
  setTimeout(() => { ejecutarCiclo().catch(() => {}); }, 5000);
  timer = setInterval(() => { ejecutarCiclo().catch(() => {}); }, cfg.intervaloSeg * 1000);
  return timer;
};

export const detenerImportadorPedidosWeb = () => {
  if (timer) { clearInterval(timer); timer = null; }
};

/** Estado para la pantalla / endpoint de salud. */
export const estadoImportador = async () => {
  const cfg = config();
  const cursor = await obtenerCursor().catch(() => null);
  const ahora = Date.now();
  const atrasoSeg = cursor?.ultimo_ok ? Math.round((ahora - new Date(cursor.ultimo_ok).getTime()) / 1000) : null;
  return {
    enabled: cfg.enabled,
    modo: cfg.modo,
    intervaloSeg: cfg.intervaloSeg,
    wc_url: (process.env.WC_URL || '').replace(/\/+$/, ''), // para enlazar el pedido en wp-admin desde la pantalla
    corriendo: timer !== null,
    enCurso,
    cursor_gmt: cursor?.cursor_gmt || null,
    ultimo_ok: cursor?.ultimo_ok || null,
    ultimo_error: cursor?.ultimo_error || null,
    locked_until: cursor?.locked_until || null,
    atraso_seg: atrasoSeg,
    // Alerta si el job lleva más de 10 min sin un ciclo OK (spec §10)
    alerta: cfg.enabled && (atrasoSeg === null || atrasoSeg > 600),
    ultimoResumen
  };
};
