# Analisis: Impacto del Descuento por Volumen Mayorista en el Backend (API Pretty)

**Fecha:** 24 de febrero de 2026
**Referencia Frontend:** `DESCUENTO-VOLUMEN-MAYORISTA.md`
**Estado:** Analisis completado

---

## 1. Resumen del Problema

La tienda online implementara un **descuento progresivo por volumen** sobre compras mayoristas:

| Umbral | Descuento |
|--------|-----------|
| Compra mayorista >= $200,000 | 5% adicional sobre precio mayorista |
| Compra mayorista >= $400,000 | 10% adicional sobre precio mayorista |

El descuento se aplica **por producto** usando `set_price()` en WooCommerce (Opcion A del documento). Esto significa que **cada line_item del pedido ya llega con el precio modificado** al momento de la sincronizacion.

**Pregunta clave:** ¿Como registramos correctamente este descuento en nuestro backend para reportes, rentabilidad y trazabilidad?

---

## 2. Analisis del Flujo Actual de Sincronizacion

### 2.1 Ruta y Archivos Involucrados

| Archivo | Funcion |
|---------|---------|
| `routes/syncWooOrdersRoutes.js` | `POST /api/sync-orders` |
| `controllers/syncWooOrdersController.js` | `syncWooOrders()` - Logica principal (ES Modules) |
| `jobs/syncWooOrders.js` | `syncWooOrders()` - Job background (CommonJS) |
| `models/orderModel.js` | `createCompleteOrder()`, `updateOrder()` - DB operations |
| `utils/costoUtils.js` | `obtenerCostosPromedioMultiples()` - Costos historicos |
| `utils/precioUtils.js` | `obtenerPreciosConOferta()` - Precios con promociones |

### 2.2 Como Llegan los Datos de WooCommerce

Cada `line_item` de WooCommerce contiene:

```json
{
  "id": 123,
  "name": "Exfoliante Facial 250g",
  "sku": "EXF-250",
  "quantity": 25,
  "price": 7600,          // <-- Precio FINAL (ya con descuento volumen aplicado via set_price)
  "subtotal": "190000",   // <-- quantity * price ANTES de cupones
  "total": "190000",      // <-- quantity * price DESPUES de cupones
  "meta_data": [...]
}
```

**Problema critico:** Cuando WooCommerce aplica el descuento por volumen via `set_price()`, el campo `item.price` ya refleja el precio con descuento. **No hay distincion** entre el precio mayorista original y el precio con descuento de volumen en los campos estandar del line_item.

### 2.3 Como se Procesa Actualmente

En `syncWooOrdersController.js` (lineas 602-611):

```javascript
const subtotal = parseFloat(item.subtotal);
const total = parseFloat(item.total);
const quantity = parseInt(item.quantity);

let karDesUno = 0;
let karPrePub = item.price;

if (subtotal > 0) {
    karDesUno = ((subtotal - total) / subtotal) * 100;  // Solo detecta descuento de CUPONES
    karPrePub = subtotal / quantity;                     // Precio unitario pre-cupon
}
```

**`karDesUno` solo captura la diferencia entre `subtotal` y `total`**, que corresponde a cupones. El descuento de volumen (aplicado via `set_price()`) ya esta "absorbido" en `item.price` y `item.subtotal`, por lo que **no se detecta** como descuento.

### 2.4 Campos Actuales en `facturakardes` (Relevantes a Descuentos)

| Campo | Tipo | Uso Actual |
|-------|------|------------|
| `kar_pre_pub` | DECIMAL(17,2) | Precio unitario de venta (viene de WooCommerce) |
| `kar_des_uno` | DECIMAL(11,5) | % descuento unitario (solo cupones actualmente) |
| `kar_total` | DECIMAL(17,2) | Total linea = kar_uni * kar_pre_pub |
| `kar_pre_pub_detal` | DECIMAL(17,2) | Precio base detal (desde BD local) |
| `kar_pre_pub_mayor` | DECIMAL(17,2) | Precio base mayor (desde BD local) |
| `kar_tiene_oferta` | CHAR(1) | 'S'/'N' - si habia oferta activa |
| `kar_precio_oferta` | DECIMAL(17,2) | Precio de oferta fija |
| `kar_descuento_porcentaje` | DECIMAL(5,2) | % descuento de promocion |
| `kar_codigo_promocion` | VARCHAR(20) | Codigo de la promocion |
| `kar_descripcion_promocion` | VARCHAR(200) | Descripcion de la promocion |
| `kar_cos` | DECIMAL(18,4) | Costo historico al momento de venta |

### 2.5 Campos Actuales en `factura` (Relevantes a Descuentos)

| Campo | Tipo | Uso Actual |
|-------|------|------------|
| `fac_descuento_general` | DECIMAL(17,2) | Descuento general (fee_lines negativos) |
| `fac_total_woo` | DECIMAL(17,2) | Total reportado por WooCommerce |
| `fac_obs` | VARCHAR(1024) | Observaciones (incluye codigos de cupones) |

---

## 3. Problema Principal: Trazabilidad del Descuento por Volumen

### 3.1 Escenario Sin Cambios (Estado Actual)

Si no hacemos nada, un pedido con descuento de volumen del 10% se registraria asi:

| Campo | Valor | Observacion |
|-------|-------|-------------|
| kar_pre_pub | 7,200 | Precio YA con descuento (mayorista $8,000 * 0.90) |
| kar_pre_pub_detal | 12,000 | Correcto - precio base detal |
| kar_pre_pub_mayor | 8,000 | Correcto - precio base mayor |
| kar_des_uno | 0 | **INCORRECTO** - No detecta el descuento de volumen |
| kar_tiene_oferta | N | No hay oferta de promociones tabla |
| kar_descuento_porcentaje | NULL | No hay promocion |

**Consecuencias:**
1. **Reportes de rentabilidad incorrectos** - `kar_pre_pub` vs `kar_pre_pub_mayor` mostraria -10% sin explicacion
2. **No hay trazabilidad** - No se sabe POR QUE el precio es menor al mayorista
3. **Dashboard BI confuso** - La vista `vw_ventas_dashboard` calcularia rentabilidad correcta (usa `kar_cos`), pero no podria segmentar por tipo de descuento
4. **Imposible auditar** - No hay forma de saber cuantos pedidos tuvieron descuento de volumen

