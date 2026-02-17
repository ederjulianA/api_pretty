// models/orderModel.js

import { sql, poolPromise } from "../db.js";
import { updateWooOrderStatusAndStock } from "../jobs/updateWooOrderStatusAndStock.js";
import { obtenerCostosPromedioMultiples } from "../utils/costoUtils.js";

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
const expandirBundles = async (pool, detalles, fac_tip_cod = null) => {
  /** art_sec que ya se añadieron como componentes de un bundle (evita duplicar al pasar COT→VTA) */
  const componentesYaAnadidos = new Set();
  const detallesExpandidos = [];
  
  // kar_nat por defecto: 'C' para cotizaciones (no afecta kardex), '-' para ventas
  const karNatDefault = fac_tip_cod === 'COT' ? 'C' : '-';

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
      kar_nat: detalle.kar_nat || karNatDefault
    });

    const componentes = await pool.request()
      .input('bundle_art_sec', sql.VarChar(30), artSec)
      .query(`
        SELECT ComArtSec, ConKarUni
        FROM dbo.articulosArmado
        WHERE art_sec = @bundle_art_sec
      `);

    const karUniBase = Number(detalle.kar_uni) || 1;
    const karNat = detalle.kar_nat || karNatDefault;

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
    if (componentesYaAnadidos.has(artSec)) continue;

    const articuloCheck = await pool.request()
      .input('art_sec', sql.VarChar(30), artSec)
      .query('SELECT art_bundle FROM dbo.articulos WHERE art_sec = @art_sec');

    if (articuloCheck.recordset?.[0]?.art_bundle === 'S') continue;

    detallesExpandidos.push({
      ...detalle,
      kar_bundle_padre: detalle.kar_bundle_padre ?? null
    });
  }

  return detallesExpandidos;
};




