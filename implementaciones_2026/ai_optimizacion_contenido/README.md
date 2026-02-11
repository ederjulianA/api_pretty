# Optimización de Contenido con IA

**Fecha:** 2026-02-11
**Estado:** 📋 Análisis completado - Pendiente de aprobación para MVP
**Versión:** 1.0

---

## 🎯 Objetivo

Integrar modelos de IA (OpenAI GPT-4, Google Gemini) para optimizar automáticamente el contenido de productos antes de sincronizar con WooCommerce, mejorando SEO y conversión de ventas.

---

## 📋 Resumen Ejecutivo

### Problema a Resolver
- Descripciones de productos genéricas y poco optimizadas para SEO
- Tiempo manual elevado para crear contenido persuasivo
- Falta de keywords estratégicas y CTAs efectivos
- Contenido inconsistente entre productos similares

### Solución Propuesta
Sistema de optimización de contenido con IA que genera automáticamente:
- Títulos SEO optimizados (máx 60 caracteres)
- Meta descriptions para SERP (máx 160 caracteres)
- Descripciones largas en HTML con estructura persuasiva
- Keywords relevantes, bullet points, FAQs
- Contenido para redes sociales (Instagram, Facebook)

### Beneficios Esperados
1. **SEO:** Mejora en posicionamiento de búsqueda orgánica
2. **Conversión:** Aumento en tasa de conversión (contenido persuasivo)
3. **Eficiencia:** Reducción de tiempo de creación de contenido en 80%
4. **Consistencia:** Calidad uniforme en todo el catálogo
5. **Multicanal:** Contenido listo para e-commerce + redes sociales

---

## 💰 Estimación de Costos

### Modelo Recomendado: OpenAI GPT-4 Turbo

| Concepto | Costo Unitario | Volumen | Total |
|----------|----------------|---------|-------|
| **Optimización por producto** | ~$0.015 USD | 1 producto | $0.015 |
| **Catálogo completo (1000 productos)** | ~$0.015 USD | 1000 productos | ~$15 USD |
| **Re-optimizaciones mensuales** | ~$0.015 USD | ~300 productos/mes | ~$5 USD/mes |

**Presupuesto mensual sugerido:** $100 USD/mes (suficiente para ~6,600 optimizaciones)

---

## 🏗️ Arquitectura Técnica

### Modelo de Datos Híbrido

**Campos de Control en `articulos`:**
```sql
art_optimizar_ia CHAR(1) DEFAULT 'N'           -- Flag de activación
art_tiene_contenido_ia CHAR(1) DEFAULT 'N'     -- Cache flag
art_fecha_ultima_optimizacion DATETIME NULL
```

**Tabla Separada para Contenido IA:**
```sql
articulos_ai_content (
  ai_sec INT IDENTITY PRIMARY KEY,
  art_sec VARCHAR(30) FK,
  ai_tipo VARCHAR(20),              -- 'seo_title', 'meta_desc', etc
  ai_contenido TEXT,
  ai_version INT,
  ai_estado CHAR(1),                -- P=Pendiente, A=Aprobado, R=Rechazado
  ai_idioma VARCHAR(5),
  ai_modelo VARCHAR(50),            -- 'gpt-4-turbo', 'gemini-1.5-pro'
  ai_prompt_hash VARCHAR(64),       -- SHA256 para cache
  ai_tokens_usados INT,
  ai_costo_usd DECIMAL(10,6),
  ai_fecha_generacion DATETIME,
  ai_usuario_aprobador VARCHAR(20)
)
```

### Ventajas de esta Arquitectura
- ✅ **Versionado completo** - Histórico de todas las optimizaciones
- ✅ **Contenido original intacto** - No modifica datos base
- ✅ **Sistema de aprobación** - Control humano antes de publicar
- ✅ **Métricas de costos** - Tracking de uso y ROI
- ✅ **Cache inteligente** - Reutiliza respuestas por hash de prompt
- ✅ **Multiidioma** - Soporte para español, inglés, portugués

