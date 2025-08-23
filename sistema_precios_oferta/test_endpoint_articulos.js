// Script de prueba para el endpoint GET /api/articulos con ofertas
// Ejecutar: node sistema_precios_oferta/test_endpoint_articulos.js

const axios = require('axios');

// Configuración
const BASE_URL = 'http://localhost:3000/api';
const TOKEN = 'tu_token_aqui'; // Reemplazar con un token válido

// Función para probar el endpoint de artículos
async function testArticulosEndpoint() {
    try {
        console.log('🧪 Probando endpoint GET /api/articulos con ofertas...\n');

        // Configurar headers con token
        const headers = {
            'Authorization': `Bearer ${TOKEN}`,
            'Content-Type': 'application/json'
        };

        // Test 1: Obtener todos los artículos
        console.log('📋 Test 1: Obtener todos los artículos');
        const response1 = await axios.get(`${BASE_URL}/articulos`, { headers });
        
        if (response1.data.success) {
            console.log('✅ Respuesta exitosa');
            console.log(`📊 Total de artículos: ${response1.data.articulos.length}`);
            
            // Mostrar los primeros 3 artículos con información de ofertas
            const articulos = response1.data.articulos.slice(0, 3);
            articulos.forEach((articulo, index) => {
                console.log(`\n📦 Artículo ${index + 1}:`);
                console.log(`   Código: ${articulo.art_cod}`);
                console.log(`   Nombre: ${articulo.art_nom}`);
                console.log(`   Precio Detal: $${articulo.precio_detal}`);
                console.log(`   Precio Mayor: $${articulo.precio_mayor}`);
                
                // Verificar si tiene oferta
                if (articulo.tiene_oferta === 'S' || articulo.tiene_oferta === true) {
                    if (articulo.precio_oferta && articulo.precio_oferta > 0) {
                        console.log(`   🎯 TIENE OFERTA: $${articulo.precio_oferta}`);
                    } else if (articulo.descuento_porcentaje && articulo.descuento_porcentaje > 0) {
                        console.log(`   🎯 TIENE DESCUENTO: ${articulo.descuento_porcentaje}%`);
                    }
                    console.log(`   📅 Fecha inicio: ${articulo.pro_fecha_inicio}`);
                    console.log(`   📅 Fecha fin: ${articulo.pro_fecha_fin}`);
                    console.log(`   🏷️ Código promoción: ${articulo.codigo_promocion}`);
                    console.log(`   📝 Descripción: ${articulo.descripcion_promocion}`);
                } else {
                    console.log(`   💰 Sin oferta activa`);
                }
            });
        } else {
            console.log('❌ Error en la respuesta:', response1.data.error);
        }

        // Test 2: Filtrar por nombre
        console.log('\n🔍 Test 2: Filtrar artículos por nombre');
        const response2 = await axios.get(`${BASE_URL}/articulos?nombre=test&PageSize=5`, { headers });
        
        if (response2.data.success) {
            console.log('✅ Filtro por nombre exitoso');
            console.log(`📊 Artículos encontrados: ${response2.data.articulos.length}`);
        } else {
            console.log('❌ Error en filtro por nombre:', response2.data.error);
        }

        // Test 3: Verificar estructura de respuesta
        console.log('\n🔍 Test 3: Verificar estructura de respuesta');
        if (response1.data.articulos.length > 0) {
            const primerArticulo = response1.data.articulos[0];
            const camposRequeridos = [
                'art_sec', 'art_cod', 'art_nom', 'precio_detal', 'precio_mayor',
                'precio_detal_original', 'precio_mayor_original', 'tiene_oferta',
                'precio_oferta', 'descuento_porcentaje', 'codigo_promocion', 'descripcion_promocion'
            ];
            
            const camposFaltantes = camposRequeridos.filter(campo => !(campo in primerArticulo));
            
            if (camposFaltantes.length === 0) {
                console.log('✅ Estructura de respuesta correcta');
                console.log('📋 Campos incluidos:');
                camposRequeridos.forEach(campo => {
                    console.log(`   - ${campo}: ${primerArticulo[campo]}`);
                });
            } else {
                console.log('❌ Campos faltantes en la respuesta:', camposFaltantes);
            }
        }

        console.log('\n🎉 Pruebas completadas exitosamente!');

    } catch (error) {
        console.error('❌ Error durante las pruebas:', error.message);
        
        if (error.response) {
            console.error('📊 Respuesta del servidor:', error.response.data);
            console.error('🔢 Código de estado:', error.response.status);
        }
    }
}

// Función para insertar datos de prueba en la base de datos
async function insertarDatosPrueba() {
    try {
        console.log('📝 Insertando datos de prueba...');
        
        // Aquí podrías agregar código para insertar ofertas de prueba
        // usando el endpoint de ofertas si existe
        
        console.log('✅ Datos de prueba insertados');
    } catch (error) {
        console.error('❌ Error insertando datos de prueba:', error.message);
    }
}

// Función principal
async function main() {
    console.log('🚀 Iniciando pruebas del endpoint de artículos con ofertas\n');
    
    // Opcional: Insertar datos de prueba
    // await insertarDatosPrueba();
    
    // Ejecutar pruebas
    await testArticulosEndpoint();
}

// Ejecutar si se llama directamente
if (require.main === module) {
    main().catch(console.error);
}

module.exports = {
    testArticulosEndpoint,
    insertarDatosPrueba
}; 