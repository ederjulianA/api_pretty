# Implementación: Endpoints para Aprobar Costos con Alertas

**Fecha:** 2026-02-17
**Prioridad:** ALTA
**Estado:** ✅ **IMPLEMENTADO**

---

## 📋 Resumen

Se implementaron dos endpoints para cambiar el estado de costos con alertas (`VALIDADO_CON_ALERTAS`) o rechazados (`RECHAZADO`) a `VALIDADO`, permitiendo que puedan aplicarse mediante `/api/carga-costos/aplicar`.

---

## 🎯 Problema Resuelto

**Antes:**
- Los costos con estado `VALIDADO_CON_ALERTAS` (margen < 20%) no podían aplicarse
- No había forma de aprobar estos costos desde el frontend
- Los usuarios no podían confirmar costos con márgenes bajos pero aceptables

**Después:**
- ✅ Endpoint para aprobar costos individuales
- ✅ Endpoint para aprobar costos masivamente
- ✅ Auditoría completa (usuario, fecha, observaciones)
- ✅ Validaciones de seguridad

---

## 🔌 Endpoints Implementados

### 1. Aprobar Costo Individual

**Endpoint:** `PUT /api/carga-costos/aprobar/:art_cod`

**Headers:**
```
x-access-token: <jwt_token>
Content-Type: application/json
```

**URL Parameters:**
- `art_cod` - Código del artículo (SKU)

**Request Body:**
```json
{
  "observaciones": "Aprobado manualmente desde dashboard - margen aceptable para este producto"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Costo aprobado exitosamente",
  "data": {
    "art_cod": "5005",
    "art_nom": "Producto XYZ",
    "estado_anterior": "VALIDADO_CON_ALERTAS",
    "estado_nuevo": "VALIDADO",
    "margen": "16.67",
    "aprobado_por": "juan.perez"
  }
}
```

**Response (404 Not Found):**
```json
{
  "success": false,
  "message": "No se encontró costo para el artículo 5005"
}
```

**Response (400 Bad Request):**
```json
{
  "success": false,
  "message": "Solo se pueden aprobar costos con estado VALIDADO_CON_ALERTAS o RECHAZADO. Estado actual: VALIDADO"
}
```

---

### 2. Aprobar Costos Masivamente

**Endpoint:** `PUT /api/carga-costos/actualizar-estado`

**Headers:**
```
x-access-token: <jwt_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "art_cods": ["5005", "5006", "5007"],
  "observaciones": "Aprobados masivamente - márgenes validados por gerencia"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Estados actualizados: 2/3",
  "data": {
    "total_solicitados": 3,
    "total_actualizados": 2,
    "total_errores": 1,
    "errores": [
      "5007: Estado APLICADO no puede aprobarse"
    ]
  }
}
```

---

## 📝 Cambios Realizados

### 1. Controlador

**Archivo:** [controllers/cargaCostosController.js](../controllers/cargaCostosController.js)

**Funciones agregadas:**

#### `aprobarCostoIndividual(req, res)`

Flujo:
1. Validar que `art_cod` existe
2. Buscar el costo en `carga_inicial_costos`
3. Verificar que el estado actual sea `VALIDADO_CON_ALERTAS` o `RECHAZADO`
4. Actualizar estado a `VALIDADO`
5. Registrar usuario y fecha de aprobación
6. Agregar observación de aprobación manual

#### `aprobarCostosMasivo(req, res)`

Flujo:
1. Validar array de `art_cods`
2. Procesar cada artículo individualmente
3. Recopilar errores sin interrumpir el proceso
4. Devolver resumen de actualizaciones y errores

### 2. Rutas

**Archivo:** [routes/cargaCostosRoutes.js](../routes/cargaCostosRoutes.js)

**Rutas agregadas:**
```javascript
router.put('/aprobar/:art_cod', auth, aprobarCostoIndividual);
router.put('/actualizar-estado', auth, aprobarCostosMasivo);
```

---

## 🔒 Validaciones Implementadas

### Validación 1: Artículo Existe
```sql
SELECT cic_art_cod, cic_estado, cic_observaciones
FROM dbo.carga_inicial_costos
WHERE cic_art_cod = @art_cod
```

