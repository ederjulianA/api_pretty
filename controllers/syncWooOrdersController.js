import wcPkg from "@woocommerce/woocommerce-rest-api";
import { poolPromise, sql } from '../db.js';
import { generateFacNro, valorMayorista, generateConsecutivo } from '../utils/facturaUtils.js';

const WooCommerceRestApi = wcPkg.default || wcPkg;

// Initialize WooCommerce API
const wooCommerce = new WooCommerceRestApi({
    url: process.env.WC_URL,
    consumerKey: process.env.WC_CONSUMER_KEY,
    consumerSecret: process.env.WC_CONSUMER_SECRET,
    version: "wc/v3",
    timeout: 60000, // Aumentar a 60 segundos
    axiosConfig: {
        headers: {
            'Content-Type': 'application/json',
        },
        timeout: 60000, // Timeout adicional en axios
        maxRedirects: 5,
        validateStatus: function (status) {
            return status >= 200 && status < 300; // Solo aceptar códigos 2xx
        }
    }
});

/**
 * Agrega un mensaje al array de mensajes
 * @param {Array} messages - Array de mensajes
 * @param {string} description - Descripción del mensaje
 * @param {string} id - ID del mensaje (opcional)
 * @param {number} type - Tipo de mensaje (0 por defecto)
 */
const addMessage = (messages, description, id = '', type = 0) => {
    messages.push({
        Description: description.trim(),
        Id: id,
        Type: type
    });
};

/**
 * Normaliza el estado de WooCommerce para consistencia en la base de datos
 * Convierte guiones (-) a guiones bajos (_) para mantener consistencia
 * @param {string} status - Estado original de WooCommerce
 * @returns {string} - Estado normalizado
 */
const normalizeWooCommerceStatus = (status) => {
    if (!status || typeof status !== 'string') {
        return status;
    }
    
    // Convertir guiones a guiones bajos para mantener consistencia
    const normalizedStatus = status.replace(/-/g, '_');
    
    // Log para debugging en caso de normalización
    if (status !== normalizedStatus) {
        console.log(`[NORMALIZE_STATUS] Estado normalizado: "${status}" -> "${normalizedStatus}"`);
    }
    
    return normalizedStatus;
};

/**
 * Busca una ciudad por nombre
 * @param {string} cityName - Nombre de la ciudad
 * @returns {Promise<string>} - Código de la ciudad
 */
const findCity = async (cityName) => {
    const pool = await poolPromise;
    const result = await pool.request()
        .input('cityName', sql.NVarChar(100), cityName.trim().toLowerCase())
        .query('SELECT ciu_cod FROM dbo.Ciudad WHERE LOWER(TRIM(ciu_nom)) = LOWER(TRIM(@cityName))');
    
    return result.recordset.length > 0 ? result.recordset[0].ciu_cod : '68001';
};

/**
 * Valida si existe un cliente por email
 * @param {string} email - Email del cliente
 * @returns {Promise<{exists: boolean, nit_sec: number}>} - Objeto con información del cliente
 */
const validateClientByEmail = async (email) => {
    const pool = await poolPromise;
    const result = await pool.request()
        .input('email', sql.NVarChar(100), email)
        .query('SELECT nit_sec FROM dbo.nit WHERE nit_email = @email');
    
    return {
        exists: result.recordset.length > 0,
        nit_sec: result.recordset.length > 0 ? result.recordset[0].nit_sec : null
    };
};

/**
 * Crea un nuevo cliente
 * @param {Object} clientData - Datos del cliente
 * @returns {Promise<number>} - ID del cliente creado
 */
const createClient = async (clientData) => {
    const nitSec = await generateConsecutivo('CLIENTES');
    const pool = await poolPromise;
    const result = await pool.request()
        .input('nit_sec', sql.NVarChar(16), nitSec)
        .input('nit_ide', sql.NVarChar(20), clientData.nit_ide || '')
        .input('nit_nom', sql.NVarChar(100), clientData.nit_nom)
        .input('nit_tel', sql.NVarChar(20), clientData.nit_tel)
        .input('nit_email', sql.NVarChar(100), clientData.nit_email)
        .input('nit_dir', sql.NVarChar(200), clientData.nit_dir)
        .input('nit_ciudad', sql.NVarChar(100), clientData.nit_ciudad)
        .input('ciu_cod', sql.NVarChar(10), clientData.ciu_cod)
        .query(`
            INSERT INTO dbo.nit (
                nit_sec, nit_ide, nit_nom, nit_tel, nit_email, nit_dir, 
                nit_ciudad, nit_ind_cli, nit_ind_pro, nit_fec_cre, 
                nit_con_pag, ciu_cod
            )
            OUTPUT INSERTED.nit_sec
            VALUES (
                @nit_sec, @nit_ide, @nit_nom, @nit_tel, @nit_email, @nit_dir,
                @nit_ciudad, 1, 0, GETDATE(), 0, @ciu_cod
            )
        `);
    
    return result.recordset[0].nit_sec;
};

/**
 * Valida si existe un pedido por número de WooCommerce
 * @param {string} wooOrderNumber - Número de pedido de WooCommerce
 * @returns {Promise<{exists: boolean, fac_sec: number, isInvoiced: boolean}>} - Información del pedido
 */
