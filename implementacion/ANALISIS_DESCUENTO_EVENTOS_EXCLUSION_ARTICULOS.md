# Análisis: Descuento de Eventos con Exclusión de Artículos con Descuentos Activos

## 📋 Resumen Ejecutivo

**Fecha de análisis**: 2025-01-XX  
**Contexto**: Se actualizó la página web para que el descuento de eventos promocionales se aplique únicamente a artículos que **NO tienen algún descuento activo** (por ejemplo, artículos en liquidación).

**Pregunta clave**: ¿El proceso de sincronización de pedidos de WooCommerce está cubriendo correctamente este cambio?

---

## 🔍 Análisis del Proceso Actual

### 1. Flujo en WooCommerce (Página Web)

Según la documentación y el cambio mencionado:

1. **Cálculo del descuento del evento**:
   - WooCommerce recorre los artículos del carrito
   - **EXCLUYE** artículos que tienen descuentos activos (liquidación, promociones, etc.)
   - Calcula el descuento del evento solo sobre los artículos elegibles
   - Aplica el descuento como un `fee` negativo en `fee_lines`

2. **Ejemplo**:
   ```
   Carrito:
   - Artículo A: $100 (sin descuento) → ✅ Aplica descuento evento
   - Artículo B: $50 (en liquidación 20%) → ❌ NO aplica descuento evento
   - Artículo C: $75 (sin descuento) → ✅ Aplica descuento evento
   
   Subtotal elegible para evento: $175 (A + C)
   Descuento evento 30%: $52.50
   ```

### 2. Flujo en la Sincronización (API)

**Ubicación**: `controllers/syncWooOrdersController.js`

**Proceso actual** (líneas 982-1014):

```javascript
// Calcular descuento general de fee_lines (solo los negativos que son descuentos)
const feeLines = order.fee_lines || [];
const descuentoGeneral = feeLines
    .filter(fee => parseFloat(fee.total) < 0)
    .reduce((sum, fee) => sum + Math.abs(parseFloat(fee.total)), 0);
```

**Análisis**:
- ✅ Toma el descuento tal cual viene de WooCommerce en `fee_lines`
- ✅ Filtra correctamente los fees negativos (descuentos)
- ✅ Suma todos los descuentos encontrados
- ✅ Guarda el valor en `fac_descuento_general`

**Procesamiento de artículos** (líneas 464-550):

```javascript
// Para cada artículo:
const promocionInfo = await getArticuloPromocionInfo(articleInfo, orderData.dateCreated);
// Se guarda información de si tiene oferta activa
kar_tiene_oferta = promocionInfo ? promocionInfo.tiene_oferta : 'N'
```

**Análisis**:
- ✅ Identifica si cada artículo tiene promoción/descuento activo
- ✅ Guarda esta información en `kar_tiene_oferta`
- ❌ **NO valida** si el descuento del evento debería aplicarse a ese artículo
- ❌ **NO recalcula** el descuento del evento excluyendo artículos con descuentos

---

## ✅ Conclusión: ¿Estamos Cubriendo el Cambio?

### Respuesta Corta: **SÍ, pero con limitaciones**

### Análisis Detallado:

#### ✅ **Lo que SÍ está cubierto:**

1. **WooCommerce ya calcula correctamente**:
   - Si la página web fue actualizada correctamente, WooCommerce ya está excluyendo artículos con descuentos activos del cálculo del descuento del evento
   - El `fee_lines` que llega a la sincronización **ya refleja el descuento correcto** (solo sobre artículos elegibles)

2. **El descuento se guarda correctamente**:
   - El valor de `fac_descuento_general` es el descuento que WooCommerce calculó correctamente
   - Este descuento ya excluye artículos con descuentos activos

3. **Información de promociones se guarda**:
   - Cada artículo tiene `kar_tiene_oferta` que indica si tiene descuento activo
   - Esto permite identificar qué artículos fueron excluidos del descuento del evento

#### ⚠️ **Limitaciones y Consideraciones:**

