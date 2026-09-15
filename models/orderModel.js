// models/orderModel.js

import { sql, poolPromise } from "../db.js";
import { sincronizarExistenciasWoo, sincronizarDocumentoWoo, actualizarEstadoPedidoWoo, determinarEstadoWooAlFacturar, agregarNotaPedidoWoo } from "../services/wooStockService.js";
import { obtenerCostosPromedioMultiples } from "../utils/costoUtils.js";
import { ejecutarConAutoRecuperacion } from "../utils/secuenciaUtils.js";
import { NATURALEZA, naturalezaKardex, calcularVencimientoRem, destinoActivo, errorNegocio } from "../utils/documentosUtils.js";

/**
 * pedidosWebModel se carga en diferido (misma razón que en pedidosWebModel → orderModel):
 * un import estático metería este módulo en el grafo ESM de index.js y Node 23 rompe el arranque.
 */
const pedidosWebModel = () => import('./pedidosWebModel.js');

/**
 * Normaliza el estado de WooCommerce para consistencia en la base de datos
 * Convierte guiones (-) a guiones bajos (_) para mantener consistencia
 * @param {string} status - Estado original de WooCommerce
 * @returns {string} - Estado normalizado
 */
const normalizeWooCommerceStatus = (status) => {
  if (!status || typeof status !== 'string') {
    return status;
  }
  
  // Convertir guiones a guiones bajos para mantener consistencia
  const normalizedStatus = status.replace(/-/g, '_');
  
  // Log para debugging en caso de normalización
  if (status !== normalizedStatus) {
    console.log(`[NORMALIZE_STATUS] Estado normalizado: "${status}" -> "${normalizedStatus}"`);
  }
  
  return normalizedStatus;
};

/**
 * Obtiene el estado actual del pedido desde la base de datos
 * @param {string} fac_nro - Número de factura
 * @returns {Promise<string|null>} - Estado actual del pedido o null si no existe
 */
const getCurrentOrderStatus = async (fac_nro) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('fac_nro', sql.VarChar(15), fac_nro)
      .query(`
        SELECT fac_est_woo 
        FROM dbo.factura 
        WHERE fac_nro = @fac_nro
      `);
    
    return result.recordset.length > 0 ? result.recordset[0].fac_est_woo : null;
  } catch (error) {
    console.error(`Error obteniendo estado del pedido ${fac_nro}:`, error.message);
    return null;
  }
};

/**
 * Expande ítems tipo bundle en líneas: una del bundle padre + N de componentes (precio 0).
 * Si los detalles ya vienen expandidos (COT→VTA: bundle + componentes), no duplica: en la
 * segunda pasada se omiten líneas cuyo art_sec ya fue añadido como componente de un bundle.
 * Referencia: implementaciones_2026/articulos_bundle/
 */
/**
 * SPEC-013 Tarea 2 — después de confirmar una VTA (commit ya hecho):
 *  1. empuja la existencia actual de sus artículos a WooCommerce (punto único),
 *  2. si la VTA viene de un pedido web, actualiza el estado del pedido en Woo
 *     con el mismo mapeo que usaba el job anterior (sin cambio de comportamiento en Fase 1).
 * Nunca lanza: la transacción del ERP ya quedó firme.
 */
const postCommitVentaWoo = async ({ detalles, fac_nro, fac_nro_woo, origen = 'VTA', usuario = null }) => {
  const art_secs = (detalles || []).map((d) => d.art_sec).filter(Boolean);
  const resultado = { push: null, estadoWoo: null };
  try {
    resultado.push = await sincronizarExistenciasWoo({ art_secs, origen, referencia: fac_nro, usuario });
  } catch (e) {
    console.error(`[WOO] push tras ${fac_nro} falló:`, e.message);
  }
  if (fac_nro_woo) {
    try {
      const pool = await poolPromise;
      const rs = await pool.request()
        .input('fac_nro_woo', sql.VarChar(15), String(fac_nro_woo))
        .query('SELECT TOP 1 fac_est_woo FROM dbo.factura WHERE fac_nro_woo = @fac_nro_woo ORDER BY fac_fch_cre DESC');
      const actual = rs.recordset.length ? rs.recordset[0].fac_est_woo : null;
      resultado.estadoWoo = await actualizarEstadoPedidoWoo(fac_nro_woo, determinarEstadoWooAlFacturar(actual));
    } catch (e) {
      console.error(`[WOO] estado del pedido ${fac_nro_woo} no actualizado:`, e.message);
    }
  }
  return resultado;
};

const expandirBundles = async (pool, detalles, karNat = NATURALEZA.SALIDA) => {
  /** art_sec que ya se añadieron como componentes de un bundle (evita duplicar al pasar COT→VTA) */
  const componentesYaAnadidos = new Set();
  const detallesExpandidos = [];

  // SPEC-014 §5.1: la naturaleza la decide el documento (naturalezaKardex), no cada línea del
  // payload. Componentes y padres de bundle la heredan tal cual; lo que traiga detalle.kar_nat se ignora.

  // Primera pasada: solo expandir bundles (así no importa el orden bundle/componentes en la lista)
  for (const detalle of detalles) {
    const artSec = detalle.art_sec != null ? String(detalle.art_sec) : '';
    if (!artSec) continue;

    const articuloCheck = await pool.request()
      .input('art_sec', sql.VarChar(30), artSec)
      .query('SELECT art_bundle FROM dbo.articulos WHERE art_sec = @art_sec');

    if (articuloCheck.recordset?.[0]?.art_bundle !== 'S') continue;

    detallesExpandidos.push({
      ...detalle,
      kar_bundle_padre: null,
      kar_nat: karNat
    });

    const componentes = await pool.request()
      .input('bundle_art_sec', sql.VarChar(30), artSec)
      .query(`
        SELECT ComArtSec, ConKarUni
        FROM dbo.articulosArmado
        WHERE art_sec = @bundle_art_sec
      `);

    const karUniBase = Number(detalle.kar_uni) || 1;

    for (const comp of (componentes.recordset || [])) {
      const compSec = comp.ComArtSec != null ? String(comp.ComArtSec) : '';
      if (compSec) componentesYaAnadidos.add(compSec);
      detallesExpandidos.push({
        art_sec: comp.ComArtSec,
        kar_uni: karUniBase * (comp.ConKarUni || 1),
        kar_pre_pub: 0,
        kar_nat: karNat,
        kar_bundle_padre: artSec,
        kar_pre_pub_detal: 0,
        kar_pre_pub_mayor: 0,
        kar_tiene_oferta: 'N',
        kar_precio_oferta: null,
        kar_descuento_porcentaje: null,
        kar_codigo_promocion: null,
        kar_descripcion_promocion: null,
        kar_kar_sec_ori: detalle.kar_kar_sec_ori,
        kar_fac_sec_ori: detalle.kar_fac_sec_ori
      });
    }
  }

  // Segunda pasada: añadir líneas que no son bundle y no son componentes ya añadidos
  for (const detalle of detalles) {
    const artSec = detalle.art_sec != null ? String(detalle.art_sec) : '';
    if (!artSec) continue;
    // Solo omitir si la línea ya llega marcada como componente explícito de un bundle
    // (kar_bundle_padre seteado). Si el usuario agregó el artículo manualmente como
    // adicional, kar_bundle_padre será null/undefined y debe incluirse aunque su art_sec
    // coincida con un componente de algún bundle del mismo pedido.
    if (componentesYaAnadidos.has(artSec) && detalle.kar_bundle_padre) continue;

    const articuloCheck = await pool.request()
      .input('art_sec', sql.VarChar(30), artSec)
      .query('SELECT art_bundle FROM dbo.articulos WHERE art_sec = @art_sec');

    if (articuloCheck.recordset?.[0]?.art_bundle === 'S') continue;

    detallesExpandidos.push({
      ...detalle,
      kar_bundle_padre: detalle.kar_bundle_padre ?? null,
      kar_nat: karNat
    });
  }

  return detallesExpandidos;
};

/**
 * SPEC-014 §2.2 / §5.3 — documentos de origen de un lote de líneas (kar_fac_sec_ori).
 * Valida que un COT/REM/VTA nuevo o editado solo pueda cruzarse con una COT activa y libre:
 *   - una VTA no nace de una REM por aquí (solo facturarRemision, con naturaleza 'R');
 *   - la COT de origen debe estar activa y sin destino activo (no se factura/remisiona dos veces).
 * Devuelve las COT de origen [{ fac_sec, fac_nro }] para estampar el vínculo en ambas cabeceras.
 * @param {sql.Transaction} transaction
 * @param {string} fac_tip_cod  tipo del documento que se está creando/editando
 * @param {Array} detalles      líneas del payload
 * @param {number|null} [fac_sec_propio]  al editar: el propio documento no cuenta como "destino"
 */
