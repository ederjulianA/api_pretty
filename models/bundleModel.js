/**
 * Modelo de artículos armados (bundles).
 * CommonJS. No modifica articulosModel.js.
 * Referencia: implementaciones_2026/articulos_bundle/MODELO_DATOS_REFERENCIA.md
 * Sync WooCommerce: implementaciones_2026/articulos_bundle/BUNDLE_WOOCOMMERCE_SYNC_BACKEND.md
 */

const { sql, poolPromise } = require('../db.js');
const WooCommerceRestApi = require('@woocommerce/woocommerce-rest-api').default;
const cloudinary = require('../config/cloudinary');
const { v4: uuidv4 } = require('uuid');
const ProductPhoto = require('./ProductPhoto');

const wcApi = new WooCommerceRestApi({
  url: process.env.WC_URL,
  consumerKey: process.env.WC_CONSUMER_KEY,
  consumerSecret: process.env.WC_CONSUMER_SECRET,
  version: 'wc/v3'
});

/**
 * Genera la descripción HTML del bundle para WooCommerce (lista de componentes).
 * @param {Array<{ art_nom: string, art_cod?: string, cantidad: number }>} componentes
 * @returns {string}
 */
function generarDescripcionBundleHTML(componentes) {
  let html = '<div class="bundle-contents" style="background:#f9f9f9;padding:15px;border-radius:5px;margin:10px 0;">';
  html += '<h3 style="color:#333;margin-top:0;">🎁 Este combo incluye:</h3>';
  html += '<ul style="list-style:none;padding:0;">';
  for (const comp of componentes) {
    html += '<li style="padding:5px 0;border-bottom:1px solid #eee;">';
    html += `<strong style="color:#e91e63;">${Number(comp.cantidad) || 1}×</strong> `;
    html += `<span style="font-size:16px;">${(comp.art_nom || '').replace(/</g, '&lt;')}</span>`;
    if (comp.art_cod) {
      html += ` <small style="color:#999;">(${String(comp.art_cod).replace(/</g, '&lt;')})</small>`;
    }
    html += '</li>';
  }
  html += '</ul></div>';
  html += '<p style="color:#666;font-size:14px;"><em>Todos los productos incluidos en el combo se despacharán juntos.</em></p>';
  return html;
}

/**
 * Crea o actualiza el producto bundle en WooCommerce (type: 'simple' con descripción de componentes).
 * Si art_woo_id existe, actualiza (PUT); si no, crea (POST).
 * No lanza si falla; solo registra y devuelve null para art_woo_id.
 * @param {Object} params
 * @param {string} params.art_sec
 * @param {string} params.art_nom
 * @param {string} params.art_cod
 * @param {number} params.precio_detal
 * @param {number} params.precio_mayor
 * @param {Array<{ art_nom: string, art_cod?: string, cantidad: number }>} params.componentes
 * @param {number} params.inv_sub_gru_cod
 * @param {Array<string>} [params.imageUrls] - URLs de imágenes en Cloudinary
 * @param {number} [params.art_woo_id] - ID de WooCommerce existente (para actualizar)
 * @returns {Promise<number|null>} art_woo_id o null
 */
