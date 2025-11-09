const {getPedidoMinimo, getAllParametros, getParametroByCod, updateParametro} = require('../models/parametrosModel');

const getPedidoMinimoEndPoint = async(req,res) => {
    try{
        const pedidoMinimo = await getPedidoMinimo();
        return res.json({success:true,pedido_minimo:pedidoMinimo})

    }catch (error){
        console.error("Error al obtener el pedido mínimo: ",error);
        return res.status(500).json({success:false,error:error.message})
    }
};

/**
 * Obtiene todos los parámetros
 * GET /api/parametros
 */
const getAllParametrosEndpoint = async (req, res) => {
    try {
        const parametros = await getAllParametros();
        return res.json({
            success: true,
            parametros: parametros,
            total: parametros.length
        });
    } catch (error) {
        console.error("Error al obtener los parámetros: ", error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

/**
 * Obtiene un parámetro por su código
 * GET /api/parametros/:par_cod
 */
const getParametroByCodEndpoint = async (req, res) => {
    try {
        const { par_cod } = req.params;
        
        if (!par_cod) {
            return res.status(400).json({
                success: false,
                error: 'El código del parámetro (par_cod) es requerido'
            });
        }
        
        const parametro = await getParametroByCod(par_cod);
        return res.json({
            success: true,
            parametro: parametro
        });
    } catch (error) {
        console.error("Error al obtener el parámetro: ", error);
        const statusCode = error.message === 'Parámetro no encontrado' ? 404 : 500;
        return res.status(statusCode).json({
            success: false,
            error: error.message
        });
    }
};

/**
 * Actualiza un parámetro
 * PUT /api/parametros/:par_cod
 */
const updateParametroEndpoint = async (req, res) => {
    try {
        const { par_cod } = req.params;
        const { par_value } = req.body;
        
        if (!par_cod) {
            return res.status(400).json({
                success: false,
                error: 'El código del parámetro (par_cod) es requerido'
            });
        }
        
        if (par_value === undefined || par_value === null) {
            return res.status(400).json({
                success: false,
                error: 'El valor del parámetro (par_value) es requerido'
            });
        }
        
        const parametroActualizado = await updateParametro(par_cod, par_value);
        return res.json({
            success: true,
            message: 'Parámetro actualizado exitosamente',
            parametro: parametroActualizado
        });
    } catch (error) {
        console.error("Error al actualizar el parámetro: ", error);
        const statusCode = error.message === 'Parámetro no encontrado' ? 404 : 500;
        return res.status(statusCode).json({
            success: false,
            error: error.message
        });
    }
};

module.exports = { 
    getPedidoMinimoEndPoint,
    getAllParametrosEndpoint,
    getParametroByCodEndpoint,
    updateParametroEndpoint
};

