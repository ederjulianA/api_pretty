# API Endpoint: Actualizar Compra (PUT)

**Fecha de creación:** 2026-02-16
**Versión:** 1.0
**Endpoint:** `PUT /api/compras/:fac_nro`
**Autenticación:** JWT (Bearer Token)

---

## 📋 Descripción

Permite actualizar información del **encabezado de una compra existente** sin afectar los cálculos de costo promedio ponderado ya registrados.

### ⚠️ RESTRICCIONES IMPORTANTES

**NO se puede modificar:**
- ❌ Artículos incluidos en la compra
- ❌ Cantidades compradas
- ❌ Costos unitarios
- ❌ Número de compra (`fac_nro`)
- ❌ Tipo de documento (`fac_tip_cod`)

**Razón:** Estos datos ya afectaron el **costo promedio ponderado** del inventario y el **historial de costos**. Modificarlos generaría inconsistencias contables.

**SÍ se puede modificar:**
- ✅ Fecha de compra (`fac_fec`)
- ✅ Proveedor (`nit_sec`)
- ✅ Observaciones (`fac_obs`)
- ✅ Estado de la compra (`fac_est_fac`)

---

## 🔧 Request

### URL
```
PUT /api/compras/:fac_nro
```

### Headers
```http
Content-Type: application/json
x-access-token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Path Parameters

| Parámetro | Tipo   | Requerido | Descripción                |
|-----------|--------|-----------|----------------------------|
| `fac_nro` | string | ✅ Sí      | Número de compra (ej: COM000001) |

### Body Parameters

**Todos los parámetros son OPCIONALES** - Solo se actualizan los campos enviados.

| Campo        | Tipo   | Formato          | Descripción                               | Validación |
|--------------|--------|------------------|-------------------------------------------|------------|
| `fac_fec`    | string | YYYY-MM-DD       | Nueva fecha de compra                     | Regex: `^\d{4}-\d{2}-\d{2}$` |
| `nit_sec`    | string | VARCHAR(16)      | Nuevo código de proveedor                 | Debe existir en tabla `nit` |
| `fac_obs`    | string | VARCHAR(1024)    | Nuevas observaciones                      | Puede estar vacío |
| `fac_est_fac`| string | A, I o C         | Nuevo estado de la compra                 | Solo: A=Activa, I=Inactiva, C=Cancelada |

---

## ✅ Response Success (200 OK)

### Estructura
```json
{
  "success": true,
  "fac_nro": "COM000001",
  "message": "Compra actualizada exitosamente",
  "campos_actualizados": [
    "fac_fec = @fac_fec",
    "nit_sec = @nit_sec",
    "fac_obs = @fac_obs"
  ]
}
```

### Campos de Respuesta

| Campo                 | Tipo    | Descripción                                    |
|-----------------------|---------|------------------------------------------------|
| `success`             | boolean | Indica si la actualización fue exitosa         |
| `fac_nro`             | string  | Número de compra actualizado                   |
| `message`             | string  | Mensaje descriptivo                            |
| `campos_actualizados` | array   | Lista de campos que fueron modificados         |

---

## ❌ Errores Comunes

### 1. Compra no encontrada (400 Bad Request)
```json
{
  "success": false,
  "message": "Compra COM999999 no encontrada"
}
```

### 2. No es una compra (400 Bad Request)
```json
{
  "success": false,
  "message": "La factura FAC000123 no es una compra (tipo: FAC)"
}
```
**Causa:** El `fac_nro` corresponde a una factura de venta u otro tipo de documento, no a una compra (tipo `COM`).

### 3. Proveedor no existe (400 Bad Request)
```json
{
  "success": false,
  "message": "Proveedor 900999999 no encontrado"
}
```

### 4. Estado inválido (400 Bad Request)
```json
{
  "success": false,
  "message": "Estado inválido. Usar A (Activa), I (Inactiva) o C (Cancelada)"
}
```

### 5. Formato de fecha incorrecto (400 Bad Request)
```json
{
  "success": false,
  "message": "fac_fec debe tener formato YYYY-MM-DD"
}
```

### 6. Sin campos para actualizar (400 Bad Request)
```json
{
  "success": false,
  "message": "Debe proporcionar al menos un campo para actualizar (fac_fec, nit_sec, fac_obs, fac_est_fac)"
}
```

### 7. Token inválido o expirado (401 Unauthorized)
```json
{
  "success": false,
  "message": "Token no válido"
}
```

### 8. Error interno del servidor (500 Internal Server Error)
```json
{
  "success": false,
  "message": "Error actualizando compra",
  "error": "Connection timeout"
}
```

---

## 📖 Ejemplos de Uso

### Ejemplo 1: Actualizar solo la fecha

**Request:**
```http
PUT /api/compras/COM000001
Content-Type: application/json
x-access-token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