---

## 🚀 Plan de Implementación MVP

### Fase 1: Base de Datos (1 día)
- [ ] Ejecutar script de migración SQL
- [ ] Crear tablas: `articulos_ai_content`, `ai_usage_log`
- [ ] Crear índices para performance
- [ ] Testing de compatibilidad con código existente

### Fase 2: Backend Core (5 días)
- [ ] Módulo `services/ai/aiService.js` - Orquestador principal
- [ ] Módulo `services/ai/openaiProvider.js` - Cliente OpenAI
- [ ] Módulo `services/ai/promptBuilder.js` - Constructor de prompts
- [ ] Módulo `models/aiOptimizationModel.js` - CRUD contenido
- [ ] Módulo `controllers/aiController.js` - Endpoints API
- [ ] Sistema de cache por hash de prompt

### Fase 3: Integración WooCommerce (3 días)
- [ ] Modificar `wooSyncController.js` para usar contenido IA
- [ ] Endpoint `POST /api/articulos/:art_sec/optimize`
- [ ] Endpoint `PUT /api/ai/content/:ai_sec/approve`
- [ ] Endpoint `GET /api/ai/content/:art_sec/versions`
- [ ] Testing de sincronización con contenido optimizado

### Fase 4: Testing y Validación (3 días)
- [ ] Testing con categoría piloto (Maquillaje)
- [ ] Validación de calidad de contenido generado
- [ ] Ajuste de prompts según feedback
- [ ] Métricas de tasa de aprobación (meta: >80%)

**Total MVP:** 12 días hábiles (~2.5 semanas)

---

## 📊 Contenido Generado por IA

### Estructura JSON de Salida

```json
{
  "titulo_seo": "Labial Rojo Pasión Matte - Larga Duración 12h | Pretty",
  "meta_description": "Labial mate rojo intenso con fórmula de larga duración. Resistente al agua, enriquecido con vitamina E. ¡Envío gratis!",
  "descripcion_larga_html": "<h2>El Rojo que Habla por Ti</h2><p>Descubre la pasión del color...</p><ul><li>✓ Acabado mate profesional</li></ul>",
  "descripcion_corta": "Labial mate de larga duración con color intenso y fórmula hidratante.",
  "keywords": ["labial rojo", "labial mate", "larga duración", "maquillaje profesional"],
  "bullet_points": [
    "Cobertura completa en una sola aplicación",
    "Resistente al agua y transferencias",
    "Sin parabenos ni crueldad animal"
  ],
  "llamados_accion": [
    "Añade a tu carrito y recibe envío gratis",
    "Compra 2 y obtén 15% de descuento"
  ],
  "preguntas_frecuentes": [
    {
      "pregunta": "¿Cuánto dura el labial sin retoques?",
      "respuesta": "Hasta 12 horas con uso normal, resistente a comidas y bebidas."
    }
  ],
  "contenido_redes": {
    "instagram_caption": "🔥 Rojo que enamora 💋 #PrettyCosmetics",
    "facebook_post": "¿Buscas un labial que dure TODO el día? 💄"
  }
}
```

---

## 🔄 Flujo de Trabajo Recomendado

### Opción MVP: Optimización Bajo Demanda

```
1. Usuario crea/edita producto en sistema
   ↓
2. Marca checkbox "Optimizar con IA antes de publicar"
   ↓
3. Sistema guarda producto con art_optimizar_ia='S'
   ↓
4. Usuario hace clic en "Generar Optimización IA"
   ↓
5. Sistema llama a OpenAI GPT-4 con contexto del producto
   ↓
6. Contenido generado se guarda con estado='P' (Pendiente)
   ↓
7. Usuario revisa contenido en panel de aprobación
   ↓
8. Usuario aprueba/edita/rechaza contenido
   ↓
9. Al sincronizar con WooCommerce → usa contenido aprobado
   ↓
10. Tracking de métricas (conversión, SEO ranking)
```

---