---

## 4. Solucion Propuesta

### 4.1 Estrategia: Metadata de WooCommerce + Campos en Backend

La solucion mas limpia es una combinacion de:

1. **WooCommerce envia metadata** con el porcentaje de descuento por volumen en cada line_item o a nivel de orden
2. **Backend lee esa metadata** y la almacena en campos dedicados

### 4.2 Metadata que WooCommerce Debe Enviar

#### Opcion A: Metadata a Nivel de Orden (RECOMENDADA)

Segun la documentacion, el plugin ya guarda `pm_descuento_volumen_aplicado`, `pm_precio_antes_descuento_volumen` y `pm_descuento_volumen_porcentaje` en cada `cart_item`. WooCommerce convierte estos en `meta_data` del line_item al crear la orden.

```php
// En el plugin, al momento de aplicar el descuento:
$cart->cart_contents[$key]['pm_descuento_volumen_aplicado'] = true;
$cart->cart_contents[$key]['pm_precio_antes_descuento_volumen'] = $precio_base;
$cart->cart_contents[$key]['pm_descuento_volumen_porcentaje'] = 10;
```

Estas metas se propagan a la orden como `meta_data` del line_item:

```json
{
  "line_items": [
    {
      "id": 123,
      "price": 7200,
      "meta_data": [
        { "key": "_pm_descuento_volumen_aplicado", "value": "1" },
        { "key": "_pm_descuento_volumen_porcentaje", "value": "10" },
        { "key": "_pm_precio_antes_descuento_volumen", "value": "8000" }
      ]
    }
  ]
}
```

#### Opcion B: Metadata a Nivel de Orden (Complementaria)

Agregar tambien metadata a nivel de la orden para trazabilidad rapida:

```php
// Guardar en la orden despues de calcular totales
add_action('woocommerce_checkout_create_order', function($order, $data) {
    $cart = WC()->cart;
    // Detectar si algun item tiene descuento de volumen
    foreach ($cart->get_cart() as $cart_item) {
        if (!empty($cart_item['pm_descuento_volumen_aplicado'])) {
            $order->update_meta_data('_pm_descuento_volumen_porcentaje', $cart_item['pm_descuento_volumen_porcentaje']);
            $order->update_meta_data('_pm_descuento_volumen_nivel', $cart_item['pm_descuento_volumen_porcentaje'] >= 10 ? 2 : 1);
            break;
        }
    }
}, 10, 2);
```

### 4.3 Cambios en el Modelo de Datos (SQL Server)

#### Opcion 1: Nuevos Campos en `facturakardes` (RECOMENDADA)

```sql
ALTER TABLE dbo.facturakardes ADD
    kar_descuento_volumen_pct   DECIMAL(5,2)   NULL,  -- % descuento volumen (5, 10, etc.)
    kar_precio_antes_volumen    DECIMAL(17,2)  NULL;   -- Precio mayorista ANTES del descuento
```

**Justificacion:**
- `kar_descuento_volumen_pct`: Porcentaje aplicado (5 o 10). NULL = sin descuento de volumen
- `kar_precio_antes_volumen`: Precio mayorista antes del descuento. Permite recalcular y auditar

**Ventajas:**
- Separacion clara entre descuento de promocion (`kar_descuento_porcentaje`) y descuento de volumen
- Consultas simples: `WHERE kar_descuento_volumen_pct IS NOT NULL` para filtrar ventas con descuento de volumen
- No rompe nada existente (campos nullable, se ignoran si son NULL)

#### Opcion 2: Nuevo Campo en `factura` (Complementaria)

```sql
ALTER TABLE dbo.factura ADD
    fac_descuento_volumen_pct   DECIMAL(5,2)   NULL,  -- % descuento volumen aplicado a la orden
    fac_nivel_volumen           SMALLINT       NULL;   -- Nivel: NULL=sin volumen, 1=primer umbral, 2=segundo umbral
```

**Justificacion:** Permite consultar rapidamente a nivel de cabecera si una orden tuvo descuento de volumen, sin tener que revisar cada linea.

### 4.4 Resumen de Campos Nuevos

| Tabla | Campo | Tipo | Descripcion |
|-------|-------|------|-------------|
| `facturakardes` | `kar_descuento_volumen_pct` | DECIMAL(5,2) NULL | % descuento volumen por linea |
| `facturakardes` | `kar_precio_antes_volumen` | DECIMAL(17,2) NULL | Precio antes del descuento volumen |
| `factura` | `fac_descuento_volumen_pct` | DECIMAL(5,2) NULL | % descuento volumen de la orden |
| `factura` | `fac_nivel_volumen` | SMALLINT NULL | Nivel de volumen (1 o 2) |

---

## 5. Cambios Requeridos en el Backend

### 5.1 `controllers/syncWooOrdersController.js`

#### 5.1.1 Extraccion de Metadata de Volumen (Nuevo)

Despues de la linea donde se extraen los datos del order (~linea 1234), agregar extraccion de metadata de volumen:

```javascript
// Extraer metadata de descuento por volumen a nivel de orden
const volumenMeta = order.meta_data?.find(m => m.key === '_pm_descuento_volumen_porcentaje');
const nivelVolumenMeta = order.meta_data?.find(m => m.key === '_pm_descuento_volumen_nivel');

const descuentoVolumenOrden = volumenMeta ? parseFloat(volumenMeta.value) : null;
const nivelVolumenOrden = nivelVolumenMeta ? parseInt(nivelVolumenMeta.value) : null;
```

Agregar estos campos al `orderData`:

```javascript
const orderData = {
    // ... campos existentes ...
    descuentoVolumenPct: descuentoVolumenOrden,
    nivelVolumen: nivelVolumenOrden
};
```

#### 5.1.2 Extraccion de Metadata por Line Item

En el loop de procesamiento de items (~linea 550), extraer metadata de volumen por item:

```javascript
// Extraer metadata de descuento volumen del line_item
const itemVolumenMeta = item.meta_data?.find(m => m.key === '_pm_descuento_volumen_porcentaje');
const itemPrecioAntesVolumen = item.meta_data?.find(m => m.key === '_pm_precio_antes_descuento_volumen');

const descuentoVolumenPct = itemVolumenMeta ? parseFloat(itemVolumenMeta.value) : null;
const precioAntesVolumen = itemPrecioAntesVolumen ? parseFloat(itemPrecioAntesVolumen.value) : null;
```

#### 5.1.3 INSERT en facturakardes (Modificar)

Agregar los nuevos campos al INSERT (despues de `kar_cos`):

```javascript
.input('kar_descuento_volumen_pct', sql.Decimal(5, 2), descuentoVolumenPct)
.input('kar_precio_antes_volumen', sql.Decimal(17, 2), precioAntesVolumen)
```

Y actualizar la query INSERT para incluir estos campos.

### 5.2 `controllers/syncWooOrdersController.js` - createOrder

En la funcion `createOrder` (~linea 431):

#### 5.2.1 INSERT en factura (Modificar)

```javascript
.input('fac_descuento_volumen_pct', sql.Decimal(5, 2), orderData.descuentoVolumenPct)
.input('fac_nivel_volumen', sql.SmallInt, orderData.nivelVolumen)
```

### 5.3 `models/orderModel.js`

#### 5.3.1 `createCompleteOrder()` (Lineas ~350-415)

Agregar los campos nuevos al INSERT de facturakardes. Los datos ya vienen en el objeto `detail`:

```javascript
.input('kar_descuento_volumen_pct', sql.Decimal(5, 2), detail.kar_descuento_volumen_pct || null)
.input('kar_precio_antes_volumen', sql.Decimal(17, 2), detail.kar_precio_antes_volumen || null)
```

#### 5.3.2 `updateOrder()` (Lineas ~385-415)

Mismo cambio que `createCompleteOrder()`.

### 5.4 `jobs/syncWooOrders.js` (Legacy)

Aplicar los mismos cambios de extraccion de metadata y campos de INSERT. Este archivo usa CommonJS pero la logica es identica.

---

## 6. Validaciones Importantes

### 6.1 Consistencia de Precios

Al sincronizar un pedido con descuento de volumen, debemos validar:

```javascript
// Si hay descuento de volumen, verificar consistencia
if (descuentoVolumenPct > 0 && precioAntesVolumen > 0) {
    const precioEsperado = precioAntesVolumen * (1 - descuentoVolumenPct / 100);
    const diferencia = Math.abs(parseFloat(item.price) - precioEsperado);

    if (diferencia > 1) { // Tolerancia de $1 por redondeo
        console.warn(`[VOLUMEN] Inconsistencia de precio en item ${item.sku}:`, {
            precioWoo: item.price,
            precioEsperado,
            precioAntesVolumen,
            descuentoVolumenPct
        });
    }
}
```

### 6.2 Exclusiones

Productos que **NO deberian tener descuento de volumen** (verificar al sincronizar):
- Productos con `sale_price` activo
- Bundles/combos (`art_bundle = 'S'`)
- Componentes de bundles (`kar_bundle_padre IS NOT NULL`)

Si un componente de bundle llega con metadata de descuento de volumen, **ignorar** esa metadata ya que los componentes tienen precio $0.

### 6.3 Interaccion con Promociones Existentes

Un producto **podria tener** simultaneamente:
- `kar_tiene_oferta = 'S'` (promocion activa en BD local)
- `kar_descuento_volumen_pct = 10` (descuento de volumen desde WooCommerce)

Esto es **valido** si la promocion y el volumen son descuentos independientes. Los campos no se solapan:

| Tipo Descuento | Campos Afectados |
|---------------|------------------|
| Promocion (oferta fija) | `kar_tiene_oferta`, `kar_precio_oferta`, `kar_codigo_promocion` |
| Promocion (% descuento) | `kar_tiene_oferta`, `kar_descuento_porcentaje`, `kar_codigo_promocion` |
| Descuento volumen | `kar_descuento_volumen_pct`, `kar_precio_antes_volumen` |
| Cupon WooCommerce | `kar_des_uno` (% diferencia subtotal vs total) |
| Evento promocional | Se refleja en `kar_pre_pub` (precio final ya aplicado) |

### 6.4 Interaccion con Eventos Promocionales

Segun el documento, los descuentos son **acumulativos**:

```
Precio base → Precio mayorista → Descuento volumen → Descuento evento
```

Esto significa que `kar_pre_pub` podria reflejar MULTIPLES descuentos. El campo `kar_precio_antes_volumen` captura el precio **antes** del descuento de volumen, lo que permite calcular el impacto de cada descuento:

```
Descuento mayorista = kar_pre_pub_detal - kar_precio_antes_volumen  (o kar_pre_pub_mayor)
Descuento volumen = kar_precio_antes_volumen - kar_pre_pub          (si no hay evento)
Descuento evento = [se requiere metadata adicional del evento]
```

> **NOTA:** Si se quiere desglosar tambien el descuento de evento, se necesitaria metadata adicional desde WooCommerce (`_pm_descuento_evento_porcentaje`, `_pm_precio_antes_evento`). Considerar implementar esto simultaneamente.

---

## 7. Impacto en Reportes y Dashboard BI

### 7.1 Vista `vw_ventas_dashboard`

La vista actual usa `kar_cos` para rentabilidad real. Con los nuevos campos se puede:

```sql
-- Ventas con descuento de volumen
SELECT
    fk.kar_descuento_volumen_pct,
    COUNT(*) AS total_lineas,
    SUM(fk.kar_total) AS total_ventas,
    SUM(fk.kar_precio_antes_volumen * fk.kar_uni - fk.kar_total) AS ahorro_cliente_volumen
FROM dbo.facturakardes fk
INNER JOIN dbo.factura f ON f.fac_sec = fk.fac_sec
WHERE fk.kar_descuento_volumen_pct IS NOT NULL
  AND f.fac_tip_cod = 'VTA'
  AND f.fac_est_fac = 'A'
GROUP BY fk.kar_descuento_volumen_pct;
```