{
  "fac_fec": "2026-02-10"
}
```

**Response:**
```json
{
  "success": true,
  "fac_nro": "COM000001",
  "message": "Compra actualizada exitosamente",
  "campos_actualizados": [
    "fac_fec = @fac_fec"
  ]
}
```

---

### Ejemplo 2: Actualizar proveedor y observaciones

**Request:**
```http
PUT /api/compras/COM000002
Content-Type: application/json
x-access-token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

{
  "nit_sec": "900123456",
  "fac_obs": "Compra urgente para reposición de inventario crítico"
}
```

**Response:**
```json
{
  "success": true,
  "fac_nro": "COM000002",
  "message": "Compra actualizada exitosamente",
  "campos_actualizados": [
    "nit_sec = @nit_sec",
    "fac_obs = @fac_obs"
  ]
}
```

---

### Ejemplo 3: Cancelar una compra (cambiar estado)

**Request:**
```http
PUT /api/compras/COM000003
Content-Type: application/json
x-access-token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

{
  "fac_est_fac": "C",
  "fac_obs": "Compra cancelada por devolución completa al proveedor"
}
```

**Response:**
```json
{
  "success": true,
  "fac_nro": "COM000003",
  "message": "Compra actualizada exitosamente",
  "campos_actualizados": [
    "fac_est_fac = @fac_est_fac",
    "fac_obs = @fac_obs"
  ]
}
```

---

### Ejemplo 4: Actualización completa de encabezado

**Request:**
```http
PUT /api/compras/COM000004
Content-Type: application/json
x-access-token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

{
  "fac_fec": "2026-02-14",
  "nit_sec": "900654321",
  "fac_obs": "Compra consolidada - proveedor actualizado",
  "fac_est_fac": "A"
}
```

**Response:**
```json
{
  "success": true,
  "fac_nro": "COM000004",
  "message": "Compra actualizada exitosamente",
  "campos_actualizados": [
    "fac_fec = @fac_fec",
    "nit_sec = @nit_sec",
    "fac_obs = @fac_obs",
    "fac_est_fac = @fac_est_fac"
  ]
}
```

---

## 🔒 Seguridad

### Auditoría Automática
Cada actualización registra:
- ✅ `fac_fch_mod` - Fecha y hora de modificación (automático: `GETDATE()`)
- ✅ `fac_usu_cod_mod` - Usuario que modificó (extraído del JWT)

Estos campos se actualizan automáticamente y NO necesitan enviarse en el body.

### Validación de Proveedor
Antes de actualizar `nit_sec`, el sistema verifica que el proveedor exista en la tabla `nit`. Si no existe, retorna error 400.

### Transacciones SQL
- Toda actualización se ejecuta en una **transacción SQL** para garantizar atomicidad
- Si hay error, se ejecuta **ROLLBACK** automático

---

## 🧪 Testing

### Checklist de Validación

- [ ] Actualizar solo fecha → ✅ Debe permitir
- [ ] Actualizar proveedor válido → ✅ Debe permitir
- [ ] Actualizar proveedor inexistente → ❌ Debe retornar error 400
- [ ] Actualizar observaciones vacías → ✅ Debe permitir (limpia el campo)
- [ ] Actualizar estado a "A", "I", "C" → ✅ Debe permitir
- [ ] Actualizar estado a "X" → ❌ Debe retornar error 400
- [ ] Enviar fecha con formato incorrecto → ❌ Debe retornar error 400
- [ ] Enviar body vacío → ❌ Debe retornar error 400
- [ ] Actualizar compra inexistente → ❌ Debe retornar error 400
- [ ] Actualizar factura de venta (tipo FAC) → ❌ Debe retornar error 400
- [ ] Verificar auditoría (`fac_fch_mod`, `fac_usu_cod_mod`) → ✅ Debe registrarse

---

## 📊 Casos de Uso

### Caso 1: Corrección de Fecha Errónea
**Problema:** Se registró una compra con fecha incorrecta (2026-02-01 en lugar de 2026-02-15).

**Solución:**
```bash
curl -X PUT https://api.example.com/api/compras/COM000123 \
  -H "Content-Type: application/json" \
  -H "x-access-token: <token>" \
  -d '{"fac_fec": "2026-02-15"}'