## 🎯 Endpoints API

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/articulos/:art_sec/optimize` | Genera contenido IA para producto |
| GET | `/api/articulos/:art_sec/ai-content` | Obtiene versiones de contenido |
| PUT | `/api/ai/content/:ai_sec/approve` | Aprueba versión de contenido |
| PUT | `/api/ai/content/:ai_sec/reject` | Rechaza versión de contenido |
| GET | `/api/ai/pending-approvals` | Lista contenido pendiente de aprobación |
| GET | `/api/ai/usage-stats` | Métricas de uso y costos |
| POST | `/api/ai/batch-optimize` | Optimización masiva por categoría |

---

## 📈 Métricas de Éxito

### Métricas Clave (KPIs)

1. **SEO Performance**
   - Posiciones en SERP para keywords objetivo
   - Incremento en tráfico orgánico
   - CTR en resultados de búsqueda

2. **Conversión**
   - Tasa de conversión de productos optimizados vs no optimizados
   - Aumento en valor promedio de orden (AOV)
   - Reducción en tasa de rebote

3. **Eficiencia Operacional**
   - Tiempo de creación de contenido (manual vs IA)
   - Tasa de aprobación de contenido IA (meta: >80%)
   - Costo por producto optimizado

4. **ROI**
   - Costo mensual de IA vs incremento en ventas
   - Payback period del MVP

---

## 🔒 Consideraciones de Seguridad

### Control de Presupuesto

```javascript
const budgetControl = {
  maxCostPerMonth: 100,      // USD
  alertThreshold: 0.8,       // Alertar al 80%
  pauseAtLimit: true         // Pausar al alcanzar límite
};
```

### Validación de Contenido

- ✅ Sistema de aprobación humana obligatorio (MVP)
- ✅ Validación de longitud de campos (SEO limits)
- ✅ Detección de contenido inapropiado/spam
- ✅ Verificación de keywords relevantes

### Rate Limiting

- GPT-4 Turbo: 500 requests/min (Tier 1)
- Gemini 1.5 Pro: 1000 requests/min
- Cache agresivo por hash de prompt (30 días TTL)

---

## 📚 Documentación Completa

| Archivo | Descripción |
|---------|-------------|
| `README.md` | Este archivo - Resumen ejecutivo |
| `ANALISIS_COMPLETO.md` | Análisis técnico detallado (10 secciones) |
| `ARQUITECTURA_TECNICA.md` | Diseño de módulos y base de datos |
| `PROMPTS_TEMPLATES.md` | Templates de prompts por categoría |
| `01_migracion_ai_content.sql` | Script de migración SQL |
| `PLAN_FASES.md` | Plan de implementación detallado |
| `METRICAS_ROI.md` | Framework de medición de resultados |

---

## ⚠️ Próximos Pasos

### Para Aprobar MVP:

1. ✅ Revisar análisis completo en `ANALISIS_COMPLETO.md`
2. ✅ Validar modelo de datos propuesto
3. ✅ Aprobar presupuesto mensual ($100 USD)
4. ✅ Seleccionar categoría piloto (recomendado: Maquillaje)
5. ✅ Confirmar proveedor de IA (OpenAI vs Gemini vs ambos)

### Una Vez Aprobado:

1. Ejecutar migración SQL
2. Configurar cuenta OpenAI y obtener API key
3. Implementar módulos base (aiService, aiOptimizationModel)
4. Testing con 10 productos piloto
5. Iterar prompts según calidad
6. Desplegar en producción con categoría piloto
7. Medir resultados durante 4 semanas
8. Expandir a más categorías si ROI positivo

---

## 🔗 Referencias

- **Análisis Completo:** Ver `ANALISIS_COMPLETO.md`
- **OpenAI API Docs:** https://platform.openai.com/docs
- **Google Gemini API:** https://ai.google.dev/docs
- **Prompt Engineering Guide:** https://www.promptingguide.ai/

---

**Última actualización:** 2026-02-11
**Estado:** Documentación completada, pendiente de aprobación para iniciar MVP
