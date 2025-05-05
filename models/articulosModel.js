// models/articulosModel.js
const { sql, poolPromise } = require('../db');
const WooCommerceRestApi = require("@woocommerce/woocommerce-rest-api").default;
const cloudinary = require('../config/cloudinary');

// Configura la API de WooCommerce (asegúrate de tener estas variables en tu .env)
const wcApi = new WooCommerceRestApi({
  url: process.env.WC_URL,
  consumerKey: process.env.WC_CONSUMER_KEY,
  consumerSecret: process.env.WC_CONSUMER_SECRET,
  version: "wc/v3"
});

const validateArticulo = async ({ art_cod, art_woo_id }) => {
  try {
    const pool = await poolPromise;
    const request = pool.request();

    // Si no se proporciona ninguno, se lanza un error.
    if (!art_cod && !art_woo_id) {
      throw new Error("Se debe proporcionar al menos art_cod o art_woo_id.");
    }

    // Configuramos los parámetros. Si alguno no se proporciona, lo dejamos en null.
    request.input('art_cod', sql.VarChar(50), art_cod || null);
    request.input('art_woo_id', sql.VarChar(50), art_woo_id || null);

    // Consulta: se busca cualquier registro donde se cumpla:
    // (@art_cod IS NOT NULL AND art_cod = @art_cod) OR (@art_woo_id IS NOT NULL AND art_woo_id = @art_woo_id)
    const query = `
      SELECT COUNT(*) AS count 
      FROM dbo.articulos 
      WHERE 
        ((@art_cod IS NOT NULL AND art_cod = @art_cod)
         OR (@art_woo_id IS NOT NULL AND art_woo_id = @art_woo_id))
    `;
    const result = await request.query(query);
    const count = result.recordset[0].count;
    return count > 0;
  } catch (error) {
    throw error;
  }
};
const updateWooCommerceProduct = async (art_woo_id, art_nom, art_cod, precio_detal, precio_mayor, actualiza_fecha = 'N', fac_fec = null) => {
  try {
    const api = new WooCommerceRestApi({
      url: process.env.WC_URL,
      consumerKey: process.env.WC_CONSUMER_KEY,
      consumerSecret: process.env.WC_CONSUMER_SECRET,
      version: "wc/v3"
    });

    // Validar actualiza_fecha
    if (actualiza_fecha !== 'S' && actualiza_fecha !== 'N') {
      throw new Error('actualiza_fecha debe ser "S" o "N"');
    }

    const data = {
      name: art_nom,
      sku: art_cod,
      regular_price: precio_detal.toString(),
      meta_data: [
        { key: '_precio_mayorista', value: precio_mayor }
      ]
    };

    // Solo incluir la fecha si actualiza_fecha es 'S' y hay una fecha válida
    if (actualiza_fecha === 'S' && fac_fec) {
      const dateObj = new Date(fac_fec);
      if (!isNaN(dateObj.getTime())) {
        data.date_created = dateObj.toISOString().slice(0, 19).replace('Z', '');
      }
    }

    console.log('Actualizando producto en WooCommerce:', {
      art_woo_id,
      art_cod,
      data: JSON.stringify(data, null, 2)
    });

    const response = await api.put(`products/${art_woo_id}`, data);
    
    console.log('Respuesta de WooCommerce:', {
      status: response.status,
      statusText: response.statusText,
      data: JSON.stringify(response.data, null, 2)
    });

    // Guardar el log en la base de datos
    const pool = await poolPromise;
    await pool.request()
      .input('fac_nro_woo', sql.VarChar(50), null)
      .input('fac_nro', sql.VarChar(50), null)
      .input('total_items', sql.Int, 1)
      .input('success_count', sql.Int, 1)
      .input('error_count', sql.Int, 0)
      .input('skipped_count', sql.Int, 0)
      .input('duration', sql.Float, 0)
      .input('batches_processed', sql.Int, 1)
      .input('messages', sql.NVarChar(sql.MAX), JSON.stringify([
        `Producto ${art_cod} actualizado exitosamente en WooCommerce`,
        {
          status: response.status,
          statusText: response.statusText,
          data: response.data
        }
      ]))
      .input('status', sql.VarChar(20), 'SUCCESS')
      .input('error_details', sql.NVarChar(sql.MAX), null)
      .query(`
        INSERT INTO dbo.woo_sync_logs (
          fac_nro_woo, fac_nro, total_items, success_count, error_count, 
          skipped_count, duration, batches_processed, messages, status, error_details
        ) VALUES (
          @fac_nro_woo, @fac_nro, @total_items, @success_count, @error_count,
          @skipped_count, @duration, @batches_processed, @messages, @status, @error_details
        );
      `);

    return {
      success: true,
      status: response.status,
      data: response.data
    };
  } catch (error) {
    // Preparar información detallada del error
    const errorInfo = {
      message: error.message,
      code: error.code,
      name: error.name,
      stack: error.stack,
      response: {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        headers: error.response?.headers
      },
      request: {
        method: error.request?.method,
        url: error.request?.url,
        headers: error.request?.headers,
        data: error.request?.data
      },
      config: {
        url: error.config?.url,
        method: error.config?.method,
        headers: error.config?.headers,
        data: error.config?.data
      }
    };

    console.error('Error al actualizar producto en WooCommerce:', errorInfo);

    // Guardar el log de error en la base de datos
    try {
      const pool = await poolPromise;
      await pool.request()
        .input('fac_nro_woo', sql.VarChar(50), null)
        .input('fac_nro', sql.VarChar(50), null)
        .input('total_items', sql.Int, 1)
        .input('success_count', sql.Int, 0)
        .input('error_count', sql.Int, 1)
        .input('skipped_count', sql.Int, 0)
        .input('duration', sql.Float, 0)
        .input('batches_processed', sql.Int, 1)
        .input('messages', sql.NVarChar(sql.MAX), JSON.stringify([
          `Error al actualizar producto ${art_cod} en WooCommerce`,
          {
            error: error.message,
            status: error.response?.status || 'No response',
            statusText: error.response?.statusText || 'No response',
            data: error.response?.data || 'No response data',
            request: {
              method: error.request?.method || 'No request',
              url: error.request?.url || 'No URL'
            }
          }
        ]))
        .input('status', sql.VarChar(20), 'ERROR')
        .input('error_details', sql.NVarChar(sql.MAX), JSON.stringify(errorInfo))
        .query(`
          INSERT INTO dbo.woo_sync_logs (
            fac_nro_woo, fac_nro, total_items, success_count, error_count, 
            skipped_count, duration, batches_processed, messages, status, error_details
          ) VALUES (
            @fac_nro_woo, @fac_nro, @total_items, @success_count, @error_count,
            @skipped_count, @duration, @batches_processed, @messages, @status, @error_details
          );
        `);
    } catch (logError) {
      console.error('Error guardando log de error:', logError);
    }

    throw new Error(`Error al actualizar producto en WooCommerce: ${error.message}`);
  }
};

