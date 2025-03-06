const {getPedidoMinimo} = require('../models/parametrosModel');

const getPedidoMinimoEndPoint = async(req,res) => {
    try{
        const pedidoMinimo = await getPedidoMinimo();
        return res.json({success:true,pedido_minimo:pedidoMinimo})

    }catch (error){
        console.error("Error al obtener el pedido mínimo: ",error);
        return res.status(500),json({success:false,error:error.message})
    }
};

module.exports = { getPedidoMinimoEndPoint };