const updateOrder = async ({ fac_nro, fac_tip_cod, nit_sec, fac_est_fac, detalles, descuento, fac_nro_woo, fac_obs, fac_fec, fac_descuento_general, fac_est_woo }) => {
  let transaction;
  try {
    const pool = await poolPromise;
    // 1. Buscar el fac_sec correspondiente al fac_nro y obtener el estado actual
    const headerRes = await pool.request()
      .input('fac_nro', sql.VarChar(15), fac_nro)
      .query('SELECT fac_sec, fac_est_woo FROM dbo.factura WHERE fac_nro = @fac_nro');
    if (headerRes.recordset.length === 0) {
      throw new Error("Pedido no encontrado.");
    }
    const fac_sec = headerRes.recordset[0].fac_sec;
    const currentStatus = headerRes.recordset[0].fac_est_woo;
    
    // Si se proporciona fac_est_woo, usarlo; de lo contrario, mantener el estado actual
    const newStatus = fac_est_woo !== undefined ? fac_est_woo : currentStatus;
    
    console.log(`[UPDATE_ORDER] Estado actual del pedido ${fac_nro}:`, {
      currentStatus: currentStatus,
      willUpdateTo: newStatus
    });

    // 2. Iniciar la transacción
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    // 3. Actualizar el encabezado en la tabla factura con un nuevo Request
    // NOTA: NO normalizamos el estado aquí para que determineWooCommerceStatus pueda detectar correctamente el entorno
    const updateHeaderQuery = `
      UPDATE dbo.factura
      SET fac_tip_cod = @fac_tip_cod,
          nit_sec = @nit_sec,
          fac_est_fac = @fac_est_fac,
          fac_nro_woo = @fac_nro_woo,
          fac_obs = @fac_obs,
          fac_est_woo = @fac_est_woo
          ${fac_fec ? ', fac_fec = @fac_fec' : ''}
          ${fac_descuento_general !== undefined ? ', fac_descuento_general = @fac_descuento_general' : ''}
      WHERE fac_sec = @fac_sec
    `;

    const updateHeaderRequest = new sql.Request(transaction);
    updateHeaderRequest
      .input('fac_tip_cod', sql.VarChar(5), fac_tip_cod)
      .input('nit_sec', sql.VarChar(16), nit_sec)
      .input('fac_est_fac', sql.Char(1), fac_est_fac)
      .input('fac_sec', sql.Decimal(18, 0), fac_sec)
      .input('fac_nro_woo', sql.VarChar(15), fac_nro_woo)
      .input('fac_obs', sql.VarChar, fac_obs)
      .input('fac_est_woo', sql.VarChar(50), newStatus); // Usar el nuevo estado o mantener el actual

    // Solo agregar el parámetro de fecha si se proporciona
    if (fac_fec) {
      updateHeaderRequest.input('fac_fec', sql.Date, fac_fec);
    }
    
    // Solo agregar el parámetro de descuento general si se proporciona
    if (fac_descuento_general !== undefined) {
      updateHeaderRequest.input('fac_descuento_general', sql.Decimal(17, 2), fac_descuento_general);
    }

    await updateHeaderRequest.query(updateHeaderQuery);

    // 4. Expandir bundles antes de eliminar detalles (para mantener consistencia con createCompleteOrder)
    const detallesExpandidos = await expandirBundles(pool, detalles, fac_tip_cod);

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
          LEFT JOIN dbo.articulosdetalle ad1 ON a.art_sec = ad1.art_sec AND ad1.lis_pre_cod = 1
          LEFT JOIN dbo.articulosdetalle ad2 ON a.art_sec = ad2.art_sec AND ad2.lis_pre_cod = 2
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
      const insertDetailRequest = new sql.Request(transaction);
      let kar_total = Number(detail.kar_uni) * Number(detail.kar_pre_pub);
      if (descuento > 0) {
        kar_total = kar_total * (1 - (descuento / 100))
      }

      // Obtener costo histórico del mapa
      const kar_cos = costosMap.get(String(detail.art_sec)) || 0;

      await insertDetailRequest
        .input('fac_sec', sql.Decimal(18, 0), fac_sec)
        .input('NewKarSec', sql.Int, newKarSec)
        .input('art_sec', sql.VarChar(50), detail.art_sec)
        // kar_nat: 'C' para cotizaciones (no afecta kardex), usar el del detalle o por defecto según fac_tip_cod
        .input('kar_nat', sql.VarChar(1), detail.kar_nat || (fac_tip_cod === 'COT' ? 'C' : '-'))
        .input('kar_uni', sql.Decimal(17, 2), detail.kar_uni)
        .input('kar_pre_pub', sql.Decimal(17, 2), detail.kar_pre_pub)
        .input('kar_lis_pre_cod', sql.Int, detail.kar_lis_pre_cod)
        .input('kar_des_uno', sql.Decimal(11, 5), descuento)
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

    // Si se confirma como factura (fac_tip_cod = 'VTA'), actualizar el estado y el inventario en WooCommerce
    if (fac_tip_cod === 'VTA' && detalles.length < 90) {
      try {
        // Procesar en lotes más pequeños para Vercel
        const BATCH_SIZE = 10; // Reducir el tamaño del lote para Vercel
        const batches = [];
        
        for (let i = 0; i < detalles.length; i += BATCH_SIZE) {
          batches.push(detalles.slice(i, i + BATCH_SIZE));
        }

        // Procesar cada lote secuencialmente
        for (const batch of batches) {
          await updateWooOrderStatusAndStock(
            fac_nro_woo,
            batch,
            fac_fec,
            fac_nro,
            'N'
          );
        }
      } catch (error) {
        console.error("Error updating WooCommerce:", error);
        // No lanzamos el error para no afectar la transacción principal
      }
    } else if (fac_tip_cod === 'VTA' && detalles.length >= 90) {
      console.log("Skipping WooCommerce update due to large number of items (>90)");
    }

    return { message: "Pedido actualizado exitosamente." };
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
        (SELECT STRING_AGG(fac_nro_origen, ', ')
         FROM (SELECT DISTINCT f.fac_nro_origen
               FROM factura f2
               WHERE f2.fac_nro = f.fac_nro_origen
               AND f2.fac_est_fac = 'A'
               AND f2.fac_tip_cod = 'VTA') AS docs) as documentos,
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
        f.fac_fec, n.nit_ide, n.nit_nom, f.fac_nro, f.fac_tip_cod, f.fac_nro_woo, f.fac_est_woo, f.fac_est_fac, f.fac_nro_origen, f.fac_usu_cod_cre, f.fac_sec
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
        -- Información de rentabilidad real por producto
        ISNULL(fd.kar_cos, 0) AS costo_unitario,
        (fd.kar_uni * ISNULL(fd.kar_cos, 0)) AS costo_total_linea,
        (fd.kar_total - (fd.kar_uni * ISNULL(fd.kar_cos, 0))) AS utilidad_linea,
        CASE
          WHEN fd.kar_total > 0
          THEN ((fd.kar_total - (fd.kar_uni * ISNULL(fd.kar_cos, 0))) / fd.kar_total * 100)
          ELSE 0
        END AS rentabilidad_real,
        vw.existencia,
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

    // Calcular el total de la factura incluyendo el descuento general
    const totalDetalles = details.reduce((sum, detail) => sum + parseFloat(detail.kar_total || 0), 0);
    const descuentoGeneral = parseFloat(header.fac_descuento_general || 0);
    const totalFinal = totalDetalles - descuentoGeneral;

    // Agregar información de totales al header
    header.total_detalles = totalDetalles;
    header.descuento_general = descuentoGeneral;
    header.total_final = totalFinal;

    return { header, details };
  } catch (error) {
    throw error;
  }
};