const getArticulos = async ({ codigo, nombre, inv_gru_cod, inv_sub_gru_cod, tieneExistencia, PageNumber, PageSize }) => {
  try {
    const pool = await poolPromise;

    const query = `
WITH ArticulosBase AS (
    SELECT
        a.art_sec,
        a.art_cod,
        a.art_woo_id,
        a.art_nom,
        a.art_url_img_servi,
        ig.inv_gru_cod,
        ig.inv_gru_nom AS categoria,
        isg.inv_sub_gru_cod,
        isg.inv_sub_gru_nom AS sub_categoria,
        ISNULL(ad1.art_bod_pre, 0) AS precio_detal,
        ISNULL(ad2.art_bod_pre, 0) AS precio_mayor,
        ISNULL(e.existencia, 0) AS existencia,
        a.art_woo_sync_status,
        a.art_woo_sync_message
    FROM dbo.articulos a
        INNER JOIN dbo.inventario_subgrupo isg
            ON a.inv_sub_gru_cod = isg.inv_sub_gru_cod
        INNER JOIN dbo.inventario_grupo ig
            ON isg.inv_gru_cod = ig.inv_gru_cod
        LEFT JOIN dbo.articulosdetalle ad1
            ON a.art_sec = ad1.art_sec AND ad1.lis_pre_cod = 1
        LEFT JOIN dbo.articulosdetalle ad2
            ON a.art_sec = ad2.art_sec AND ad2.lis_pre_cod = 2
        LEFT JOIN dbo.vwExistencias e
            ON a.art_sec = e.art_sec
    WHERE 1 = 1
      AND (@codigo IS NULL OR a.art_cod LIKE @codigo+'%')
      AND (@nombre IS NULL OR a.art_nom LIKE '%' + @nombre + '%')
      -- Aplicamos el filtro en la unión, pero también aquí para mayor claridad:
      AND (@inv_gru_cod IS NULL OR ig.inv_gru_cod = @inv_gru_cod)
      AND (@inv_sub_gru_cod IS NULL OR isg.inv_sub_gru_cod = @inv_sub_gru_cod)
      AND (
             @tieneExistencia IS NULL 
             OR (@tieneExistencia = 1 AND ISNULL(e.existencia, 0) > 0)
             OR (@tieneExistencia = 0 AND ISNULL(e.existencia, 0) = 0)
          )
)
SELECT *
FROM ArticulosBase
ORDER BY art_nom
OFFSET (@PageNumber - 1) * @PageSize ROWS
FETCH NEXT @PageSize ROWS ONLY
OPTION (RECOMPILE);
    `;

    const result = await pool.request()
      .input('codigo', sql.VarChar(30), codigo)
      .input('nombre', sql.VarChar(100), nombre)
      .input('inv_gru_cod', sql.VarChar(16), inv_gru_cod)
      .input('inv_sub_gru_cod', sql.VarChar(16), inv_sub_gru_cod)
      .input('tieneExistencia', sql.Bit, typeof tieneExistencia !== 'undefined' ? tieneExistencia : null)
      .input('PageNumber', sql.Int, PageNumber)
      .input('PageSize', sql.Int, PageSize)
      .query(query);

    return result.recordset;
  } catch (error) {
    throw error;
  }
};