```

---

### Caso 2: Cambio de Proveedor por Datos Erróneos
**Problema:** Se asignó el proveedor equivocado al registrar la compra.

**Solución:**
```bash
curl -X PUT https://api.example.com/api/compras/COM000124 \
  -H "Content-Type: application/json" \
  -H "x-access-token: <token>" \
  -d '{"nit_sec": "900999888", "fac_obs": "Proveedor corregido"}'
```

---

### Caso 3: Cancelar Compra Devuelta
**Problema:** Se devolvió completamente la mercancía al proveedor.

**Solución:**
```bash
curl -X PUT https://api.example.com/api/compras/COM000125 \
  -H "Content-Type: application/json" \
  -H "x-access-token: <token>" \
  -d '{
    "fac_est_fac": "C",
    "fac_obs": "Devolución completa - factura crediticia emitida"
  }'
```

---

### Caso 4: Reactivar Compra Inactiva
**Problema:** Se desactivó por error una compra válida.

**Solución:**
```bash
curl -X PUT https://api.example.com/api/compras/COM000126 \
  -H "Content-Type: application/json" \
  -H "x-access-token: <token>" \
  -d '{"fac_est_fac": "A"}'
```

---

## 🔗 Endpoints Relacionados

| Método | Endpoint                  | Descripción                |
|--------|---------------------------|----------------------------|
| POST   | `/api/compras`            | Crear nueva compra         |
| GET    | `/api/compras`            | Listar compras             |
| GET    | `/api/compras/:fac_nro`   | Obtener detalle de compra  |
| **PUT**| `/api/compras/:fac_nro`   | **Actualizar compra** (este endpoint) |

---

## 📝 Notas Técnicas

### ¿Por qué NO se pueden modificar artículos/costos?

El sistema utiliza **Costo Promedio Ponderado** (NIC 2 Colombia):

```
Nuevo Costo = (Valor Actual + Valor Compra) / (Cantidad Actual + Cantidad Compra)
```

Cuando se registra una compra:
1. Se calcula el nuevo costo promedio por artículo
2. Se actualiza `articulosdetalle.art_bod_cos_cat`
3. Se registra en `historial_costos`
4. Se crea movimiento en `facturakardes`

**Modificar cantidades o costos** requeriría:
- ❌ Recalcular todos los costos desde esa fecha hacia adelante
- ❌ Actualizar todas las ventas posteriores
- ❌ Regenerar el historial de costos completo
- ❌ Verificar impactos en reportes financieros

Por lo tanto, se **bloquea la modificación** de estos campos para garantizar **integridad contable**.

### ¿Qué hacer si se necesita corregir artículos/costos?

**Opción 1:** Cancelar la compra errónea y crear una nueva
```bash
# 1. Cancelar compra errónea
PUT /api/compras/COM000001 → {"fac_est_fac": "C", "fac_obs": "Compra errónea - ver COM000050"}

# 2. Crear compra correcta
POST /api/compras → {...datos correctos...}
```

**Opción 2 (futuro):** Implementar endpoint de **Nota de Ajuste de Compra** que:
- Cree movimiento de ajuste en kardex
- Recalcule costos correctamente
- Mantenga trazabilidad completa

---

## 📅 Historial de Versiones

| Versión | Fecha       | Cambios                                  |
|---------|-------------|------------------------------------------|
| 1.0     | 2026-02-16  | Creación inicial del endpoint PUT        |

---

**Última actualización:** 2026-02-16
**Documentado por:** Sistema API Pretty
**Estado:** ✅ Implementado y listo para uso
