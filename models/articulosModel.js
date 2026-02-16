// models/articulosModel.js
const { sql, poolPromise } = require('../db');
const WooCommerceRestApi = require("@woocommerce/woocommerce-rest-api").default;
const cloudinary = require('../config/cloudinary');
const { v4: uuidv4 } = require('uuid');
const ProductPhoto = require('./ProductPhoto');

// Importar modelo de IA (con manejo de errores si no está disponible)
// La carga es lazy para evitar errores si no está configurado
let aiOptimizationModel = null;

/**
 * Obtiene el modelo de IA de forma lazy
 * @returns {Object|null} Modelo de IA o null si no está disponible
 */
const getAIModel = () => {
  if (aiOptimizationModel === null && process.env.OPENAI_API_KEY) {
    try {
      aiOptimizationModel = require('./aiOptimizationModel');
    } catch (error) {
      console.warn('[articulosModel] Modelo de IA no disponible:', error.message);
      aiOptimizationModel = false; // Marcar como intentado pero fallido
    }
  }
  return aiOptimizationModel || null;
};

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
/**
 * Obtiene contenido IA optimizado para un producto
 * @param {string} art_sec - ID del artículo
 * @returns {Promise<Object|null>} Contenido IA o null
 */
const getAIContentForProduct = async (art_sec) => {
  const aiModel = getAIModel();
  if (!aiModel) {
    return null;
  }

  try {
    const contenidoIA = await aiModel.getActiveContent(art_sec);
    return contenidoIA;
  } catch (error) {
    console.warn(`[UPDATE_WOO_PRODUCT] Error obteniendo contenido IA para ${art_sec}:`, error.message);
    return null;
  }
};

