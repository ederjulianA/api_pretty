import wcPkg from '@woocommerce/woocommerce-rest-api';
import promocionModel from '../models/promocionModel.js';

const WooCommerceRestApi = wcPkg.default || wcPkg;

const wooCommerce = new WooCommerceRestApi({
  url: process.env.WC_URL,
  consumerKey: process.env.WC_CONSUMER_KEY,
  consumerSecret: process.env.WC_CONSUMER_SECRET,
  version: 'wc/v3',
  timeout: 10000,
});

const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 100;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Obtiene artículos de la promo con art_woo_id válido, separa los omitidos
const getArticulosParaCategoria = async (pro_sec) => {
  const resultado = await promocionModel.obtenerArticulosParaSincronizacion(pro_sec);
  if (!resultado.success) throw new Error('Error al obtener artículos de la promoción');

  const todos = resultado.data.articulos;
  const conWooId = todos.filter((a) => a.art_woo_id && a.art_woo_id > 0);
  const omitidos = todos.length - conWooId.length;
  return { articulos: conWooId, omitidos };
};

const procesarEnBatches = async (articulos, procesarItem) => {
  const resultados = {
    total: 0,
    exitosos: 0,
    omitidos: 0,
    errores: 0,
    detalle_errores: [],
  };

  for (let i = 0; i < articulos.length; i += BATCH_SIZE) {
    const batch = articulos.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (item) => {
        resultados.total++;
        try {
          await procesarItem(item);
          resultados.exitosos++;
        } catch (error) {
          resultados.errores++;
          resultados.detalle_errores.push({
            art_cod: item.art_cod,
            art_nom: item.art_nom,
            error: error.message,
          });
        }
      })
    );
    if (i + BATCH_SIZE < articulos.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }
  return resultados;
};

// GET /api/woo/categorias
const listarCategoriasWoo = async (req, res) => {
  try {
    let categorias = [];
    let page = 1;
    const per_page = 100;

    while (true) {
      const response = await wooCommerce.get('products/categories', { per_page, page });
      const batch = response.data;
      if (!batch || batch.length === 0) break;

      categorias = categorias.concat(
        batch.map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          count: c.count,
        }))
      );

      if (batch.length < per_page) break;
      page++;
    }

    return res.json({ success: true, data: categorias });
  } catch (error) {
    console.error('[WOO_CATEGORIAS] Error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Error al obtener categorías de WooCommerce',
    });
  }
};

// POST /api/woo/promo/:pro_sec/asignar-categoria
const asignarCategoriaPromocion = async (req, res) => {
  try {
    const { pro_sec } = req.params;
    const { woo_category_id, woo_category_name } = req.body;

    if (!woo_category_id) {
      return res.status(400).json({
        success: false,
        error: 'El campo woo_category_id es requerido',
      });
    }

    const categoriaId = Number(woo_category_id);
    if (!Number.isInteger(categoriaId) || categoriaId <= 0) {
      return res.status(400).json({
        success: false,
        error: 'woo_category_id debe ser un entero positivo',
      });
    }

    let articulosData;
    try {
      articulosData = await getArticulosParaCategoria(pro_sec);
    } catch (error) {
      if (error.message.includes('no encontrada') || error.message.includes('not found')) {
        return res.status(404).json({ success: false, error: `Promoción ${pro_sec} no encontrada` });
      }
      throw error;
    }

    if (articulosData.articulos.length === 0) {
      return res.json({
        success: true,
        data: {
          total: 0,
          exitosos: 0,
          omitidos: articulosData.omitidos,
          errores: 0,
          detalle_errores: [],
        },
      });
    }

    const resultados = await procesarEnBatches(articulosData.articulos, async (articulo) => {
      const wooRes = await wooCommerce.get(`products/${articulo.art_woo_id}`);
      const categoriasActuales = wooRes.data.categories || [];

      const yaAsignada = categoriasActuales.some((c) => c.id === categoriaId);
      if (yaAsignada) return;

      const categoriasNuevas = [...categoriasActuales, { id: categoriaId }];
      await wooCommerce.put(`products/${articulo.art_woo_id}`, { categories: categoriasNuevas });
    });

    resultados.omitidos += articulosData.omitidos;

    const label = woo_category_name ? ` "${woo_category_name}"` : '';
    console.log(
      `[ASIGNAR_CAT_PROMO] pro_sec=${pro_sec} cat_id=${categoriaId}${label} ` +
        `→ ${resultados.exitosos}/${resultados.total} exitosos, ${resultados.errores} errores`
    );

    return res.json({ success: true, data: resultados });
  } catch (error) {
    console.error('[ASIGNAR_CAT_PROMO] Error:', error.message, error.stack);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// POST /api/woo/promo/:pro_sec/quitar-categoria
const quitarCategoriaPromocion = async (req, res) => {
  try {
    const { pro_sec } = req.params;
    const { woo_category_id } = req.body;

    if (!woo_category_id) {
      return res.status(400).json({
        success: false,
        error: 'El campo woo_category_id es requerido',
      });
    }

    const categoriaId = Number(woo_category_id);
    if (!Number.isInteger(categoriaId) || categoriaId <= 0) {
      return res.status(400).json({
        success: false,
        error: 'woo_category_id debe ser un entero positivo',
      });
    }

    let articulosData;
    try {
      articulosData = await getArticulosParaCategoria(pro_sec);
    } catch (error) {
      if (error.message.includes('no encontrada') || error.message.includes('not found')) {
        return res.status(404).json({ success: false, error: `Promoción ${pro_sec} no encontrada` });
      }
      throw error;
    }

    if (articulosData.articulos.length === 0) {
      return res.json({
        success: true,
        data: {
          total: 0,
          exitosos: 0,
          omitidos: articulosData.omitidos,
          errores: 0,
          detalle_errores: [],
        },
      });
    }

    const resultados = await procesarEnBatches(articulosData.articulos, async (articulo) => {
      const wooRes = await wooCommerce.get(`products/${articulo.art_woo_id}`);
      const categoriasActuales = wooRes.data.categories || [];

      const categoriasFiltradas = categoriasActuales.filter((c) => c.id !== categoriaId);

      // Si la categoría no estaba, idempotente: contar como exitoso sin hacer PUT
      if (categoriasFiltradas.length === categoriasActuales.length) return;

      await wooCommerce.put(`products/${articulo.art_woo_id}`, { categories: categoriasFiltradas });
    });

    resultados.omitidos += articulosData.omitidos;

    console.log(
      `[QUITAR_CAT_PROMO] pro_sec=${pro_sec} cat_id=${categoriaId} ` +
        `→ ${resultados.exitosos}/${resultados.total} exitosos, ${resultados.errores} errores`
    );

    return res.json({ success: true, data: resultados });
  } catch (error) {
    console.error('[QUITAR_CAT_PROMO] Error:', error.message, error.stack);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export { listarCategoriasWoo, asignarCategoriaPromocion, quitarCategoriaPromocion };