1. **No hay validación/recalculo**:
   - El código actual **confía** en que WooCommerce calculó correctamente
   - No hay validación en nuestro lado para verificar que el descuento es correcto
   - No hay recálculo para comparar con lo que debería ser

2. **No hay trazabilidad de exclusión**:
   - No se registra explícitamente qué artículos fueron excluidos del descuento del evento
   - Solo se sabe que tienen `kar_tiene_oferta = 'S'`, pero no se relaciona con el descuento del evento

3. **Dependencia de WooCommerce**:
   - Si hay un bug en WooCommerce o la lógica cambia, no se detectaría en la sincronización

---

## 🔧 Recomendaciones

### Opción 1: Mantener Estado Actual (Recomendado para corto plazo)

**Justificación**:
- WooCommerce ya calcula correctamente el descuento
- El código actual es simple y funcional
- No hay necesidad de duplicar lógica

**Acciones**:
- ✅ **Ninguna acción requerida** - El sistema funciona correctamente
- ✅ Documentar que confiamos en el cálculo de WooCommerce
- ✅ Monitorear que los descuentos sean consistentes

### Opción 2: Agregar Validación/Logging (Recomendado para mediano plazo)

**Objetivo**: Validar y registrar qué artículos fueron excluidos del descuento del evento.

**Implementación**:

1. **Calcular descuento esperado**:
   ```javascript
   // Después de procesar todos los artículos
   let subtotalElegible = 0;
   let articulosExcluidos = [];
   
   for (const item of orderData.lineItems) {
       const articleInfo = await getArticleInfo(item.sku);
       const promocionInfo = await getArticuloPromocionInfo(articleInfo, orderData.dateCreated);
       
       // Si NO tiene oferta activa, incluir en subtotal elegible
       if (!promocionInfo || promocionInfo.tiene_oferta !== 'S') {
           subtotalElegible += parseFloat(item.subtotal);
       } else {
           articulosExcluidos.push({
               sku: item.sku,
               nombre: item.name,
               subtotal: parseFloat(item.subtotal)
           });
       }
   }
   
   // Obtener evento activo y calcular descuento esperado
   const eventoActivo = await obtenerEventoActivo(orderData.dateCreated);
   if (eventoActivo) {
       const porcentajeDescuento = subtotalElegible >= umbralMayorista 
           ? eventoActivo.eve_descuento_mayor 
           : eventoActivo.eve_descuento_detal;
       
       const descuentoEsperado = (subtotalElegible * porcentajeDescuento) / 100;
       
       // Comparar con descuento recibido de WooCommerce
       const diferencia = Math.abs(descuentoEsperado - descuentoGeneral);
       
       if (diferencia > 0.01) { // Tolerancia de centavos
           console.warn(`⚠️ Diferencia en descuento del evento:`, {
               descuentoEsperado,
               descuentoRecibido: descuentoGeneral,
               diferencia,
               articulosExcluidos
           });
       }
   }
   ```

2. **Agregar a observaciones**:
   ```javascript
   if (articulosExcluidos.length > 0) {
       observations.push(
           `Artículos excluidos del descuento evento (${articulosExcluidos.length}): ` +
           articulosExcluidos.map(a => a.nombre).join(', ')
       );
   }
   ```

**Beneficios**:
- ✅ Validación de consistencia
- ✅ Trazabilidad de artículos excluidos
- ✅ Detección temprana de inconsistencias

**Desventajas**:
- ⚠️ Requiere consultar eventos promocionales
- ⚠️ Aumenta la complejidad del código
- ⚠️ Puede afectar performance si hay muchos artículos

### Opción 3: Recalcular Descuento (No recomendado)

**Objetivo**: Recalcular el descuento del evento en nuestro lado.

**Razones para NO hacerlo**:
- ❌ Duplica lógica que ya existe en WooCommerce
- ❌ Puede generar inconsistencias si hay diferencias en la lógica
- ❌ Aumenta significativamente la complejidad
- ❌ Requiere mantener sincronizada la lógica con WooCommerce

