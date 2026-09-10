/**
 * controllers/cierreMesController.js
 *
 * Proceso de Cierre de Mes: valida el periodo, resuelve pedidos y cotizaciones
 * pendientes, y congela ventas y comisiones por canal para auditoria.
 */

const WooCommerceRestApi = require('@woocommerce/woocommerce-rest-api').default;

const cierreMesModel = require('../models/cierreMesModel');
const { obtenerPorcentajesComision } = require('../utils/comisionUtils');
// orderModel es ESM; se consume via require igual que en orderController.
const { createCompleteOrder, getOrder } = require('../models/orderModel');
const { validarBundles, validarExistenciasVTA } = require('./orderController');
const { syncDocumentStockToWoo } = require('../utils/wooStockSync');

const wcApi = new WooCommerceRestApi({
  url: process.env.WC_URL,
  consumerKey: process.env.WC_CONSUMER_KEY,
  consumerSecret: process.env.WC_CONSUMER_SECRET,
  version: 'wc/v3'
});

/* ==========================================================================
   HELPERS
   ========================================================================== */

/**
 * Normaliza el estado de WooCommerce para persistirlo: guiones a guiones bajos.
 * Misma regla que syncWooOrdersController, replicada aqui porque ese modulo es
 * ESM y no exporta la funcion.
 */
const normalizarEstadoWoo = (estado) =>
  (typeof estado === 'string' ? estado.replace(/-/g, '_') : estado);

/** Estado tal como lo espera la REST API de WooCommerce: guiones. */
const desnormalizarEstadoWoo = (estado) =>
  (typeof estado === 'string' ? estado.replace(/_/g, '-') : estado);

/**
 * Valida y normaliza los query params anio/mes.
 * @returns {{ok: true, anio: number, mes: number} | {ok: false, error: string}}
 */
const parsearPeriodo = (anioRaw, mesRaw) => {
  const anio = Number.parseInt(anioRaw, 10);
  const mes = Number.parseInt(mesRaw, 10);

  if (!Number.isInteger(anio) || anio < 2000 || anio > 2999) {
    return { ok: false, error: 'El parametro anio es requerido y debe estar entre 2000 y 2999' };
  }
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    return { ok: false, error: 'El parametro mes es requerido y debe estar entre 1 y 12' };
  }
  return { ok: true, anio, mes };
};

/**
 * Valida un array de fac_secs de entrada.
 * @returns {{ok: true, valores: number[]} | {ok: false, error: string}}
 */
const parsearFacSecs = (fac_secs) => {
  if (!Array.isArray(fac_secs) || fac_secs.length === 0) {
    return { ok: false, error: 'fac_secs debe ser un arreglo no vacio' };
  }

  const valores = [];
  for (const raw of fac_secs) {
    const valor = Number(raw);
    if (!Number.isFinite(valor) || valor <= 0) {
      return { ok: false, error: `fac_sec invalido: ${JSON.stringify(raw)}` };
    }
    valores.push(valor);
  }
  // Duplicados en la peticion procesarian el mismo documento dos veces.
  return { ok: true, valores: [...new Set(valores)] };
};

const OBSERVACION_MINIMA = 10;

const validarObservacion = (texto, campo) => {
  if (typeof texto !== 'string' || texto.trim().length < OBSERVACION_MINIMA) {
    return `${campo} es obligatorio y debe tener al menos ${OBSERVACION_MINIMA} caracteres`;
  }
  return null;
};

/** Usuario autenticado; el token siempre trae usu_cod (ver authController). */
const usuarioDe = (req) => req.user?.usu_cod || 'SISTEMA';

/* ==========================================================================
   2.1 GET /api/cierre-mes
   ========================================================================== */

const listarCierresEndpoint = async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 20));

    const { data, total } = await cierreMesModel.listarCierres({ page, pageSize });

    return res.json({
      success: true,
      data,
      pagination: { page, pageSize, total }
    });
  } catch (error) {
    console.error('[CIERRE_MES_LISTAR] Error:', error.message, error.stack);
    return res.status(500).json({ success: false, error: error.message });
  }
};

/* ==========================================================================
   2.2 GET /api/cierre-mes/:cie_sec
   ========================================================================== */

