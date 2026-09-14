// controllers/updateWooStockController.js
// SPEC-013 Tarea 2: el botón "Sincronizar" por producto (pretty_front Products.jsx) ya no empuja
// stock por su cuenta; delega en el punto único (services/wooStockService.js) con origen MANUAL
// y usuario, así queda auditado en woo_sync_logs. La forma de la respuesta se conserva porque
// el frontend la consume (success, messages, data.stock === null para padres variables).
import { poolPromise, sql } from "../db.js";
import { sincronizarExistenciasWoo, leerExistenciasParaWoo } from "../services/wooStockService.js";

const buscarArticuloPorCodigo = async (art_cod) => {
  const pool = await poolPromise;
  const rs = await pool.request()
    .input("art_cod", sql.VarChar(50), art_cod)
    .query(`
      SELECT a.art_sec, a.art_woo_id, ISNULL(a.art_woo_type, 'simple') AS art_woo_type, a.art_woo_variation_id
      FROM dbo.articulos a
      WHERE a.art_cod = @art_cod
    `);
  return rs.recordset.length ? rs.recordset[0] : null;
};

export const updateWooStockEndpoint = async (req, res) => {
  const { art_cod } = req.params;
  const usuario = req.user?.usu_cod || null;

  try {
    if (!art_cod) {
      return res.status(400).json({ success: false, error: "Debe proporcionar art_cod en la URL." });
    }

    const articulo = await buscarArticuloPorCodigo(art_cod);
    if (!articulo) {
      return res.status(404).json({ success: false, error: `No se encontró artículo para art_cod: ${art_cod}` });
    }

    // Un padre 'variable' no gestiona stock propio en WooCommerce (lo gestionan sus variaciones)
    if (articulo.art_woo_type === 'variable') {
      const msg = `Artículo ${art_cod} es padre variable: no gestiona stock propio en WooCommerce, no-op`;
      return res.json({
        success: true,
        messages: [msg],
        data: { art_cod, art_sec: articulo.art_sec, art_woo_id: articulo.art_woo_id, stock: null }
      });
    }

    const lectura = await leerExistenciasParaWoo([articulo.art_sec]);
    if (lectura.omitidos.length) {
      return res.status(404).json({ success: false, error: `Artículo ${art_cod}: ${lectura.omitidos[0].motivo}` });
    }
    const item = lectura.simples[0] || lectura.variaciones[0];
    const artWooId = lectura.simples[0] ? item.id : item.variationId;

    const resultado = await sincronizarExistenciasWoo({
      art_secs: [articulo.art_sec],
      origen: 'MANUAL',
      referencia: `boton-producto:${art_cod}`,
      usuario
    });

    if (!resultado.ok && !resultado.simulado) {
      return res.status(500).json({
        success: false,
        error: `Error actualizando producto en WooCommerce: ${resultado.messages.join(' | ')}`,
        details: { logId: resultado.logId, pendientes: resultado.pendientes }
      });
    }

    return res.json({
      success: true,
      messages: resultado.messages,
      data: {
        art_cod,
        art_sec: articulo.art_sec,
        art_woo_id: artWooId,
        stock: item.stock_quantity,
        logId: resultado.logId,
        simulado: Boolean(resultado.simulado)
      }
    });
  } catch (error) {
    console.error("Error general en updateWooStockEndpoint:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
