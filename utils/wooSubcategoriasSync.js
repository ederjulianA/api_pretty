/**
 * Utilidad: Sincronización de Subcategorías con WooCommerce
 * Descripción: Mantiene subcategorías sincronizadas entre sistema local y WooCommerce
 */

const WooCommerceRestApi = require("@woocommerce/woocommerce-rest-api").default;

// Configurar API de WooCommerce
const wcApi = new WooCommerceRestApi({
  url: process.env.WC_URL,
  consumerKey: process.env.WC_CONSUMER_KEY,
  consumerSecret: process.env.WC_CONSUMER_SECRET,
  version: "wc/v3"
});

/**
 * Crear subcategoría en WooCommerce
 * @param {Object} subcategoryData - Datos de la subcategoría
 * @param {number} subcategoryData.inv_sub_gru_cod - Código de subcategoría local
 * @param {string} subcategoryData.inv_sub_gru_nom - Nombre de la subcategoría
 * @param {string} subcategoryData.inv_gru_cod - Código de categoría padre local
 * @param {number} subcategoryData.inv_gru_woo_id - ID de categoría padre en WooCommerce
 * @returns {Object} Respuesta de WooCommerce
 */
const createSubcategoryInWoo = async (subcategoryData) => {
  try {
    const wooData = {
      name: subcategoryData.inv_sub_gru_nom,
      slug: generateSlug(subcategoryData.inv_sub_gru_nom, subcategoryData.inv_sub_gru_cod),
      parent: subcategoryData.inv_gru_woo_id || 0, // 0 = sin padre
      meta_data: [
        {
          key: '_local_subcategory_code',
          value: subcategoryData.inv_sub_gru_cod.toString()
        },
        {
          key: '_local_category_code',
          value: subcategoryData.inv_gru_cod ? subcategoryData.inv_gru_cod.toString() : ''
        }
      ]
    };

    const response = await wcApi.post("products/categories", wooData);

    console.log(`✓ Subcategoría creada en WooCommerce - ID: ${response.data.id}, Nombre: ${subcategoryData.inv_sub_gru_nom}`);

    return {
      success: true,
      woo_id: response.data.id,
      woo_slug: response.data.slug,
      woo_data: response.data
    };
  } catch (error) {
    console.error('Error creando subcategoría en WooCommerce:', error.response?.data || error.message);

    return {
      success: false,
      error: error.response?.data?.message || error.message,
      woo_id: null
    };
  }
};

/**
 * Actualizar subcategoría en WooCommerce
 * @param {number} woo_id - ID de la subcategoría en WooCommerce
 * @param {Object} subcategoryData - Datos a actualizar
 * @returns {Object} Respuesta de WooCommerce
 */
const updateSubcategoryInWoo = async (woo_id, subcategoryData) => {
  try {
    const wooData = {};

    if (subcategoryData.inv_sub_gru_nom !== undefined) {
      wooData.name = subcategoryData.inv_sub_gru_nom;
      wooData.slug = generateSlug(subcategoryData.inv_sub_gru_nom, subcategoryData.inv_sub_gru_cod);
    }

    if (subcategoryData.inv_gru_woo_id !== undefined) {
      wooData.parent = subcategoryData.inv_gru_woo_id || 0;
    }

    const response = await wcApi.put(`products/categories/${woo_id}`, wooData);

    console.log(`✓ Subcategoría actualizada en WooCommerce - ID: ${woo_id}, Nombre: ${response.data.name}`);

    return {
      success: true,
      woo_data: response.data
    };
  } catch (error) {
    console.error('Error actualizando subcategoría en WooCommerce:', error.response?.data || error.message);

    return {
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
};

/**
 * Buscar subcategoría en WooCommerce por código local
 * @param {number} inv_sub_gru_cod - Código de subcategoría local
 * @returns {Object|null} Subcategoría de WooCommerce encontrada o null
 */
const findSubcategoryInWooByLocalCode = async (inv_sub_gru_cod) => {
  try {
    let page = 1;
    let foundSubcategory = null;

    while (!foundSubcategory) {
      const response = await wcApi.get("products/categories", {
        per_page: 100,
        page: page
      });

      if (response.data.length === 0) {
        break;
      }

      foundSubcategory = response.data.find(cat => {
        const localCodeMeta = cat.meta_data?.find(meta => meta.key === '_local_subcategory_code');
        return localCodeMeta && parseInt(localCodeMeta.value) === inv_sub_gru_cod;
      });

      page++;
    }

    return foundSubcategory;
  } catch (error) {
    console.error('Error buscando subcategoría en WooCommerce:', error.response?.data || error.message);
    return null;
  }
};

/**
 * Generar slug único para WooCommerce
 * @param {string} name - Nombre de la subcategoría
 * @param {number} code - Código de la subcategoría
 * @returns {string} Slug generado
 */
const generateSlug = (name, code) => {
  const baseSlug = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();

  return `${baseSlug}-${code}`;
};

/**
 * Obtener subcategoría de WooCommerce por ID
 * @param {number} woo_id - ID de WooCommerce
 * @returns {Object|null} Subcategoría o null
 */
const getSubcategoryFromWoo = async (woo_id) => {
  try {
    const response = await wcApi.get(`products/categories/${woo_id}`);
    return response.data;
  } catch (error) {
    console.error(`Error obteniendo subcategoría ${woo_id} de WooCommerce:`, error.response?.data || error.message);
    return null;
  }
};

/**
 * Eliminar subcategoría de WooCommerce
 * @param {number} woo_id - ID de WooCommerce
 * @returns {Object} Resultado de la eliminación
 */
const deleteSubcategoryFromWoo = async (woo_id) => {
  try {
    const response = await wcApi.delete(`products/categories/${woo_id}`, {
      force: true
    });

    console.log(`✓ Subcategoría eliminada de WooCommerce - ID: ${woo_id}`);

    return {
      success: true,
      woo_data: response.data
    };
  } catch (error) {
    console.error('Error eliminando subcategoría de WooCommerce:', error.response?.data || error.message);

    return {
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
};

module.exports = {
  createSubcategoryInWoo,
  updateSubcategoryInWoo,
  findSubcategoryInWooByLocalCode,
  getSubcategoryFromWoo,
  deleteSubcategoryFromWoo,
  generateSlug
};