async function syncBundleToWooCommerce({ art_sec, art_nom, art_cod, precio_detal, precio_mayor, componentes, inv_sub_gru_cod, imageUrls = [], art_woo_id = null }) {
  if (!process.env.WC_URL || !process.env.WC_CONSUMER_KEY || !process.env.WC_CONSUMER_SECRET) {
    console.warn('[bundleModel] WooCommerce env no configurado, omitiendo sync.');
    return null;
  }
  try {
    const pool = await poolPromise;
    const categories = [];
    const catResult = await pool.request()
      .input('inv_sub_gru_cod', sql.SmallInt, parseInt(inv_sub_gru_cod, 10))
      .query(`
        SELECT g.inv_gru_woo_id, s.inv_sub_gru_woo_id
        FROM dbo.inventario_subgrupo s
        INNER JOIN dbo.inventario_grupo g ON g.inv_gru_cod = s.inv_gru_cod
        WHERE s.inv_sub_gru_cod = @inv_sub_gru_cod
      `);
    if (catResult.recordset?.length) {
      const { inv_gru_woo_id, inv_sub_gru_woo_id } = catResult.recordset[0];
      if (inv_gru_woo_id) categories.push({ id: parseInt(inv_gru_woo_id, 10) });
      if (inv_sub_gru_woo_id) categories.push({ id: parseInt(inv_sub_gru_woo_id, 10) });
    }

    const shortDesc = componentes.map(c => `${c.cantidad || 1}x ${c.art_nom || ''}`).join(', ');
    const wooData = {
      name: art_nom,
      type: 'simple',
      sku: art_cod,
      regular_price: String(precio_detal),
      description: generarDescripcionBundleHTML(componentes),
      short_description: `Incluye: ${shortDesc}`,
      manage_stock: true,
      stock_quantity: 0,
      meta_data: [
        { key: '_precio_mayorista', value: String(precio_mayor) },
        { key: '_es_bundle', value: 'S' },
        { key: '_bundle_componentes_count', value: String(componentes.length) },
        { key: '_bundle_componentes_json', value: JSON.stringify(componentes) }
      ],
      categories,
      images: imageUrls.map(url => ({ src: url }))
    };

    let wooProduct;
    const isUpdate = art_woo_id != null && art_woo_id > 0;
    
    if (isUpdate) {
      // Actualizar producto existente
      wooProduct = await wcApi.put(`products/${art_woo_id}`, wooData);
      console.log('[bundleModel] Bundle actualizado en WooCommerce, art_woo_id:', art_woo_id);
      return art_woo_id;
    } else {
      // Crear nuevo producto
      wooProduct = await wcApi.post('products', wooData);
      const newArtWooId = wooProduct?.data?.id;
      if (newArtWooId != null) {
        await pool.request()
          .input('art_woo_id', sql.Int, newArtWooId)
          .input('art_sec', sql.VarChar(30), art_sec)
          .query('UPDATE dbo.articulos SET art_woo_id = @art_woo_id WHERE art_sec = @art_sec');
        console.log('[bundleModel] Bundle sincronizado a WooCommerce, art_woo_id:', newArtWooId);
        return newArtWooId;
      }
      return null;
    }
  } catch (err) {
    console.error('[bundleModel] Error sync bundle a WooCommerce:', err.message);
    return null;
  }
}

/**
 * Crea un bundle: artículo con art_bundle='S' + precios + componentes en articulosArmado.
 * @param {Object} params
 * @param {string} params.art_nom - Nombre del bundle
 * @param {string} params.art_cod - Código único del bundle
 * @param {number} params.inv_sub_gru_cod - Subcategoría (inv_sub_gru_cod)
 * @param {number} params.precio_detal - Precio lista detal
 * @param {number} params.precio_mayor - Precio lista mayor
 * @param {Array<{ art_sec: string, cantidad: number }>} params.componentes - Lista de componentes
 * @param {Array} [params.images] - Archivos de imágenes (opcional, con .data, .mimetype, .size)
 * @returns {Promise<{ art_sec, art_cod, art_bundle, componentes_count, art_woo_id, imageUrls }>}
 */