const validarOrigenes = async (transaction, fac_tip_cod, detalles, fac_sec_propio = null) => {
  const secs = [...new Set((detalles || []).map((d) => d.kar_fac_sec_ori).filter((v) => v != null && v !== '').map((v) => String(v)))];
  if (secs.length === 0) return [];
  const req = new sql.Request(transaction);
  const params = secs.map((v, i) => { req.input(`o${i}`, sql.Decimal(18, 0), Number(v)); return `@o${i}`; });
  const rs = await req.query(`SELECT fac_sec, fac_nro, fac_tip_cod, fac_est_fac FROM dbo.factura WHERE fac_sec IN (${params.join(',')})`);
  // Al editar, el propio documento ya puede ser el destino estampado en la COT: no es un cruce doble.
  let propioNro = null;
  if (fac_sec_propio != null) {
    const p = await new sql.Request(transaction).input('s', sql.Decimal(18, 0), Number(fac_sec_propio)).query('SELECT fac_nro FROM dbo.factura WHERE fac_sec = @s');
    propioNro = p.recordset[0]?.fac_nro || null;
  }
  const origenes = [];
  for (const o of rs.recordset) {
    if (o.fac_tip_cod === 'REM') {
      throw errorNegocio(`Una factura o remisión no puede nacer de la remisión ${o.fac_nro} por este camino; use POST /api/pedidos-web/${o.fac_nro}/facturar (la REM ya descontó kardex)`, 400);
    }
    if (o.fac_tip_cod !== 'COT') continue; // vínculos VTA→VTA (edición de factura) no son cruces de documentos
    if (fac_tip_cod === 'COT') continue;    // guardar una COT no la cruza consigo misma
    if (o.fac_est_fac !== 'A') throw errorNegocio(`La cotización ${o.fac_nro} no está activa (estado ${o.fac_est_fac}); no se puede ${fac_tip_cod === 'REM' ? 'remisionar' : 'facturar'}`);
    const destino = await destinoActivo(transaction, { fac_sec: Number(o.fac_sec) });
    if (destino && destino.fac_nro !== propioNro) {
      throw errorNegocio(`La cotización ${o.fac_nro} ya fue cruzada con ${destino.fac_nro} (${destino.fac_tip_cod} activa); anúlela primero`);
    }
    origenes.push({ fac_sec: Number(o.fac_sec), fac_nro: o.fac_nro });
  }
  return origenes;
};




/**
 * Edita las líneas (y cabecera comercial) de un documento existente.
 *
 * SPEC-014:
 *  - El tipo es el REAL del documento; `fac_tip_cod` del payload solo se valida (nunca convierte
 *    una REM en COT ni viceversa). La naturaleza de las líneas la decide el tipo (§5.1).
 *  - Bloqueos (§2.2 / §9.2): documento no activo; documento cruzado con un destino activo
 *    (COT con REM/VTA, REM con VTA); VTA respaldada por remisión (líneas 'R').
 *  - REM de un pedido Woo: se delega en pedidosWebModel.editarLineasRemisionWoo (Woo primero);
 *    esa función vuelve a llamar aquí con `sinPropagarWoo: true` para la escritura local.
 *  - Push tras el commit por el punto único: VTA → estado + stock; REM → REM_EDITADA con la unión
 *    de artículos anteriores y nuevos (los que salieron recuperan stock en Woo).
 * @param {string} [usuario]  usu_cod de quien edita (log del push y nota en Woo)
 */
