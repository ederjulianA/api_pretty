// config/promptTemplates.js
// Templates de prompts para diferentes tipos de contenido y categorías

const PROMPT_DESCRIPCION_BELLEZA = `Eres un experto copywriter especializado en productos de belleza y cosmética para e-commerce.

PRODUCTO:
- Nombre: {art_nom}
- Categoría: {categoria}
- Precio retail: {precio_detal} COP
- Precio mayorista: {precio_mayor} COP
{componentes_info}

CONTEXTO DEL MERCADO:
- Público objetivo: Mujeres 25-45 años, Colombia
- Competencia: Mercado de belleza competitivo
- Canales: E-commerce + redes sociales

TU TAREA:
Genera contenido optimizado para este producto en formato JSON con la siguiente estructura:

{
  "titulo_seo": "Título atractivo y optimizado (máximo 60 caracteres, incluir marca y beneficio principal)",
  "meta_description": "Descripción para motores de búsqueda (máximo 160 caracteres, incluir CTA)",
  "descripcion_larga_html": "HTML completo con estructura persuasiva que DEBE incluir TODAS las secciones mencionadas abajo",
  "descripcion_corta": "Resumen de 2-3 líneas para preview de producto",
  "keywords": ["array", "de", "5-10", "keywords", "relevantes"],
  "bullet_points": ["Beneficio 1", "Beneficio 2", "...hasta 6"],
  "llamados_accion": ["CTA persuasivo 1", "CTA con urgencia 2"],
  "preguntas_frecuentes": [
    {
      "pregunta": "¿Pregunta común del cliente?",
      "respuesta": "Respuesta clara y útil, máximo 2-3 líneas"
    }
  ]
}

DIRECTRICES DE COPYWRITING:
1. Tono: Profesional pero cercano, evita exageraciones
2. Enfoque: 60% beneficios emocionales, 40% características técnicas
3. SEO: Incluir keywords naturalmente, evitar keyword stuffing
4. Credibilidad: Mencionar componentes, beneficios verificables
5. Urgencia: Sutilmente crear FOMO (Fear Of Missing Out)
6. Localización: Usar lenguaje colombiano (evitar regionalismos extremos)

ESTRUCTURA HTML REQUERIDA (DEBES INCLUIR TODAS ESTAS SECCIONES):
<h2>[Título emocional que conecta con deseo/problema]</h2>
<p>[Párrafo 1: Introduce el producto y su principal beneficio]</p>
<p>[Párrafo 2: Explica cómo soluciona problemas/necesidades]</p>
{componentes_html}
IMPORTANTE: Si este es un bundle, DEBES incluir la sección de componentes con imágenes usando el HTML proporcionado arriba. Las URLs de imágenes están disponibles en la información del producto.

<h3>Características Destacadas</h3>
<ul>
  <li>✓ [Característica 1 con beneficio específico]</li>
  <li>✓ [Característica 2 con beneficio específico]</li>
  <li>✓ [Característica 3 con beneficio específico]</li>
  <li>✓ [Característica 4 con beneficio específico]</li>
  <li>✓ [Característica 5 con beneficio específico]</li>
</ul>

<h3>Modo de Uso</h3>
<p>[Instrucciones claras y paso a paso de cómo usar el producto. Si es bundle, explica cómo usar cada componente o el combo completo]</p>

<h3>Ingredientes Principales</h3>
<p>[Menciona los ingredientes clave o componentes principales del producto. Si no tienes información específica, menciona ingredientes comunes para este tipo de producto]</p>

<h3>Preguntas Frecuentes</h3>
<div style="margin-top: 20px;">
  <h4>¿[Pregunta común 1]?</h4>
  <p>[Respuesta clara y útil, máximo 2-3 líneas]</p>
  
  <h4>¿[Pregunta común 2]?</h4>
  <p>[Respuesta clara y útil, máximo 2-3 líneas]</p>
  
  <h4>¿[Pregunta común 3]?</h4>
  <p>[Respuesta clara y útil, máximo 2-3 líneas]</p>
  
  <h4>¿[Pregunta común 4]?</h4>
  <p>[Respuesta clara y útil, máximo 2-3 líneas]</p>
</div>

<p><strong>[Llamado a la acción final persuasivo]</strong></p>

CRÍTICO: El campo "descripcion_larga_html" DEBE contener TODAS estas secciones en HTML. No omitas ninguna sección.

RESPONDE ÚNICAMENTE CON EL JSON VÁLIDO, SIN TEXTO ADICIONAL.`;

