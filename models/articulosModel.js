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
const updateWooCommerceProduct = async (art_woo_id, art_nom, art_cod, precio_detal, precio_mayor) => {
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
      price: precio_detal.toString(),
      meta_data: [
        { key: '_precio_mayorista', value: precio_mayor }
      ]
    };
    await api.put(`products/${art_woo_id}`, data);
  } catch (error) {
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
    const art_sec = secResult.recordset[0].NewArtSec;

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
    let imageUrls = [];
    if (articuloData.images && articuloData.images.length > 0) {
      try {
        const uploadPromises = articuloData.images.map(async (image, index) => {
          // Convertir el archivo a base64
          const base64Image = `data:${image.mimetype};base64,${image.data.toString('base64')}`;

          const result = await cloudinary.uploader.upload(base64Image, {
            folder: 'articulos',
            public_id: `${articuloData.art_cod}_${index + 1}`
          });

          return result.secure_url;
        });

        imageUrls = await Promise.all(uploadPromises);

        // Actualizar la base de datos con las URLs de las imágenes
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
        throw new Error('Error al subir las imágenes a Cloudinary');
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

    // Obtener IDs de categorías de WooCommerce
    const catRequest = pool.request(); // Usar un request nuevo, no el de la transacción
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

    // 6. Crear en WooCommerce
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
          value: articuloData.precio_mayor.toString() // Valor como string
        }
      ],
      categories: categories,
      images: imageUrls.map(url => ({ src: url }))
    };

    const wooProduct = await wcApi.post('products', wooData);
    const art_woo_id = wooProduct.data.id;

    // 7. Actualizar el artículo con el ID de WooCommerce
    const updateWooIdQuery = `
      UPDATE dbo.articulos 
      SET art_woo_id = @art_woo_id 
      WHERE art_sec = @artSecWoo
    `;
    await request
      .input('art_woo_id', sql.Int, art_woo_id)
      .input('artSecWoo', sql.Decimal(18, 0), art_sec)
      .query(updateWooIdQuery);

    await transaction.commit();

    return {
      art_sec,
      art_cod: articuloData.art_cod,
      art_nom: articuloData.art_nom,
      categoria: articuloData.categoria,
      subcategoria: articuloData.subcategoria,
      precio_detal: articuloData.precio_detal,
      precio_mayor: articuloData.precio_mayor,
      art_woo_id,
      images: imageUrls
    };
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
