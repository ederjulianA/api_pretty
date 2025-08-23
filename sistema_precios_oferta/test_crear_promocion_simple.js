// sistema_precios_oferta/test_crear_promocion_simple.js
import promocionModel from '../models/promocionModel.js';

console.log('🚀 Iniciando test de creación de promoción con sincronización automática...');

const testCrearPromocion = async () => {
  try {
    console.log('📋 Preparando datos de promoción...');
    
    // Datos de prueba para nueva promoción
    const datosPromocion = {
      codigo: `TEST_${Date.now()}`,
      descripcion: 'Promoción de prueba con sincronización automática',
      fecha_inicio: new Date(),
      fecha_fin: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 días
      tipo: 'OFERTA',
      observaciones: 'Promoción creada para probar sincronización automática',
      usuario: 'SISTEMA',
      articulos: [
        {
          art_sec: '1750', // Aceite Reparador de Puntas Canabis
          precio_oferta: 25000, // Precio de oferta
          descuento_porcentaje: null,
          observaciones: 'Precio especial de prueba',
          estado: 'A'
        }
      ]
    };
    
    console.log('📊 Datos de la promoción:', {
      codigo: datosPromocion.codigo,
      descripcion: datosPromocion.descripcion,
      articulos_count: datosPromocion.articulos.length,
      articulos: datosPromocion.articulos.map(a => ({
        art_sec: a.art_sec,
        precio_oferta: a.precio_oferta,
        descuento_porcentaje: a.descuento_porcentaje
      }))
    });
    
    console.log('⏳ Creando promoción...');
    const resultado = await promocionModel.crearPromocion(datosPromocion);
    
    console.log('\n✅ RESULTADO DE CREACIÓN:');
    console.log('📋 Success:', resultado.success);
    console.log('📝 Message:', resultado.message);
    
    if (resultado.data) {
      console.log('📊 Datos de la promoción creada:');
      console.log('  - ID:', resultado.data.pro_sec);
      console.log('  - Código:', resultado.data.codigo);
      console.log('  - Descripción:', resultado.data.descripcion);
      console.log('  - Artículos:', resultado.data.articulos_count);
    }
    
    if (resultado.sincronizacion) {
      console.log('\n🔄 SINCRONIZACIÓN AUTOMÁTICA:');
      console.log('  - Ejecutada:', resultado.sincronizacion.ejecutada);
      console.log('  - Exitosa:', resultado.sincronizacion.exitosa);
      
      if (resultado.sincronizacion.ejecutada) {
        console.log('  - Artículos procesados:', resultado.sincronizacion.articulos_procesados);
        console.log('  - Artículos exitosos:', resultado.sincronizacion.articulos_exitosos);
        console.log('  - Artículos con error:', resultado.sincronizacion.articulos_con_error);
        console.log('  - Duración:', resultado.sincronizacion.duracion);
        console.log('  - Log ID:', resultado.sincronizacion.log_id);
      }
      
      if (resultado.sincronizacion.error) {
        console.log('  - Error:', resultado.sincronizacion.error);
      }
    }
    
    if (resultado.warnings) {
      console.log('\n⚠️ ADVERTENCIAS:');
      resultado.warnings.forEach(warning => console.log('  -', warning));
    }
    
    return resultado;
    
  } catch (error) {
    console.error('❌ Error en test de creación:', error);
    throw error;
  }
};

// Ejecutar el test
testCrearPromocion()
  .then(() => {
    console.log('\n✅ Test completado exitosamente');
  })
  .catch((error) => {
    console.error('\n❌ Test falló:', error.message);
  }); 