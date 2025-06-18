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


/** Obtener el total de articulos en la tabla articulos          */
const getTotalArticulos = async () => {
    const pool = await poolPromise;
    const result = await pool.request().query('SELECT COUNT(*) AS total FROM dbo.articulos');
    return result.recordset[0].total;
};


/**
 * Synchronizes products from WooCommerce to ArticuloHook table
 * Uses pagination and batch processing for better performance
 */
export const syncWooProducts = async (req, res) => {
    const BATCH_SIZE = 100; // Number of products to process in each batch
    let page = 1;
    let totalProcessed = 0;
    let totalUpdated = 0;
    let totalCreated = 0;
    let errors = [];

    try {
        // Get total number of products with a larger per_page to ensure we get the total
        //
       /* const initialResponse = await wooCommerce.get('products', {
            per_page: 100,
            page: 1
        });*/

        
        
        // Log the complete response headers for debugging
       // console.log('WooCommerce Response Headers:', initialResponse.headers);
        
        //const totalProducts = parseInt(initialResponse.headers['x-wp-total']);
        const totalProducts = await getTotalArticulos();
        const totalPages = Math.ceil(totalProducts / BATCH_SIZE);

        // Validate the total products count
        if (!totalProducts || totalProducts <= 0) {
            throw new Error(`Invalid total products count received: ${totalProducts}`);
        }

        console.log(`Starting synchronization of ${totalProducts} products`);
        console.log(`Total pages to process: ${totalPages}`);
        console.log(`Batch size: ${BATCH_SIZE}`);

        // Verify we can get products from the first page
      /*  const firstPageProducts = initialResponse.data;
        console.log(`Products in first page: ${firstPageProducts.length}`);

        if (firstPageProducts.length === 0) {
            throw new Error('No products found in the first page');
        }*/

        // Process products in batches
        while (page <= totalPages) {
            console.log(`Processing page ${page} of ${totalPages}`);
            
            const response = await wooCommerce.get('products', {
                per_page: BATCH_SIZE,
                page: page
            });

            const products = response.data;
            console.log(`Retrieved ${products.length} products from page ${page}`);
            
            if (products.length === 0) {
                console.warn(`No products found in page ${page}, stopping synchronization`);
                break;
            }

            // Process each product in the batch
            for (const product of products) {
                try {
                    const {
                        sku,
                        name,
                        stock_quantity,
                        regular_price,
                        meta_data
                    } = product;

                    console.log('Processing product:', {
                        id: product.id,
                        sku,
                        name,
                        stock_quantity,
                        regular_price
                    });

                    // Skip products without SKU
                    if (!sku) {
                        console.warn(`Product ${product.id} skipped: No SKU found`);
                        continue;
                    }

                    // Get art_sec from articulos table
                    console.log('Getting art_sec for art_cod:', sku);
                    const art_sec = await getArtSecFromArtCod(sku);
                    
                    if (!art_sec) {
                        console.warn(`Product ${product.sku} skipped: No art_sec found for art_cod`, {
                            art_cod: sku,
                            productId: product.id,
                            name: name
                        });
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

                    console.log('Found art_sec:', art_sec);

                    // Procesar imágenes del producto
                    if (product.images && product.images.length > 0) {
                        console.log('Procesando imágenes del producto:', {
                            productId: product.id,
                            imageCount: product.images.length
                        });

                        // Obtener imágenes existentes del producto
                        const existingPhotos = await ProductPhoto.findByProductId(art_sec);
                        const existingPhotoIds = new Set(existingPhotos.map(photo => photo.woo_photo_id));

                        // Procesar cada imagen
                        for (let i = 0; i < product.images.length; i++) {
                            const image = product.images[i];
                            try {
                                // Si la imagen ya existe, saltarla
                                if (existingPhotoIds.has(image.id.toString())) {
                                    console.log('Imagen ya existe, saltando:', {
                                        woo_photo_id: image.id,
                                        position: i
                                    });
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
                                        default:
                                            console.log('Extensión de imagen no reconocida:', extension);
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
                                console.log('Nueva imagen guardada:', {
                                    woo_photo_id: image.id,
                                    position: i,
                                    tipo: imageType
                                });
                            } catch (photoError) {
                                console.error('Error al procesar imagen:', {
                                    error: photoError.message,
                                    imageId: image.id,
                                    position: i
                                });
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

                    console.log('Price information:', {
                        wholesalePrice,
                        retailPrice,
                        meta_data: meta_data.map(m => ({ key: m.key, value: m.value }))
                    });

                    // Obtener art_woo_id y stock del sistema
                    console.log('Fetching art_woo_id for art_sec:', art_sec);
                    const artWooId = await getArticleWooId(art_sec);
                    console.log('art_woo_id result:', artWooId);

                    const systemStock = await getArticleStock(art_sec);
                    console.log('systemStock result:', systemStock);

                    const currentDate = new Date();
                    const formattedDate = currentDate.toISOString().slice(0, 19).replace('T', ' ');

                    // Check if product exists in ArticuloHook
                    const pool = await poolPromise;
                    const result = await pool.request()
                        .input('ArtHookCod', sql.NVarChar(30), sku)
                        .query('SELECT ArtHookCod FROM ArticuloHook WHERE ArtHookCod = @ArtHookCod');

                    if (result.recordset.length > 0) {
                        // Update existing product
                        await pool.request()
                            .input('ArtHooName', sql.NVarChar(100), name)
                            .input('ArtHooStok', sql.Int, stock_quantity)
                            .input('ArtHookDetal', sql.Decimal(18, 0), retailPrice || 0)
                            .input('ArtHookMayor', sql.Decimal(18, 0), wholesalePrice || 0)
                            .input('ArtHookFchMod', sql.DateTime, currentDate)
                            .input('ArtHookFchHraMod', sql.DateTime, currentDate)
                            .input('ArtHookActualizado', sql.NVarChar(1), 'S')
                            .input('ArtHooStockSys', sql.Int, systemStock)
                            .input('ArtHookCod', sql.NVarChar(30), sku)
                            .query(`
                                UPDATE ArticuloHook 
                                SET ArtHooName = @ArtHooName,
                                    ArtHooStok = @ArtHooStok,
                                    ArtHookDetal = @ArtHookDetal,
                                    ArtHookMayor = @ArtHookMayor,
                                    ArtHookFchMod = @ArtHookFchMod,
                                    ArtHookFchHraMod = @ArtHookFchHraMod,
                                    ArtHookActualizado = @ArtHookActualizado,
                                    ArtHooStockSys = @ArtHooStockSys
                                WHERE ArtHookCod = @ArtHookCod
                            `);
                        totalUpdated++;
                    } else {
                        // Insert new product
                        await pool.request()
                            .input('ArtHookCod', sql.NVarChar(30), sku)
                            .input('ArtHooName', sql.NVarChar(100), name)
                            .input('ArtHooStok', sql.Int, stock_quantity)
                            .input('ArtHookDetal', sql.Decimal(18, 0), retailPrice || 0)
                            .input('ArtHookMayor', sql.Decimal(18, 0), wholesalePrice || 0)
                            .input('ArtHookFchCrea', sql.DateTime, currentDate)
                            .input('ArtHookFchHra', sql.DateTime, currentDate)
                            .input('ArtHooStockSys', sql.Int, systemStock)
                            .input('ArtHookActualizado', sql.NVarChar(1), 'S')
                            .query(`
                                INSERT INTO ArticuloHook 
                                (ArtHookCod, ArtHooName, ArtHooStok, ArtHookDetal, ArtHookMayor, 
                                 ArtHookFchCrea, ArtHookFchHra, ArtHooStockSys, ArtHookActualizado)
                                VALUES 
                                (@ArtHookCod, @ArtHooName, @ArtHooStok, @ArtHookDetal, @ArtHookMayor,
                                 @ArtHookFchCrea, @ArtHookFchHra, @ArtHooStockSys, @ArtHookActualizado)
                            `);
                        totalCreated++;
                    }

                    totalProcessed++;
                } catch (error) {
                    console.error(`Error processing product ${product.sku}: ${error.message}`);
                    errors.push({
                        productId: product.sku,
                        error: error.message
                    });
                }
            }

            console.log(`Completed batch ${page}/${totalPages}. Processed ${totalProcessed} products so far`);
            page++;
        }

        // Log final results
        console.log(`Synchronization completed:
            Total processed: ${totalProcessed}
            Total updated: ${totalUpdated}
            Total created: ${totalCreated}
            Total errors: ${errors.length}
            Expected total: ${totalProducts}`);

        res.json({
            success: true,
            message: 'Synchronization completed successfully',
            stats: {
                totalProcessed,
                totalUpdated,
                totalCreated,
                totalErrors: errors.length,
                expectedTotal: totalProducts
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