const createArticulo = async (articuloData) => {
  let transaction;
  let art_sec;
  const errors = {
    cloudinary: null,
    wooCommerce: null,
    database: null
  };
  let art_woo_id = null;
  let imageUrls = []; 

  try {
    const pool = await poolPromise;
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const request = new sql.Request(transaction);

    // 1. Obtener el siguiente art_sec usando la tabla secuencia
    const getNextSecQuery = `
      SELECT sec_num + 1 AS NewArtSec
      FROM dbo.secuencia WITH (UPDLOCK, HOLDLOCK)
      WHERE sec_cod = 'ARTICULOS'
    `;
    const secResult = await request.query(getNextSecQuery);
    art_sec = secResult.recordset[0].NewArtSec;

    // 1.1 Actualizar el número de secuencia
    const updateSecQuery = `
      UPDATE dbo.secuencia
      SET sec_num = @newSecNum
      WHERE sec_cod = 'ARTICULOS'
    `;
    await request
      .input('newSecNum', sql.Decimal(18, 0), art_sec)
      .query(updateSecQuery);

    // 2. Insertar en la base de datos
    const insertQuery = `
      INSERT INTO dbo.articulos 
      (art_sec, art_cod, art_nom, inv_sub_gru_cod, pre_sec) 
      VALUES (@artSecInsert, @art_cod, @art_nom, @subcategoria, '1')
    `;

    await request
      .input('artSecInsert', sql.Decimal(18, 0), art_sec)
      .input('art_cod', sql.VarChar(50), articuloData.art_cod)
      .input('art_nom', sql.VarChar(250), articuloData.art_nom)
      .input('subcategoria', sql.VarChar(50), articuloData.subcategoria)
      .query(insertQuery);

    // 3. Subir imágenes a Cloudinary si se proporcionaron
    if (articuloData.images && articuloData.images.length > 0) {
      try {
        const uploadPromises = articuloData.images.map(async (image, index) => {
          const base64Image = `data:${image.mimetype};base64,${image.data.toString('base64')}`;
          const result = await cloudinary.uploader.upload(base64Image, {
            folder: 'articulos',
            public_id: `${articuloData.art_cod}_${index + 1}`
          });
          return result.secure_url;
        });

        imageUrls = await Promise.all(uploadPromises);

        if (imageUrls.length > 0) {
          const updateImageQuery = `
            UPDATE dbo.articulos 
            SET art_url_img_servi = @imageUrl
            WHERE art_sec = @artSecImage
          `;
          await request
            .input('imageUrl', sql.VarChar(500), imageUrls[0])
            .input('artSecImage', sql.Decimal(18, 0), art_sec)
            .query(updateImageQuery);
        }
      } catch (error) {
        errors.cloudinary = {
          message: 'Error al subir imágenes a Cloudinary',
          details: error.message,
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        };
        console.error('Error al subir imágenes a Cloudinary:', error);
      }
    }

    // 4. Insertar precio detal
    const insertDetalle1Query = `
      INSERT INTO dbo.articulosdetalle (art_sec, bod_sec, lis_pre_cod, art_bod_pre)
      VALUES (@artSecDetal, '1', 1, @precio_detal)
    `;
    await request
      .input('artSecDetal', sql.Decimal(18, 0), art_sec)
      .input('precio_detal', sql.Decimal(17, 2), articuloData.precio_detal)
      .query(insertDetalle1Query);

    // 5. Insertar precio mayor
    const insertDetalle2Query = `
      INSERT INTO dbo.articulosdetalle (art_sec, bod_sec, lis_pre_cod, art_bod_pre)
      VALUES (@artSecMayor, '1', 2, @precio_mayor)
    `;
    await request
      .input('artSecMayor', sql.Decimal(18, 0), art_sec)
      .input('precio_mayor', sql.Decimal(17, 2), articuloData.precio_mayor)
      .query(insertDetalle2Query);

    // Commit de la transacción local
    await transaction.commit();

    // 6. Intentar sincronización con WooCommerce
    try {
      // Obtener IDs de categorías de WooCommerce
      const catRequest = pool.request();
      catRequest.input('categoria', sql.VarChar(50), articuloData.categoria);
      catRequest.input('subcategoria', sql.VarChar(50), articuloData.subcategoria);
      const catQueryResult = await catRequest.query(`
        SELECT inv_sub_gru_parend_woo, inv_sub_gru_woo_id 
        FROM dbo.inventario_subgrupo 
        WHERE inv_gru_cod = @categoria AND inv_sub_gru_cod = @subcategoria
      `);

      const categories = [];
      if (catQueryResult.recordset.length > 0) {
        const { inv_sub_gru_parend_woo, inv_sub_gru_woo_id } = catQueryResult.recordset[0];
        if (inv_sub_gru_parend_woo) {
          categories.push({ id: parseInt(inv_sub_gru_parend_woo, 10) });
        }
        if (inv_sub_gru_woo_id) {
          categories.push({ id: parseInt(inv_sub_gru_woo_id, 10) });
        }
      }

      const wooData = {
        name: articuloData.art_nom,
        type: 'simple',
        sku: articuloData.art_cod,
        regular_price: articuloData.precio_detal.toString(),
        manage_stock: true,
        stock_quantity: 0,
        meta_data: [
          {
            key: "_precio_mayorista",
            value: articuloData.precio_mayor.toString()
          }
        ],
        categories: categories,
        images: imageUrls.map(url => ({ src: url }))
      };

      console.log('Datos enviados a WooCommerce:', JSON.stringify(wooData, null, 2));
      console.log('Categorías WooCommerce:', JSON.stringify(categories, null, 2));

      const wooProduct = await wcApi.post('products', wooData);
      art_woo_id = wooProduct.data.id;
      console.log('Producto creado en WooCommerce:', art_woo_id);

      // Actualizar el artículo con el ID de WooCommerce
      const updateWooIdQuery = `
        UPDATE dbo.articulos 
        SET art_woo_id = @art_woo_id 
        WHERE art_sec = @artSecWoo
      `;
      await pool.request()
        .input('art_woo_id', sql.Int, art_woo_id)
        .input('artSecWoo', sql.Decimal(18, 0), art_sec)
        .query(updateWooIdQuery);

    } catch (wooError) {
      errors.wooCommerce = {
        message: 'Error al sincronizar con WooCommerce',
        details: wooError.message,
        response: wooError.response?.data,
        status: wooError.response?.status,
        statusText: wooError.response?.statusText,
        stack: process.env.NODE_ENV === 'development' ? wooError.stack : undefined
      };
      console.error('Error al sincronizar con WooCommerce:', errors.wooCommerce);
    }

    // Construir la respuesta final
    const response = {
      success: true,
      data: {
        art_sec,
        art_cod: articuloData.art_cod,
        art_nom: articuloData.art_nom,
        categoria: articuloData.categoria,
        subcategoria: articuloData.subcategoria,
        precio_detal: articuloData.precio_detal,
        precio_mayor: articuloData.precio_mayor,
        art_woo_id,
        images: imageUrls
      },
      errors: Object.entries(errors).reduce((acc, [key, value]) => {
        if (value) acc[key] = value;
        return acc;
      }, {})
    };

    // Si hay errores, marcar success como false
    if (Object.keys(response.errors).length > 0) {
      response.success = false;
      response.message = 'El artículo se creó con algunos errores';
    }

    return response;

  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error("Error en rollback:", rollbackError);
      }
    }
    errors.database = {
      message: 'Error en la base de datos',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    };
    throw {
      success: false,
      message: 'Error al crear el artículo',
      errors
    };
  }
};

