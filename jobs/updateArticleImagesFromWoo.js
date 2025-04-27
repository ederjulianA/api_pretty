import { poolPromise, sql } from "../db.js";
import wcPkg from "@woocommerce/woocommerce-rest-api";
const WooCommerceRestApi = wcPkg.default || wcPkg;

// Configuración de logging
const logLevels = {
    INFO: 'INFO',
    WARN: 'WARN',
    ERROR: 'ERROR',
    DEBUG: 'DEBUG'
};

const log = (level, message, data = null) => {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level}] [WOO_IMG] ${message}`;
    console.log(logMessage, data ? JSON.stringify(data, null, 2) : '');
    return { timestamp, level, message, data };
};

// Configura la API de WooCommerce
const wcApi = new WooCommerceRestApi({
    url: process.env.WC_URL,
    consumerKey: process.env.WC_CONSUMER_KEY,
    consumerSecret: process.env.WC_CONSUMER_SECRET,
    version: "wc/v3",
    timeout: 10000, // 10 segundos para cumplir con Vercel
    axiosConfig: {
        headers: {
            'Content-Type': 'application/json',
        }
    }
});

// Función para obtener artículos que necesitan actualización de imagen
const getArticlesToUpdate = async (batchSize = 10) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('batchSize', sql.Int, batchSize)
            .query(`
                SELECT TOP (@batchSize) 
                    art_sec, art_woo_id, art_url_img_servi, art_cod
                FROM articulos 
                WHERE art_woo_id IS NOT NULL 
                AND art_actualizado = 'N'
                ORDER BY art_sec
            `);
        return result.recordset;
    } catch (error) {
        log(logLevels.ERROR, "Error obteniendo artículos para actualizar", error);
        throw error;
    }
};

// Función para actualizar la imagen de un artículo
const updateArticleImage = async (art_sec, imageUrl) => {
    try {
        const pool = await poolPromise;
        await pool.request()
            .input('art_sec', sql.VarChar, art_sec)
            .input('imageUrl', sql.VarChar, imageUrl)
            .query(`
                UPDATE articulos 
                SET art_url_img_servi = @imageUrl,
                    art_actualizado = 'S'
                WHERE art_sec = @art_sec
            `);
        return true;
    } catch (error) {
        log(logLevels.ERROR, `Error actualizando imagen para artículo ${art_sec}`, error);
        throw error;
    }
};

// Función principal para actualizar imágenes
const updateArticleImagesFromWoo = async (batchSize = 10) => {
    const startTime = new Date();
    let processedCount = 0;
    let successCount = 0;
    let errorCount = 0;
    const logs = [];

    try {
        // Obtener artículos a actualizar
        const articles = await getArticlesToUpdate(batchSize);
        processedCount = articles.length;

        if (articles.length === 0) {
            logs.push(log(logLevels.INFO, "No hay artículos para actualizar"));
            return {
                success: true,
                processedCount,
                successCount,
                errorCount,
                duration: (new Date() - startTime) / 1000,
                logs
            };
        }

        // Procesar cada artículo
        for (const article of articles) {
            try {
                // Obtener información del producto de WooCommerce
                const response = await wcApi.get(`products/${article.art_woo_id}`);
                const product = response.data;

                // Obtener la primera imagen
                const firstImage = product.images?.[0]?.src;

                if (firstImage) {
                    // Actualizar en la base de datos
                    await updateArticleImage(article.art_sec, firstImage);
                    successCount++;
                    logs.push(log(logLevels.INFO, `Imagen actualizada para artículo ${article.art_cod}`));
                } else {
                    logs.push(log(logLevels.WARN, `No se encontró imagen para artículo ${article.art_cod}`));
                }
            } catch (error) {
                errorCount++;
                logs.push(log(logLevels.ERROR, `Error procesando artículo ${article.art_cod}`, error));
            }
        }

        return {
            success: true,
            processedCount,
            successCount,
            errorCount,
            duration: (new Date() - startTime) / 1000,
            logs
        };
    } catch (error) {
        logs.push(log(logLevels.ERROR, "Error general en updateArticleImagesFromWoo", error));
        return {
            success: false,
            processedCount,
            successCount,
            errorCount,
            duration: (new Date() - startTime) / 1000,
            logs
        };
    }
};

export { updateArticleImagesFromWoo }; 