const obtenerCierreEndpoint = async (req, res) => {
  try {
    const cie_sec = Number.parseInt(req.params.cie_sec, 10);
    if (!Number.isInteger(cie_sec) || cie_sec <= 0) {
      return res.status(400).json({ success: false, error: 'cie_sec invalido' });
    }

    const cierre = await cierreMesModel.obtenerCierre(cie_sec);
    if (!cierre) {
      return res.status(404).json({ success: false, error: `No existe el cierre ${cie_sec}` });
    }

    return res.json({ success: true, data: cierre });
  } catch (error) {
    console.error('[CIERRE_MES_DETALLE] Error:', error.message, error.stack);
    return res.status(500).json({ success: false, error: error.message });
  }
};

/* ==========================================================================
   2.3 GET /api/cierre-mes/validar
   ========================================================================== */

const validarPeriodoEndpoint = async (req, res) => {
  try {
    const periodo = parsearPeriodo(req.query.anio, req.query.mes);
    if (!periodo.ok) {
      return res.status(400).json({ success: false, error: periodo.error });
    }

    const validacion = await cierreMesModel.validarPeriodo(periodo.anio, periodo.mes);
    return res.json({ success: true, data: validacion });
  } catch (error) {
    console.error('[CIERRE_MES_VALIDAR] Error:', error.message, error.stack);
    return res.status(500).json({ success: false, error: error.message });
  }
};

/* ==========================================================================
   3. GET /api/cierre-mes/preflight
   ========================================================================== */

/** Estados de WooCommerce que se cuentan al conciliar el mes (formato Woo, con guiones). */
const ESTADOS_WOO_CONCILIACION = [
  'pending', 'processing', 'completed',
  'epayco-pending', 'epayco-processing', 'epayco-completed',
  'on-hold'
];

/**
 * Slugs de estado realmente registrados en la tienda.
 *
 * WooCommerce responde 400 a toda la consulta si se le pasa un solo estado que
 * no exista; hoy 'epayco-pending' esta en la lista de conciliacion pero no
 * registrado en la tienda. Filtrar contra los estados reales evita que el
 * preflight se caiga si el plugin de pagos agrega o quita estados.
 *
 * @returns {Promise<Set<string>|null>} null si no se pudo consultar
 */
const obtenerEstadosRegistrados = async () => {
  try {
    const respuesta = await wcApi.get('reports/orders/totals');
    return new Set((respuesta.data || []).map(s => s.slug));
  } catch (error) {
    console.warn('[CIERRE_MES_PREFLIGHT] No se pudieron leer los estados de WooCommerce:', error.message);
    return null;
  }
};

/**
 * Cuenta los pedidos que WooCommerce reporta para el mes.
 *
 * Se pide una sola orden por pagina y se lee la cabecera X-WP-Total, que trae
 * el conteo completo sin descargar los pedidos.
 *
 * `after` es exclusivo en la API de Woo, por eso se retrocede un segundo desde
 * el inicio del mes para no perder un pedido creado exactamente a medianoche.
 * Las fechas se interpretan en la zona horaria de la tienda, igual que en el
 * panel de WooCommerce.
 *
 * @returns {Promise<{disponible: boolean, total: number|null, estados: string[], error: string|null}>}
 */
const contarPedidosWoo = async (anio, mes) => {
  const { inicio, fin } = cierreMesModel.rangoMes(anio, mes);
  const after = new Date(`${inicio}T00:00:00`);
  after.setSeconds(after.getSeconds() - 1);

  try {
    const registrados = await obtenerEstadosRegistrados();
    const estados = registrados
      ? ESTADOS_WOO_CONCILIACION.filter(s => registrados.has(s))
      : ESTADOS_WOO_CONCILIACION;

    if (estados.length === 0) {
      return { disponible: false, total: null, estados: [], error: 'Ningun estado de conciliacion existe en la tienda' };
    }

    const respuesta = await wcApi.get('orders', {
      after: after.toISOString().slice(0, 19),
      before: `${fin}T00:00:00`,
      // Debe ir como arreglo: WooCommerce rechaza la lista separada por comas.
      status: estados,
      per_page: 1
    });

    const total = Number.parseInt(respuesta.headers['x-wp-total'], 10);
    if (!Number.isInteger(total)) {
      return { disponible: false, total: null, estados, error: 'WooCommerce no devolvio el conteo de pedidos (X-WP-Total)' };
    }

    return { disponible: true, total, estados, error: null };
  } catch (error) {
    const detalle = error.response?.data?.message || error.message;
    console.error('[CIERRE_MES_PREFLIGHT] WooCommerce inaccesible:', detalle);
    return { disponible: false, total: null, estados: [], error: `WooCommerce inaccesible: ${detalle}` };
  }
};

