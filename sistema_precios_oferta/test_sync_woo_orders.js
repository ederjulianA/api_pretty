// sistema_precios_oferta/test_sync_woo_orders.js
const { syncWooOrders } = require('../jobs/syncWooOrders.js');

console.log('🚀 Iniciando test de sincronización de pedidos de WooCommerce con promociones...');

const testSyncWooOrders = async () => {
  try {
    console.log('\n🧪 === TEST: SINCRONIZACIÓN DE PEDIDOS WOOCOMMERCE CON PROMOCIONES ===');
    
    // Configurar parámetros de prueba
    const status = 'on-hold'; // Solo pedidos en espera
    const after = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(); // Últimos 7 días
    const before = new Date().toISOString(); // Hasta ahora
    
    console.log('📋 Parámetros de sincronización:');
    console.log('  - Status:', status);
    console.log('  - After:', after);
    console.log('  - Before:', before);
    
    console.log('\n⏳ Iniciando sincronización...');
    const startTime = Date.now();
    
    const messages = await syncWooOrders(status, after, before);
    
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    
    console.log('\n✅ Resultado de sincronización:');
    console.log('⏱️ Duración:', `${duration} segundos`);
    console.log('📝 Mensajes:');
    messages.forEach((message, index) => {
      console.log(`  ${index + 1}. ${message}`);
    });
    
    // Verificar que se procesaron pedidos
    const processedOrders = messages.filter(msg => 
      msg.includes('pedido') || msg.includes('Pedido') || msg.includes('orden')
    );
    
    if (processedOrders.length > 0) {
      console.log('\n🎯 Pedidos procesados:');
      processedOrders.forEach(order => {
        console.log(`  - ${order}`);
      });
    }
    
    // Verificar si hay artículos con promociones
    const promocionMessages = messages.filter(msg => 
      msg.includes('promoción') || msg.includes('Promoción') || msg.includes('oferta')
    );
    
    if (promocionMessages.length > 0) {
      console.log('\n🏷️ Artículos con promociones detectados:');
      promocionMessages.forEach(promo => {
        console.log(`  - ${promo}`);
      });
    }
    
    console.log('\n📊 Resumen:');
    console.log(`  - Total mensajes: ${messages.length}`);
    console.log(`  - Pedidos procesados: ${processedOrders.length}`);
    console.log(`  - Artículos con promociones: ${promocionMessages.length}`);
    console.log(`  - Tiempo total: ${duration} segundos`);
    
    return {
      success: true,
      messages,
      duration,
      processedOrders: processedOrders.length,
      promocionArticles: promocionMessages.length
    };
    
  } catch (error) {
    console.error('❌ Error en test de sincronización:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Ejecutar el test
testSyncWooOrders()
  .then((result) => {
    if (result.success) {
      console.log('\n✅ Test de sincronización completado exitosamente');
      console.log('💡 Verifica en la base de datos que los pedidos sincronizados tengan información de promociones en facturakardes');
    } else {
      console.log('\n❌ Test de sincronización falló:', result.error);
    }
  })
  .catch((error) => {
    console.error('\n❌ Error inesperado:', error.message);
  }); 