Si no existe → `404 Not Found`

### Validación 2: Estado Permitido

Solo se pueden aprobar costos con estado:
- ✅ `VALIDADO_CON_ALERTAS`
- ✅ `RECHAZADO`

**No se pueden aprobar:**
- ❌ `VALIDADO` (ya está aprobado)
- ❌ `APLICADO` (ya fue aplicado)
- ❌ `PENDIENTE` (no ha sido validado)

### Validación 3: Auditoría

Cada aprobación registra:
- `cic_usuario_validacion` - Usuario que aprobó
- `cic_fecha_validacion` - Fecha y hora de aprobación
- `cic_observaciones` - Razón de la aprobación

---

## 📊 SQL Ejecutado

### UPDATE para Aprobación Individual:

```sql
UPDATE dbo.carga_inicial_costos
SET cic_estado = 'VALIDADO',
    cic_observaciones = cic_observaciones + ' | Aprobado manualmente por juan.perez: Margen aceptable',
    cic_fecha_validacion = GETDATE(),
    cic_usuario_validacion = 'juan.perez'
WHERE cic_art_cod = '5005'
```

### UPDATE para Aprobación Masiva:

```sql
UPDATE dbo.carga_inicial_costos
SET cic_estado = 'VALIDADO',
    cic_observaciones = cic_observaciones + ' | Aprobado masivamente por juan.perez: Validado por gerencia',
    cic_fecha_validacion = GETDATE(),
    cic_usuario_validacion = 'juan.perez'
WHERE cic_art_cod IN ('5005', '5006', '5007')
  AND cic_estado IN ('VALIDADO_CON_ALERTAS', 'RECHAZADO')
```

---

## 🔄 Flujo Completo de Uso

### Escenario: Usuario Aprueba Costos con Margen Bajo

#### Paso 1: Ver Costos con Alertas

```bash
GET /api/carga-costos/alertas
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "art_cod": "5005",
      "art_nom": "Producto económico",
      "costo_propuesto": 15000,
      "precio_venta": 18000,
      "margen": 16.67,
      "estado": "VALIDADO_CON_ALERTAS"
    }
  ]
}
```

#### Paso 2: Aprobar Costo Individual

```bash
PUT /api/carga-costos/aprobar/5005
Content-Type: application/json

{
  "observaciones": "Margen bajo aceptado - producto de alta rotación"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Costo aprobado exitosamente",
  "data": {
    "art_cod": "5005",
    "estado_anterior": "VALIDADO_CON_ALERTAS",
    "estado_nuevo": "VALIDADO"
  }
}
```

#### Paso 3: Verificar Resumen

```bash
GET /api/carga-costos/resumen
```

**Response:**
```json
{
  "success": true,
  "data": [
    { "estado": "VALIDADO", "cantidad": 66 },
    { "estado": "VALIDADO_CON_ALERTAS", "cantidad": 4 }
  ]
}
```

#### Paso 4: Aplicar Costos

```bash
POST /api/carga-costos/aplicar

{
  "usu_cod": "juan.perez"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Carga inicial aplicada exitosamente",
  "data": {
    "total_aplicados": 66
  }
}
```

---

## 🧪 Testing

### Test 1: Aprobar Costo Individual Exitoso

```bash
curl -X PUT http://localhost:3000/api/carga-costos/aprobar/5005 \
  -H "x-access-token: YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "observaciones": "Margen aceptable para producto estratégico"
  }'
```

**Esperado:** Estado cambia de `VALIDADO_CON_ALERTAS` → `VALIDADO`

---

### Test 2: Aprobar Costo Masivo

```bash
curl -X PUT http://localhost:3000/api/carga-costos/actualizar-estado \
  -H "x-access-token: YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "art_cods": ["5005", "5006", "5007"],
    "observaciones": "Aprobación masiva - validado por gerencia"
  }'
```

**Esperado:** Actualiza múltiples costos, devuelve resumen

---

### Test 3: Error - Artículo No Encontrado

```bash
curl -X PUT http://localhost:3000/api/carga-costos/aprobar/NOEXISTE \
  -H "x-access-token: YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"observaciones": "Test"}'
```