const createBundle = async ({ art_nom, art_cod, inv_sub_gru_cod, precio_detal, precio_mayor, componentes, images = [] }) => {
  if (!componentes || componentes.length === 0) {
    throw new Error('El bundle debe tener al menos un componente.');
  }

  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  let imageUrls = [];

  try {
    await transaction.begin();
    const request = new sql.Request(transaction);

    // 1. Siguiente art_sec desde secuencia
    const secResult = await request.query(`
      SELECT sec_num + 1 AS NewArtSec
      FROM dbo.secuencia WITH (UPDLOCK, HOLDLOCK)
      WHERE sec_cod = 'ARTICULOS'
    `);
    if (!secResult.recordset?.length) {
      throw new Error("No se encontró la secuencia 'ARTICULOS'.");
    }
    const art_sec = secResult.recordset[0].NewArtSec;
    const art_secStr = String(art_sec);

    await request
      .input('newSecNum', sql.Decimal(18, 0), art_sec)
      .query(`
        UPDATE dbo.secuencia
        SET sec_num = @newSecNum
        WHERE sec_cod = 'ARTICULOS'
      `);

    // 2. Insertar en articulos (con art_bundle = 'S')
    await request
      .input('art_sec', sql.VarChar(30), art_secStr)
      .input('art_cod', sql.VarChar(30), art_cod)
      .input('art_nom', sql.VarChar(100), art_nom)
      .input('inv_sub_gru_cod', sql.SmallInt, parseInt(inv_sub_gru_cod, 10))
      .query(`
        INSERT INTO dbo.articulos (art_sec, art_cod, art_nom, inv_sub_gru_cod, pre_sec, art_bundle)
        VALUES (@art_sec, @art_cod, @art_nom, @inv_sub_gru_cod, '1', 'S')
      `);

    // 3. Subir imágenes a Cloudinary y guardar primera en art_url_img_servi
    if (images && images.length > 0) {
      try {
        const uploadPromises = images.map(async (image, index) => {
          const base64Image = `data:${image.mimetype};base64,${image.data.toString('base64')}`;
          const result = await cloudinary.uploader.upload(base64Image, {
            folder: 'bundles',
            public_id: `${art_cod}_${index + 1}`
          });
          return result.secure_url;
        });
        imageUrls = await Promise.all(uploadPromises);
        if (imageUrls.length > 0) {
          await request
            .input('imageUrl', sql.VarChar(500), imageUrls[0])
            .input('artSecImage', sql.VarChar(30), art_secStr)
            .query(`
              UPDATE dbo.articulos
              SET art_url_img_servi = @imageUrl
              WHERE art_sec = @artSecImage
            `);
        }
      } catch (cloudinaryError) {
        console.error('[bundleModel] Error subiendo imágenes a Cloudinary:', cloudinaryError.message);
      }
    }

    // 4. Precios en articulosdetalle (lista 1 = detal, 2 = mayor)
    await request
      .input('artSecDetal', sql.VarChar(30), art_secStr)
      .input('precio_detal', sql.Decimal(17, 2), precio_detal)
      .query(`
        INSERT INTO dbo.articulosdetalle (art_sec, bod_sec, lis_pre_cod, art_bod_pre)
        VALUES (@artSecDetal, '1', 1, @precio_detal)
      `);

    await request
      .input('artSecMayor', sql.VarChar(30), art_secStr)
      .input('precio_mayor', sql.Decimal(17, 2), precio_mayor)
      .query(`
        INSERT INTO dbo.articulosdetalle (art_sec, bod_sec, lis_pre_cod, art_bod_pre)
        VALUES (@artSecMayor, '1', 2, @precio_mayor)
      `);

    // 5. Componentes en articulosArmado (ComArtSec, ConKarUni) - nuevo Request por ítem para evitar parámetros duplicados
    for (const comp of componentes) {
      const compSec = comp.art_sec != null ? String(comp.art_sec) : '';
      const qty = parseInt(comp.cantidad, 10) || 1;
      if (!compSec) continue;

      const compRequest = new sql.Request(transaction);
      await compRequest
        .input('art_sec', sql.VarChar(30), art_secStr)
        .input('ComArtSec', sql.VarChar(30), compSec)
        .input('ConKarUni', sql.Int, qty)
        .query(`
          INSERT INTO dbo.articulosArmado (art_sec, ComArtSec, ConKarUni)
          VALUES (@art_sec, @ComArtSec, @ConKarUni)
        `);
    }

    await transaction.commit();

    let art_woo_id = null;
    let wooProduct = null;
    try {
      const data = await getBundleComponents(art_secStr);
      if (data?.componentes?.length) {
        art_woo_id = await syncBundleToWooCommerce({
          art_sec: art_secStr,
          art_nom,
          art_cod,
          precio_detal,
          precio_mayor,
          componentes: data.componentes.map(c => ({
            art_nom: c.art_nom,
            art_cod: c.art_cod,
            cantidad: c.cantidad
          })),
          inv_sub_gru_cod,
          imageUrls
        });
        if (art_woo_id != null && imageUrls.length > 0) {
          wooProduct = await wcApi.get(`products/${art_woo_id}`);
        }
      }
    } catch (syncErr) {
      console.error('[bundleModel] Sync WooCommerce después de createBundle:', syncErr.message);
    }

    // Registrar fotos en producto_fotos
    if (wooProduct?.data?.images && wooProduct.data.images.length > 0) {
      for (let i = 0; i < wooProduct.data.images.length; i++) {
        const image = wooProduct.data.images[i];
        const originalImage = images[i];
        try {
          const photo = new ProductPhoto({
            id: uuidv4(),
            art_sec: art_secStr,
            nombre: `${art_cod}_${i + 1}`,
            url: image.src,
            tipo: originalImage ? originalImage.mimetype : 'image/jpeg',
            tamanio: originalImage ? originalImage.size : 0,
            fecha_creacion: new Date(),
            woo_photo_id: image.id.toString(),
            es_principal: i === 0,
            posicion: i,
            estado: 'woo'
          });
          await photo.save();
        } catch (photoErr) {
          console.error('[bundleModel] Error guardando foto en producto_fotos:', photoErr.message);
        }
      }
    }

    return {
      art_sec: art_secStr,
      art_cod,
      art_bundle: 'S',
      componentes_count: componentes.length,
      art_woo_id,
      imageUrls
    };
  } catch (err) {
    if (transaction._aborted !== true) {
      try { await transaction.rollback(); } catch (_) {}
    }
    throw err;
  }
};