const PROMPT_DESCRIPCION_DEFAULT = `Eres un experto copywriter para e-commerce.

PRODUCTO:
- Nombre: {art_nom}
- Categoría: {categoria}
- Precio retail: {precio_detal} COP
{componentes_info}

Genera contenido optimizado en formato JSON:

{
  "titulo_seo": "Título optimizado (máximo 60 caracteres)",
  "meta_description": "Meta descripción (máximo 160 caracteres)",
  "descripcion_larga_html": "HTML completo con estructura persuasiva que DEBE incluir: introducción, características destacadas, modo de uso, ingredientes principales y preguntas frecuentes",
  "descripcion_corta": "Resumen breve",
  "keywords": ["keyword1", "keyword2", "..."],
  "bullet_points": ["Beneficio 1", "Beneficio 2", "..."],
  "llamados_accion": ["CTA 1", "CTA 2"],
  "preguntas_frecuentes": [
    {
      "pregunta": "¿Pregunta común del cliente?",
      "respuesta": "Respuesta clara y útil"
    }
  ]
}

DIRECTRICES:
- Tono profesional y persuasivo
- SEO natural, sin keyword stuffing
- Enfocado en beneficios del cliente
- Lenguaje claro y accesible
- Si es bundle: INCLUYE las imágenes de los componentes en el HTML usando las URLs proporcionadas

ESTRUCTURA HTML COMPLETA REQUERIDA:
{componentes_html}

<h3>Características Destacadas</h3>
<ul>
  <li>✓ [Característica 1]</li>
  <li>✓ [Característica 2]</li>
  <li>✓ [Característica 3]</li>
</ul>

<h3>Modo de Uso</h3>
<p>[Instrucciones claras de uso]</p>

<h3>Ingredientes Principales</h3>
<p>[Ingredientes o componentes clave]</p>

<h3>Preguntas Frecuentes</h3>
<div>
  <h4>¿[Pregunta 1]?</h4>
  <p>[Respuesta]</p>
  <h4>¿[Pregunta 2]?</h4>
  <p>[Respuesta]</p>
</div>

CRÍTICO: El campo "descripcion_larga_html" DEBE incluir TODAS estas secciones.

RESPONDE ÚNICAMENTE CON EL JSON VÁLIDO.`;

// Mapeo de categorías a templates
const categoriaTemplates = {
  'belleza': PROMPT_DESCRIPCION_BELLEZA,
  'maquillaje': PROMPT_DESCRIPCION_BELLEZA,
  'cosmetica': PROMPT_DESCRIPCION_BELLEZA,
  'skincare': PROMPT_DESCRIPCION_BELLEZA,
  'default': PROMPT_DESCRIPCION_DEFAULT
};

/**
 * Obtiene el template de prompt según la categoría del producto
 * @param {string} categoria - Categoría del producto
 * @returns {string} Template de prompt
 */
const getTemplateByCategoria = (categoria) => {
  if (!categoria) return PROMPT_DESCRIPCION_DEFAULT;
  
  const categoriaLower = categoria.toLowerCase();
  
  // Buscar coincidencia exacta o parcial
  for (const [key, template] of Object.entries(categoriaTemplates)) {
    if (categoriaLower.includes(key)) {
      return template;
    }
  }
  
  return PROMPT_DESCRIPCION_DEFAULT;
};

/**
 * Formatea información de componentes para el prompt
 * @param {Array} componentes - Array de componentes del bundle
 * @returns {Object} Objeto con info_text e info_html
 */
const formatComponentesInfo = (componentes) => {
  if (!componentes || componentes.length === 0) {
    return {
      info_text: '',
      info_html: ''
    };
  }

  // Formato texto para sección PRODUCTO (incluyendo URLs de imágenes)
  const componentesList = componentes.map(c => {
    let line = `  - ${c.cantidad}x ${c.nombre} (${c.codigo})`;
    if (c.imagen_url) {
      line += ` [Imagen: ${c.imagen_url}]`;
    }
    return line;
  }).join('\n');
  
  const info_text = `\n- Tipo: Bundle (incluye ${componentes.length} producto${componentes.length > 1 ? 's' : ''})\n- Componentes incluidos:\n${componentesList}\n\nIMPORTANTE: Debes incluir las imágenes de los componentes en el HTML usando las URLs proporcionadas.`;

  // Formato HTML para estructura HTML requerida con imágenes
  const componentesHTML = `
<h3>Este Bundle Incluye:</h3>
<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 20px 0;">
${componentes.map(c => {
  const imagenHTML = c.imagen_url 
    ? `<img src="${c.imagen_url}" alt="${c.nombre}" style="width: 100%; max-width: 150px; height: auto; border-radius: 8px; margin-bottom: 10px;" />`
    : '';
  return `  <div style="text-align: center; padding: 15px; border: 1px solid #e0e0e0; border-radius: 8px; background: #f9f9f9;">
    ${imagenHTML}
    <p style="margin: 0; font-weight: bold; color: #333;">${c.cantidad}x ${c.nombre}</p>
  </div>`;
}).join('\n')}
</div>
<p style="text-align: center; font-size: 16px; color: #2c3e50; margin-top: 20px;"><strong>¡Todo lo que necesitas en un solo paquete con el mejor precio!</strong></p>`;

  return {
    info_text,
    info_html: componentesHTML
  };
};

/**
 * Construye el prompt reemplazando variables
 * @param {Object} producto - Datos del producto
 * @param {string} categoria - Categoría del producto
 * @returns {string} Prompt completo
 */
const buildPrompt = (producto, categoria = null) => {
  const template = getTemplateByCategoria(categoria);
  
  // Formatear información de componentes si es bundle
  const componentesInfo = formatComponentesInfo(producto.componentes);
  
  let prompt = template
    .replace(/{art_nom}/g, producto.art_nom || 'Producto sin nombre')
    .replace(/{categoria}/g, categoria || 'General')
    .replace(/{precio_detal}/g, producto.precio_detal || '0')
    .replace(/{precio_mayor}/g, producto.precio_mayor || '0')
    .replace(/{componentes_info}/g, componentesInfo.info_text)
    .replace(/{componentes_html}/g, componentesInfo.info_html);
  
  return prompt;
};

module.exports = {
  PROMPT_DESCRIPCION_BELLEZA,
  PROMPT_DESCRIPCION_DEFAULT,
  categoriaTemplates,
  getTemplateByCategoria,
  formatComponentesInfo,
  buildPrompt
};
