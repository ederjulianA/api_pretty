const { poolPromise, sql } = require("../db.js");
const { v4: uuidv4 } = require('uuid');

class ProductPhoto {
    constructor(data = {}) {
        this.id = data.id;
        this.art_sec = data.art_sec;
        this.nombre = data.nombre;
        this.url = data.url;
        this.tipo = data.tipo;
        this.tamanio = data.tamanio;
        this.fecha_creacion = data.fecha_creacion;
        this.woo_photo_id = data.woo_photo_id ? data.woo_photo_id.toString() : null;
        this.es_principal = data.es_principal || false;
        this.posicion = data.posicion;
        this.estado = data.estado || 'temp';
    }

    static async findById(id) {
        try {
            const pool = await poolPromise;
            const result = await pool.request()
                .input('id', sql.VarChar(36), id)
                .query('SELECT * FROM producto_fotos WHERE id = @id');
            
            return result.recordset[0] ? new ProductPhoto(result.recordset[0]) : null;
        } catch (error) {
            throw new Error(`Error finding photo by ID: ${error.message}`);
        }
    }

    static async findByProductId(art_sec) {
        try {
            const pool = await poolPromise;
            const result = await pool.request()
                .input('art_sec', sql.VarChar(36), art_sec)
                .query('SELECT * FROM producto_fotos WHERE art_sec = @art_sec ORDER BY posicion ASC');
            
            return result.recordset.map(photo => new ProductPhoto(photo));
        } catch (error) {
            throw new Error(`Error finding photos by product ID: ${error.message}`);
        }
    }

    async save() {
        try {
            const pool = await poolPromise;
            const result = await pool.request()
                .input('id', sql.VarChar(36), this.id)
                .input('art_sec', sql.VarChar(36), this.art_sec)
                .input('nombre', sql.VarChar(255), this.nombre)
                .input('url', sql.VarChar(255), this.url)
                .input('tipo', sql.VarChar(50), this.tipo)
                .input('tamanio', sql.Int, this.tamanio)
                .input('fecha_creacion', sql.DateTime, this.fecha_creacion)
                .input('woo_photo_id', sql.VarChar(36), this.woo_photo_id)
                .input('es_principal', sql.Bit, this.es_principal)
                .input('posicion', sql.Int, this.posicion)
                .input('estado', sql.VarChar(20), this.estado)
                .query(`
                    INSERT INTO producto_fotos (
                        id, art_sec, nombre, url, tipo, tamanio, 
                        fecha_creacion, woo_photo_id, es_principal, 
                        posicion, estado
                    ) VALUES (
                        @id, @art_sec, @nombre, @url, @tipo, @tamanio,
                        @fecha_creacion, @woo_photo_id, @es_principal,
                        @posicion, @estado
                    )
                `);
            
            return this;
        } catch (error) {
            throw new Error(`Error saving photo: ${error.message}`);
        }
    }

    async update() {
        try {
            // Validar woo_photo_id antes de la actualización
            if (this.woo_photo_id !== null && this.woo_photo_id !== undefined) {
                this.woo_photo_id = String(this.woo_photo_id).trim();
                if (!this.woo_photo_id) {
                    this.woo_photo_id = null;
                }
            }

            const pool = await poolPromise;
            await pool.request()
                .input('id', sql.VarChar(36), this.id)
                .input('nombre', sql.VarChar(255), this.nombre)
                .input('url', sql.VarChar(255), this.url)
                .input('tipo', sql.VarChar(50), this.tipo)
                .input('tamanio', sql.Int, this.tamanio)
                .input('woo_photo_id', sql.VarChar(36), this.woo_photo_id)
                .input('es_principal', sql.Bit, this.es_principal)
                .input('posicion', sql.Int, this.posicion)
                .input('estado', sql.VarChar(20), this.estado)
                .query(`
                    UPDATE producto_fotos 
                    SET nombre = @nombre,
                        url = @url,
                        tipo = @tipo,
                        tamanio = @tamanio,
                        woo_photo_id = @woo_photo_id,
                        es_principal = @es_principal,
                        posicion = @posicion,
                        estado = @estado
                    WHERE id = @id
                `);
            
            return this;
        } catch (error) {
            console.error('Error en update de ProductPhoto:', {
                error: error.message,
                woo_photo_id: this.woo_photo_id,
                woo_photo_id_type: typeof this.woo_photo_id
            });
            throw new Error(`Error updating photo: ${error.message}`);
        }
    }

    async delete() {
        try {
            const pool = await poolPromise;
            await pool.request()
                .input('id', sql.VarChar(36), this.id)
                .query('DELETE FROM producto_fotos WHERE id = @id');
            
            return true;
        } catch (error) {
            throw new Error(`Error deleting photo: ${error.message}`);
        }
    }

    static async setMainPhoto(art_sec, photoId) {
        try {
            const pool = await poolPromise;
            const transaction = new sql.Transaction(pool);
            
            try {
                await transaction.begin();
                
                // Primero, establecer todas las fotos como no principales
                await transaction.request()
                    .input('art_sec', sql.VarChar(36), art_sec)
                    .query('UPDATE producto_fotos SET es_principal = 0 WHERE art_sec = @art_sec');
                
                // Luego, establecer la foto seleccionada como principal
                await transaction.request()
                    .input('id', sql.VarChar(36), photoId)
                    .input('art_sec', sql.VarChar(36), art_sec)
                    .query('UPDATE producto_fotos SET es_principal = 1 WHERE id = @id AND art_sec = @art_sec');
                
                await transaction.commit();
                return true;
            } catch (error) {
                await transaction.rollback();
                throw error;
            }
        } catch (error) {
            console.error('Error en setMainPhoto:', error);
            throw new Error(`Error setting main photo: ${error.message}`);
        }
    }

    static async reorderPhotos(art_sec, photoOrder) {
        try {
            const pool = await poolPromise;
            const transaction = await pool.transaction();
            
            try {
                for (const [index, photoId] of photoOrder.entries()) {
                    await transaction.request()
                        .input('id', sql.VarChar(36), photoId)
                        .input('posicion', sql.Int, index)
                        .query(`
                            UPDATE producto_fotos 
                            SET posicion = @posicion
                            WHERE id = @id AND art_sec = @art_sec
                        `);
                }
                
                await transaction.commit();
                return true;
            } catch (error) {
                await transaction.rollback();
                throw error;
            }
        } catch (error) {
            throw new Error(`Error reordering photos: ${error.message}`);
        }
    }
}

module.exports = ProductPhoto;  