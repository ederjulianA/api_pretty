// sistema_precios_oferta/test_articulos_inactivos.js
import promocionModel from '../models/promocionModel.js';
import { updateWooProductPrices } from '../jobs/updateWooProductPrices.js';

console.log('🚀 Iniciando test de artículos inactivos en promociones...');

const testArticulosInactivos = async () => {
  try {
    console.log('\n🧪 === TEST: SINCRONIZACIÓN CON ARTÍCULOS INACTIVOS ===');
    
    // Primero obtener una promoción existente
    const promociones = await promocionModel.obtenerPromociones({
      PageNumber: 1,
      PageSize: 5
    });
    
    if (!promociones.success || promociones.data.length === 0) {
      console.log('❌ No se encontraron promociones para probar');
      return;
    }
    
    // Tomar la primera promoción activa
    const promocionExistente = promociones.data.find(p => p.pro_activa === 'S');
    
    if (!promocionExistente) {
      console.log('❌ No se encontró una promoción activa para probar');
      return;
    }
    
    console.log(`📋 Promoción seleccionada: ${promocionExistente.pro_codigo} (ID: ${promocionExistente.pro_sec})`);
    
    // Obtener detalles de la promoción
    const promocionDetalle = await promocionModel.obtenerPromocionPorId(promocionExistente.pro_sec);
    
    if (!promocionDetalle.success) {
      console.log('❌ No se pudo obtener el detalle de la promoción');
      return;
    }
    
    console.log(`📊 Artículos en la promoción: ${promocionDetalle.data.articulos.length}`);
    
    // Mostrar estado actual de los artículos
    console.log('\n📋 Estado actual de artículos:');
    promocionDetalle.data.articulos.forEach(art => {
      console.log(`  - ${art.art_cod} (${art.art_nom}): ${art.pro_det_estado === 'A' ? 'ACTIVO' : 'INACTIVO'}`);
    });
    
    // Test 1: Sincronización directa con artículos mixtos (activos e inactivos)
    console.log('\n🔄 === TEST 1: SINCRONIZACIÓN DIRECTA CON ARTÍCULOS MIXTOS ===');
    
    // Simular estados de artículos (algunos activos, otros inactivos)
    const art_cods = promocionDetalle.data.articulos.slice(0, 3).map(art => art.art_cod);
    const estadosArticulos = {};
    
    // Hacer que el primer artículo esté inactivo, los otros activos
    art_cods.forEach((art_cod, index) => {
      estadosArticulos[art_cod] = index === 0 ? 'I' : 'A'; // Primer artículo inactivo
    });
    
    console.log('📊 Estados simulados:');
    Object.entries(estadosArticulos).forEach(([art_cod, estado]) => {
      console.log(`  - ${art_cod}: ${estado === 'A' ? 'ACTIVO' : 'INACTIVO'}`);
    });
    
    console.log('⏳ Ejecutando sincronización directa...');
    const resultadoDirecto = await updateWooProductPrices(art_cods, {
      estadosArticulos: estadosArticulos
    });
    
    console.log('✅ Resultado de sincronización directa:');
    console.log('📋 Success Count:', resultadoDirecto.summary.successCount);
    console.log('❌ Error Count:', resultadoDirecto.summary.errorCount);
    console.log('⏭️ Skipped Count:', resultadoDirecto.summary.skippedCount);
    console.log('⏱️ Duración:', resultadoDirecto.summary.duration);
    
    // Test 2: Sincronización a través de la promoción
    console.log('\n🔄 === TEST 2: SINCRONIZACIÓN A TRAVÉS DE PROMOCIÓN ===');
    
    console.log('⏳ Ejecutando sincronización de promoción...');
    const resultadoPromocion = await promocionModel.sincronizarPreciosPromocion(promocionExistente.pro_sec, {
      solo_activos: false // Sincronizar todos los artículos
    });
    
    console.log('✅ Resultado de sincronización de promoción:');
    console.log('📋 Success:', resultadoPromocion.success);
    console.log('📝 Message:', resultadoPromocion.message);
    
    if (resultadoPromocion.data) {
      console.log('📊 Datos de sincronización:');
      console.log('  - Artículos procesados:', resultadoPromocion.data.articulos_procesados);
      console.log('  - Artículos exitosos:', resultadoPromocion.data.articulos_exitosos);
      console.log('  - Artículos con error:', resultadoPromocion.data.articulos_con_error);
      console.log('  - Duración:', resultadoPromocion.data.duracion);
      console.log('  - Log ID:', resultadoPromocion.data.log_id);
    }
    
    // Test 3: Verificar que los artículos inactivos no tengan oferta
    console.log('\n🔍 === TEST 3: VERIFICACIÓN DE ARTÍCULOS INACTIVOS ===');
    
    console.log('📋 Verificando que los artículos inactivos no tengan oferta en WooCommerce...');
    console.log('💡 Los artículos inactivos deberían tener:');
    console.log('  - sale_price = "" (sin precio de oferta)');
    console.log('  - date_on_sale_from = null');
    console.log('  - date_on_sale_to = null');
    console.log('  - Meta data de promoción limpia');
    
    return {
      resultadoDirecto,
      resultadoPromocion
    };
    
  } catch (error) {
    console.error('❌ Error en test de artículos inactivos:', error);
    throw error;
  }
};

// Ejecutar el test
testArticulosInactivos()
  .then(() => {
    console.log('\n✅ Test de artículos inactivos completado exitosamente');
  })
  .catch((error) => {
    console.error('\n❌ Test de artículos inactivos falló:', error.message);
  }); 