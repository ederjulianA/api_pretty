// controllers/documentoInventarioController.js
// SPEC-013 Tarea 2: el botón "Sincronizar con WooCommerce" por documento (pretty_front Orders.jsx)
// delega en el punto único (services/wooStockService.js) con origen MANUAL. Se conserva la forma
// de la respuesta que consume el frontend: { success, data: { messages, summary: {...} } }.
// Autenticación de esta ruta: pendiente en el plan de seguridad (SEC-17), no se toca aquí.
import { sincronizarDocumentoWoo } from "../services/wooStockService.js";

export const updateDocumentInventory = async (req, res) => {
  const { fac_nro } = req.body;
  const usuario = req.user?.usu_cod || null;
  const startTime = Date.now();

  if (!fac_nro) {
    return res.status(400).json({ success: false, message: 'El número de documento (fac_nro) es obligatorio' });
  }

  try {
    const r = await sincronizarDocumentoWoo({ fac_nro, origen: 'MANUAL', usuario });

    if (r.messages && r.messages[0] === 'Documento sin artículos') {
      return res.status(404).json({ success: false, message: `No se encontraron artículos para el documento ${fac_nro}` });
    }

    const duration = (Date.now() - startTime) / 1000;
    return res.json({
      success: r.ok || Boolean(r.simulado),
      data: {
        messages: r.messages,
        summary: {
          totalItems: r.enviados + r.errores + r.omitidos,
          successCount: r.enviados,
          errorCount: r.errores,
          skippedCount: r.omitidos,
          duration: `${duration} segundos`,
          batchesProcessed: r.productUpdates ? Math.ceil(r.enviados / 10) : 0,
          logId: r.logId,
          fac_nro,
          pendientes: r.pendientes,
          simulado: Boolean(r.simulado)
        },
        debugLogs: []
      }
    });
  } catch (error) {
    console.error("Error general en updateDocumentInventory:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
      data: { messages: [error.message], summary: { totalItems: 0, successCount: 0, errorCount: 1, skippedCount: 0, duration: '0 segundos', batchesProcessed: 0, logId: null, fac_nro } }
    });
  }
};