const getArticuloByArtCod = async (art_cod) => {
  try {
    const pool = await poolPromise;
    const query = `
      SELECT 
        a.art_sec, 
        a.art_cod, 
        a.art_nom, 
        e.existencia,
        a.art_woo_sync_status,
        a.art_woo_sync_message
      FROM dbo.articulos a
      left join dbo.vwExistencias e on e.art_sec = a.art_sec
      WHERE a.art_cod = @art_cod 
    `;
    const result = await pool.request()
      .input('art_cod', sql.VarChar(50), art_cod)
      .query(query);

    if (result.recordset.length === 0) {
      throw new Error("Artículo no encontrado.");
    }
    return result.recordset[0];

  } catch (error) {
    throw error;
  }
};
const getArticulo = async (art_sec) => {
  try {
    const pool = await poolPromise;
    const query = `
      SELECT 
        a.art_sec,
        a.art_cod,
        a.art_nom,
        g.inv_gru_cod,
        s.inv_sub_gru_cod,
        a.art_woo_id,
        ad1.art_bod_pre AS precio_detal,
        ad2.art_bod_pre AS precio_mayor,
        a.art_woo_sync_status,
        a.art_woo_sync_message
        FROM dbo.articulos a
	      LEFT JOIN inventario_subgrupo s on s.inv_sub_gru_cod = a.inv_sub_gru_cod
	      left join inventario_grupo g on g.inv_gru_cod = s.inv_gru_cod
        LEFT JOIN dbo.articulosdetalle ad1 
        ON a.art_sec = ad1.art_sec AND ad1.lis_pre_cod = 1
        LEFT JOIN dbo.articulosdetalle ad2 
        ON a.art_sec = ad2.art_sec AND ad2.lis_pre_cod = 2
        WHERE a.art_sec = @art_sec
    `;
    const result = await pool.request()
      .input('art_sec', sql.Decimal(18, 0), art_sec)
      .query(query);

    if (result.recordset.length === 0) {
      throw new Error("Artículo no encontrado.");
    }
    return result.recordset[0];
  } catch (error) {
    throw error;
  }
};

