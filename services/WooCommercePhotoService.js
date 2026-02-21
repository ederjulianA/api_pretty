import wcPkg from "@woocommerce/woocommerce-rest-api";
const WooCommerceRestApi = wcPkg.default || wcPkg;

class WooCommercePhotoService {
    constructor() {
        this.wcApi = new WooCommerceRestApi({
            url: process.env.WC_URL,
            consumerKey: process.env.WC_CONSUMER_KEY,
            consumerSecret: process.env.WC_CONSUMER_SECRET,
            version: "wc/v3",
            timeout: 30000  // 30 segundos para operaciones con imágenes
        });
    }

    /**
     * Sube una foto a WooCommerce
     * @param {string} apiPath - Path de la API (ej: "products/123" o "products/100/variations/456")
     * @param {string} imageUrl - URL de la imagen a subir
     */
    async uploadPhoto(apiPath, imageUrl) {
        try {
            console.log('Intentando subir foto a WooCommerce:', {
                apiPath,
                imageUrl
            });

            // Obtener el producto/variación actual
            const productResponse = await this.wcApi.get(apiPath);
            if (!productResponse || !productResponse.data) {
                throw new Error(`No encontrado en WooCommerce (path: ${apiPath})`);
            }

            console.log('Encontrado en WooCommerce:', productResponse.data.id);

            // Verificar que la URL de la imagen es accesible
            try {
                const imageResponse = await fetch(imageUrl);
                if (!imageResponse.ok) {
                    throw new Error(`La URL de la imagen no es accesible: ${imageUrl}`);
                }
            } catch (error) {
                throw new Error(`Error al verificar la URL de la imagen: ${error.message}`);
            }

            console.log('URL de imagen verificada, procediendo a subir...');

            // Variaciones solo soportan 1 imagen (image singular), productos soportan múltiples
            const isVariation = apiPath.includes('/variations/');

            if (isVariation) {
                // Variaciones: usar campo "image" (singular)
                const response = await this.wcApi.put(apiPath, {
                    image: { src: imageUrl }
                });

                if (!response || !response.data) {
                    throw new Error('Respuesta inválida de WooCommerce');
                }

                const newImage = response.data.image;
                console.log('Foto subida exitosamente a variación WooCommerce:', newImage);
                return newImage;
            } else {
                // Productos simples/variables: usar campo "images" (plural)
                const currentImages = productResponse.data.images || [];

                const updatedImages = [
                    ...currentImages,
                    {
                        src: imageUrl,
                        position: currentImages.length
                    }
                ];

                const response = await this.wcApi.put(apiPath, {
                    images: updatedImages
                });

                if (!response || !response.data) {
                    throw new Error('Respuesta inválida de WooCommerce');
                }

                const newImage = response.data.images[response.data.images.length - 1];
                console.log('Foto subida exitosamente a WooCommerce:', newImage);
                return newImage;
            }
        } catch (error) {
            console.error('Error detallado al subir foto a WooCommerce:', {
                error: error.message,
                response: error.response?.data,
                status: error.response?.status,
                apiPath,
                imageUrl
            });
            throw new Error(`Error uploading photo to WooCommerce: ${error.message}`);
        }
    }

    /**
     * Elimina una foto de WooCommerce
     * @param {string} apiPath - Path de la API (ej: "products/123" o "products/100/variations/456")
     * @param {string} imageId - ID de la imagen en WooCommerce
     */
    async deletePhoto(apiPath, imageId) {
        try {
            console.log('Intentando eliminar foto de WooCommerce:', {
                apiPath,
                imageId
            });

            const isVariation = apiPath.includes('/variations/');

            if (isVariation) {
                // Variaciones: limpiar la imagen (solo tienen 1)
                const updateResponse = await this.wcApi.put(apiPath, {
                    image: null
                });

                if (!updateResponse || !updateResponse.data) {
                    throw new Error('Error al actualizar la variación en WooCommerce');
                }
            } else {
                // Productos: filtrar la imagen del array
                const productResponse = await this.wcApi.get(apiPath);
                if (!productResponse || !productResponse.data) {
                    throw new Error(`No encontrado en WooCommerce (path: ${apiPath})`);
                }

                const currentImages = productResponse.data.images || [];
                const updatedImages = [];
                let position = 0;

                for (const image of currentImages) {
                    if (image.id.toString() !== imageId.toString()) {
                        updatedImages.push({
                            id: image.id,
                            position: position
                        });
                        position++;
                    }
                }

                const updateResponse = await this.wcApi.put(apiPath, {
                    images: updatedImages
                });

                if (!updateResponse || !updateResponse.data) {
                    throw new Error('Error al actualizar el producto en WooCommerce');
                }
            }

            console.log('Foto eliminada exitosamente de WooCommerce');
            return true;
        } catch (error) {
            console.error('Error al eliminar foto de WooCommerce:', {
                error: error.message,
                response: error.response?.data,
                status: error.response?.status,
                apiPath,
                imageId
            });
            throw new Error(`Error deleting photo from WooCommerce: ${error.message}`);
        }
    }