const validateOrder = async (wooOrderNumber) => {
    const startTime = Date.now();
    console.log(`[${new Date().toISOString()}] 🔍 Iniciando validación de pedido: ${wooOrderNumber}`);
    
    try {
        const pool = await poolPromise;
        
        // Primera consulta: verificar si existe el pedido (más simple)
        const orderStartTime = Date.now();
        const orderResult = await pool.request()
            .input('wooOrderNumber', sql.NVarChar(50), wooOrderNumber)
            .query(`
                SELECT fac_sec, fac_tip_cod
                FROM dbo.factura 
                WHERE TRIM(fac_nro_woo) = TRIM(@wooOrderNumber)
                AND fac_tip_cod = 'COT'
            `);
        
        const orderTime = Date.now() - orderStartTime;
        console.log(`[${new Date().toISOString()}] ✅ Consulta de pedido completada en ${orderTime}ms`);
        
        if (orderResult.recordset.length === 0) {
            console.log(`[${new Date().toISOString()}] 📋 Pedido no encontrado`);
            return {
                exists: false,
                fac_sec: null,
                isInvoiced: false
            };
        }
        
        const facSec = orderResult.recordset[0].fac_sec;
        console.log(`[${new Date().toISOString()}] 📋 Pedido encontrado con fac_sec: ${facSec}`);
        
        // Segunda consulta: verificar si está facturado (separada para mejor performance)
        const invoiceStartTime = Date.now();
        const invoiceResult = await pool.request()
            .input('fac_sec', sql.Int, facSec)
            .query(`
                SELECT COUNT(*) as invoice_count
                FROM dbo.facturakardes k
                WHERE k.kar_fac_sec_ori = @fac_sec
                AND k.kar_nat = '-'
                AND k.kar_uni > 0
            `);
        
        const invoiceTime = Date.now() - invoiceStartTime;
        console.log(`[${new Date().toISOString()}] ✅ Consulta de facturación completada en ${invoiceTime}ms`);
        
        const isInvoiced = invoiceResult.recordset[0].invoice_count > 0;
        const totalTime = Date.now() - startTime;
        
        console.log(`[${new Date().toISOString()}] ✅ Validación de pedido completada en ${totalTime}ms:`, {
            exists: true,
            fac_sec: facSec,
            isInvoiced: isInvoiced
        });
        
        return {
            exists: true,
            fac_sec: facSec,
            isInvoiced: isInvoiced
        };
        
    } catch (error) {
        const totalTime = Date.now() - startTime;
        console.error(`[${new Date().toISOString()}] ❌ Error en validateOrder después de ${totalTime}ms:`, {
            error: error.message,
            stack: error.stack,
            wooOrderNumber: wooOrderNumber
        });
        throw error;
    }
};

/**
 * Obtiene el siguiente número de secuencia para factura
 * @returns {Promise<number>} - Siguiente número de secuencia
 */
const getNextFacSec = async () => {
    const pool = await poolPromise;
    const result = await pool.request()
        .query(`
            SELECT sec_num + 1 AS nextSec
            FROM dbo.secuencia WITH (UPDLOCK, HOLDLOCK)
            WHERE sec_cod = 'FACTURA';

            UPDATE dbo.secuencia 
            SET sec_num = sec_num + 1 
            WHERE sec_cod = 'FACTURA';
        `);
    return result.recordset[0].nextSec;
};

/**
 * Obtiene el ID del artículo por SKU
 * @param {string} sku - SKU del artículo
 * @returns {Promise<number|null>} - ID del artículo o null si no existe
 */
const getArticleInfo = async (sku) => {
    const pool = await poolPromise;
    const result = await pool.request()
        .input('sku', sql.VarChar(50), sku)
        .query(`
            SELECT TOP 1 art_sec
            FROM dbo.articulos
            WHERE art_cod = @sku
        `);
    
    return result.recordset.length > 0 ? result.recordset[0].art_sec : null;
};

/**
 * Función auxiliar para obtener precios base de un artículo
 * @param {string} art_sec - ID del artículo
 * @returns {Promise<{precio_detal_original: number, precio_mayor_original: number}>} - Precios base
 */
const getArticuloPreciosBase = async (art_sec) => {
    const pool = await poolPromise;
    const result = await pool.request()
        .input("art_sec", sql.VarChar(30), art_sec)
        .query(`
            SELECT 
                ISNULL(ad1.art_bod_pre, 0) AS precio_detal_original,
                ISNULL(ad2.art_bod_pre, 0) AS precio_mayor_original
            FROM dbo.articulos a
            LEFT JOIN dbo.articulosdetalle ad1 ON a.art_sec = ad1.art_sec AND ad1.lis_pre_cod = 1 AND ad1.bod_sec = '1'
            LEFT JOIN dbo.articulosdetalle ad2 ON a.art_sec = ad2.art_sec AND ad2.lis_pre_cod = 2 AND ad2.bod_sec = '1'
            WHERE a.art_sec = @art_sec
        `);
   
    if (result.recordset.length === 0) {
        return { precio_detal_original: 0, precio_mayor_original: 0 };
    }
   
    return result.recordset[0];
};

/**
 * Función para obtener información de promociones de un artículo en una fecha específica
 * @param {string} art_sec - ID del artículo
 * @param {Date} fecha - Fecha para validar promociones
 * @returns {Promise<Object|null>} - Información de promociones o null
 */