### 7.2 Nuevos Reportes Posibles

Con los campos propuestos se habilitan:

1. **Reporte de efectividad del descuento por volumen** - Cuantos pedidos alcanzan cada nivel
2. **Impacto en rentabilidad** - Comparar margen con y sin descuento de volumen
3. **Segmentacion de clientes** - Cuales clientes compran consistentemente en nivel 2
4. **Analisis de umbral** - Cuantos pedidos quedan "cerca" del umbral (oportunidad de upselling)

### 7.3 Calculo de Rentabilidad con Descuento de Volumen

```sql
-- Rentabilidad desglosada por tipo de descuento
SELECT
    -- Precio base mayorista
    fk.kar_pre_pub_mayor AS precio_base_mayor,
    -- Precio con descuento volumen (antes de evento)
    fk.kar_precio_antes_volumen AS precio_pre_volumen,
    -- Precio final vendido
    fk.kar_pre_pub AS precio_final,
    -- Costo
    fk.kar_cos AS costo,
    -- Margen con precio mayorista base
    (fk.kar_pre_pub_mayor - fk.kar_cos) / NULLIF(fk.kar_pre_pub_mayor, 0) * 100 AS margen_mayorista_puro,
    -- Margen con descuento de volumen
    (fk.kar_pre_pub - fk.kar_cos) / NULLIF(fk.kar_pre_pub, 0) * 100 AS margen_con_volumen,
    -- Impacto del descuento de volumen en el margen
    fk.kar_descuento_volumen_pct
FROM dbo.facturakardes fk
WHERE fk.kar_descuento_volumen_pct IS NOT NULL;
```

---

## 8. Determinacion del `kar_lis_pre_cod` (Lista de Precios)

### 8.1 Logica Actual

Despues de crear el pedido, `actualizarListaPrecios()` determina la lista de precios:

```javascript
const facTotal = totalResult.recordset[0].fac_total;
const montoMayorista = await valorMayorista();
const listaPrecio = facTotal >= montoMayorista ? 2 : 1;  // 2=mayor, 1=detal
```

### 8.2 Impacto del Descuento de Volumen

El descuento de volumen **solo aplica cuando ya se compra al mayor** (subtotal >= umbral mayorista). Por lo tanto:

- Si hay descuento de volumen → `kar_lis_pre_cod` **siempre sera 2** (mayorista)
- No se requiere cambio en `actualizarListaPrecios()`

**Sin embargo**, hay un matiz: el `fac_total` despues del descuento de volumen sera MENOR que el subtotal pre-descuento. Si el descuento reduce el total por debajo del umbral mayorista, la logica actual lo clasificaria como detal, lo cual seria **incorrecto**.

**Recomendacion:** Si `fac_nivel_volumen IS NOT NULL`, forzar `kar_lis_pre_cod = 2`:

```javascript
// En actualizarListaPrecios()
const listaPrecio = (orderData.nivelVolumen > 0) ? 2 : (facTotal >= montoMayorista ? 2 : 1);
```

---

## 9. Consideraciones sobre `cart_item` Metadata en WooCommerce

### 9.1 Propagacion de Cart Item Data a Order Item Meta

**CRITICO:** Las propiedades custom de `$cart_item` (como `pm_descuento_volumen_porcentaje`) **NO se propagan automaticamente** a los metadatos de la orden en WooCommerce. Se requiere un hook explicito:

```php
// OBLIGATORIO: Guardar metadata de volumen en cada line item de la orden
add_action('woocommerce_checkout_create_order_line_item', function($item, $cart_item_key, $values, $order) {
    if (!empty($values['pm_descuento_volumen_aplicado'])) {
        $item->add_meta_data('_pm_descuento_volumen_aplicado', '1');
        $item->add_meta_data('_pm_descuento_volumen_porcentaje', $values['pm_descuento_volumen_porcentaje']);
        $item->add_meta_data('_pm_precio_antes_descuento_volumen', $values['pm_precio_antes_descuento_volumen']);
    }
}, 10, 4);
```

**Sin este hook, el backend NO recibira la metadata de volumen** via la API REST de WooCommerce.

### 9.2 Verificacion via API

Despues de implementar el hook, verificar que la metadata aparece en:

```bash
GET /wp-json/wc/v3/orders/{id}
```

Cada `line_item.meta_data` debe contener las claves `_pm_descuento_volumen_*`.

---

## 10. Prerequisitos del Frontend (Plugin WooCommerce)

Antes de implementar los cambios backend, el plugin de WooCommerce **DEBE**:

1. **Guardar metadata en cart_item** (ya planificado en el documento):
   - `pm_descuento_volumen_aplicado`
   - `pm_precio_antes_descuento_volumen`
   - `pm_descuento_volumen_porcentaje`

2. **Propagar metadata a order line_item** via hook `woocommerce_checkout_create_order_line_item` (seccion 9.1)

3. **Guardar metadata a nivel de orden** via hook `woocommerce_checkout_create_order` (seccion 4.2 Opcion B)

4. **Usar prefijo `_`** en las claves meta para que sean "hidden" en el admin de WooCommerce (convencion estandar)

**Sin estos prerequisitos, el backend no puede detectar ni registrar el descuento de volumen.**

---

## 11. Diagrama de Flujo de Sincronizacion

```
WooCommerce Order (con descuento volumen)
    │
    ├─ order.meta_data:
    │    _pm_descuento_volumen_porcentaje: 10
    │    _pm_descuento_volumen_nivel: 2
    │
    ├─ line_items[].meta_data:
    │    _pm_descuento_volumen_aplicado: 1
    │    _pm_descuento_volumen_porcentaje: 10
    │    _pm_precio_antes_descuento_volumen: 8000
    │
    ▼
syncWooOrdersController.js
    │
    ├─ Extraer metadata de orden → descuentoVolumenPct, nivelVolumen
    ├─ Extraer metadata por item → descuentoVolumenPct, precioAntesVolumen
    │
    ▼
createOrder() / updateOrder()
    │
    ├─ INSERT factura:
    │    fac_descuento_volumen_pct = 10
    │    fac_nivel_volumen = 2
    │
    ├─ INSERT facturakardes (por cada item):
    │    kar_pre_pub = 7200 (precio final con descuento)
    │    kar_pre_pub_mayor = 8000 (precio mayorista base)
    │    kar_descuento_volumen_pct = 10
    │    kar_precio_antes_volumen = 8000
    │    kar_cos = 3500 (costo historico)
    │
    ▼
actualizarListaPrecios()
    │
    └─ fac_nivel_volumen > 0 → kar_lis_pre_cod = 2 (forzar mayorista)
```