const updateOrder = async ({ fac_nro, fac_tip_cod, nit_sec, fac_est_fac, detalles, descuento, fac_nro_woo, fac_obs, fac_fec, fac_descuento_general, fac_est_woo, usuario = null, sinPropagarWoo = false }) => {
  let transaction;
  try {
    const pool = await poolPromise;
    // 1. Cabecera real del documento
    const headerRes = await pool.request()
      .input('fac_nro', sql.VarChar(15), fac_nro)
      .query('SELECT fac_sec, fac_tip_cod, fac_est_fac, fac_est_woo, fac_nro_woo, fac_obs, fac_nro_origen FROM dbo.factura WHERE fac_nro = @fac_nro');
    if (headerRes.recordset.length === 0) {
      throw errorNegocio("Pedido no encontrado.", 404);
    }
    const cab = headerRes.recordset[0];
    const fac_sec = cab.fac_sec;
    const tipoReal = cab.fac_tip_cod;
    const currentStatus = cab.fac_est_woo;

    if (fac_tip_cod && fac_tip_cod !== tipoReal) {
      throw errorNegocio(`${fac_nro} es una ${tipoReal}; no se puede guardar como ${fac_tip_cod}. Para pasarla a otro documento use REMISIONAR / FACTURAR.`, 400);
    }
    if (cab.fac_est_fac !== 'A') {
      throw errorNegocio(`${fac_nro} no está activa (estado ${cab.fac_est_fac}); no se puede editar.`);
    }
    const destino = await destinoActivo(pool, { fac_sec: Number(fac_sec) });
    if (destino) {
      throw errorNegocio(`${fac_nro} está cruzada con ${destino.fac_nro} (${destino.fac_tip_cod} activa) y no se puede editar; anule ${destino.fac_nro} primero.`);
    }
    // Líneas actuales: naturaleza (VTA respaldada) y artículos anteriores (push de la unión en REM)
    const lineasPrevias = await pool.request()
      .input('fac_sec', sql.Decimal(18, 0), fac_sec)
      .query('SELECT art_sec, kar_nat FROM dbo.facturakardes WHERE fac_sec = @fac_sec');
    if (tipoReal === 'VTA' && lineasPrevias.recordset.some((l) => l.kar_nat === NATURALEZA.RESPALDADA)) {
      throw errorNegocio(`${fac_nro} nació de la remisión ${cab.fac_nro_origen || ''} y no se edita por líneas: anule la factura, edite la remisión y vuelva a facturar.`);
    }
    const artSecsPrevios = [...new Set(lineasPrevias.recordset.map((l) => String(l.art_sec)))];

    // REM de un pedido web: Woo primero (spec §5.4). editarLineasRemisionWoo vuelve a llamar con sinPropagarWoo.
    if (tipoReal === 'REM' && cab.fac_nro_woo && !sinPropagarWoo) {
      const { editarLineasRemisionWoo } = await pedidosWebModel();
      return editarLineasRemisionWoo({ fac_nro_rem: fac_nro, nit_sec, detalles, descuento, fac_descuento_general, usuario });
    }

    const karNat = naturalezaKardex(tipoReal);
    // Si se proporciona fac_est_woo, usarlo; de lo contrario, mantener el estado actual
    const newStatus = fac_est_woo !== undefined ? fac_est_woo : currentStatus;

    console.log(`[UPDATE_ORDER] ${fac_nro} (${tipoReal}) estado Woo:`, {
      currentStatus: currentStatus,
      willUpdateTo: newStatus
    });

    // 2. Iniciar la transacción
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    // 3. Actualizar el encabezado. fac_nro_woo / fac_obs se conservan si el payload no los trae
    //    (antes un PUT sin fac_obs borraba la observación).
    const updateHeaderQuery = `
      UPDATE dbo.factura
      SET nit_sec = COALESCE(@nit_sec, nit_sec),
          fac_est_fac = @fac_est_fac,
          fac_nro_woo = COALESCE(@fac_nro_woo, fac_nro_woo),
          fac_obs = COALESCE(@fac_obs, fac_obs),
          fac_est_woo = @fac_est_woo,
          fac_usu_cod_mod = COALESCE(@usuario, fac_usu_cod_mod),
          fac_fch_mod = GETDATE()
          ${fac_fec ? ', fac_fec = @fac_fec' : ''}
          ${fac_descuento_general !== undefined ? ', fac_descuento_general = @fac_descuento_general' : ''}
      WHERE fac_sec = @fac_sec AND fac_est_fac = 'A'
    `;

    const updateHeaderRequest = new sql.Request(transaction);
    updateHeaderRequest
      .input('nit_sec', sql.VarChar(16), nit_sec || null)
      .input('fac_est_fac', sql.Char(1), fac_est_fac || 'A')
      .input('fac_sec', sql.Decimal(18, 0), fac_sec)
      .input('fac_nro_woo', sql.VarChar(15), fac_nro_woo || null)
      .input('fac_obs', sql.VarChar, fac_obs ?? null)
      .input('usuario', sql.VarChar(100), usuario)
      .input('fac_est_woo', sql.VarChar(50), newStatus); // Usar el nuevo estado o mantener el actual

    // Solo agregar el parámetro de fecha si se proporciona
    if (fac_fec) {
      updateHeaderRequest.input('fac_fec', sql.Date, fac_fec);
    }
    
    // Solo agregar el parámetro de descuento general si se proporciona
    if (fac_descuento_general !== undefined) {
      updateHeaderRequest.input('fac_descuento_general', sql.Decimal(17, 2), fac_descuento_general);
    }

    const updHeader = await updateHeaderRequest.query(updateHeaderQuery);
    if (updHeader.rowsAffected[0] !== 1) throw errorNegocio(`${fac_nro} cambió de estado mientras se editaba; vuelva a cargarla.`);

    // 4. Expandir bundles antes de eliminar detalles (para mantener consistencia con createCompleteOrder)
    const detallesExpandidos = await expandirBundles(pool, detalles, karNat);
    // SPEC-014 §2.2: al re-guardar una VTA que nació de una COT, esa COT sigue siendo su origen
    // (no es un cruce doble); una REM como origen se rechaza aquí igual que al crear.
    await validarOrigenes(transaction, tipoReal, detallesExpandidos, Number(fac_sec));

    // 4.1 Obtener costos promedio de todos los artículos en una sola query
    const art_secs = detallesExpandidos.map(d => String(d.art_sec));
    const costosMap = await obtenerCostosPromedioMultiples(transaction, art_secs);

    // 5. Eliminar los detalles existentes para este pedido con un nuevo Request
    const deleteDetailsRequest = new sql.Request(transaction);
    await deleteDetailsRequest
      .input('fac_sec', sql.Decimal(18, 0), fac_sec)
      .query('DELETE FROM dbo.facturakardes WHERE fac_sec = @fac_sec');

    // 6. Insertar los nuevos detalles expandidos (por cada ítem se realiza UN insert)
    // Se espera que cada objeto en detallesExpandidos tenga:
    // art_sec, kar_uni, precio_de_venta, kar_lis_pre_cod, kar_bundle_padre
    for (let i = 0; i < detallesExpandidos.length; i++) {
      const detail = detallesExpandidos[i];

      // CORREGIDO: Obtener el siguiente kar_sec de la base de datos en lugar de usar i+1
      const karSecRequest = new sql.Request(transaction);
      const karSecQuery = `
        SELECT ISNULL(MAX(kar_sec), 0) + 1 AS NewKarSec
        FROM dbo.facturakardes
        WHERE fac_sec = @fac_sec
      `;
      const karSecResult = await karSecRequest
        .input('fac_sec', sql.Decimal(18, 0), fac_sec)
        .query(karSecQuery);
      const newKarSec = karSecResult.recordset[0].NewKarSec;

      // 5.1 Usar información de precios y ofertas que viene desde syncWooOrders o calcular si no está disponible
      let precioInfo;
      
      // Verificar si los campos de promociones están presentes en el detalle y son válidos
      // Validar que no sean undefined, null o cadenas vacías
      const tieneCamposPromocion = detail.kar_pre_pub_detal !== undefined && 
                                    detail.kar_pre_pub_mayor !== undefined && 
                                    detail.kar_tiene_oferta !== undefined && 
                                    detail.kar_codigo_promocion !== undefined &&
                                    detail.kar_pre_pub_detal !== null &&
                                    detail.kar_pre_pub_mayor !== null &&
                                    detail.kar_tiene_oferta !== null &&
                                    detail.kar_tiene_oferta !== '';
      
      if (tieneCamposPromocion) {
        // Usar los valores que vienen desde syncWooOrders
        precioInfo = {
          precio_detal: detail.kar_pre_pub_detal || 0,
          precio_mayor: detail.kar_pre_pub_mayor || 0,
          precio_oferta: detail.kar_precio_oferta || null,
          descuento_porcentaje: detail.kar_descuento_porcentaje || null,
          codigo_promocion: detail.kar_codigo_promocion || null,
          descripcion_promocion: detail.kar_descripcion_promocion || null,
          tiene_oferta: detail.kar_tiene_oferta || 'N'
        };
        
        // Asegurar que si no tiene oferta, todos los campos de promoción sean NULL
        if (precioInfo.tiene_oferta !== 'S') {
          precioInfo.precio_oferta = null;
          precioInfo.descuento_porcentaje = null;
          precioInfo.codigo_promocion = null;
          precioInfo.descripcion_promocion = null;
          precioInfo.tiene_oferta = 'N';
        }
        
        console.log(`[UPDATE_ORDER] Usando información de promociones desde syncWooOrders para artículo ${detail.art_sec}:`, {
          tiene_oferta: precioInfo.tiene_oferta,
          codigo_promocion: precioInfo.codigo_promocion,
          precio_oferta: precioInfo.precio_oferta,
          descuento_porcentaje: precioInfo.descuento_porcentaje
        });
      } else {
        // Calcular información de precios y ofertas del artículo (para casos no sincronizados desde WooCommerce)
        const precioRequest = new sql.Request(transaction);
        const precioQuery = `
          SELECT 
            ISNULL(ad1.art_bod_pre, 0) AS precio_detal,
            ISNULL(ad2.art_bod_pre, 0) AS precio_mayor,
            -- Solo devolver valores de promoción si la promoción está realmente activa
            CASE 
                WHEN p.pro_codigo IS NOT NULL
                     AND ((pd.pro_det_precio_oferta IS NOT NULL AND pd.pro_det_precio_oferta > 0) 
                          OR (pd.pro_det_descuento_porcentaje IS NOT NULL AND pd.pro_det_descuento_porcentaje > 0))
                THEN pd.pro_det_precio_oferta
                ELSE NULL
            END AS precio_oferta,
            CASE 
                WHEN p.pro_codigo IS NOT NULL
                     AND ((pd.pro_det_precio_oferta IS NOT NULL AND pd.pro_det_precio_oferta > 0) 
                          OR (pd.pro_det_descuento_porcentaje IS NOT NULL AND pd.pro_det_descuento_porcentaje > 0))
                THEN pd.pro_det_descuento_porcentaje
                ELSE NULL
            END AS descuento_porcentaje,
            p.pro_codigo AS codigo_promocion,
            p.pro_descripcion AS descripcion_promocion,
            CASE 
                -- Solo marcar como oferta si la promoción está realmente activa (p.pro_codigo IS NOT NULL)
                -- Y tiene valores válidos de precio o descuento
                WHEN p.pro_codigo IS NOT NULL
                     AND ((pd.pro_det_precio_oferta IS NOT NULL AND pd.pro_det_precio_oferta > 0) 
                          OR (pd.pro_det_descuento_porcentaje IS NOT NULL AND pd.pro_det_descuento_porcentaje > 0))
                THEN 'S' 
                ELSE 'N' 
            END AS tiene_oferta
          FROM dbo.articulos a
          LEFT JOIN dbo.articulosdetalle ad1 ON a.art_sec = ad1.art_sec AND ad1.lis_pre_cod = 1 AND ad1.bod_sec = '1'
          LEFT JOIN dbo.articulosdetalle ad2 ON a.art_sec = ad2.art_sec AND ad2.lis_pre_cod = 2 AND ad2.bod_sec = '1'
          LEFT JOIN dbo.promociones_detalle pd ON a.art_sec = pd.art_sec AND pd.pro_det_estado = 'A'
          LEFT JOIN dbo.promociones p ON pd.pro_sec = p.pro_sec
              AND p.pro_activa = 'S'
              AND @fac_fec BETWEEN p.pro_fecha_inicio AND p.pro_fecha_fin
          WHERE a.art_sec = @art_sec
        `;

        const precioResult = await precioRequest
          .input('art_sec', sql.VarChar(30), detail.art_sec)
          .input('fac_fec', sql.Date, fac_fec || new Date())
          .query(precioQuery);
        
        precioInfo = precioResult.recordset[0] || {
          precio_detal: 0,
          precio_mayor: 0,
          precio_oferta: null,
          descuento_porcentaje: null,
          codigo_promocion: null,
          descripcion_promocion: null,
          tiene_oferta: 'N'
        };
        
        // Asegurar que si no tiene oferta, todos los campos de promoción sean NULL
        if (precioInfo.tiene_oferta !== 'S') {
          precioInfo.precio_oferta = null;
          precioInfo.descuento_porcentaje = null;
          precioInfo.codigo_promocion = null;
          precioInfo.descripcion_promocion = null;
          precioInfo.tiene_oferta = 'N';
        }
        
        console.log(`[UPDATE_ORDER] Calculando información de promociones localmente para artículo ${detail.art_sec}:`, {
          tiene_oferta: precioInfo.tiene_oferta,
          codigo_promocion: precioInfo.codigo_promocion,
          precio_oferta: precioInfo.precio_oferta,
          descuento_porcentaje: precioInfo.descuento_porcentaje,
          razon: 'Campos de promoción no válidos o no presentes, recalculando desde BD'
        });
      }

      // 5.2 Crear una nueva instancia de Request para cada insert
      // Respetar detail.kar_total cuando viene del cliente (COT→VTA con cupón); si no, recalcular.
      const insertDetailRequest = new sql.Request(transaction);
      let kar_total;
      let kar_des_uno = descuento;
      if (detail.kar_total != null && Number(detail.kar_total) > 0) {
        kar_total = Number(detail.kar_total);
        const subtotalLinea = Number(detail.kar_uni) * Number(detail.kar_pre_pub);
        if (subtotalLinea > 0) {
          kar_des_uno = ((subtotalLinea - kar_total) / subtotalLinea) * 100;
        }
      } else {
        kar_total = Number(detail.kar_uni) * Number(detail.kar_pre_pub);
        if (descuento > 0) {
          kar_total = kar_total * (1 - (descuento / 100));
        }
      }

      // Obtener costo histórico — lógica bundle-aware (misma lógica que createCompleteOrder):
      //   Componente de bundle (kar_bundle_padre != null) → costo = 0 (capturado en el padre)
      //   Bundle padre (tiene componentes en detallesExpandidos)  → costo = suma de costos de componentes / kar_uni padre
      //   Producto simple                                         → costo desde articulosdetalle
      let kar_cos;
      if (detail.kar_bundle_padre !== null && detail.kar_bundle_padre !== undefined) {
        // Es componente: su costo queda en 0, el padre absorbe el costo total
        kar_cos = 0;
      } else {
        const compsBundlePadre = detallesExpandidos.filter(d =>
          d.kar_bundle_padre !== null &&
          d.kar_bundle_padre !== undefined &&
          String(d.kar_bundle_padre) === String(detail.art_sec)
        );
        if (compsBundlePadre.length > 0) {
          // Es bundle padre: costo unitario = suma de (unidades × costo_unitario_componente) / unidades del bundle
          const totalCostoComponentes = compsBundlePadre.reduce((sum, comp) => {
            return sum + (Number(comp.kar_uni) * (costosMap.get(String(comp.art_sec)) || 0));
          }, 0);
          const karUniBundlePadre = Number(detail.kar_uni) || 1;
          kar_cos = karUniBundlePadre > 0 ? totalCostoComponentes / karUniBundlePadre : 0;
        } else {
          // Producto simple: costo desde articulosdetalle
          kar_cos = costosMap.get(String(detail.art_sec)) || 0;
        }
      }

      await insertDetailRequest
        .input('fac_sec', sql.Decimal(18, 0), fac_sec)
        .input('NewKarSec', sql.Int, newKarSec)
        .input('art_sec', sql.VarChar(50), detail.art_sec)
        // SPEC-014 §5.1: naturaleza del documento (expandirBundles ya la puso en cada línea).
        .input('kar_nat', sql.VarChar(1), detail.kar_nat || karNat)
        .input('kar_uni', sql.Decimal(17, 2), detail.kar_uni)
        .input('kar_pre_pub', sql.Decimal(17, 2), detail.kar_pre_pub)
        .input('kar_lis_pre_cod', sql.Int, detail.kar_lis_pre_cod)
        .input('kar_des_uno', sql.Decimal(11, 5), kar_des_uno)
        .input('kar_total', sql.Decimal(17, 2), kar_total)
        .input('kar_kar_sec_ori', sql.Int, detail.kar_kar_sec_ori)
        .input('kar_fac_sec_ori', sql.Decimal(18, 0), detail.kar_fac_sec_ori)
        // Campos de precios y ofertas
        .input('kar_pre_pub_detal', sql.Decimal(17, 2), precioInfo.precio_detal)
        .input('kar_pre_pub_mayor', sql.Decimal(17, 2), precioInfo.precio_mayor)
        .input('kar_tiene_oferta', sql.Char(1), precioInfo.tiene_oferta)
        .input('kar_precio_oferta', sql.Decimal(17, 2), precioInfo.precio_oferta)
        .input('kar_descuento_porcentaje', sql.Decimal(5, 2), precioInfo.descuento_porcentaje)
        .input('kar_codigo_promocion', sql.VarChar(20), precioInfo.codigo_promocion)
        .input('kar_descripcion_promocion', sql.VarChar(200), precioInfo.descripcion_promocion)
        .input('kar_bundle_padre', sql.VarChar(30), detail.kar_bundle_padre ?? null)
        .input('kar_cos', sql.Decimal(18, 4), kar_cos)
        .query(`
          INSERT INTO dbo.facturakardes
            (fac_sec, kar_sec, art_sec, kar_bod_sec, kar_uni, kar_nat, kar_pre_pub, kar_total, kar_lis_pre_cod, kar_des_uno, kar_kar_sec_ori, kar_fac_sec_ori,
             kar_pre_pub_detal, kar_pre_pub_mayor, kar_tiene_oferta, kar_precio_oferta, kar_descuento_porcentaje, kar_codigo_promocion, kar_descripcion_promocion, kar_bundle_padre, kar_cos)
          VALUES
            (@fac_sec, @NewKarSec, @art_sec, '1', @kar_uni, @kar_nat, @kar_pre_pub, @kar_total, @kar_lis_pre_cod, @kar_des_uno, @kar_kar_sec_ori, @kar_fac_sec_ori,
             @kar_pre_pub_detal, @kar_pre_pub_mayor, @kar_tiene_oferta, @kar_precio_oferta, @kar_descuento_porcentaje, @kar_codigo_promocion, @kar_descripcion_promocion, @kar_bundle_padre, @kar_cos)
        `);

      // Si existe kar_fac_sec_ori, actualizar fac_nro_origen en la tabla factura
      if (detail.kar_fac_sec_ori) {
        const updateOriginRequest = new sql.Request(transaction);
        const updateOriginQuery = `
          UPDATE f
          SET f.fac_nro_origen = fo.fac_nro
          FROM dbo.factura f
          INNER JOIN dbo.factura fo ON fo.fac_sec = @kar_fac_sec_ori
          WHERE f.fac_sec = @fac_sec
            AND fo.fac_est_fac = 'A'
        `;
        await updateOriginRequest
          .input('fac_sec', sql.Decimal(18, 0), fac_sec)
          .input('kar_fac_sec_ori', sql.Decimal(18, 0), detail.kar_fac_sec_ori)
          .query(updateOriginQuery);
      }
    }

    await transaction.commit();

    // Post-commit, punto único. VTA: stock + estado del pedido Woo. REM: stock de la unión de artículos
    // (los que salieron de la remisión recuperan existencia en Woo), origen REM_EDITADA.
    let push = null;
    if (tipoReal === 'VTA') {
      push = await postCommitVentaWoo({ detalles, fac_nro, fac_nro_woo: fac_nro_woo || cab.fac_nro_woo, origen: 'VTA', usuario });
    } else if (tipoReal === 'REM') {
      const art_secs = [...new Set([...artSecsPrevios, ...detallesExpandidos.map((d) => String(d.art_sec))])];
      try {
        push = await sincronizarExistenciasWoo({ art_secs, origen: 'REM_EDITADA', referencia: fac_nro, usuario });
      } catch (e) {
        console.error(`[WOO] push tras editar ${fac_nro} falló:`, e.message);
      }
    }

    return { message: "Pedido actualizado exitosamente.", fac_nro, fac_tip_cod: tipoReal, push };
  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error("Error en rollback:", rollbackError);
      }
    }
    throw error;
  }
};


