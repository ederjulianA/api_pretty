import wcPkg from "@woocommerce/woocommerce-rest-api";
import { poolPromise, sql } from '../db.js';
import { getArticleStock, getArticleWooId } from '../jobs/updateWooOrderStatusAndStock.js';
import ProductPhoto from '../models/ProductPhoto.js';
import { v4 as uuidv4 } from 'uuid';

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
 * Validates and sanitizes the art_sec parameter
 * @param {string} art_sec - The art_sec value to validate
 * @returns {string|null} - The sanitized art_sec or null if invalid
 */
const validateArtSec = (art_sec) => {
    console.log('Validating art_sec:', {
        original: art_sec,
        type: typeof art_sec,
        length: art_sec ? art_sec.length : 0
    });

    if (!art_sec) {
        console.log('art_sec is null or undefined');
        return null;
    }

    // Convert to string and trim
    const sanitized = String(art_sec).trim();
    console.log('After sanitization:', {
        sanitized,
        length: sanitized.length,
        containsSpaces: sanitized.includes(' '),
        containsSpecialChars: /[^a-zA-Z0-9-]/.test(sanitized)
    });

    // Check if it's a valid string (not empty and contains only valid characters)
    if (!sanitized) {
        console.log('art_sec is empty after sanitization');
        return null;
    }

    if (sanitized.length > 50) {
        console.log('art_sec exceeds maximum length of 50');
        return null;
    }

    // Check for invalid characters
    if (/[^a-zA-Z0-9-]/.test(sanitized)) {
        console.log('art_sec contains invalid characters');
        return null;
    }

    return sanitized;
};

/**
 * Gets art_sec from articulos table using art_cod (sku)
 * @param {string} art_cod - The art_cod (sku) to search for
 * @returns {Promise<string|null>} - The art_sec or null if not found
 */
const getArtSecFromArtCod = async (art_cod) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('art_cod', sql.VarChar(50), art_cod)
            .query('SELECT art_sec FROM dbo.articulos WHERE art_cod = @art_cod');

        return result.recordset.length > 0 ? result.recordset[0].art_sec : null;
    } catch (error) {
        console.error(`Error getting art_sec for art_cod ${art_cod}:`, error);
        throw error;
    }
};


/**
 * Synchronizes products from WooCommerce to ArticuloHook table
 * Uses pagination and batch processing for better performance
 *
 * Query params:
 * - stock_status: 'instock' | 'outofstock' | 'onbackorder' (filtrar por stock)
 * - status: 'publish' | 'draft' | 'pending' (filtrar por estado)
 * - limit: número máximo de productos a procesar
 * - min_stock: stock mínimo para procesar (ej: 1 para solo productos con stock)
 */
