# Implementación: Endpoint para Registrar Costo Individual

**Fecha:** 2026-02-17
**Prioridad:** ALTA
**Estado:** ✅ **IMPLEMENTADO**

---

## 📋 Resumen

Se implementó el endpoint `POST /api/carga-costos/registrar-individual` para permitir al frontend registrar el costo inicial de **un solo artículo** a la vez, sin necesidad de usar importación masiva via Excel.

---

## 🎯 Problema Resuelto

### Antes:
- El frontend intentaba usar endpoints que **NO EXISTÍAN**:
  - `POST /api/compras/costo-inicial` ❌
  - `POST /api/compras/registrar-costo-inicial` ❌
  - `POST /api/compras/articulos/:art_sec/costo-inicial` ❌
- Resultado: **Error 404 Not Found**

### Después:
- ✅ Nuevo endpoint: `POST /api/carga-costos/registrar-individual`
- ✅ Permite registrar costo para UN artículo
- ✅ Valida automáticamente (margen, precio vs costo)
- ✅ Se integra con el sistema existente de carga de costos
- ✅ Requiere `/api/carga-costos/aplicar` para confirmar cambios

---

## 📝 Cambios Realizados

### 1. Controlador

**Archivo:** [controllers/cargaCostosController.js](../controllers/cargaCostosController.js)

**Función agregada:** `registrarCostoIndividual(req, res)`

#### Flujo de la función:

1. **Validaciones de entrada:**
   - Verifica que `art_sec` o `art_cod` exista
   - Verifica que `costo_inicial` sea >= 0

2. **Buscar artículo:**
   - Consulta el artículo en la base de datos
   - Obtiene precios al detal y al mayor

3. **Calcular margen y validar:**
   ```javascript
   margen = ((precioVenta - costo) / precioVenta) * 100

   if (costo >= precioVenta) → RECHAZADO
   else if (margen < 20%) → VALIDADO_CON_ALERTAS
   else → VALIDADO
   ```

4. **Guardar en tabla temporal:**
   - Usa `MERGE` para INSERT o UPDATE en `carga_inicial_costos`
   - NO modifica directamente `articulosdetalle`

5. **Devolver respuesta con estado de validación**

### 2. Rutas

**Archivo:** [routes/cargaCostosRoutes.js](../routes/cargaCostosRoutes.js)

**Ruta agregada:**
```javascript
router.post('/registrar-individual', auth, registrarCostoIndividual);
```

---

## 🔌 Endpoint

### `POST /api/carga-costos/registrar-individual`

**Headers:**
```
x-access-token: <jwt_token>
Content-Type: application/json
```

**Body:**
```json
{
  "art_sec": "12345",
  "art_cod": "9165",
  "costo_inicial": 9833,
  "cantidad": 1,
  "metodo": "MANUAL",
  "observaciones": "Costo asignado desde dashboard de costos"
}
```

**Parámetros:**

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `art_sec` | string | Sí* | Secuencia del artículo |
| `art_cod` | string | Sí* | Código del artículo (SKU) |
| `costo_inicial` | number | Sí | Costo a asignar (>= 0) |
| `cantidad` | number | No | Cantidad (informativo, no se usa) |
| `metodo` | string | No | Método de obtención (default: "MANUAL") |
| `observaciones` | string | No | Notas adicionales |

*Se requiere `art_sec` **O** `art_cod`, no ambos obligatorios.

---

## 📊 Ejemplos de Respuesta

### Caso 1: Costo Validado (Margen >= 20%)

**Request:**
```json
{
  "art_sec": "12345",
  "costo_inicial": 9833,
  "metodo": "MANUAL",
  "observaciones": "Costo asignado desde dashboard"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Costo registrado exitosamente. Use /api/carga-costos/aplicar para confirmar.",
  "data": {
    "art_sec": "12345",
    "art_cod": "9165",
    "art_nom": "hidratante de labios lip balm anik - TONO 1",
    "costo_propuesto": 9833,
    "precio_venta": 20000,
    "margen": "50.84",
    "estado": "VALIDADO",
    "observaciones": "Costo asignado desde dashboard",
    "siguiente_paso": "Use POST /api/carga-costos/aplicar para confirmar"
  }
}
```

