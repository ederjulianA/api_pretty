const {sql, poolPromise} = require('../db');

const getPedidoMinimo = async () =>{

    try{
        const pool = await poolPromise;
        const result = await pool.request()
        .input('par_cod',sql.VarChar(50),'pedido_minimo')
        .query("SELECT par_value FROM parametros WHERE par_cod = @par_cod");
        // si no se encuentra el registro, asigna por defecto 100000
        
        let par_value;
        if(result.recordset.length === 0){
            par_value = "100000";
        }else{
            par_value = result.recordset[0].par_value;
        }

        //convertir el valor a númerico
        const numericValue = Number(par_value);

        if(isNaN(numericValue)){
            throw new Error("El valor del pedido mínimo no es numérico");
       }

       return numericValue;

    }catch(error){
        throw error;
    }

};

module.exports = {getPedidoMinimo};