export const syncWooProducts = async (req, res) => {
    const BATCH_SIZE = 100; // Number of products to process in each batch
    let page = 1;
    let totalProcessed = 0;
    let totalUpdated = 0;
    let totalCreated = 0;
    let totalSkipped = 0;
    let errors = [];

    // Variables para mostrar progreso
    const startTime = Date.now();

    // Parámetros opcionales de filtrado
    const {
        stock_status = null,      // 'instock', 'outofstock', 'onbackorder'
        status = 'publish',       // 'publish', 'draft', 'pending' (por defecto solo publicados)
        limit = null,             // Límite de productos a procesar (null = todos los productos)
        min_stock = null,         // Stock mínimo (ej: 1 para solo con existencia)
        process_images = 'false'  // 'true' | 'false' - Procesar imágenes (por defecto false para optimizar)
    } = req.query;

    try {
        // Construir parámetros para la API de WooCommerce
        const wooParams = {
            per_page: 1,
            page: 1,
            status: status
        };

        if (stock_status) {
            wooParams.stock_status = stock_status;
        }

        // Get total number of products from WooCommerce API
        const initialResponse = await wooCommerce.get('products', wooParams);

        // Get total from WooCommerce API headers
        let totalProducts = parseInt(initialResponse.headers['x-wp-total']) || 0;

        // Si hay límite, usarlo
        if (limit && parseInt(limit) < totalProducts) {
            totalProducts = parseInt(limit);
        }

        const totalPages = Math.ceil(totalProducts / BATCH_SIZE);

        // Validate the total products count
        if (!totalProducts || totalProducts <= 0) {
            throw new Error(`Invalid total products count received from WooCommerce: ${totalProducts}`);
        }

        console.log('\n========================================');
        console.log('🔄 SINCRONIZACIÓN DE PRODUCTOS INICIADA');
        console.log('========================================');
        console.log(`Total de productos: ${totalProducts}`);
        console.log(`Páginas a procesar: ${totalPages}`);
        console.log(`Tamaño de lote: ${BATCH_SIZE}`);
        if (stock_status) console.log(`Filtro stock: ${stock_status}`);
        if (status !== 'publish') console.log(`Filtro estado: ${status}`);
        if (min_stock) console.log(`Stock mínimo: ${min_stock}`);
        if (limit) console.log(`Límite: ${limit} productos`);
        console.log(`Procesar imágenes: ${process_images === 'true' ? 'SÍ' : 'NO'}`);
        console.log('========================================\n');

        // Verify we can get products from the first page
      /*  const firstPageProducts = initialResponse.data;
        console.log(`Products in first page: ${firstPageProducts.length}`);

        if (firstPageProducts.length === 0) {
            throw new Error('No products found in the first page');
        }*/

        // Process products in batches
        while (page <= totalPages) {
            console.log(`🔍 Página ${page}/${totalPages}`);

            // Construir parámetros con filtros
            const batchParams = {
                per_page: BATCH_SIZE,
                page: page,
                status: status
            };

            if (stock_status) {
                batchParams.stock_status = stock_status;
            }

            const response = await wooCommerce.get('products', batchParams);

            const products = response.data;
            console.log(`📦 ${products.length} productos recibidos`);

            if (products.length === 0) {
                break;
            }

            // Process each product in the batch
            for (const product of products) {
                // Verificar si alcanzamos el límite
                if (limit && totalProcessed >= parseInt(limit)) {
                    console.log(`✋ Límite de ${limit} productos alcanzado`);
                    page = totalPages + 1; // Forzar salida del while
                    break;
                }

                try {
                    const {
                        sku,
                        name,
                        stock_quantity,
                        regular_price,
                        meta_data,
                        categories  // Agregar categorías de WooCommerce
                    } = product;

                    // Skip products without SKU
                    if (!sku) {
                        totalSkipped++;
                        continue;
                    }

                    // Aplicar filtro de stock mínimo
                    if (min_stock && (!stock_quantity || stock_quantity < parseInt(min_stock))) {
                        totalSkipped++;
                        continue;
                    }

                    // Get art_sec from articulos table
                    const art_sec = await getArtSecFromArtCod(sku);

                    if (!art_sec) {
                        errors.push({
                            productId: product.sku,
                            error: "No art_sec found for art_cod",
                            details: {
                                art_cod: sku,
                                productId: product.id,
                                name: name
                            }
                        });
                        continue;
                    }

                    // ========================================
                    // NUEVO: Obtener categorías del sistema local
                    // ========================================
                    let catSysCod = null, catSysNombre = null, subcatSysCod = null, subcatSysNombre = null;
                    let catSysWooId = null, subcatSysWooId = null; // IDs de WooCommerce mapeados en el sistema local

                    try {
                        const pool = await poolPromise;
                        const localCategories = await pool.request()
                            .input('art_cod', sql.VarChar(50), sku)
                            .query(`
                                SELECT
                                    ig.inv_gru_cod AS cat_sys_cod,
                                    ig.inv_gru_nom AS cat_sys_nombre,
                                    ig.inv_gru_woo_id AS cat_sys_woo_id,
                                    isg.inv_sub_gru_cod AS subcat_sys_cod,
                                    isg.inv_sub_gru_nom AS subcat_sys_nombre,
                                    isg.inv_sub_gru_woo_id AS subcat_sys_woo_id
                                FROM dbo.articulos a
                                JOIN dbo.inventario_subgrupo isg ON a.inv_sub_gru_cod = isg.inv_sub_gru_cod
                                JOIN dbo.inventario_grupo ig ON isg.inv_gru_cod = ig.inv_gru_cod
                                WHERE a.art_cod = @art_cod
                            `);

                        if (localCategories.recordset.length > 0) {
                            const local = localCategories.recordset[0];

                            // Convertir a string/number y validar
                            catSysCod = local.cat_sys_cod != null ? String(local.cat_sys_cod) : null;
                            catSysNombre = local.cat_sys_nombre != null ? String(local.cat_sys_nombre) : null;
                            catSysWooId = local.cat_sys_woo_id != null ? parseInt(local.cat_sys_woo_id) : null;

                            subcatSysCod = local.subcat_sys_cod != null ? String(local.subcat_sys_cod) : null;
                            subcatSysNombre = local.subcat_sys_nombre != null ? String(local.subcat_sys_nombre) : null;
                            subcatSysWooId = local.subcat_sys_woo_id != null ? parseInt(local.subcat_sys_woo_id) : null;
                        }
                    } catch (categoryError) {
                        // Log de error para depuración
                        console.error(`❌ Error categorías SKU ${sku}:`, categoryError.message);
                    }

                    // ========================================
                    // NUEVO: Procesar categorías de WooCommerce
                    // ========================================
                    let catWooId = null, catWooNombre = null, subcatWooId = null, subcatWooNombre = null;

                    if (categories && categories.length > 0) {
                        // WooCommerce devuelve array de categorías con estructura:
                        // [{ id: 12, name: "Maquillaje" }, { id: 45, name: "Labiales" }]
                        // Ordenar por ID para que el padre sea primero (IDs menores = padres)
                        const sortedCategories = categories.sort((a, b) => a.id - b.id);

                        if (sortedCategories.length >= 1) {
                            catWooId = sortedCategories[0].id;
                            catWooNombre = sortedCategories[0].name;
                        }

                        if (sortedCategories.length >= 2) {
                            subcatWooId = sortedCategories[1].id;
                            subcatWooNombre = sortedCategories[1].name;
                        }
                    }

                    // ========================================
                    // NUEVO: Calcular si hay coincidencia de categorías
                    // Comparación por IDs de WooCommerce (no por nombres)
                    // ========================================
                    const categoriaMatch = (
                        catSysWooId != null && catWooId != null && catSysWooId === catWooId &&
                        subcatSysWooId != null && subcatWooId != null && subcatSysWooId === subcatWooId
                    ) ? 1 : 0;

                    // Procesar imágenes del producto (solo si está habilitado)
                    if (process_images === 'true' && product.images && product.images.length > 0) {
                        // Obtener imágenes existentes del producto
                        const existingPhotos = await ProductPhoto.findByProductId(art_sec);
                        const existingPhotoIds = new Set(existingPhotos.map(photo => photo.woo_photo_id));

                        // Procesar cada imagen
                        for (let i = 0; i < product.images.length; i++) {
                            const image = product.images[i];
                            try {
                                // Si la imagen ya existe, saltarla
                                if (existingPhotoIds.has(image.id.toString())) {
                                    continue;
                                }

                                // Obtener el tipo MIME de la imagen
                                let imageType = 'image/jpeg'; // valor por defecto
                                if (image.src) {
                                    const extension = image.src.split('.').pop().toLowerCase();
                                    switch (extension) {
                                        case 'png':
                                            imageType = 'image/png';
                                            break;
                                        case 'gif':
                                            imageType = 'image/gif';
                                            break;
                                        case 'webp':
                                            imageType = 'image/webp';
                                            break;
                                        case 'jpg':
                                        case 'jpeg':
                                            imageType = 'image/jpeg';
                                            break;
                                    }
                                }

                                // Crear nueva foto
                                const photo = new ProductPhoto({
                                    id: uuidv4(),
                                    art_sec: art_sec.toString(),
                                    nombre: `${sku}_${i + 1}`,
                                    url: image.src,
                                    tipo: imageType,
                                    tamanio: 0,
                                    fecha_creacion: new Date(),
                                    woo_photo_id: image.id.toString(),
                                    es_principal: i === 0,
                                    posicion: i,
                                    estado: 'woo'
                                });

                                await photo.save();
                            } catch (photoError) {
                                errors.push({
                                    productId: sku,
                                    error: "Error al procesar imagen",
                                    details: {
                                        imageId: image.id,
                                        position: i,
                                        error: photoError.message
                                    }
                                });
                            }
                        }
                    }

                    // Find wholesale price from meta_data
                    const wholesalePriceMeta = meta_data.find(meta => meta.key === '_precio_mayorista');
                    const wholesalePrice = wholesalePriceMeta ? Math.round(parseFloat(wholesalePriceMeta.value)) : null;
                    const retailPrice = Math.round(parseFloat(regular_price));

                    // Obtener art_woo_id y stock del sistema (modo silencioso)
                    const artWooId = await getArticleWooId(art_sec, { silent: true });
                    const systemStock = await getArticleStock(art_sec, { silent: true });

                    const currentDate = new Date();
                    const formattedDate = currentDate.toISOString().slice(0, 19).replace('T', ' ');

                    // Check if product exists in ArticuloHook
                    const pool = await poolPromise;
                    const result = await pool.request()
                        .input('ArtHookCod', sql.NVarChar(30), sku)
                        .query('SELECT ArtHookCod FROM ArticuloHook WHERE ArtHookCod = @ArtHookCod');

                    if (result.recordset.length > 0) {
                        // Update existing product
                        const updateRequest = pool.request()
                            .input('ArtHooName', sql.NVarChar(100), name)
                            .input('ArtHooStok', sql.Int, stock_quantity)
                            .input('ArtHookDetal', sql.Decimal(18, 0), retailPrice || 0)
                            .input('ArtHookMayor', sql.Decimal(18, 0), wholesalePrice || 0)
                            .input('ArtHookFchMod', sql.DateTime, currentDate)
                            .input('ArtHookFchHraMod', sql.DateTime, currentDate)
                            .input('ArtHookActualizado', sql.NVarChar(1), 'S')
                            .input('ArtHooStockSys', sql.Int, systemStock)
                            .input('ArtHookCod', sql.NVarChar(30), sku);

                        // Categorías del sistema local (manejar NULL correctamente)
                        updateRequest.input('ArtHookCatSysCod', sql.NVarChar(20), catSysCod || null);
                        updateRequest.input('ArtHookCatSysNombre', sql.NVarChar(100), catSysNombre || null);
                        updateRequest.input('ArtHookSubcatSysCod', sql.NVarChar(20), subcatSysCod || null);
                        updateRequest.input('ArtHookSubcatSysNombre', sql.NVarChar(100), subcatSysNombre || null);

                        // Categorías de WooCommerce (manejar NULL correctamente)
                        updateRequest.input('ArtHookCatWooId', sql.Int, catWooId || null);
                        updateRequest.input('ArtHookCatWooNombre', sql.NVarChar(100), catWooNombre || null);
                        updateRequest.input('ArtHookSubcatWooId', sql.Int, subcatWooId || null);
                        updateRequest.input('ArtHookSubcatWooNombre', sql.NVarChar(100), subcatWooNombre || null);

                        // Metadata de sincronización
                        updateRequest
                            .input('ArtHookCategoriaMatch', sql.Bit, categoriaMatch)
                            .input('ArtHookCatFechaVerificacion', sql.DateTime, currentDate);

                        await updateRequest
                            .query(`
                                UPDATE ArticuloHook
                                SET ArtHooName = @ArtHooName,
                                    ArtHooStok = @ArtHooStok,
                                    ArtHookDetal = @ArtHookDetal,
                                    ArtHookMayor = @ArtHookMayor,
                                    ArtHookFchMod = @ArtHookFchMod,
                                    ArtHookFchHraMod = @ArtHookFchHraMod,
                                    ArtHookActualizado = @ArtHookActualizado,
                                    ArtHooStockSys = @ArtHooStockSys,
                                    ArtHookCatSysCod = @ArtHookCatSysCod,
                                    ArtHookCatSysNombre = @ArtHookCatSysNombre,
                                    ArtHookSubcatSysCod = @ArtHookSubcatSysCod,
                                    ArtHookSubcatSysNombre = @ArtHookSubcatSysNombre,
                                    ArtHookCatWooId = @ArtHookCatWooId,
                                    ArtHookCatWooNombre = @ArtHookCatWooNombre,
                                    ArtHookSubcatWooId = @ArtHookSubcatWooId,
                                    ArtHookSubcatWooNombre = @ArtHookSubcatWooNombre,
                                    ArtHookCategoriaMatch = @ArtHookCategoriaMatch,
                                    ArtHookCatFechaVerificacion = @ArtHookCatFechaVerificacion
                                WHERE ArtHookCod = @ArtHookCod
                            `);
                        totalUpdated++;
                    } else {
                        // Insert new product
                        const insertRequest = pool.request()
                            .input('ArtHookCod', sql.NVarChar(30), sku)
                            .input('ArtHooName', sql.NVarChar(100), name)
                            .input('ArtHooStok', sql.Int, stock_quantity)
                            .input('ArtHookDetal', sql.Decimal(18, 0), retailPrice || 0)
                            .input('ArtHookMayor', sql.Decimal(18, 0), wholesalePrice || 0)
                            .input('ArtHookFchCrea', sql.DateTime, currentDate)
                            .input('ArtHookFchHra', sql.DateTime, currentDate)
                            .input('ArtHooStockSys', sql.Int, systemStock)
                            .input('ArtHookActualizado', sql.NVarChar(1), 'S');

                        // Categorías del sistema local (manejar NULL correctamente)
                        insertRequest.input('ArtHookCatSysCod', sql.NVarChar(20), catSysCod || null);
                        insertRequest.input('ArtHookCatSysNombre', sql.NVarChar(100), catSysNombre || null);
                        insertRequest.input('ArtHookSubcatSysCod', sql.NVarChar(20), subcatSysCod || null);
                        insertRequest.input('ArtHookSubcatSysNombre', sql.NVarChar(100), subcatSysNombre || null);

                        // Categorías de WooCommerce (manejar NULL correctamente)
                        insertRequest.input('ArtHookCatWooId', sql.Int, catWooId || null);
                        insertRequest.input('ArtHookCatWooNombre', sql.NVarChar(100), catWooNombre || null);
                        insertRequest.input('ArtHookSubcatWooId', sql.Int, subcatWooId || null);
                        insertRequest.input('ArtHookSubcatWooNombre', sql.NVarChar(100), subcatWooNombre || null);

                        // Metadata de sincronización
                        insertRequest
                            .input('ArtHookCategoriaMatch', sql.Bit, categoriaMatch)
                            .input('ArtHookCatFechaVerificacion', sql.DateTime, currentDate);

                        await insertRequest
                            .query(`
                                INSERT INTO ArticuloHook
                                (ArtHookCod, ArtHooName, ArtHooStok, ArtHookDetal, ArtHookMayor,
                                 ArtHookFchCrea, ArtHookFchHra, ArtHooStockSys, ArtHookActualizado,
                                 ArtHookCatSysCod, ArtHookCatSysNombre, ArtHookSubcatSysCod, ArtHookSubcatSysNombre,
                                 ArtHookCatWooId, ArtHookCatWooNombre, ArtHookSubcatWooId, ArtHookSubcatWooNombre,
                                 ArtHookCategoriaMatch, ArtHookCatFechaVerificacion)
                                VALUES
                                (@ArtHookCod, @ArtHooName, @ArtHooStok, @ArtHookDetal, @ArtHookMayor,
                                 @ArtHookFchCrea, @ArtHookFchHra, @ArtHooStockSys, @ArtHookActualizado,
                                 @ArtHookCatSysCod, @ArtHookCatSysNombre, @ArtHookSubcatSysCod, @ArtHookSubcatSysNombre,
                                 @ArtHookCatWooId, @ArtHookCatWooNombre, @ArtHookSubcatWooId, @ArtHookSubcatWooNombre,
                                 @ArtHookCategoriaMatch, @ArtHookCatFechaVerificacion)
                            `);
                        totalCreated++;
                    }

                    totalProcessed++;

                    // Mostrar progreso cada 10 productos
                    if (totalProcessed % 10 === 0 || totalProcessed === totalProducts) {
                        const percentage = ((totalProcessed / totalProducts) * 100).toFixed(1);
                        const remaining = totalProducts - totalProcessed;
                        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
                        const productsPerSecond = (totalProcessed / (elapsed || 1)).toFixed(2);
                        const estimatedRemaining = ((remaining / (productsPerSecond || 1)) / 60).toFixed(1);

                        console.log(`📊 Progreso: ${totalProcessed}/${totalProducts} (${percentage}%) | ` +
                                    `Restantes: ${remaining} | ` +
                                    `Velocidad: ${productsPerSecond}/s | ` +
                                    `Tiempo restante: ~${estimatedRemaining} min | ` +
                                    `Actualizados: ${totalUpdated} | Creados: ${totalCreated} | Errores: ${errors.length}`);
                    }
                } catch (error) {
                    // Log el primer error para diagnóstico
                    if (errors.length === 0) {
                        console.error('\n❌ PRIMER ERROR DETECTADO:');
                        console.error('SKU:', product.sku);
                        console.error('Nombre:', product.name);
                        console.error('Error:', error.message);
                        console.error('Stack:', error.stack);
                        console.error('');
                    }

                    errors.push({
                        productId: product.sku,
                        productName: product.name,
                        error: error.message,
                        stack: error.stack
                    });
                }
            }

            page++;
        }

        // Log final results
        const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(2);
        console.log('\n========================================');
        console.log('✅ SINCRONIZACIÓN COMPLETADA');
        console.log('========================================');
        console.log(`Total procesados: ${totalProcessed}`);
        console.log(`Actualizados: ${totalUpdated}`);
        console.log(`Creados: ${totalCreated}`);
        if (totalSkipped > 0) console.log(`Saltados (por filtros): ${totalSkipped}`);
        console.log(`Errores: ${errors.length}`);
        console.log(`Tiempo total: ${totalTime} minutos`);
        console.log('========================================\n');

        // Mostrar muestra de errores para diagnóstico
        if (errors.length > 0) {
            console.log('📋 MUESTRA DE ERRORES (primeros 5):');
            console.log('========================================');
            errors.slice(0, 5).forEach((err, index) => {
                console.log(`\nError ${index + 1}:`);
                console.log(`  SKU: ${err.productId}`);
                console.log(`  Nombre: ${err.productName}`);
                console.log(`  Mensaje: ${err.error}`);
            });
            console.log('========================================\n');
        }

        res.json({
            success: true,
            message: 'Synchronization completed successfully',
            stats: {
                totalProcessed,
                totalUpdated,
                totalCreated,
                totalSkipped,
                totalErrors: errors.length,
                expectedTotal: totalProducts
            },
            filters: {
                stock_status: stock_status || 'all',
                status: status,
                min_stock: min_stock || 'none',
                limit: limit || 'none',
                process_images: process_images === 'true'
            },
            errors: errors.length > 0 ? errors : undefined
        });

    } catch (error) {
        console.error(`Synchronization failed: ${error.message}`);
        res.status(500).json({
            success: false,
            message: 'Synchronization failed',
            error: error.message
        });
    }
};