const getArticuloPromocionInfo = async (art_sec, fecha) => {
    const pool = await poolPromise;
    const result = await pool.request()
        .input("art_sec", sql.VarChar(30), art_sec)
        .input("fecha", sql.DateTime, fecha)
        .query(`
            SELECT 
                a.art_sec,
                a.art_cod,
                a.art_nom,
                -- Precios base
                ISNULL(ad1.art_bod_pre, 0) AS precio_detal_original,
                ISNULL(ad2.art_bod_pre, 0) AS precio_mayor_original,
                -- Información de promoción
                pd.pro_det_precio_oferta,
                pd.pro_det_descuento_porcentaje,
                p.pro_fecha_inicio,
                p.pro_fecha_fin,
                p.pro_codigo AS codigo_promocion,
                p.pro_descripcion AS descripcion_promocion,
                -- Determinar si tiene oferta activa
                CASE
                    WHEN p.pro_sec IS NOT NULL
                         AND ((pd.pro_det_precio_oferta IS NOT NULL AND pd.pro_det_precio_oferta > 0)
                              OR (pd.pro_det_descuento_porcentaje IS NOT NULL AND pd.pro_det_descuento_porcentaje > 0))
                    THEN 'S'
                    ELSE 'N'
                END AS tiene_oferta
            FROM dbo.articulos a
            LEFT JOIN dbo.articulosdetalle ad1 ON a.art_sec = ad1.art_sec AND ad1.lis_pre_cod = 1 AND ad1.bod_sec = '1'
            LEFT JOIN dbo.articulosdetalle ad2 ON a.art_sec = ad2.art_sec AND ad2.lis_pre_cod = 2 AND ad2.bod_sec = '1'
            LEFT JOIN dbo.promociones_detalle pd ON a.art_sec = pd.art_sec AND pd.pro_det_estado = 'A'
            LEFT JOIN dbo.promociones p ON pd.pro_sec = p.pro_sec 
                AND p.pro_activa = 'S'
                AND @fecha BETWEEN p.pro_fecha_inicio AND p.pro_fecha_fin
            WHERE a.art_sec = @art_sec
        `);
   
    if (result.recordset.length === 0) {
        // Si no se encuentra el artículo, devolver null
        return null;
    }
   
    const data = result.recordset[0];
   
    // Calcular precios finales
    let precioFinalDetal = data.precio_detal_original;
    let precioFinalMayor = data.precio_mayor_original;
   
    if (data.tiene_oferta === 'S') {
        if (data.pro_det_precio_oferta && data.pro_det_precio_oferta > 0) {
            precioFinalDetal = data.pro_det_precio_oferta;
            precioFinalMayor = data.pro_det_precio_oferta;
        } else if (data.pro_det_descuento_porcentaje && data.pro_det_descuento_porcentaje > 0) {
            const factorDescuento = 1 - (data.pro_det_descuento_porcentaje / 100);
            precioFinalDetal = data.precio_detal_original * factorDescuento;
            precioFinalMayor = data.precio_mayor_original * factorDescuento;
        }
    }
   
    // Siempre devolver un objeto con los precios base, incluso cuando no hay promoción
    return {
        art_sec: data.art_sec,
        art_cod: data.art_cod,
        art_nom: data.art_nom,
        precio_detal_original: data.precio_detal_original,
        precio_mayor_original: data.precio_mayor_original,
        precio_detal: precioFinalDetal,
        precio_mayor: precioFinalMayor,
        precio_oferta: data.pro_det_precio_oferta,
        descuento_porcentaje: data.pro_det_descuento_porcentaje,
        pro_fecha_inicio: data.pro_fecha_inicio,
        pro_fecha_fin: data.pro_fecha_fin,
        codigo_promocion: data.codigo_promocion,
        descripcion_promocion: data.descripcion_promocion,
        tiene_oferta: data.tiene_oferta
    };
};

/**
 * Actualiza la lista de precios según el monto total de la factura
 * @param {number} facSec - ID de la factura
 * @returns {Promise<void>}
 */
