import { v4 as uuidv4 } from 'uuid';
import ProductPhoto from '../models/ProductPhoto.js';
import WooCommercePhotoService from '../services/WooCommercePhotoService.js';
import cloudinary from '../config/cloudinary.js';
import { getArticleWooId } from '../jobs/updateWooOrderStatusAndStock.js';

class ProductPhotoController {
    constructor() {
        this.wooService = new WooCommercePhotoService();
    }

    async getProductPhotos(req, res) {
        try {
            const { productId } = req.params;
            const photos = await ProductPhoto.findByProductId(productId);
            
            res.json({
                success: true,
                data: photos
            });
        } catch (error) {
            console.error('Error getting product photos:', error);
            res.status(500).json({
                success: false,
                message: 'Error getting product photos',
                error: error.message
            });
        }
    }

    async uploadTempPhoto(req, res) {
        try {
            const { productId } = req.params;
            const file = req.files?.photo;

            if (!file) {
                return res.status(400).json({
                    success: false,
                    message: 'No photo file provided'
                });
            }

            // Validate file type
            const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
            if (!allowedTypes.includes(file.mimetype)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid file type. Only JPEG, PNG, GIF and WebP are allowed'
                });
            }

            // Validate file size (max 5MB)
            const maxSize = 5 * 1024 * 1024;
            if (file.size > maxSize) {
                return res.status(400).json({
                    success: false,
                    message: 'File size too large. Maximum size is 5MB'
                });
            }

            // Convert file to base64 for Cloudinary
            const base64Image = `data:${file.mimetype};base64,${file.data.toString('base64')}`;

            // Upload to Cloudinary
            const uploadResult = await cloudinary.uploader.upload(base64Image, {
                folder: `products/${productId}/temp`,
                public_id: `${uuidv4()}`
            });

            // Create photo record
            const photo = new ProductPhoto({
                id: uuidv4(),
                art_sec: productId,
                nombre: file.name,
                url: uploadResult.secure_url,
                tipo: file.mimetype,
                tamanio: file.size,
                fecha_creacion: new Date(),
                estado: 'temp',
                cloudinary_id: uploadResult.public_id
            });

            await photo.save();

