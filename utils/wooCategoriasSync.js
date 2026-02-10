/**
 * Utilidad: Sincronización de Categorías con WooCommerce
 * Descripción: Mantiene categorías sincronizadas entre sistema local y WooCommerce
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
 * Crear categoría en WooCommerce
 * @param {Object} categoryData - Datos de la categoría
 * @param {string} categoryData.inv_gru_cod - Código de categoría local
 * @param {string} categoryData.inv_gru_nom - Nombre de la categoría
 * @returns {Object} Respuesta de WooCommerce con el ID creado
 */
const createCategoryInWoo = async (categoryData) => {
  try {
    const wooData = {
      name: categoryData.inv_gru_nom,
      slug: generateSlug(categoryData.inv_gru_nom, categoryData.inv_gru_cod),
      // Meta data personalizada para mapeo con sistema local
      meta_data: [
        {
          key: '_local_category_code',
          value: categoryData.inv_gru_cod.toString()
        }
      ]
    };

    const response = await wcApi.post("products/categories", wooData);

    console.log(`✓ Categoría creada en WooCommerce - ID: ${response.data.id}, Nombre: ${categoryData.inv_gru_nom}`);

    return {
      success: true,
      woo_id: response.data.id,
      woo_slug: response.data.slug,
      woo_data: response.data
    };
  } catch (error) {
    console.error('Error creando categoría en WooCommerce:', error.response?.data || error.message);

    // No lanzar error para no bloquear la creación local
    // La sincronización puede intentarse después
    return {
      success: false,
      error: error.response?.data?.message || error.message,
      woo_id: null
    };
  }
};

/**
 * Actualizar categoría en WooCommerce
 * @param {number} woo_id - ID de la categoría en WooCommerce
 * @param {Object} categoryData - Datos a actualizar
 * @param {string} categoryData.inv_gru_nom - Nombre de la categoría
 * @param {string} categoryData.inv_gru_cod - Código local (para regenerar slug si cambió el nombre)
 * @returns {Object} Respuesta de WooCommerce
 */
