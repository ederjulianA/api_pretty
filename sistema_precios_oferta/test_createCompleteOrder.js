// Script de prueba para verificar createCompleteOrder con nuevos campos de precios y ofertas
const axios = require('axios');

const API_BASE_URL = 'http://localhost:3000/api'; // Ajustar según tu configuración

async function testCreateCompleteOrder() {
  try {
    console.log('🧪 Iniciando prueba de createCompleteOrder con campos de precios y ofertas...\n');

    // Datos de prueba para crear una orden
    const orderData = {
      nit_sec: "123456789", // Ajustar con un NIT válido de tu base de datos
      fac_usu_cod_cre: "TEST_USER",
      fac_tip_cod: "COT", // Cotización para pruebas
      detalles: [
        {
          art_sec: "ART001", // Ajustar con un artículo válido que tenga oferta activa
          kar_nat: "S",
          kar_uni: 2,
          kar_pre_pub: 15000, // Este precio será reemplazado por el precio con oferta
          kar_kar_sec_ori: null,
          kar_fac_sec_ori: null
        },
        {
          art_sec: "ART002", // Ajustar con un artículo válido sin oferta
          kar_nat: "S", 
          kar_uni: 1,
          kar_pre_pub: 25000,
          kar_kar_sec_ori: null,
          kar_fac_sec_ori: null
        }
      ],
      descuento: 0,
      lis_pre_cod: 1, // Lista de precios detal
      fac_nro_woo: null,
      fac_obs: "Prueba de creación con campos de precios y ofertas",
      fac_fec: new Date().toISOString().split('T')[0] // Fecha actual
    };

    console.log('📋 Datos de la orden a crear:');
    console.log(JSON.stringify(orderData, null, 2));
    console.log('\n');

    // 1. Crear la orden
    console.log('1️⃣ Creando orden...');
    const createResponse = await axios.post(`${API_BASE_URL}/order`, orderData);
    
    if (createResponse.status === 200) {
      const { fac_sec, fac_nro } = createResponse.data;
      console.log(`✅ Orden creada exitosamente:`);
      console.log(`   - fac_sec: ${fac_sec}`);
      console.log(`   - fac_nro: ${fac_nro}`);
      console.log('\n');

      // 2. Consultar la orden creada para verificar los campos
      console.log('2️⃣ Consultando la orden creada...');
      const getResponse = await axios.get(`${API_BASE_URL}/order/${fac_nro}`);
      
      if (getResponse.status === 200) {
        const order = getResponse.data;
        console.log('✅ Orden consultada exitosamente');
        console.log('\n📊 Información del encabezado:');
        console.log(`   - Número: ${order.header.fac_nro}`);
        console.log(`   - Fecha: ${order.header.fac_fec}`);
        console.log(`   - Cliente: ${order.header.nit_nom}`);
        console.log(`   - Estado: ${order.header.fac_est_fac}`);
        
        console.log('\n📋 Detalles de la orden:');
        order.details.forEach((detail, index) => {
          console.log(`\n   Artículo ${index + 1}:`);
          console.log(`   - Código: ${detail.art_cod}`);
          console.log(`   - Nombre: ${detail.art_nom}`);
          console.log(`   - Cantidad: ${detail.kar_uni}`);
          console.log(`   - Precio unitario: $${detail.kar_pre_pub}`);
          console.log(`   - Total: $${detail.kar_total}`);
          
          // Verificar campos de precios y ofertas
          console.log(`   - Precio detal original: $${detail.precio_detal_original}`);
          console.log(`   - Precio mayor original: $${detail.precio_mayor_original}`);
          console.log(`   - Tiene oferta: ${detail.tiene_oferta}`);
          
          if (detail.tiene_oferta === 'S') {
            console.log(`   - Precio de oferta: $${detail.precio_oferta}`);
            console.log(`   - Descuento porcentual: ${detail.descuento_porcentaje}%`);
            console.log(`   - Código promoción: ${detail.codigo_promocion}`);
            console.log(`   - Descripción promoción: ${detail.descripcion_promocion}`);
          } else {
            console.log(`   - Sin oferta activa`);
          }
        });

        // 3. Verificar en la base de datos directamente
        console.log('\n3️⃣ Verificando campos en facturakardes...');
        await verifyDatabaseFields(fac_sec);

      } else {
        console.log('❌ Error al consultar la orden:', getResponse.status, getResponse.statusText);
      }

    } else {
      console.log('❌ Error al crear la orden:', createResponse.status, createResponse.statusText);
      if (createResponse.data) {
        console.log('Detalles del error:', createResponse.data);
      }
    }

  } catch (error) {
    console.error('❌ Error en la prueba:', error.message);
    if (error.response) {
      console.error('Respuesta del servidor:', error.response.data);
    }
  }
}