---

## 12. Flujo COT→VTA (Cotizacion a Factura): Propagacion de Campos de Volumen

### 12.1 Como Funciona el Flujo Actual

Cuando un pedido de WooCommerce se sincroniza, se crea como **COT** (cotizacion). Luego, desde el frontend administrativo, el usuario "confirma" el pedido convirtiendolo a **VTA** (venta/factura). Este proceso usa `updateOrder()` en `models/orderModel.js`.

**Flujo:**
```
WooCommerce → syncWooOrders → createOrder() [COT]
                                    ↓
                    Frontend Admin confirma pedido
                                    ↓
                    updateOrder() [COT → VTA]
                         ↓
                    1. UPDATE factura SET fac_tip_cod = 'VTA'
                    2. DELETE facturakardes WHERE fac_sec = X
                    3. INSERT facturakardes (nuevos detalles)
```

### 12.2 Problema Critico Identificado

La funcion `updateOrder()` en `orderModel.js` (linea 140) recibe los `detalles` desde el **frontend administrativo**. Cuando se pasa de COT a VTA:

1. Se **eliminan** todos los registros de `facturakardes` (linea 214)
2. Se **reinsertan** los detalles que vienen del frontend

**Si el frontend NO envia los campos de descuento de volumen**, estos se pierden al convertir COT→VTA.

### 12.3 Donde se Originan los Datos

Los campos de volumen se almacenan en `facturakardes` durante la sincronizacion inicial (COT). Cuando el frontend carga el pedido para editarlo/confirmarlo, usa `getOrder()` (linea 567) que retorna `fd.*` — esto **SI incluye** los campos nuevos.

**Cadena de datos:**
```
syncWooOrders → INSERT facturakardes (con kar_descuento_volumen_pct, kar_precio_antes_volumen)
      ↓
getOrder() → SELECT fd.* → retorna los campos de volumen al frontend
      ↓
Frontend → envia detalles a updateOrder() → ¿incluye los campos de volumen?
      ↓
updateOrder() → DELETE + INSERT → ¿propaga los campos de volumen?
```

### 12.4 Cambios Requeridos en `updateOrder()` (`models/orderModel.js`)

#### 12.4.1 Parametros de Entrada (linea 140)

Agregar `fac_descuento_volumen_pct` y `fac_nivel_volumen` a los parametros:

```javascript
const updateOrder = async ({
  fac_nro, fac_tip_cod, nit_sec, fac_est_fac, detalles, descuento,
  fac_nro_woo, fac_obs, fac_fec, fac_descuento_general, fac_est_woo,
  fac_descuento_volumen_pct,  // NUEVO
  fac_nivel_volumen            // NUEVO
}) => {
```

#### 12.4.2 UPDATE de Cabecera (linea 168)

Agregar los campos de volumen al UPDATE de `factura`:

```javascript
const updateHeaderQuery = `
  UPDATE dbo.factura
  SET fac_tip_cod = @fac_tip_cod,
      nit_sec = @nit_sec,
      fac_est_fac = @fac_est_fac,
      fac_nro_woo = @fac_nro_woo,
      fac_obs = @fac_obs,
      fac_est_woo = @fac_est_woo
      ${fac_fec ? ', fac_fec = @fac_fec' : ''}
      ${fac_descuento_general !== undefined ? ', fac_descuento_general = @fac_descuento_general' : ''}
      ${fac_descuento_volumen_pct !== undefined ? ', fac_descuento_volumen_pct = @fac_descuento_volumen_pct' : ''}
      ${fac_nivel_volumen !== undefined ? ', fac_nivel_volumen = @fac_nivel_volumen' : ''}
  WHERE fac_sec = @fac_sec
`;
```

Y agregar los inputs correspondientes:

```javascript
if (fac_descuento_volumen_pct !== undefined) {
  updateHeaderRequest.input('fac_descuento_volumen_pct', sql.Decimal(5, 2), fac_descuento_volumen_pct);
}
if (fac_nivel_volumen !== undefined) {
  updateHeaderRequest.input('fac_nivel_volumen', sql.SmallInt, fac_nivel_volumen);
}
```

#### 12.4.3 INSERT de Detalles (linea 385-415)

Los detalles ya vienen con los campos de volumen desde el frontend (porque `getOrder()` los retorna). Agregar al INSERT:

```javascript
.input('kar_descuento_volumen_pct', sql.Decimal(5, 2), detail.kar_descuento_volumen_pct ?? null)
.input('kar_precio_antes_volumen', sql.Decimal(17, 2), detail.kar_precio_antes_volumen ?? null)
```

Y actualizar la query INSERT para incluir estos campos en la lista de columnas y VALUES.

#### 12.4.4 `expandirBundles()` - Componentes de Bundle (linea 58-135)

Los componentes de bundle generados automaticamente **NO deben heredar** campos de volumen. Verificar que en la expansion (linea 97-112) los componentes tengan:

```javascript
detallesExpandidos.push({
  // ... campos existentes ...
  kar_descuento_volumen_pct: null,   // NUEVO: componentes NO tienen descuento volumen
  kar_precio_antes_volumen: null     // NUEVO: componentes NO tienen precio antes volumen
});
```

### 12.5 Cambios Requeridos en `createCompleteOrder()` (`models/orderModel.js`)

#### 12.5.1 Parametros de Entrada (linea 676)

Agregar los campos de volumen a la desestructuracion:

