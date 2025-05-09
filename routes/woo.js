import express from 'express';
import { updateArticleImagesFromWoo } from '../jobs/updateArticleImagesFromWoo.js';
import { poolPromise, sql } from '../db.js';
import wcPkg from "@woocommerce/woocommerce-rest-api";
const WooCommerceRestApi = wcPkg.default || wcPkg;

const router = express.Router();

// Configura la API de WooCommerce
const wcApi = new WooCommerceRestApi({
    url: process.env.WC_URL,
    consumerKey: process.env.WC_CONSUMER_KEY,
    consumerSecret: process.env.WC_CONSUMER_SECRET,
    version: "wc/v3"
});

// Endpoint para actualizar imágenes de artículos
router.post('/update-article-images', async (req, res) => {
    try {
        const { batchSize } = req.body;
        const result = await updateArticleImagesFromWoo(batchSize || 10);

        res.status(200).json(result);
    } catch (error) {
        console.error('Error en update-article-images:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Nuevo endpoint para sincronizar imagen de un artículo específico
router.post('/sync-article-image/:art_cod', async (req, res) => {
    try {
        const { art_cod } = req.params;
        console.log('Iniciando sincronización de imagen para artículo:', art_cod);

        // 1. Validar que el artículo existe y obtener su art_woo_id
        const pool = await poolPromise;
        console.log('Consultando artículo en base de datos...');
        const articleResult = await pool.request()
            .input('art_cod', sql.VarChar(50), art_cod)
            .query(`
                SELECT art_sec, art_woo_id, art_nom
                FROM dbo.articulos 
                WHERE art_cod = @art_cod
            `);

        console.log('Resultado de consulta:', articleResult.recordset);

        if (articleResult.recordset.length === 0) {
            console.log('Artículo no encontrado en la base de datos');
            return res.status(404).json({
                success: false,
                error: 'Artículo no encontrado'
            });
        }

        const { art_sec, art_woo_id, art_nom } = articleResult.recordset[0];
        console.log('Datos del artículo:', { art_sec, art_woo_id, art_nom });

        if (!art_woo_id) {
            console.log('El artículo no tiene ID de WooCommerce');
            return res.status(400).json({
                success: false,
                error: 'El artículo no tiene un ID de WooCommerce asociado'
            });
        }

        // 2. Obtener información del producto de WooCommerce
        console.log('Consultando producto en WooCommerce, ID:', art_woo_id);
        const wooResponse = await wcApi.get(`products/${art_woo_id}`);
        console.log('Respuesta de WooCommerce:', JSON.stringify(wooResponse.data, null, 2));
        const product = wooResponse.data;

        // 3. Obtener la primera imagen
        const firstImage = product.images?.[0]?.src;
        console.log('URL de la imagen encontrada:', firstImage);

        if (!firstImage) {
            console.log('No se encontró imagen en WooCommerce');
            return res.status(404).json({
                success: false,
                error: 'No se encontró imagen para el artículo en WooCommerce'
            });
        }

        // 4. Actualizar la imagen en la base de datos
        console.log('Actualizando imagen en base de datos...');
        await pool.request()
            .input('art_sec', sql.VarChar(50), art_sec)
            .input('imageUrl', sql.VarChar(1000), firstImage)
            .query(`
                UPDATE dbo.articulos 
                SET art_url_img_servi = @imageUrl,
                    art_actualizado = 'S'
                WHERE art_sec = @art_sec
            `);

        console.log('Actualización completada exitosamente');
        res.status(200).json({
            success: true,
            message: 'Imagen actualizada exitosamente',
            data: {
                art_cod,
                art_sec,
                art_woo_id,
                art_nom,
                image_url: firstImage
            }
        });

    } catch (error) {
        console.error('Error detallado en sync-article-image:', {
            message: error.message,
            stack: error.stack,
            response: error.response?.data
        });
        res.status(500).json({
            success: false,
            error: error.message,
            details: error.response?.data || 'No hay detalles adicionales'
        });
    }
});

export default router; 