const preflightEndpoint = async (req, res) => {
  try {
    const periodo = parsearPeriodo(req.query.anio, req.query.mes);
    if (!periodo.ok) {
      return res.status(400).json({ success: false, error: periodo.error });
    }
    const { anio, mes } = periodo;

    // Todo lo local se resuelve en paralelo; el conteo de Woo va aparte porque
    // su fallo no debe arrastrar a los pasos 3 y 4 del wizard, que son locales.
    const [validacion, pedidos, cotizaciones, facturas, porcentajes, woo] = await Promise.all([
      cierreMesModel.validarPeriodo(anio, mes),
      cierreMesModel.obtenerPedidosPeriodo(anio, mes),
      cierreMesModel.obtenerCotizacionesPendientes(anio, mes),
      cierreMesModel.obtenerFacturasPeriodo(anio, mes),
      obtenerPorcentajesComision(),
      contarPedidosWoo(anio, mes)
    ]);

    const { canales, totales } = cierreMesModel.construirResumen(facturas, porcentajes);

    return res.json({
      success: true,
      data: {
        periodo: { anio, mes, label: cierreMesModel.etiquetaPeriodo(anio, mes) },
        validacion,
        pedidos: {
          // Cuando WooCommerce no responde, total_woo y faltantes van en null y
          // woo_disponible en false: el frontend bloquea solo el paso 2.
          woo_disponible: woo.disponible,
          woo_error: woo.error,
          woo_estados: woo.estados,
          total_woo: woo.total,
          total_local: pedidos.length,
          faltantes: woo.disponible ? Math.max(0, woo.total - pedidos.length) : null,
          items: pedidos
        },
        cotizaciones: {
          pendientes: cotizaciones.length,
          items: cotizaciones
        },
        resumen: { canales, totales }
      }
    });
  } catch (error) {
    console.error('[CIERRE_MES_PREFLIGHT] Error:', error.message, error.stack);
    return res.status(500).json({ success: false, error: error.message });
  }
};

/* ==========================================================================
   4.1 POST /api/cierre-mes/pedidos/estado-masivo
   ========================================================================== */

/**
 * Acciones admitidas y el estado al que llevan el pedido.
 * El cambio dispara los emails estandar de WooCommerce, lo cual es el
 * comportamiento deseado: no se suprime ni se marca de forma especial.
 *
 * `no_pagado` ademas anula la VTA que se genero a partir de esa cotizacion: una
 * venta que el cliente nunca pago no puede seguir sumando en los totales del
 * cierre, que quedan congelados.
 */
const ACCIONES_ESTADO = Object.freeze({
  confirmar: { estado: 'completed', anulaVenta: false },
  no_pagado: { estado: 'cancelled', anulaVenta: true }
});

/** Observacion por defecto de la VTA anulada cuando el usuario no escribe una. */
const MOTIVO_ANULACION_POR_DEFECTO = 'Anulada por cierre de mes: pedido no pagado';

/** Tamano de lote y pausa entre lotes para no saturar la API de WooCommerce. */
const LOTE_WOO = 10;
const PAUSA_LOTE_MS = 100;

const esperar = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Procesa items en lotes con pausa entre lotes.
 * @param {Array} items
 * @param {(item: any) => Promise<object>} procesar
 * @returns {Promise<Array>} resultados en el mismo orden de entrada
 */
const procesarEnLotes = async (items, procesar) => {
  const resultados = [];
  for (let i = 0; i < items.length; i += LOTE_WOO) {
    const lote = items.slice(i, i + LOTE_WOO);
    resultados.push(...await Promise.all(lote.map(procesar)));
    if (i + LOTE_WOO < items.length) await esperar(PAUSA_LOTE_MS);
  }
  return resultados;
};

/** Envuelve los resultados en el formato de respuesta de las operaciones masivas. */
const respuestaMasiva = (resultados) => ({
  totalItems: resultados.length,
  successCount: resultados.filter(r => r.ok).length,
  errorCount: resultados.filter(r => !r.ok).length,
  resultados
});

