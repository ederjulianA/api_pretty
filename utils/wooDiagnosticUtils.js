import wcPkg from '@woocommerce/woocommerce-rest-api';
const WooCommerceRestApi = wcPkg.default || wcPkg;

// Configuración de la API de WooCommerce
const wcApi = new WooCommerceRestApi({
  url: process.env.WC_URL,
  consumerKey: process.env.WC_CONSUMER_KEY,
  consumerSecret: process.env.WC_CONSUMER_SECRET,
  version: "wc/v3",
  timeout: 10000
});

/**
 * Obtiene datos completos de un producto desde WooCommerce por SKU
 * @param {string} sku - SKU del producto
 * @returns {Promise<Object>} - Datos completos del producto
 */
export const getWooProductBySku = async (sku) => {
  try {
    console.log(`[DIAGNOSTIC] Obteniendo datos de producto con SKU: ${sku}`);
    
    const response = await wcApi.get('products', {
      sku: sku,
      per_page: 1
    });
    
    if (!response.data || response.data.length === 0) {
      throw new Error(`Producto con SKU ${sku} no encontrado en WooCommerce`);
    }
    
    const product = response.data[0];
    
    // Extraer campos relevantes para special deals
    const diagnosticData = {
      id: product.id,
      sku: product.sku,
      name: product.name,
      status: product.status,
      featured: product.featured,
      catalog_visibility: product.catalog_visibility,
      short_description: product.short_description,
      description: product.description,
      on_sale: product.on_sale,
      regular_price: product.regular_price,
      sale_price: product.sale_price,
      date_on_sale_from: product.date_on_sale_from,
      date_on_sale_to: product.date_on_sale_to,
      stock_status: product.stock_status,
      stock_quantity: product.stock_quantity,
      manage_stock: product.manage_stock,
      backorders: product.backorders,
      sold_individually: product.sold_individually,
      weight: product.weight,
      dimensions: product.dimensions,
      shipping_class: product.shipping_class,
      shipping_class_id: product.shipping_class_id,
      reviews_allowed: product.reviews_allowed,
      average_rating: product.average_rating,
      rating_count: product.rating_count,
      related_ids: product.related_ids,
      upsell_ids: product.upsell_ids,
      cross_sell_ids: product.cross_sell_ids,
      parent_id: product.parent_id,
      purchase_note: product.purchase_note,
      categories: product.categories,
      tags: product.tags,
      images: product.images,
      attributes: product.attributes,
      default_attributes: product.default_attributes,
      menu_order: product.menu_order,
      meta_data: product.meta_data,
      // Campos calculados para diagnóstico
      has_sale_price: !!product.sale_price && product.sale_price !== '',
      has_sale_dates: !!(product.date_on_sale_from || product.date_on_sale_to),
      is_published: product.status === 'publish',
      is_visible: product.catalog_visibility === 'visible',
      is_in_stock: product.stock_status === 'instock',
      // Verificar si debería aparecer en special deals
      should_appear_in_special_deals: (
        product.status === 'publish' &&
        product.catalog_visibility === 'visible' &&
        product.on_sale === true &&
        product.sale_price &&
        product.sale_price !== '' &&
        product.stock_status === 'instock'
      )
    };
    
    console.log(`[DIAGNOSTIC] Datos obtenidos para SKU ${sku}:`, {
      id: diagnosticData.id,
      name: diagnosticData.name,
      on_sale: diagnosticData.on_sale,
      sale_price: diagnosticData.sale_price,
      should_appear_in_special_deals: diagnosticData.should_appear_in_special_deals
    });
    
    return diagnosticData;
    
  } catch (error) {
    console.error(`[DIAGNOSTIC] Error obteniendo producto con SKU ${sku}:`, error.message);
    throw error;
  }
};

/**
 * Compara dos productos y muestra las diferencias relevantes para special deals
 * @param {Object} product1 - Primer producto (que aparece correctamente)
 * @param {Object} product2 - Segundo producto (que no aparece)
 * @returns {Object} - Comparación detallada
 */
