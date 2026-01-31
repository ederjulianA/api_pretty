require('dotenv').config();
const path = require('path');
const fs = require('fs').promises;

// Importar módulos del proyecto principal (rutas relativas desde poc-catalogo-pdf/)
const { sql, poolPromise } = require('../../db');
const articulosModel = require('../../models/articulosModel');
const { getAllCategories } = require('../../models/inventarioGrupoModel');
const ProductPhoto = require('../../models/ProductPhoto');

/**
 * Obtiene la URL de imagen principal de un producto
 * Usa directamente art_url_img_servi (imagen de WooCommerce)
 */
async function obtenerImagenProducto(art_sec, art_url_img_servi) {
  try {
    // Usar directamente art_url_img_servi (imagen de WooCommerce)
    if (art_url_img_servi && art_url_img_servi.trim() !== '') {
      return art_url_img_servi.trim();
    }
    
    // Si no existe art_url_img_servi, intentar desde producto_fotos como fallback
    const pool = await poolPromise;
    const fotoQuery = `
      SELECT TOP 1 url 
      FROM dbo.producto_fotos 
      WHERE art_sec = @art_sec AND es_principal = 1
      ORDER BY posicion ASC
    `;
    const fotoResult = await pool.request()
      .input('art_sec', sql.VarChar(30), art_sec.toString())
      .query(fotoQuery);
    
    if (fotoResult.recordset.length > 0 && fotoResult.recordset[0].url) {
      return fotoResult.recordset[0].url;
    }
    
    // Si tampoco existe, retornar null (se usará placeholder)
    return null;
  } catch (error) {
    console.warn(`⚠️  Error obteniendo imagen para art_sec ${art_sec}:`, error.message);
    // En caso de error, intentar usar art_url_img_servi como fallback
    return art_url_img_servi || null;
  }
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
    esNuevo: false, // Se puede determinar por fecha si está disponible en el futuro
    tieneOferta: producto.tiene_oferta === 'S',
    imagenUrl: null // Se llenará después con obtenerImagenProducto
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
    // Si no existe el archivo, usar valores por defecto
    console.warn('⚠️  No se encontró catalog-config.json, usando valores por defecto');
    return {
      mediosPago: [
        {
          nombre: "Efectivo",
          descripcion: "Pago en efectivo al recibir"
        }
      ],
      condicionesVenta: [
        "Precio mayorista aplica para compras mínimas de $500.000",
        "Todos los precios incluyen IVA",
        "Válido hasta fin de mes o hasta agotar existencias",
        "Stock sujeto a disponibilidad",
        "Envíos a nivel nacional",
        "Tiempo de entrega: 2-5 días hábiles"
      ],
      contacto: {
        telefono: "+57 300 123 4567",
        email: "ventas@tuempresa.com",
        whatsapp: "+573001234567",
        direccion: "Bogotá, Colombia",
        horario: "Lunes a Viernes 8am - 6pm, Sábados 9am - 2pm"
      }
    };
  }
}

/**
 * Obtiene todos los datos necesarios para el catálogo
 * @param {Object} opciones - Opciones de filtrado
 * @param {string} opciones.inv_gru_cod - Filtrar por categoría
 * @param {string} opciones.inv_sub_gru_cod - Filtrar por subcategoría
 * @param {number} opciones.tieneExistencia - null = todos, 1 = con stock, 0 = sin stock
 * @param {number} opciones.limite - Límite de productos a obtener
 */
async function obtenerDatosCatalogo(opciones = {}) {
  const {
    inv_gru_cod = null,
    inv_sub_gru_cod = null,
    tieneExistencia = null,
    limite = null
  } = opciones;
  
  try {
    console.log('📂 Iniciando consulta de datos del catálogo...');
    
    // 1. Obtener categorías
    console.log('   → Consultando categorías...');
    const categoriasResult = await getAllCategories();
    const categorias = categoriasResult.data.map((cat, index) => ({
      id: cat.inv_gru_cod,
      nombre: cat.inv_gru_nom,
      orden: index + 1
    }));
    console.log(`   ✓ ${categorias.length} categorías encontradas`);
    
    // 2. Obtener productos con paginación
    console.log('   → Consultando productos...');
    const productos = [];
    let pageNumber = 1;
    const pageSize = 100; // Consultar en lotes de 100 para evitar sobrecarga
    
    while (true) {
      const productosLote = await articulosModel.getArticulos({
        codigo: null,
        nombre: null,
        inv_gru_cod,
        inv_sub_gru_cod,
        tieneExistencia,
        PageNumber: pageNumber,
        PageSize: pageSize
      });
      
      if (productosLote.length === 0) {
        break;
      }
      
      // Obtener imágenes para cada producto
      for (const producto of productosLote) {
        // Usar directamente art_url_img_servi (imagen de WooCommerce)
        const imagenUrl = producto.art_url_img_servi || null;
        
        const productoTransformado = transformarProducto(producto);
        productoTransformado.imagenUrl = imagenUrl;
        productos.push(productoTransformado);
        
        // Aplicar límite si se especificó
        if (limite && productos.length >= limite) {
          break;
        }
      }
      
      if (limite && productos.length >= limite) {
        break;
      }
      
      if (productosLote.length < pageSize) {
        break;
      }
      
      pageNumber++;
      console.log(`   → Procesados ${productos.length} productos...`);
    }
    
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
  obtenerImagenProducto,
  transformarProducto,
  cargarConfiguracionSecciones,
  testConnection
};