const estadoMasivoEndpoint = async (req, res) => {
  try {
    const { fac_secs, accion, motivo } = req.body;

    const parsed = parsearFacSecs(fac_secs);
    if (!parsed.ok) {
      return res.status(400).json({ success: false, error: parsed.error });
    }
    if (!Object.prototype.hasOwnProperty.call(ACCIONES_ESTADO, accion)) {
      return res.status(400).json({
        success: false,
        error: `accion invalida. Valores admitidos: ${Object.keys(ACCIONES_ESTADO).join(', ')}`
      });
    }
    if (motivo !== undefined && motivo !== null && typeof motivo !== 'string') {
      return res.status(400).json({ success: false, error: 'motivo debe ser texto' });
    }

    const usu_cod = usuarioDe(req);
    const { estado: estadoWoo, anulaVenta } = ACCIONES_ESTADO[accion];
    const estadoLocal = normalizarEstadoWoo(estadoWoo);
    const motivoAnulacion = (typeof motivo === 'string' && motivo.trim())
      ? motivo.trim()
      : MOTIVO_ANULACION_POR_DEFECTO;

    const resultados = await procesarEnLotes(parsed.valores, async (fac_sec) => {
      const base = { fac_sec, fac_nro: null, ok: false, local: false, woo: false, vta_anulada: null, mensaje: '' };

      try {
        const cot = await cierreMesModel.obtenerCabeceraCotizacion(fac_sec);
        if (!cot) {
          return { ...base, mensaje: `No existe el documento ${fac_sec}` };
        }

        base.fac_nro = cot.fac_nro;

        // fac_est_woo vive en la COT: aplicarlo sobre una VTA no tendria efecto
        // en la grilla de pedidos y dejaria el dato en el documento equivocado.
        if (cot.fac_tip_cod !== 'COT') {
          return { ...base, mensaje: `${cot.fac_nro} no es una cotizacion (${cot.fac_tip_cod})` };
        }
        if (cot.fac_est_fac !== 'A') {
          return { ...base, mensaje: `El documento ${cot.fac_nro} esta anulado` };
        }

        // Estado del pedido y anulacion de la VTA van en la misma transaccion:
        // si la anulacion falla, el pedido tampoco queda cancelado.
        const cambio = await cierreMesModel.actualizarEstadoPedido({
          fac_sec,
          estadoNormalizado: estadoLocal,
          anularVenta: anulaVenta,
          motivo: motivoAnulacion,
          usu_cod
        });

        base.local = cambio.local;
        base.vta_anulada = cambio.vta_anulada;

        const sufijoVta = cambio.vta_anulada ? `; ${cambio.vta_anulada} anulada` : '';

        // Al anular la VTA sus lineas salen de vwExistencias, asi que el stock
        // local ya subio. Se empuja a WooCommerce el valor absoluto resultante.
        // Es best-effort: no debe tumbar una operacion que ya quedo firme.
        if (cambio.vta_anulada) {
          try {
            await syncDocumentStockToWoo(cambio.vta_anulada, { silent: true });
          } catch (stockError) {
            console.error(`[CIERRE_MES_ESTADO_MASIVO] Stock de ${cambio.vta_anulada} no sincronizado:`, stockError.message);
          }
        }

        if (!cot.fac_nro_woo) {
          // Documento local: el cambio local es todo lo que aplica.
          return { ...base, ok: true, mensaje: `Actualizado a ${estadoLocal} (sin pedido WooCommerce asociado)${sufijoVta}` };
        }

        try {
          await wcApi.put(`orders/${cot.fac_nro_woo}`, { status: desnormalizarEstadoWoo(estadoWoo) });
          return { ...base, ok: true, woo: true, mensaje: `Actualizado a ${estadoLocal}${sufijoVta}` };
        } catch (wooError) {
          const detalle = wooError.response?.data?.message || wooError.message;
          // El cambio local ya quedo aplicado: se reporta ok con woo:false para
          // que el operador sepa que WooCommerce quedo desincronizado.
          return { ...base, ok: true, mensaje: `Actualizado localmente${sufijoVta}; WooCommerce fallo: ${detalle}` };
        }
      } catch (error) {
        console.error(`[CIERRE_MES_ESTADO_MASIVO] fac_sec ${fac_sec}:`, error.message);
        return { ...base, mensaje: error.message };
      }
    });

    return res.json({ success: true, data: respuestaMasiva(resultados) });
  } catch (error) {
    console.error('[CIERRE_MES_ESTADO_MASIVO] Error:', error.message, error.stack);
    return res.status(500).json({ success: false, error: error.message });
  }
};

