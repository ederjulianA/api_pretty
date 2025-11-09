# Documentación: Sistema de Descuentos por Eventos Promocionales

## 📋 Índice
1. [Descripción General](#descripción-general)
2. [Arquitectura del Sistema](#arquitectura-del-sistema)
3. [Lógica de Aplicación de Descuentos](#lógica-de-aplicación-de-descuentos)
4. [Configuración en el Admin](#configuración-en-el-admin)
5. [Funciones Principales](#funciones-principales)
6. [Hooks de WooCommerce](#hooks-de-woocommerce)
7. [Actualización Automática](#actualización-automática)
8. [Fragmentos de WooCommerce](#fragmentos-de-woocommerce)
9. [Estructura de Archivos](#estructura-de-archivos)

---

## 📖 Descripción General

El sistema de descuentos por eventos promocionales permite configurar eventos temporales (como Black Friday, Cyber Monday, etc.) que aplican descuentos automáticos según el tipo de compra:

- **Compra al Detal** (subtotal < umbral mayorista): Aplica un porcentaje de descuento configurable
- **Compra al Mayor** (subtotal >= umbral mayorista): Aplica un porcentaje de descuento diferente

### Características Principales
- ✅ Descuentos automáticos sin necesidad de cupones
- ✅ Actualización en tiempo real sin recargar la página
- ✅ Visualización clara del evento activo
- ✅ Compatible con el sistema de precios mayoristas existente
- ✅ Respeta cupones incompatibles (ej: pretty15)

---

## 🏗️ Arquitectura del Sistema

### Flujo de Decisión

```
1. Verificar si hay evento activo (dentro del rango de fechas)
   ↓
2. Verificar si hay cupones incompatibles
   ↓
3. Calcular subtotal del carrito (usando precio mayorista si existe, sino precio regular)
   ↓
4. Comparar subtotal con umbral mayorista
   ↓
5. Aplicar descuento según tipo de compra:
   - Si subtotal >= umbral → Descuento al Mayor
   - Si subtotal < umbral → Descuento al Detal
   ↓
6. Mostrar información del evento al usuario
```

---

## 🧮 Lógica de Aplicación de Descuentos

### 1. Cálculo del Subtotal para Determinar Tipo de Compra

```php
function pm_calcular_subtotal_para_umbral( $cart ) {
    $subtotal = 0;
    
    foreach ( $cart->get_cart() as $cart_item ) {
        $precio_mayorista = get_post_meta( $cart_item['product_id'], '_precio_mayorista', true );
        $precio_regular = $cart_item['data']->get_regular_price();
        
        // Usar precio mayorista si existe y es válido, sino usar precio regular
        $precio_a_usar = ( ! empty( $precio_mayorista ) && $precio_mayorista > 0 ) 
            ? (float) $precio_mayorista 
            : (float) $precio_regular;
        
        $subtotal += $cart_item['quantity'] * $precio_a_usar;
    }
    
    return $subtotal;
}
```

**Importante:** Este cálculo usa el precio mayorista si existe, sino usa el precio regular. Esto permite determinar correctamente si la compra supera el umbral mayorista.

### 2. Determinación del Tipo de Descuento

```php
// Obtener umbral mayorista
$umbral_mayorista = pm_obtener_umbral_mayorista();

// Calcular subtotal para verificar umbral
$subtotal_para_umbral = pm_calcular_subtotal_para_umbral( $cart );

// Determinar tipo de compra y porcentaje de descuento
if ( $subtotal_para_umbral >= $umbral_mayorista ) {
    // Compra al mayor
    $porcentaje = $evento['descuento_mayor'];
    $tipo = 'mayorista';
} else {
    // Compra al detal
    $porcentaje = $evento['descuento_detal'];
    $tipo = 'detal';
}
```

### 3. Aplicación del Descuento

El descuento se aplica como un "fee" negativo en WooCommerce:

```php
// Calcular descuento sobre el subtotal actual del carrito
$subtotal_carrito = $cart->get_subtotal();
$descuento = ( $subtotal_carrito * $porcentaje ) / 100;

// Aplicar como fee negativo (descuento)
$mensaje = sprintf( 
    __( '%s (%s%%)', 'precios-mayoristas' ),
    $evento['nombre'],
    number_format( $porcentaje, 0 )
);

$cart->add_fee( $mensaje, -$descuento );
```

**Nota:** El descuento se calcula sobre el `subtotal` del carrito, que ya incluye los precios mayoristas aplicados si corresponde.

---

## ⚙️ Configuración en el Admin

### Opciones de Configuración

El sistema guarda las siguientes opciones en WordPress:

| Opción | Descripción | Tipo |
|--------|-------------|------|
| `pm_evento_activo` | Activar/Desactivar evento (1 o 0) | string |
| `pm_evento_nombre` | Nombre del evento (ej: "Black Friday") | string |
| `pm_evento_fecha_inicio` | Fecha de inicio (YYYY-MM-DD) | string |
| `pm_evento_fecha_fin` | Fecha de fin (YYYY-MM-DD) | string |
| `pm_evento_descuento_mayor` | Porcentaje de descuento al mayor | float |
| `pm_evento_descuento_detal` | Porcentaje de descuento al detal | float |

### Verificación de Evento Activo

```php
function pm_verificar_evento_activo() {
    $evento = pm_obtener_evento_activo();
    
    if ( ! $evento ) {
        return false;
    }
    
    // Obtener fecha/hora actual
    $fecha_actual = current_time( 'Y-m-d H:i:s' );
    $fecha_inicio = $evento['fecha_inicio'] . ' 00:00:00';
    $fecha_fin = $evento['fecha_fin'] . ' 23:59:59';
    
    // Convertir a timestamps para comparar
    $timestamp_actual = strtotime( $fecha_actual );
    $timestamp_inicio = strtotime( $fecha_inicio );
    $timestamp_fin = strtotime( $fecha_fin );
    
    // Verificar si está dentro del rango
    if ( $timestamp_actual >= $timestamp_inicio && $timestamp_actual <= $timestamp_fin ) {
        return $evento;
    }
    
    return false;
}
```

---

## 🔧 Funciones Principales

### 1. `pm_aplicar_descuento_evento( $cart )`

**Hook:** `woocommerce_cart_calculate_fees` (prioridad 30)

**Función:** Aplica el descuento del evento al carrito si está activo.

**Lógica:**
1. Verifica si hay evento activo
2. Verifica si hay cupones incompatibles
3. Calcula subtotal para determinar tipo de compra
4. Aplica descuento como fee negativo

**Prioridad 30:** Se ejecuta después de aplicar precios mayoristas (prioridad 20)

### 2. `pm_mostrar_info_evento_carrito()`

**Hook:** `woocommerce_before_cart` (prioridad 5)

**Función:** Muestra el banner informativo del evento en el carrito.

**Características:**
- Muestra nombre del evento
- Muestra rango de fechas válidas
- Muestra tipo de descuento aplicado (Mayorista/Detal) y porcentaje

### 3. `pm_actualizar_info_evento_callback()`

**Hook:** `wp_ajax_actualizar_info_evento` (AJAX)

**Función:** Actualiza el banner del evento vía AJAX cuando cambia el carrito.

**Retorna:** HTML del banner actualizado con el tipo de descuento correcto.

### 4. `pm_agregar_fragmentos_evento( $fragments )`

**Hook:** `woocommerce_add_to_cart_fragments` (prioridad 20)

**Función:** Agrega el banner del evento a los fragmentos de WooCommerce para que persista después de F5.

**Importante:** Recalcula el carrito antes de generar los fragmentos para asegurar que los fees estén actualizados.

---

## 🎣 Hooks de WooCommerce

### Hooks Utilizados

| Hook | Prioridad | Función | Propósito |
|------|-----------|---------|-----------|
| `woocommerce_cart_calculate_fees` | 30 | `pm_aplicar_descuento_evento` | Aplicar descuento al carrito |
| `woocommerce_before_cart` | 5 | `pm_mostrar_info_evento_carrito` | Mostrar banner en carrito |
| `woocommerce_add_to_cart_fragments` | 20 | `pm_agregar_fragmentos_evento` | Persistir después de F5 |
| `wp_head` | - | `pm_estilos_evento_promocional` | Agregar estilos CSS |
| `wp_footer` | - | `pm_scripts_evento_promocional` | Agregar JavaScript |

### Orden de Ejecución

```
1. woocommerce_before_calculate_totals (prioridad 20)
   → Aplica precios mayoristas
   
2. woocommerce_cart_calculate_fees (prioridad 30)
   → Aplica descuento del evento
   
3. woocommerce_before_cart (prioridad 5)
   → Muestra banner del evento
```

---

## 🔄 Actualización Automática

### JavaScript para Actualización en Tiempo Real

El sistema incluye JavaScript que actualiza automáticamente el banner cuando:

- Se cambia la cantidad de productos
- Se agrega un producto
- Se elimina un producto
- Se actualizan los totales del carrito

```javascript
// Eventos que disparan la actualización
$(document.body).on('updated_cart_totals', function() {
    setTimeout(actualizarBannerEvento, 300);
});

$(document.body).on('added_to_cart wc_fragments_refreshed', function() {
    setTimeout(actualizarBannerEvento, 300);
});

$(document.body).on('removed_from_cart', function() {
    setTimeout(actualizarBannerEvento, 500);
});

$(document).on('change', 'input.qty', function() {
    setTimeout(actualizarBannerEvento, 500);
});
```

### Función AJAX

La función `actualizarBannerEvento()` hace una petición AJAX a `actualizar_info_evento` que:

1. Recalcula el subtotal del carrito
2. Determina el tipo de compra (mayor/detal)
3. Retorna el HTML actualizado del banner

---

## 🧩 Fragmentos de WooCommerce

### ¿Qué son los Fragmentos?

Los fragmentos de WooCommerce permiten actualizar partes específicas de la página sin recargarla completamente. Se usan para mantener el estado del carrito después de acciones AJAX.

### Implementación

```php
function pm_agregar_fragmentos_evento( $fragments ) {
    // Recalcular el carrito para asegurar que los fees estén actualizados
    if ( ! WC()->cart->is_empty() ) {
        WC()->cart->calculate_totals();
    }
    
    $evento = pm_verificar_evento_activo();
    
    if ( ! $evento ) {
        return $fragments;
    }
    
    // ... lógica de determinación de descuento ...
    
    if ( $porcentaje > 0 ) {
        // Agregar el banner del evento a los fragmentos
        ob_start();
        pm_mostrar_info_evento_carrito();
        $banner_html = ob_get_clean();
        if ( ! empty( $banner_html ) ) {
            $fragments['.pm-evento-promocional-info'] = $banner_html;
        }
        
        // Agregar fragmentos para actualizar el mini cart completo
        ob_start();
        woocommerce_mini_cart();
        $mini_cart_html = ob_get_clean();
        if ( ! empty( $mini_cart_html ) ) {
            $fragments['div.widget_shopping_cart_content'] = '<div class="widget_shopping_cart_content">' . $mini_cart_html . '</div>';
        }
    }
    
    return $fragments;
}
```

**Importante:** El recalculo del carrito (`WC()->cart->calculate_totals()`) es crucial para que los fees (descuentos) estén actualizados en los fragmentos.

---

## 📁 Estructura de Archivos

```
precios-mayoristas/
├── precios-mayoristas.php          # Archivo principal (incluye módulo)
├── includes/
│   ├── funciones.php                # Funciones principales del plugin
│   └── eventos-promocionales.php    # Módulo de eventos promocionales
└── assets/
    └── js/
        └── precios-mayoristas.js    # JavaScript para actualizaciones
```

### Integración en el Archivo Principal

```php
// En precios-mayoristas.php
require_once plugin_dir_path( __FILE__ ) . 'includes/eventos-promocionales.php';
```

---

## 🔍 Validaciones y Condiciones

### Condiciones para Aplicar Descuento

1. ✅ Evento debe estar activado (`pm_evento_activo = '1'`)
2. ✅ Fecha actual debe estar dentro del rango configurado
3. ✅ No debe haber cupones incompatibles (ej: pretty15)
4. ✅ El porcentaje de descuento debe ser mayor a 0

### Compatibilidad con Otros Sistemas

- **Precios Mayoristas:** Se aplican primero, luego el descuento del evento
- **Cupones:** Si hay cupón "pretty15", no se aplica el evento
- **Sale Price:** Los productos con sale_price activo no afectan el cálculo del umbral

---

## 🎨 Estilos CSS

### Colores de Marca

- **Rosa Principal:** `#F58EA3`
- **Rosa Claro:** `#F5CAD4`
- **Negro:** `#000`
- **Blanco:** `#fff`

### Clases CSS Principales

- `.pm-evento-promocional-info` - Contenedor principal
- `.pm-evento-banner` - Banner del evento
- `.pm-evento-fechas` - Fechas del evento
- `.pm-evento-descuento` - Información del descuento
- `tr.fee` - Fila del descuento en tablas

---

## 📝 Ejemplo de Configuración

### Configuración Típica para Black Friday

```
Nombre del Evento: Black Friday PrettyMakeup 2025
Fecha de Inicio: 2025-11-01
Fecha de Fin: 2025-11-07
Descuento al Mayor: 8%
Descuento al Detal: 30%
```

### Resultado

- Compras que superen el umbral mayorista (ej: $75,000) → **8% de descuento**
- Compras que NO superen el umbral → **30% de descuento**

---

## 🐛 Solución de Problemas

### El descuento no se aplica

1. Verificar que el evento esté activado
2. Verificar que la fecha actual esté dentro del rango
3. Verificar que no haya cupones incompatibles
4. Verificar que el porcentaje de descuento sea mayor a 0

### El banner no se actualiza automáticamente

1. Verificar que jQuery esté cargado
2. Verificar la consola del navegador por errores JavaScript
3. Verificar que la función AJAX `actualizar_info_evento` esté registrada

### El descuento desaparece después de F5

1. Verificar que los fragmentos de WooCommerce estén funcionando
2. Verificar que `pm_agregar_fragmentos_evento` esté agregado al filtro correcto
3. Verificar que el carrito se recalcule antes de generar fragmentos

---

## 📚 Referencias

- **WooCommerce Hooks:** https://woocommerce.github.io/code-reference/hooks/
- **WooCommerce Cart Fees:** https://woocommerce.com/document/add-a-surcharge-to-cart-and-checkout/
- **WooCommerce Fragments:** https://woocommerce.com/document/show-cart-contents-total/

---

## 📅 Versión

**Versión del Plugin:** 2.10.0  
**Fecha de Documentación:** 2025  
**Autor:** Eder Alvarez

---

## ✅ Checklist de Implementación

Para implementar este sistema en un entorno local:

- [ ] Copiar archivo `includes/eventos-promocionales.php`
- [ ] Incluir el archivo en el plugin principal
- [ ] Registrar las opciones de configuración en el admin
- [ ] Agregar los campos de configuración en la interfaz
- [ ] Verificar que los hooks se ejecuten en el orden correcto
- [ ] Probar la aplicación de descuentos
- [ ] Probar la actualización automática
- [ ] Probar la persistencia después de F5
- [ ] Verificar estilos en carrito principal y lateral
- [ ] Probar con diferentes escenarios (mayor/detal)

---

**Nota:** Esta documentación describe la implementación completa del sistema de descuentos por eventos promocionales. Para cualquier duda o ajuste, consultar el código fuente en `includes/eventos-promocionales.php`.

