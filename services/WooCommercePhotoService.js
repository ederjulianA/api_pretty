import wcPkg from "@woocommerce/woocommerce-rest-api";
const WooCommerceRestApi = wcPkg.default || wcPkg;

class WooCommercePhotoService {
    constructor() {
        this.wcApi = new WooCommerceRestApi({
            url: process.env.WC_URL,
            consumerKey: process.env.WC_CONSUMER_KEY,
            consumerSecret: process.env.WC_CONSUMER_SECRET,
            version: "wc/v3",
            timeout: 8000
        });
    }

    async uploadPhoto(productId, imageUrl) {
        try {
            console.log('Intentando subir foto a WooCommerce:', {
                productId,
                imageUrl
            });

            // Verificar que el producto existe
            const productResponse = await this.wcApi.get(`products/${productId}`);
            if (!productResponse || !productResponse.data) {
                throw new Error(`Producto no encontrado en WooCommerce (ID: ${productId})`);
            }

            console.log('Producto encontrado en WooCommerce:', productResponse.data.id);

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

            // Obtener las imágenes actuales del producto
            const currentImages = productResponse.data.images || [];
            
            // Agregar la nueva imagen al final
            const updatedImages = [
                ...currentImages,
                {
                    src: imageUrl,
                    position: currentImages.length
                }
            ];

            // Actualizar el producto con la nueva lista de imágenes
            const response = await this.wcApi.put(`products/${productId}`, {
                images: updatedImages
            });

            if (!response || !response.data) {
                throw new Error('Respuesta inválida de WooCommerce');
            }

            // Obtener el ID de la nueva imagen (la última en la lista)
            const newImage = response.data.images[response.data.images.length - 1];
            console.log('Foto subida exitosamente a WooCommerce:', newImage);

            return newImage;
        } catch (error) {
            console.error('Error detallado al subir foto a WooCommerce:', {
                error: error.message,
                response: error.response?.data,
                status: error.response?.status,
                productId,
                imageUrl
            });
            throw new Error(`Error uploading photo to WooCommerce: ${error.message}`);
        }
    }

    async deletePhoto(productId, imageId) {
        try {
            console.log('Intentando eliminar foto de WooCommerce:', {
                productId,
                imageId
            });

            // Obtener el producto actual con sus imágenes
            const productResponse = await this.wcApi.get(`products/${productId}`);
            if (!productResponse || !productResponse.data) {
                throw new Error(`Producto no encontrado en WooCommerce (ID: ${productId})`);
            }

            const currentImages = productResponse.data.images || [];
            console.log('Imágenes actuales del producto:', currentImages);

            // Filtrar las imágenes para excluir la que queremos eliminar
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

            console.log('Imágenes actualizadas (sin la eliminada):', updatedImages);

            // Actualizar el producto con la lista de imágenes actualizada
            const updateResponse = await this.wcApi.put(`products/${productId}`, {
                images: updatedImages
            });

            if (!updateResponse || !updateResponse.data) {
                throw new Error('Error al actualizar el producto en WooCommerce');
            }

            console.log('Foto eliminada exitosamente de WooCommerce');
            return true;
        } catch (error) {
            console.error('Error al eliminar foto de WooCommerce:', {
                error: error.message,
                response: error.response?.data,
                status: error.response?.status,
                productId,
                imageId
            });
            throw new Error(`Error deleting photo from WooCommerce: ${error.message}`);
        }
    }

    async setMainPhoto(productId, imageId) {
        try {
            console.log('Intentando establecer foto principal en WooCommerce:', { productId, imageId });

            // Primero obtener el producto actual
            const productResponse = await this.wcApi.get(`products/${productId}`);
            if (!productResponse || !productResponse.data) {
                throw new Error('No se pudo obtener el producto de WooCommerce');
            }

            // Obtener las imágenes actuales
            const currentImages = productResponse.data.images || [];
            console.log('Imágenes actuales del producto:', currentImages);

            // Encontrar la imagen que queremos establecer como principal
            const mainImage = currentImages.find(img => img.id.toString() === imageId.toString());
            if (!mainImage) {
                throw new Error(`No se encontró la imagen con ID ${imageId} en el producto`);
            }

            // Crear nuevo array de imágenes con la imagen principal primero
            const updatedImages = [
                { id: mainImage.id, position: 0 },
                ...currentImages
                    .filter(img => img.id.toString() !== imageId.toString())
                    .map((img, index) => ({
                        id: img.id,
                        position: index + 1
                    }))
            ];

            console.log('Imágenes actualizadas:', updatedImages);

            // Actualizar el producto con el nuevo orden de imágenes
            const updateResponse = await this.wcApi.put(`products/${productId}`, {
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
                productId,
                imageId,
                response: error.response?.data
            });
            throw new Error(`Error setting main photo in WooCommerce: ${error.message}`);
        }
    }

    async reorderPhotos(productId, imageOrder) {
        try {
            console.log('Intentando reordenar fotos en WooCommerce:', {
                productId,
                imageOrder
            });

            // Obtener el producto actual
            const productResponse = await this.wcApi.get(`products/${productId}`);
            if (!productResponse || !productResponse.data) {
                throw new Error(`Producto no encontrado en WooCommerce (ID: ${productId})`);
            }

            // Crear un mapa de las imágenes actuales
            const imageMap = new Map(productResponse.data.images.map(img => [img.id, img]));

            // Reordenar las imágenes según el orden proporcionado
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

            // Actualizar el producto con el nuevo orden de imágenes
            await this.wcApi.put(`products/${productId}`, {
                images: updatedImages
            });

            console.log('Fotos reordenadas exitosamente en WooCommerce');
            return true;
        } catch (error) {
            console.error('Error al reordenar fotos en WooCommerce:', {
                error: error.message,
                response: error.response?.data,
                status: error.response?.status,
                productId,
                imageOrder
            });
            throw new Error(`Error reordering photos in WooCommerce: ${error.message}`);
        }
    }
}

export default WooCommercePhotoService; 