const updateWooCommerceProduct = async (art_woo_id, art_nom, art_cod, precio_detal, precio_mayor, actualiza_fecha = 'N', fac_fec = null, categoria = null, subcategoria = null) => {
  console.log(`[UPDATE_WOO_PRODUCT] Iniciando actualización en WooCommerce`, {
    art_woo_id,
    art_cod,
    art_nom,
    precio_detal,
    precio_mayor,
    actualiza_fecha,
    fac_fec,
    categoria,
    subcategoria,
    timestamp: new Date().toISOString()
  });

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

    // Obtener art_sec para buscar contenido IA
    let art_sec = null;
    try {
      const pool = await poolPromise;
      const artSecResult = await pool.request()
        .input('art_cod', sql.VarChar(50), art_cod)
        .query('SELECT art_sec FROM dbo.articulos WHERE art_cod = @art_cod');
      
      if (artSecResult.recordset.length > 0) {
        art_sec = artSecResult.recordset[0].art_sec;
      }
    } catch (error) {
      console.warn('[UPDATE_WOO_PRODUCT] Error obteniendo art_sec:', error.message);
    }

    // Obtener contenido IA si está disponible
    let contenidoIA = null;
    if (art_sec) {
      contenidoIA = await getAIContentForProduct(art_sec);
    }

    // Preparar datos base
    const data = {
      name: contenidoIA?.ai_contenido?.titulo_seo || art_nom,
      sku: art_cod,
      regular_price: precio_detal.toString(),
      meta_data: [
        { key: '_precio_mayorista', value: precio_mayor }
      ]
    };

    // Agregar descripciones si hay contenido IA
    if (contenidoIA?.ai_contenido) {
      const aiContent = contenidoIA.ai_contenido;
      
      if (aiContent.descripcion_larga_html) {
        data.description = aiContent.descripcion_larga_html;
      }
      
      if (aiContent.descripcion_corta) {
        data.short_description = aiContent.descripcion_corta;
      }

      // Agregar meta description a meta_data
      if (aiContent.meta_description) {
        data.meta_data.push({
          key: '_yoast_wpseo_metadesc',
          value: aiContent.meta_description
        });
      }

      // Marcar como optimizado con IA
      data.meta_data.push({
        key: '_ai_optimized',
        value: 'yes'
      });

      console.log('[UPDATE_WOO_PRODUCT] Usando contenido IA optimizado');
    }

    // Incluir categorías si se proporcionan (categoria/subcategoria pueden llegar como number desde el front)
    if (categoria != null && subcategoria != null) {
      const pool = await poolPromise;
      const catRequest = pool.request();
      catRequest.input('categoria', sql.VarChar(50), String(categoria));
      catRequest.input('subcategoria', sql.VarChar(50), String(subcategoria));
      const catQueryResult = await catRequest.query(`
        SELECT g.inv_gru_woo_id, s.inv_sub_gru_woo_id
        FROM dbo.inventario_subgrupo s
        INNER JOIN dbo.inventario_grupo g ON g.inv_gru_cod = s.inv_gru_cod
        WHERE s.inv_gru_cod = @categoria AND s.inv_sub_gru_cod = @subcategoria
      `);

      const categories = [];
      if (catQueryResult.recordset.length > 0) {
        const { inv_gru_woo_id, inv_sub_gru_woo_id } = catQueryResult.recordset[0];
        if (inv_gru_woo_id) {
          categories.push({ id: parseInt(inv_gru_woo_id, 10) });
        }
        if (inv_sub_gru_woo_id) {
          categories.push({ id: parseInt(inv_sub_gru_woo_id, 10) });
        }
      }

      if (categories.length > 0) {
        data.categories = categories;
        console.log('[UPDATE_WOO_PRODUCT] Categorías WooCommerce:', JSON.stringify(categories, null, 2));
      }
    }

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

    console.log(`[UPDATE_WOO_PRODUCT] Actualización completada exitosamente en WooCommerce para ${art_cod}`);
    
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

    console.error(`[UPDATE_WOO_PRODUCT] Error al actualizar producto en WooCommerce para ${art_cod}:`, error.message);
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
        -- Precios originales
        ISNULL(ad1.art_bod_pre, 0) AS precio_detal_original,
        ISNULL(ad2.art_bod_pre, 0) AS precio_mayor_original,
        -- Costo promedio ponderado
        ISNULL(ad1.art_bod_cos_cat, 0) AS costo_promedio,
        -- Precios con oferta aplicada (usando la promoción más prioritaria)
        CASE 
            WHEN oferta_prioritaria.pro_det_precio_oferta IS NOT NULL AND oferta_prioritaria.pro_det_precio_oferta > 0 
            THEN oferta_prioritaria.pro_det_precio_oferta 
            WHEN oferta_prioritaria.pro_det_descuento_porcentaje IS NOT NULL AND oferta_prioritaria.pro_det_descuento_porcentaje > 0 
            THEN ISNULL(ad1.art_bod_pre, 0) * (1 - (oferta_prioritaria.pro_det_descuento_porcentaje / 100))
            ELSE ISNULL(ad1.art_bod_pre, 0) 
        END AS precio_detal,
        CASE 
            WHEN oferta_prioritaria.pro_det_precio_oferta IS NOT NULL AND oferta_prioritaria.pro_det_precio_oferta > 0 
            THEN oferta_prioritaria.pro_det_precio_oferta 
            WHEN oferta_prioritaria.pro_det_descuento_porcentaje IS NOT NULL AND oferta_prioritaria.pro_det_descuento_porcentaje > 0 
            THEN ISNULL(ad2.art_bod_pre, 0) * (1 - (oferta_prioritaria.pro_det_descuento_porcentaje / 100))
            ELSE ISNULL(ad2.art_bod_pre, 0) 
        END AS precio_mayor,
        -- Información de oferta (de la promoción más prioritaria)
        oferta_prioritaria.pro_det_precio_oferta AS precio_oferta,
        oferta_prioritaria.pro_det_descuento_porcentaje AS descuento_porcentaje,
        oferta_prioritaria.pro_fecha_inicio,
        oferta_prioritaria.pro_fecha_fin,
        oferta_prioritaria.pro_codigo AS codigo_promocion,
        oferta_prioritaria.pro_descripcion AS descripcion_promocion,
        CASE 
            WHEN oferta_prioritaria.pro_sec IS NOT NULL 
                 AND ((oferta_prioritaria.pro_det_precio_oferta IS NOT NULL AND oferta_prioritaria.pro_det_precio_oferta > 0) 
                      OR (oferta_prioritaria.pro_det_descuento_porcentaje IS NOT NULL AND oferta_prioritaria.pro_det_descuento_porcentaje > 0))
            THEN 'S' 
            ELSE 'N' 
        END AS tiene_oferta,
        ISNULL(e.existencia, 0) AS existencia,
        a.art_woo_sync_status,
        a.art_woo_sync_message,
        ISNULL(a.art_woo_type, 'simple') AS art_woo_type,
        ISNULL(a.art_bundle, 'N') AS art_bundle
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
        -- Subquery para obtener la promoción más prioritaria por artículo
        LEFT JOIN (
            SELECT 
                pd.art_sec,
                pd.pro_det_precio_oferta,
                pd.pro_det_descuento_porcentaje,
                p.pro_sec,
                p.pro_fecha_inicio,
                p.pro_fecha_fin,
                p.pro_codigo,
                p.pro_descripcion,
                ROW_NUMBER() OVER (
                    PARTITION BY pd.art_sec 
                    ORDER BY 
                        -- Prioridad 1: Precio de oferta (más alto primero)
                        ISNULL(pd.pro_det_precio_oferta, 0) DESC,
                        -- Prioridad 2: Descuento porcentual (más alto primero)
                        ISNULL(pd.pro_det_descuento_porcentaje, 0) DESC,
                        -- Prioridad 3: Fecha de inicio (más reciente primero)
                        p.pro_fecha_inicio DESC
                ) as rn
            FROM dbo.promociones_detalle pd
            INNER JOIN dbo.promociones p
                ON pd.pro_sec = p.pro_sec 
                AND p.pro_activa = 'S'
                AND GETDATE() BETWEEN p.pro_fecha_inicio AND p.pro_fecha_fin
            WHERE pd.pro_det_estado = 'A'
        ) oferta_prioritaria
            ON a.art_sec = oferta_prioritaria.art_sec 
            AND oferta_prioritaria.rn = 1
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
ORDER BY CAST(art_sec AS INT) DESC
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
      .input('subcategoria', sql.VarChar(50), String(articuloData.subcategoria ?? ''))
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
      // Obtener IDs de categorías de WooCommerce (categoria/subcategoria pueden venir como number)
      const catRequest = pool.request();
      catRequest.input('categoria', sql.VarChar(50), String(articuloData.categoria ?? ''));
      catRequest.input('subcategoria', sql.VarChar(50), String(articuloData.subcategoria ?? ''));
      const catQueryResult = await catRequest.query(`
        SELECT g.inv_gru_woo_id, s.inv_sub_gru_woo_id
        FROM dbo.inventario_subgrupo s
        INNER JOIN dbo.inventario_grupo g ON g.inv_gru_cod = s.inv_gru_cod
        WHERE s.inv_gru_cod = @categoria AND s.inv_sub_gru_cod = @subcategoria
      `);

      const categories = [];
      if (catQueryResult.recordset.length > 0) {
        const { inv_gru_woo_id, inv_sub_gru_woo_id } = catQueryResult.recordset[0];
        if (inv_gru_woo_id) {
          categories.push({ id: parseInt(inv_gru_woo_id, 10) });
        }
        if (inv_sub_gru_woo_id) {
          categories.push({ id: parseInt(inv_sub_gru_woo_id, 10) });
        }
      }

      // Obtener contenido IA si está disponible
      let contenidoIA = null;
      try {
        contenidoIA = await getAIContentForProduct(art_sec.toString());
      } catch (error) {
        console.warn('[CREATE_ARTICULO] Error obteniendo contenido IA:', error.message);
      }

      const wooData = {
        name: contenidoIA?.ai_contenido?.titulo_seo || articuloData.art_nom,
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

      // Agregar descripciones si hay contenido IA
      if (contenidoIA?.ai_contenido) {
        const aiContent = contenidoIA.ai_contenido;
        
        if (aiContent.descripcion_larga_html) {
          wooData.description = aiContent.descripcion_larga_html;
        }
        
        if (aiContent.descripcion_corta) {
          wooData.short_description = aiContent.descripcion_corta;
        }

        // Agregar meta description
        if (aiContent.meta_description) {
          wooData.meta_data.push({
            key: '_yoast_wpseo_metadesc',
            value: aiContent.meta_description
          });
        }

        // Marcar como optimizado con IA
        wooData.meta_data.push({
          key: '_ai_optimized',
          value: 'yes'
        });

        console.log('[CREATE_ARTICULO] Usando contenido IA optimizado');
      }

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

      // Registrar las fotos en la tabla producto_fotos
      if (wooProduct.data.images && wooProduct.data.images.length > 0) {
        for (let i = 0; i < wooProduct.data.images.length; i++) {
          const image = wooProduct.data.images[i];
          const originalImage = articuloData.images[i];
          const photo = new ProductPhoto({
            id: uuidv4(),
            art_sec: art_sec.toString(),
            nombre: `${articuloData.art_cod}_${i + 1}`,
            url: image.src,
            tipo: originalImage ? originalImage.mimetype : 'image/jpeg',
            tamanio: originalImage ? originalImage.size : 0,
            fecha_creacion: new Date(),
            woo_photo_id: image.id.toString(),
            es_principal: i === 0,
            posicion: i,
            estado: 'woo'
          });
          await photo.save();
        }
      }

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

    const articulo = result.recordset[0];
    
    // Obtener precios usando precioUtils
    const { obtenerPreciosArticulo } = require('../utils/precioUtils');
    const precios = await obtenerPreciosArticulo(articulo.art_sec);
    
    // Combinar la información del artículo con los precios
    return {
      ...articulo,
      precio_detal: precios.precio_detal,
      precio_mayor: precios.precio_mayor
    };

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
        g.inv_gru_nom,
        s.inv_sub_gru_cod,
        s.inv_sub_gru_nom,
        a.art_woo_id,
        -- Precios originales
        ISNULL(ad1.art_bod_pre, 0) AS precio_detal_original,
        ISNULL(ad2.art_bod_pre, 0) AS precio_mayor_original,
        -- Precios con oferta aplicada (usando la promoción más prioritaria)
        CASE 
            WHEN oferta_prioritaria.pro_det_precio_oferta IS NOT NULL AND oferta_prioritaria.pro_det_precio_oferta > 0 
            THEN oferta_prioritaria.pro_det_precio_oferta 
            WHEN oferta_prioritaria.pro_det_descuento_porcentaje IS NOT NULL AND oferta_prioritaria.pro_det_descuento_porcentaje > 0 
            THEN ISNULL(ad1.art_bod_pre, 0) * (1 - (oferta_prioritaria.pro_det_descuento_porcentaje / 100))
            ELSE ISNULL(ad1.art_bod_pre, 0) 
        END AS precio_detal,
        CASE 
            WHEN oferta_prioritaria.pro_det_precio_oferta IS NOT NULL AND oferta_prioritaria.pro_det_precio_oferta > 0 
            THEN oferta_prioritaria.pro_det_precio_oferta 
            WHEN oferta_prioritaria.pro_det_descuento_porcentaje IS NOT NULL AND oferta_prioritaria.pro_det_descuento_porcentaje > 0 
            THEN ISNULL(ad2.art_bod_pre, 0) * (1 - (oferta_prioritaria.pro_det_descuento_porcentaje / 100))
            ELSE ISNULL(ad2.art_bod_pre, 0) 
        END AS precio_mayor,
        -- Información de oferta (de la promoción más prioritaria)
        oferta_prioritaria.pro_det_precio_oferta AS precio_oferta,
        oferta_prioritaria.pro_det_descuento_porcentaje AS descuento_porcentaje,
        oferta_prioritaria.pro_fecha_inicio,
        oferta_prioritaria.pro_fecha_fin,
        oferta_prioritaria.pro_codigo AS codigo_promocion,
        oferta_prioritaria.pro_descripcion AS descripcion_promocion,
        CASE 
            WHEN oferta_prioritaria.pro_sec IS NOT NULL 
                 AND ((oferta_prioritaria.pro_det_precio_oferta IS NOT NULL AND oferta_prioritaria.pro_det_precio_oferta > 0) 
                      OR (oferta_prioritaria.pro_det_descuento_porcentaje IS NOT NULL AND oferta_prioritaria.pro_det_descuento_porcentaje > 0))
            THEN 'S' 
            ELSE 'N' 
        END AS tiene_oferta,
        a.art_woo_sync_status,
        a.art_woo_sync_message,
        ISNULL(a.art_woo_type, 'simple') AS art_woo_type,
        a.art_variable,
        a.art_sec_padre,
        a.art_variation_attributes,
        ISNULL(a.art_bundle, 'N') AS art_bundle
        FROM dbo.articulos a
	      LEFT JOIN inventario_subgrupo s on s.inv_sub_gru_cod = a.inv_sub_gru_cod
	      left join inventario_grupo g on g.inv_gru_cod = s.inv_gru_cod
        LEFT JOIN dbo.articulosdetalle ad1
        ON a.art_sec = ad1.art_sec AND ad1.lis_pre_cod = 1
        LEFT JOIN dbo.articulosdetalle ad2
        ON a.art_sec = ad2.art_sec AND ad2.lis_pre_cod = 2
        -- Subquery para obtener la promoción más prioritaria por artículo
        LEFT JOIN (
            SELECT 
                pd.art_sec,
                pd.pro_det_precio_oferta,
                pd.pro_det_descuento_porcentaje,
                p.pro_sec,
                p.pro_fecha_inicio,
                p.pro_fecha_fin,
                p.pro_codigo,
                p.pro_descripcion,
                ROW_NUMBER() OVER (
                    PARTITION BY pd.art_sec 
                    ORDER BY 
                        -- Prioridad 1: Precio de oferta (más alto primero)
                        ISNULL(pd.pro_det_precio_oferta, 0) DESC,
                        -- Prioridad 2: Descuento porcentual (más alto primero)
                        ISNULL(pd.pro_det_descuento_porcentaje, 0) DESC,
                        -- Prioridad 3: Fecha de inicio (más reciente primero)
                        p.pro_fecha_inicio DESC
                ) as rn
            FROM dbo.promociones_detalle pd
            INNER JOIN dbo.promociones p
                ON pd.pro_sec = p.pro_sec 
                AND p.pro_activa = 'S'
                AND GETDATE() BETWEEN p.pro_fecha_inicio AND p.pro_fecha_fin
            WHERE pd.pro_det_estado = 'A'
        ) oferta_prioritaria
            ON a.art_sec = oferta_prioritaria.art_sec 
            AND oferta_prioritaria.rn = 1
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
  
  console.log(`[UPDATE_ARTICULO] Iniciando actualización para artículo ${id_articulo}`, {
    art_cod,
    art_nom,
    art_woo_id,
    precio_detal,
    precio_mayor,
    timestamp: new Date().toISOString()
  });
  
  try {
    const pool = await poolPromise;
    transaction = new sql.Transaction(pool);
    await transaction.begin();
    
    console.log(`[UPDATE_ARTICULO] Transacción iniciada para artículo ${id_articulo}`);

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
    console.log(`[UPDATE_ARTICULO] Transacción confirmada para artículo ${id_articulo}`);

    // Verificar si es bundle antes de sincronizar con WooCommerce
    const checkBundle = await pool.request()
      .input('id_articulo', sql.Decimal(18, 0), id_articulo)
      .query('SELECT art_bundle, inv_sub_gru_cod FROM dbo.articulos WHERE art_sec = @id_articulo');
    
    const esBundle = checkBundle.recordset[0]?.art_bundle === 'S';
    const inv_sub_gru_cod = checkBundle.recordset[0]?.inv_sub_gru_cod;

    // Actualización en WooCommerce
    try {
      let wooResult;
      
      if (esBundle && art_woo_id) {
        // Es bundle: usar syncBundleToWooCommerce para actualizar descripción HTML de componentes
        console.log(`[UPDATE_ARTICULO] Detectado bundle, usando syncBundleToWooCommerce para ${id_articulo}`);
        const bundleModel = require('./bundleModel');
        const bundleData = await bundleModel.getBundleComponents(String(id_articulo));
        
        if (bundleData?.componentes?.length) {
          const syncWooId = await bundleModel.syncBundleToWooCommerce({
            art_sec: String(id_articulo),
            art_nom,
            art_cod,
            precio_detal,
            precio_mayor,
            componentes: bundleData.componentes.map(c => ({
              art_nom: c.art_nom,
              art_cod: c.art_cod,
              cantidad: c.cantidad
            })),
            inv_sub_gru_cod: inv_sub_gru_cod || subcategoria,
            art_woo_id: art_woo_id // Pasar art_woo_id para actualizar (PUT)
          });
          
          wooResult = {
            status: syncWooId ? 'SUCCESS' : 'PARTIAL',
            data: { art_woo_id: syncWooId || art_woo_id },
            message: syncWooId ? 'Bundle actualizado en WooCommerce con descripción de componentes' : 'Bundle actualizado pero sync WooCommerce falló'
          };
        } else {
          // Bundle sin componentes: usar updateWooCommerceProduct normal
          console.log(`[UPDATE_ARTICULO] Bundle sin componentes, usando updateWooCommerceProduct normal`);
          wooResult = await updateWooCommerceProduct(art_woo_id, art_nom, art_cod, precio_detal, precio_mayor, actualiza_fecha, fac_fec, categoria, subcategoria);
        }
      } else {
        // No es bundle: usar updateWooCommerceProduct normal
        wooResult = await updateWooCommerceProduct(art_woo_id, art_nom, art_cod, precio_detal, precio_mayor, actualiza_fecha, fac_fec, categoria, subcategoria);
      }
      
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

      console.log(`[UPDATE_ARTICULO] Actualización completada exitosamente para artículo ${id_articulo}`);
      
      return { 
        message: "Artículo actualizado exitosamente.",
        wooCommerce: {
          success: true,
          status: wooResult.status,
          data: wooResult.data
        }
      };
    } catch (wooError) {
      console.error(`[UPDATE_ARTICULO] Error en WooCommerce para artículo ${id_articulo}:`, {
        message: wooError.message,
        stack: wooError.stack,
        timestamp: new Date().toISOString()
      });
      
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
    console.error(`[UPDATE_ARTICULO] Error en updateArticulo para artículo ${id_articulo}:`, {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    
    if (transaction) {
      try {
        await transaction.rollback();
        console.log(`[UPDATE_ARTICULO] Rollback completado para artículo ${id_articulo}`);
      } catch (rollbackError) {
        console.error(`[UPDATE_ARTICULO] Error en rollback para artículo ${id_articulo}:`, rollbackError);
      }
    }
    throw error;
  }
};

const getNextArticuloCodigo = async () => {
  try {
    const pool = await poolPromise;

    // 1. Buscar el mayor código de 4 dígitos (>= 1000)
    const query4Digits = `
      SELECT TOP 1 art_cod
      FROM dbo.articulos
      WHERE LEN(art_cod) = 4
        AND art_cod LIKE '[0-9][0-9][0-9][0-9]'
        AND art_cod NOT LIKE '%[^0-9]%'
        AND CAST(art_cod AS INT) >= 1000
      ORDER BY CAST(art_cod AS INT) DESC
    `;
    const result4 = await pool.request().query(query4Digits);

    let nextCodigo;
    if (result4.recordset.length === 0) {
      // Si no hay códigos de 4 dígitos, empezar desde 5000
      nextCodigo = '5000';
    } else {
      // Obtener el último código de 4 dígitos y sumar 1
      const ultimoCodigo = result4.recordset[0].art_cod;
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

/**
 * Crea un producto variable (padre) que puede tener variaciones
 * @param {Object} productData - Datos del producto padre
 * @returns {Promise<Object>}
 */
const createVariableProduct = async (productData) => {
  const {
    art_nom,
    art_cod,       // Codigo base OBLIGATORIO (ej: "LAB001")
    subcategoria,  // inv_sub_gru_cod (SMALLINT)
    categoria,     // inv_gru_cod (solo para buscar WooCommerce categories)
    precio_detal_referencia,
    precio_mayor_referencia,
    attributes,    // [{name: "Tono", options: ["Rojo", "Rosa", "Ciruela", "Coral"]}]
    images
  } = productData;

  const pool = await poolPromise;
  let transaction = null;
  let art_sec = null;
  let art_woo_id = null;
  const errors = {};

  try {
    // Validar que art_cod sea proporcionado (NOT NULL en BD)
    if (!art_cod || !art_cod.trim()) {
      throw new Error('art_cod es obligatorio para productos variables (NOT NULL en BD)');
    }

    if (art_cod.length > 30) {
      throw new Error('art_cod no puede exceder 30 caracteres');
    }

    if (!attributes || !Array.isArray(attributes) || attributes.length === 0) {
      throw new Error('Se deben proporcionar atributos para el producto variable');
    }

    const validAttributes = attributes.filter(
      attr => attr.name === 'Tono' || attr.name === 'Color'
    );

    if (validAttributes.length === 0) {
      throw new Error('Solo se permite el atributo "Tono" o "Color" en esta fase');
    }

    // Iniciar transaccion
    transaction = new sql.Transaction(pool);
    await transaction.begin();
    const request = new sql.Request(transaction);

    // 1. Generar art_sec usando dbo.secuencia (seguro para concurrencia)
    const secResult = await request.query(`
      SELECT sec_num + 1 AS NewArtSec
      FROM dbo.secuencia WITH (UPDLOCK, HOLDLOCK)
      WHERE sec_cod = 'ARTICULOS'
    `);
    art_sec = secResult.recordset[0].NewArtSec;

    await request
      .input('newSecNum', sql.Decimal(18, 0), art_sec)
      .query(`
        UPDATE dbo.secuencia
        SET sec_num = @newSecNum
        WHERE sec_cod = 'ARTICULOS'
      `);

    console.log('Nuevo art_sec generado para producto variable:', art_sec);

    // 2. Insertar producto padre en dbo.articulos
    // NOTA: art_sec=VARCHAR(30), inv_sub_gru_cod=SMALLINT, pre_sec obligatorio
    // NO existen: inv_gru_cod, art_est en esta tabla
    await request
      .input('art_sec', sql.VarChar(30), art_sec.toString())
      .input('art_cod', sql.VarChar(30), art_cod)
      .input('art_nom', sql.VarChar(100), art_nom)
      .input('subcategoria', sql.SmallInt, parseInt(subcategoria, 10))
      .query(`
        INSERT INTO dbo.articulos (
          art_sec, art_cod, art_nom, inv_sub_gru_cod, pre_sec,
          art_variable, art_woo_type
        )
        VALUES (
          @art_sec, @art_cod, @art_nom, @subcategoria, '1',
          'S', 'variable'
        )
      `);

    console.log('Producto variable padre creado en BD');

    // 3. Subir imagenes a Cloudinary si se proporcionan
    let imageUrls = [];
    if (images && images.length > 0) {
      try {
        const uploadPromises = images.map((image, index) => {
          const base64Image = `data:${image.mimetype};base64,${image.data.toString('base64')}`;
          return cloudinary.uploader.upload(base64Image, {
            folder: 'productos_variables',
            public_id: `${art_cod}_${index + 1}`
          });
        });

        const uploadResults = await Promise.all(uploadPromises);
        imageUrls = uploadResults.map(result => result.secure_url);

        if (imageUrls.length > 0) {
          await request
            .input('imageUrl', sql.VarChar(1000), imageUrls[0])
            .input('artSecImage', sql.VarChar(30), art_sec.toString())
            .query(`
              UPDATE dbo.articulos
              SET art_url_img_servi = @imageUrl
              WHERE art_sec = @artSecImage
            `);
        }
      } catch (error) {
        errors.cloudinary = {
          message: 'Error al subir imagenes a Cloudinary',
          details: error.message
        };
        console.error('Error al subir imagenes:', error);
      }
    }

    // 4. Insertar precios de referencia
    if (precio_detal_referencia) {
      await request
        .input('artSecDetal', sql.VarChar(30), art_sec.toString())
        .input('precio_detal', sql.Decimal(17, 2), precio_detal_referencia)
        .query(`
          INSERT INTO dbo.articulosdetalle (art_sec, bod_sec, lis_pre_cod, art_bod_pre)
          VALUES (@artSecDetal, '1', 1, @precio_detal)
        `);
    }

    if (precio_mayor_referencia) {
      await request
        .input('artSecMayor', sql.VarChar(30), art_sec.toString())
        .input('precio_mayor', sql.Decimal(17, 2), precio_mayor_referencia)
        .query(`
          INSERT INTO dbo.articulosdetalle (art_sec, bod_sec, lis_pre_cod, art_bod_pre)
          VALUES (@artSecMayor, '1', 2, @precio_mayor)
        `);
    }

    // Commit de la transaccion local
    await transaction.commit();
    transaction = null;

    // 5. Crear producto variable en WooCommerce
    try {
      const catRequest = pool.request();
      catRequest.input('categoria', sql.VarChar(16), categoria);
      catRequest.input('subcategoria_woo', sql.SmallInt, parseInt(subcategoria, 10));
      const catResult = await catRequest.query(`
        SELECT g.inv_gru_woo_id, s.inv_sub_gru_woo_id
        FROM dbo.inventario_subgrupo s
        INNER JOIN dbo.inventario_grupo g ON g.inv_gru_cod = s.inv_gru_cod
        WHERE s.inv_gru_cod = @categoria AND s.inv_sub_gru_cod = @subcategoria_woo
      `);

      const categories = [];
      if (catResult.recordset.length > 0) {
        const { inv_gru_woo_id, inv_sub_gru_woo_id } = catResult.recordset[0];
        if (inv_gru_woo_id) {
          categories.push({ id: parseInt(inv_gru_woo_id, 10) });
        }
        if (inv_sub_gru_woo_id) {
          categories.push({ id: parseInt(inv_sub_gru_woo_id, 10) });
        }
      }

      const wooAttributes = validAttributes.map(attr => ({
        name: attr.name,
        visible: true,
        variation: true,
        options: attr.options
      }));

      const wooData = {
        name: art_nom,
        type: 'variable',
        sku: art_cod,
        attributes: wooAttributes,
        categories: categories,
        images: imageUrls.map(url => ({ src: url }))
      };

      console.log('Creando producto variable en WooCommerce:', JSON.stringify(wooData, null, 2));

      const wooProduct = await wcApi.post('products', wooData);
      art_woo_id = wooProduct.data.id;

      console.log('Producto variable creado en WooCommerce con ID:', art_woo_id);

      // Actualizar art_woo_id en la base de datos
      await pool.request()
        .input('art_woo_id', sql.Int, art_woo_id)
        .input('artSecWoo', sql.VarChar(30), art_sec.toString())
        .query(`
          UPDATE dbo.articulos
          SET art_woo_id = @art_woo_id
          WHERE art_sec = @artSecWoo
        `);

      // Registrar fotos en producto_fotos
      if (wooProduct.data.images && wooProduct.data.images.length > 0) {
        for (let i = 0; i < wooProduct.data.images.length; i++) {
          const image = wooProduct.data.images[i];
          const photo = new ProductPhoto({
            id: uuidv4(),
            art_sec: art_sec.toString(),
            nombre: `${art_cod}_${i + 1}`,
            url: image.src,
            tipo: images[i] ? images[i].mimetype : 'image/jpeg',
            tamanio: images[i] ? images[i].size : 0,
            fecha_creacion: new Date(),
            woo_photo_id: image.id.toString(),
            es_principal: i === 0,
            posicion: i,
            estado: 'woo'
          });
          await photo.save();
        }
      }

    } catch (wooError) {
      errors.wooCommerce = {
        message: 'Error al crear producto variable en WooCommerce',
        details: wooError.message,
        response: wooError.response?.data
      };
      console.error('Error en WooCommerce:', errors.wooCommerce);
    }

    return {
      success: true,
      data: {
        art_sec: art_sec.toString(),
        art_cod,
        art_nom,
        art_woo_id,
        art_woo_type: 'variable',
        attributes: validAttributes,
        images: imageUrls
      },
      errors: Object.keys(errors).length > 0 ? errors : undefined
    };

  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error("Error en rollback:", rollbackError);
      }
    }
    throw {
      success: false,
      message: 'Error al crear producto variable',
      error: error.message
    };
  }
};

/**
 * Crea una variacion de un producto variable
 * @param {Object} variationData - Datos de la variacion
 * @returns {Promise<Object>}
 */
const createProductVariation = async (variationData) => {
  const {
    parent_art_sec,    // art_sec del producto padre (VARCHAR(30))
    art_nom,
    attributes,        // {Tono: "Rojo Pasion"}
    precio_detal,
    precio_mayor,
    images
  } = variationData;

  const pool = await poolPromise;
  let transaction = null;
  let art_sec = null;
  let art_woo_variation_id = null;
  const errors = {};

  try {
    // Validar que el producto padre exista y sea tipo 'variable'
    const parentResult = await pool.request()
      .input('parent_art_sec', sql.VarChar(30), parent_art_sec)
      .query(`
        SELECT art_sec, art_cod, art_nom, art_woo_id, art_woo_type, inv_sub_gru_cod
        FROM dbo.articulos
        WHERE art_sec = @parent_art_sec
      `);

    if (parentResult.recordset.length === 0) {
      throw new Error('El producto padre no existe');
    }

    const parentProduct = parentResult.recordset[0];

    if (parentProduct.art_woo_type !== 'variable') {
      throw new Error('El producto padre no es de tipo variable');
    }

    if (!parentProduct.art_woo_id) {
      throw new Error('El producto padre no tiene art_woo_id (no fue sincronizado a WooCommerce)');
    }

    // Validar atributos y generar SKU
    const { validateVariationAttributes, generateVariationSKU, skuExists } = require('../utils/variationUtils');

    if (!validateVariationAttributes(attributes)) {
      throw new Error('Atributos de variacion invalidos. Solo se permite "Tono" o "Color"');
    }

    const art_cod = generateVariationSKU(parentProduct.art_cod, attributes);

    if (await skuExists(art_cod)) {
      throw new Error(`El SKU ${art_cod} ya existe en la base de datos`);
    }

    // Iniciar transaccion
    transaction = new sql.Transaction(pool);
    await transaction.begin();
    const request = new sql.Request(transaction);

    // 1. Generar art_sec usando dbo.secuencia (seguro para concurrencia)
    const secResult = await request.query(`
      SELECT sec_num + 1 AS NewArtSec
      FROM dbo.secuencia WITH (UPDLOCK, HOLDLOCK)
      WHERE sec_cod = 'ARTICULOS'
    `);
    art_sec = secResult.recordset[0].NewArtSec;

    await request
      .input('newSecNum', sql.Decimal(18, 0), art_sec)
      .query(`
        UPDATE dbo.secuencia
        SET sec_num = @newSecNum
        WHERE sec_cod = 'ARTICULOS'
      `);

    console.log('Nuevo art_sec para variacion:', art_sec);

    // 2. Insertar variacion en dbo.articulos
    // art_sec=VARCHAR(30), inv_sub_gru_cod=SMALLINT, pre_sec obligatorio
    await request
      .input('art_sec', sql.VarChar(30), art_sec.toString())
      .input('art_cod', sql.VarChar(30), art_cod)
      .input('art_nom', sql.VarChar(100), art_nom)
      .input('parent_art_sec', sql.VarChar(30), parent_art_sec)
      .input('parent_woo_id', sql.Int, parentProduct.art_woo_id)
      .input('attributes_json', sql.NVarChar(sql.MAX), JSON.stringify(attributes))
      .input('subcategoria', sql.SmallInt, parentProduct.inv_sub_gru_cod)
      .query(`
        INSERT INTO dbo.articulos (
          art_sec, art_cod, art_nom, inv_sub_gru_cod, pre_sec,
          art_woo_type, art_sec_padre, art_parent_woo_id,
          art_variation_attributes
        )
        VALUES (
          @art_sec, @art_cod, @art_nom, @subcategoria, '1',
          'variation', @parent_art_sec, @parent_woo_id,
          @attributes_json
        )
      `);

    console.log('Variacion creada en BD con SKU:', art_cod);

    // 3. Insertar precios
    await request
      .input('artSecDetal', sql.VarChar(30), art_sec.toString())
      .input('precio_detal', sql.Decimal(17, 2), precio_detal)
      .query(`
        INSERT INTO dbo.articulosdetalle (art_sec, bod_sec, lis_pre_cod, art_bod_pre)
        VALUES (@artSecDetal, '1', 1, @precio_detal)
      `);

    await request
      .input('artSecMayor', sql.VarChar(30), art_sec.toString())
      .input('precio_mayor', sql.Decimal(17, 2), precio_mayor)
      .query(`
        INSERT INTO dbo.articulosdetalle (art_sec, bod_sec, lis_pre_cod, art_bod_pre)
        VALUES (@artSecMayor, '1', 2, @precio_mayor)
      `);

    // Commit
    await transaction.commit();
    transaction = null;

    // 4. Subir imagenes a Cloudinary si se proporcionan
    let imageUrls = [];
    if (images && images.length > 0) {
      try {
        const uploadPromises = images.map((image, index) => {
          const base64Image = `data:${image.mimetype};base64,${image.data.toString('base64')}`;
          return cloudinary.uploader.upload(base64Image, {
            folder: 'productos_variaciones',
            public_id: `${art_cod}_${index + 1}`
          });
        });

        const uploadResults = await Promise.all(uploadPromises);
        imageUrls = uploadResults.map(result => result.secure_url);

        if (imageUrls.length > 0) {
          await pool.request()
            .input('imageUrl', sql.VarChar(1000), imageUrls[0])
            .input('artSecImage', sql.VarChar(30), art_sec.toString())
            .query(`
              UPDATE dbo.articulos
              SET art_url_img_servi = @imageUrl
              WHERE art_sec = @artSecImage
            `);
        }
      } catch (error) {
        errors.cloudinary = {
          message: 'Error al subir imagenes',
          details: error.message
        };
        console.error('Error al subir imagenes:', error);
      }
    }

    // 5. Crear variacion en WooCommerce
    try {
      // 5a. Recopilar TODAS las opciones de variaciones existentes en BD + la nueva
      const allVariationsResult = await pool.request()
        .input('parent_sec', sql.VarChar(30), parent_art_sec)
        .query(`
          SELECT art_variation_attributes
          FROM dbo.articulos
          WHERE art_sec_padre = @parent_sec AND art_woo_type = 'variation'
        `);

      // Recopilar todas las opciones por nombre de atributo
      const allOptionsByAttr = {};
      for (const row of allVariationsResult.recordset) {
        try {
          const attrs = typeof row.art_variation_attributes === 'string'
            ? JSON.parse(row.art_variation_attributes)
            : row.art_variation_attributes;
          if (attrs) {
            for (const [name, value] of Object.entries(attrs)) {
              if (!allOptionsByAttr[name]) allOptionsByAttr[name] = new Set();
              allOptionsByAttr[name].add(value);
            }
          }
        } catch (e) { /* ignorar JSON inválido */ }
      }

      // Agregar las opciones de la variación actual
      for (const [name, value] of Object.entries(attributes)) {
        if (!allOptionsByAttr[name]) allOptionsByAttr[name] = new Set();
        allOptionsByAttr[name].add(value);
      }

      // Obtener atributos actuales del padre en WooCommerce y actualizar opciones
      const parentWooProduct = await wcApi.get(`products/${parentProduct.art_woo_id}`);
      const currentAttributes = parentWooProduct.data.attributes || [];

      const updatedAttributes = currentAttributes.map(attr => {
        const dbOptions = allOptionsByAttr[attr.name];
        if (dbOptions) {
          // Combinar opciones de WooCommerce + BD (sin duplicados)
          const mergedOptions = [...new Set([...attr.options, ...dbOptions])];
          return { ...attr, options: mergedOptions };
        }
        return attr;
      });

      const hasChanges = updatedAttributes.some((attr, i) =>
        attr.options.length !== currentAttributes[i].options.length
      );

      if (hasChanges) {
        await wcApi.put(`products/${parentProduct.art_woo_id}`, {
          attributes: updatedAttributes
        });
        console.log('Atributos del padre actualizados en WooCommerce:', JSON.stringify(updatedAttributes, null, 2));
      }

      // 5b. Crear la variacion
      const wooAttributes = Object.entries(attributes).map(([name, option]) => ({
        name: name,
        option: option
      }));

      const wooVariationData = {
        sku: art_cod,
        regular_price: precio_detal.toString(),
        manage_stock: true,
        stock_quantity: 0,
        attributes: wooAttributes,
        meta_data: [
          {
            key: "_precio_mayorista",
            value: precio_mayor.toString()
          }
        ],
        image: imageUrls.length > 0 ? { src: imageUrls[0] } : undefined
      };

      console.log('Creando variacion en WooCommerce:', JSON.stringify(wooVariationData, null, 2));

      const wooVariation = await wcApi.post(
        `products/${parentProduct.art_woo_id}/variations`,
        wooVariationData
      );

      art_woo_variation_id = wooVariation.data.id;

      console.log('Variacion creada en WooCommerce con ID:', art_woo_variation_id);

      // Actualizar art_woo_variation_id en la BD
      await pool.request()
        .input('variation_id', sql.Int, art_woo_variation_id)
        .input('artSecWoo', sql.VarChar(30), art_sec.toString())
        .query(`
          UPDATE dbo.articulos
          SET art_woo_variation_id = @variation_id
          WHERE art_sec = @artSecWoo
        `);

      // Registrar imagen en producto_fotos
      if (wooVariation.data.image && imageUrls.length > 0) {
        const photo = new ProductPhoto({
          id: uuidv4(),
          art_sec: art_sec.toString(),
          nombre: `${art_cod}_1`,
          url: wooVariation.data.image.src,
          tipo: images[0] ? images[0].mimetype : 'image/jpeg',
          tamanio: images[0] ? images[0].size : 0,
          fecha_creacion: new Date(),
          woo_photo_id: wooVariation.data.image.id.toString(),
          es_principal: true,
          posicion: 0,
          estado: 'woo'
        });
        await photo.save();
      }

    } catch (wooError) {
      errors.wooCommerce = {
        message: 'Error al crear variacion en WooCommerce',
        details: wooError.message,
        response: wooError.response?.data
      };
      console.error('Error en WooCommerce:', errors.wooCommerce);
    }

    return {
      success: true,
      data: {
        art_sec: art_sec.toString(),
        art_cod,
        art_nom,
        parent_art_sec,
        art_woo_variation_id,
        art_woo_type: 'variation',
        attributes,
        precio_detal,
        precio_mayor,
        images: imageUrls
      },
      errors: Object.keys(errors).length > 0 ? errors : undefined
    };

  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error("Error en rollback:", rollbackError);
      }
    }
    throw {
      success: false,
      message: 'Error al crear variacion',
      error: error.message
    };
  }
};

const syncVariableProductAttributes = async (parent_art_sec) => {
  try {
    const pool = await poolPromise;

    // 1. Verificar que el padre existe y es variable
    const parentResult = await pool.request()
      .input('art_sec', sql.VarChar(30), parent_art_sec)
      .query(`
        SELECT art_sec, art_cod, art_nom, art_woo_id, art_woo_type, art_variable
        FROM dbo.articulos
        WHERE art_sec = @art_sec
      `);

    if (parentResult.recordset.length === 0) {
      throw new Error('Producto padre no encontrado');
    }

    const parent = parentResult.recordset[0];

    if (parent.art_woo_type !== 'variable' || parent.art_variable !== 'S') {
      throw new Error('El producto no es de tipo variable');
    }

    if (!parent.art_woo_id) {
      throw new Error('El producto padre no tiene art_woo_id en WooCommerce');
    }

    // 2. Obtener TODAS las variaciones de la BD
    const variationsResult = await pool.request()
      .input('parent_sec', sql.VarChar(30), parent_art_sec)
      .query(`
        SELECT art_sec, art_cod, art_nom, art_variation_attributes
        FROM dbo.articulos
        WHERE art_sec_padre = @parent_sec AND art_woo_type = 'variation'
      `);

    if (variationsResult.recordset.length === 0) {
      return {
        success: true,
        message: 'No hay variaciones registradas en la BD para sincronizar',
        parent_art_sec,
        variations_count: 0
      };
    }

    // 3. Recopilar todas las opciones por atributo
    const allOptionsByAttr = {};
    for (const row of variationsResult.recordset) {
      try {
        const attrs = typeof row.art_variation_attributes === 'string'
          ? JSON.parse(row.art_variation_attributes)
          : row.art_variation_attributes;
        if (attrs) {
          for (const [name, value] of Object.entries(attrs)) {
            if (!allOptionsByAttr[name]) allOptionsByAttr[name] = new Set();
            allOptionsByAttr[name].add(value);
          }
        }
      } catch (e) { /* ignorar JSON inválido */ }
    }

    // 4. Obtener atributos actuales del padre en WooCommerce
    const parentWooProduct = await wcApi.get(`products/${parent.art_woo_id}`);
    const currentAttributes = parentWooProduct.data.attributes || [];

    // 5. Fusionar opciones de BD con las de WooCommerce
    const updatedAttributes = currentAttributes.map(attr => {
      const dbOptions = allOptionsByAttr[attr.name];
      if (dbOptions) {
        const mergedOptions = [...new Set([...attr.options, ...dbOptions])];
        return { ...attr, options: mergedOptions };
      }
      return attr;
    });

    const hasChanges = updatedAttributes.some((attr, i) =>
      attr.options.length !== currentAttributes[i].options.length
    );

    if (!hasChanges) {
      return {
        success: true,
        message: 'Los atributos ya están sincronizados, no se requieren cambios',
        parent_art_sec,
        art_woo_id: parent.art_woo_id,
        variations_count: variationsResult.recordset.length,
        attributes: updatedAttributes.map(a => ({ name: a.name, options: a.options }))
      };
    }

    // 6. Actualizar atributos en WooCommerce
    await wcApi.put(`products/${parent.art_woo_id}`, {
      attributes: updatedAttributes
    });

    console.log('Atributos sincronizados en WooCommerce para producto:', parent.art_cod, JSON.stringify(updatedAttributes, null, 2));

    return {
      success: true,
      message: 'Atributos sincronizados exitosamente en WooCommerce',
      parent_art_sec,
      art_woo_id: parent.art_woo_id,
      variations_count: variationsResult.recordset.length,
      attributes: updatedAttributes.map(a => ({ name: a.name, options: a.options }))
    };

  } catch (error) {
    throw {
      success: false,
      message: 'Error al sincronizar atributos',
      error: error.message
    };
  }
};

module.exports = { getArticulos, validateArticulo, createArticulo, getArticulo, updateArticulo, getArticuloByArtCod, getNextArticuloCodigo, createVariableProduct, createProductVariation, syncVariableProductAttributes };