/**
 * Auditoría de categorías - Obtiene productos con discrepancias
 * GET /api/woo/audit-categories?onlyMismatches=true
 *
 * Query params:
 * - onlyMismatches: 'true' para mostrar solo productos con discrepancias
 *
 * Retorna lista de productos con sus categorías del sistema local y WooCommerce
 */
export const auditCategories = async (req, res) => {
    const { onlyMismatches = 'false' } = req.query;

    try {
        const pool = await poolPromise;

        let query = `
            SELECT
                ArtHookCod AS sku,
                ArtHooName AS nombre,
                ArtHookCatSysNombre AS categoria_sistema,
                ArtHookSubcatSysNombre AS subcategoria_sistema,
                ArtHookCatWooNombre AS categoria_woocommerce,
                ArtHookSubcatWooNombre AS subcategoria_woocommerce,
                CASE
                    WHEN ArtHookCategoriaMatch = 1 THEN 'Coincide'
                    WHEN ArtHookCategoriaMatch = 0 AND ArtHookCatFechaVerificacion IS NOT NULL THEN 'Discrepancia'
                    ELSE 'Sin verificar'
                END AS estado,
                ArtHookCatFechaVerificacion AS fecha_verificacion
            FROM ArticuloHook
        `;

        if (onlyMismatches === 'true') {
            // Solo mostrar discrepancias verificadas (excluir sin verificar)
            query += ' WHERE ArtHookCategoriaMatch = 0 AND ArtHookCatFechaVerificacion IS NOT NULL';
        }

        query += ' ORDER BY ArtHookCod';

        const result = await pool.request().query(query);

        // Calcular estadísticas
        const total = result.recordset.length;
        const coincidencias = result.recordset.filter(r => r.estado === 'Coincide').length;
        const discrepancias = result.recordset.filter(r => r.estado === 'Discrepancia').length;
        const sinVerificar = result.recordset.filter(r => r.estado === 'Sin verificar').length;

        res.json({
            success: true,
            message: 'Auditoría completada',
            stats: {
                total,
                coincidencias,
                discrepancias,
                sinVerificar
            },
            data: result.recordset
        });

    } catch (error) {
        console.error('Error en auditoría de categorías:', error);
        res.status(500).json({
            success: false,
            message: 'Error al auditar categorías',
            error: error.message
        });
    }
};