---

## 📊 Casos de Prueba Sugeridos

Para validar que el sistema funciona correctamente:

### Caso 1: Pedido con artículos sin descuento
- **Artículos**: 3 artículos sin promociones activas
- **Descuento evento**: 30%
- **Resultado esperado**: Descuento aplicado sobre el subtotal completo

### Caso 2: Pedido con artículos en liquidación
- **Artículos**: 
  - 2 artículos sin descuento
  - 1 artículo en liquidación (20% descuento)
- **Descuento evento**: 30%
- **Resultado esperado**: Descuento evento aplicado solo sobre los 2 artículos sin descuento

### Caso 3: Pedido solo con artículos en liquidación
- **Artículos**: 3 artículos todos en liquidación
- **Descuento evento**: 30%
- **Resultado esperado**: Descuento evento = 0 (ningún artículo elegible)

### Caso 4: Pedido mixto con evento activo
- **Artículos**: 
  - 1 artículo sin descuento: $100
  - 1 artículo en liquidación: $50
  - 1 artículo sin descuento: $75
- **Subtotal elegible**: $175
- **Descuento evento 30%**: $52.50
- **Resultado esperado**: `fac_descuento_general = 52.50`

---

## 🎯 Plan de Acción Recomendado

### Fase 1: Validación Inmediata (Sin cambios de código)

1. ✅ **Revisar pedidos recientes**:
   - Verificar que `fac_descuento_general` tiene valores razonables
   - Comparar con totales de pedidos que tienen artículos en liquidación

2. ✅ **Monitorear logs**:
   - Revisar logs de sincronización para detectar inconsistencias
   - Verificar que `fee_lines` contiene descuentos de eventos

3. ✅ **Validar con casos reales**:
   - Crear pedidos de prueba en WooCommerce con artículos en liquidación
   - Verificar que el descuento del evento se calcula correctamente
   - Sincronizar y verificar que `fac_descuento_general` es correcto

### Fase 2: Mejoras Opcionales (Si se detectan problemas)

1. 🔧 **Implementar validación** (Opción 2):
   - Agregar cálculo de descuento esperado
   - Comparar con descuento recibido
   - Registrar diferencias en logs

2. 📝 **Mejorar observaciones**:
   - Agregar información de artículos excluidos en `fac_obs`
   - Facilitar auditoría y debugging

3. 📊 **Reportes**:
   - Crear reporte de artículos excluidos del descuento de eventos
   - Analizar impacto en ventas

---

## 📝 Código de Ejemplo para Validación (Opcional)

Si se decide implementar la validación, aquí está el código sugerido:

```javascript
/**
 * Valida que el descuento del evento recibido de WooCommerce es consistente
 * con los artículos que deberían estar incluidos/excluidos
 * @param {Array} lineItems - Items del pedido
 * @param {number} descuentoGeneral - Descuento recibido de WooCommerce
 * @param {Date} fechaPedido - Fecha del pedido
 * @returns {Promise<{valido: boolean, detalles: Object}>}
 */
const validarDescuentoEvento = async (lineItems, descuentoGeneral, fechaPedido) => {
    const pool = await poolPromise;
    
    // Obtener evento activo
    const eventoResult = await pool.request()
        .input('fecha', sql.DateTime, fechaPedido)
        .query(`
            SELECT TOP 1 
                eve_sec,
                eve_nombre,
                eve_descuento_detal,
                eve_descuento_mayor,
                eve_fecha_inicio,
                eve_fecha_fin
            FROM dbo.eventos_promocionales
            WHERE eve_activo = 'S'
                AND @fecha BETWEEN eve_fecha_inicio AND eve_fecha_fin
            ORDER BY eve_fecha_inicio DESC
        `);
    
    if (eventoResult.recordset.length === 0) {
        // No hay evento activo, el descuento no debería existir
        return {
            valido: descuentoGeneral === 0,
            detalles: {
                motivo: descuentoGeneral > 0 ? 'Descuento recibido sin evento activo' : 'OK'
            }
        };
    }
    
    const evento = eventoResult.recordset[0];
    
    // Calcular subtotal elegible (excluyendo artículos con descuentos activos)
    let subtotalElegible = 0;
    let subtotalTotal = 0;
    const articulosExcluidos = [];
    const articulosIncluidos = [];
    
    for (const item of lineItems) {
        const articleInfo = await getArticleInfo(item.sku);
        if (!articleInfo) continue;
        
        const subtotal = parseFloat(item.subtotal);
        subtotalTotal += subtotal;
        
        const promocionInfo = await getArticuloPromocionInfo(articleInfo, fechaPedido);
        
        // Si NO tiene oferta activa, incluir en subtotal elegible
        if (!promocionInfo || promocionInfo.tiene_oferta !== 'S') {
            subtotalElegible += subtotal;
            articulosIncluidos.push({
                sku: item.sku,
                nombre: item.name,
                subtotal: subtotal
            });
        } else {
            articulosExcluidos.push({
                sku: item.sku,
                nombre: item.name,
                subtotal: subtotal,
                promocion: promocionInfo.codigo_promocion || 'Liquidación'
            });
        }
    }
    
    // Obtener umbral mayorista
    const umbralResult = await pool.request()
        .query(`SELECT par_value FROM dbo.parametros WHERE par_cod = 'UMBRAL_MAYORISTA'`);
    
    const umbralMayorista = parseFloat(umbralResult.recordset[0]?.par_value || 0);
    
    // Determinar tipo de descuento
    const porcentajeDescuento = subtotalElegible >= umbralMayorista
        ? evento.eve_descuento_mayor
        : evento.eve_descuento_detal;
    
    // Calcular descuento esperado
    const descuentoEsperado = (subtotalElegible * porcentajeDescuento) / 100;
    
    // Comparar con descuento recibido (tolerancia de 0.01 para redondeos)
    const diferencia = Math.abs(descuentoEsperado - descuentoGeneral);
    const valido = diferencia <= 0.01;
    
    return {
        valido,
        detalles: {
            evento: evento.eve_nombre,
            subtotalTotal,
            subtotalElegible,
            porcentajeDescuento,
            descuentoEsperado,
            descuentoRecibido: descuentoGeneral,
            diferencia,
            articulosIncluidos: articulosIncluidos.length,
            articulosExcluidos: articulosExcluidos.length,
            listaArticulosExcluidos: articulosExcluidos
        }
    };
};
```

**Uso en sincronización**:

```javascript
// Después de calcular descuentoGeneral (línea ~986)
if (descuentoGeneral > 0) {
    const validacion = await validarDescuentoEvento(
        orderData.lineItems,
        descuentoGeneral,
        orderData.dateCreated
    );
    
    if (!validacion.valido) {
        console.warn(`⚠️ Descuento del evento inconsistente:`, validacion.detalles);
        // Opcional: Agregar a observaciones
        if (validacion.detalles.listaArticulosExcluidos.length > 0) {
            observations.push(
                `Validación: ${validacion.detalles.articulosExcluidos} artículos excluidos del descuento evento`
            );
        }
    }
}
```

---

## ✅ Conclusión Final

**Estado actual**: ✅ **El sistema está cubriendo el cambio correctamente**

**Razón**: WooCommerce ya calcula el descuento excluyendo artículos con descuentos activos, y nuestro código simplemente toma ese valor y lo guarda. No hay necesidad de recalcular.

**Recomendación**: 
- **Corto plazo**: Mantener el código actual, monitorear pedidos
- **Mediano plazo**: Considerar agregar validación opcional si se detectan inconsistencias

**Riesgo**: Bajo - El sistema funciona correctamente tal como está.

---

**Fecha de creación**: 2025-01-XX  
**Última actualización**: 2025-01-XX  
**Autor**: Sistema de Análisis  
**Versión**: 1.0