/**
 * Obtiene el bundle y sus componentes con stock.
 * @param {string} art_sec - art_sec del bundle
 * @returns {Promise<{ bundle: object, componentes: Array }>}
 */
const getBundleComponents = async (art_sec) => {
  const pool = await poolPromise;
  const art_secStr = String(art_sec);

  const bundleResult = await pool.request()
    .input('art_sec', sql.VarChar(30), art_secStr)
    .query(`
      SELECT
        a.art_sec,
        a.art_cod,
        a.art_nom,
        a.art_bundle,
        ad1.art_bod_pre AS precio_detal,
        ad2.art_bod_pre AS precio_mayor,
        ISNULL(ve.existencia, 0) AS stock_bundle
      FROM dbo.articulos a
      LEFT JOIN dbo.articulosdetalle ad1 ON a.art_sec = ad1.art_sec AND ad1.lis_pre_cod = 1 AND ad1.bod_sec = '1'
      LEFT JOIN dbo.articulosdetalle ad2 ON a.art_sec = ad2.art_sec AND ad2.lis_pre_cod = 2 AND ad2.bod_sec = '1'
      LEFT JOIN dbo.vwExistencias ve ON ve.art_sec = a.art_sec
      WHERE a.art_sec = @art_sec
    `);

  if (!bundleResult.recordset?.length) {
    return null;
  }

  const bundleRow = bundleResult.recordset[0];
  if (bundleRow.art_bundle !== 'S') {
    return { bundle: mapBundleRow(bundleRow), componentes: [] };
  }

  const compResult = await pool.request()
    .input('art_sec', sql.VarChar(30), art_secStr)
    .query(`
      SELECT
        c.art_sec,
        c.art_cod,
        c.art_nom,
        aa.ConKarUni AS cantidad,
        ISNULL(ve.existencia, 0) AS stock_disponible
      FROM dbo.articulosArmado aa
      INNER JOIN dbo.articulos c ON c.art_sec = aa.ComArtSec
      LEFT JOIN dbo.vwExistencias ve ON ve.art_sec = aa.ComArtSec
      WHERE aa.art_sec = @art_sec
    `);

  const componentes = (compResult.recordset || []).map(r => ({
    art_sec: r.art_sec,
    art_cod: r.art_cod,
    art_nom: r.art_nom,
    cantidad: r.cantidad,
    stock_disponible: r.stock_disponible
  }));

  return {
    bundle: mapBundleRow(bundleRow),
    componentes
  };
};