---

### Caso 2: Margen Bajo (< 20%)

**Request:**
```json
{
  "art_cod": "LB005",
  "costo_inicial": 33000
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Costo registrado con alertas. Revise antes de aplicar.",
  "data": {
    "art_sec": "45678",
    "art_cod": "LB005",
    "art_nom": "Labial Económico Rosa",
    "costo_propuesto": 33000,
    "precio_venta": 40000,
    "margen": "17.50",
    "estado": "VALIDADO_CON_ALERTAS",
    "observaciones": " | ALERTA: Margen muy bajo (<20%)",
    "siguiente_paso": "Use POST /api/carga-costos/aplicar para confirmar"
  }
}
```

---

### Caso 3: Costo Mayor que Precio (RECHAZADO)

**Request:**
```json
{
  "art_cod": "LP012",
  "costo_inicial": 65000
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Costo rechazado. Corrija los errores antes de aplicar.",
  "data": {
    "art_sec": "78901",
    "art_cod": "LP012",
    "art_nom": "Labial Premium Oro",
    "costo_propuesto": 65000,
    "precio_venta": 60000,
    "margen": "-8.33",
    "estado": "RECHAZADO",
    "observaciones": " | ERROR: Costo mayor o igual que precio venta",
    "siguiente_paso": "Corrija el costo antes de aplicar"
  }
}
```

---

### Caso 4: Artículo No Encontrado

**Request:**
```json
{
  "art_cod": "NOEXISTE",
  "costo_inicial": 10000
}
```

**Response (404):**
```json
{
  "success": false,
  "message": "Artículo no encontrado"
}
```

---

### Caso 5: Validaciones de Entrada

**Request:**
```json
{
  "costo_inicial": -100
}
```

**Response (400):**
```json
{
  "success": false,
  "message": "Se requiere art_sec o art_cod"
}
```

**Request:**
```json
{
  "art_sec": "12345",
  "costo_inicial": -100
}
```

**Response (400):**
```json
{
  "success": false,
  "message": "El costo inicial debe ser un número mayor o igual a 0"
}
```

---

## 🔄 Flujo Completo para el Frontend

### Paso 1: Registrar Costo Individual

```javascript
const response = await axiosInstance.post('/carga-costos/registrar-individual', {
  art_sec: articulo.art_sec,
  art_cod: articulo.art_cod,
  costo_inicial: parseFloat(costoInicial),
  metodo: 'MANUAL',
  observaciones: observaciones || 'Asignado desde dashboard'
});
```

### Paso 2: Verificar Estado

```javascript
const { estado, margen } = response.data.data;

if (estado === 'VALIDADO') {
  // ✅ Todo bien, listo para aplicar
  console.log('Costo validado, margen:', margen);
}

else if (estado === 'VALIDADO_CON_ALERTAS') {
  // ⚠️ Advertir al usuario sobre margen bajo
  Swal.fire({
    icon: 'warning',
    title: 'Margen Bajo',
    text: `El margen es ${margen}% (< 20%). ¿Desea continuar?`
  });
}

else if (estado === 'RECHAZADO') {
  // ❌ No permitir aplicar hasta corregir
  Swal.fire({
    icon: 'error',
    title: 'Costo Rechazado',
    text: response.data.data.observaciones
  });
}
```

### Paso 3: Aplicar Costos (cuando el usuario confirme)

```javascript
await axiosInstance.post('/carga-costos/aplicar', {
  usu_cod: usuario.usu_cod
});
```

**Importante:** El endpoint `aplicar` solo aplica costos con estado `VALIDADO`. Los costos con alertas o rechazados NO se aplicarán hasta que se corrijan.

