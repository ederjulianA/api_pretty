// sistema_precios_oferta/test_sincronizacion_automatica.js
import promocionModel from '../models/promocionModel.js';

console.log('🚀 Iniciando test de sincronización automática...');

// Test de actualización de promoción con sincronización automática
const testActualizarPromocionConSincronizacion = async () => {
  try {
    console.log('\n🧪 === TEST: ACTUALIZAR PROMOCIÓN CON SINCRONIZACIÓN AUTOMÁTICA ===');
    
    // Primero obtener una promoción existente para actualizar
    const promociones = await promocionModel.obtenerPromociones({
      PageNumber: 1,
      PageSize: 5
    });
    
    if (!promociones.success || promociones.data.length === 0) {
      console.log('❌ No se encontraron promociones para actualizar');
      return;
    }
    
    // Tomar la primera promoción activa
    const promocionExistente = promociones.data.find(p => p.pro_activa === 'S');
    
    if (!promocionExistente) {
      console.log('❌ No se encontró una promoción activa para actualizar');
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
    
    // Preparar datos de actualización (solo cambiar la descripción para no afectar precios)
    const datosActualizacion = {
      descripcion: `${promocionExistente.pro_descripcion} - Actualizado ${new Date().toLocaleString()}`,
      // No incluir artículos para que no se ejecute la sincronización automática
      // articulos: promocionDetalle.data.articulos.slice(0, 2) // Solo los primeros 2 artículos
    };
    
    console.log('⏳ Actualizando promoción...');
    const resultado = await promocionModel.actualizarPromocion(promocionExistente.pro_sec, datosActualizacion);
    
    console.log('✅ Resultado de actualización:');
    console.log('📋 Success:', resultado.success);
    console.log('📝 Message:', resultado.message);
    console.log('📊 Sincronización:', resultado.sincronizacion);
    
    if (resultado.warnings) {
      console.log('⚠️ Warnings:', resultado.warnings);
    }
    
    return resultado;
    
  } catch (error) {
    console.error('❌ Error en test de actualización:', error);
  }
};

// Test de crear promoción con sincronización automática
const testCrearPromocionConSincronizacion = async () => {
  try {
    console.log('\n🧪 === TEST: CREAR PROMOCIÓN CON SINCRONIZACIÓN AUTOMÁTICA ===');
    
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
        },
        {
          art_sec: '1751', // Tónico De Crecimiento Intensivo Kaba
          precio_oferta: null,
          descuento_porcentaje: 15, // 15% de descuento
          observaciones: 'Descuento especial de prueba',
          estado: 'A'
        }
      ]
    };
    
    console.log('⏳ Creando nueva promoción...');
    console.log('📋 Datos de la promoción:', {
      codigo: datosPromocion.codigo,
      descripcion: datosPromocion.descripcion,
      articulos_count: datosPromocion.articulos.length
    });
    
    const resultado = await promocionModel.crearPromocion(datosPromocion);
    
    console.log('✅ Resultado de creación:');
    console.log('📋 Success:', resultado.success);
    console.log('📝 Message:', resultado.message);
    console.log('📊 Sincronización:', resultado.sincronizacion);
    
    if (resultado.warnings) {
      console.log('⚠️ Warnings:', resultado.warnings);
    }
    
    return resultado;
    
  } catch (error) {
    console.error('❌ Error en test de creación:', error);
  }
};

// Función principal
const ejecutarPruebas = async () => {
  try {
    // Test 1: Actualizar promoción existente
    await testActualizarPromocionConSincronizacion();
    
    // Test 2: Crear nueva promoción
    await testCrearPromocionConSincronizacion();
    
    console.log('\n✅ Pruebas de sincronización automática completadas');
    
  } catch (error) {
    console.error('❌ Error en las pruebas:', error);
  }
};

// Ejecutar las pruebas si se llama directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  ejecutarPruebas();
}

export { ejecutarPruebas }; 