```javascript
const createCompleteOrder = async ({
  nit_sec, fac_usu_cod_cre, fac_tip_cod, detalles, descuento, lis_pre_cod,
  fac_nro_woo, fac_obs, fac_fec, fac_descuento_general,
  fac_descuento_volumen_pct,  // NUEVO
  fac_nivel_volumen            // NUEVO
}) => {
```

#### 12.5.2 INSERT de Cabecera (linea 761-777)

Agregar los campos al INSERT de `factura`:

```javascript
const insertHeaderQuery = `
  INSERT INTO dbo.factura
    (fac_sec, fac_fec, f_tip_cod, fac_tip_cod, nit_sec, fac_nro, fac_est_fac,
     fac_fch_cre, fac_usu_cod_cre, fac_nro_woo, fac_obs, fac_est_woo,
     fac_descuento_general, fac_descuento_volumen_pct, fac_nivel_volumen)
  VALUES
    (@NewFacSec, @fac_fec, @fac_tip_cod, @fac_tip_cod, @nit_sec, @FinalFacNro, 'A',
     GETDATE(), @fac_usu_cod_cre, @fac_nro_woo, @fac_obs, @fac_est_woo,
     @fac_descuento_general, @fac_descuento_volumen_pct, @fac_nivel_volumen);
`;
```

```javascript
.input('fac_descuento_volumen_pct', sql.Decimal(5, 2), fac_descuento_volumen_pct || null)
.input('fac_nivel_volumen', sql.SmallInt, fac_nivel_volumen || null)
```

#### 12.5.3 INSERT de Detalles (linea 973-981)

Mismos cambios que `updateOrder()` — agregar `kar_descuento_volumen_pct` y `kar_precio_antes_volumen` al INSERT.

### 12.6 Cambios en el Controller (`orderController.js`)

#### 12.6.1 `updateOrderEndpoint` (linea 45)

Extraer los campos nuevos del `req.body`:

```javascript
const {
  fac_tip_cod, nit_sec, fac_est_fac, detalles, descuento,
  fac_nro_woo, fac_obs, fac_descuento_general, fac_est_woo,
  fac_descuento_volumen_pct,  // NUEVO
  fac_nivel_volumen            // NUEVO
} = req.body;
```

Y pasarlos a `updateOrder()`:

```javascript
const result = await updateOrder({
  fac_nro, fac_tip_cod, nit_sec, fac_est_fac, detalles, descuento,
  fac_nro_woo, fac_obs, fac_descuento_general, fac_est_woo,
  fac_descuento_volumen_pct,
  fac_nivel_volumen
});
```

#### 12.6.2 `createCompleteOrder` (linea 66)

Mismo patron — extraer y pasar los campos nuevos.

### 12.7 Flujo Completo COT→VTA con Volumen

```
1. WooCommerce crea pedido con descuento volumen
       ↓
2. syncWooOrders → createOrder() [COT]
   - factura: fac_descuento_volumen_pct=10, fac_nivel_volumen=2
   - facturakardes: kar_descuento_volumen_pct=10, kar_precio_antes_volumen=8000
       ↓
3. Frontend Admin → GET /api/orders/:fac_nro (getOrder)
   - Recibe header con fac_descuento_volumen_pct, fac_nivel_volumen
   - Recibe detalles con kar_descuento_volumen_pct, kar_precio_antes_volumen
       ↓
4. Frontend Admin confirma → PUT /api/orders/:fac_nro (updateOrder)
   - Envia body con:
     - fac_tip_cod: 'VTA'
     - fac_descuento_volumen_pct: 10 (del header original)
     - fac_nivel_volumen: 2 (del header original)
     - detalles[]: cada detalle incluye kar_descuento_volumen_pct y kar_precio_antes_volumen
       ↓
5. updateOrder() en orderModel.js:
   - UPDATE factura: propaga fac_descuento_volumen_pct y fac_nivel_volumen
   - DELETE + INSERT facturakardes: propaga kar_descuento_volumen_pct y kar_precio_antes_volumen
       ↓
6. actualizarListaPrecios(): fac_nivel_volumen > 0 → forzar kar_lis_pre_cod = 2
```

---

## 13. Endpoints de Consulta: Exponer Campos de Volumen

### 13.1 `getOrder()` - Detalle de Pedido (`models/orderModel.js` linea 567)

**Estado actual:** La query usa `fd.*` que **automaticamente incluira** los campos nuevos despues de la migracion SQL. Sin embargo, los alias calculados del detalle no exponen informacion de volumen explicitamente.

**Cambios recomendados en la query de detalle** (linea 606-651):

Agregar alias explicitos para los campos de volumen y un calculo de ahorro:

```sql
SELECT
  fd.*,
  -- ... campos existentes ...

  -- Información de descuento por volumen (NUEVO)
  fd.kar_descuento_volumen_pct AS descuento_volumen_porcentaje,
  fd.kar_precio_antes_volumen AS precio_antes_volumen,
  -- Ahorro por volumen por linea
  CASE
    WHEN fd.kar_descuento_volumen_pct IS NOT NULL AND fd.kar_precio_antes_volumen IS NOT NULL
    THEN (fd.kar_precio_antes_volumen - fd.kar_pre_pub) * fd.kar_uni
    ELSE 0
  END AS ahorro_volumen_linea
```

**Cambios en la query de cabecera** (linea 572-593):

Agregar los campos de volumen al SELECT del header:

```sql
SELECT
  f.fac_sec,
  -- ... campos existentes ...
  f.fac_descuento_volumen_pct,   -- NUEVO
  f.fac_nivel_volumen            -- NUEVO
FROM dbo.factura f
```

**Agregar calculo de totales de volumen al header** (linea 660-668):

```javascript
// Calcular totales de volumen
const ahorroVolumen = details.reduce((sum, detail) => {
  if (detail.kar_descuento_volumen_pct && detail.kar_precio_antes_volumen) {
    return sum + (detail.kar_precio_antes_volumen - detail.kar_pre_pub) * detail.kar_uni;
  }
  return sum;
}, 0);

header.ahorro_volumen_total = ahorroVolumen;
header.descuento_volumen_pct = header.fac_descuento_volumen_pct;
header.nivel_volumen = header.fac_nivel_volumen;
```