const getOrdenes = async ({ FechaDesde, FechaHasta, nit_ide, nit_nom, fac_nro, fac_est_fac, PageNumber, PageSize, fue_cod, fac_nro_woo, fac_usu_cod_cre }) => {
  try {
    console.log('[getOrdenes] Parámetros recibidos:', {
      FechaDesde, FechaHasta, nit_ide, nit_nom, fac_nro, fac_est_fac, PageNumber, PageSize, fue_cod, fac_nro_woo,fac_usu_cod_cre
    });

    const pool = await poolPromise;
    const request = pool.request();

    // Declarar e ingresar parámetros
    request.input('FechaDesde', sql.Date, FechaDesde);
    request.input('FechaHasta', sql.Date, FechaHasta);
    request.input('nit_ide', sql.VarChar(16), nit_ide || null);
    request.input('nit_nom', sql.VarChar(100), nit_nom || null);
    request.input('fac_nro', sql.VarChar(15), fac_nro || null);
    request.input('fac_nro_woo', sql.VarChar(15), fac_nro_woo || null);
    request.input('fac_est_fac', sql.Char(1), fac_est_fac || null);
    request.input('PageNumber', sql.Int, PageNumber);
    request.input('PageSize', sql.Int, PageSize);
    request.input('fue_cod', sql.Int, fue_cod);
    request.input('fac_usu_cod_cre', sql.VarChar(100), fac_usu_cod_cre || null);
    const query = `
    SELECT
        f.fac_fec,
        n.nit_ide,
        n.nit_nom,
        f.fac_nro,
        f.fac_tip_cod,
        f.fac_nro_woo,
        f.fac_est_woo,
        f.fac_est_fac,
        SUM(fd.kar_total) - ISNULL(MAX(f.fac_descuento_general), 0) AS total_pedido,
        ISNULL(MAX(f.fac_descuento_general), 0) AS descuento_general,
        -- SPEC-014 §5.2: documento activo de tipo posterior cruzado con este (COT → REM/VTA, REM → VTA).
        -- Con valor, el documento está bloqueado (no se edita ni se anula).
        (SELECT STRING_AGG(fac_nro_origen, ', ')
         FROM (SELECT DISTINCT f.fac_nro_origen
               FROM factura f2
               WHERE f2.fac_nro = f.fac_nro_origen
               AND f2.fac_est_fac = 'A'
               AND ((f.fac_tip_cod = 'COT' AND f2.fac_tip_cod IN ('REM', 'VTA'))
                 OR (f.fac_tip_cod = 'REM' AND f2.fac_tip_cod = 'VTA'))) AS docs) as documentos,
        f.fac_vence_el,
        f.fac_usu_cod_cre,
        -- Rentabilidad real de la factura
        SUM(fd.kar_uni * ISNULL(fd.kar_cos, 0)) AS costo_total_factura,
        SUM(fd.kar_total) - SUM(fd.kar_uni * ISNULL(fd.kar_cos, 0)) AS utilidad_bruta_factura,
        CASE
          WHEN SUM(fd.kar_total) > 0
          THEN ((SUM(fd.kar_total) - SUM(fd.kar_uni * ISNULL(fd.kar_cos, 0))) / SUM(fd.kar_total) * 100)
          ELSE 0
        END AS rentabilidad_real_factura
    FROM dbo.factura f
    INNER JOIN dbo.nit n
        ON f.nit_sec = n.nit_sec
    INNER JOIN dbo.facturakardes fd
        ON f.fac_sec = fd.fac_sec
    INNER JOIN dbo.tipo_comprobantes tc
        ON f.f_tip_cod = tc.tip_cod
    WHERE f.fac_fec >= @FechaDesde
      AND f.fac_fec <= @FechaHasta
      AND tc.fue_cod = @fue_cod
      AND (@nit_ide IS NULL OR n.nit_ide = @nit_ide)
      AND (@fac_usu_cod_cre IS NULL OR f.fac_usu_cod_cre = @fac_usu_cod_cre)
      AND (@nit_nom IS NULL OR n.nit_nom LIKE '%' + @nit_nom + '%')
      AND (@fac_nro IS NULL OR f.fac_nro = @fac_nro)
      AND (@fac_nro_woo IS NULL OR f.fac_nro_woo = @fac_nro_woo)
      AND (@fac_est_fac IS NULL OR f.fac_est_fac = @fac_est_fac)
    GROUP BY 
        f.fac_fec, n.nit_ide, n.nit_nom, f.fac_nro, f.fac_tip_cod, f.fac_nro_woo, f.fac_est_woo, f.fac_est_fac, f.fac_nro_origen, f.fac_usu_cod_cre, f.fac_sec, f.fac_vence_el
    ORDER BY f.fac_fec DESC, f.fac_nro  ASC
    OFFSET (@PageNumber - 1) * @PageSize ROWS
    FETCH NEXT @PageSize ROWS ONLY;
    `;

    const result = await request.query(query);

    console.log(`[getOrdenes] Consulta ejecutada correctamente. Registros devueltos: ${result.recordset.length}`);

    return result.recordset;
  } catch (error) {
    console.error('[getOrdenes] Error al ejecutar la consulta:', {
      error: error.message,
      stack: error.stack,
      FechaDesde, FechaHasta, nit_ide, nit_nom, fac_nro, fac_est_fac, PageNumber, PageSize, fue_cod, fac_nro_woo
    });
    throw error;
  }
};