const actualizarListaPrecios = async (facSec) => {
    const pool = await poolPromise;
    const transaction = new sql.Transaction(pool);
    
    try {
        await transaction.begin();

        // Obtener el total de la factura
        const totalResult = await transaction.request()
            .input('fac_sec', sql.Int, facSec)
            .query(`
                SELECT SUM(kar_total) as fac_total
                FROM dbo.facturakardes
                WHERE fac_sec = @fac_sec
            `);

        if (!totalResult.recordset || totalResult.recordset.length === 0) {
            throw new Error(`No se encontró la factura con ID ${facSec}`);
        }

        const facTotal = totalResult.recordset[0].fac_total;
        const montoMayorista = await valorMayorista();
        const listaPrecio = facTotal >= montoMayorista ? 2 : 1;

        // Actualizar la lista de precios en facturakardes
        await transaction.request()
            .input('fac_sec', sql.Int, facSec)
            .input('lista_precio', sql.Int, listaPrecio)
            .query(`
                UPDATE dbo.facturakardes
                SET kar_lis_pre_cod = @lista_precio
                WHERE fac_sec = @fac_sec
            `);

        await transaction.commit();
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
};

/**
 * Crea un nuevo pedido
 * @param {Object} orderData - Datos del pedido
 * @param {number} nitSec - ID del cliente
 * @param {string} usuario - Código del usuario que crea el pedido
 * @returns {Promise<number>} - ID del pedido creado
 */
const createOrder = async (orderData, nitSec, usuario) => {
    const pool = await poolPromise;
    const transaction = new sql.Transaction(pool);
    
    try {
        console.log('Iniciando transacción para crear pedido...');
        await transaction.begin();
        
        const facSec = await getNextFacSec();
        const facNro = await generateFacNro('COT');
        
        console.log('Creando encabezado del pedido:', { facSec, facNro });
        
        // Normalizar el estado de WooCommerce
        const normalizedStatus = normalizeWooCommerceStatus(orderData.status);
        
        // Crear encabezado del pedido
        console.log(`[CREATE_ORDER] Insertando factura con fac_est_woo:`, {
            facSec,
            facNro,
            fac_nro_woo: orderData.number,
            fac_est_woo_original: orderData.status,
            fac_est_woo_normalized: normalizedStatus,
            statusType: typeof orderData.status
        });

        await transaction.request()
            .input('fac_sec', sql.Int, facSec)
            .input('fac_fec', sql.DateTime, orderData.dateCreated)
            .input('fac_tip_cod', sql.VarChar(10), 'COT')
            .input('f_tip_cod', sql.VarChar(10), 'COT')
            .input('nit_sec', sql.Int, nitSec)
            .input('fac_est_fac', sql.VarChar(1), 'A')
            .input('fac_obs', sql.VarChar(500), orderData.observations || '')
            .input('fac_nro_woo', sql.VarChar(50), orderData.number)
            .input('fac_nro', sql.VarChar(20), facNro)
            .input('fac_usu_cod_cre', sql.VarChar(20), usuario)
            .input('fac_est_woo', sql.VarChar(50), normalizedStatus)
            .query(`
                INSERT INTO dbo.factura (
                    fac_sec, fac_fec, fac_tip_cod, f_tip_cod, nit_sec,
                    fac_est_fac, fac_obs, fac_nro_woo, fac_nro, fac_usu_cod_cre, fac_est_woo
                )
                VALUES (
                    @fac_sec, @fac_fec, @fac_tip_cod, @f_tip_cod, @nit_sec,
                    @fac_est_fac, @fac_obs, @fac_nro_woo, @fac_nro, @fac_usu_cod_cre, @fac_est_woo
                )
            `);

        console.log(`[CREATE_ORDER] Factura insertada exitosamente con fac_est_woo: ${normalizedStatus} (original: ${orderData.status})`);

        console.log('Procesando items del pedido...');
        // Procesar items del pedido
        for (const item of orderData.lineItems) {
            const articleInfo = await getArticleInfo(item.sku);
            if (!articleInfo) {
                console.log(`Artículo no encontrado para SKU: ${item.sku}`);
                continue;
            }

            // Obtener información de promociones del artículo en la fecha del pedido
            const promocionInfo = await getArticuloPromocionInfo(articleInfo, orderData.dateCreated);
            
            // Obtener precios base del artículo (para casos donde no hay promoción o artículo no encontrado)
            const preciosBase = await getArticuloPreciosBase(articleInfo);
            
            // Determinar los precios finales para facturakardes
            let precioDetalFinal = 0;
            let precioMayorFinal = 0;
            
            if (promocionInfo) {
                // Si tenemos información de promociones, usar esos precios
                precioDetalFinal = promocionInfo.precio_detal_original;
                precioMayorFinal = promocionInfo.precio_mayor_original;
            } else {
                // Si no hay promoción pero el artículo existe, usar precios base
                precioDetalFinal = preciosBase.precio_detal_original;
                precioMayorFinal = preciosBase.precio_mayor_original;
            }

            const subtotal = parseFloat(item.subtotal);
            const total = parseFloat(item.total);
            const quantity = parseInt(item.quantity);
            
            let karDesUno = 0;
            let karPrePub = item.price;
            
            if (subtotal > 0) {
                karDesUno = ((subtotal - total) / subtotal) * 100;
                karPrePub = subtotal / quantity;
            }

            console.log('Insertando item:', { 
                facSec, 
                itemId: item.id, 
                artSec: articleInfo,
                quantity,
                price: item.price,
                precioDetalFinal,
                precioMayorFinal,
                tienePromocion: !!promocionInfo
            });

            await transaction.request()
                .input('fac_sec', sql.Int, facSec)
                .input('kar_sec', sql.Int, item.id)
                .input('art_sec', sql.Int, articleInfo)
                .input('kar_bod_sec', sql.Int, 1)
                .input('kar_uni', sql.Int, quantity)
                .input('kar_nat', sql.VarChar(1), 'C')
                .input('kar_pre', sql.Decimal(18, 2), item.price)
                .input('kar_pre_pub', sql.Decimal(18, 2), karPrePub)
                .input('kar_des_uno', sql.Decimal(18, 2), karDesUno)
                .input('kar_sub_tot', sql.Decimal(18, 2), quantity * item.price)
                .input('kar_lis_pre_cod', sql.Int, 1)
                .input('kar_total', sql.Decimal(18, 2), quantity * item.price)
                .input('kar_pre_pub_detal', sql.Decimal(18, 2), precioDetalFinal)
                .input('kar_pre_pub_mayor', sql.Decimal(18, 2), precioMayorFinal)
                .input('kar_tiene_oferta', sql.VarChar(1), promocionInfo ? promocionInfo.tiene_oferta : 'N')
                .input('kar_precio_oferta', sql.Decimal(18, 2), promocionInfo ? promocionInfo.precio_oferta : null)
                .input('kar_descuento_porcentaje', sql.Decimal(18, 2), promocionInfo ? promocionInfo.descuento_porcentaje : null)
                .input('kar_codigo_promocion', sql.VarChar(50), promocionInfo ? promocionInfo.codigo_promocion : null)
                .input('kar_descripcion_promocion', sql.VarChar(200), promocionInfo ? promocionInfo.descripcion_promocion : null)
                .query(`
                    INSERT INTO dbo.facturakardes (
                        fac_sec, kar_sec, art_sec, kar_bod_sec, kar_uni,
                        kar_nat, kar_pre, kar_pre_pub, kar_des_uno,
                        kar_sub_tot, kar_lis_pre_cod, kar_total,
                        kar_pre_pub_detal, kar_pre_pub_mayor, kar_tiene_oferta,
                        kar_precio_oferta, kar_descuento_porcentaje, kar_codigo_promocion, kar_descripcion_promocion
                    )
                    VALUES (
                        @fac_sec, @kar_sec, @art_sec, @kar_bod_sec, @kar_uni,
                        @kar_nat, @kar_pre, @kar_pre_pub, @kar_des_uno,
                        @kar_sub_tot, @kar_lis_pre_cod, @kar_total,
                        @kar_pre_pub_detal, @kar_pre_pub_mayor, @kar_tiene_oferta,
                        @kar_precio_oferta, @kar_descuento_porcentaje, @kar_codigo_promocion, @kar_descripcion_promocion
                    )
                `);
        }

        console.log('Commit de la transacción...');
        await transaction.commit();
        
        // Actualizar la lista de precios después de crear el pedido
        console.log('Actualizando lista de precios...');
        await actualizarListaPrecios(facSec);
        
        return facSec;
    } catch (error) {
        console.error('Error en createOrder:', error);
        if (transaction._activeRequest) {
            console.log('Intentando rollback de la transacción...');
            try {
                await transaction.rollback();
            } catch (rollbackError) {
                console.error('Error al hacer rollback:', rollbackError);
            }
        }
        throw error;
    }
};

/**
 * Actualiza un pedido existente
 * @param {Object} orderData - Datos del pedido
 * @param {number} facSec - ID del pedido
 * @param {string} usuario - Código del usuario que actualiza el pedido
 * @returns {Promise<void>}
 */
const updateOrder = async (orderData, facSec, usuario) => {
    const pool = await poolPromise;
    const transaction = new sql.Transaction(pool);
    
    try {
        console.log('Iniciando transacción para actualizar pedido...');
        await transaction.begin();

        console.log('Actualizando encabezado del pedido:', { facSec });
        
        // Normalizar el estado de WooCommerce
        const normalizedStatus = normalizeWooCommerceStatus(orderData.status);
        
        // Log específico para debugging del estado en actualización
        console.log(`[UPDATE_ORDER] Actualizando factura con fac_est_woo:`, {
            facSec,
            fac_est_woo_original: orderData.status,
            fac_est_woo_normalized: normalizedStatus,
            statusType: typeof orderData.status
        });

        // Actualizar encabezado
        await transaction.request()
            .input('fac_sec', sql.Int, facSec)
            .input('fac_obs', sql.VarChar(500), orderData.observations || '')
            .input('fac_usu_cod_cre', sql.VarChar(20), usuario)
            .input('fac_est_woo', sql.VarChar(50), normalizedStatus)
            .query(`
                UPDATE dbo.factura 
                SET fac_obs = @fac_obs,
                    fac_usu_cod_cre = @fac_usu_cod_cre,
                    fac_est_woo = @fac_est_woo
                WHERE fac_sec = @fac_sec
            `);

        console.log(`[UPDATE_ORDER] Factura actualizada exitosamente con fac_est_woo: ${normalizedStatus} (original: ${orderData.status})`);

        console.log('Eliminando detalles existentes...');
        // Eliminar detalles existentes
        await transaction.request()
            .input('fac_sec', sql.Int, facSec)
            .query('DELETE FROM dbo.facturakardes WHERE fac_sec = @fac_sec');

        console.log('Insertando nuevos detalles...');
        // Insertar nuevos detalles
        for (const item of orderData.lineItems) {
            const articleInfo = await getArticleInfo(item.sku);
            if (!articleInfo) {
                console.log(`Artículo no encontrado para SKU: ${item.sku}`);
                continue;
            }

            // Obtener información de promociones del artículo en la fecha del pedido
            const promocionInfo = await getArticuloPromocionInfo(articleInfo, orderData.dateCreated);
            
            // Obtener precios base del artículo (para casos donde no hay promoción o artículo no encontrado)
            const preciosBase = await getArticuloPreciosBase(articleInfo);
            
            // Determinar los precios finales para facturakardes
            let precioDetalFinal = 0;
            let precioMayorFinal = 0;
            
            if (promocionInfo) {
                // Si tenemos información de promociones, usar esos precios
                precioDetalFinal = promocionInfo.precio_detal_original;
                precioMayorFinal = promocionInfo.precio_mayor_original;
            } else {
                // Si no hay promoción pero el artículo existe, usar precios base
                precioDetalFinal = preciosBase.precio_detal_original;
                precioMayorFinal = preciosBase.precio_mayor_original;
            }

            const subtotal = parseFloat(item.subtotal);
            const total = parseFloat(item.total);
            const quantity = parseInt(item.quantity);
            
            let karDesUno = 0;
            let karPrePub = item.price;
            
            if (subtotal > 0) {
                karDesUno = ((subtotal - total) / subtotal) * 100;
                karPrePub = subtotal / quantity;
            }

            console.log('Insertando item:', { 
                facSec, 
                itemId: item.id, 
                artSec: articleInfo,
                quantity,
                price: item.price,
                precioDetalFinal,
                precioMayorFinal,
                tienePromocion: !!promocionInfo
            });

            await transaction.request()
                .input('fac_sec', sql.Int, facSec)
                .input('kar_sec', sql.Int, item.id)
                .input('art_sec', sql.Int, articleInfo)
                .input('kar_bod_sec', sql.Int, 1)
                .input('kar_uni', sql.Int, quantity)
                .input('kar_nat', sql.VarChar(1), 'C')
                .input('kar_pre', sql.Decimal(18, 2), item.price)
                .input('kar_pre_pub', sql.Decimal(18, 2), karPrePub)
                .input('kar_des_uno', sql.Decimal(18, 2), karDesUno)
                .input('kar_sub_tot', sql.Decimal(18, 2), quantity * item.price)
                .input('kar_lis_pre_cod', sql.Int, 1)
                .input('kar_total', sql.Decimal(18, 2), quantity * item.price)
                .input('kar_pre_pub_detal', sql.Decimal(18, 2), precioDetalFinal)
                .input('kar_pre_pub_mayor', sql.Decimal(18, 2), precioMayorFinal)
                .input('kar_tiene_oferta', sql.VarChar(1), promocionInfo ? promocionInfo.tiene_oferta : 'N')
                .input('kar_precio_oferta', sql.Decimal(18, 2), promocionInfo ? promocionInfo.precio_oferta : null)
                .input('kar_descuento_porcentaje', sql.Decimal(18, 2), promocionInfo ? promocionInfo.descuento_porcentaje : null)
                .input('kar_codigo_promocion', sql.VarChar(50), promocionInfo ? promocionInfo.codigo_promocion : null)
                .input('kar_descripcion_promocion', sql.VarChar(200), promocionInfo ? promocionInfo.descripcion_promocion : null)
                .query(`
                    INSERT INTO dbo.facturakardes (
                        fac_sec, kar_sec, art_sec, kar_bod_sec, kar_uni,
                        kar_nat, kar_pre, kar_pre_pub, kar_des_uno,
                        kar_sub_tot, kar_lis_pre_cod, kar_total,
                        kar_pre_pub_detal, kar_pre_pub_mayor, kar_tiene_oferta,
                        kar_precio_oferta, kar_descuento_porcentaje, kar_codigo_promocion, kar_descripcion_promocion
                    )
                    VALUES (
                        @fac_sec, @kar_sec, @art_sec, @kar_bod_sec, @kar_uni,
                        @kar_nat, @kar_pre, @kar_pre_pub, @kar_des_uno,
                        @kar_sub_tot, @kar_lis_pre_cod, @kar_total,
                        @kar_pre_pub_detal, @kar_pre_pub_mayor, @kar_tiene_oferta,
                        @kar_precio_oferta, @kar_descuento_porcentaje, @kar_codigo_promocion, @kar_descripcion_promocion
                    )
                `);
        }

        console.log('Commit de la transacción...');
        await transaction.commit();
        
        // Actualizar la lista de precios después de actualizar el pedido
        console.log('Actualizando lista de precios...');
        await actualizarListaPrecios(facSec);
    } catch (error) {
        console.error('Error en updateOrder:', error);
        if (transaction._activeRequest) {
            console.log('Intentando rollback de la transacción...');
            try {
                await transaction.rollback();
            } catch (rollbackError) {
                console.error('Error al hacer rollback:', rollbackError);
            }
        }
        throw error;
    }
};

/**
 * Sincroniza pedidos de WooCommerce con el sistema local
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
export const syncWooOrders = async (req, res) => {
    const messages = [];
    const startTime = Date.now();
    const today = new Date();
    let orders = []; // Declarar orders aquí para que esté disponible en todo el scope
    
    const { 
        FechaDesde = today.toISOString().split('T')[0],
        FechaHasta = today.toISOString().split('T')[0],
        Estado = 'pending'
    } = req.body;

    // Obtener el usuario de la sesión
    const usuario = req.user ? req.user.usu_cod : 'SISTEMA';

    try {
        console.log(`[${new Date().toISOString()}] 🚀 Iniciando sincronización de pedidos WooCommerce`);
        console.log(`[${new Date().toISOString()}] 📅 Parámetros recibidos:`, {
            FechaDesde,
            FechaHasta,
            Estado,
            usuario
        });

        // Validar fechas
        const fechaDesde = new Date(FechaDesde);
        const fechaHasta = new Date(FechaHasta);
        
        if (isNaN(fechaDesde.getTime()) || isNaN(fechaHasta.getTime())) {
            console.error(`[${new Date().toISOString()}] ❌ Fechas inválidas:`, { FechaDesde, FechaHasta });
            return res.status(400).json({
                success: false,
                message: 'Las fechas proporcionadas no son válidas'
            });
        }

        if (fechaDesde > today || fechaHasta > today) {
            console.error(`[${new Date().toISOString()}] ❌ Fechas futuras no permitidas:`, { fechaDesde, fechaHasta, today });
            return res.status(400).json({
                success: false,
                message: 'No se pueden consultar pedidos con fechas futuras'
            });
        }

        if (fechaDesde > fechaHasta) {
            console.error(`[${new Date().toISOString()}] ❌ Fecha inicial mayor que final:`, { fechaDesde, fechaHasta });
            return res.status(400).json({
                success: false,
                message: 'La fecha inicial no puede ser mayor que la fecha final'
            });
        }

        console.log(`[${new Date().toISOString()}] ✅ Validación de fechas exitosa`);

        // Formatear fechas para WooCommerce (YYYY-MM-DDTHH:mm:ss)
        const formatDateForWoo = (dateStr, isEndDate = false) => {
            if (isEndDate) {
                return `${dateStr}T23:59:00`;
            } else {
                return `${dateStr}T00:00:00`;
            }
        };

        const afterDate = formatDateForWoo(FechaDesde);
        const beforeDate = formatDateForWoo(FechaHasta, true);

        // Obtener pedidos de WooCommerce
        console.log(`[${new Date().toISOString()}] 🔄 Consultando pedidos en WooCommerce:`, {
            after: afterDate,
            before: beforeDate, 
            status: Estado
        });

        const wooStartTime = Date.now();
        console.log(`[${new Date().toISOString()}] 📡 Enviando petición a WooCommerce API...`);
        
        // Función para reintentar la petición a WooCommerce
        const retryWooCommerceRequest = async (retryCount = 0, maxRetries = 3) => {
            try {
                const response = await wooCommerce.get('orders', {
                    after: afterDate,
                    before: beforeDate,
                    status: Estado
                });
                return response;
            } catch (error) {
                if (retryCount < maxRetries && (error.code === 'ECONNABORTED' || error.message.includes('timeout'))) {
                    const waitTime = Math.pow(2, retryCount) * 2000; // Backoff exponencial: 2s, 4s, 8s
                    console.log(`[${new Date().toISOString()}] ⚠️ Timeout en intento ${retryCount + 1}/${maxRetries}, reintentando en ${waitTime}ms...`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                    return retryWooCommerceRequest(retryCount + 1, maxRetries);
                }
                throw error;
            }
        };
        
        try {
            // Timeout específico para la petición a WooCommerce (90 segundos máximo)
            const wooRequestPromise = retryWooCommerceRequest();
            const wooTimeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Timeout: La petición a WooCommerce tardó más de 90 segundos')), 90000);
            });
            
            const response = await Promise.race([wooRequestPromise, wooTimeoutPromise]);

            const wooResponseTime = Date.now() - wooStartTime;
            console.log(`[${new Date().toISOString()}] ✅ WooCommerce API response recibida en ${wooResponseTime}ms`);
            
            // Log detallado de la respuesta de WooCommerce
            console.log(`[${new Date().toISOString()}] 📊 Headers de respuesta WooCommerce:`, {
                'x-wp-total': response.headers['x-wp-total'],
                'x-wp-totalpages': response.headers['x-wp-totalpages'],
                'content-type': response.headers['content-type'],
                'status': response.status,
                'date': response.headers['date']
            });

            orders = response.data; // Asignar a la variable orders del scope superior
            console.log(`[${new Date().toISOString()}] 📦 Pedidos recibidos de WooCommerce: ${orders.length}`);
            
            // Log detallado del primer pedido para verificar estructura
            if (orders.length > 0) {
                const firstOrder = orders[0];
                console.log(`[${new Date().toISOString()}] 🔍 Estructura del primer pedido:`, {
                    number: firstOrder.number,
                    status: firstOrder.status,
                    date_created: firstOrder.date_created,
                    total: firstOrder.total,
                    currency: firstOrder.currency,
                    payment_method: firstOrder.payment_method,
                    payment_method_title: firstOrder.payment_method_title,
                    line_items_count: firstOrder.line_items?.length || 0,
                    billing: {
                        email: firstOrder.billing?.email,
                        first_name: firstOrder.billing?.first_name,
                        last_name: firstOrder.billing?.last_name,
                        city: firstOrder.billing?.city,
                        phone: firstOrder.billing?.phone
                    },
                    meta_data_count: firstOrder.meta_data?.length || 0,
                    coupon_lines_count: firstOrder.coupon_lines?.length || 0,
                    customer_id: firstOrder.customer_id
                });
                
                // Log de meta_data para debugging
                if (firstOrder.meta_data && firstOrder.meta_data.length > 0) {
                    console.log(`[${new Date().toISOString()}] 🏷️ Meta data del primer pedido:`, 
                        firstOrder.meta_data.map(meta => ({ key: meta.key, value: meta.value }))
                    );
                }

                // Log de line_items para debugging
                if (firstOrder.line_items && firstOrder.line_items.length > 0) {
                    console.log(`[${new Date().toISOString()}] 📋 Line items del primer pedido:`, 
                        firstOrder.line_items.map(item => ({
                            id: item.id,
                            sku: item.sku,
                            name: item.name,
                            quantity: item.quantity,
                            total: item.total,
                            subtotal: item.subtotal,
                            price: item.price
                        }))
                    );
                }
            }

            addMessage(messages, `Se encontraron (${orders.length}) Pedidos en Woocommerce`);
            addMessage(messages, `Tiempo de respuesta WooCommerce: ${wooResponseTime}ms`);

        } catch (wooError) {
            const wooErrorTime = Date.now() - wooStartTime;
            console.error(`[${new Date().toISOString()}] ❌ Error en WooCommerce API después de ${wooErrorTime}ms:`, {
                message: wooError.message,
                code: wooError.code,
                status: wooError.response?.status,
                statusText: wooError.response?.statusText,
                data: wooError.response?.data,
                headers: wooError.response?.headers,
                config: {
                    url: wooError.config?.url,
                    method: wooError.config?.method,
                    timeout: wooError.config?.timeout,
                    baseURL: wooError.config?.baseURL
                }
            });
            
            addMessage(messages, `Error en WooCommerce API: ${wooError.message}`);
            throw wooError;
        }

        // Procesar cada pedido
        console.log(`[${new Date().toISOString()}] 🔄 Iniciando procesamiento de ${orders.length} pedidos...`);
        
        // Procesar en lotes más pequeños si hay muchos pedidos
        const BATCH_SIZE = 10; // Procesar máximo 10 pedidos por lote
        const totalBatches = Math.ceil(orders.length / BATCH_SIZE);
        
        for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
            const startIndex = batchIndex * BATCH_SIZE;
            const endIndex = Math.min(startIndex + BATCH_SIZE, orders.length);
            const currentBatch = orders.slice(startIndex, endIndex);
            
            console.log(`\n[${new Date().toISOString()}] 📦 Procesando lote ${batchIndex + 1}/${totalBatches} (pedidos ${startIndex + 1}-${endIndex} de ${orders.length})`);
            
            for (let i = 0; i < currentBatch.length; i++) {
                const order = currentBatch[i];
                const globalIndex = startIndex + i;
                const orderStartTime = Date.now();
                
                console.log(`\n[${new Date().toISOString()}] 🔄 Procesando pedido ${globalIndex + 1}/${orders.length}: #${order.number}`);
                addMessage(messages, `Validando Pedido Woocommerce #${order.number}`);

                try {
                    // Extraer datos del pedido
                    const orderData = {
                        number: order.number,
                        email: order.billing.email,
                        firstName: order.billing.first_name,
                        lastName: order.billing.last_name,
                        phone: order.billing.phone,
                        address: order.billing.address_1,
                        dateCreated: order.date_created,
                        lineItems: order.line_items,
                        metaData: order.meta_data,
                        status: order.status, // Estado de WooCommerce
                        observations: order.coupon_lines.length > 0 
                            ? `Cupón de descuento (${order.coupon_lines[0].code.trim()})`
                            : ''
                    };

                    // Log inmediato para verificar el estado extraído
                    console.log(`[${new Date().toISOString()}] 🔍 Estado extraído del pedido:`, {
                        orderNumber: order.number,
                        originalStatus: order.status,
                        extractedStatus: orderData.status,
                        statusType: typeof orderData.status,
                        statusLength: orderData.status ? orderData.status.length : 0
                    });

                    console.log(`[${new Date().toISOString()}] 📋 Datos extraídos del pedido:`, {
                        number: orderData.number,
                        email: orderData.email,
                        firstName: orderData.firstName,
                        lastName: orderData.lastName,
                        phone: orderData.phone,
                        city: order.billing.city,
                        status: orderData.status,
                        statusType: typeof orderData.status,
                        statusValue: orderData.status,
                        lineItemsCount: orderData.lineItems?.length || 0,
                        hasCoupon: order.coupon_lines.length > 0
                    });

                    // Normalizar el estado para logging y debugging
                    const normalizedStatus = normalizeWooCommerceStatus(orderData.status);
                    
                    // Log específico para debugging del estado de WooCommerce
                    console.log(`[${new Date().toISOString()}] 🔍 Debug estado WooCommerce:`, {
                        orderNumber: order.number,
                        orderStatus: order.status,
                        orderDataStatus: orderData.status,
                        normalizedStatus: normalizedStatus,
                        statusType: typeof orderData.status,
                        statusLength: orderData.status ? orderData.status.length : 0,
                        wasNormalized: orderData.status !== normalizedStatus
                    });

                    // Buscar NIT en meta_data
                    const nitMeta = order.meta_data.find(meta => meta.key === 'cc_o_nit');
                    const nitIde = nitMeta ? nitMeta.value : '';
                    console.log(`[${new Date().toISOString()}] 🆔 NIT encontrado en meta_data: ${nitIde}`);

                    // Validar/Crear cliente
                    console.log(`[${new Date().toISOString()}] 👤 Validando cliente por email: ${orderData.email}`);
                    const clientStartTime = Date.now();
                    
                    const clientValidation = await validateClientByEmail(orderData.email);
                    let nitSec;

                    if (!clientValidation.exists) {
                        console.log(`[${new Date().toISOString()}] 🆕 Cliente no existe, creando nuevo cliente...`);
                        addMessage(messages, `Cliente con Identificación ${nitIde} no existe, Creando...`);
                        
                        const cityStartTime = Date.now();
                        const cityCode = await findCity(order.billing.city);
                        const cityTime = Date.now() - cityStartTime;
                        console.log(`[${new Date().toISOString()}] 🏙️ Ciudad procesada en ${cityTime}ms: ${order.billing.city} -> ${cityCode}`);
                        
                        const createClientStartTime = Date.now();
                        nitSec = await createClient({
                            nit_ide: nitIde,
                            nit_nom: `${orderData.firstName} ${orderData.lastName}`,
                            nit_tel: orderData.phone,
                            nit_email: orderData.email,
                            nit_dir: orderData.address,
                            nit_ciudad: order.billing.city,
                            ciu_cod: cityCode
                        });
                        const createClientTime = Date.now() - createClientStartTime;
                        console.log(`[${new Date().toISOString()}] ✅ Cliente creado en ${createClientTime}ms con nit_sec: ${nitSec}`);
                    } else {
                        nitSec = clientValidation.nit_sec;
                        console.log(`[${new Date().toISOString()}] ✅ Cliente existente encontrado con nit_sec: ${nitSec}`);
                        addMessage(messages, `Cliente con Identificación ${nitIde} ya existe, Actualizando...`);
                    }
                    
                    const clientTime = Date.now() - clientStartTime;
                    console.log(`[${new Date().toISOString()}] ✅ Cliente procesado en ${clientTime}ms`);

                    // Validar pedido
                    console.log(`[${new Date().toISOString()}] 🔍 Validando si el pedido ya existe...`);
                    const orderValidationStartTime = Date.now();
                    let orderValidation; // Declarar fuera del try
                    
                    try {
                        // Timeout específico para validateOrder (30 segundos máximo)
                        const validationPromise = validateOrder(orderData.number);
                        const validationTimeoutPromise = new Promise((_, reject) => {
                            setTimeout(() => reject(new Error(`Timeout en validación de pedido ${orderData.number}`)), 30000);
                        });
                        
                        orderValidation = await Promise.race([validationPromise, validationTimeoutPromise]);
                        const orderValidationTime = Date.now() - orderValidationStartTime;
                        
                        console.log(`[${new Date().toISOString()}] 📋 Validación de pedido completada en ${orderValidationTime}ms:`, {
                            exists: orderValidation.exists,
                            fac_sec: orderValidation.fac_sec,
                            isInvoiced: orderValidation.isInvoiced
                        });
                        
                        if (orderValidation.exists && orderValidation.isInvoiced) {
                            console.log(`[${new Date().toISOString()}] ⚠️ Pedido ya facturado, no se puede modificar`);
                            addMessage(messages, `Pedido ${orderData.number} Ya facturado, no se puede modificar`);
                            continue;
                        }
                        
                    } catch (validationError) {
                        const validationErrorTime = Date.now() - orderValidationStartTime;
                        console.error(`[${new Date().toISOString()}] ❌ Error en validación de pedido después de ${validationErrorTime}ms:`, {
                            error: validationError.message,
                            orderNumber: orderData.number
                        });
                        
                        addMessage(messages, `Error validando pedido ${orderData.number}: ${validationError.message}`);
                        continue; // Continuar con el siguiente pedido
                    }

                    // Procesar pedido
                    const processOrderStartTime = Date.now();
                    
                    if (orderValidation.exists) {
                        console.log(`[${new Date().toISOString()}] 🔄 Actualizando pedido existente...`);
                        addMessage(messages, `Actualizando Pedido ${orderData.number}`);
                        
                        await updateOrder(orderData, orderValidation.fac_sec, usuario);
                        const updateTime = Date.now() - processOrderStartTime;
                        console.log(`[${new Date().toISOString()}] ✅ Pedido actualizado en ${updateTime}ms`);
                    } else {
                        console.log(`[${new Date().toISOString()}] 🆕 Creando nuevo pedido...`);
                        addMessage(messages, `Creando Pedido ${orderData.number}`);
                        
                        await createOrder(orderData, nitSec, usuario);
                        const createTime = Date.now() - processOrderStartTime;
                        console.log(`[${new Date().toISOString()}] ✅ Pedido creado en ${createTime}ms`);
                    }
                    
                    const orderTotalTime = Date.now() - orderStartTime;
                    console.log(`[${new Date().toISOString()}] ✅ Pedido #${orderData.number} procesado completamente en ${orderTotalTime}ms`);
                    
                    addMessage(messages, `Pedido #${orderData.number} actualizado exitosamente`);
                    
                } catch (orderError) {
                    const orderErrorTime = Date.now() - orderStartTime;
                    console.error(`[${new Date().toISOString()}] ❌ Error procesando pedido #${order.number} después de ${orderErrorTime}ms:`, {
                        error: orderError.message,
                        stack: orderError.stack,
                        orderNumber: order.number
                    });
                    
                    addMessage(messages, `Error procesando pedido #${order.number}: ${orderError.message}`);
                    continue; // Continuar con el siguiente pedido
                }
            }
            
            // Pausa entre lotes para no sobrecargar la base de datos
            if (batchIndex < totalBatches - 1) {
                console.log(`[${new Date().toISOString()}] ⏸️ Pausa de 3 segundos entre lotes...`);
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        }

        const totalTime = Date.now() - startTime;
        console.log(`[${new Date().toISOString()}] 🎉 Sincronización completada. Tiempo total: ${totalTime}ms`);
        console.log(`[${new Date().toISOString()}] 📈 Resumen de sincronización:`, {
            total_orders: orders.length,
            total_time: totalTime,
            average_time_per_order: Math.round(totalTime / orders.length),
            messages_count: messages.length
        });

        res.json({ 
            success: true,
            messages,
            summary: {
                total_orders: orders.length,
                total_time: totalTime,
                average_time_per_order: Math.round(totalTime / orders.length)
            }
        });

    } catch (error) {
        const totalTime = Date.now() - startTime;
        console.error(`[${new Date().toISOString()}] 💥 Error fatal en sincronización después de ${totalTime}ms:`, {
            error: error.message,
            stack: error.stack,
            total_time: totalTime
        });
        
        res.status(500).json({
            success: false,
            message: 'Error al sincronizar pedidos',
            error: error.message,
            execution_time: totalTime
        });
    }
}; 