const updateArticulo = async ({ id_articulo, art_cod, art_nom, categoria, subcategoria, art_woo_id, precio_detal, precio_mayor, actualiza_fecha, fac_fec = null }) => {
  let transaction;
  try {
    const pool = await poolPromise;
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const request = new sql.Request(transaction);

    // Actualizar la tabla articulos
    const updateArticuloQuery = `
      UPDATE dbo.articulos
      SET art_cod = @art_cod,
          art_nom = @art_nom,
          inv_sub_gru_cod = @subcategoria,
          art_woo_id = @art_woo_id,
          art_woo_sync_status = 'PENDING',
          art_woo_sync_message = NULL
      WHERE art_sec = @id_articulo
    `;
    await request
      .input('art_cod', sql.VarChar(50), art_cod)
      .input('art_nom', sql.VarChar(250), art_nom)
      .input('subcategoria', sql.Int(4), subcategoria)
      .input('art_woo_id', sql.Int(4), art_woo_id)
      .input('id_articulo', sql.Decimal(18, 0), id_articulo)
      .query(updateArticuloQuery);

    // Actualizar el precio detall en articulosdetalle (lista 1)
    const updateDetalle1Query = `
      UPDATE dbo.articulosdetalle
      SET art_bod_pre = @precio_detal
      WHERE art_sec = @id_articulo AND lis_pre_cod = 1
    `;
    await request
      .input('precio_detal', sql.Decimal(17, 2), precio_detal)
      .query(updateDetalle1Query);

    // Verificar si existe el registro de precio mayor
    const checkPrecioMayorQuery = `
      SELECT COUNT(*) as count 
      FROM dbo.articulosdetalle 
      WHERE art_sec = @id_articulo AND lis_pre_cod = 2
    `;
    const precioMayorResult = await request.query(checkPrecioMayorQuery);
    const precioMayorExists = precioMayorResult.recordset[0].count > 0;

    if (precioMayorExists) {
      // Si existe, actualizar
      const updateDetalle2Query = `
        UPDATE dbo.articulosdetalle
        SET art_bod_pre = @precio_mayor
        WHERE art_sec = @id_articulo AND lis_pre_cod = 2
      `;
      await request
        .input('precio_mayor', sql.Decimal(17, 2), precio_mayor)
        .query(updateDetalle2Query);
    } else {
      // Si no existe, insertar
      const insertDetalle2Query = `
        INSERT INTO dbo.articulosdetalle (art_sec, bod_sec, lis_pre_cod, art_bod_pre)
        VALUES (@id_articulo, '1', 2, @precio_mayor)
      `;
      await request
        .input('precio_mayor', sql.Decimal(17, 2), precio_mayor)
        .query(insertDetalle2Query);
    }

    await transaction.commit();

    // Actualización en WooCommerce
    try {
      const wooResult = await updateWooCommerceProduct(art_woo_id, art_nom, art_cod, precio_detal, precio_mayor, actualiza_fecha, fac_fec);
      
      // Actualizar estado de sincronización
      await pool.request()
        .input('id_articulo', sql.Decimal(18, 0), id_articulo)
        .input('sync_status', sql.VarChar(20), 'SUCCESS')
        .input('sync_message', sql.NVarChar(sql.MAX), JSON.stringify(wooResult))
        .query(`
          UPDATE dbo.articulos
          SET art_woo_sync_status = @sync_status,
              art_woo_sync_message = @sync_message
          WHERE art_sec = @id_articulo
        `);

      return { 
        message: "Artículo actualizado exitosamente.",
        wooCommerce: {
          success: true,
          status: wooResult.status,
          data: wooResult.data
        }
      };
    } catch (wooError) {
      // Actualizar estado de sincronización con error
      await pool.request()
        .input('id_articulo', sql.Decimal(18, 0), id_articulo)
        .input('sync_status', sql.VarChar(20), 'ERROR')
        .input('sync_message', sql.NVarChar(sql.MAX), JSON.stringify({
          message: wooError.message,
          response: wooError.response?.data,
          status: wooError.response?.status,
          statusText: wooError.response?.statusText
        }))
        .query(`
          UPDATE dbo.articulos
          SET art_woo_sync_status = @sync_status,
              art_woo_sync_message = @sync_message
          WHERE art_sec = @id_articulo
        `);

      return { 
        message: "Artículo actualizado, pero falló la sincronización con WooCommerce.",
        wooCommerce: {
          success: false,
          error: wooError.message
        }
      };
    }
  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error("Error en rollback:", rollbackError);
      }
    }
    throw error;
  }
};