const getOrder = async (fac_nro) => {
  try {
    const pool = await poolPromise;

    // Consulta del encabezado (header)
    const headerQuery = `
      SELECT 
        f.fac_sec,
        f.fac_fec,
        f.fac_tip_cod,
        f.nit_sec,
        n.nit_ide,
        n.nit_nom,
        n.nit_dir,
        n.nit_tel,
        n.nit_email,
        f.fac_nro,
        f.fac_nro_woo,
        f.fac_est_fac,
        f.fac_descuento_general,
        f.fac_total_woo,
        f.fac_obs,
        f.fac_est_woo,
        f.fac_nro_origen,
        f.fac_vence_el,
        c.ciu_nom
      FROM dbo.factura f
      LEFT JOIN dbo.nit n ON n.nit_sec = f.nit_sec
      LEFT JOIN dbo.Ciudad c ON c.ciu_cod = n.ciu_cod
      WHERE f.fac_nro = @fac_nro;
    `;
    const headerResult = await pool.request()
      .input('fac_nro', sql.VarChar(15), fac_nro)
      .query(headerQuery);

    if (headerResult.recordset.length === 0) {
      throw new Error("Pedido no encontrado.");
    }

    const header = headerResult.recordset[0];
    const fac_sec = header.fac_sec;

    // SPEC-014 §5.2: bloqueo por vínculo y documento del que nace, para que el POS muestre lo que puede hacer.
    const destino = await destinoActivo(pool, { fac_sec: Number(fac_sec) });
    header.bloqueado = !!destino;
    header.bloqueado_por = destino ? destino.fac_nro : null;
    header.bloqueado_por_tipo = destino ? destino.fac_tip_cod : null;
    // "origen" = el documento anterior cruzado (COT de una REM/VTA; REM de una VTA): distinto del destino.
    header.origen = header.fac_nro_origen && !(destino && destino.fac_nro === header.fac_nro_origen) ? header.fac_nro_origen : null;

    // Consulta de los detalles, usando los campos guardados en facturakardes
    const detailQuery = `
      SELECT
        fd.*,
        -- Usar los precios guardados en facturakardes para consistencia histórica
        fd.kar_pre_pub_detal AS precio_detal_original,
        fd.kar_pre_pub_mayor AS precio_mayor_original,
        -- Los precios con oferta ya están calculados en kar_pre_pub
        fd.kar_pre_pub AS precio_detal,
        fd.kar_pre_pub AS precio_mayor,
        -- Información de oferta guardada
        fd.kar_precio_oferta AS precio_oferta,
        fd.kar_descuento_porcentaje AS descuento_porcentaje,
        fd.kar_codigo_promocion AS codigo_promocion,
        fd.kar_descripcion_promocion AS descripcion_promocion,
        fd.kar_tiene_oferta AS tiene_oferta,
        -- Identificación de líneas bundle
        CASE
          WHEN fd.kar_bundle_padre IS NOT NULL AND fd.kar_bundle_padre != ''
          THEN 1 ELSE 0
        END AS es_componente_bundle,
        -- Información de rentabilidad real por producto
        -- Componentes de bundle tienen kar_cos=0 (costo absorbido por el padre), por lo que
        -- costo_total_linea=0, utilidad_linea=0 y rentabilidad_real=NULL (sin significado individual)
        ISNULL(fd.kar_cos, 0) AS costo_unitario,
        (fd.kar_uni * ISNULL(fd.kar_cos, 0)) AS costo_total_linea,
        CASE
          WHEN fd.kar_bundle_padre IS NOT NULL AND fd.kar_bundle_padre != '' THEN 0
          ELSE (fd.kar_total - (fd.kar_uni * ISNULL(fd.kar_cos, 0)))
        END AS utilidad_linea,
        CASE
          WHEN fd.kar_bundle_padre IS NOT NULL AND fd.kar_bundle_padre != '' THEN NULL
          WHEN fd.kar_total > 0
          THEN ((fd.kar_total - (fd.kar_uni * ISNULL(fd.kar_cos, 0))) / fd.kar_total * 100)
          ELSE 0
        END AS rentabilidad_real,
        vw.existencia,
        -- SPEC-014 §5.10: lo que puede vender este documento = existencia + lo que él mismo ya descontó
        CASE WHEN fd.kar_nat = '-' THEN ISNULL(vw.existencia, 0) + fd.kar_uni ELSE ISNULL(vw.existencia, 0) END AS existencia_disponible,
        a.art_cod,
		    a.art_nom,
        a.art_url_img_servi,
        ISNULL(a.art_bundle, 'N') AS art_bundle
      FROM dbo.facturakardes fd
      INNER JOIN dbo.articulos a ON fd.art_sec = a.art_sec
      LEFT JOIN dbo.vwExistencias vw
        ON a.art_sec = vw.art_sec
      WHERE fd.fac_sec = @fac_sec
      ORDER BY fd.kar_sec;
    `;

    const detailResult = await pool.request()
      .input('fac_sec', sql.Decimal(18, 0), fac_sec)
      .query(detailQuery);

    const details = detailResult.recordset;

    // Total factura: kar_total ya incluye descuentos de cupón por línea.
    // total_final = totalDetalles (no restar descuentoGeneral para evitar doble resta; cupón ya está en kar_total).
    // fac_descuento_general = solo fee_lines, se expone como descuento_general informativo.
    const totalDetalles = details.reduce((sum, detail) => sum + parseFloat(detail.kar_total || 0), 0);
    const descuentoGeneral = parseFloat(header.fac_descuento_general || 0);
    const totalFinal = totalDetalles;

    // Agregar información de totales al header
    header.total_detalles = totalDetalles;
    header.descuento_general = descuentoGeneral;
    header.total_final = totalFinal;

    return { header, details };
  } catch (error) {
    throw error;
  }
};

