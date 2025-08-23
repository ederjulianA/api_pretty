// sistema_precios_oferta/test_sincronizacion_simple.js
import { updateWooProductPrices } from '../jobs/updateWooProductPrices.js';

console.log('🚀 Iniciando test simple de sincronización...');

// Test directo de la función
const testSincronizacionDirecta = async () => {
  try {
    console.log('📋 Probando sincronización con artículos: 4516, 4517, 4518');
    
    const art_cods = ['4516', '4517', '4518'];
    
    console.log('⏳ Ejecutando updateWooProductPrices...');
    const resultado = await updateWooProductPrices(art_cods);
    
    console.log('✅ Resultado obtenido:');
    console.log('📊 Summary:', resultado.summary);
    console.log('📝 Messages:', resultado.messages.slice(0, 5)); // Solo los primeros 5 mensajes
    
    if (resultado.summary.errorCount === 0) {
      console.log('🎉 ¡Sincronización exitosa!');
    } else {
      console.log('⚠️ Sincronización completada con errores');
    }
    
  } catch (error) {
    console.error('❌ Error en sincronización:', error);
  }
};

// Ejecutar el test
testSincronizacionDirecta(); 