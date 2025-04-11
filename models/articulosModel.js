// models/articulosModel.js
const { sql, poolPromise } = require('../db');
const WooCommerceRestApi = require("@woocommerce/woocommerce-rest-api").default;

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
const updateWooCommerceProduct = async (art_woo_id, art_nom, art_cod, precio_detal, precio_mayor , imagenes = []) => {
  try {
    const api = new WooCommerceRestApi({
      url: process.env.WC_URL,
      consumerKey: process.env.WC_CONSUMER_KEY,
      consumerSecret: process.env.WC_CONSUMER_SECRET,
      version: "wc/v3"
    });
    const data = {
      name: art_nom,
      sku: art_cod,
      price: precio_detal.toString(), // Enviar como cadena
      meta_data: [
        { key: '_precio_mayorista', value: precio_mayor }
      ]
    };

        // Agregar imágenes si están disponibles
        if (imagenes && imagenes.length > 0) {
          const wooImages = imagenes.map((imagen, index) => {
            if (typeof imagen === 'string' && (imagen.startsWith('http://') || imagen.startsWith('https://'))) {
              return { src: imagen, position: index };
            } else if (typeof imagen === 'object' && imagen.src) {
              return {
                src: imagen.src,
                alt: imagen.alt || `${art_nom} - Imagen ${index + 1}`,
                position: index
              };
            } else {
              console.warn(`Formato de imagen no reconocido en posición ${index} para actualización:`, imagen);
              return null;
            }
          }).filter(img => img !== null);
    
          if (wooImages.length > 0) {
            data.images = wooImages;
            console.log(`Actualizando ${wooImages.length} imágenes para el producto ${art_woo_id}`);
          }
        }

    const response = await api.put(`products/${art_woo_id}`, data);
        // Si hay imágenes en la respuesta y necesitamos actualizar la URL local
    if (response.data.images && response.data.images.length > 0) {
      const imagenPrincipalUrl = response.data.images[0].src;
      const pool = await poolPromise;
      await pool.request()
        .input('art_woo_id', sql.VarChar(50), String(art_woo_id))
        .input('art_url_img_servi', sql.VarChar(500), imagenPrincipalUrl)
        .query(`UPDATE dbo.articulos 
                SET art_url_img_servi = @art_url_img_servi
                WHERE art_woo_id = @art_woo_id`);
      console.log(`URL de imagen principal actualizada para producto con ID ${art_woo_id}`);
    }
  } catch (error) {
    
    // Aquí podrías implementar lógica de reintento o notificar al administrador
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

const createArticulo = async ({ art_cod, art_nom, categoria, subcategoria, precio_detal, precio_mayor, imagenes = []   }) => {
  let transaction;
  let NewArtSec;

  try {
    const pool = await poolPromise;
    transaction = new sql.Transaction(pool);
    await transaction.begin();
    
    const request = new sql.Request(transaction);
    
    // 1. Obtener consecutivo
    const seqQuery = `
      SELECT sec_num + 1 AS NewArtSec
      FROM dbo.secuencia WITH (UPDLOCK, HOLDLOCK)
      WHERE sec_cod = 'ARTICULOS'
    `;
    const seqResult = await request.query(seqQuery);
    if (!seqResult.recordset || seqResult.recordset.length === 0) {
      throw new Error("No se encontró la secuencia para 'ARTICULOS'.");
    }
    NewArtSec = seqResult.recordset[0].NewArtSec; 
    
    // 2. Actualizar secuencia
    await request
      .input('sec_cod', sql.VarChar(50), 'ARTICULOS')
      .query("UPDATE dbo.secuencia SET sec_num = sec_num + 1 WHERE sec_cod = @sec_cod");
    
    // 3. Insertar artículo local (sin status/message aún)
    const insertArticuloQuery = `
      INSERT INTO dbo.articulos (art_sec, art_cod, art_nom, inv_sub_gru_cod, pre_sec) 
      VALUES (@NewArtSec, @art_cod, @art_nom, @subcategoria, '1') 
    `;
    await request
      .input('NewArtSec', sql.Decimal(18, 0), NewArtSec)
      .input('art_cod', sql.VarChar(50), art_cod)
      .input('art_nom', sql.VarChar(250), art_nom)
      .input('subcategoria', sql.VarChar(50), subcategoria) // Asumiendo que subcategoria es el código
      .query(insertArticuloQuery);
    
    // 4. Insertar precio detal
    const insertDetalle1Query = `
      INSERT INTO dbo.articulosdetalle (art_sec, bod_sec, lis_pre_cod, art_bod_pre)
      VALUES (@NewArtSec, '1', 1, @precio_detal)
    `;
    await request
      .input('precio_detal', sql.Decimal(17, 2), precio_detal)
      .query(insertDetalle1Query);
    
    // 5. Insertar precio mayor
    const insertDetalle2Query = `
      INSERT INTO dbo.articulosdetalle (art_sec, bod_sec, lis_pre_cod, art_bod_pre)
      VALUES (@NewArtSec, '1', 2, @precio_mayor)
    `;
    await request
      .input('precio_mayor', sql.Decimal(17, 2), precio_mayor)
      .query(insertDetalle2Query);
    
    await transaction.commit(); // Commit local exitoso

    // --- Inicio: Lógica de WooCommerce Asíncrona con Estado ---
    setImmediate(async () => {
      let currentWooStatus = 'pending'; // Estado inicial para este intento
      let currentWooMessage = null;

      try {
        const pool = await poolPromise; // Pool post-commit

        // 6. Actualizar estado a 'pending' en BD
        const statusPendingRequest = pool.request();
        await statusPendingRequest
          .input('art_sec', sql.Decimal(18, 0), NewArtSec)
          .input('status', sql.VarChar(10), 'pending')
          .query(`UPDATE dbo.articulos 
                  SET art_woo_sync_status = @status, art_woo_sync_message = NULL 
                  WHERE art_sec = @art_sec`);
        console.log(`[Articulo ${NewArtSec}] Estado de Sync actualizado a 'pending'.`);

        // 7. Obtener IDs de categoría WC
        const catRequest = pool.request(); // Usar un request nuevo, no el de la transacción
        catRequest.input('categoria', sql.VarChar(50), categoria);
        catRequest.input('subcategoria', sql.VarChar(50), subcategoria);
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
        } else {
           console.warn(`No se encontraron IDs de WooCommerce para categoría ${categoria} y subcategoría ${subcategoria}. El producto se creará sin categorías.`);
        }

        // 8. Preparar datos para WooCommerce
        const wooProductData = {
          sku: art_cod,
          name: art_nom,
          regular_price: String(precio_detal), // Precio como string
          categories: categories,
          manage_stock: true, // <<< Asegura que WC gestione el inventario
          // Puedes establecer un stock inicial si lo deseas, por ejemplo:
          // stock_quantity: 0, 
          meta_data: [
            {
              key: "_precio_mayorista",
              value: String(precio_mayor) // Valor como string
            }
          ],
          // Otros campos opcionales: status: 'publish' (para publicarlo directamente)
          // status: 'publish', 
        };

             // Agregar imágenes si están disponibles
             if (imagenes && imagenes.length > 0) {
              // Preparar el formato de imágenes para WooCommerce
              const wooImages = imagenes.map((imagen, index) => {
                // Si la imagen es una URL completa
                if (typeof imagen === 'string' && (imagen.startsWith('http://') || imagen.startsWith('https://'))) {
                  return { src: imagen, position: index };
                }
                // Si la imagen es un objeto con propiedades específicas (por ejemplo, { src: 'url', alt: 'texto' })
                else if (typeof imagen === 'object' && imagen.src) {
                  return {
                    src: imagen.src,
                    alt: imagen.alt || `${art_nom} - Imagen ${index + 1}`,
                    position: index
                  };
                }
                // Si la imagen es otro formato, registrar advertencia y saltarla
                else {
                  console.warn(`[Articulo ${NewArtSec}] Formato de imagen no reconocido en posición ${index}:`, imagen);
                  return null;
                }
              }).filter(img => img !== null); // Eliminar entradas nulas
    
              if (wooImages.length > 0) {
                wooProductData.images = wooImages;
                console.log(`[Articulo ${NewArtSec}] Agregando ${wooImages.length} imágenes al producto`);
              }
            }

        // 9. Crear producto en WooCommerce
        console.log(`[Articulo ${NewArtSec}] Enviando datos a WooCommerce:`, JSON.stringify(wooProductData, null, 2));
        const response = await wcApi.post("products", wooProductData);
        const wooProductId = response.data.id; // Obtener el ID del producto creado
        console.log(`[Articulo ${NewArtSec}] Producto creado en WooCommerce con ID: ${wooProductId}`);
        currentWooStatus = 'success'; // Marcar como éxito

        // 10. Actualizar art_woo_id y estado 'success' en BD local
        if (wooProductId) {
          const updateSuccessRequest = pool.request();
          await updateSuccessRequest
            .input('art_woo_id', sql.VarChar(50), String(wooProductId))
            .input('status', sql.VarChar(10), 'success')
            .input('art_sec', sql.Decimal(18, 0), NewArtSec)
            .input('art_url_img_servi', sql.VarChar(500), imagenPrincipalUrl) // Guardar URL de imagen principal
            .query(`UPDATE dbo.articulos 
                    SET art_woo_id = @art_woo_id, 
                        art_woo_sync_status = @status, 
                        art_woo_sync_message = NULL,
                        art_url_img_servi = @art_url_img_servi
                    WHERE art_sec = @art_sec`);
          console.log(`[Articulo ${NewArtSec}] art_woo_id, estado 'success' y URL de imagen actualizados en BD.`);
        } else {
          // Caso raro: WooCommerce no devolvió ID pero no lanzó error
          currentWooStatus = 'error';
          currentWooMessage = 'WooCommerce no devolvió un ID de producto tras la creación.';
          console.error(`[Articulo ${NewArtSec}] ${currentWooMessage}`);
          // Se actualizará el estado a error en el bloque finally
        }

      } catch (wooError) {
        currentWooStatus = 'error'; // Marcar como error
        // Intentar obtener el mensaje de error específico de la respuesta de WC
        currentWooMessage = wooError.response?.data?.message || wooError.message || 'Error desconocido durante la sincronización con WooCommerce.';
        console.error(`[Articulo ${NewArtSec}] Error durante la integración con WooCommerce: ${currentWooMessage}`);
        // El estado y mensaje se actualizarán en el bloque finally
      } finally {
        // 11. Asegurar la actualización final del estado (éxito o error)
        if (currentWooStatus === 'error') {
          try {
            const pool = await poolPromise;
            const updateErrorRequest = pool.request();
            await updateErrorRequest
              .input('status', sql.VarChar(10), currentWooStatus)
              .input('message', sql.VarChar(sql.MAX), currentWooMessage.substring(0, 4000)) // Limitar longitud por si acaso
              .input('art_sec', sql.Decimal(18, 0), NewArtSec)
              .query(`UPDATE dbo.articulos 
                      SET art_woo_sync_status = @status, art_woo_sync_message = @message 
                      WHERE art_sec = @art_sec`);
            console.log(`[Articulo ${NewArtSec}] Estado de Sync actualizado a '${currentWooStatus}'.`);
          } catch (updateDbError) {
            console.error(`[Articulo ${NewArtSec}] Fallo CRÍTICO al intentar actualizar estado de error en BD: ${updateDbError.message}`);
            // Aquí podrías loguear a un sistema de monitoreo externo
          }
        }
        // Si el estado es 'success', ya se actualizó en el bloque try.
        // Si el estado es 'pending', significa que algo falló antes de intentar la sync (poco probable aquí), se quedaría en 'pending'.
      }
    });
    // --- Fin: Lógica de WooCommerce ---

    return { art_sec: NewArtSec, message: "Artículo creado localmente. Sincronización con WooCommerce iniciada." };

  } catch (error) {
    if (transaction && transaction._aborted === false && transaction._committed === false) { // Verificar si la transacción está activa
      try {
        await transaction.rollback();
        console.log("Rollback realizado.");
      } catch (rollbackError) {
        console.error("Error en rollback:", rollbackError);
      }
    }
    console.error("Error en createArticulo (transacción principal):", error);
    throw error;
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
    console.log(result.recordset[0]);
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

const updateArticulo = async ({ id_articulo, art_cod, art_nom, categoria, subcategoria, art_woo_id, precio_detal, precio_mayor }) => {
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
          art_woo_id = @art_woo_id
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

    // Actualización asíncrona en WooCommerce
    setImmediate(() => {
      updateWooCommerceProduct(art_woo_id, art_nom, art_cod, precio_detal, precio_mayor);
    });

    return { message: "Artículo actualizado exitosamente." };
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

module.exports = { getArticulos, validateArticulo, createArticulo, getArticulo, updateArticulo, getArticuloByArtCod };
