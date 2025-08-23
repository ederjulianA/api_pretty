# UTILIDADES DE PRECIOS - precioUtils.js

Este módulo proporciona funciones globales para manejar precios de artículos en el sistema.

## Funciones Disponibles

### 1. `obtenerPreciosArticulo(art_sec)`

Obtiene los precios detal y mayor de un artículo específico.

**Parámetros:**
- `art_sec` (string): Código del artículo

**Retorna:**
```javascript
{
  art_sec: "ART001",
  art_cod: "ART001",
  art_nom: "Nombre del Artículo",
  precio_detal: 15000,
  precio_mayor: 12000
}
```

**Ejemplo de uso:**
```javascript
import { obtenerPreciosArticulo } from '../utils/precioUtils.js';

const precios = await obtenerPreciosArticulo('ART001');
console.log(precios.precio_detal); // 15000
```

### 2. `validarPrecioOferta(art_sec, precio_oferta)`

Valida que un precio de oferta sea válido para un artículo.

**Parámetros:**
- `art_sec` (string): Código del artículo
- `precio_oferta` (number): Precio de oferta a validar

**Retorna:**
```javascript
{
  valido: true/false,
  mensaje: "Mensaje de validación",
  precios: {
    art_sec: "ART001",
    precio_detal: 15000,
    precio_mayor: 12000
  }
}
```

**Ejemplo de uso:**
```javascript
import { validarPrecioOferta } from '../utils/precioUtils.js';

const validacion = await validarPrecioOferta('ART001', 10000);
if (validacion.valido) {
  console.log('Precio válido');
} else {
  console.log('Error:', validacion.mensaje);
}
```

### 3. `validarDescuentoPorcentual(art_sec, descuento_porcentaje)`

Valida que un descuento porcentual sea válido para un artículo.

**Parámetros:**
- `art_sec` (string): Código del artículo
- `descuento_porcentaje` (number): Descuento porcentual a validar

**Retorna:**
```javascript
{
  valido: true/false,
  mensaje: "Mensaje de validación",
  precios: {
    art_sec: "ART001",
    precio_detal: 15000,
    precio_mayor: 12000
  },
  precios_con_descuento: {
    precio_detal: 12750,  // 15000 * 0.85
    precio_mayor: 10200   // 12000 * 0.85
  }
}
```

**Ejemplo de uso:**
```javascript
import { validarDescuentoPorcentual } from '../utils/precioUtils.js';

const validacion = await validarDescuentoPorcentual('ART001', 15);
if (validacion.valido) {
  console.log('Descuento válido');
  console.log('Precio con descuento:', validacion.precios_con_descuento.precio_detal);
} else {
  console.log('Error:', validacion.mensaje);
}
```

### 4. `obtenerPreciosMultiples(art_sec_list)`

Obtiene precios de múltiples artículos de forma optimizada.

**Parámetros:**
- `art_sec_list` (Array<string>): Lista de códigos de artículos

**Retorna:**
```javascript
{
  "ART001": {
    art_sec: "ART001",
    precio_detal: 15000,
    precio_mayor: 12000
  },
  "ART002": {
    art_sec: "ART002",
    precio_detal: 20000,
    precio_mayor: 16000
  }
}
```

**Ejemplo de uso:**
```javascript
import { obtenerPreciosMultiples } from '../utils/precioUtils.js';

const precios = await obtenerPreciosMultiples(['ART001', 'ART002', 'ART003']);
console.log(precios['ART001'].precio_detal); // 15000
```

## Validaciones Implementadas

### Para Precios de Oferta:
- ✅ Debe ser mayor a 0
- ✅ Debe ser menor al precio detal
- ✅ Debe ser menor al precio mayor

### Para Descuentos Porcentuales:
- ✅ Debe ser mayor a 0%
- ✅ Debe ser menor al 100%
- ✅ El precio resultante no debe ser <= 0

## Integración con Promociones

Las funciones están integradas en el modelo de promociones:

```javascript
import { validarPrecioOferta, validarDescuentoPorcentual } from '../utils/precioUtils.js';

// En el modelo de promociones
if (detalle.precio_oferta && detalle.precio_oferta > 0) {
  const validacionPrecio = await validarPrecioOferta(detalle.art_sec, detalle.precio_oferta);
  if (!validacionPrecio.valido) {
    throw new Error(validacionPrecio.mensaje);
  }
}
```

## Manejo de Errores

Todas las funciones incluyen manejo robusto de errores:

- **Artículo no encontrado**: Retorna error descriptivo
- **Precios no configurados**: Retorna 0 como valor por defecto
- **Validaciones fallidas**: Retorna mensaje específico del error

## Pruebas

Para ejecutar las pruebas:

```bash
node sistema_precios_oferta/test_precioUtils.js
```

**Nota:** Actualizar los `art_sec` en el archivo de prueba con artículos reales de tu base de datos.

## Estructura de Base de Datos

Las funciones consultan las siguientes tablas:
- `articulos`: Información básica del artículo
- `articulosdetalle`: Precios detal (lis_pre_cod = 1) y mayor (lis_pre_cod = 2)

**Consulta base:**
```sql
SELECT 
  a.art_sec,
  a.art_cod,
  a.art_nom,
  ISNULL(ad1.art_bod_pre, 0) AS precio_detal,
  ISNULL(ad2.art_bod_pre, 0) AS precio_mayor
FROM dbo.articulos a
LEFT JOIN dbo.articulosdetalle ad1 ON a.art_sec = ad1.art_sec AND ad1.lis_pre_cod = 1 AND ad1.bod_sec = '1'
LEFT JOIN dbo.articulosdetalle ad2 ON a.art_sec = ad2.art_sec AND ad2.lis_pre_cod = 2 AND ad2.bod_sec = '1'
WHERE a.art_sec = @art_sec
``` 