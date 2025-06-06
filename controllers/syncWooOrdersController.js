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
    timeout: 8000,
    axiosConfig: {
        headers: {
            'Content-Type': 'application/json',
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
    const pool = await poolPromise;
    const result = await pool.request()
        .input('wooOrderNumber', sql.NVarChar(50), wooOrderNumber)
        .query(`
            SELECT f.fac_sec,
                   CASE WHEN EXISTS (
                       SELECT 1 FROM dbo.facturakardes k 
                       WHERE k.kar_fac_sec_ori = f.fac_sec
                       AND k.kar_nat = '-'
                       AND k.kar_uni > 0
                   ) THEN 1 ELSE 0 END as isInvoiced
            FROM dbo.factura f
            WHERE TRIM(f.fac_nro_woo) = TRIM(@wooOrderNumber)
            AND f.fac_tip_cod = 'COT'
        `);
    
    return {
        exists: result.recordset.length > 0,
        fac_sec: result.recordset.length > 0 ? result.recordset[0].fac_sec : null,
        isInvoiced: result.recordset.length > 0 ? result.recordset[0].isInvoiced === 1 : false
    };
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
        
        // Crear encabezado del pedido
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
            .query(`
                INSERT INTO dbo.factura (
                    fac_sec, fac_fec, fac_tip_cod, f_tip_cod, nit_sec,
                    fac_est_fac, fac_obs, fac_nro_woo, fac_nro, fac_usu_cod_cre
                )
                VALUES (
                    @fac_sec, @fac_fec, @fac_tip_cod, @f_tip_cod, @nit_sec,
                    @fac_est_fac, @fac_obs, @fac_nro_woo, @fac_nro, @fac_usu_cod_cre
                )
            `);

        console.log('Procesando items del pedido...');
        // Procesar items del pedido
        for (const item of orderData.lineItems) {
            const articleInfo = await getArticleInfo(item.sku);
            if (!articleInfo) {
                console.log(`Artículo no encontrado para SKU: ${item.sku}`);
                continue;
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
                price: item.price 
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
                .query(`
                    INSERT INTO dbo.facturakardes (
                        fac_sec, kar_sec, art_sec, kar_bod_sec, kar_uni,
                        kar_nat, kar_pre, kar_pre_pub, kar_des_uno,
                        kar_sub_tot, kar_lis_pre_cod, kar_total
                    )
                    VALUES (
                        @fac_sec, @kar_sec, @art_sec, @kar_bod_sec, @kar_uni,
                        @kar_nat, @kar_pre, @kar_pre_pub, @kar_des_uno,
                        @kar_sub_tot, @kar_lis_pre_cod, @kar_total
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
        // Actualizar encabezado
        await transaction.request()
            .input('fac_sec', sql.Int, facSec)
            .input('fac_obs', sql.VarChar(500), orderData.observations || '')
            .input('fac_usu_cod_cre', sql.VarChar(20), usuario)
            .query(`
                UPDATE dbo.factura 
                SET fac_obs = @fac_obs,
                    fac_usu_cod_cre = @fac_usu_cod_cre
                WHERE fac_sec = @fac_sec
            `);

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
                price: item.price 
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
                .query(`
                    INSERT INTO dbo.facturakardes (
                        fac_sec, kar_sec, art_sec, kar_bod_sec, kar_uni,
                        kar_nat, kar_pre, kar_pre_pub, kar_des_uno,
                        kar_sub_tot, kar_lis_pre_cod, kar_total
                    )
                    VALUES (
                        @fac_sec, @kar_sec, @art_sec, @kar_bod_sec, @kar_uni,
                        @kar_nat, @kar_pre, @kar_pre_pub, @kar_des_uno,
                        @kar_sub_tot, @kar_lis_pre_cod, @kar_total
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
    const today = new Date();
    const { 
        FechaDesde = today.toISOString().split('T')[0],
        FechaHasta = today.toISOString().split('T')[0],
        Estado = 'pending'
    } = req.body;

    // Obtener el usuario de la sesión
    const usuario = req.user ? req.user.usu_cod : 'SISTEMA';

    try {
        // Validar fechas
        const fechaDesde = new Date(FechaDesde);
        const fechaHasta = new Date(FechaHasta);
        
        if (isNaN(fechaDesde.getTime()) || isNaN(fechaHasta.getTime())) {
            return res.status(400).json({
                success: false,
                message: 'Las fechas proporcionadas no son válidas'
            });
        }

        if (fechaDesde > today || fechaHasta > today) {
            return res.status(400).json({
                success: false,
                message: 'No se pueden consultar pedidos con fechas futuras'
            });
        }

        if (fechaDesde > fechaHasta) {
            return res.status(400).json({
                success: false,
                message: 'La fecha inicial no puede ser mayor que la fecha final'
            });
        }

        // Formatear fechas para WooCommerce (YYYY-MM-DDTHH:mm:ss)
        const formatDateForWoo = (dateStr, isEndDate = false) => {
            if (isEndDate) {
                return `${dateStr}T23:59:00`;
            } else {
                return `${dateStr}T00:00:00`;
            }
        };

        // Obtener pedidos de WooCommerce
        console.log('Consultando pedidos en WooCommerce:', {
            after: formatDateForWoo(FechaDesde),
            before: formatDateForWoo(FechaHasta, true), 
            status: Estado
        });
        const response = await wooCommerce.get('orders', {
            after: formatDateForWoo(FechaDesde),
            before: formatDateForWoo(FechaHasta, true),
            status: Estado
        });

        const orders = response.data;
        addMessage(messages, `Se encontraron (${orders.length}) Pedidos en Woocommerce`);

        // Procesar cada pedido
        for (const order of orders) {
            addMessage(messages, `Validando Pedido Woocommerce #${order.number}`);

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
                observations: order.coupon_lines.length > 0 
                    ? `Cupón de descuento (${order.coupon_lines[0].code.trim()})`
                    : ''
            };

            // Buscar NIT en meta_data
            const nitMeta = order.meta_data.find(meta => meta.key === 'cc_o_nit');
            const nitIde = nitMeta ? nitMeta.value : '';

            // Validar/Crear cliente
            const clientValidation = await validateClientByEmail(orderData.email);
            let nitSec;

            if (!clientValidation.exists) {
                addMessage(messages, `Cliente con Identificación ${nitIde} no existe, Creando...`);
                const cityCode = await findCity(order.billing.city);
                nitSec = await createClient({
                    nit_ide: nitIde,
                    nit_nom: `${orderData.firstName} ${orderData.lastName}`,
                    nit_tel: orderData.phone,
                    nit_email: orderData.email,
                    nit_dir: orderData.address,
                    nit_ciudad: order.billing.city,
                    ciu_cod: cityCode
                });
            } else {
                nitSec = clientValidation.nit_sec;
                addMessage(messages, `Cliente con Identificación ${nitIde} ya existe, Actualizando...`);
            }

            // Validar pedido
            const orderValidation = await validateOrder(orderData.number);
            
            if (orderValidation.exists && orderValidation.isInvoiced) {
                addMessage(messages, `Pedido ${orderData.number} Ya facturado, no se puede modificar`);
                continue;
            }

            // Procesar pedido
            if (orderValidation.exists) {
                addMessage(messages, `Actualizando Pedido ${orderData.number}`);
                await updateOrder(orderData, orderValidation.fac_sec, usuario);
            } else {
                addMessage(messages, `Creando Pedido ${orderData.number}`);
                await createOrder(orderData, nitSec, usuario);
            }
            
            addMessage(messages, `Pedido #${orderData.number} actualizado exitosamente`);
        }

        res.json({ messages });

    } catch (error) {
        console.error('Error syncing orders:', error);
        res.status(500).json({
            success: false,
            message: 'Error al sincronizar pedidos',
            error: error.message
        });
    }
}; 