function mapBundleRow(r) {
  return {
    art_sec: r.art_sec,
    art_cod: r.art_cod,
    art_nom: r.art_nom,
    precio_detal: r.precio_detal,
    precio_mayor: r.precio_mayor,
    stock_bundle: r.stock_bundle,
    art_bundle: r.art_bundle
  };
}

/**
 * Actualiza los componentes de un bundle (reemplaza todos) y sincroniza con WooCommerce.
 * @param {string} art_sec - art_sec del bundle
 * @param {Array<{ art_sec: string, cantidad: number }>} componentes
 * @returns {Promise<{ updated: boolean, art_woo_id?: number }>}
 */
const updateBundleComponents = async (art_sec, componentes) => {
  const pool = await poolPromise;
  const art_secStr = String(art_sec);

  // Obtener datos del bundle antes de la transacción
  const bundleData = await pool.request()
    .input('art_sec', sql.VarChar(30), art_secStr)
    .query(`
      SELECT 
        a.art_sec, 
        a.art_bundle, 
        a.art_nom, 
        a.art_cod, 
        a.art_woo_id,
        a.inv_sub_gru_cod,
        ad1.art_bod_pre AS precio_detal,
        ad2.art_bod_pre AS precio_mayor
      FROM dbo.articulos a
      LEFT JOIN dbo.articulosdetalle ad1 ON a.art_sec = ad1.art_sec AND ad1.lis_pre_cod = 1 AND ad1.bod_sec = '1'
      LEFT JOIN dbo.articulosdetalle ad2 ON a.art_sec = ad2.art_sec AND ad2.lis_pre_cod = 2 AND ad2.bod_sec = '1'
      WHERE a.art_sec = @art_sec
    `);

  if (!bundleData.recordset?.length) {
    throw new Error('Bundle no encontrado.');
  }
  if (bundleData.recordset[0].art_bundle !== 'S') {
    throw new Error('El artículo no es un bundle.');
  }

  const bundle = bundleData.recordset[0];
  const art_woo_id = bundle.art_woo_id;

  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    const request = new sql.Request(transaction);

    await request
      .input('art_sec', sql.VarChar(30), art_secStr)
      .query(`
        DELETE FROM dbo.articulosArmado WHERE art_sec = @art_sec
      `);

    if (componentes && componentes.length > 0) {
      for (const comp of componentes) {
        const compSec = comp.art_sec != null ? String(comp.art_sec) : '';
        const qty = parseInt(comp.cantidad, 10) || 1;
        if (!compSec) continue;

        const compRequest = new sql.Request(transaction);
        await compRequest
          .input('art_sec', sql.VarChar(30), art_secStr)
          .input('ComArtSec', sql.VarChar(30), compSec)
          .input('ConKarUni', sql.Int, qty)
          .query(`
            INSERT INTO dbo.articulosArmado (art_sec, ComArtSec, ConKarUni)
            VALUES (@art_sec, @ComArtSec, @ConKarUni)
          `);
      }
    }

    await transaction.commit();

    // Sincronizar con WooCommerce después del commit
    let syncWooId = null;
    try {
      const data = await getBundleComponents(art_secStr);
      if (data?.componentes?.length) {
        syncWooId = await syncBundleToWooCommerce({
          art_sec: art_secStr,
          art_nom: bundle.art_nom,
          art_cod: bundle.art_cod,
          precio_detal: Number(bundle.precio_detal || 0),
          precio_mayor: Number(bundle.precio_mayor || 0),
          componentes: data.componentes.map(c => ({
            art_nom: c.art_nom,
            art_cod: c.art_cod,
            cantidad: c.cantidad
          })),
          inv_sub_gru_cod: bundle.inv_sub_gru_cod,
          art_woo_id: art_woo_id // Pasar art_woo_id existente para actualizar
        });
      }
    } catch (syncErr) {
      console.error('[bundleModel] Sync WooCommerce después de updateBundleComponents:', syncErr.message);
    }

    return { 
      updated: true,
      art_woo_id: syncWooId || art_woo_id
    };
  } catch (err) {
    if (transaction._aborted !== true) {
      try { await transaction.rollback(); } catch (_) {}
    }
    throw err;
  }
};

