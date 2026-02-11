# Análisis Completo: Integración de IA para Optimización de Contenido

**Fecha:** 2026-02-11
**Versión:** 1.0
**Autor:** Análisis generado por agente especializado

---

## Tabla de Contenidos

1. [Casos de Uso Específicos](#1-casos-de-uso-específicos)
2. [Arquitectura Propuesta](#2-arquitectura-propuesta)
3. [Comparación de Proveedores de IA](#3-comparación-de-proveedores-de-ia)
4. [Flujos de Trabajo](#4-flujos-de-trabajo)
5. [Funcionalidades Específicas](#5-funcionalidades-específicas)
6. [Consideraciones Técnicas](#6-consideraciones-técnicas)
7. [Integración con Sistema Existente](#7-integración-con-sistema-existente)
8. [Modelo de Datos](#8-modelo-de-datos)
9. [Ejemplo de Implementación](#9-ejemplo-de-implementación)
10. [Prompts Recomendados](#10-prompts-recomendados)

---

## 1. Casos de Uso Específicos

### 1.1 Contenido a Optimizar por IA

**Prioridad Alta:**
- **Título del Producto** - Versión SEO optimizada del `art_nom` original
- **Meta Description** - Snippet para motores de búsqueda (SERP)
- **Descripción Larga** - HTML enriquecido con keywords, beneficios, CTAs
- **Short Description** - Resumen persuasivo para WooCommerce

**Prioridad Media:**
- **Keywords/Tags** - Extracción y generación automática de etiquetas
- **Títulos de Variaciones** - Para productos variables, nombres atractivos
- **Bullet Points** - Lista de beneficios/características clave
- **FAQs** - Preguntas frecuentes generadas automáticamente

**Prioridad Baja:**
- **Alt Text para Imágenes** - Descripciones accesibles y SEO
- **Nombres de Bundles** - Títulos creativos para kits/combos
- **Contenido para Eventos Promocionales** - Copy para campañas

### 1.2 Momentos de Activación

**Flujo Reactivo (Recomendado para MVP):**
1. **Creación Manual de Producto** - Botón "Optimizar con IA" en interfaz
2. **Pre-Sincronización WooCommerce** - Opción de optimizar antes de publicar
3. **Actualización Masiva** - Endpoint para optimizar lote de productos
4. **Webhook Post-Sincronización** - Optimizar productos importados desde WooCommerce

**Flujo Proactivo (Avanzado - Fase 2):**
1. **Background Job Nocturno** - Optimizar productos sin contenido IA en lotes
2. **Trigger por Cambio de Categoría** - Re-optimizar cuando cambia contexto
3. **Optimización Estacional** - Actualizar copy para temporadas

### 1.3 Integración con Flujo Actual

```javascript
// controllers/wooSyncController.js - Punto de integración sugerido

const syncProductToWoo = async (art_sec) => {
  // 1. Obtener datos del producto
  const producto = await articulosModel.getArticuloById(art_sec);

  // 2. NUEVO: Verificar si existe contenido IA optimizado
  const contenidoIA = await aiOptimizationModel.getActiveContent(art_sec);

  // 3. NUEVO: Si no existe y usuario habilitó optimización, generar
  if (!contenidoIA && producto.art_optimizar_ia === 'S') {
    const optimizacion = await aiService.optimizeProduct(producto);
    await aiOptimizationModel.saveContent(art_sec, optimizacion);
    contenidoIA = optimizacion;
  }

  // 4. Preparar datos para WooCommerce (usar IA si existe)
  const wooData = {
    name: contenidoIA?.titulo_seo || producto.art_nom,
    description: contenidoIA?.descripcion_larga || producto.art_des,
    short_description: contenidoIA?.descripcion_corta || '',
    meta_data: [
      { key: '_yoast_wpseo_metadesc', value: contenidoIA?.meta_description || '' },
      { key: '_ai_optimized', value: contenidoIA ? 'yes' : 'no' }
    ]
  };

  // 5. Sincronizar
  await wcApi.post('products', wooData);
};
```

---

## 2. Arquitectura Propuesta

### 2.1 Modelo Híbrido Recomendado

**Tabla Separada + Campos de Control en `articulos`:**

```sql
-- Campos de control en tabla principal
ALTER TABLE articulos ADD (
  art_optimizar_ia CHAR(1) DEFAULT 'N',
  art_tiene_contenido_ia CHAR(1) DEFAULT 'N',
  art_fecha_ultima_optimizacion DATETIME NULL
);

-- Tabla dedicada para versiones de contenido IA
CREATE TABLE articulos_ai_content (
  ai_sec INT IDENTITY(1,1) PRIMARY KEY,
  art_sec VARCHAR(30) NOT NULL,
  ai_tipo VARCHAR(20) NOT NULL,
  ai_contenido TEXT NOT NULL,
  ai_version INT NOT NULL DEFAULT 1,
  ai_estado CHAR(1) DEFAULT 'P',
  ai_modelo VARCHAR(50) NOT NULL,
  ai_prompt_hash VARCHAR(64),
  ai_tokens_usados INT,
  ai_costo_usd DECIMAL(10,6),
  ai_fecha_generacion DATETIME DEFAULT GETDATE(),
  ai_usuario_aprobador VARCHAR(20),
  ai_fecha_aprobacion DATETIME,
  CONSTRAINT FK_ai_content_articulos FOREIGN KEY (art_sec)
    REFERENCES articulos(art_sec),
  CONSTRAINT UQ_ai_content_version UNIQUE (art_sec, ai_tipo, ai_version)
);
```

### 2.2 Sistema de Cache Inteligente

**Estrategia de Cache en Múltiples Niveles:**

```javascript
// NIVEL 1: Cache en BD por prompt hash
const getCachedContent = async (promptHash, maxAge = 30) => {
  const cached = await pool.query(`
    SELECT TOP 1 ai_contenido, ai_modelo
    FROM articulos_ai_content
    WHERE ai_prompt_hash = @hash
      AND ai_estado = 'A'
      AND ai_fecha_generacion > DATEADD(day, -@maxAge, GETDATE())
    ORDER BY ai_fecha_generacion DESC
  `, { hash: promptHash, maxAge });

  return cached.recordset[0];
};

// NIVEL 2: Cache en memoria (opcional)
const memoryCache = new Map();
const CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 días
```

---

## 3. Comparación de Proveedores de IA

### 3.1 Tabla Comparativa

| Criterio | OpenAI GPT-4 | Google Gemini 1.5 Pro | Anthropic Claude 3.5 |
|----------|-------------|----------------------|---------------------|
| **Costo (1M tokens output)** | $10-$30 | $3.50-$10.50 | $15 |
| **Contexto máximo** | 128K tokens | 2M tokens | 200K tokens |
| **Velocidad** | Media | Rápida | Rápida |
| **Calidad copywriting** | Excelente | Muy buena | Excelente |
| **Soporte español** | Nativo | Nativo | Nativo |
| **Rate limits** | 500 RPM (Tier 1) | 1000 RPM | 50 RPM (free) |
| **JSON mode** | Sí (native) | Sí | Sí |
| **Multimodal** | Sí (GPT-4V) | Sí | Sí |

### 3.2 Recomendación: OpenAI GPT-4 Turbo + Google Gemini (Fallback)

**Por qué esta combinación:**

1. **GPT-4 Turbo** como principal:
   - Mejor calidad para copywriting persuasivo
   - JSON mode nativo (fácil parseo)
   - Documentación extensa
   - Costo razonable con gpt-4-turbo-preview

2. **Gemini 1.5 Pro** como fallback:
   - Menor costo para operaciones batch
   - Mayor contexto (útil para catálogos)
   - Menor latencia
   - Diversificación de proveedores

3. **Estrategia de uso:**
   ```javascript
   const modelo = esNuevoProducto ? 'gpt-4-turbo' : 'gemini-1.5-pro';
   ```

---

## 4. Flujos de Trabajo

### 4.1 Opción A: Optimización Bajo Demanda (RECOMENDADA para MVP)

**Flujo:**
```
Usuario crea/edita producto
  ↓
Marca checkbox "Optimizar con IA antes de publicar"
  ↓
Al guardar, se crea registro con art_optimizar_ia='S'
  ↓
Usuario hace clic en "Sincronizar con WooCommerce"
  ↓
Sistema detecta flag, llama a IA
  ↓
Muestra preview de contenido generado
  ↓
Usuario aprueba/edita/rechaza
  ↓
Si aprobado, sincroniza con contenido optimizado
```

**Endpoints:**
```javascript
// POST /api/articulos/:art_sec/optimize
// Genera contenido IA sin publicar
router.post('/:art_sec/optimize', auth, aiController.generateOptimization);

// PUT /api/articulos/:art_sec/ai-content/:ai_sec/approve
// Aprueba una versión de contenido
router.put('/:art_sec/ai-content/:ai_sec/approve', auth, aiController.approveContent);
```

### 4.2 Opción B: Optimización Automática con Revisión

**Flujo:**
```
Usuario crea producto
  ↓
Sistema automáticamente llama a IA (background)
  ↓
Guarda contenido en estado 'P' (Pendiente)
  ↓
Notifica a usuario "Optimización IA lista para revisar"
  ↓
Usuario revisa en panel dedicado
  ↓
Aprueba/Rechaza/Edita
```

**Ventajas:** Reduce fricción, contenido listo más rápido
**Desventajas:** Costos menos controlados

### 4.3 Opción C: Batch Optimization (Para Catálogo Existente)

**Flujo:**
```
Administrador selecciona categoría/grupo
  ↓
POST /api/ai/batch-optimize
  ↓
Job en background procesa lote
  ↓
Genera reporte CSV con resultados
  ↓
Administrador revisa en panel masivo
```

**Implementación:**
```javascript
// jobs/batchAiOptimization.js
const optimizeBatch = async (filters, options = {}) => {
  const { categoria, limit = 50, modelo = 'gemini-1.5-pro' } = options;

  const productos = await pool.query(`
    SELECT TOP ${limit} art_sec, art_nom, art_des
    FROM articulos
    WHERE inv_sub_gru_cod = @categoria
      AND art_tiene_contenido_ia = 'N'
      AND art_est = 'A'
  `, { categoria });

  for (const producto of productos.recordset) {
    await sleep(1000); // Rate limiting
    const optimizado = await aiService.optimizeProduct(producto, modelo);
    await aiOptimizationModel.saveContent(producto.art_sec, optimizado);
  }
};
```

---

## 5. Funcionalidades Específicas

### 5.1 Outputs Estructurados por Producto

```json
{
  "titulo_seo": "Labial Rojo Pasión Matte - Larga Duración 12h | Pretty Cosmetics",
  "meta_description": "Descubre el Labial Rojo Pasión: color intenso, acabado mate y larga duración. Fórmula hidratante con vitamina E. ¡Envío gratis!",

  "descripcion_larga_html": "<h2>Labial Rojo Pasión: El Toque Final Perfecto</h2><p>Experimenta un color vibrante que dura hasta 12 horas...</p>",

  "descripcion_corta": "Labial mate de larga duración con color intenso y fórmula hidratante.",

  "keywords": ["labial rojo", "labial mate", "larga duración", "maquillaje profesional"],

  "bullet_points": [
    "Cobertura completa en una sola aplicación",
    "Resistente al agua y transferencias",
    "Sin parabenos ni crueldad animal"
  ],

  "preguntas_frecuentes": [
    {
      "pregunta": "¿Cuánto dura el labial sin retoques?",
      "respuesta": "Hasta 12 horas con uso normal."
    }
  ]
}
```

### 5.2 Funcionalidades Adicionales

**1. Generación de Contenido para Variaciones:**
```javascript
const variaciones = [
  { nombre: "Rojo Pasión", hex: "#C41E3A" },
  { nombre: "Nude Elegance", hex: "#D4AF97" }
];
await aiService.generateVariationContent(producto, variaciones);
```

**2. Contenido Estacional Automático:**
```javascript
if (isNearBlackFriday()) {
  prompt += "\nEnfatiza descuentos y urgencia de compra.";
}
```

**3. Optimización A/B Testing:**
```javascript
const versiones = await aiService.generateMultipleVersions(producto, { count: 3 });
await abTestingService.trackConversion(ai_sec, orderCount);
```

---

## 6. Consideraciones Técnicas

### 6.1 Manejo de Costos

**Estimación de Costos (GPT-4 Turbo):**
```
Producto promedio:
- Input: ~500 tokens
- Output: ~800 tokens
- Costo: ~$0.015 USD

Catálogo 1000 productos: ~$15 USD
Re-optimizaciones mensuales: ~$5 USD/mes
```

**Estrategias de Optimización:**

```javascript
// 1. Rate Limiting
const rateLimiter = {
  gpt4: { requestsPerMinute: 500, maxConcurrent: 10 }
};

// 2. Presupuesto Mensual
const budgetControl = {
  maxCostPerMonth: 100,
  alertThreshold: 0.8,
  pauseAtLimit: true
};

// 3. Cache Agresivo
const checkBudget = async () => {
  const gasto = await pool.query(`
    SELECT SUM(ai_costo_usd) as total
    FROM articulos_ai_content
    WHERE ai_fecha_generacion >= DATEADD(month, -1, GETDATE())
  `);

  if (gasto.recordset[0].total > budgetControl.maxCostPerMonth) {
    throw new Error('Presupuesto mensual de IA excedido');
  }
};
```

### 6.2 Validación Humana

**Sistema de Aprobación:**

```javascript
const approvalWorkflows = {
  admin: 'auto',      // Aprobación automática
  editor: 'review',   // Requiere revisión
  basic: 'strict'     // Requiere aprobación de supervisor
};
```

### 6.3 Sistema de Prompts Configurables

```javascript
// config/promptTemplates.js
const promptTemplates = {
  belleza: {
    titulo_seo: `Genera un título SEO optimizado para un producto de belleza.

Producto: {art_nom}
Categoría: {categoria}
Precio: ${art_precio}

Requisitos:
- Máximo 60 caracteres
- Incluir beneficio principal
- Optimizado para búsqueda en Colombia`
  }
};
```

---

## 7. Integración con Sistema Existente

### 7.1 Estructura de Módulos Propuesta

```
/services/ai/
  aiService.js           # Orquestador principal
  openaiProvider.js      # Cliente OpenAI
  geminiProvider.js      # Cliente Google Gemini
  promptBuilder.js       # Constructor de prompts
  responseParser.js      # Parseo de respuestas

/models/
  aiOptimizationModel.js # CRUD contenido IA

/controllers/
  aiController.js        # Endpoints de optimización

/config/
  promptTemplates.js     # Templates de prompts
```

### 7.2 Implementación de Módulos Clave

Ver sección 9 para código completo de ejemplo.

---

## 8. Modelo de Datos

### 8.1 Script SQL Completo

```sql
-- 1. Modificar tabla articulos
ALTER TABLE articulos ADD
  art_optimizar_ia CHAR(1) DEFAULT 'N',
  art_tiene_contenido_ia CHAR(1) DEFAULT 'N',
  art_fecha_ultima_optimizacion DATETIME NULL;

-- 2. Tabla principal de contenido IA
CREATE TABLE articulos_ai_content (
  ai_sec INT IDENTITY(1,1) PRIMARY KEY,
  art_sec VARCHAR(30) NOT NULL,
  ai_tipo VARCHAR(20) NOT NULL,
  ai_contenido TEXT NOT NULL,
  ai_version INT NOT NULL DEFAULT 1,
  ai_estado CHAR(1) DEFAULT 'P',
  ai_idioma VARCHAR(5) DEFAULT 'es',
  ai_modelo VARCHAR(50) NOT NULL,
  ai_prompt_hash VARCHAR(64),
  ai_tokens_usados INT DEFAULT 0,
  ai_costo_usd DECIMAL(10,6) DEFAULT 0,
  ai_fecha_generacion DATETIME DEFAULT GETDATE(),
  ai_usuario_aprobador VARCHAR(20),
  ai_fecha_aprobacion DATETIME,

  CONSTRAINT FK_ai_content_articulos FOREIGN KEY (art_sec)
    REFERENCES articulos(art_sec) ON DELETE CASCADE
);

-- Índices
CREATE INDEX IDX_ai_content_active
  ON articulos_ai_content(art_sec, ai_tipo, ai_estado, ai_idioma);
CREATE INDEX IDX_ai_content_prompts
  ON articulos_ai_content(ai_prompt_hash);
```

### 8.2 Justificación

1. **Tabla separada** - Mantiene datos originales intactos
2. **Versionado** - Histórico completo de cambios
3. **Multiidioma** - Soporte nativo
4. **Auditoría** - Tracking de costos y tokens
5. **Performance** - Índices estratégicos

---

## 9. Ejemplo de Implementación

### 9.1 Flujo Completo End-to-End

**Paso 1: Frontend solicita optimización**
```javascript
// POST /api/articulos/LAB-RP-001/optimize
{
  "modelo": "gpt-4-turbo",
  "idioma": "es"
}
```

**Paso 2: AI Service genera contenido**
```javascript
// services/ai/aiService.js
async optimizeProduct(producto, options = {}) {
  const prompt = promptBuilder.build(producto);
  const promptHash = crypto.createHash('sha256').update(prompt).digest('hex');

  // Verificar cache
  const cached = await this.checkCache(promptHash);
  if (cached) return cached;

  // Llamar OpenAI
  const respuesta = await openaiProvider.generate(prompt);
  const contenido = JSON.parse(respuesta.content);

  // Guardar métricas
  await this.saveUsageMetrics({
    art_sec: producto.art_sec,
    modelo: 'gpt-4-turbo',
    tokensUsados: respuesta.usage.total_tokens,
    costoUSD: this.calculateCost('gpt-4-turbo', respuesta.usage)
  });

  return contenido;
}
```

**Paso 3: Usuario revisa y aprueba**
```javascript
// PUT /api/ai/content/1/approve
await aiOptimizationModel.approveContent(1, 'admin');
```

**Paso 4: Sincronización con WooCommerce**
```javascript
const contenidoIA = await aiOptimizationModel.getActiveContent(art_sec);

const wooData = {
  name: contenidoIA?.titulo_seo || producto.art_nom,
  description: contenidoIA?.descripcion_larga_html || producto.art_des,
  meta_data: [
    { key: '_yoast_wpseo_metadesc', value: contenidoIA?.meta_description }
  ]
};

await wcApi.post('products', wooData);
```

---

## 10. Prompts Recomendados

### 10.1 Template: Descripción de Producto de Belleza

```javascript
const PROMPT_DESCRIPCION_BELLEZA = `Eres un experto copywriter especializado en productos de belleza.

PRODUCTO:
- Nombre: {art_nom}
- Categoría: {categoria}
- Precio: ${precio_detal} COP

GENERA JSON:
{
  "titulo_seo": "Título optimizado (max 60 chars)",
  "meta_description": "Meta desc (max 160 chars)",
  "descripcion_larga_html": "HTML completo",
  "keywords": ["array", "de", "keywords"]
}

DIRECTRICES:
1. Tono profesional pero cercano
2. 60% beneficios emocionales, 40% técnicos
3. SEO natural, evita keyword stuffing
4. Localización colombiana

RESPONDE SOLO CON JSON VÁLIDO.`;
```

### 10.2 Template: Título SEO

```javascript
const PROMPT_TITULO_SEO = `Genera título SEO para producto de e-commerce.

PRODUCTO: {art_nom}
CATEGORÍA: {categoria}

REGLAS:
1. Máximo 60 caracteres
2. Incluir: [Producto] + [Beneficio] + [Marca]
3. Capitalización: Title Case
4. Keywords de alto volumen

RESPONDE SOLO CON EL TÍTULO.`;
```

### 10.3 Template: Meta Description

```javascript
const PROMPT_META_DESCRIPTION = `Crea meta descripción para SERP.

PRODUCTO: {art_nom}
PRECIO: ${precio_detal}

REQUISITOS:
- 150-160 caracteres (CRÍTICO)
- Beneficio principal + CTA
- Usar números cuando posible
- Keyword principal natural

FÓRMULA: "[Descripción] + [Beneficio único]. [CTA]"

RESPONDE SOLO CON LA META DESCRIPTION.`;
```

---

## Conclusión

Este análisis proporciona una base sólida y accionable para integrar IA en el sistema de inventario, con un enfoque pragmático que balancea innovación, costos y calidad.

**Recomendación Final:** Implementar MVP incremental comenzando con Fase 1 (Base de Datos), seguida de Backend Core, validando calidad con categoría piloto antes de expandir.

---

**Última actualización:** 2026-02-11