/* ==========================================================================
   4.2 POST /api/cierre-mes/cotizaciones/facturar-bloque
   ========================================================================== */

/**
 * Convierte los datos de una COT en el payload de creacion de una VTA.
 *
 * Replica lo que hace el POS al facturar una cotizacion:
 *  - kar_nat '-' en cada linea y fac_tip_cod 'VTA'
 *  - conserva fac_fec y fac_descuento_general de la COT
 *  - conserva kar_total linea a linea, que es lo que preserva los cupones y
 *    descuentos ya aplicados en la cotizacion
 *  - trazabilidad via kar_kar_sec_ori / kar_fac_sec_ori; ese ultimo campo es el
 *    que hace que createCompleteOrder estampe fac_nro_origen en la COT
 *
 * La fecha se pasa como string 'YYYY-MM-DD': construir un Date reintroduciria
 * el corrimiento de zona horaria del driver mssql.
 */
const construirPayloadFactura = (header, details, usu_cod) => {
  const fechaCot = header.fac_fec instanceof Date
    ? header.fac_fec.toISOString().slice(0, 10)
    : String(header.fac_fec).slice(0, 10);

  const lis_pre_cod = Number(details[0]?.kar_lis_pre_cod) === 2 ? 2 : 1;

  return {
    nit_sec: header.nit_sec,
    fac_usu_cod_cre: usu_cod,
    fac_tip_cod: 'VTA',
    fac_est_fac: 'A',
    descuento: 0,
    fac_descuento_general: Number(header.fac_descuento_general || 0),
    lis_pre_cod,
    fac_nro_woo: header.fac_nro_woo || null,
    fac_obs: header.fac_obs || null,
    fac_fec: fechaCot,
    detalles: details.map(d => ({
      art_sec: String(d.art_sec),
      kar_uni: Number(d.kar_uni),
      kar_pre_pub: Number(d.kar_pre_pub),
      kar_lis_pre_cod: d.kar_lis_pre_cod,
      kar_nat: '-',
      kar_total: Number(d.kar_total),
      kar_bundle_padre: d.kar_bundle_padre || null,
      kar_kar_sec_ori: d.kar_sec,
      kar_fac_sec_ori: Number(header.fac_sec),
      kar_tiene_oferta: d.kar_tiene_oferta,
      kar_precio_oferta: d.kar_precio_oferta,
      kar_descuento_porcentaje: d.kar_descuento_porcentaje,
      kar_codigo_promocion: d.kar_codigo_promocion,
      kar_descripcion_promocion: d.kar_descripcion_promocion
    }))
  };
};

const facturarBloqueEndpoint = async (req, res) => {
  try {
    const parsed = parsearFacSecs(req.body?.fac_secs);
    if (!parsed.ok) {
      return res.status(400).json({ success: false, error: parsed.error });
    }

    const usu_cod = usuarioDe(req);
    const resultados = [];

    // Secuencial a proposito: cada factura toma UPDLOCK/HOLDLOCK sobre
    // dbo.secuencia y dbo.tipo_comprobantes. En paralelo las transacciones se
    // bloquearian entre si. Ademas, una transaccion por cotizacion garantiza
    // que un fallo individual no aborte el bloque ni deje documentos a medias.
    for (const fac_sec of parsed.valores) {
      const base = { fac_sec, fac_nro: null, ok: false };

      try {
        const cot = await cierreMesModel.obtenerCabeceraCotizacion(fac_sec);
        if (!cot) {
          resultados.push({ ...base, mensaje: `No existe el documento ${fac_sec}` });
          continue;
        }

        base.fac_nro = cot.fac_nro;

        if (cot.fac_tip_cod !== 'COT') {
          resultados.push({ ...base, mensaje: `${cot.fac_nro} no es una cotizacion (${cot.fac_tip_cod})` });
          continue;
        }
        if (cot.fac_est_fac !== 'A') {
          resultados.push({ ...base, mensaje: `La cotizacion ${cot.fac_nro} esta anulada` });
          continue;
        }
        if (cot.fac_nro_origen) {
          resultados.push({ ...base, mensaje: `La cotizacion ${cot.fac_nro} ya fue facturada (${cot.fac_nro_origen})` });
          continue;
        }

        const { header, details } = await getOrder(cot.fac_nro);
        if (!details || details.length === 0) {
          resultados.push({ ...base, mensaje: `La cotizacion ${cot.fac_nro} no tiene lineas` });
          continue;
        }

        const payload = construirPayloadFactura({ ...header, fac_nro_woo: cot.fac_nro_woo }, details, usu_cod);

        // Mismas validaciones de stock que aplica el POS al facturar.
        await validarBundles(payload.detalles);
        await validarExistenciasVTA(payload.detalles);

        const creada = await createCompleteOrder(payload);

        resultados.push({
          ...base,
          ok: true,
          fac_nro_generado: creada.fac_nro,
          fac_sec_generado: Number(creada.fac_sec)
        });
      } catch (error) {
        console.error(`[CIERRE_MES_FACTURAR] fac_sec ${fac_sec}:`, error.message);
        resultados.push({ ...base, mensaje: error.message });
      }
    }

    return res.json({ success: true, data: respuestaMasiva(resultados) });
  } catch (error) {
    console.error('[CIERRE_MES_FACTURAR] Error:', error.message, error.stack);
    return res.status(500).json({ success: false, error: error.message });
  }
};

