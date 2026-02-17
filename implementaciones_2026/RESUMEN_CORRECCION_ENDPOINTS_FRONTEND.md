# Resumen: Corrección de Endpoints para el Frontend

**Fecha:** 2026-02-17
**Urgencia:** 🔴 ALTA - Error 404 bloqueando funcionalidad

---

## 🚨 Problema

El frontend está intentando usar endpoints que **NO EXISTEN**:

```javascript
// ❌ ESTOS ENDPOINTS NO EXISTEN:
POST /api/compras/costo-inicial
POST /api/compras/articulos/:art_sec/costo-inicial
POST /api/compras/registrar-costo-inicial
```

**Resultado:** `Error 404 Not Found`

**Archivo afectado:** `/Users/eder/Developer/GitHub/pretty_front/src/components/AsignarCostoInicialModal.jsx`

---

## ✅ Solución

Usar el endpoint correcto que **SÍ EXISTE**:

```javascript
// ✅ ENDPOINT CORRECTO:
POST /api/carga-costos/registrar-individual
```

---

## 📝 Cambios Requeridos en Frontend

### Archivo: `src/components/AsignarCostoInicialModal.jsx`

**Línea aproximada 75-85:**

#### ANTES (código actual):

```javascript
// Intentar endpoint principal
let response;
try {
  response = await axiosInstance.post('/compras/costo-inicial', payload);
} catch (error) {
  // Si falla, intentar endpoint alternativo
  if (error.response?.status === 404) {
    try {
      response = await axiosInstance.post(`/compras/articulos/${articulo.art_sec}/costo-inicial`, payload);
    } catch (error2) {
      // Último intento con endpoint alternativo
      if (error2.response?.status === 404) {
        response = await axiosInstance.post('/compras/registrar-costo-inicial', payload);
      } else {
        throw error2;
      }
    }
  } else {
    throw error;
  }
}
```

#### DESPUÉS (código corregido):

```javascript
// Usar el endpoint correcto que SÍ existe
const response = await axiosInstance.post('/carga-costos/registrar-individual', payload);
```

---

## 📦 Payload Requerido

El endpoint espera el siguiente formato:

```javascript
const payload = {
  art_sec: articulo.art_sec,          // Secuencia del artículo
  art_cod: articulo.art_cod,          // SKU (opcional si ya tienes art_sec)
  costo_inicial: parseFloat(costoInicial),  // Costo a asignar
  cantidad: parseFloat(cantidad),     // Opcional (informativo)
  metodo: 'MANUAL',                   // Método de obtención
  observaciones: observaciones.trim() || 'Costo inicial asignado desde dashboard'
};
```

---

## 📊 Respuesta del Endpoint

El endpoint devuelve el **estado de validación** del costo:

### Caso 1: Costo Válido (Margen >= 20%)

```json
{
  "success": true,
  "message": "Costo registrado exitosamente. Use /api/carga-costos/aplicar para confirmar.",
  "data": {
    "art_sec": "12345",
    "art_cod": "9165",
    "art_nom": "Producto XYZ",
    "costo_propuesto": 9833,
    "precio_venta": 20000,
    "margen": "50.84",
    "estado": "VALIDADO",
    "observaciones": "...",
    "siguiente_paso": "Use POST /api/carga-costos/aplicar para confirmar"
  }
}
```

### Caso 2: Margen Bajo (< 20%)

```json
{
  "success": true,
  "message": "Costo registrado con alertas. Revise antes de aplicar.",
  "data": {
    "estado": "VALIDADO_CON_ALERTAS",
    "margen": "17.50",
    "observaciones": " | ALERTA: Margen muy bajo (<20%)",
    ...
  }
}
```

### Caso 3: Costo Rechazado (Costo >= Precio)

```json
{
  "success": true,
  "message": "Costo rechazado. Corrija los errores antes de aplicar.",
  "data": {
    "estado": "RECHAZADO",
    "margen": "-8.33",
    "observaciones": " | ERROR: Costo mayor o igual que precio venta",
    ...
  }
}
```

---

## 💡 Mejoras Sugeridas para UX

### 1. Mostrar Estado de Validación

```javascript
if (response.data.success) {
  const { estado, margen } = response.data.data;

  let mensaje = `Costo de ${formatCurrency(parseFloat(costoInicial))} registrado.`;

  if (estado === 'VALIDADO') {
    mensaje += `\n✅ Margen: ${margen}%`;
  } else if (estado === 'VALIDADO_CON_ALERTAS') {
    mensaje += `\n⚠️ Margen bajo: ${margen}% (se recomienda >= 20%)`;
  } else if (estado === 'RECHAZADO') {
    mensaje += `\n❌ ${response.data.data.observaciones}`;
  }

  mensaje += '\n\n💡 Recuerda usar "Aplicar Costos" para confirmar los cambios.';

  Swal.fire({
    icon: estado === 'RECHAZADO' ? 'warning' : 'success',
    title: estado === 'RECHAZADO' ? 'Costo Rechazado' : 'Costo Registrado',
    text: mensaje,
    confirmButtonColor: '#f58ea3'
  });
}
```

### 2. Validación Preventiva en el Frontend

