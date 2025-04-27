const sql = require('mssql');
const { poolPromise } = require('../db');

class InventarioConteo {
    static async crearConteo(datos) {
        try {
            const pool = await poolPromise;
            const result = await pool.request()
                .input('fecha', sql.DateTime, datos.fecha || new Date())
                .input('usuario', sql.VarChar, datos.usuario)
                .input('bodega', sql.VarChar, datos.bodega)
                .input('estado', sql.VarChar, datos.estado || 'PENDIENTE')
                .query(`
                    INSERT INTO inventario_conteo (fecha, usuario, bodega, estado)
                    OUTPUT INSERTED.id
                    VALUES (@fecha, @usuario, @bodega, @estado)
                `);
            return result.recordset[0];
        } catch (error) {
            throw error;
        }
    }

    static async validarArticulo(articulo_codigo) {
        try {
            const pool = await poolPromise;
            const result = await pool.request()
                .input('articulo_codigo', sql.VarChar, articulo_codigo)
                .query(`
                    SELECT art_sec, art_cod
                    FROM articulos 
                    WHERE art_cod = @articulo_codigo
                `);

            if (result.recordset.length === 0) {
                throw new Error(`El código de artículo ${articulo_codigo} no existe en el sistema`);
            }

            return result.recordset[0];
        } catch (error) {
            throw error;
        }
    }

    static async agregarDetalleConteo(datos) {
        try {
            const pool = await poolPromise;

            // Validar que el artículo existe y obtener art_sec
            const articulo = await this.validarArticulo(datos.articulo_codigo);

            // Verificar si ya existe el artículo en el detalle del conteo
            const existe = await pool.request()
                .input('conteo_id', sql.Int, datos.conteo_id)
                .input('articulo_artsec', sql.VarChar, articulo.art_sec)
                .query(`
                    SELECT 1 FROM inventario_conteo_detalle
                    WHERE conteo_id = @conteo_id AND articulo_artsec = @articulo_artsec
                `);
            if (existe.recordset.length > 0) {
                throw new Error(`El artículo ya ha sido agregado a este conteo.`);
            }

            // Obtener cantidad del sistema
            const cantidad_sistema = await this.obtenerCantidadSistema(articulo.art_sec);

            // Calcular diferencia
            const diferencia = datos.cantidad_fisica - cantidad_sistema;

            const result = await pool.request()
                .input('conteo_id', sql.Int, datos.conteo_id)
                .input('articulo_codigo', sql.VarChar, datos.articulo_codigo)
                .input('articulo_artsec', sql.VarChar, articulo.art_sec)
                .input('cantidad_sistema', sql.Decimal, cantidad_sistema)
                .input('cantidad_fisica', sql.Decimal, datos.cantidad_fisica)
                .input('diferencia', sql.Decimal, diferencia)
                .query(`
                    INSERT INTO inventario_conteo_detalle 
                    (conteo_id, articulo_codigo, articulo_artsec, cantidad_sistema, cantidad_fisica, diferencia)
                    VALUES (@conteo_id, @articulo_codigo, @articulo_artsec, @cantidad_sistema, @cantidad_fisica, @diferencia)
                `);
            return result.rowsAffected[0];
        } catch (error) {
            throw error;
        }
    }

    static async obtenerConteo(id) {
        try {
            const pool = await poolPromise;
            const result = await pool.request()
                .input('id', sql.Int, id)
                .query(`
                    SELECT 
                        c.*,
                        d.*,
                        a.art_cod,
                        a.art_nom,
                        d.articulo_codigo as codigo_ingresado,
                        d.articulo_artsec as art_sec
                    FROM inventario_conteo c
                    LEFT JOIN inventario_conteo_detalle d ON c.id = d.conteo_id
                    LEFT JOIN articulos a ON d.articulo_artsec = a.art_sec
                    WHERE c.id = @id
                    ORDER BY d.fecha_creacion DESC
                `);
            return result.recordset;
        } catch (error) {
            throw error;
        }
    }