/* ==========================================================================
   4.3 POST /api/cierre-mes/cotizaciones/anular-bloque
   ========================================================================== */

const anularBloqueEndpoint = async (req, res) => {
  try {
    const { fac_secs, fac_obs } = req.body;

    const parsed = parsearFacSecs(fac_secs);
    if (!parsed.ok) {
      return res.status(400).json({ success: false, error: parsed.error });
    }

    const errorObs = validarObservacion(fac_obs, 'fac_obs');
    if (errorObs) {
      return res.status(400).json({ success: false, error: errorObs });
    }

    const usu_cod = usuarioDe(req);
    const observacion = fac_obs.trim();
    const resultados = [];

    for (const fac_sec of parsed.valores) {
      const base = { fac_sec, fac_nro: null, ok: false };

      try {
        const cot = await cierreMesModel.obtenerCabeceraCotizacion(fac_sec);
        if (!cot) {
          resultados.push({ ...base, mensaje: `No existe el documento ${fac_sec}` });
          continue;
        }

        base.fac_nro = cot.fac_nro;

        if (cot.fac_tip_cod !== 'COT') {
          resultados.push({ ...base, mensaje: `${cot.fac_nro} no es una cotizacion (${cot.fac_tip_cod})` });
          continue;
        }
        if (cot.fac_est_fac !== 'A') {
          resultados.push({ ...base, mensaje: `La cotizacion ${cot.fac_nro} ya estaba anulada` });
          continue;
        }
        if (cot.fac_nro_origen) {
          resultados.push({ ...base, mensaje: `La cotizacion ${cot.fac_nro} ya fue facturada (${cot.fac_nro_origen}); no se puede anular` });
          continue;
        }

        const anulada = await cierreMesModel.anularCotizacion({ fac_sec, fac_obs: observacion, usu_cod });
        if (!anulada) {
          resultados.push({ ...base, mensaje: `La cotizacion ${cot.fac_nro} ya estaba anulada` });
          continue;
        }

        resultados.push({ ...base, ok: true, mensaje: 'Cotizacion anulada' });
      } catch (error) {
        console.error(`[CIERRE_MES_ANULAR_COT] fac_sec ${fac_sec}:`, error.message);
        resultados.push({ ...base, mensaje: error.message });
      }
    }

    return res.json({ success: true, data: respuestaMasiva(resultados) });
  } catch (error) {
    console.error('[CIERRE_MES_ANULAR_COT] Error:', error.message, error.stack);
    return res.status(500).json({ success: false, error: error.message });
  }
};

/* ==========================================================================
   5.2 POST /api/cierre-mes
   ========================================================================== */