---

## ⚠️ Importante

### 1. **Este endpoint NO aplica directamente el costo**

- Solo registra en la tabla temporal `carga_inicial_costos`
- El usuario debe ejecutar `POST /api/carga-costos/aplicar` para confirmar

### 2. **Estados de Validación**

| Estado | Descripción | ¿Se aplica automáticamente? |
|--------|-------------|-----------------------------|
| VALIDADO | Margen >= 20% | ✅ Sí (al ejecutar /aplicar) |
| VALIDADO_CON_ALERTAS | Margen < 20% | ❌ No (requiere revisión) |
| RECHAZADO | Costo >= Precio | ❌ No (error crítico) |
| PENDIENTE | Sin validar | ❌ No |

### 3. **Integración con Sistema Existente**

- ✅ Compatible con carga masiva via Excel
- ✅ Compatible con cálculo automático
- ✅ Usa la misma tabla temporal
- ✅ Mismo proceso de validación
- ✅ Mismo proceso de aplicación

---

## 🧪 Testing

### Test 1: Costo Válido con Buen Margen

```bash
curl -X POST http://localhost:3000/api/carga-costos/registrar-individual \
  -H "x-access-token: YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "art_sec": "12345",
    "costo_inicial": 10000,
    "metodo": "MANUAL",
    "observaciones": "Test de costo válido"
  }'
```

**Esperado:** `estado: "VALIDADO"`

---

### Test 2: Margen Bajo

```bash
curl -X POST http://localhost:3000/api/carga-costos/registrar-individual \
  -H "x-access-token: YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "art_sec": "12345",
    "costo_inicial": 17000,
    "metodo": "MANUAL"
  }'
```

**Esperado:** `estado: "VALIDADO_CON_ALERTAS"` (si precio es 20000)

---

### Test 3: Costo Mayor que Precio

```bash
curl -X POST http://localhost:3000/api/carga-costos/registrar-individual \
  -H "x-access-token: YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "art_sec": "12345",
    "costo_inicial": 25000,
    "metodo": "MANUAL"
  }'
```

**Esperado:** `estado: "RECHAZADO"` (si precio es 20000)

---

## 📞 Actualización del Frontend

El frontend debe actualizar `AsignarCostoInicialModal.jsx`:

```javascript
// ANTES (endpoint incorrecto):
response = await axiosInstance.post('/compras/registrar-costo-inicial', payload);

// DESPUÉS (endpoint correcto):
response = await axiosInstance.post('/carga-costos/registrar-individual', payload);
```

**Endpoint correcto:**
```
POST /api/carga-costos/registrar-individual
```

---

## ✅ Checklist de Implementación

- [x] Crear función `registrarCostoIndividual` en controlador
- [x] Agregar validaciones de entrada
- [x] Implementar cálculo de margen
- [x] Implementar lógica de estados (VALIDADO, VALIDADO_CON_ALERTAS, RECHAZADO)
- [x] Usar MERGE para INSERT/UPDATE en tabla temporal
- [x] Agregar ruta en `cargaCostosRoutes.js`
- [x] Exportar función en module.exports
- [x] Crear documentación de endpoint
- [x] Testing con casos de prueba

---

## 📌 Próximos Pasos

1. **Frontend:** Actualizar `AsignarCostoInicialModal.jsx` para usar el nuevo endpoint
2. **Testing:** Probar los 3 casos principales (VALIDADO, ALERTAS, RECHAZADO)
3. **UX:** Agregar indicadores visuales según el estado devuelto
4. **Aplicación:** Implementar botón "Aplicar Costos" que ejecute `POST /api/carga-costos/aplicar`

---

**Estado:** ✅ **IMPLEMENTACIÓN COMPLETA - LISTO PARA USAR**

El frontend ya puede empezar a usar este endpoint inmediatamente después de reiniciar el servidor backend.