/**
 * Valida stock del bundle y de cada componente para una cantidad dada.
 * @param {string} art_sec - art_sec del bundle
 * @param {number} cantidad_bundle - Cantidad de bundles a validar
 * @returns {Promise<{ puede_vender: boolean, detalles: Array }>}
 */
const validateBundleStock = async (art_sec, cantidad_bundle) => {
  const pool = await poolPromise;
  const art_secStr = String(art_sec);
  const cantidad = parseInt(cantidad_bundle, 10) || 0;
  if (cantidad <= 0) {
    return { puede_vender: false, detalles: [], mensaje: 'Cantidad debe ser mayor a 0.' };
  }

  const bundleCheck = await pool.request()
    .input('art_sec', sql.VarChar(30), art_secStr)
    .query(`
      SELECT a.art_sec, a.art_cod, a.art_nom, a.art_bundle,
             ISNULL(ve.existencia, 0) AS stock_actual
      FROM dbo.articulos a
      LEFT JOIN dbo.vwExistencias ve ON ve.art_sec = a.art_sec
      WHERE a.art_sec = @art_sec
    `);

  if (!bundleCheck.recordset?.length) {
    return { puede_vender: false, detalles: [], mensaje: 'Bundle no encontrado.' };
  }

  const bundle = bundleCheck.recordset[0];
  if (bundle.art_bundle !== 'S') {
    return { puede_vender: false, detalles: [], mensaje: 'El artículo no es un bundle.' };
  }

  const detalles = [];
  let puede_vender = true;

  // Stock del bundle
  const stockBundle = Number(bundle.stock_actual) || 0;
  const cumpleBundle = stockBundle >= cantidad;
  if (!cumpleBundle) puede_vender = false;
  detalles.push({
    art_sec: bundle.art_sec,
    art_cod: bundle.art_cod,
    art_nom: bundle.art_nom,
    cantidad_necesaria: cantidad,
    stock_disponible: stockBundle,
    cumple: cumpleBundle,
    faltante: cumpleBundle ? null : cantidad - stockBundle
  });

  // Stock de componentes
  const compResult = await pool.request()
    .input('art_sec', sql.VarChar(30), art_secStr)
    .query(`
      SELECT
        aa.ComArtSec AS art_sec,
        a.art_cod,
        a.art_nom,
        aa.ConKarUni,
        ISNULL(ve.existencia, 0) AS stock_actual
      FROM dbo.articulosArmado aa
      INNER JOIN dbo.articulos a ON a.art_sec = aa.ComArtSec
      LEFT JOIN dbo.vwExistencias ve ON ve.art_sec = aa.ComArtSec
      WHERE aa.art_sec = @art_sec
    `);

  for (const comp of compResult.recordset || []) {
    const necesario = comp.ConKarUni * cantidad;
    const tiene = Number(comp.stock_actual) || 0;
    const cumple = tiene >= necesario;
    if (!cumple) puede_vender = false;
    detalles.push({
      art_sec: comp.art_sec,
      art_cod: comp.art_cod,
      art_nom: comp.art_nom,
      cantidad_necesaria: necesario,
      stock_disponible: tiene,
      cumple,
      faltante: cumple ? null : necesario - tiene
    });
  }

  return {
    puede_vender,
    detalles,
    mensaje: puede_vender ? 'Stock suficiente.' : 'Stock insuficiente en bundle o componentes.'
  };
};

module.exports = {
  createBundle,
  getBundleComponents,
  updateBundleComponents,
  validateBundleStock,
  syncBundleToWooCommerce
};