async function verifyDatabaseFields(fac_sec) {
  try {
    // Esta función requeriría acceso directo a la base de datos
    // Por ahora, solo mostramos un mensaje informativo
    console.log(`   - Verificando campos en facturakardes para fac_sec: ${fac_sec}`);
    console.log(`   - Campos a verificar:`);
    console.log(`     * kar_pre_pub_detal`);
    console.log(`     * kar_pre_pub_mayor`);
    console.log(`     * kar_tiene_oferta`);
    console.log(`     * kar_precio_oferta`);
    console.log(`     * kar_descuento_porcentaje`);
    console.log(`     * kar_codigo_promocion`);
    console.log(`     * kar_descripcion_promocion`);
    
    console.log('\n💡 Para verificar directamente en la base de datos, ejecuta:');
    console.log(`   SELECT kar_pre_pub_detal, kar_pre_pub_mayor, kar_tiene_oferta,`);
    console.log(`          kar_precio_oferta, kar_descuento_porcentaje,`);
    console.log(`          kar_codigo_promocion, kar_descripcion_promocion`);
    console.log(`   FROM dbo.facturakardes WHERE fac_sec = ${fac_sec}`);
    
  } catch (error) {
    console.error('❌ Error al verificar campos en BD:', error.message);
  }
}

// Función para probar con diferentes escenarios
async function testDifferentScenarios() {
  console.log('\n🔄 Probando diferentes escenarios...\n');

  // Escenario 1: Orden con fecha futura (sin ofertas)
  console.log('📅 Escenario 1: Orden con fecha futura (sin ofertas)');
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 30); // 30 días en el futuro
  
  const futureOrderData = {
    nit_sec: "123456789",
    fac_usu_cod_cre: "TEST_USER",
    fac_tip_cod: "COT",
    detalles: [
      {
        art_sec: "ART001",
        kar_nat: "S",
        kar_uni: 1,
        kar_pre_pub: 15000,
        kar_kar_sec_ori: null,
        kar_fac_sec_ori: null
      }
    ],
    descuento: 0,
    lis_pre_cod: 1,
    fac_nro_woo: null,
    fac_obs: "Prueba con fecha futura",
    fac_fec: futureDate.toISOString().split('T')[0]
  };

  try {
    const response = await axios.post(`${API_BASE_URL}/order`, futureOrderData);
    console.log(`✅ Orden con fecha futura creada: ${response.data.fac_nro}`);
  } catch (error) {
    console.log(`❌ Error en escenario 1: ${error.message}`);
  }

  console.log('\n✅ Pruebas completadas!');
}

// Ejecutar las pruebas
async function runTests() {
  console.log('🚀 Iniciando pruebas de createCompleteOrder con campos de precios y ofertas\n');
  
  await testCreateCompleteOrder();
  await testDifferentScenarios();
  
  console.log('\n🎉 Todas las pruebas han sido ejecutadas!');
}

// Ejecutar si se llama directamente
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = {
  testCreateCompleteOrder,
  testDifferentScenarios,
  runTests
}; 