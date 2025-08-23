// sistema_precios_oferta/test_sincronizacion_precios.js
import fetch from 'node-fetch';

const API_BASE_URL = 'http://localhost:3000/api';

// Función para hacer peticiones HTTP
const makeRequest = async (endpoint, options = {}) => {
  try {
    const url = `${API_BASE_URL}${endpoint}`;
    console.log(`🌐 Haciendo petición a: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    });
    
    const data = await response.json();
    
    console.log(`📊 Status: ${response.status}`);
    console.log(`📋 Response:`, JSON.stringify(data, null, 2));
    
    return { status: response.status, data };
  } catch (error) {
    console.error(`❌ Error en petición:`, error.message);
    throw error;
  }
};

// Test 1: Sincronización directa con códigos de artículos
const testSincronizacionDirecta = async () => {
  console.log('\n🧪 === TEST 1: SINCRONIZACIÓN DIRECTA ===');
  
  const art_cods = ['4516', '4517', '4518']; // Códigos de artículos para probar
  
  try {
    const resultado = await makeRequest('/promociones/test/sincronizacion-directa', {
      method: 'POST',
      body: JSON.stringify({ art_cods })
    });
    
    if (resultado.status === 200 && resultado.data.success) {
      console.log('✅ Test de sincronización directa EXITOSO');
      console.log(`📈 Artículos procesados: ${resultado.data.data.summary.totalItems}`);
      console.log(`✅ Exitosos: ${resultado.data.data.summary.successCount}`);
      console.log(`❌ Errores: ${resultado.data.data.summary.errorCount}`);
      console.log(`⏱️ Duración: ${resultado.data.data.summary.duration}`);
    } else {
      console.log('❌ Test de sincronización directa FALLÓ');
    }
  } catch (error) {
    console.log('❌ Error en test de sincronización directa:', error.message);
  }
};

// Test 2: Obtener promociones disponibles
const testObtenerPromociones = async () => {
  console.log('\n🧪 === TEST 2: OBTENER PROMOCIONES ===');
  
  try {
    const resultado = await makeRequest('/promociones?PageNumber=1&PageSize=5');
    
    if (resultado.status === 200 && resultado.data.success) {
      console.log('✅ Obtención de promociones EXITOSA');
      console.log(`📊 Total promociones: ${resultado.data.pagination.total}`);
      console.log(`📄 Promociones en página: ${resultado.data.data.length}`);
      
      // Mostrar las primeras 3 promociones
      resultado.data.data.slice(0, 3).forEach((promo, index) => {
        console.log(`  ${index + 1}. ${promo.pro_codigo} - ${promo.pro_descripcion} (${promo.estado_temporal})`);
      });
      
      return resultado.data.data;
    } else {
      console.log('❌ Obtención de promociones FALLÓ');
      return [];
    }
  } catch (error) {
    console.log('❌ Error obteniendo promociones:', error.message);
    return [];
  }
};

// Test 3: Analizar artículos de una promoción
const testAnalizarArticulos = async (proSec) => {
  console.log(`\n🧪 === TEST 3: ANALIZAR ARTÍCULOS DE PROMOCIÓN ${proSec} ===`);
  
  try {
    const resultado = await makeRequest(`/promociones/${proSec}/articulos-sincronizacion`);
    
    if (resultado.status === 200 && resultado.data.success) {
      console.log('✅ Análisis de artículos EXITOSO');
      console.log(`📊 Estadísticas:`, resultado.data.data.estadisticas);
      
      if (resultado.data.data.recomendaciones.sin_woo_id) {
        console.log(`⚠️ ${resultado.data.data.recomendaciones.sin_woo_id}`);
      }
      if (resultado.data.data.recomendaciones.inactivos) {
        console.log(`⚠️ ${resultado.data.data.recomendaciones.inactivos}`);
      }
      
      return resultado.data.data.estadisticas;
    } else {
      console.log('❌ Análisis de artículos FALLÓ');
      return null;
    }
  } catch (error) {
    console.log('❌ Error analizando artículos:', error.message);
    return null;
  }
};

// Test 4: Sincronizar precios de una promoción específica
const testSincronizarPromocion = async (proSec) => {
  console.log(`\n🧪 === TEST 4: SINCRONIZAR PROMOCIÓN ${proSec} ===`);
  
  try {
    const resultado = await makeRequest(`/promociones/${proSec}/sincronizar-precios`, {
      method: 'POST',
      body: JSON.stringify({ 
        opciones: { 
          solo_activos: true 
        } 
      })
    });
    
    if (resultado.status === 200 && resultado.data.success) {
      console.log('✅ Sincronización de promoción EXITOSA');
      console.log(`📊 Artículos procesados: ${resultado.data.data.articulos_procesados}`);
      console.log(`✅ Exitosos: ${resultado.data.data.articulos_exitosos}`);
      console.log(`❌ Errores: ${resultado.data.data.articulos_con_error}`);
      console.log(`⏱️ Duración: ${resultado.data.data.duracion}`);
      console.log(`📝 Log ID: ${resultado.data.data.log_id}`);
      
      if (resultado.data.warnings) {
        console.log('⚠️ Advertencias:');
        resultado.data.warnings.forEach(warning => console.log(`  - ${warning}`));
      }
    } else {
      console.log('❌ Sincronización de promoción FALLÓ');
      console.log('📋 Mensaje:', resultado.data.message);
    }
  } catch (error) {
    console.log('❌ Error sincronizando promoción:', error.message);
  }
};

// Función principal de pruebas
const ejecutarPruebas = async () => {
  console.log('🚀 Iniciando pruebas de sincronización de precios...\n');
  
  try {
    // Test 1: Sincronización directa
    await testSincronizacionDirecta();
    
    // Test 2: Obtener promociones
    const promociones = await testObtenerPromociones();
    
    if (promociones.length > 0) {
      // Tomar la primera promoción activa
      const promocionActiva = promociones.find(p => p.pro_activa === 'S' && p.estado_temporal === 'ACTIVA');
      
      if (promocionActiva) {
        console.log(`\n🎯 Usando promoción activa: ${promocionActiva.pro_codigo} (ID: ${promocionActiva.pro_sec})`);
        
        // Test 3: Analizar artículos
        const estadisticas = await testAnalizarArticulos(promocionActiva.pro_sec);
        
        if (estadisticas && estadisticas.listos > 0) {
          // Test 4: Sincronizar promoción
          await testSincronizarPromocion(promocionActiva.pro_sec);
        } else {
          console.log('⚠️ No hay artículos listos para sincronización en esta promoción');
        }
      } else {
        console.log('⚠️ No se encontró una promoción activa para probar');
      }
    }
    
    console.log('\n✅ Pruebas completadas');
    
  } catch (error) {
    console.error('❌ Error en las pruebas:', error);
  }
};

// Ejecutar las pruebas si se llama directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  ejecutarPruebas();
}

export { ejecutarPruebas }; 