const createCompleteOrder = async ({
  nit_sec,
  fac_usu_cod_cre,
  fac_tip_cod,
  detalles,
  descuento,
  lis_pre_cod,
  fac_nro_woo,
  fac_obs,
  fac_fec, // Nuevo parámetro opcional
  fac_descuento_general // Nuevo parámetro opcional para descuento general
}) => {
  let transaction;
  try {
    const pool = await poolPromise;
    // expandirBundles evita duplicar componentes: si llegan bundle + componentes (COT→VTA),
    // las líneas que ya fueron añadidas como componentes se omiten.
    // Pasar fac_tip_cod para que use 'C' en cotizaciones (no afecta kardex)
    const detallesExpandidos = await expandirBundles(pool, detalles, fac_tip_cod);

    transaction = new sql.Transaction(pool);
    await transaction.begin();

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
    const insertHeaderQuery = `
      INSERT INTO dbo.factura 
        (fac_sec, fac_fec, f_tip_cod, fac_tip_cod, nit_sec, fac_nro, fac_est_fac, fac_fch_cre, fac_usu_cod_cre, fac_nro_woo, fac_obs, fac_est_woo, fac_descuento_general)
      VALUES
        (@NewFacSec, @fac_fec, @fac_tip_cod, @fac_tip_cod, @nit_sec, @FinalFacNro, 'A', GETDATE(), @fac_usu_cod_cre, @fac_nro_woo, @fac_obs, @fac_est_woo, @fac_descuento_general);
    `;
    await request.input('NewFacSec', sql.Decimal(18, 0), NewFacSec)
      .input('fac_tip_cod', sql.VarChar(5), fac_tip_cod)
      .input('nit_sec', sql.VarChar(16), nit_sec)
      .input('FinalFacNro', sql.VarChar(20), FinalFacNro)
      .input('fac_nro_woo', sql.VarChar(16), fac_nro_woo)
      .input('fac_obs', sql.VarChar, fac_obs)
      .input('fac_usu_cod_cre', sql.VarChar(100), fac_usu_cod_cre)
      .input('fac_fec', sql.Date, fac_fec || new Date()) // Usa la fecha proporcionada o la fecha actual
      .input('fac_est_woo', sql.VarChar(50), null) // Inicializar como null para nuevos pedidos
      .input('fac_descuento_general', sql.Decimal(17, 2), fac_descuento_general || 0) // Usar el valor proporcionado o 0 por defecto
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
          LEFT JOIN dbo.articulosdetalle ad1 ON a.art_sec = ad1.art_sec AND ad1.lis_pre_cod = 1
          LEFT JOIN dbo.articulosdetalle ad2 ON a.art_sec = ad2.art_sec AND ad2.lis_pre_cod = 2
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

      // 5.3 Insertar el detalle usando un Request nuevo con los campos adicionales
      const insertRequest = new sql.Request(transaction);
      insertRequest.input('fac_sec', sql.Decimal(18, 0), NewFacSec);
      insertRequest.input('NewKarSec', sql.Int, NewKarSec);
      insertRequest.input('art_sec', sql.VarChar(30), detalle.art_sec);
      // kar_nat: 'C' para cotizaciones (no afecta kardex), '-' para ventas, '+' para entradas
      // Las cotizaciones (COT) NO deben afectar el inventario/kardex
      const karNatDefault = fac_tip_cod === 'COT' ? 'C' : '-';
      insertRequest.input('kar_nat', sql.VarChar(1), detalle.kar_nat || karNatDefault);
      insertRequest.input('kar_uni', sql.Decimal(17, 2), detalle.kar_uni);
      insertRequest.input('kar_pre_pub', sql.Decimal(17, 2), detalle.kar_pre_pub);
      insertRequest.input('kar_des_uno', sql.Decimal(11, 5), descuento);
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

      let kar_total = Number(detalle.kar_uni) * Number(detalle.kar_pre_pub);
      if (descuento > 0) {
        kar_total = kar_total * (1 - (descuento / 100));
      }
      insertRequest.input('kar_total', sql.Decimal(17, 2), kar_total);

      // Obtener costo histórico del mapa
      const kar_cos_create = costosMapCreate.get(String(detalle.art_sec)) || 0;
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

      // Si existe kar_fac_sec_ori, actualizar fac_nro_origen en la tabla factura
      if (detalle.kar_fac_sec_ori && fac_tip_cod === 'VTA') {
        const updateOriginRequest = new sql.Request(transaction);
        const updateOriginQuery = `
          UPDATE f
          SET f.fac_nro_origen = @FinalFacNro
          FROM dbo.factura f
          WHERE f.fac_sec = @kar_fac_sec_ori
            AND f.fac_tip_cod = 'COT'
        `;
        await updateOriginRequest
          .input('kar_fac_sec_ori', sql.Decimal(18, 0), detalle.kar_fac_sec_ori)
          .input('FinalFacNro', sql.VarChar(20), FinalFacNro)
          .query(updateOriginQuery);
      }
    }

    await transaction.commit();

    // Si se confirma como factura (fac_tip_cod = 'VTA'), actualizar el estado y el inventario en WooCommerce
    if (fac_tip_cod === 'VTA' && detalles.length < 90) {
      try {
        // Procesar en lotes más pequeños para Vercel
        const BATCH_SIZE = 10; // Reducir el tamaño del lote para Vercel
        const batches = [];
        
        for (let i = 0; i < detalles.length; i += BATCH_SIZE) {
          batches.push(detalles.slice(i, i + BATCH_SIZE));
        }

        // Procesar cada lote secuencialmente
        for (const batch of batches) {
          await updateWooOrderStatusAndStock(
            fac_nro_woo,
            batch,
            fac_fec,
            FinalFacNro,  // Usar FinalFacNro en lugar de fac_nro
            'N'
          );
        }
      } catch (error) {
        console.error("Error updating WooCommerce:", error);
        // No lanzamos el error para no afectar la transacción principal
      }
    } else if (fac_tip_cod === 'VTA' && detalles.length >= 90) {
      console.log("Skipping WooCommerce update due to large number of items (>90)");
    }

    return { fac_sec: NewFacSec, fac_nro: FinalFacNro };
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

const anularDocumento = async ({ fac_nro, fac_tip_cod, fac_obs }) => {
  let transaction;
  try {
    const pool = await poolPromise;
    const headerRes = await pool.request()
      .input('fac_nro', sql.VarChar(15), fac_nro)
      .query(`
        SELECT fac_sec, fac_nro_woo, fac_fec, fac_est_woo 
        FROM dbo.factura 
        WHERE fac_nro = @fac_nro
      `);

    if (headerRes.recordset.length === 0) {
      throw new Error("Documento no encontrado.");
    }

    const { fac_sec, fac_nro_woo, fac_fec, fac_est_woo } = headerRes.recordset[0];
    
    console.log(`[ANULAR_DOCUMENTO] Estado actual del documento ${fac_nro}:`, {
      currentStatus: fac_est_woo
    });

    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const updateHeaderQuery = `
      UPDATE dbo.factura
      SET fac_est_fac = 'I',
          fac_obs = @fac_obs,
          fac_est_woo = @fac_est_woo
      WHERE fac_sec = @fac_sec
    `;

    const updateHeaderRequest = new sql.Request(transaction);
    await updateHeaderRequest
      .input('fac_obs', sql.VarChar, fac_obs)
      .input('fac_sec', sql.Decimal(18, 0), fac_sec)
      .input('fac_est_woo', sql.VarChar(50), fac_est_woo) // Mantener el estado actual sin normalizar
      .query(updateHeaderQuery);

    let detalles = [];
    if (fac_tip_cod === 'VTA' || fac_tip_cod === 'AJT') {
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

    await transaction.commit();

    if (detalles.length > 0 && detalles.length < 90) {
      try {
        await updateWooOrderStatusAndStock(fac_nro_woo, detalles, fac_fec, fac_nro,'N');
      } catch (wooError) {
        console.error('Error al actualizar WooCommerce:', wooError.message);
      }
    } else if (detalles.length >= 90) {
      console.log("Skipping WooCommerce update due to large number of items (>90)");
    }

    return {
      message: "Documento anulado exitosamente.",
      fac_nro,
      fac_est_fac: 'I',
      tipo: fac_tip_cod
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

export { createCompleteOrder, getOrder, getOrdenes, updateOrder, anularDocumento };