export const compareProductsForSpecialDeals = (product1, product2) => {
  const comparison = {
    product1: {
      sku: product1.sku,
      name: product1.name,
      should_appear: product1.should_appear_in_special_deals
    },
    product2: {
      sku: product2.sku,
      name: product2.name,
      should_appear: product2.should_appear_in_special_deals
    },
    differences: {},
    recommendations: []
  };
  
  // Campos críticos para special deals
  const criticalFields = [
    'status',
    'catalog_visibility',
    'on_sale',
    'sale_price',
    'date_on_sale_from',
    'date_on_sale_to',
    'stock_status',
    'featured'
  ];
  
  // Comparar campos críticos
  criticalFields.forEach(field => {
    if (product1[field] !== product2[field]) {
      comparison.differences[field] = {
        product1: product1[field],
        product2: product2[field]
      };
    }
  });
  
  // Comparar meta_data relevantes
  const relevantMetaKeys = [
    '_codigo_promocion',
    '_descripcion_promocion',
    '_descuento_porcentaje',
    '_precio_mayorista'
  ];
  
  relevantMetaKeys.forEach(metaKey => {
    const meta1 = product1.meta_data.find(meta => meta.key === metaKey);
    const meta2 = product2.meta_data.find(meta => meta.key === metaKey);
    
    const value1 = meta1 ? meta1.value : null;
    const value2 = meta2 ? meta2.value : null;
    
    if (value1 !== value2) {
      if (!comparison.differences.meta_data) {
        comparison.differences.meta_data = {};
      }
      comparison.differences.meta_data[metaKey] = {
        product1: value1,
        product2: value2
      };
    }
  });
  
  // Generar recomendaciones
  if (!product2.should_appear_in_special_deals) {
    if (product2.status !== 'publish') {
      comparison.recommendations.push('Producto 2 no está publicado (status !== "publish")');
    }
    if (product2.catalog_visibility !== 'visible') {
      comparison.recommendations.push('Producto 2 no es visible en catálogo (catalog_visibility !== "visible")');
    }
    if (!product2.on_sale) {
      comparison.recommendations.push('Producto 2 no está marcado como en oferta (on_sale !== true)');
    }
    if (!product2.sale_price || product2.sale_price === '') {
      comparison.recommendations.push('Producto 2 no tiene precio de oferta válido');
    }
    if (product2.stock_status !== 'instock') {
      comparison.recommendations.push('Producto 2 no está en stock');
    }
  }
  
  return comparison;
};

/**
 * Diagnostica múltiples productos y genera un reporte
 * @param {Array<string>} skus - Array de SKUs a diagnosticar
 * @returns {Promise<Object>} - Reporte completo
 */
export const diagnoseMultipleProducts = async (skus) => {
  try {
    console.log(`[DIAGNOSTIC] Iniciando diagnóstico de ${skus.length} productos`);
    
    const results = [];
    const errors = [];
    
    for (const sku of skus) {
      try {
        const productData = await getWooProductBySku(sku);
        results.push(productData);
      } catch (error) {
        errors.push({
          sku,
          error: error.message
        });
      }
    }
    
    // Separar productos que aparecen vs que no aparecen
    const appearingProducts = results.filter(p => p.should_appear_in_special_deals);
    const notAppearingProducts = results.filter(p => !p.should_appear_in_special_deals);
    
    const report = {
      total_products: results.length,
      appearing_products: appearingProducts.length,
      not_appearing_products: notAppearingProducts.length,
      errors: errors.length,
      appearing_skus: appearingProducts.map(p => p.sku),
      not_appearing_skus: notAppearingProducts.map(p => p.sku),
      error_skus: errors.map(e => e.sku),
      detailed_results: results,
      errors_details: errors,
      summary: {
        success_rate: `${appearingProducts.length}/${results.length} productos aparecen correctamente`,
        common_issues: []
      }
    };
    
    // Identificar problemas comunes
    if (notAppearingProducts.length > 0) {
      const issues = {};
      notAppearingProducts.forEach(product => {
        if (product.status !== 'publish') issues.status = (issues.status || 0) + 1;
        if (product.catalog_visibility !== 'visible') issues.visibility = (issues.visibility || 0) + 1;
        if (!product.on_sale) issues.on_sale = (issues.on_sale || 0) + 1;
        if (!product.sale_price || product.sale_price === '') issues.sale_price = (issues.sale_price || 0) + 1;
        if (product.stock_status !== 'instock') issues.stock = (issues.stock || 0) + 1;
      });
      
      report.summary.common_issues = Object.entries(issues)
        .sort(([,a], [,b]) => b - a)
        .map(([issue, count]) => `${issue}: ${count} productos`);
    }
    
    console.log(`[DIAGNOSTIC] Diagnóstico completado:`, report.summary);
    
    return report;
    
  } catch (error) {
    console.error(`[DIAGNOSTIC] Error en diagnóstico múltiple:`, error.message);
    throw error;
  }
};

export default {
  getWooProductBySku,
  compareProductsForSpecialDeals,
  diagnoseMultipleProducts
};
