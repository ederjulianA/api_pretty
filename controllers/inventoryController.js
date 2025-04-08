import { createInventoryAdjustment, updateInventoryAdjustment, getAdjustment } from "../models/inventoryModel.js";

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

export const updateAdjustment = async (req, res) => {
  try {
    const { fac_nro } = req.params; // Obtenemos el fac_nro de los parámetros de la URL
    const { 
      nit_sec, 
      detalles, 
      fac_fec,
      fac_obs 
    } = req.body;

    // Validaciones básicas
    if (!fac_nro) {
      return res.status(400).json({ error: "fac_nro es requerido" });
    }

    // Validar que el fac_nro comience con 'AJT'
    if (!fac_nro.startsWith('AJT')) {
      return res.status(400).json({ 
        error: "Número de documento inválido. Debe ser un ajuste de inventario (AJT)" 
      });
    }

    if (!nit_sec) {
      return res.status(400).json({ error: "nit_sec es requerido" });
    }

    if (!fac_fec) {
      return res.status(400).json({ error: "fac_fec es requerido" });
    }

    // Validar formato de fecha
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(fac_fec)) {
      return res.status(400).json({ 
        error: "fac_fec debe tener el formato YYYY-MM-DD" 
      });
    }

    if (!detalles || !Array.isArray(detalles) || detalles.length === 0) {
      return res.status(400).json({ 
        error: "detalles debe ser un array no vacío" 
      });
    }

    // Validar cada detalle
    for (const detalle of detalles) {
      if (!detalle.art_sec) {
        return res.status(400).json({ 
          error: "art_sec es requerido para cada detalle" 
        });
      }

      if (!detalle.kar_nat || !['+', '-'].includes(detalle.kar_nat)) {
        return res.status(400).json({ 
          error: `kar_nat debe ser '+' o '-' para el artículo ${detalle.art_sec}` 
        });
      }

      if (!detalle.kar_uni || isNaN(detalle.kar_uni) || detalle.kar_uni <= 0) {
        return res.status(400).json({ 
          error: `kar_uni debe ser un número positivo para el artículo ${detalle.art_sec}` 
        });
      }

      // Validar kar_pre_pub si está presente
      if (detalle.kar_pre_pub !== undefined && 
          (isNaN(detalle.kar_pre_pub) || detalle.kar_pre_pub < 0)) {
        return res.status(400).json({ 
          error: `kar_pre_pub debe ser un número no negativo para el artículo ${detalle.art_sec}` 
        });
      }
    }

    const result = await updateInventoryAdjustment({
      fac_nro,
      nit_sec,
      detalles,
      fac_fec,
      fac_obs
    });

    res.json({
      ...result,
      message: "Ajuste de inventario actualizado exitosamente"
    });

  } catch (error) {
    console.error('Error al actualizar ajuste de inventario:', error);

    // Manejar diferentes tipos de errores
    if (error.message.includes("Ajuste no encontrado")) {
      return res.status(404).json({ 
        error: "Ajuste de inventario no encontrado",
        details: error.message 
      });
    }

    if (error.message.includes("El documento no es un ajuste de inventario")) {
      return res.status(400).json({ 
        error: "El documento no es un ajuste de inventario",
        details: error.message 
      });
    }

    res.status(500).json({ 
      error: "Error al actualizar el ajuste de inventario", 
      details: error.message 
    });
  }
};

export const getAdjustmentById = async (req, res) => {
  try {
    const { fac_nro } = req.params;

    if (!fac_nro) {
      return res.status(400).json({ error: "fac_nro es requerido" });
    }

    const result = await getAdjustment(fac_nro);
    
    // Formatear las fechas para la respuesta
    if (result.header) {
      result.header.fac_fec = result.header.fac_fec ? 
        result.header.fac_fec.toISOString().split('T')[0] : null;
      result.header.fac_fch_cre = result.header.fac_fch_cre ? 
        result.header.fac_fch_cre.toISOString() : null;
    }

    res.json(result);
  } catch (error) {
    console.error('Error al obtener ajuste de inventario:', error);
    
    if (error.message === "Ajuste de inventario no encontrado.") {
      return res.status(404).json({ 
        error: "Ajuste de inventario no encontrado",
        details: error.message 
      });
    }

    res.status(500).json({ 
      error: "Error al obtener el ajuste de inventario", 
      details: error.message 
    });
  }
}; 