/**
 * Corrige la categoría de un producto específico
 * POST /api/woo/fix-category
 *
 * Body:
 * - art_cod: SKU del producto (requerido)
 * - action: "sync-from-woo" | "sync-to-woo" (requerido)
 *
 * - sync-from-woo: Sincroniza categorías DESDE WooCommerce al sistema local (RECOMENDADO - WooCommerce es fuente de verdad)
 * - sync-to-woo: Sincroniza categorías DEL SISTEMA LOCAL hacia WooCommerce (usar solo en casos específicos)
 *
 * Retorna el resultado de la sincronización
 */
export const fixProductCategory = async (req, res) => {
    const { art_cod, action } = req.body;

    // Validación de parámetros
    if (!art_cod || !action) {
        return res.status(400).json({
            success: false,
            message: 'Parámetros requeridos: art_cod, action'
        });
    }

    if (!['sync-to-woo', 'sync-from-woo'].includes(action)) {
        return res.status(400).json({
            success: false,
            message: 'action debe ser "sync-to-woo" o "sync-from-woo"'
        });
    }

    try {
        const pool = await poolPromise;

        if (action === 'sync-from-woo') {
            // ========================================
            // ACCIÓN: Sincronizar desde WooCommerce al SISTEMA LOCAL
            // ✅ RECOMENDADO - WooCommerce es la fuente de verdad
            // ========================================

            // 1. Obtener categorías de ArticuloHook (que vienen de WooCommerce)
            const hookData = await pool.request()
                .input('art_cod', sql.VarChar(50), art_cod)
                .query(`
                    SELECT
                        ArtHookSubcatWooId,
                        ArtHookSubcatWooNombre,
                        ArtHookCatWooNombre
                    FROM ArticuloHook
                    WHERE ArtHookCod = @art_cod
                `);

            if (hookData.recordset.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Producto no encontrado en ArticuloHook. Ejecute primero POST /api/woo/sync'
                });
            }

            const { ArtHookSubcatWooId, ArtHookSubcatWooNombre, ArtHookCatWooNombre } = hookData.recordset[0];

            if (!ArtHookSubcatWooId) {
                return res.status(400).json({
                    success: false,
                    message: 'No hay subcategoría de WooCommerce para este producto'
                });
            }

            // 2. Mapear ID de WooCommerce a código del sistema local
            const mapping = await pool.request()
                .input('woo_id', sql.Int, ArtHookSubcatWooId)
                .query(`
                    SELECT inv_sub_gru_cod, inv_sub_gru_nom
                    FROM dbo.inventario_subgrupo
                    WHERE inv_sub_gru_woo_id = @woo_id
                `);

            if (mapping.recordset.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: `No se encontró mapeo para la categoría de WooCommerce "${ArtHookSubcatWooNombre}" (ID: ${ArtHookSubcatWooId}). Necesita configurarse manualmente en inventario_subgrupo.`
                });
            }

            const { inv_sub_gru_cod, inv_sub_gru_nom } = mapping.recordset[0];

            // Validar que tengamos un código válido
            if (!inv_sub_gru_cod) {
                return res.status(400).json({
                    success: false,
                    message: `El mapeo de la categoría "${ArtHookSubcatWooNombre}" no tiene un código válido en inventario_subgrupo.`
                });
            }

            // 3. Actualizar en articulos
            await pool.request()
                .input('art_cod', sql.VarChar(50), art_cod)
                .input('inv_sub_gru_cod', sql.VarChar(20), String(inv_sub_gru_cod))
                .query(`
                    UPDATE dbo.articulos
                    SET inv_sub_gru_cod = @inv_sub_gru_cod
                    WHERE art_cod = @art_cod
                `);

            // 4. Actualizar ArticuloHook
            const currentDate = new Date();
            await pool.request()
                .input('art_cod', sql.VarChar(50), art_cod)
                .input('fecha', sql.DateTime, currentDate)
                .query(`
                    UPDATE ArticuloHook
                    SET ArtHookCategoriaMatch = 1,
                        ArtHookCatFechaVerificacion = @fecha
                    WHERE ArtHookCod = @art_cod
                `);

            return res.json({
                success: true,
                message: 'Categoría actualizada en el sistema local desde WooCommerce',
                action: 'sync-from-woo',
                product: art_cod,
                oldCategory: { woo: ArtHookCatWooNombre, subcategoria: ArtHookSubcatWooNombre },
                newCategory: { codigo: inv_sub_gru_cod, nombre: inv_sub_gru_nom }
            });

        } else if (action === 'sync-to-woo') {
            // ========================================
            // ACCIÓN: Sincronizar desde SISTEMA LOCAL a WooCommerce
            // ⚠️ Usar solo en casos específicos
            // ========================================

            // 1. Obtener categorías y art_woo_id del sistema local
            const localData = await pool.request()
                .input('art_cod', sql.VarChar(50), art_cod)
                .query(`
                    SELECT
                        a.art_woo_id,
                        isg.inv_sub_gru_woo_id,
                        isg.inv_sub_gru_parend_woo,
                        ig.inv_gru_nom AS categoria,
                        isg.inv_sub_gru_nom AS subcategoria
                    FROM dbo.articulos a
                    JOIN dbo.inventario_subgrupo isg ON a.inv_sub_gru_cod = isg.inv_sub_gru_cod
                    JOIN dbo.inventario_grupo ig ON isg.inv_gru_cod = ig.inv_gru_cod
                    WHERE a.art_cod = @art_cod
                `);

            if (localData.recordset.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Producto no encontrado en el sistema local'
                });
            }

            const { art_woo_id, inv_sub_gru_woo_id, inv_sub_gru_parend_woo, categoria, subcategoria } = localData.recordset[0];

            if (!art_woo_id) {
                return res.status(400).json({
                    success: false,
                    message: 'El producto no tiene art_woo_id. No está sincronizado con WooCommerce.'
                });
            }

            // 2. Preparar categorías para WooCommerce
            const categories = [];
            if (inv_sub_gru_parend_woo) {
                categories.push({ id: parseInt(inv_sub_gru_parend_woo) });
            }
            if (inv_sub_gru_woo_id) {
                categories.push({ id: parseInt(inv_sub_gru_woo_id) });
            }

            if (categories.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'No hay categorías de WooCommerce mapeadas en inventario_subgrupo'
                });
            }

            // 3. Actualizar en WooCommerce
            await wooCommerce.put(`products/${art_woo_id}`, {
                categories: categories
            });

            // 4. Actualizar ArticuloHook para reflejar el cambio
            const currentDate = new Date();
            await pool.request()
                .input('art_cod', sql.VarChar(50), art_cod)
                .input('fecha', sql.DateTime, currentDate)
                .query(`
                    UPDATE ArticuloHook
                    SET ArtHookCategoriaMatch = 1,
                        ArtHookCatFechaVerificacion = @fecha
                    WHERE ArtHookCod = @art_cod
                `);

            return res.json({
                success: true,
                message: 'Categorías actualizadas en WooCommerce desde el sistema local',
                warning: 'Nota: WooCommerce es la fuente de verdad. Use esta acción solo en casos específicos.',
                action: 'sync-to-woo',
                product: art_cod,
                categories: {
                    categoria,
                    subcategoria
                }
            });
        }

    } catch (error) {
        console.error('Error al corregir categoría:', error);
        res.status(500).json({
            success: false,
            message: 'Error al corregir categoría',
            error: error.message,
            details: error.response?.data || null
        });
    }
};

