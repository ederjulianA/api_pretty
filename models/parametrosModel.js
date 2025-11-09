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

/**
 * Obtiene todos los parámetros
 * @returns {Promise<Array>} - Lista de todos los parámetros
 */
const getAllParametros = async () => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .query("SELECT par_cod, par_value FROM dbo.parametros ORDER BY par_cod");
        
        return result.recordset;
    } catch (error) {
        throw error;
    }
};

/**
 * Obtiene un parámetro por su código
 * @param {string} par_cod - Código del parámetro
 * @returns {Promise<Object>} - Parámetro encontrado
 */
const getParametroByCod = async (par_cod) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('par_cod', sql.VarChar(20), par_cod)
            .query("SELECT par_cod, par_value FROM dbo.parametros WHERE par_cod = @par_cod");
        
        if (result.recordset.length === 0) {
            throw new Error('Parámetro no encontrado');
        }
        
        return result.recordset[0];
    } catch (error) {
        throw error;
    }
};

/**
 * Actualiza el valor de un parámetro
 * @param {string} par_cod - Código del parámetro
 * @param {string} par_value - Nuevo valor del parámetro
 * @returns {Promise<Object>} - Parámetro actualizado
 */
const updateParametro = async (par_cod, par_value) => {
    try {
        const pool = await poolPromise;
        
        // Verificar que el parámetro existe
        const checkResult = await pool.request()
            .input('par_cod', sql.VarChar(20), par_cod)
            .query("SELECT par_cod FROM dbo.parametros WHERE par_cod = @par_cod");
        
        if (checkResult.recordset.length === 0) {
            throw new Error('Parámetro no encontrado');
        }
        
        // Actualizar el parámetro
        const updateResult = await pool.request()
            .input('par_cod', sql.VarChar(20), par_cod)
            .input('par_value', sql.VarChar(sql.MAX), par_value)
            .query("UPDATE dbo.parametros SET par_value = @par_value WHERE par_cod = @par_cod");
        
        // Obtener el parámetro actualizado
        const updatedParametro = await getParametroByCod(par_cod);
        
        return updatedParametro;
    } catch (error) {
        throw error;
    }
};

module.exports = {
    getPedidoMinimo,
    getAllParametros,
    getParametroByCod,
    updateParametro
};