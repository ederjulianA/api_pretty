// controllers/confirmOrderController.js
// Endpoint huérfano (sin consumidor en el front; en la cola de SEC-10 del plan de seguridad).
// SPEC-013 Tarea 2: se mantiene por compatibilidad pero ya no empuja stock por su cuenta:
// delega en el punto único. Estado del pedido: mismo mapeo que usaba el job anterior.
import { poolPromise, sql } from "../db.js";
import { sincronizarExistenciasWoo, actualizarEstadoPedidoWoo, determinarEstadoWooAlFacturar } from "../services/wooStockService.js";

const confirmOrderEndpoint = async (req, res) => {
  try {
    const { fac_nro_woo } = req.params;
    const { orderDetails } = req.body; // arreglo de objetos con art_sec
    if (!fac_nro_woo || !orderDetails || !Array.isArray(orderDetails)) {
      return res.status(400).json({ success: false, error: "Debe proporcionar fac_nro_woo en la URL y un arreglo orderDetails en el cuerpo." });
    }

    const push = await sincronizarExistenciasWoo({
      art_secs: orderDetails.map((d) => d.art_sec),
      origen: 'MANUAL',
      referencia: `confirmOrder:${fac_nro_woo}`,
      usuario: req.user?.usu_cod || null
    });

    const pool = await poolPromise;
    const rs = await pool.request()
      .input('fac_nro_woo', sql.VarChar(15), String(fac_nro_woo))
      .query('SELECT TOP 1 fac_est_woo FROM dbo.factura WHERE fac_nro_woo = @fac_nro_woo ORDER BY fac_fch_cre DESC');
    const actual = rs.recordset.length ? rs.recordset[0].fac_est_woo : null;
    const estado = await actualizarEstadoPedidoWoo(fac_nro_woo, determinarEstadoWooAlFacturar(actual));

    return res.json({ success: push.ok, messages: [...push.messages, estado.ok ? `Pedido ${fac_nro_woo} → ${estado.estado}` : `Estado no actualizado: ${estado.error}`] });
  } catch (error) {
    console.error("Error en confirmOrderEndpoint:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export { confirmOrderEndpoint };