### 13.2 `getOrdenes()` - Listado de Pedidos (`models/orderModel.js` linea 480)

**Estado actual:** El listado NO incluye informacion de descuento de volumen. Solo muestra `total_pedido` y `descuento_general`.

**Cambios recomendados en la query** (linea 501-549):

Agregar campos de volumen al SELECT:

```sql
SELECT
  -- ... campos existentes ...
  f.fac_descuento_volumen_pct,    -- NUEVO: % descuento volumen
  f.fac_nivel_volumen,            -- NUEVO: nivel de volumen (1 o 2)
  -- Ahorro total por volumen en la factura
  ISNULL(SUM(
    CASE
      WHEN fd.kar_descuento_volumen_pct IS NOT NULL AND fd.kar_precio_antes_volumen IS NOT NULL
      THEN (fd.kar_precio_antes_volumen - fd.kar_pre_pub) * fd.kar_uni
      ELSE 0
    END
  ), 0) AS ahorro_volumen_total   -- NUEVO
FROM dbo.factura f
-- ... JOINs existentes ...
```

Y agregar `f.fac_descuento_volumen_pct, f.fac_nivel_volumen` al GROUP BY.

**Impacto:** El frontend administrativo podra mostrar un indicador visual (badge, icono) en el listado para pedidos con descuento de volumen, sin necesidad de abrir cada pedido.

### 13.3 `syncWooOrdersController.js` - `updateOrder()` (linea 703)

**Estado actual:** Esta funcion (distinta a la de `orderModel.js`) maneja la actualizacion de pedidos **durante la sincronizacion de WooCommerce**. Tambien elimina y reinserta detalles.

**Cambios requeridos:**

1. **Extraer metadata de volumen por line_item** (dentro del loop de items, linea 826):

```javascript
// Extraer metadata de descuento volumen del line_item
const itemVolumenMeta = item.meta_data?.find(m => m.key === '_pm_descuento_volumen_porcentaje');
const itemPrecioAntesVolumen = item.meta_data?.find(m => m.key === '_pm_precio_antes_descuento_volumen');
const descuentoVolumenPct = itemVolumenMeta ? parseFloat(itemVolumenMeta.value) : null;
const precioAntesVolumen = itemPrecioAntesVolumen ? parseFloat(itemPrecioAntesVolumen.value) : null;
```

2. **Agregar al INSERT** (linea 896-935): Incluir `kar_descuento_volumen_pct` y `kar_precio_antes_volumen`.

3. **UPDATE de cabecera** (linea 725-740): Agregar `fac_descuento_volumen_pct` y `fac_nivel_volumen`.

4. **Componentes de bundle**: Cuando `item._es_componente === true`, forzar `descuentoVolumenPct = null` y `precioAntesVolumen = null`.

### 13.4 `syncWooOrdersController.js` - `createOrder()` (linea 431)

**Mismos cambios que `updateOrder()`** — extraer metadata y agregar a los INSERTs.

Ademas, en el INSERT de cabecera (linea 457-482), agregar:

```javascript
.input('fac_descuento_volumen_pct', sql.Decimal(5, 2), orderData.descuentoVolumenPct)
.input('fac_nivel_volumen', sql.SmallInt, orderData.nivelVolumen)
```

---

## 14. Resumen Completo de Cambios por Archivo (Actualizado)

| Archivo | Funcion Afectada | Tipo de Cambio | Complejidad |
|---------|-----------------|---------------|-------------|
| **SQL Migration** | - | ALTER TABLE (4 campos nuevos) | Baja |
| `controllers/syncWooOrdersController.js` | `syncWooOrders()` | Extraer metadata de orden | Baja |
| `controllers/syncWooOrdersController.js` | `createOrder()` | Extraer metadata items + INSERT factura + INSERT facturakardes | Media |
| `controllers/syncWooOrdersController.js` | `updateOrder()` | Extraer metadata items + UPDATE factura + INSERT facturakardes | Media |
| `controllers/syncWooOrdersController.js` | `actualizarListaPrecios()` | Logica condicional para nivel volumen | Baja |
| `models/orderModel.js` | `createCompleteOrder()` | Parametros + INSERT factura + INSERT facturakardes | Media |
| `models/orderModel.js` | `updateOrder()` | Parametros + UPDATE factura + INSERT facturakardes | Media |
| `models/orderModel.js` | `getOrder()` | SELECT header + SELECT detalles + calculo ahorro | Baja |
| `models/orderModel.js` | `getOrdenes()` | SELECT + GROUP BY + campo ahorro_volumen | Baja |
| `models/orderModel.js` | `expandirBundles()` | Campos NULL en componentes | Baja |
| `controllers/orderController.js` | `updateOrderEndpoint()` | Extraer y pasar campos nuevos | Baja |
| `controllers/orderController.js` | `createCompleteOrder()` | Extraer y pasar campos nuevos | Baja |
| `jobs/syncWooOrders.js` | `syncWooOrders()` | Mismos cambios que controller (CommonJS) | Media |

**Estimacion total actualizada:** ~120-150 lineas nuevas, ~40-50 lineas modificadas

---

## 15. Consideraciones para el Frontend Administrativo

### 15.1 Datos que el Frontend Recibira

Al consultar un pedido con `GET /api/orders/:fac_nro`, el frontend recibira:

**Header:**
```json
{
  "fac_descuento_volumen_pct": 10,
  "fac_nivel_volumen": 2,
  "ahorro_volumen_total": 20000,
  "descuento_volumen_pct": 10,
  "nivel_volumen": 2
}
```

**Details (cada linea):**
```json
{
  "kar_descuento_volumen_pct": 10,
  "kar_precio_antes_volumen": 8000,
  "descuento_volumen_porcentaje": 10,
  "precio_antes_volumen": 8000,
  "ahorro_volumen_linea": 2000
}
```

### 15.2 Datos que el Frontend Debe Enviar al Confirmar (COT→VTA)

Al hacer `PUT /api/orders/:fac_nro` para confirmar un pedido, el frontend **DEBE** incluir:

**En el body principal:**
```json
{
  "fac_tip_cod": "VTA",
  "fac_descuento_volumen_pct": 10,
  "fac_nivel_volumen": 2,
  "detalles": [...]
}
```

**En cada detalle:**
```json
{
  "art_sec": "12345",
  "kar_uni": 25,
  "kar_pre_pub": 7200,
  "kar_descuento_volumen_pct": 10,
  "kar_precio_antes_volumen": 8000
}
```

**CRITICO:** Si el frontend no envia estos campos, se perderan al reinsertar los detalles. El frontend debe preservar los valores que recibio de `getOrder()` y reenviarlos sin modificar.

### 15.3 Listado de Pedidos

En el listado (`GET /api/orders`), el frontend podra usar:
- `fac_descuento_volumen_pct` para mostrar un badge "Vol 5%" o "Vol 10%"
- `fac_nivel_volumen` para filtrar pedidos por nivel de volumen
- `ahorro_volumen_total` para mostrar el ahorro total por volumen

---

## 16. Plan de Implementacion Backend (Actualizado)

### Fase 1: Migracion de Base de Datos

```sql
-- 1. Nuevos campos en facturakardes
ALTER TABLE dbo.facturakardes ADD
    kar_descuento_volumen_pct   DECIMAL(5,2)   NULL,
    kar_precio_antes_volumen    DECIMAL(17,2)  NULL;

-- 2. Nuevos campos en factura
ALTER TABLE dbo.factura ADD
    fac_descuento_volumen_pct   DECIMAL(5,2)   NULL,
    fac_nivel_volumen           SMALLINT       NULL;
```

### Fase 2: Sincronizacion WooCommerce (`syncWooOrdersController.js`)

1. Extraer `_pm_descuento_volumen_*` de `order.meta_data` (nivel orden)
2. Extraer `_pm_descuento_volumen_*` de cada `line_item.meta_data` (nivel item)
3. Incluir campos en `createOrder()` — INSERT factura + INSERT facturakardes
4. Incluir campos en `updateOrder()` — UPDATE factura + INSERT facturakardes
5. Componentes de bundle: forzar NULL en campos de volumen

### Fase 3: Modelo de Ordenes (`orderModel.js`)

1. `createCompleteOrder()` — agregar parametros + INSERT factura + INSERT facturakardes
2. `updateOrder()` — agregar parametros + UPDATE factura + INSERT facturakardes
3. `expandirBundles()` — componentes con campos volumen = NULL
4. `getOrder()` — exponer campos de volumen en header + detalles + calcular ahorro
5. `getOrdenes()` — exponer campos de volumen en listado + calcular ahorro total

### Fase 4: Controller de Ordenes (`orderController.js`)

1. `updateOrderEndpoint()` — extraer y pasar campos nuevos del `req.body`
2. `createCompleteOrder()` — extraer y pasar campos nuevos del `req.body`

### Fase 5: Job Legacy (`jobs/syncWooOrders.js`)

1. Mismos cambios que `syncWooOrdersController.js` en formato CommonJS

### Fase 6: `actualizarListaPrecios()`

1. Si `fac_nivel_volumen IS NOT NULL`, forzar `kar_lis_pre_cod = 2`

### Fase 7: Testing

1. Sincronizar pedido SIN descuento de volumen → campos NULL
2. Sincronizar pedido con descuento volumen nivel 1 (5%)
3. Sincronizar pedido con descuento volumen nivel 2 (10%)
4. **Confirmar COT→VTA** y verificar que campos de volumen se preservan
5. **GET /api/orders/:fac_nro** y verificar que retorna campos de volumen
6. **GET /api/orders** y verificar que listado incluye info de volumen
7. Sincronizar pedido con descuento volumen + evento promocional
8. Sincronizar pedido con descuento volumen + cupon
9. Verificar que bundles/componentes no tienen descuento de volumen
10. Verificar reportes de rentabilidad con desglose de descuentos
11. **Editar pedido** y verificar que campos de volumen NO se pierden

---

## 17. Conclusion (Actualizada)

La implementacion del descuento por volumen en el backend es de **complejidad media** y abarca mas archivos de lo estimado inicialmente:

1. **4 campos nuevos** en la base de datos (2 en factura, 2 en facturakardes)
2. **Lectura de metadata** desde WooCommerce (ya viene en la API REST)
3. **Propagacion de datos** a los INSERTs existentes en **4 funciones de escritura**
4. **Exposicion de datos** en **2 funciones de consulta** (getOrder, getOrdenes)
5. **Preservacion en el flujo COT→VTA** — el punto mas critico de la implementacion

### Puntos Criticos:

1. **Plugin WooCommerce**: Debe propagar metadata via hooks (prerequisito obligatorio)
2. **Flujo COT→VTA**: Los campos de volumen se pierden si el frontend no los reenvia al confirmar. El frontend **DEBE** preservar `kar_descuento_volumen_pct` y `kar_precio_antes_volumen` de cada detalle al enviar la confirmacion
3. **`actualizarListaPrecios()`**: Debe forzar `kar_lis_pre_cod = 2` cuando hay nivel de volumen, sin importar el total final
4. **Bundles**: Los componentes expandidos NO deben heredar campos de volumen

### Archivos Impactados:

| Capa | Archivos | Funciones |
|------|----------|-----------|
| Base de Datos | Migration SQL | 4 ALTER TABLE |
| Sincronizacion | `syncWooOrdersController.js` | createOrder, updateOrder, syncWooOrders |
| Modelo | `orderModel.js` | createCompleteOrder, updateOrder, getOrder, getOrdenes, expandirBundles |
| Controller | `orderController.js` | updateOrderEndpoint, createCompleteOrder |
| Job Legacy | `syncWooOrders.js` | syncWooOrders |

**Estimacion total:** ~120-150 lineas nuevas, ~40-50 lineas modificadas en **5 archivos**

No se requieren cambios en la logica de precios, costos ni kardex existentes. Los nuevos campos son **aditivos** y **nullable**, por lo que no rompen funcionalidad existente. La retrocompatibilidad esta garantizada: pedidos sin descuento de volumen simplemente tendran estos campos en NULL.