const crearCierreEndpoint = async (req, res) => {
  try {
    const { anio, mes, cie_obs } = req.body;

    const periodo = parsearPeriodo(anio, mes);
    if (!periodo.ok) {
      return res.status(400).json({ success: false, error: periodo.error });
    }
    if (cie_obs !== undefined && cie_obs !== null && typeof cie_obs !== 'string') {
      return res.status(400).json({ success: false, error: 'cie_obs debe ser texto' });
    }

    // Las dos reglas de periodo se revalidan en el servidor: la validacion del
    // frontend es solo para la experiencia del wizard.
    const validacion = await cierreMesModel.validarPeriodo(periodo.anio, periodo.mes);
    if (!validacion.puede_cerrar) {
      return res.status(409).json({
        success: false,
        error: validacion.motivo,
        codigo: validacion.codigo,
        cierre_existente: validacion.cierre_existente
      });
    }

    // Validacion defensiva: el wizard deberia haber resuelto todo, pero el
    // cierre no puede congelar un mes con documentos pendientes.
    const [cotizaciones, pedidos] = await Promise.all([
      cierreMesModel.obtenerCotizacionesPendientes(periodo.anio, periodo.mes),
      cierreMesModel.obtenerPedidosPeriodo(periodo.anio, periodo.mes)
    ]);
    // Bloquea por "resuelto", no por "confirmado": un pedido cancelado ya fue
    // decidido por el usuario y no debe trabar el cierre.
    const sinResolver = pedidos.filter(p => !p.resuelto);

    if (cotizaciones.length > 0 || sinResolver.length > 0) {
      return res.status(422).json({
        success: false,
        error: 'El periodo tiene documentos sin resolver',
        codigo: 'PERIODO_CON_PENDIENTES',
        pendientes: {
          cotizaciones_sin_facturar: cotizaciones.length,
          pedidos_sin_resolver: sinResolver.length,
          // Alias del nombre anterior para no romper al frontend ya desplegado.
          // Retirar cuando el front consuma pedidos_sin_resolver.
          pedidos_sin_confirmar: sinResolver.length,
          cotizaciones: cotizaciones.map(c => ({ fac_sec: c.fac_sec, fac_nro: c.fac_nro })),
          pedidos: sinResolver.map(p => ({ fac_sec: p.fac_sec, fac_nro: p.fac_nro, fac_est_woo: p.fac_est_woo }))
        }
      });
    }

    // Los porcentajes se leen aqui y quedan congelados en la cabecera.
    const porcentajes = await obtenerPorcentajesComision();

    const cierre = await cierreMesModel.crearCierre({
      anio: periodo.anio,
      mes: periodo.mes,
      cie_obs: typeof cie_obs === 'string' ? cie_obs.trim() || null : null,
      usu_cod: usuarioDe(req),
      porcentajes
    });

    return res.status(201).json({ success: true, data: cierre });
  } catch (error) {
    if (error.codigo === 'CIERRE_EXISTENTE') {
      return res.status(409).json({
        success: false,
        error: error.message,
        codigo: 'CIERRE_EXISTENTE',
        cierre_existente: error.cierre_existente
      });
    }
    console.error('[CIERRE_MES_CREAR] Error:', error.message, error.stack);
    return res.status(500).json({ success: false, error: error.message });
  }
};

/* ==========================================================================
   5.3 POST /api/cierre-mes/:cie_sec/anular
   ========================================================================== */

const anularCierreEndpoint = async (req, res) => {
  try {
    const cie_sec = Number.parseInt(req.params.cie_sec, 10);
    if (!Number.isInteger(cie_sec) || cie_sec <= 0) {
      return res.status(400).json({ success: false, error: 'cie_sec invalido' });
    }

    const { cie_anu_obs } = req.body;
    const errorObs = validarObservacion(cie_anu_obs, 'cie_anu_obs');
    if (errorObs) {
      return res.status(400).json({ success: false, error: errorObs });
    }

    const resultado = await cierreMesModel.anularCierre({
      cie_sec,
      cie_anu_obs: cie_anu_obs.trim(),
      usu_cod: usuarioDe(req)
    });

    if (resultado.estado === 'NO_ENCONTRADO') {
      return res.status(404).json({ success: false, error: `No existe el cierre ${cie_sec}` });
    }
    if (resultado.estado === 'YA_ANULADO') {
      return res.status(409).json({
        success: false,
        error: `El cierre ${cie_sec} ya esta anulado`,
        codigo: 'CIERRE_YA_ANULADO'
      });
    }

    return res.json({ success: true, data: resultado.cierre });
  } catch (error) {
    console.error('[CIERRE_MES_ANULAR] Error:', error.message, error.stack);
    return res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  listarCierresEndpoint,
  obtenerCierreEndpoint,
  validarPeriodoEndpoint,
  preflightEndpoint,
  estadoMasivoEndpoint,
  facturarBloqueEndpoint,
  anularBloqueEndpoint,
  crearCierreEndpoint,
  anularCierreEndpoint
};