    static async actualizarEstadoConteo(id, estado, fecha) {
        try {
            const pool = await poolPromise;

            // Primero verificar si el conteo existe
            const conteoExistente = await pool.request()
                .input('id', sql.Int, id)
                .query('SELECT 1 FROM inventario_conteo WHERE id = @id');

            if (conteoExistente.recordset.length === 0) {
                throw new Error('Conteo no encontrado');
            }

            // Si existe, proceder con la actualización
            const result = await pool.request()
                .input('id', sql.Int, id)
                .input('estado', sql.VarChar, estado)
                .input('fecha', sql.DateTime, fecha || new Date())
                .query(`
                    UPDATE inventario_conteo
                    SET estado = @estado,
                        fecha = @fecha
                    WHERE id = @id
                `);
            return result.rowsAffected[0];
        } catch (error) {
            throw error;
        }
    }

    static async listarConteos(filtros = {}) {
        try {
            const pool = await poolPromise;
            let query = `
                SELECT c.*, 
                       COUNT(d.id) as total_articulos,
                       SUM(d.diferencia) as diferencia_total
                FROM inventario_conteo c
                LEFT JOIN inventario_conteo_detalle d ON c.id = d.conteo_id
            `;

            const request = pool.request();

            if (filtros.bodega) {
                query += ' WHERE c.bodega = @bodega';
                request.input('bodega', sql.VarChar, filtros.bodega);
            }

            if (filtros.estado) {
                query += filtros.bodega ? ' AND' : ' WHERE';
                query += ' c.estado = @estado';
                request.input('estado', sql.VarChar, filtros.estado);
            }

            query += ' GROUP BY c.id, c.fecha, c.usuario, c.bodega, c.estado';

            const result = await request.query(query);
            return result.recordset;
        } catch (error) {
            throw error;
        }
    }

    static async obtenerCantidadSistema(art_sec) {
        try {
            const pool = await poolPromise;
            const result = await pool.request()
                .input('art_sec', sql.VarChar, art_sec)
                .query(`
                    SELECT TOP 1 ISNULL(existencia, 0) as cantidad
                    FROM vwExistencias
                    WHERE art_sec = @art_sec
                `);

            // Si no hay resultados, retornar 0
            if (!result.recordset || result.recordset.length === 0) {
                return 0;
            }

            return result.recordset[0].cantidad;
        } catch (error) {
            console.error('Error al obtener cantidad del sistema:', error);
            return 0; // En caso de error, retornar 0
        }
    }

    static async eliminarDetalleConteo(conteo_id, articulo_codigo) {
        try {
            const pool = await poolPromise;

            // Primero validamos que el artículo existe y obtenemos su art_sec
            const articulo = await this.validarArticulo(articulo_codigo);

            // Eliminamos el detalle
            const result = await pool.request()
                .input('conteo_id', sql.Int, conteo_id)
                .input('articulo_artsec', sql.VarChar, articulo.art_sec)
                .query(`
                    DELETE FROM inventario_conteo_detalle
                    WHERE conteo_id = @conteo_id 
                    AND articulo_artsec = @articulo_artsec
                `);

            if (result.rowsAffected[0] === 0) {
                throw new Error('No se encontró el detalle a eliminar');
            }

            return result.rowsAffected[0];
        } catch (error) {
            throw error;
        }
    }

    static async actualizarCantidadDetalle(conteo_id, articulo_codigo, cantidad_fisica) {
        try {
            const pool = await poolPromise;

            // Primero validamos que el artículo existe y obtenemos su art_sec
            const articulo = await this.validarArticulo(articulo_codigo);

            // Verificar si existe el detalle
            const detalleExistente = await pool.request()
                .input('conteo_id', sql.Int, conteo_id)
                .input('articulo_artsec', sql.VarChar, articulo.art_sec)
                .query(`
                    SELECT cantidad_sistema 
                    FROM inventario_conteo_detalle 
                    WHERE conteo_id = @conteo_id 
                    AND articulo_artsec = @articulo_artsec
                `);

            if (detalleExistente.recordset.length === 0) {
                throw new Error('No se encontró el detalle a actualizar');
            }

            // Obtener cantidad actual del sistema
            const cantidad_sistema = await this.obtenerCantidadSistema(articulo.art_sec);

            // Calcular nueva diferencia
            const diferencia = cantidad_fisica - cantidad_sistema;

            // Actualizar el detalle
            const result = await pool.request()
                .input('conteo_id', sql.Int, conteo_id)
                .input('articulo_artsec', sql.VarChar, articulo.art_sec)
                .input('cantidad_sistema', sql.Decimal, cantidad_sistema)
                .input('cantidad_fisica', sql.Decimal, cantidad_fisica)
                .input('diferencia', sql.Decimal, diferencia)
                .query(`
                    UPDATE inventario_conteo_detalle
                    SET cantidad_sistema = @cantidad_sistema,
                        cantidad_fisica = @cantidad_fisica,
                        diferencia = @diferencia
                    WHERE conteo_id = @conteo_id 
                    AND articulo_artsec = @articulo_artsec
                `);

            return result.rowsAffected[0];
        } catch (error) {
            throw error;
        }
    }