            res.json({
                success: true,
                data: photo
            });
        } catch (error) {
            console.error('Error uploading temporary photo:', error);
            res.status(500).json({
                success: false,
                message: 'Error uploading photo',
                error: error.message
            });
        }
    }

    deletePhoto = async (req, res) => {
        try {
            const { productId, photoId } = req.params;
            console.log('Intentando eliminar foto:', { productId, photoId });

            const photo = await ProductPhoto.findById(photoId);
            if (!photo) {
                return res.status(404).json({
                    success: false,
                    message: 'Photo not found'
                });
            }

            // If photo is synced with WooCommerce, delete it there too
            if (photo.woo_photo_id) {
                console.log('Foto sincronizada con WooCommerce, procediendo a eliminar...');
                const artWooId = await getArticleWooId(productId);
                if (artWooId) {
                    console.log('ID de WooCommerce encontrado:', artWooId);
                    // Asegurarnos de que wooService esté disponible
                    if (!this.wooService) {
                        console.log('Inicializando WooCommerce service');
                        this.wooService = new WooCommercePhotoService();
                    }
                    await this.wooService.deletePhoto(artWooId, photo.woo_photo_id);
                } else {
                    console.log('No se encontró ID de WooCommerce para el producto');
                }
            }

            // Delete from Cloudinary if we have the cloudinary_id
            if (photo.cloudinary_id) {
                console.log('Eliminando foto de Cloudinary...');
                await cloudinary.uploader.destroy(photo.cloudinary_id);
            }

            // Delete from database
            console.log('Eliminando foto de la base de datos...');
            await photo.delete();

            res.json({
                success: true,
                message: 'Photo deleted successfully'
            });
        } catch (error) {
            console.error('Error deleting photo:', error);
            res.status(500).json({
                success: false,
                message: 'Error deleting photo',
                error: error.message
            });
        }
    }

    setMainPhoto = async (req, res) => {
        try {
            const { productId, photoId } = req.params;
            console.log('Intentando establecer foto principal:', { productId, photoId });

            // Verificar si el servicio de WooCommerce está inicializado
            if (!this.wooService) {
                console.log('Inicializando WooCommerce service');
                this.wooService = new WooCommercePhotoService();
            }

            // Obtener el ID de WooCommerce del producto
            const artWooId = await getArticleWooId(productId);
            console.log('ID de WooCommerce encontrado:', artWooId);

            if (artWooId) {
                // Obtener la foto que se establecerá como principal
                const photo = await ProductPhoto.findById(photoId);
                if (!photo) {
                    return res.status(404).json({ success: false, message: 'Foto no encontrada' });
                }

                // Verificar si la foto tiene woo_photo_id
                if (!photo.woo_photo_id) {
                    console.log('La foto no tiene woo_photo_id, necesita ser subida a WooCommerce primero');

                    // Si la foto no está en WooCommerce, primero subirla
                    try {
                        const uploadedPhoto = await this.wooService.uploadPhoto(artWooId, photo.url);

                        if (uploadedPhoto && uploadedPhoto.id) {
                            // Actualizar el woo_photo_id en la base de datos
                            photo.woo_photo_id = uploadedPhoto.id.toString();
                            await photo.update();
                            console.log('Foto subida a WooCommerce con ID:', uploadedPhoto.id);
                        } else {
                            throw new Error('No se pudo obtener el ID de la foto subida');
                        }
                    } catch (uploadError) {
                        console.error('Error al subir foto a WooCommerce:', uploadError);
                        return res.status(500).json({
                            success: false,
                            message: `Error al subir foto a WooCommerce: ${uploadError.message}`
                        });
                    }
                }

                // Ahora establecer como principal en WooCommerce
                await this.wooService.setMainPhoto(artWooId, photo.woo_photo_id);
                console.log('Foto principal actualizada en WooCommerce');

                // Actualizar en la base de datos
                await ProductPhoto.setMainPhoto(productId, photoId);
                console.log('Foto principal actualizada en la base de datos');

                return res.json({
                    success: true,
                    message: 'Foto principal actualizada exitosamente'
                });
            } else {
                console.log('No se encontró ID de WooCommerce para el producto');
                return res.status(404).json({
                    success: false, 
                    message: 'Producto no encontrado en WooCommerce' 
                });
            }
        } catch (error) {
            console.error('Error al establecer foto principal:', error);
            return res.status(500).json({ 
                success: false, 
                message: 'Error al establecer foto principal',
                error: error.message 
            });
        }
    }

    syncWithWooCommerce = async (req, res) => {
        try {
            const { productId } = req.params;
            console.log('Iniciando sincronización de fotos para producto:', productId);

            // Obtener fotos del producto
            const photos = await ProductPhoto.findByProductId(productId);
            console.log('Fotos encontradas:', photos.length);

            // Obtener ID de WooCommerce
            const artWooId = await getArticleWooId(productId);
            console.log('ID de WooCommerce:', artWooId);

            if (!artWooId) {
                return res.status(404).json({
                    success: false,
                    message: 'Product not found in WooCommerce'
                });
            }

            const results = {
                success: [],
                errors: []
            };

            // Asegurarnos de que wooService esté disponible
            if (!this.wooService) {
                console.log('Inicializando WooCommerce service');
                this.wooService = new WooCommercePhotoService();
            }

            for (const photo of photos) {
                try {
                    console.log('Procesando foto:', {
                        id: photo.id,
                        estado: photo.estado,
                        url: photo.url
                    });

                    if (photo.estado === 'temp') {
                        console.log('Subiendo foto a WooCommerce...');
                        const wooPhoto = await this.wooService.uploadPhoto(artWooId, photo.url);
                        console.log('Respuesta de WooCommerce:', wooPhoto);

                        if (!wooPhoto || !wooPhoto.id) {
                            throw new Error('No se recibió un ID válido de WooCommerce');
                        }

                        // Actualizar la foto en la base de datos
                        console.log('Actualizando foto en base de datos...');
                        console.log('WooCommerce Photo ID (antes de asignar):', {
                            original: wooPhoto.id,
                            type: typeof wooPhoto.id
                        });

                        // Asegurarnos de que el ID sea un string válido
                        const wooPhotoId = String(wooPhoto.id).trim();
                        console.log('WooCommerce Photo ID (después de convertir):', {
                            value: wooPhotoId,
                            type: typeof wooPhotoId,
                            length: wooPhotoId.length
                        });

                        if (!wooPhotoId) {
                            throw new Error('ID de WooCommerce inválido después de la conversión');
                        }

                        // Actualizar con la URL de WooCommerce
                        photo.woo_photo_id = wooPhotoId;
                        photo.url = wooPhoto.src; // Actualizar la URL con la de WooCommerce
                        photo.estado = 'woo';

                        console.log('Intentando actualizar foto con datos:', {
                            id: photo.id,
                            woo_photo_id: photo.woo_photo_id,
                            url: photo.url,
                            estado: photo.estado
                        });

                        await photo.update();

                        console.log('Foto actualizada exitosamente');
                        results.success.push(photo.id);
                    } else {
                        console.log('Foto ya sincronizada o en otro estado:', photo.estado);
                    }
                } catch (error) {
                    console.error(`Error procesando foto ${photo.id}:`, error);
                    console.error('Detalles del error:', {
                        message: error.message,
                        stack: error.stack,
                        response: error.response?.data
                    });

                    // Intentar actualizar el estado de la foto a error
                    try {
                        photo.estado = 'error';
                        await photo.update();
                    } catch (updateError) {
                        console.error('Error al actualizar estado de la foto:', updateError);
                    }

                    results.errors.push({
                        photoId: photo.id,
                        error: error.message,
                        details: error.response?.data || error.stack
                    });
                }
            }

            console.log('Resultado final de la sincronización:', results);

            res.json({
                success: true,
                data: results
            });
        } catch (error) {
            console.error('Error general en sincronización:', error);
            res.status(500).json({
                success: false,
                message: 'Error syncing photos with WooCommerce',
                error: error.message,
                details: error.response?.data || error.stack
            });
        }
    }

    async reorderPhotos(req, res) {
        try {
            const { productId } = req.params;
            const { photoOrder } = req.body;

            if (!Array.isArray(photoOrder)) {
                return res.status(400).json({
                    success: false,
                    message: 'photoOrder must be an array'
                });
            }

            // Update in database
            await ProductPhoto.reorderPhotos(productId, photoOrder);

            // If photos are synced with WooCommerce, update there too
            const artWooId = await getArticleWooId(productId);
            if (artWooId) {
                // Asegurarnos de que wooService esté disponible
                if (!this.wooService) {
                    this.wooService = new WooCommercePhotoService();
                }
                await this.wooService.reorderPhotos(artWooId, photoOrder);
            }

            res.json({
                success: true,
                message: 'Photos reordered successfully'
            });
        } catch (error) {
            console.error('Error reordering photos:', error);
            res.status(500).json({
                success: false,
                message: 'Error reordering photos',
                error: error.message
            });
        }
    }
}

export default new ProductPhotoController(); 