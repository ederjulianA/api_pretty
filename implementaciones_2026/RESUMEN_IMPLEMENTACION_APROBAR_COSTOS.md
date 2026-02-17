# Resumen: Implementación de Endpoints para Aprobar Costos

**Fecha:** 2026-02-17
**Estado:** ✅ **IMPLEMENTADO Y LISTO**

---

## ✅ Lo que se implementó

Se agregaron **2 nuevos endpoints** al sistema de carga de costos para permitir aprobar costos con alertas o rechazados:

### 1. **Aprobar Costo Individual**

```
PUT /api/carga-costos/aprobar/:art_cod
```

**Uso desde el frontend:**
```javascript
await axiosInstance.put(`/carga-costos/aprobar/${artCod}`, {
  observaciones: "Margen aceptable para este producto"
});
```

### 2. **Aprobar Costos Masivamente**

```
PUT /api/carga-costos/actualizar-estado
```

**Uso desde el frontend:**
```javascript
await axiosInstance.put('/carga-costos/actualizar-estado', {
  art_cods: ["5005", "5006", "5007"],
  observaciones: "Aprobados masivamente - validados por gerencia"
});
```

---

## 🎯 Problema Resuelto

**ANTES:**
- ❌ Costos con `VALIDADO_CON_ALERTAS` no se podían aplicar
- ❌ No había forma de aprobar estos costos
- ❌ Usuario debía ajustar precios/costos manualmente

**DESPUÉS:**
- ✅ Usuario puede aprobar costos con margen bajo
- ✅ Se registra auditoría completa (quién, cuándo, por qué)
- ✅ Costos aprobados pueden aplicarse normalmente

---

## 📋 Archivos Modificados

1. **[controllers/cargaCostosController.js](../controllers/cargaCostosController.js)**
   - ✅ Función `aprobarCostoIndividual()`
   - ✅ Función `aprobarCostosMasivo()`

2. **[routes/cargaCostosRoutes.js](../routes/cargaCostosRoutes.js)**
   - ✅ Ruta `PUT /aprobar/:art_cod`
   - ✅ Ruta `PUT /actualizar-estado`

---

## 🔐 Validaciones Implementadas

### ✅ Solo se pueden aprobar costos con estado:
- `VALIDADO_CON_ALERTAS` (margen < 20%)
- `RECHAZADO` (costo >= precio)

### ❌ NO se pueden aprobar costos con estado:
- `VALIDADO` (ya aprobado)
- `APLICADO` (ya aplicado a inventario)
- `PENDIENTE` (no validado)

### ✅ Auditoría completa:
- Usuario que aprobó
- Fecha de aprobación
- Observaciones del por qué se aprobó

---

## 📊 Ejemplo de Flujo

### Usuario ve costos con alertas:

```bash
GET /api/carga-costos/alertas
```

**Response:**
```json
{
  "data": [
    {
      "art_cod": "5005",
      "art_nom": "Producto XYZ",
      "margen": "16.67",
      "estado": "VALIDADO_CON_ALERTAS"
    }
  ]
}
```

### Usuario aprueba el costo:

```bash
PUT /api/carga-costos/aprobar/5005

{
  "observaciones": "Margen bajo aceptado - alta rotación"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "art_cod": "5005",
    "estado_anterior": "VALIDADO_CON_ALERTAS",
    "estado_nuevo": "VALIDADO"
  }
}
```

### Usuario aplica los costos:

```bash
POST /api/carga-costos/aplicar
```

**Ahora SÍ se aplica** porque el estado es `VALIDADO` ✅

---

## 🚀 Frontend Ya Puede Usar

El frontend ya tiene todo implementado en:
- `src/components/AprobarCostosAlertasModal.jsx`
- `src/pages/DashboardCostos.jsx`

**Solo necesita actualizar los endpoints a:**
- ✅ `PUT /api/carga-costos/aprobar/:art_cod`
- ✅ `PUT /api/carga-costos/actualizar-estado`

---

## 📌 Resumen Ultra-Rápido

| Acción | Endpoint | Método |
|--------|----------|--------|
| Aprobar 1 costo | `/api/carga-costos/aprobar/:art_cod` | PUT |
| Aprobar múltiples | `/api/carga-costos/actualizar-estado` | PUT |

**Payload mínimo:**
```json
{
  "observaciones": "Por qué se aprueba"
}
```

**Para masivo agregar:**
```json
{
  "art_cods": ["5005", "5006"],
  "observaciones": "Por qué se aprueban"
}
```

---

**✅ TODO LISTO - FRONTEND PUEDE EMPEZAR A USAR INMEDIATAMENTE**

