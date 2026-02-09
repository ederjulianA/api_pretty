const path = require('path');
const fs = require('fs').promises;

// Cargar .env desde el directorio raíz del proyecto (api_pretty/)
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// Importar solo la conexión a base de datos (sin WooCommerce)
const { sql, poolPromise } = require('../../db');

/**
 * Obtiene todos los productos con existencias desde la base de datos
 * Consulta directa sin usar articulosModel (que carga WooCommerce)
 */
async function obtenerProductos(opciones = {}) {
  const {
    inv_gru_cod = null,
    inv_sub_gru_cod = null,
    tieneExistencia = null,
    limite = null
  } = opciones;

  const pool = await poolPromise;

  // Consulta basada en la estructura real del modelo articulosModel
  let query = `
    SELECT
      a.art_sec,
      a.art_cod,
      a.art_nom,
      a.art_url_img_servi,
      ig.inv_gru_cod,
      ISNULL(ig.inv_gru_nom, 'Sin categoría') as categoria,
      isg.inv_sub_gru_cod,
      ISNULL(isg.inv_sub_gru_nom, '') as sub_categoria,
      ISNULL(e.existencia, 0) as existencia,
      ISNULL(ad1.art_bod_pre, 0) as precio_detal,
      ISNULL(ad2.art_bod_pre, 0) as precio_mayor
    FROM dbo.articulos a
    INNER JOIN dbo.inventario_subgrupo isg ON a.inv_sub_gru_cod = isg.inv_sub_gru_cod
    INNER JOIN dbo.inventario_grupo ig ON isg.inv_gru_cod = ig.inv_gru_cod
    LEFT JOIN dbo.articulosdetalle ad1 ON a.art_sec = ad1.art_sec AND ad1.lis_pre_cod = 1
    LEFT JOIN dbo.articulosdetalle ad2 ON a.art_sec = ad2.art_sec AND ad2.lis_pre_cod = 2
    LEFT JOIN dbo.vwExistencias e ON a.art_sec = e.art_sec
    WHERE 1=1
  `;

  const request = pool.request();

  if (inv_gru_cod) {
    query += ` AND ig.inv_gru_cod = @inv_gru_cod`;
    request.input('inv_gru_cod', sql.VarChar(10), inv_gru_cod);
  }

  if (inv_sub_gru_cod) {
    query += ` AND isg.inv_sub_gru_cod = @inv_sub_gru_cod`;
    request.input('inv_sub_gru_cod', sql.VarChar(10), inv_sub_gru_cod);
  }

  query += `
    ORDER BY ig.inv_gru_orden ASC, a.art_nom
  `;

  const result = await request.query(query);
  let productos = result.recordset;

  // Filtrar por existencia en JavaScript si se especificó
  if (tieneExistencia === 1) {
    productos = productos.filter(p => parseFloat(p.existencia) > 0);
  } else if (tieneExistencia === 0) {
    productos = productos.filter(p => parseFloat(p.existencia) <= 0);
  }

  // Aplicar límite si se especificó
  if (limite && productos.length > limite) {
    productos = productos.slice(0, limite);
  }

  return productos;
}

/**
 * Obtiene todas las categorías ordenadas por inv_gru_orden
 */
async function obtenerCategorias() {
  const pool = await poolPromise;
  const result = await pool.request().query(`
    SELECT inv_gru_cod, inv_gru_nom, inv_gru_orden
    FROM dbo.inventario_grupo
    WHERE inv_gru_est = 'A'
    ORDER BY inv_gru_orden ASC
  `);
  return result.recordset;
}

/**
 * Transforma un producto de la BD al formato del template
 */
function transformarProducto(producto) {
  return {
    id: producto.art_sec.toString(),
    sku: producto.art_cod,
    nombre: producto.art_nom,
    categoria: producto.categoria || 'Sin categoría',
    subcategoria: producto.sub_categoria || '',
    categoriaId: producto.inv_gru_cod || '',
    precioDetalle: parseFloat(producto.precio_detal) || 0,
    precioMayor: parseFloat(producto.precio_mayor) || 0,
    stock: parseFloat(producto.existencia) || 0,
    esNuevo: false,
    tieneOferta: false,
    imagenUrl: producto.art_url_img_servi || null
  };
}

/**
 * Carga la configuración de secciones informativas
 */
async function cargarConfiguracionSecciones() {
  const configPath = path.join(__dirname, '../config/catalog-config.json');

  try {
    const configData = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configData);
    return config.secciones || {
      mediosPago: [],
      condicionesVenta: [],
      contacto: {}
    };
  } catch (error) {
    console.warn('⚠️  No se encontró catalog-config.json, usando valores por defecto');
    return {
      mediosPago: [
        { nombre: "Efectivo", descripcion: "Pago en efectivo al recibir" }
      ],
      condicionesVenta: [
        "Precio mayorista aplica para compras mínimas de $500.000",
        "Todos los precios incluyen IVA",
        "Válido hasta fin de mes o hasta agotar existencias"
      ],
      contacto: {
        telefono: "+57 300 123 4567",
        email: "ventas@tuempresa.com",
        whatsapp: "+573001234567"
      }
    };
  }
}

/**
 * Obtiene todos los datos necesarios para el catálogo
 * Versión simplificada que NO carga WooCommerce
 */
async function obtenerDatosCatalogo(opciones = {}) {
  try {
    console.log('📂 Iniciando consulta de datos del catálogo...');

    // 1. Obtener categorías
    console.log('   → Consultando categorías...');
    const categoriasRaw = await obtenerCategorias();
    const categorias = categoriasRaw.map(cat => ({
      id: cat.inv_gru_cod,
      nombre: cat.inv_gru_nom,
      orden: cat.inv_gru_orden || 0
    }));
    console.log(`   ✓ ${categorias.length} categorías encontradas`);

    // 2. Obtener productos
    console.log('   → Consultando productos...');
    const productosRaw = await obtenerProductos(opciones);
    const productos = productosRaw.map(transformarProducto);
    console.log(`   ✓ ${productos.length} productos obtenidos`);

    // 3. Cargar configuración de secciones
    console.log('   → Cargando configuración de secciones...');
    const secciones = await cargarConfiguracionSecciones();
    console.log('   ✓ Configuración cargada');

    // 4. Preparar metadata
    const metadata = {
      titulo: process.env.CATALOG_TITLE || "Catálogo de Productos",
      fecha: new Date().toLocaleDateString('es-CO', {
        year: 'numeric',
        month: 'long'
      }),
      totalProductos: productos.length,
      empresa: {
        nombre: process.env.CATALOG_COMPANY_NAME || "Tu Empresa",
        logo: path.join(__dirname, '../assets/logo.png')
      }
    };

    console.log('✓ Datos del catálogo obtenidos exitosamente');

    return {
      metadata,
      categorias,
      productos,
      secciones
    };

  } catch (error) {
    console.error('❌ Error obteniendo datos del catálogo:', error);
    throw error;
  }
}

/**
 * Función de prueba para verificar conexión a BD
 */
async function testConnection() {
  try {
    console.log('🔌 Probando conexión a SQL Server...');
    const pool = await poolPromise;
    const result = await pool.request().query('SELECT 1 AS test');
    console.log('✓ Conexión exitosa a SQL Server');
    return true;
  } catch (error) {
    console.error('❌ Error de conexión a SQL Server:', error.message);
    return false;
  }
}

module.exports = {
  obtenerDatosCatalogo,
  obtenerProductos,
  obtenerCategorias,
  transformarProducto,
  cargarConfiguracionSecciones,
  testConnection
};
