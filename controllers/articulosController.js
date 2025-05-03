// controllers/articulosController.js
const articulosModel = require('../models/articulosModel');
const { validateArticulo, createArticulo, getArticulo, updateArticulo, getArticuloByArtCod } = require('../models/articulosModel');

const updateArticuloEndpoint = async (req, res) => {
  try {
    const { id_articulo } = req.params;
    const { art_cod, art_nom, categoria, subcategoria, art_woo_id, precio_detal, precio_mayor, actualiza_fecha } = req.body;

    if (!id_articulo || !art_cod || !art_nom || !categoria || !subcategoria || !art_woo_id || precio_detal == null || precio_mayor == null) {
      return res.status(400).json({
        success: false,
        error: "Todos los campos son requeridos: art_cod, art_nom, categoria, subcategoria, art_woo_id, precio_detal y precio_mayor."
      });
    }

    const result = await updateArticulo({
      id_articulo,
      art_cod,
      art_nom,
      categoria,
      subcategoria,
      art_woo_id,
      precio_detal,
      precio_mayor,
      actualiza_fecha
    });

    return res.json({ success: true, ...result });
  } catch (error) {
    console.error(`Error en updateArticuloEndpoint: ${error.message}`);
    return res.status(500).json({ success: false, error: error.message });
  }
};

const createArticuloEndpoint = async (req, res) => {
  try {
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    console.log('Request files:', JSON.stringify(req.files, null, 2));

    const { art_cod, art_nom, categoria, subcategoria, precio_detal, precio_mayor } = req.body;

    // Validar que se envíen todos los campos requeridos
    if (!art_cod || !art_nom || !categoria || !subcategoria || precio_detal == null || precio_mayor == null) {
      const missingFields = [];
      if (!art_cod) missingFields.push('art_cod');
      if (!art_nom) missingFields.push('art_nom');
      if (!categoria) missingFields.push('categoria');
      if (!subcategoria) missingFields.push('subcategoria');
      if (precio_detal == null) missingFields.push('precio_detal');
      if (precio_mayor == null) missingFields.push('precio_mayor');

      console.error('Campos faltantes:', missingFields);
      return res.status(400).json({
        success: false,
        error: "Campos requeridos faltantes",
        missingFields,
        receivedData: {
          art_cod,
          art_nom,
          categoria,
          subcategoria,
          precio_detal,
          precio_mayor
        }
      });
    }

    // Obtener las imágenes de la petición
    const image1 = req.files?.image1;
    const image2 = req.files?.image2;
    const image3 = req.files?.image3;
    const image4 = req.files?.image4;

    // Filtrar las imágenes que realmente se enviaron
    const images = [image1, image2, image3, image4].filter(item => item !== undefined);
    console.log('Imágenes recibidas:', images.length);

    const result = await createArticulo({
      art_cod,
      art_nom,
      categoria,
      subcategoria,
      precio_detal,
      precio_mayor,
      images
    });

    return res.status(201).json({ success: true, ...result });
  } catch (error) {
    console.error('Error detallado en createArticuloEndpoint:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    return res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

const validateArticuloEndpoint = async (req, res) => {
  try {
    const { art_cod, art_woo_id } = req.query;

    if (!art_cod && !art_woo_id) {
      return res.status(400).json({ success: false, error: "Se debe proporcionar al menos art_cod o art_woo_id." });
    }

    const exists = await validateArticulo({ art_cod, art_woo_id });
    return res.json({ success: true, exists });
  } catch (error) {
    console.error(`Error en validateArticuloEndpoint: ${error.message}`);
    return res.status(500).json({ success: false, error: error.message });
  }
};

const getArticulos = async (req, res) => {
  try {
    // Extraer parámetros de la query string
    const { codigo, nombre, inv_gru_cod, inv_sub_gru_cod, tieneExistencia, PageNumber, PageSize } = req.query;

    // Convertir y validar los parámetros:
    // - Si el parámetro es una cadena vacía, se asigna null.
    // - Para tieneExistencia se convierte a 1 o 0 (aceptando también "true" o "false").
    const params = {
      codigo: codigo && codigo.trim() !== '' ? codigo : null,
      nombre: nombre && nombre.trim() !== '' ? nombre : null,
      inv_gru_cod: inv_gru_cod && inv_gru_cod.trim() !== '' ? inv_gru_cod : null,
      inv_sub_gru_cod: inv_sub_gru_cod && inv_sub_gru_cod.trim() !== '' ? inv_sub_gru_cod : null,
      tieneExistencia: (typeof tieneExistencia !== 'undefined' && tieneExistencia !== '')
        ? (tieneExistencia === '1' || tieneExistencia.toLowerCase() === 'true' ? 1 : 0)
        : null,
      PageNumber: PageNumber ? parseInt(PageNumber, 10) : 1,
      PageSize: PageSize ? parseInt(PageSize, 10) : 10
    };

    const articulos = await articulosModel.getArticulos(params);
    res.json({ success: true, articulos });
  } catch (error) {
    console.error(`Error en getArticulos: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
};

const getArticuloByArtCodEndPoint = async (req, res) => {
  try {
    const { art_cod } = req.params;
    if (!art_cod) {
      return res.status(400).json({ success: false, error: "El parámetro 'art_cod' es requerido." });
    }
    const articulo = await articulosModel.getArticuloByArtCod(art_cod);
    return res.json({ success: true, articulo });
  } catch (error) {
    console.error(`Error en getArticuloByArtCodEndPoint: ${error.message}`);
    return res.status(500).json({ success: false, error: error.message });
  }
};

const getArticuloEndpoint = async (req, res) => {
  try {
    const { id_articulo } = req.params;
    if (!id_articulo) {
      return res.status(400).json({ success: false, error: "El parámetro 'id_articulo' es requerido." });
    }
    const articulo = await getArticulo(id_articulo);
    return res.json({ success: true, articulo });
  } catch (error) {
    console.error(`Error en getArticuloEndpoint: ${error.message}`);
    return res.status(500).json({ success: false, error: error.message });
  }
};

const getNextArticuloCodigoEndpoint = async (req, res) => {
  try {
    const result = await articulosModel.getNextArticuloCodigo();

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: "Error al generar código de artículo"
    });
  }
};

module.exports = {
  getArticulos,
  validateArticuloEndpoint,
  createArticuloEndpoint,
  getArticuloEndpoint,
  updateArticuloEndpoint,
  getArticuloByArtCodEndPoint,
  getNextArticuloCodigoEndpoint
};