const getNextArticuloCodigo = async () => {
  try {
    const pool = await poolPromise;

    // 1. Obtener el último código numérico de artículo
    const query = `
      SELECT TOP 1 art_cod
      FROM dbo.articulos
      WHERE art_cod LIKE '[0-9]%'  -- Solo códigos que empiecen con números
      AND art_cod NOT LIKE '%[^0-9]%'  -- Solo códigos que sean completamente numéricos
      ORDER BY CAST(art_cod AS INT) DESC
    `;

    const result = await pool.request().query(query);

    let nextCodigo;
    if (result.recordset.length === 0) {
      // Si no hay códigos numéricos, empezar desde 1
      nextCodigo = '1';
    } else {
      // Obtener el último código y sumar 1
      const ultimoCodigo = result.recordset[0].art_cod;
      nextCodigo = (parseInt(ultimoCodigo) + 1).toString();
    }

    // Verificar que el código generado no exista
    let codigoDisponible = false;
    let intentos = 0;
    let codigoFinal = nextCodigo;

    while (!codigoDisponible && intentos < 1000) { // Límite de 1000 intentos para evitar bucles infinitos
      const checkQuery = `
        SELECT COUNT(*) as count
        FROM dbo.articulos
        WHERE art_cod = @codigo
      `;

      const checkResult = await pool.request()
        .input('codigo', sql.VarChar(50), codigoFinal)
        .query(checkQuery);

      if (checkResult.recordset[0].count === 0) {
        codigoDisponible = true;
      } else {
        // Si el código existe, intentar con el siguiente número
        codigoFinal = (parseInt(codigoFinal) + 1).toString();
        intentos++;
      }
    }

    if (!codigoDisponible) {
      throw new Error('No se pudo generar un código de artículo disponible');
    }

    return {
      art_cod: codigoFinal,
      message: "Código de artículo disponible generado exitosamente"
    };

  } catch (error) {
    throw error;
  }
};

module.exports = { getArticulos, validateArticulo, createArticulo, getArticulo, updateArticulo, getArticuloByArtCod, getNextArticuloCodigo };