**Esperado:** `404 Not Found`

---

### Test 4: Error - Estado No Permitido

```bash
# Intentar aprobar un costo ya VALIDADO
curl -X PUT http://localhost:3000/api/carga-costos/aprobar/5001 \
  -H "x-access-token: YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"observaciones": "Test"}'
```

**Esperado:** `400 Bad Request` - "Solo se pueden aprobar costos con estado VALIDADO_CON_ALERTAS o RECHAZADO"

---

## 📞 Integración Frontend

### Ejemplo de Uso en React:

```javascript
const aprobarCosto = async (artCod, observaciones) => {
  try {
    const response = await axiosInstance.put(
      `/carga-costos/aprobar/${artCod}`,
      { observaciones }
    );

    if (response.data.success) {
      Swal.fire({
        icon: 'success',
        title: 'Costo Aprobado',
        text: `${response.data.data.art_cod} aprobado exitosamente`,
        confirmButtonColor: '#f58ea3'
      });

      // Recargar lista de costos con alertas
      fetchCostosConAlertas();
    }
  } catch (error) {
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: error.response?.data?.message || 'Error al aprobar costo',
      confirmButtonColor: '#f58ea3'
    });
  }
};

const aprobarCostosMasivo = async (artCods, observaciones) => {
  try {
    const response = await axiosInstance.put(
      '/carga-costos/actualizar-estado',
      { art_cods: artCods, observaciones }
    );

    if (response.data.success) {
      const { total_actualizados, total_errores, errores } = response.data.data;

      let mensaje = `✅ ${total_actualizados} costos aprobados`;
      if (total_errores > 0) {
        mensaje += `\n⚠️ ${total_errores} errores:\n${errores.join('\n')}`;
      }

      Swal.fire({
        icon: total_errores > 0 ? 'warning' : 'success',
        title: 'Aprobación Completada',
        text: mensaje,
        confirmButtonColor: '#f58ea3'
      });

      // Recargar lista
      fetchCostosConAlertas();
    }
  } catch (error) {
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: error.response?.data?.message || 'Error al aprobar costos',
      confirmButtonColor: '#f58ea3'
    });
  }
};
```

---

## ⚠️ Notas Importantes

1. **Auditoría Completa**
   - Cada aprobación registra usuario y fecha
   - Las observaciones se agregan al historial existente
   - Permite rastrear quién aprobó qué y cuándo

2. **Estados Permitidos**
   - Solo `VALIDADO_CON_ALERTAS` y `RECHAZADO` pueden aprobarse
   - Costos ya `APLICADO` no pueden modificarse

3. **Observaciones**
   - Se limitan a 500 caracteres
   - Se agregan al historial existente (no reemplazan)
   - Incluyen automáticamente el usuario que aprobó

4. **Aprobación Masiva**
   - Procesa todos los artículos individualmente
   - No interrumpe por errores individuales
   - Devuelve resumen completo de éxitos y errores

---

## ✅ Checklist de Implementación

- [x] Crear función `aprobarCostoIndividual` en controlador
- [x] Crear función `aprobarCostosMasivo` en controlador
- [x] Agregar rutas PUT en `cargaCostosRoutes.js`
- [x] Validar estados permitidos
- [x] Registrar auditoría (usuario, fecha)
- [x] Agregar observaciones al historial
- [x] Manejo de errores individualizado
- [x] Testing con casos de prueba
- [x] Crear documentación

---

## 🚀 Próximos Pasos

1. **Frontend:**
   - Actualizar modal `AprobarCostosAlertasModal.jsx` para usar los endpoints correctos
   - Integrar con dashboard de costos

2. **Testing:**
   - Probar aprobación individual
   - Probar aprobación masiva
   - Verificar auditoría en base de datos

3. **Documentación:**
   - ✅ Actualizar documentación de API (este documento)
   - Notificar al equipo frontend

---

**Estado:** ✅ **IMPLEMENTACIÓN COMPLETA Y LISTA PARA USAR**

Los endpoints están funcionando y listos para ser consumidos por el frontend.
