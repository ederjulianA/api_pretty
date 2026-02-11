# Templates de Prompts para IA

**Fecha:** 2026-02-11
**Versión:** 1.0

Este documento contiene templates de prompts optimizados para generar contenido de calidad para productos de e-commerce.

---

## 📋 Índice de Templates

1. [Descripción Completa de Producto](#1-descripción-completa-de-producto)
2. [Título SEO Optimizado](#2-título-seo-optimizado)
3. [Meta Description](#3-meta-description)
4. [Bullet Points de Beneficios](#4-bullet-points-de-beneficios)
5. [Preguntas Frecuentes (FAQ)](#5-preguntas-frecuentes-faq)
6. [Contenido para Redes Sociales](#6-contenido-para-redes-sociales)
7. [Contenido Estacional](#7-contenido-estacional)
8. [Alt Text para Imágenes](#8-alt-text-para-imágenes)

---

## 1. Descripción Completa de Producto

### Template para Productos de Belleza

```javascript
const PROMPT_DESCRIPCION_BELLEZA = `Eres un experto copywriter especializado en productos de belleza y cosmética para e-commerce.

PRODUCTO:
- Nombre: {art_nom}
- Categoría: {categoria}
- Precio retail: ${precio_detal} COP
- Precio mayorista: ${precio_mayor} COP
- Descripción actual: {art_des}

CONTEXTO DEL MERCADO:
- Público objetivo: Mujeres 25-45 años, Colombia
- Competencia: Mercado de belleza competitivo
- Canales: E-commerce + redes sociales

TU TAREA:
Genera contenido optimizado para este producto en formato JSON con la siguiente estructura:

{
  "titulo_seo": "Título atractivo y optimizado (máximo 60 caracteres, incluir marca y beneficio principal)",
  "meta_description": "Descripción para motores de búsqueda (máximo 160 caracteres, incluir CTA)",
  "descripcion_larga_html": "HTML completo con estructura persuasiva",
  "descripcion_corta": "Resumen de 2-3 líneas para preview de producto",
  "keywords": ["array", "de", "5-10", "keywords", "relevantes"],
  "bullet_points": ["Beneficio 1", "Beneficio 2", "...hasta 6"],
  "llamados_accion": ["CTA persuasivo 1", "CTA con urgencia 2"]
}

DIRECTRICES DE COPYWRITING:
1. Tono: Profesional pero cercano, evita exageraciones
2. Enfoque: 60% beneficios emocionales, 40% características técnicas
3. SEO: Incluir keywords naturalmente, evitar keyword stuffing
4. Credibilidad: Mencionar componentes, beneficios verificables
5. Urgencia: Sutilmente crear FOMO (Fear Of Missing Out)
6. Localización: Usar lenguaje colombiano (evitar regionalismos extremos)

ESTRUCTURA HTML REQUERIDA:
<h2>[Título emocional que conecta con deseo/problema]</h2>
<p>[Párrafo 1: Introduce el producto y su principal beneficio]</p>
<p>[Párrafo 2: Explica cómo soluciona problemas/necesidades]</p>
<h3>Características Destacadas</h3>
<ul>
  <li>✓ [Característica 1 con beneficio]</li>
  <li>✓ [Característica 2 con beneficio]</li>
  <li>✓ [Característica 3 con beneficio]</li>
  <li>✓ [Característica 4 con beneficio]</li>
  <li>✓ [Característica 5 con beneficio]</li>
</ul>
<h3>Modo de Uso</h3>
<p>[Instrucciones simples de aplicación]</p>
<p><strong>[Llamado a la acción final persuasivo]</strong></p>

RESPONDE ÚNICAMENTE CON EL JSON VÁLIDO, SIN TEXTO ADICIONAL.`;
```

### Template para Productos de Tecnología

```javascript
const PROMPT_DESCRIPCION_TECNOLOGIA = `Eres un experto en copywriting para productos tecnológicos.

PRODUCTO:
- Nombre: {art_nom}
- Categoría: {categoria}
- Precio: ${precio_detal} COP
- Especificaciones: {especificaciones}

TU TAREA:
Genera contenido técnico pero accesible en formato JSON.

ENFOQUE:
1. Tono: Técnico pero comprensible
2. Enfoque: 70% características técnicas, 30% beneficios
3. Incluir comparaciones con estándares
4. Destacar innovación y especificaciones únicas

JSON ESTRUCTURA:
{
  "titulo_seo": "...",
  "meta_description": "...",
  "descripcion_larga_html": "...",
  "especificaciones_clave": ["Spec 1", "Spec 2", ...],
  "compatibilidad": ["Compatible con X", "Funciona con Y"],
  "garantia_soporte": "Información de garantía"
}

RESPONDE SOLO CON JSON VÁLIDO.`;
```

---

## 2. Título SEO Optimizado

### Template Universal

```javascript
const PROMPT_TITULO_SEO = `Genera un título SEO altamente optimizado para un producto de e-commerce.

PRODUCTO: {art_nom}
CATEGORÍA: {categoria}
PRECIO: ${precio}
MARCA: {marca}

REGLAS ESTRICTAS:
1. Máximo 60 caracteres (incluidos espacios)
2. Incluir: [Nombre Producto] + [Beneficio Principal] + [Marca]
3. Usar separador: guión (-) o barra vertical (|)
4. Priorizar palabras clave de alto volumen
5. Evitar palabras genéricas ("comprar", "barato")
6. Capitalización: Title Case para nombres propios

EJEMPLOS DE BUENAS ESTRUCTURAS:
- "[Producto] [Beneficio] - [Característica] | [Marca]"
- "[Producto] [Tipo] + [Beneficio] - [Marca]"
- "[Marca] [Producto]: [Beneficio Principal]"

KEYWORDS A CONSIDERAR PARA COLOMBIA:
- Para belleza: "original", "larga duración", "profesional", "mate"
- Para tech: "nuevo", "garantía", "alta calidad"
- Para hogar: "resistente", "moderno", "práctico"

RESPONDE SOLO CON EL TÍTULO, SIN EXPLICACIONES.

Título SEO:`;
```

### Template Específico por Categoría

```javascript
// config/promptTemplates.js
const tituloSEOPorCategoria = {
  belleza: `Genera título SEO para producto de belleza.

FORMATO PREFERIDO:
"[Producto] [Tipo] [Beneficio] - [Característica Única] | [Marca]"

EJEMPLO:
"Labial Mate Rojo Pasión - Larga Duración 12h | Pretty"

PRODUCTO: {art_nom}
CATEGORÍA: {subcategoria}

RESPONDE SOLO CON EL TÍTULO (max 60 chars):`,

  tecnologia: `Genera título SEO para producto tecnológico.

FORMATO PREFERIDO:
"[Marca] [Producto] [Modelo] - [Especificación Clave] | [Característica]"

EJEMPLO:
"Samsung Galaxy S24 Ultra - 256GB + 12GB RAM | 5G"

PRODUCTO: {art_nom}

RESPONDE SOLO CON EL TÍTULO (max 60 chars):`,

  hogar: `Genera título SEO para producto de hogar.

FORMATO PREFERIDO:
"[Producto] [Material/Tipo] - [Beneficio] | [Uso/Tamaño]"

EJEMPLO:
"Organizador Plástico Apilable - 50L | Cocina/Baño"

PRODUCTO: {art_nom}

RESPONDE SOLO CON EL TÍTULO (max 60 chars):`
};
```

---

## 3. Meta Description

### Template Universal

```javascript
const PROMPT_META_DESCRIPTION = `Crea una meta descripción perfecta para SERP (resultados de Google).

PRODUCTO:
- Nombre: {art_nom}
- Categoría: {categoria}
- Precio: ${precio_detal}
- Beneficios clave: {beneficios}

REQUISITOS TÉCNICOS:
- Longitud: 150-160 caracteres (CRÍTICO: no exceder)
- Incluir: Beneficio principal + Característica diferenciadora + CTA
- CTA ejemplos: "Compra ahora", "Envío gratis", "Garantía incluida"
- Usar números cuando sea posible (ej: "12 horas duración")
- Incluir keyword principal naturalmente

FÓRMULA RECOMENDADA:
"[Descripción breve producto] + [Beneficio único] + [Característica técnica]. [CTA con valor agregado]."

EJEMPLO PARA LABIAL:
"Labial mate rojo intenso con duración de 12h. Fórmula hidratante con vitamina E, resistente al agua. ¡Envío gratis en compras +$50.000!"

EVITA:
- Lenguaje genérico o clichés
- Promesas no verificables
- Repetir el título exacto
- Signos de exclamación excesivos

RESPONDE SOLO CON LA META DESCRIPCIÓN, SIN ETIQUETAS.

Meta Description:`;
```

### Template con Promoción

```javascript
const PROMPT_META_DESCRIPTION_PROMO = `Crea meta descripción enfocada en promoción activa.

PRODUCTO: {art_nom}
DESCUENTO: {descuento_porcentaje}%
FECHA FIN: {fecha_fin}

REQUISITOS:
- 150-160 caracteres
- Incluir descuento claramente
- Crear urgencia sin sonar desesperado
- Mantener beneficio del producto

FORMATO:
"[Producto] con [beneficio]. [Descuento]% OFF solo hasta [fecha]. [Característica diferenciadora]. ¡Compra ya!"

Meta Description:`;
```

---

## 4. Bullet Points de Beneficios

### Template

```javascript
const PROMPT_BULLET_POINTS = `Genera bullet points persuasivos de beneficios.

PRODUCTO: {art_nom}
DESCRIPCIÓN: {art_des}
CATEGORÍA: {categoria}

INSTRUCCIONES:
Genera 5-7 bullet points que:
1. Comienzan con un verbo de acción o símbolo ✓
2. Combinan característica + beneficio emocional
3. Son concisos (máximo 10 palabras cada uno)
4. Evitan jerga técnica excesiva
5. Destacan diferenciadores vs competencia

FORMATO PREFERIDO:
- "[Verbo/✓] [Característica] para [Beneficio emocional]"
- "[Símbolo] [Resultado deseado] gracias a [Característica]"

EJEMPLOS BUENOS:
✓ Cobertura completa en una sola aplicación
✓ Resistente al agua durante 12 horas continuas
✓ Fórmula vegana sin ingredientes de origen animal
✓ Probado dermatológicamente para pieles sensibles

EJEMPLOS MALOS (evitar):
- Es de buena calidad (muy genérico)
- Tiene muchas características (no específico)
- El mejor del mercado (no creíble)

RESPONDE CON ARRAY JSON:
{
  "bullet_points": [
    "Punto 1",
    "Punto 2",
    ...
  ]
}`;
```

---

## 5. Preguntas Frecuentes (FAQ)

### Template

```javascript
const PROMPT_GENERAR_FAQS = `Genera una sección de Preguntas Frecuentes (FAQ) para este producto.

PRODUCTO:
- Nombre: {art_nom}
- Categoría: {categoria}
- Descripción: {art_des}
- Características: {caracteristicas}

CONTEXTO:
Las FAQs deben responder dudas comunes de clientes colombianos comprando online.

GENERA 5-8 PREGUNTAS CON RESPUESTAS:

CATEGORÍAS OBLIGATORIAS:
1. Uso/Aplicación (cómo usar el producto)
2. Ingredientes/Materiales (composición, apto para...)
3. Envíos (tiempos, costos)
4. Garantías/Devoluciones (políticas)
5. Comparación (vs otros productos similares)

FORMATO JSON:
{
  "faqs": [
    {
      "pregunta": "¿Pregunta en forma natural como la haría un cliente?",
      "respuesta": "Respuesta clara, concisa, máximo 2-3 líneas. Incluir dato específico si aplica.",
      "categoria": "uso" | "ingredientes" | "envios" | "garantias" | "comparacion"
    },
    ...
  ]
}

ESTILO DE RESPUESTAS:
- Directas y útiles (no marketeras)
- Incluir números/datos concretos cuando sea posible
- Tono: servicial, profesional
- Terminar con CTA suave si aplica

EJEMPLOS:

BUENA PREGUNTA/RESPUESTA:
P: "¿Cuánto dura el labial sin retoques?"
R: "Hasta 12 horas con uso normal. Es resistente a comidas ligeras y bebidas, pero recomendamos retocar después de comidas pesadas."

MALA PREGUNTA/RESPUESTA:
P: "¿Es bueno el producto?"
R: "Sí, es muy bueno y de excelente calidad."

RESPONDE SOLO CON JSON VÁLIDO:`;
```

---

## 6. Contenido para Redes Sociales

### Template Instagram

```javascript
const PROMPT_INSTAGRAM_CAPTION = `Crea un caption de Instagram para este producto.

PRODUCTO: {art_nom}
PRECIO: ${precio_detal}
BENEFICIO PRINCIPAL: {beneficio}

REQUISITOS:
- Longitud: 100-150 caracteres
- Incluir 2-3 emojis relevantes
- Tono: Casual, aspiracional
- Incluir llamado a la acción
- 2-3 hashtags estratégicos

FORMATO:
"[Emoji] [Hook emocional] [Emoji] [Beneficio breve]. [CTA]. [Hashtags]"

EJEMPLO:
"🔥 Rojo que enamora 💋 Nuestro Labial Rojo Pasión es MATE, de LARGA DURACIÓN y súper HIDRATANTE. Link en bio ✨ #PrettyCosmetics #Belleza #MakeupColombia"

Caption:`;
```

### Template Facebook

```javascript
const PROMPT_FACEBOOK_POST = `Crea un post de Facebook para este producto.

PRODUCTO: {art_nom}
DESCRIPCIÓN: {art_des}

REQUISITOS:
- Longitud: 200-300 caracteres
- Tono: Conversacional, amigable
- Incluir pregunta para engagement
- CTA claro
- Mínimo uso de emojis

FORMATO:
"[Pregunta enganchadora] [Descripción breve con beneficio] [CTA]"

EJEMPLO:
"¿Buscas un labial que realmente dure TODO el día? 💄 Conoce Rojo Pasión: el favorito de nuestras clientas por su color intenso y acabado profesional. Resistente al agua y enriquecido con vitamina E. 👉 Cómpralo ahora con envío gratis."

Post:`;
```

---

## 7. Contenido Estacional

### Template Black Friday

```javascript
const PROMPT_CONTENIDO_BLACK_FRIDAY = `Reescribe el contenido de producto enfocado en Black Friday.

PRODUCTO ORIGINAL:
{contenido_original}

PROMOCIÓN ACTIVA:
- Descuento: {descuento_porcentaje}%
- Fecha inicio: {fecha_inicio}
- Fecha fin: {fecha_fin}
- Stock limitado: {stock_disponible} unidades

OBJETIVO:
Crear urgencia y FOMO sin sonar desesperado. Mantener calidad y beneficios del producto.

ESTRATEGIAS A APLICAR:
1. Urgencia temporal: "Solo hasta {fecha_fin}"
2. Escasez: "Stock limitado"
3. Valor agregado: Enfatizar ahorro real
4. Social proof: "El más vendido en..."
5. Garantía: Reducir riesgo de compra

ESTRUCTURA JSON:
{
  "titulo_promocional": "Versión del título con descuento visible",
  "descripcion_corta_promo": "Resumen con urgencia",
  "banner_text": "Texto corto para banner (ej: '30% OFF - Solo Black Friday')",
  "modificaciones_descripcion": "Párrafo adicional sobre la promo para insertar al inicio",
  "cuenta_regresiva": "Texto para contador (ej: '¡Quedan solo X horas!')"
}

EJEMPLO:
{
  "titulo_promocional": "🔥 BLACK FRIDAY: Labial Rojo Pasión -30% | Últimas 48h",
  "banner_text": "30% OFF - Solo hasta el 25 de Nov",
  "cuenta_regresiva": "¡Últimas 24 horas! No te quedes sin el tuyo"
}

RESPONDE EN JSON VÁLIDO:`;
```

### Template Navidad

```javascript
const PROMPT_CONTENIDO_NAVIDAD = `Adapta el contenido para temporada navideña.

PRODUCTO: {art_nom}

ENFOQUE:
- Posicionar como regalo ideal
- Tono: Cálido, festivo
- Mencionar opciones de regalo
- Destacar presentación/empaque
- Incluir idea de uso en fiestas

JSON:
{
  "titulo_navidad": "...",
  "descripcion_regalo": "Por qué es el regalo perfecto",
  "ideas_uso": "Cómo lucirlo en fiestas"
}`;
```

---

## 8. Alt Text para Imágenes

### Template

```javascript
const PROMPT_ALT_TEXT = `Genera alt text descriptivo y SEO-friendly para imagen de producto.

PRODUCTO: {art_nom}
CATEGORÍA: {categoria}
TIPO DE IMAGEN: {tipo_imagen} // "producto", "uso", "detalle", "lifestyle"

REQUISITOS:
- Máximo 125 caracteres
- Describir qué se ve en la imagen
- Incluir keyword principal
- Ser específico y descriptivo
- No usar "imagen de" o "foto de"

EJEMPLOS:

BUENO:
"Labial mate rojo intenso Pretty Cosmetics sobre fondo blanco, mostrando textura cremosa"

MALO:
"Imagen de un labial" (muy genérico)
"Foto del producto Labial Rojo Pasión" (usa "foto de")

Alt Text:`;
```

---

## 🔧 Uso de Templates

### Ejemplo de Implementación

```javascript
// services/ai/promptBuilder.js

const { promptTemplates } = require('../../config/promptTemplates');

const build = (producto, tipos = ['all'], idioma = 'es') => {
  const categoria = mapCategoria(producto.inv_sub_gru_cod);

  // Seleccionar template según categoría
  const template = promptTemplates[categoria] || promptTemplates.default;

  // Construir prompt reemplazando variables
  let prompt = template.descripcion_completa;
  prompt = prompt
    .replace('{art_nom}', producto.art_nom)
    .replace('{categoria}', categoria)
    .replace('{precio_detal}', producto.precio_detal)
    .replace('{art_des}', producto.art_des || 'Sin descripción');

  return prompt;
};
```

---

## 📊 Mejores Prácticas

### DO's ✅

1. **Usar variables dinámicas** - Permitir personalización por producto
2. **Validar longitudes** - Respetar límites de caracteres (SEO)
3. **Tono consistente** - Mantener voz de marca
4. **Incluir contexto** - Categoría, precio, público objetivo
5. **Especificar formato** - JSON, HTML, texto plano
6. **Dar ejemplos** - Mostrar buenos y malos casos

### DON'Ts ❌

1. **No ser ambiguo** - Instrucciones claras y específicas
2. **No omitir límites** - Siempre especificar max caracteres
3. **No ignorar SEO** - Keywords naturales, no stuffing
4. **No usar jerga** - Lenguaje accesible
5. **No exagerar** - Promesas verificables
6. **No olvidar CTA** - Siempre incluir llamado a la acción

---

## 🧪 Testing de Prompts

### Checklist de Validación

- [ ] ¿El prompt produce JSON válido consistentemente?
- [ ] ¿Respeta límites de caracteres (título 60, meta 160)?
- [ ] ¿Incluye keywords naturalmente?
- [ ] ¿Tono apropiado para la categoría?
- [ ] ¿CTA claro y persuasivo?
- [ ] ¿Contenido único (no repetitivo)?
- [ ] ¿Tasa de aprobación humana >80%?

### Iteración de Prompts

1. **Generar 10 muestras** con el prompt
2. **Evaluar calidad** (escala 1-5)
3. **Identificar patrones** de buenos/malos resultados
4. **Ajustar instrucciones** según patrones
5. **Re-testear** con nuevas muestras
6. **Repetir** hasta alcanzar meta de calidad

---

**Última actualización:** 2026-02-11
**Versión:** 1.0