    /**
     * Establece una foto como principal
     * @param {string} apiPath - Path de la API
     * @param {string} imageId - ID de la imagen
     */
    async setMainPhoto(apiPath, imageId) {
        try {
            console.log('Intentando establecer foto principal en WooCommerce:', { apiPath, imageId });

            const isVariation = apiPath.includes('/variations/');

            if (isVariation) {
                // Variaciones solo tienen 1 imagen, no aplica reordenar
                console.log('Variación: solo tiene 1 imagen, no requiere reordenar');
                return;
            }

            // Productos: reordenar imágenes
            const productResponse = await this.wcApi.get(apiPath);
            if (!productResponse || !productResponse.data) {
                throw new Error('No se pudo obtener el producto de WooCommerce');
            }

            const currentImages = productResponse.data.images || [];

            const mainImage = currentImages.find(img => img.id.toString() === imageId.toString());
            if (!mainImage) {
                throw new Error(`No se encontró la imagen con ID ${imageId} en el producto`);
            }

            const updatedImages = [
                { id: mainImage.id, position: 0 },
                ...currentImages
                    .filter(img => img.id.toString() !== imageId.toString())
                    .map((img, index) => ({
                        id: img.id,
                        position: index + 1
                    }))
            ];

            const updateResponse = await this.wcApi.put(apiPath, {
                images: updatedImages
            });

            if (!updateResponse || !updateResponse.data) {
                throw new Error('Error al actualizar el producto en WooCommerce');
            }

            console.log('Foto principal actualizada exitosamente en WooCommerce');
            return updateResponse.data;
        } catch (error) {
            console.error('Error al establecer foto principal en WooCommerce:', {
                error: error.message,
                apiPath,
                imageId,
                response: error.response?.data
            });
            throw new Error(`Error setting main photo in WooCommerce: ${error.message}`);
        }
    }

    /**
     * Reordena fotos en WooCommerce
     * @param {string} apiPath - Path de la API
     * @param {Array} imageOrder - Array de IDs de imágenes en el orden deseado
     */
    async reorderPhotos(apiPath, imageOrder) {
        try {
            console.log('Intentando reordenar fotos en WooCommerce:', {
                apiPath,
                imageOrder
            });

            const isVariation = apiPath.includes('/variations/');
            if (isVariation) {
                console.log('Variación: solo tiene 1 imagen, no requiere reordenar');
                return true;
            }

            const productResponse = await this.wcApi.get(apiPath);
            if (!productResponse || !productResponse.data) {
                throw new Error(`No encontrado en WooCommerce (path: ${apiPath})`);
            }

            const imageMap = new Map(productResponse.data.images.map(img => [img.id, img]));

            const updatedImages = imageOrder.map((imageId, index) => {
                const image = imageMap.get(imageId);
                if (!image) {
                    throw new Error(`Imagen no encontrada: ${imageId}`);
                }
                return {
                    ...image,
                    position: index
                };
            });

            await this.wcApi.put(apiPath, {
                images: updatedImages
            });

            console.log('Fotos reordenadas exitosamente en WooCommerce');
            return true;
        } catch (error) {
            console.error('Error al reordenar fotos en WooCommerce:', {
                error: error.message,
                response: error.response?.data,
                status: error.response?.status,
                apiPath,
                imageOrder
            });
            throw new Error(`Error reordering photos in WooCommerce: ${error.message}`);
        }
    }
}

export default WooCommercePhotoService; 