const updateCategoryInWoo = async (woo_id, categoryData) => {
  try {
    const wooData = {};

    if (categoryData.inv_gru_nom !== undefined) {
      wooData.name = categoryData.inv_gru_nom;
      // Regenerar slug si cambió el nombre
      wooData.slug = generateSlug(categoryData.inv_gru_nom, categoryData.inv_gru_cod);
    }

    const response = await wcApi.put(`products/categories/${woo_id}`, wooData);

    console.log(`✓ Categoría actualizada en WooCommerce - ID: ${woo_id}, Nombre: ${response.data.name}`);

    return {
      success: true,
      woo_data: response.data
    };
  } catch (error) {
    console.error('Error actualizando categoría en WooCommerce:', error.response?.data || error.message);

    return {
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
};

/**
 * Buscar categoría en WooCommerce por código local
 * @param {number} inv_gru_cod - Código de categoría local
 * @returns {Object|null} Categoría de WooCommerce encontrada o null
 */
const findCategoryInWooByLocalCode = async (inv_gru_cod) => {
  try {
    // WooCommerce limita a 100 categorías por página
    // Buscamos en todas las páginas si es necesario
    let page = 1;
    let foundCategory = null;

    while (!foundCategory) {
      const response = await wcApi.get("products/categories", {
        per_page: 100,
        page: page
      });

      if (response.data.length === 0) {
        break; // No hay más categorías
      }

      // Buscar en los meta_data
      foundCategory = response.data.find(cat => {
        const localCodeMeta = cat.meta_data?.find(meta => meta.key === '_local_category_code');
        return localCodeMeta && parseInt(localCodeMeta.value) === inv_gru_cod;
      });

      page++;
    }

    return foundCategory;
  } catch (error) {
    console.error('Error buscando categoría en WooCommerce:', error.response?.data || error.message);
    return null;
  }
};

/**
 * Sincronizar categoría con WooCommerce
 * Crea si no existe, actualiza si existe
 * @param {Object} categoryData - Datos de la categoría
 * @param {number} categoryData.inv_gru_cod - Código local
 * @param {string} categoryData.inv_gru_nom - Nombre
 * @param {string} categoryData.inv_gru_des - Descripción
 * @param {number} categoryData.woo_id - ID en WooCommerce (opcional)
 * @returns {Object} Resultado de la sincronización
 */
const syncCategoryWithWoo = async (categoryData) => {
  try {
    let wooCategory = null;

    // Si tenemos woo_id, intentar actualizar directamente
    if (categoryData.woo_id) {
      const updateResult = await updateCategoryInWoo(categoryData.woo_id, categoryData);

      if (updateResult.success) {
        return {
          success: true,
          action: 'updated',
          woo_id: categoryData.woo_id,
          woo_data: updateResult.woo_data
        };
      }

      // Si falló la actualización, intentar buscar por código local
      wooCategory = await findCategoryInWooByLocalCode(categoryData.inv_gru_cod);
    } else {
      // Buscar por código local
      wooCategory = await findCategoryInWooByLocalCode(categoryData.inv_gru_cod);
    }

    // Si existe en WooCommerce, actualizar
    if (wooCategory) {
      const updateResult = await updateCategoryInWoo(wooCategory.id, categoryData);

      return {
        success: updateResult.success,
        action: 'updated',
        woo_id: wooCategory.id,
        woo_data: updateResult.woo_data,
        error: updateResult.error
      };
    }

    // Si no existe, crear nueva
    const createResult = await createCategoryInWoo(categoryData);

    return {
      success: createResult.success,
      action: 'created',
      woo_id: createResult.woo_id,
      woo_slug: createResult.woo_slug,
      woo_data: createResult.woo_data,
      error: createResult.error
    };
  } catch (error) {
    console.error('Error en sincronización con WooCommerce:', error.message);

    return {
      success: false,
      action: 'error',
      error: error.message
    };
  }
};

/**
 * Generar slug único para WooCommerce
 * @param {string} name - Nombre de la categoría
 * @param {number} code - Código de la categoría
 * @returns {string} Slug generado
 */
const generateSlug = (name, code) => {
  // Convertir a minúsculas, reemplazar espacios y caracteres especiales
  const baseSlug = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Eliminar acentos
    .replace(/[^a-z0-9\s-]/g, '') // Eliminar caracteres especiales
    .replace(/\s+/g, '-') // Reemplazar espacios con guiones
    .replace(/-+/g, '-') // Eliminar guiones duplicados
    .trim();

  // Agregar código para garantizar unicidad
  return `${baseSlug}-${code}`;
};

/**
 * Obtener categoría de WooCommerce por ID
 * @param {number} woo_id - ID de WooCommerce
 * @returns {Object|null} Categoría o null
 */
const getCategoryFromWoo = async (woo_id) => {
  try {
    const response = await wcApi.get(`products/categories/${woo_id}`);
    return response.data;
  } catch (error) {
    console.error(`Error obteniendo categoría ${woo_id} de WooCommerce:`, error.response?.data || error.message);
    return null;
  }
};

/**
 * Eliminar categoría de WooCommerce
 * @param {number} woo_id - ID de WooCommerce
 * @returns {Object} Resultado de la eliminación
 */
const deleteCategoryFromWoo = async (woo_id) => {
  try {
    const response = await wcApi.delete(`products/categories/${woo_id}`, {
      force: true // Forzar eliminación permanente
    });

    console.log(`✓ Categoría eliminada de WooCommerce - ID: ${woo_id}`);

    return {
      success: true,
      woo_data: response.data
    };
  } catch (error) {
    console.error('Error eliminando categoría de WooCommerce:', error.response?.data || error.message);

    return {
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
};

module.exports = {
  createCategoryInWoo,
  updateCategoryInWoo,
  findCategoryInWooByLocalCode,
  syncCategoryWithWoo,
  getCategoryFromWoo,
  deleteCategoryFromWoo,
  generateSlug
};
