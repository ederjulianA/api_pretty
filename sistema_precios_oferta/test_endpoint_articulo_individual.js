// Script de prueba para el endpoint GET /api/articulos/:id_articulo con ofertas
// Ejecutar: node sistema_precios_oferta/test_endpoint_articulo_individual.js

const axios = require('axios');

// Configuración
const BASE_URL = 'http://localhost:3000/api';
const TOKEN = 'tu_token_aqui'; // Reemplazar con un token válido

// Función para probar el endpoint de artículo individual
async function testArticuloIndividualEndpoint() {
    try {
        console.log('🧪 Probando endpoint GET /api/articulos/:id_articulo con ofertas...\n');

        // Configurar headers con token
        const headers = {
            'Authorization': `Bearer ${TOKEN}`,
            'Content-Type': 'application/json'
        };

        // Test 1: Obtener un artículo específico (reemplazar con un art_sec válido)
        const artSec = '1'; // Cambiar por un art_sec válido de tu base de datos
        console.log(`📋 Test 1: Obtener artículo con art_sec = ${artSec}`);
        
        const response1 = await axios.get(`${BASE_URL}/articulos/${artSec}`, { headers });
        
        if (response1.data.success) {
            console.log('✅ Respuesta exitosa');
            const articulo = response1.data.articulo;
            
            console.log(`\n📦 Información del Artículo:`);
            console.log(`   Código: ${articulo.art_cod}`);
            console.log(`   Nombre: ${articulo.art_nom}`);
            console.log(`   Categoría: ${articulo.inv_gru_cod}`);
            console.log(`   Subcategoría: ${articulo.inv_sub_gru_cod}`);
            console.log(`   WooCommerce ID: ${articulo.art_woo_id}`);
            
            console.log(`\n💰 Información de Precios:`);
            console.log(`   Precio Detal Original: $${articulo.precio_detal_original}`);
            console.log(`   Precio Mayor Original: $${articulo.precio_mayor_original}`);
            console.log(`   Precio Detal Final: $${articulo.precio_detal}`);
            console.log(`   Precio Mayor Final: $${articulo.precio_mayor}`);
            
            // Verificar si tiene oferta
            if (articulo.tiene_oferta === 'S' || articulo.tiene_oferta === true) {
                console.log(`\n🎯 INFORMACIÓN DE OFERTA:`);
                if (articulo.precio_oferta && articulo.precio_oferta > 0) {
                    console.log(`   Tipo: Precio de Oferta`);
                    console.log(`   Precio Oferta: $${articulo.precio_oferta}`);
                } else if (articulo.descuento_porcentaje && articulo.descuento_porcentaje > 0) {
                    console.log(`   Tipo: Descuento Porcentual`);
                    console.log(`   Descuento: ${articulo.descuento_porcentaje}%`);
                }
                console.log(`   Código Promoción: ${articulo.codigo_promocion}`);
                console.log(`   Descripción: ${articulo.descripcion_promocion}`);
                console.log(`   Fecha Inicio: ${articulo.pro_fecha_inicio}`);
                console.log(`   Fecha Fin: ${articulo.pro_fecha_fin}`);
                
                // Calcular ahorro
                const ahorroDetal = articulo.precio_detal_original - articulo.precio_detal;
                const ahorroMayor = articulo.precio_mayor_original - articulo.precio_mayor;
                console.log(`   Ahorro Detal: $${ahorroDetal.toFixed(2)}`);
                console.log(`   Ahorro Mayor: $${ahorroMayor.toFixed(2)}`);
            } else {
                console.log(`\n💰 Sin oferta activa`);
            }
            
            console.log(`\n🔄 Estado WooCommerce:`);
            console.log(`   Status: ${articulo.art_woo_sync_status}`);
            console.log(`   Message: ${articulo.art_woo_sync_message}`);
            
        } else {
            console.log('❌ Error en la respuesta:', response1.data.error);
        }

        // Test 2: Probar con artículo inexistente
        console.log('\n🔍 Test 2: Probar con artículo inexistente');
        try {
            const response2 = await axios.get(`${BASE_URL}/articulos/999999`, { headers });
            console.log('❌ Error: Debería haber fallado con artículo inexistente');
        } catch (error) {
            if (error.response && error.response.status === 500) {
                console.log('✅ Correcto: Error 500 para artículo inexistente');
            } else {
                console.log('❌ Error inesperado:', error.message);
            }
        }

        // Test 3: Verificar estructura de respuesta
        console.log('\n🔍 Test 3: Verificar estructura de respuesta');
        if (response1.data.success && response1.data.articulo) {
            const articulo = response1.data.articulo;
            const camposRequeridos = [
                'art_sec', 'art_cod', 'art_nom', 'inv_gru_cod', 'inv_sub_gru_cod',
                'precio_detal', 'precio_mayor', 'precio_detal_original', 'precio_mayor_original',
                'tiene_oferta', 'precio_oferta', 'descuento_porcentaje', 'codigo_promocion',
                'descripcion_promocion', 'pro_fecha_inicio', 'pro_fecha_fin'
            ];
            
            const camposFaltantes = camposRequeridos.filter(campo => !(campo in articulo));
            
            if (camposFaltantes.length === 0) {
                console.log('✅ Estructura de respuesta correcta');
                console.log('📋 Campos incluidos:');
                camposRequeridos.forEach(campo => {
                    console.log(`   - ${campo}: ${articulo[campo]}`);
                });
            } else {
                console.log('❌ Campos faltantes en la respuesta:', camposFaltantes);
            }
        }

        // Test 4: Probar múltiples artículos para comparar
        console.log('\n🔍 Test 4: Comparar múltiples artículos');
        const artSecs = ['1', '2', '3']; // Cambiar por art_sec válidos
        
        for (const sec of artSecs) {
            try {
                const response = await axios.get(`${BASE_URL}/articulos/${sec}`, { headers });
                if (response.data.success) {
                    const art = response.data.articulo;
                    console.log(`\n📦 Artículo ${sec}:`);
                    console.log(`   Nombre: ${art.art_nom}`);
                    console.log(`   Precio Detal: $${art.precio_detal} (Original: $${art.precio_detal_original})`);
                    console.log(`   Tiene Oferta: ${art.tiene_oferta === 'S' ? 'SÍ' : 'NO'}`);
                    if (art.tiene_oferta === 'S') {
                        console.log(`   Tipo: ${art.precio_oferta ? 'Precio Fijo' : 'Descuento %'}`);
                    }
                }
            } catch (error) {
                console.log(`   ❌ Error con artículo ${sec}: ${error.message}`);
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

// Función para obtener artículos válidos para testing
async function obtenerArticulosValidos() {
    try {
        console.log('📝 Obteniendo artículos válidos para testing...');
        
        const headers = {
            'Authorization': `Bearer ${TOKEN}`,
            'Content-Type': 'application/json'
        };
        
        const response = await axios.get(`${BASE_URL}/articulos?PageSize=5`, { headers });
        
        if (response.data.success && response.data.articulos.length > 0) {
            console.log('✅ Artículos disponibles para testing:');
            response.data.articulos.forEach((art, index) => {
                console.log(`   ${index + 1}. art_sec: ${art.art_sec}, art_cod: ${art.art_cod}, nombre: ${art.art_nom}`);
            });
            return response.data.articulos.map(art => art.art_sec);
        } else {
            console.log('❌ No se encontraron artículos');
            return [];
        }
        
    } catch (error) {
        console.error('❌ Error obteniendo artículos:', error.message);
        return [];
    }
}

// Función principal
async function main() {
    console.log('🚀 Iniciando pruebas del endpoint de artículo individual con ofertas\n');
    
    // Opcional: Obtener artículos válidos
    // const articulosValidos = await obtenerArticulosValidos();
    // console.log('Artículos válidos:', articulosValidos);
    
    // Ejecutar pruebas
    await testArticuloIndividualEndpoint();
}

// Ejecutar si se llama directamente
if (require.main === module) {
    main().catch(console.error);
}

module.exports = {
    testArticuloIndividualEndpoint,
    obtenerArticulosValidos
}; 