```javascript
const validarCostoAntesDeSometer = () => {
  const costo = parseFloat(costoInicial);
  const precio = articulo.precio_venta_detal || articulo.precio_mayor;

  if (!precio || precio <= 0) {
    Swal.fire({
      icon: 'warning',
      title: 'Sin Precio de Venta',
      text: 'Este artículo no tiene precio de venta definido.',
      confirmButtonColor: '#f58ea3'
    });
    return false;
  }

  if (costo >= precio) {
    Swal.fire({
      icon: 'error',
      title: 'Costo Inválido',
      text: `El costo ($${formatCurrency(costo)}) debe ser menor que el precio de venta ($${formatCurrency(precio)})`,
      confirmButtonColor: '#f58ea3'
    });
    return false;
  }

  const margen = ((precio - costo) / precio) * 100;

  if (margen < 20) {
    // Advertir pero permitir continuar
    return Swal.fire({
      icon: 'warning',
      title: 'Margen Bajo',
      text: `El margen será ${margen.toFixed(2)}% (se recomienda >= 20%). ¿Desea continuar?`,
      showCancelButton: true,
      confirmButtonText: 'Sí, continuar',
      cancelButtonText: 'No, ajustar costo',
      confirmButtonColor: '#f58ea3'
    }).then((result) => result.isConfirmed);
  }

  return true;
};
```

---

## 🔄 Flujo Completo

### Paso 1: Usuario Asigna Costo

```
AsignarCostoInicialModal
  ↓
POST /api/carga-costos/registrar-individual
  ↓
Guarda en tabla temporal (NO aplica aún)
  ↓
Devuelve estado de validación
```

### Paso 2: Usuario Confirma (en otra parte de la UI)

```
Dashboard de Costos / Botón "Aplicar Costos"
  ↓
POST /api/carga-costos/aplicar
  ↓
Aplica SOLO los costos con estado VALIDADO
  ↓
Actualiza articulosdetalle.art_bod_cos_cat
```

---

## 📋 Checklist Frontend

- [ ] Cambiar endpoint de `/compras/registrar-costo-inicial` a `/carga-costos/registrar-individual`
- [ ] Eliminar fallbacks de endpoints alternativos (ya no son necesarios)
- [ ] Agregar manejo de estados (VALIDADO, VALIDADO_CON_ALERTAS, RECHAZADO)
- [ ] Mostrar margen calculado al usuario
- [ ] Implementar botón "Aplicar Costos" que llame a `/api/carga-costos/aplicar`
- [ ] Actualizar mensajes de éxito/error según el estado devuelto
- [ ] (Opcional) Agregar validación preventiva antes de enviar

---

## 🧪 Testing

### Test 1: Costo Válido

1. Seleccionar artículo con precio de venta $20,000
2. Ingresar costo: $10,000
3. Enviar
4. **Esperado:** `estado: "VALIDADO"`, `margen: "50.00"`

### Test 2: Margen Bajo

1. Seleccionar artículo con precio de venta $20,000
2. Ingresar costo: $17,000
3. Enviar
4. **Esperado:** `estado: "VALIDADO_CON_ALERTAS"`, `margen: "15.00"`

### Test 3: Costo Rechazado

1. Seleccionar artículo con precio de venta $20,000
2. Ingresar costo: $25,000
3. Enviar
4. **Esperado:** `estado: "RECHAZADO"`, mensaje de error

---

## 📞 Soporte

### Documentación Completa

- [GUIA_FRONTEND_ENDPOINTS_COSTO_INICIAL.md](GUIA_FRONTEND_ENDPOINTS_COSTO_INICIAL.md) - Explicación detallada del problema y opciones
- [IMPLEMENTACION_ENDPOINT_COSTO_INDIVIDUAL.md](IMPLEMENTACION_ENDPOINT_COSTO_INDIVIDUAL.md) - Especificación técnica del endpoint
- [API_ENDPOINTS_CARGA_COSTOS.md](../sistema_compras_costo_promedio/docs/API_ENDPOINTS_CARGA_COSTOS.md) - Documentación completa de todos los endpoints

### Endpoints Disponibles

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/carga-costos/registrar-individual` | **Registrar 1 artículo** ⭐ |
| POST | `/api/carga-costos/importar` | Importar desde Excel |
| POST | `/api/carga-costos/calcular-automatico` | Calcular masivamente |
| POST | `/api/carga-costos/aplicar` | **Confirmar cambios** 🔑 |
| GET | `/api/carga-costos/resumen` | Ver resumen |
| GET | `/api/carga-costos/alertas` | Ver productos con alertas |

---

## ⚡ Resumen Ultra-Rápido

```diff
- POST /api/compras/registrar-costo-inicial  ❌ NO EXISTE
+ POST /api/carga-costos/registrar-individual  ✅ USAR ESTE
```

**Cambio mínimo en el código:**

```javascript
// ANTES:
const response = await axiosInstance.post('/compras/registrar-costo-inicial', payload);

// DESPUÉS:
const response = await axiosInstance.post('/carga-costos/registrar-individual', payload);
```

**Payload:** Mismo formato (ya compatible)

**Respuesta:** Incluye `estado` de validación (VALIDADO, VALIDADO_CON_ALERTAS, RECHAZADO)

---

**🎯 Con este cambio, el Error 404 desaparecerá y la funcionalidad estará operativa.**

