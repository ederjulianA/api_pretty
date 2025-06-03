import { poolPromise, sql } from '../db.js';

/**
 * Genera un nuevo número de factura basado en el tipo de comprobante
 * @param {string} fac_tip_cod - Código del tipo de comprobante (ej: 'COT', 'FAC', etc)
 * @returns {Promise<string>} - Nuevo número de factura generado
 */
export const generateFacNro = async (fac_tip_cod) => {
    const pool = await poolPromise;
    const transaction = new sql.Transaction(pool);
    
    try {
        await transaction.begin();
        
        // Obtener y bloquear el siguiente consecutivo
        const tipRequest = new sql.Request(transaction);
        tipRequest.input('fac_tip_cod', sql.VarChar(5), fac_tip_cod);
        const tipQuery = `
            SELECT tip_con_sec + 1 AS NewConsecFacNro
            FROM dbo.tipo_comprobantes WITH (UPDLOCK, HOLDLOCK)
            WHERE tip_cod = @fac_tip_cod
        `;
        const tipResult = await tipRequest.query(tipQuery);
        
        if (!tipResult.recordset || tipResult.recordset.length === 0) {
            throw new Error(`No se encontró el consecutivo para el tipo de comprobante ${fac_tip_cod} en tipo_comprobantes`);
        }
        
        const NewConsecFacNro = tipResult.recordset[0].NewConsecFacNro;

        // Actualizar el consecutivo
        const updateTipRequest = new sql.Request(transaction);
        updateTipRequest.input('fac_tip_cod', sql.VarChar(5), fac_tip_cod);
        await updateTipRequest.query(`
            UPDATE dbo.tipo_comprobantes 
            SET tip_con_sec = tip_con_sec + 1 
            WHERE tip_cod = @fac_tip_cod
        `);

        // Construir el número de factura final
        const FinalFacNro = fac_tip_cod + String(NewConsecFacNro);
        
        await transaction.commit();
        return FinalFacNro;
        
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
};

/**
 * Obtiene el valor del monto mayorista desde la tabla de parámetros
 * @returns {Promise<number>} - Valor del monto mayorista convertido a número
 * @throws {Error} Si no se encuentra el parámetro o el valor no es un número válido
 */
export const valorMayorista = async () => {
    const pool = await poolPromise;
    const result = await pool.request()
        .input('par_cod', sql.VarChar(50), 'monto_mayorista')
        .query(`
            SELECT par_value
            FROM dbo.parametros
            WHERE par_cod = @par_cod
        `);

    if (!result.recordset || result.recordset.length === 0) {
        throw new Error('No se encontró el parámetro monto_mayorista en la tabla parametros');
    }

    const valor = parseFloat(result.recordset[0].par_value);
    if (isNaN(valor)) {
        throw new Error('El valor del parámetro monto_mayorista no es un número válido');
    }

    return valor;
};

/**
 * Genera un nuevo número de secuencia para clientes (nit_sec)
 * @returns {Promise<string>} - Nuevo número de secuencia generado
 * @throws {Error} Si no se encuentra la secuencia para 'CLIENTES'
 */
export const generateConsecutivo = async (sec_cod) => {
    const pool = await poolPromise;
    const transaction = new sql.Transaction(pool);
    
    try {
        console.log(`Iniciando generación de consecutivo para: ${sec_cod}`);
        await transaction.begin();
        
        // Obtener y bloquear el siguiente consecutivo
        const request = new sql.Request(transaction);
        const seqQuery = `
            SELECT CAST(sec_num + 1 AS VARCHAR(16)) AS NewNitSec
            FROM dbo.secuencia WITH (UPDLOCK, HOLDLOCK)
            WHERE sec_cod = @sec_cod
        `;
        console.log('Ejecutando consulta para obtener consecutivo...');
        const seqResult = await request
            .input('sec_cod', sql.VarChar(50), sec_cod)
            .query(seqQuery);
        
        if (!seqResult.recordset || seqResult.recordset.length === 0) {
            console.error(`No se encontró secuencia para: ${sec_cod}`);
            throw new Error(`No se encontró la secuencia para '${sec_cod}'.`);
        }
        
        const NewNitSec = seqResult.recordset[0].NewNitSec;
        console.log(`Consecutivo generado: ${NewNitSec}`);

        // Actualizar el consecutivo
        console.log('Actualizando secuencia...');
        await request
            .query("UPDATE dbo.secuencia SET sec_num = sec_num + 1 WHERE sec_cod = @sec_cod");
        
        await transaction.commit();
        console.log('Transacción completada exitosamente');
        return NewNitSec;
        
    } catch (error) {
        console.error('Error en generateConsecutivo:', error);
        await transaction.rollback();
        throw error;
    }
}; 