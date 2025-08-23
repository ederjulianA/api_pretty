// Archivo de prueba para las funciones de precioUtils
// Ejecutar con: node test_precioUtils.js

import { obtenerPreciosArticulo, validarPrecioOferta, validarDescuentoPorcentual } from '../utils/precioUtils.js';

// Función de prueba
async function testPrecioUtils() {
    console.log('🧪 Iniciando pruebas de precioUtils...\n');
    
    try {
        // Obtener algunos artículos de ejemplo (reemplazar con art_sec reales)
        const articulosPrueba = ['ART001', 'ART002', 'ART003'];
        
        for (const art_sec of articulosPrueba) {
            console.log(`📦 Probando artículo: ${art_sec}`);
            
            try {
                // 1. Obtener precios del artículo
                const precios = await obtenerPreciosArticulo(art_sec);
                console.log(`   ✅ Precios obtenidos:`, precios);
                
                // 2. Validar precio de oferta válido
                const precioOfertaValido = precios.precio_detal * 0.8; // 20% menos que detal
                const validacionPrecio = await validarPrecioOferta(art_sec, precioOfertaValido);
                console.log(`   ✅ Validación precio ${precioOfertaValido}:`, validacionPrecio.valido ? 'VÁLIDO' : 'INVÁLIDO');
                
                // 3. Validar precio de oferta inválido (mayor que detal)
                const precioOfertaInvalido = precios.precio_detal * 1.2; // 20% más que detal
                const validacionPrecioInvalido = await validarPrecioOferta(art_sec, precioOfertaInvalido);
                console.log(`   ❌ Validación precio ${precioOfertaInvalido}:`, validacionPrecioInvalido.valido ? 'VÁLIDO' : 'INVÁLIDO');
                console.log(`      Mensaje: ${validacionPrecioInvalido.mensaje}`);
                
                // 4. Validar descuento porcentual válido
                const descuentoValido = 15; // 15%
                const validacionDescuento = await validarDescuentoPorcentual(art_sec, descuentoValido);
                console.log(`   ✅ Validación descuento ${descuentoValido}%:`, validacionDescuento.valido ? 'VÁLIDO' : 'INVÁLIDO');
                
                // 5. Validar descuento porcentual inválido
                const descuentoInvalido = 110; // 110%
                const validacionDescuentoInvalido = await validarDescuentoPorcentual(art_sec, descuentoInvalido);
                console.log(`   ❌ Validación descuento ${descuentoInvalido}%:`, validacionDescuentoInvalido.valido ? 'VÁLIDO' : 'INVÁLIDO');
                console.log(`      Mensaje: ${validacionDescuentoInvalido.mensaje}`);
                
            } catch (error) {
                console.log(`   ❌ Error con artículo ${art_sec}:`, error.message);
            }
            
            console.log(''); // Línea en blanco
        }
        
        console.log('✅ Pruebas completadas');
        
    } catch (error) {
        console.error('❌ Error en las pruebas:', error);
    }
}

// Ejecutar pruebas si el archivo se ejecuta directamente
if (import.meta.url === `file://${process.argv[1]}`) {
    testPrecioUtils();
}

export { testPrecioUtils }; 