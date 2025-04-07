import { createInventoryAdjustment } from "../models/inventoryModel.js";

export const createAdjustment = async (req, res) => {
  try {
    const { 
      nit_sec, 
      fac_usu_cod_cre, 
      detalles, 
      fac_obs,
      fac_fec
    } = req.body;

    // Validaciones básicas
    if (!nit_sec) {
      return res.status(400).json({ error: "nit_sec es requerido" });
    }
    if (!fac_usu_cod_cre) {
      return res.status(400).json({ error: "fac_usu_cod_cre es requerido" });
    }
    if (!detalles || !Array.isArray(detalles) || detalles.length === 0) {
      return res.status(400).json({ error: "detalles debe ser un array no vacío" });
    }

    // Validar cada detalle
    for (const detalle of detalles) {
      if (!detalle.art_sec) {
        return res.status(400).json({ error: "art_sec es requerido para cada detalle" });
      }
      if (!detalle.kar_nat || !['+', '-'].includes(detalle.kar_nat)) {
        return res.status(400).json({ 
          error: `kar_nat debe ser '+' o '-' para el artículo ${detalle.art_sec}` 
        });
      }
      if (!detalle.kar_uni || detalle.kar_uni <= 0) {
        return res.status(400).json({ 
          error: `kar_uni debe ser un número positivo para el artículo ${detalle.art_sec}` 
        });
      }
    }

    const result = await createInventoryAdjustment({
      nit_sec,
      fac_usu_cod_cre,
      detalles,
      fac_obs,
      fac_fec
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Error al crear ajuste de inventario:', error);
    res.status(500).json({ 
      error: "Error al crear el ajuste de inventario", 
      details: error.message 
    });
  }
}; 