const _createCompleteOrderInternal = async ({
  nit_sec,
  fac_usu_cod_cre,
  fac_tip_cod,
  detalles,
  descuento,
  lis_pre_cod,
  fac_nro_woo,
  fac_obs,
  fac_fec, // Nuevo parámetro opcional
  fac_descuento_general, // Nuevo parámetro opcional para descuento general
  // SPEC-013 Fase 2 (remisiones web): el importador crea la REM con el estado y el total del
  // pedido Woo ya conocidos. Opcionales: el resto de caminos (POS, COT→VTA) no los mandan.
  fac_est_woo = null,
  fac_total_woo = null,
  // SPEC-014: vencimiento de la REM (undefined → hoy + REM_DIAS_VENCIMIENTO; null → sin vencimiento)
  // y si esta función debe empujar la REM a Woo (crearRemision ya lo hace por su cuenta).
  fac_vence_el = undefined,
  pushWoo = true
}) => {
  let transaction;
  try {
    const pool = await poolPromise;
    if (!['COT', 'REM', 'VTA'].includes(fac_tip_cod)) throw errorNegocio(`Tipo de documento no soportado: ${fac_tip_cod}`, 400);
    // SPEC-014 §5.1: la naturaleza la decide el tipo, nunca el payload (COT 'C', REM/VTA '-').
    const karNat = naturalezaKardex(fac_tip_cod);
    // expandirBundles evita duplicar componentes: si llegan bundle + componentes (COT→VTA),
    // las líneas que ya fueron añadidas como componentes se omiten.
    const detallesExpandidos = await expandirBundles(pool, detalles, karNat);

    transaction = new sql.Transaction(pool);
    await transaction.begin();

    // SPEC-014 §2.2: origen (COT) activo y libre; nunca una REM por este camino.
    const origenes = await validarOrigenes(transaction, fac_tip_cod, detallesExpandidos);
    const cotOrigen = origenes.length === 1 ? origenes[0] : null;

    // Validación previa para facturas de venta
    if (fac_tip_cod === 'VTA' && fac_nro_woo) {
      const validationRequest = new sql.Request(transaction);
      const validationQuery = `
        SELECT COUNT(*) as existe
        FROM dbo.factura 
        WHERE fac_nro_woo = @fac_nro_woo 
          AND fac_est_fac = 'A'
          AND fac_tip_cod = 'VTA'
      `;
      
      const validationResult = await validationRequest
        .input('fac_nro_woo', sql.VarChar(16), fac_nro_woo)
        .query(validationQuery);

      if (validationResult.recordset[0].existe > 0) {
        throw new Error(`Ya existe una factura de venta activa con el número de WooCommerce: ${fac_nro_woo}`);
      }
    }

    // Remisión web (SPEC-013): una sola REM vigente (activa o ya facturada) por pedido Woo.
    // El índice UX_factura_woo_vigente lo garantiza en BD; esta validación da un error legible.
    // SPEC-014: una REM manual (POS) no tiene fac_nro_woo y no pasa por aquí.
    if (fac_tip_cod === 'REM' && fac_nro_woo) {
      const remRes = await new sql.Request(transaction)
        .input('fac_nro_woo', sql.VarChar(16), String(fac_nro_woo))
        .query(`
          SELECT TOP 1 fac_nro, fac_est_fac
          FROM dbo.factura
          WHERE fac_nro_woo = @fac_nro_woo AND fac_tip_cod = 'REM' AND fac_est_fac IN ('A','F')
        `);
      if (remRes.recordset.length > 0) {
        const r = remRes.recordset[0];
        throw new Error(`Ya existe la remisión ${r.fac_nro} (${r.fac_est_fac === 'A' ? 'activa' : 'facturada'}) para el pedido Woo ${fac_nro_woo}`);
      }
    }

    // Usamos un Request vinculado a la transacción para operaciones de encabezado
    const request = new sql.Request(transaction);

    // 1. Obtener el nuevo consecutivo para fac_sec desde la tabla secuencia (para 'FACTURA')
    const seqQuery = `
      SELECT sec_num + 1 AS NewFacSec
      FROM dbo.secuencia WITH (UPDLOCK, HOLDLOCK)
      WHERE sec_cod = 'FACTURA'
    `;
    const seqResult = await request.query(seqQuery);
    if (!seqResult.recordset || seqResult.recordset.length === 0) {
      throw new Error("No se encontró la secuencia para 'FACTURA'");
    }
    const NewFacSec = seqResult.recordset[0].NewFacSec;

    // Actualizar la secuencia para FACTURA
    await request.input('sec_cod', sql.VarChar(50), 'FACTURA')
      .query("UPDATE dbo.secuencia SET sec_num = sec_num + 1 WHERE sec_cod = @sec_cod");

    // 2. Obtener el nuevo consecutivo para fac_nro desde la tabla tipo_comprobantes, usando el parámetro fac_tip_cod
    const tipRequest = new sql.Request(transaction);
    tipRequest.input('fac_tip_cod', sql.VarChar(5), fac_tip_cod);
    const tipQuery = `
      SELECT tip_con_sec + 1 AS NewConsecFacNro
      FROM dbo.tipo_comprobantes WITH (UPDLOCK, HOLDLOCK)
      WHERE tip_cod = @fac_tip_cod
    `;
    const tipResult = await tipRequest.query(tipQuery);
    if (!tipResult.recordset || tipResult.recordset.length === 0) {
      throw new Error("No se encontró el consecutivo para el tipo de comprobante en tipo_comprobantes");
    }
    const NewConsecFacNro = tipResult.recordset[0].NewConsecFacNro;

    // Actualizar el consecutivo en tipo_comprobantes con un Request nuevo
    const updateTipRequest = new sql.Request(transaction);
    updateTipRequest.input('fac_tip_cod', sql.VarChar(5), fac_tip_cod);
    await updateTipRequest.query("UPDATE dbo.tipo_comprobantes SET tip_con_sec = tip_con_sec + 1 WHERE tip_cod = @fac_tip_cod");

    // 3. Construir el número de factura final concatenando fac_tip_cod y el nuevo consecutivo
    const FinalFacNro = fac_tip_cod + String(NewConsecFacNro);

    // 4. Insertar el encabezado en la tabla factura
    // SPEC-014: fac_vence_el solo para REM (spec §2.5); fac_nro_origen = COT de la que nace (§2.2).
    const venceEl = fac_tip_cod === 'REM' ? (fac_vence_el === undefined ? calcularVencimientoRem() : fac_vence_el) : null;
    const insertHeaderQuery = `
      INSERT INTO dbo.factura 
        (fac_sec, fac_fec, f_tip_cod, fac_tip_cod, nit_sec, fac_nro, fac_est_fac, fac_fch_cre, fac_usu_cod_cre, fac_nro_woo, fac_obs, fac_est_woo, fac_descuento_general, fac_total_woo, fac_vence_el, fac_nro_origen)
      VALUES
        (@NewFacSec, @fac_fec, @fac_tip_cod, @fac_tip_cod, @nit_sec, @FinalFacNro, 'A', GETDATE(), @fac_usu_cod_cre, @fac_nro_woo, @fac_obs, @fac_est_woo, @fac_descuento_general, @fac_total_woo, @fac_vence_el, @fac_nro_origen);
    `;
    await request.input('NewFacSec', sql.Decimal(18, 0), NewFacSec)
      .input('fac_tip_cod', sql.VarChar(5), fac_tip_cod)
      .input('nit_sec', sql.VarChar(16), nit_sec)
      .input('FinalFacNro', sql.VarChar(20), FinalFacNro)
      .input('fac_nro_woo', sql.VarChar(16), fac_nro_woo)
      .input('fac_obs', sql.VarChar, fac_obs)
      .input('fac_usu_cod_cre', sql.VarChar(100), fac_usu_cod_cre)
      .input('fac_fec', sql.Date, fac_fec || new Date()) // Usa la fecha proporcionada o la fecha actual
      .input('fac_est_woo', sql.VarChar(50), fac_est_woo ?? null) // null salvo que lo mande el importador (REM)
      .input('fac_descuento_general', sql.Decimal(17, 2), fac_descuento_general || 0) // Usar el valor proporcionado o 0 por defecto
      .input('fac_total_woo', sql.Decimal(17, 2), fac_total_woo != null && Number(fac_total_woo) > 0 ? Number(fac_total_woo) : null)
      .input('fac_vence_el', sql.DateTime2(0), venceEl)
      .input('fac_nro_origen', sql.NVarChar(15), cotOrigen ? cotOrigen.fac_nro : null)
      .query(insertHeaderQuery);

    // 4.5 Obtener costos promedio de todos los artículos en una sola query
    const art_secs_create = detallesExpandidos.map(d => String(d.art_sec));
    const costosMapCreate = await obtenerCostosPromedioMultiples(transaction, art_secs_create);

    // 5. Insertar cada detalle en la tabla facturakardes (bundles ya expandidos)
    for (const detalle of detallesExpandidos) {
      // 5.1 Obtener el nuevo número de línea (kar_sec) para el detalle
      const detailRequest = new sql.Request(transaction);
      detailRequest.input('fac_sec', sql.Decimal(18, 0), NewFacSec);
      const karSecQuery = `
        SELECT ISNULL(MAX(kar_sec), 0) + 1 AS NewKarSec 
        FROM dbo.facturakardes 
        WHERE fac_sec = @fac_sec
      `;
      const karSecResult = await detailRequest.query(karSecQuery);
      const NewKarSec = karSecResult.recordset[0].NewKarSec;

      // 5.2 Usar información de precios y ofertas que viene desde syncWooOrders o calcular si no está disponible
      let precioInfo;
      
      // Verificar si los campos de promociones están presentes en el detalle y son válidos
      // Validar que no sean undefined, null o cadenas vacías
      const tieneCamposPromocion = detalle.kar_pre_pub_detal !== undefined && 
                                    detalle.kar_pre_pub_mayor !== undefined && 
                                    detalle.kar_tiene_oferta !== undefined && 
                                    detalle.kar_codigo_promocion !== undefined &&
                                    detalle.kar_pre_pub_detal !== null &&
                                    detalle.kar_pre_pub_mayor !== null &&
                                    detalle.kar_tiene_oferta !== null &&
                                    detalle.kar_tiene_oferta !== '';
      
      if (tieneCamposPromocion) {
        // Usar los valores que vienen desde syncWooOrders
        precioInfo = {
          precio_detal: detalle.kar_pre_pub_detal || 0,
          precio_mayor: detalle.kar_pre_pub_mayor || 0,
          precio_oferta: detalle.kar_precio_oferta || null,
          descuento_porcentaje: detalle.kar_descuento_porcentaje || null,
          codigo_promocion: detalle.kar_codigo_promocion || null,
          descripcion_promocion: detalle.kar_descripcion_promocion || null,
          tiene_oferta: detalle.kar_tiene_oferta || 'N'
        };
        
        // Asegurar que si no tiene oferta, todos los campos de promoción sean NULL
        if (precioInfo.tiene_oferta !== 'S') {
          precioInfo.precio_oferta = null;
          precioInfo.descuento_porcentaje = null;
          precioInfo.codigo_promocion = null;
          precioInfo.descripcion_promocion = null;
          precioInfo.tiene_oferta = 'N';
        }
        
        console.log(`[CREATE_ORDER] Usando información de promociones desde syncWooOrders para artículo ${detalle.art_sec}:`, {
          tiene_oferta: precioInfo.tiene_oferta,
          codigo_promocion: precioInfo.codigo_promocion,
          precio_oferta: precioInfo.precio_oferta,
          descuento_porcentaje: precioInfo.descuento_porcentaje
        });
      } else {
        // Calcular información de precios y ofertas del artículo (para casos no sincronizados desde WooCommerce)
        const precioRequest = new sql.Request(transaction);
        const precioQuery = `
          SELECT 
            ISNULL(ad1.art_bod_pre, 0) AS precio_detal,
            ISNULL(ad2.art_bod_pre, 0) AS precio_mayor,
            -- Solo devolver valores de promoción si la promoción está realmente activa
            CASE 
                WHEN p.pro_codigo IS NOT NULL
                     AND ((pd.pro_det_precio_oferta IS NOT NULL AND pd.pro_det_precio_oferta > 0) 
                          OR (pd.pro_det_descuento_porcentaje IS NOT NULL AND pd.pro_det_descuento_porcentaje > 0))
                THEN pd.pro_det_precio_oferta
                ELSE NULL
            END AS precio_oferta,
            CASE 
                WHEN p.pro_codigo IS NOT NULL
                     AND ((pd.pro_det_precio_oferta IS NOT NULL AND pd.pro_det_precio_oferta > 0) 
                          OR (pd.pro_det_descuento_porcentaje IS NOT NULL AND pd.pro_det_descuento_porcentaje > 0))
                THEN pd.pro_det_descuento_porcentaje
                ELSE NULL
            END AS descuento_porcentaje,
            p.pro_codigo AS codigo_promocion,
            p.pro_descripcion AS descripcion_promocion,
            CASE 
                -- Solo marcar como oferta si la promoción está realmente activa (p.pro_codigo IS NOT NULL)
                -- Y tiene valores válidos de precio o descuento
                WHEN p.pro_codigo IS NOT NULL
                     AND ((pd.pro_det_precio_oferta IS NOT NULL AND pd.pro_det_precio_oferta > 0) 
                          OR (pd.pro_det_descuento_porcentaje IS NOT NULL AND pd.pro_det_descuento_porcentaje > 0))
                THEN 'S' 
                ELSE 'N' 
            END AS tiene_oferta
          FROM dbo.articulos a
          LEFT JOIN dbo.articulosdetalle ad1 ON a.art_sec = ad1.art_sec AND ad1.lis_pre_cod = 1 AND ad1.bod_sec = '1'
          LEFT JOIN dbo.articulosdetalle ad2 ON a.art_sec = ad2.art_sec AND ad2.lis_pre_cod = 2 AND ad2.bod_sec = '1'
          LEFT JOIN dbo.promociones_detalle pd ON a.art_sec = pd.art_sec AND pd.pro_det_estado = 'A'
          LEFT JOIN dbo.promociones p ON pd.pro_sec = p.pro_sec
              AND p.pro_activa = 'S'
              AND @fac_fec BETWEEN p.pro_fecha_inicio AND p.pro_fecha_fin
          WHERE a.art_sec = @art_sec
        `;

        const precioResult = await precioRequest
          .input('art_sec', sql.VarChar(30), detalle.art_sec)
          .input('fac_fec', sql.Date, fac_fec || new Date())
          .query(precioQuery);
        
        precioInfo = precioResult.recordset[0] || {
          precio_detal: 0,
          precio_mayor: 0,
          precio_oferta: null,
          descuento_porcentaje: null,
          codigo_promocion: null,
          descripcion_promocion: null,
          tiene_oferta: 'N'
        };
        
        // Asegurar que si no tiene oferta, todos los campos de promoción sean NULL
        if (precioInfo.tiene_oferta !== 'S') {
          precioInfo.precio_oferta = null;
          precioInfo.descuento_porcentaje = null;
          precioInfo.codigo_promocion = null;
          precioInfo.descripcion_promocion = null;
          precioInfo.tiene_oferta = 'N';
        }
        
        console.log(`[CREATE_ORDER] Calculando información de promociones localmente para artículo ${detalle.art_sec}:`, {
          tiene_oferta: precioInfo.tiene_oferta,
          codigo_promocion: precioInfo.codigo_promocion,
          precio_oferta: precioInfo.precio_oferta,
          descuento_porcentaje: precioInfo.descuento_porcentaje,
          razon: 'Campos de promoción no válidos o no presentes, recalculando desde BD'
        });
      }

      // Respetar detalle.kar_total cuando viene del cliente (COT→VTA con cupón); si no, recalcular.
      let kar_total;
      let kar_des_uno_create = descuento;
      if (detalle.kar_total != null && Number(detalle.kar_total) > 0) {
        kar_total = Number(detalle.kar_total);
        const subtotalLinea = Number(detalle.kar_uni) * Number(detalle.kar_pre_pub);
        if (subtotalLinea > 0) {
          kar_des_uno_create = ((subtotalLinea - kar_total) / subtotalLinea) * 100;
        }
      } else {
        kar_total = Number(detalle.kar_uni) * Number(detalle.kar_pre_pub);
        if (descuento > 0) {
          kar_total = kar_total * (1 - (descuento / 100));
        }
      }

      // 5.3 Insertar el detalle usando un Request nuevo con los campos adicionales
      const insertRequest = new sql.Request(transaction);
      insertRequest.input('fac_sec', sql.Decimal(18, 0), NewFacSec);
      insertRequest.input('NewKarSec', sql.Int, NewKarSec);
      insertRequest.input('art_sec', sql.VarChar(30), detalle.art_sec);
      // SPEC-014 §5.1: naturaleza del documento (expandirBundles ya la puso en cada línea).
      insertRequest.input('kar_nat', sql.VarChar(1), detalle.kar_nat || karNat);
      insertRequest.input('kar_uni', sql.Decimal(17, 2), detalle.kar_uni);
      insertRequest.input('kar_pre_pub', sql.Decimal(17, 2), detalle.kar_pre_pub);
      insertRequest.input('kar_des_uno', sql.Decimal(11, 5), kar_des_uno_create);
      insertRequest.input('lis_pre_cod', sql.Int, lis_pre_cod);
      insertRequest.input('kar_kar_sec_ori', sql.Int, detalle.kar_kar_sec_ori);
      insertRequest.input('kar_fac_sec_ori', sql.Int, detalle.kar_fac_sec_ori);

      // Campos de precios y ofertas
      insertRequest.input('kar_pre_pub_detal', sql.Decimal(17, 2), precioInfo.precio_detal);
      insertRequest.input('kar_pre_pub_mayor', sql.Decimal(17, 2), precioInfo.precio_mayor);
      insertRequest.input('kar_tiene_oferta', sql.Char(1), precioInfo.tiene_oferta);
      insertRequest.input('kar_precio_oferta', sql.Decimal(17, 2), precioInfo.precio_oferta);
      insertRequest.input('kar_descuento_porcentaje', sql.Decimal(5, 2), precioInfo.descuento_porcentaje);
      insertRequest.input('kar_codigo_promocion', sql.VarChar(20), precioInfo.codigo_promocion);
      insertRequest.input('kar_descripcion_promocion', sql.VarChar(200), precioInfo.descripcion_promocion);
      insertRequest.input('kar_bundle_padre', sql.VarChar(30), detalle.kar_bundle_padre ?? null);
      insertRequest.input('kar_total', sql.Decimal(17, 2), kar_total);

      // Obtener costo histórico — lógica bundle-aware:
      //   Componente de bundle (kar_bundle_padre != null) → costo = 0 (capturado en el padre)
      //   Bundle padre (tiene componentes en detallesExpandidos)  → costo = suma de costos de componentes / kar_uni padre
      //   Producto simple                                         → costo desde articulosdetalle
      let kar_cos_create;
      if (detalle.kar_bundle_padre !== null && detalle.kar_bundle_padre !== undefined) {
        // Es componente: su costo queda en 0, el padre absorbe el costo total
        kar_cos_create = 0;
      } else {
        const compsBundlePadre = detallesExpandidos.filter(d =>
          d.kar_bundle_padre !== null &&
          d.kar_bundle_padre !== undefined &&
          String(d.kar_bundle_padre) === String(detalle.art_sec)
        );
        if (compsBundlePadre.length > 0) {
          // Es bundle padre: costo unitario = suma de (unidades × costo_unitario_componente) / unidades del bundle
          const totalCostoComponentes = compsBundlePadre.reduce((sum, comp) => {
            return sum + (Number(comp.kar_uni) * (costosMapCreate.get(String(comp.art_sec)) || 0));
          }, 0);
          const karUniBundlePadre = Number(detalle.kar_uni) || 1;
          kar_cos_create = karUniBundlePadre > 0 ? totalCostoComponentes / karUniBundlePadre : 0;
        } else {
          // Producto simple: costo desde articulosdetalle
          kar_cos_create = costosMapCreate.get(String(detalle.art_sec)) || 0;
        }
      }
      insertRequest.input('kar_cos', sql.Decimal(18, 4), kar_cos_create);

      const insertDetailQuery = `
        INSERT INTO dbo.facturakardes
          (fac_sec, kar_sec, art_sec, kar_bod_sec, kar_uni, kar_nat, kar_pre_pub, kar_total, kar_lis_pre_cod, kar_des_uno, kar_kar_sec_ori, kar_fac_sec_ori,
           kar_pre_pub_detal, kar_pre_pub_mayor, kar_tiene_oferta, kar_precio_oferta, kar_descuento_porcentaje, kar_codigo_promocion, kar_descripcion_promocion, kar_bundle_padre, kar_cos)
        VALUES
          (@fac_sec, @NewKarSec, @art_sec, '1', @kar_uni, @kar_nat, @kar_pre_pub, @kar_total, @lis_pre_cod, @kar_des_uno, @kar_kar_sec_ori, @kar_fac_sec_ori,
           @kar_pre_pub_detal, @kar_pre_pub_mayor, @kar_tiene_oferta, @kar_precio_oferta, @kar_descuento_porcentaje, @kar_codigo_promocion, @kar_descripcion_promocion, @kar_bundle_padre, @kar_cos)
      `;
      await insertRequest.query(insertDetailQuery);
    }

    // 6. Cruce con la cotización de origen (SPEC-014 §2.2): la COT queda apuntando a este documento
    //    (REM o VTA) y desde ese momento está bloqueada mientras este siga activo.
    if (fac_tip_cod !== 'COT') {
      for (const o of origenes) {
        await new sql.Request(transaction)
          .input('cot_sec', sql.Decimal(18, 0), o.fac_sec)
          .input('FinalFacNro', sql.NVarChar(15), FinalFacNro)
          .query(`UPDATE dbo.factura SET fac_nro_origen = @FinalFacNro WHERE fac_sec = @cot_sec AND fac_tip_cod = 'COT'`);
      }
    }

    await transaction.commit();

    // Post-commit, punto único (SPEC-013). VTA: stock + estado del pedido Woo. REM: stock (REM_CREADA).
    let push = null;
    if (fac_tip_cod === 'VTA') {
      push = await postCommitVentaWoo({ detalles, fac_nro: FinalFacNro, fac_nro_woo, origen: 'VTA', usuario: fac_usu_cod_cre });
    } else if (fac_tip_cod === 'REM' && pushWoo) {
      try {
        push = await sincronizarDocumentoWoo({ fac_nro: FinalFacNro, origen: 'REM_CREADA', usuario: fac_usu_cod_cre });
      } catch (e) {
        console.error(`[WOO] push tras ${FinalFacNro} falló:`, e.message);
      }
    }

    return { fac_sec: NewFacSec, fac_nro: FinalFacNro, fac_vence_el: venceEl, fac_nro_origen: cotOrigen ? cotOrigen.fac_nro : null, push };
  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error("Error en rollback:", rollbackError);
      }
    }
    throw error;
  }
};