/**
 * Sincroniza masivamente todas las categorías desde WooCommerce al sistema local
 * POST /api/woo/fix-all-categories
 *
 * Query params:
 * - dry_run: 'true' | 'false' - Solo simular sin aplicar cambios (default: 'true')
 *
 * Retorna el resultado de la sincronización masiva
 */
export const fixAllCategories = async (req, res) => {
    const { dry_run = 'true' } = req.query;
    const isDryRun = dry_run === 'true';

    let totalProcessed = 0;
    let totalSuccess = 0;
    let totalFailed = 0;
    let totalSkipped = 0;
    const errors = [];
    const results = [];

    try {
        const pool = await poolPromise;

        console.log('\n========================================');
        console.log(`🔄 SINCRONIZACIÓN MASIVA DE CATEGORÍAS ${isDryRun ? '(MODO SIMULACIÓN)' : '(MODO REAL)'}`);
        console.log('========================================\n');

        // Obtener todos los productos con discrepancias
        const discrepancies = await pool.request().query(`
            SELECT
                ArtHookCod AS sku,
                ArtHooName AS nombre,
                ArtHookCatWooId,
                ArtHookCatWooNombre,
                ArtHookSubcatWooId,
                ArtHookSubcatWooNombre,
                ArtHookCatSysNombre,
                ArtHookSubcatSysNombre
            FROM ArticuloHook
            WHERE ArtHookCategoriaMatch = 0
              AND ArtHookCatFechaVerificacion IS NOT NULL
              AND ArtHookSubcatWooId IS NOT NULL
            ORDER BY ArtHookCod
        `);

        const totalDiscrepancies = discrepancies.recordset.length;
        console.log(`📋 Total de discrepancias encontradas: ${totalDiscrepancies}\n`);

        if (totalDiscrepancies === 0) {
            return res.json({
                success: true,
                message: 'No hay discrepancias para sincronizar',
                stats: {
                    totalProcessed: 0,
                    totalSuccess: 0,
                    totalFailed: 0,
                    totalSkipped: 0
                },
                dry_run: isDryRun
            });
        }

        // Procesar cada producto con discrepancia
        for (const product of discrepancies.recordset) {
            totalProcessed++;

            try {
                const { sku, nombre, ArtHookSubcatWooId, ArtHookSubcatWooNombre, ArtHookCatWooNombre } = product;

                // Buscar mapeo de categoría de WooCommerce a sistema local
                const mapping = await pool.request()
                    .input('woo_id', sql.Int, ArtHookSubcatWooId)
                    .query(`
                        SELECT inv_sub_gru_cod, inv_sub_gru_nom
                        FROM dbo.inventario_subgrupo
                        WHERE inv_sub_gru_woo_id = @woo_id
                    `);

                if (mapping.recordset.length === 0) {
                    totalSkipped++;
                    errors.push({
                        sku,
                        nombre,
                        error: `No hay mapeo para categoría WooCommerce "${ArtHookSubcatWooNombre}" (ID: ${ArtHookSubcatWooId})`
                    });
                    continue;
                }

                const { inv_sub_gru_cod, inv_sub_gru_nom } = mapping.recordset[0];

                // Validar que tengamos un código válido
                if (!inv_sub_gru_cod) {
                    totalSkipped++;
                    errors.push({
                        sku,
                        nombre,
                        error: `El mapeo de la categoría "${ArtHookSubcatWooNombre}" no tiene un código válido`
                    });
                    continue;
                }

                if (!isDryRun) {
                    // Actualizar en articulos (solo si NO es dry run)
                    await pool.request()
                        .input('art_cod', sql.VarChar(50), sku)
                        .input('inv_sub_gru_cod', sql.VarChar(20), String(inv_sub_gru_cod))
                        .query(`
                            UPDATE dbo.articulos
                            SET inv_sub_gru_cod = @inv_sub_gru_cod
                            WHERE art_cod = @art_cod
                        `);

                    // Actualizar ArticuloHook para marcar como sincronizado
                    const currentDate = new Date();
                    await pool.request()
                        .input('art_cod', sql.VarChar(50), sku)
                        .input('fecha', sql.DateTime, currentDate)
                        .query(`
                            UPDATE ArticuloHook
                            SET ArtHookCategoriaMatch = 1,
                                ArtHookCatFechaVerificacion = @fecha
                            WHERE ArtHookCod = @art_cod
                        `);
                }

                totalSuccess++;
                results.push({
                    sku,
                    nombre,
                    categoria_woo: `${ArtHookCatWooNombre} > ${ArtHookSubcatWooNombre}`,
                    nueva_categoria_sistema: `${inv_sub_gru_nom} (${inv_sub_gru_cod})`,
                    aplicado: !isDryRun
                });

                // Mostrar progreso cada 10 productos
                if (totalProcessed % 10 === 0) {
                    const percentage = ((totalProcessed / totalDiscrepancies) * 100).toFixed(1);
                    console.log(`📊 Progreso: ${totalProcessed}/${totalDiscrepancies} (${percentage}%) | ` +
                                `Exitosos: ${totalSuccess} | Saltados: ${totalSkipped} | Errores: ${totalFailed}`);
                }

            } catch (error) {
                totalFailed++;
                errors.push({
                    sku: product.sku,
                    nombre: product.nombre,
                    error: error.message
                });
            }
        }

        console.log('\n========================================');
        console.log(`✅ SINCRONIZACIÓN MASIVA ${isDryRun ? 'SIMULADA' : 'COMPLETADA'}`);
        console.log('========================================');
        console.log(`Total procesados: ${totalProcessed}`);
        console.log(`Exitosos: ${totalSuccess}`);
        console.log(`Saltados: ${totalSkipped}`);
        console.log(`Errores: ${totalFailed}`);
        console.log('========================================\n');

        res.json({
            success: true,
            message: isDryRun
                ? `Simulación completada. ${totalSuccess} productos pueden sincronizarse correctamente.`
                : `Sincronización completada. ${totalSuccess} productos actualizados.`,
            stats: {
                totalProcessed,
                totalSuccess,
                totalFailed,
                totalSkipped
            },
            dry_run: isDryRun,
            results: results.slice(0, 20), // Mostrar solo primeros 20 resultados
            errors: errors.length > 0 ? errors.slice(0, 10) : undefined // Mostrar solo primeros 10 errores
        });

    } catch (error) {
        console.error('Error en sincronización masiva:', error);
        res.status(500).json({
            success: false,
            message: 'Error en sincronización masiva',
            error: error.message
        });
    }
};