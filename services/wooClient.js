/**
 * services/wooClient.js — cliente REST de WooCommerce compartido (SPEC-013, Fase 2).
 *
 * Antes cada controller/job construía su propio `new WooCommerceRestApi(...)` con las
 * mismas variables de entorno. Este módulo centraliza la construcción (memoizada por
 * timeout) para que el punto único de push (wooStockService) y el importador de pedidos
 * (importarPedidosWeb / wooPedidoMapper) usen exactamente la misma configuración.
 *
 * CommonJS a propósito, como wooStockService: lo consumen módulos ESM y CJS.
 */
require('dotenv').config();
const wcPkg = require('@woocommerce/woocommerce-rest-api');
const WooCommerceRestApi = wcPkg.default || wcPkg;

const clientes = new Map(); // timeoutMs -> instancia

/**
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs=30000]
 * @returns {WooCommerceRestApi}
 * @throws si faltan WC_URL / WC_CONSUMER_KEY / WC_CONSUMER_SECRET
 */
const getWcApi = ({ timeoutMs = 30000 } = {}) => {
  if (clientes.has(timeoutMs)) return clientes.get(timeoutMs);
  if (!process.env.WC_URL || !process.env.WC_CONSUMER_KEY || !process.env.WC_CONSUMER_SECRET) {
    throw new Error('Faltan variables de entorno de WooCommerce (WC_URL, WC_CONSUMER_KEY, WC_CONSUMER_SECRET)');
  }
  const api = new WooCommerceRestApi({
    url: process.env.WC_URL,
    consumerKey: process.env.WC_CONSUMER_KEY,
    consumerSecret: process.env.WC_CONSUMER_SECRET,
    version: 'wc/v3',
    timeout: timeoutMs,
    axiosConfig: { headers: { 'Content-Type': 'application/json' } }
  });
  clientes.set(timeoutMs, api);
  return api;
};

module.exports = { getWcApi };