/**
 * Anula un documento (cabecera → 'I'). vwExistencias filtra fac_est_fac='A', así que con eso
 * todas sus líneas salen del cálculo de existencias de una vez.
 * @param {string} [usuario] usu_cod de quien anula: queda en fac_usu_cod_mod y en el log del push (SPEC-013 Fase 2).
 */
const anularDocumento = async ({ fac_nro, fac_tip_cod, fac_obs, usuario = null }) => {
  let transaction;
  try {
    const pool = await poolPromise;
    const headerRes = await pool.request()
      .input('fac_nro', sql.VarChar(15), fac_nro)
      .query(`
        SELECT fac_sec, fac_nro_woo, fac_fec, fac_est_woo, fac_est_fac, fac_tip_cod AS tipo_real, fac_nro_origen
        FROM dbo.factura 
        WHERE fac_nro = @fac_nro
      `);

    if (headerRes.recordset.length === 0) {
      throw errorNegocio("Documento no encontrado.", 404);
    }

    const { fac_sec, fac_nro_woo, fac_fec, fac_est_woo, fac_est_fac, tipo_real, fac_nro_origen } = headerRes.recordset[0];
    if (fac_est_fac !== 'A') {
      throw errorNegocio(`El documento ${fac_nro} no está activo (estado ${fac_est_fac}); no se puede anular.`);
    }
    if (fac_tip_cod && fac_tip_cod !== tipo_real) {
      throw errorNegocio(`${fac_nro} es una ${tipo_real}, no una ${fac_tip_cod}.`, 400);
    }
    // SPEC-014 §2.2: el origen no se anula mientras su destino esté activo (COT con REM/VTA, REM con VTA).
    const destino = await destinoActivo(pool, { fac_sec: Number(fac_sec) });
    if (destino) {
      throw errorNegocio(`${fac_nro} está cruzada con ${destino.fac_nro} (${destino.fac_tip_cod} activa); anule ${destino.fac_nro} primero.`);
    }
    
    console.log(`[ANULAR_DOCUMENTO] Estado actual del documento ${fac_nro}:`, {
      currentStatus: fac_est_woo, tipo: tipo_real, usuario
    });

    transaction = new sql.Transaction(pool);
    await transaction.begin();

    // fac_anu_obs / fac_anu_fec / fac_usu_cod_mod: columnas de auditoría de anulación que el
    // cierre de mes ya pobla (cierreMesModel.anularCotizacion); aquí no se escribían.
    const updateHeaderQuery = `
      UPDATE dbo.factura
      SET fac_est_fac = 'I',
          fac_obs = @fac_obs,
          fac_est_woo = @fac_est_woo,
          fac_anu_obs = @fac_obs,
          fac_anu_fec = GETDATE(),
          fac_usu_cod_mod = COALESCE(@usuario, fac_usu_cod_mod),
          fac_fch_mod = GETDATE()
      WHERE fac_sec = @fac_sec AND fac_est_fac = 'A'
    `;

    const updateHeaderRequest = new sql.Request(transaction);
    const upd = await updateHeaderRequest
      .input('fac_obs', sql.VarChar, fac_obs)
      .input('fac_sec', sql.Decimal(18, 0), fac_sec)
      .input('fac_est_woo', sql.VarChar(50), fac_est_woo) // Mantener el estado actual sin normalizar
      .input('usuario', sql.VarChar(100), usuario)
      .query(updateHeaderQuery);
    if (upd.rowsAffected[0] === 0) {
      throw new Error(`El documento ${fac_nro} ya no estaba activo (anulación concurrente).`);
    }

    let detalles = [];
    // Documentos que mueven kardex: al anularlos hay que empujar la existencia a Woo.
    if (tipo_real === 'VTA' || tipo_real === 'AJT' || tipo_real === 'REM') {
      const detallesRequest = new sql.Request(transaction);
      const detallesResult = await detallesRequest
        .input('fac_sec', sql.Decimal(18, 0), fac_sec)
        .query(`
          SELECT 
            fd.art_sec,
            fd.kar_uni,
            fd.kar_nat,
            fd.kar_pre_pub,
            fd.kar_lis_pre_cod,
            fd.kar_des_uno,
            fd.kar_total,
            fd.kar_kar_sec_ori,
            fd.kar_fac_sec_ori
          FROM dbo.facturakardes fd
          WHERE fd.fac_sec = @fac_sec
        `);

      detalles = detallesResult.recordset;
    }
    // SPEC-014 §5.5: una VTA respaldada por remisión (líneas 'R') no movió kardex; al anularla no hay
    // nada que empujar y la REM de origen vuelve a quedar editable/facturable (sigue descontando).
    const vtaRespaldada = tipo_real === 'VTA' && detalles.length > 0 && detalles.every((d) => d.kar_nat === NATURALEZA.RESPALDADA);

    await transaction.commit();

    // Solo stock (punto único). El estado del pedido en Woo NO se toca al anular: el camino anterior
    // reutilizaba el mapeo de facturación y, para on-hold, mandaba 'completed' (specs/013 §5, Tarea 2).
    let push = null;
    if (detalles.length > 0 && !vtaRespaldada) {
      push = await sincronizarExistenciasWoo({
        art_secs: detalles.map((d) => d.art_sec),
        origen: tipo_real === 'REM' ? 'REM_ANULADA' : 'ANULACION',
        referencia: fac_nro,
        usuario
      });
    }
    if (vtaRespaldada) {
      if (fac_nro_woo) {
        await agregarNotaPedidoWoo(fac_nro_woo, `Factura ${fac_nro} anulada en el ERP${usuario ? ` por ${usuario}` : ''}; la remisión ${fac_nro_origen || ''} sigue reservando el stock.`);
      }
      try {
        const { registrarVtaAnulada } = await pedidosWebModel();
        await registrarVtaAnulada({ fac_nro_vta: fac_nro, fac_nro_rem: fac_nro_origen, fac_nro_woo, usuario });
      } catch (e) {
        console.error(`[ANULAR_DOCUMENTO] seguimiento de pedidos web no actualizado tras anular ${fac_nro}:`, e.message);
      }
    }

    return {
      message: "Documento anulado exitosamente.",
      fac_nro,
      fac_est_fac: 'I',
      tipo: tipo_real,
      rem_liberada: vtaRespaldada ? fac_nro_origen : null,
      push
    };

  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error("Error en rollback:", rollbackError.message);
      }
    }
    throw error;
  }
};

// Wrapper con auto-recuperación de secuencia para createCompleteOrder
const createCompleteOrder = async (params) => {
  return ejecutarConAutoRecuperacion(
    () => _createCompleteOrderInternal(params),
    'createCompleteOrder'
  );
};

export { createCompleteOrder, getOrder, getOrdenes, updateOrder, anularDocumento };