    static async buscarDetalleConteo(conteo_id, filtros = {}) {
        try {
            const pool = await poolPromise;
            const pageNumber = parseInt(filtros.pageNumber) || 1;
            const pageSize = parseInt(filtros.pageSize) || 10;
            const offset = (pageNumber - 1) * pageSize;

            let query = `
                WITH Resultados AS (
                    SELECT 
                        d.articulo_codigo as art_cod,
                        a.art_nom,
                        d.cantidad_sistema,
                        d.cantidad_fisica,
                        d.diferencia,
                        CASE 
                            WHEN @nombre IS NOT NULL AND a.art_nom LIKE @nombre + '%' THEN 1
                            WHEN @nombre IS NOT NULL AND a.art_nom LIKE '%' + @nombre + '%' THEN 2
                            ELSE 3
                        END as relevancia
                    FROM inventario_conteo_detalle d
                    INNER JOIN articulos a ON d.articulo_artsec = a.art_sec
                    WHERE d.conteo_id = @conteo_id
                    ${filtros.nombre ? 'AND a.art_nom LIKE @nombre + \'%\' OR a.art_nom LIKE \'%\' + @nombre + \'%\'' : ''}
                    ${filtros.codigo ? 'AND d.articulo_codigo LIKE @codigo + \'%\'' : ''}
                )
                SELECT 
                    art_cod,
                    art_nom,
                    cantidad_sistema,
                    cantidad_fisica,
                    diferencia,
                    (SELECT COUNT(*) FROM Resultados) as total
                FROM Resultados
                ORDER BY relevancia, art_nom
                OFFSET @offset ROWS
                FETCH NEXT @pageSize ROWS ONLY
            `;

            const request = pool.request()
                .input('conteo_id', sql.Int, conteo_id)
                .input('offset', sql.Int, offset)
                .input('pageSize', sql.Int, pageSize);

            if (filtros.nombre) {
                request.input('nombre', sql.VarChar, filtros.nombre);
            }
            if (filtros.codigo) {
                request.input('codigo', sql.VarChar, filtros.codigo);
            }

            const result = await request.query(query);

            if (result.recordset.length === 0) {
                return {
                    data: [],
                    total: 0,
                    pageNumber,
                    pageSize
                };
            }

            const total = result.recordset[0].total;
            delete result.recordset[0].total;

            return {
                data: result.recordset,
                total,
                pageNumber,
                pageSize
            };
        } catch (error) {
            throw error;
        }
    }

    static async verificarArticuloEnDetalle(conteo_id, articulo_codigo) {
        try {
            const pool = await poolPromise;

            // Primero validamos que el artículo existe y obtenemos su art_sec
            const articulo = await this.validarArticulo(articulo_codigo);

            // Verificar si existe en el detalle
            const result = await pool.request()
                .input('conteo_id', sql.Int, conteo_id)
                .input('articulo_artsec', sql.VarChar, articulo.art_sec)
                .query(`
                    SELECT 1 
                    FROM inventario_conteo_detalle 
                    WHERE conteo_id = @conteo_id 
                    AND articulo_artsec = @articulo_artsec
                `);

            return result.recordset.length > 0;
        } catch (error) {
            throw error;
        }
    }
}

module.exports = InventarioConteo; 