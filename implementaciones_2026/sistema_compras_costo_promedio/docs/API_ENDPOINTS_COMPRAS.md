# API Endpoints - Sistema de Compras con Costo Promedio

**Fecha:** 2026-02-15
**Versión:** 1.0
**Fase:** 1 - Sistema de Compras
**Relacionado:** ANALISIS_SISTEMA_COMPRAS_COSTO_PROMEDIO.md

---

## 📋 Índice

1. [Descripción General](#descripción-general)
2. [Autenticación](#autenticación)
3. [Endpoints](#endpoints)
   - [1. Registrar Compra](#1-registrar-compra)
   - [2. Listar Compras](#2-listar-compras)
   - [3. Obtener Detalle de Compra](#3-obtener-detalle-de-compra)
   - [4. Reporte de Variación de Costos](#4-reporte-de-variación-de-costos)
   - [5. Reporte de Compras por Proveedor](#5-reporte-de-compras-por-proveedor)
4. [Escenarios de Uso](#escenarios-de-uso)
5. [Validaciones y Reglas de Negocio](#validaciones-y-reglas-de-negocio)
6. [Códigos de Error](#códigos-de-error)

---

## Descripción General

Este conjunto de endpoints permite gestionar el **Sistema de Compras con Cálculo Automático de Costo Promedio Ponderado** según NIC 2 Colombia.

**Características principales:**
- ✅ Registro de compras con múltiples detalles
- ✅ Cálculo automático de costo promedio al comprar
- ✅ Actualización automática en `articulosdetalle.art_bod_cos_cat`
- ✅ Registro completo en `historial_costos`
- ✅ Generación de kárdex (factura + facturakardes)
- ✅ Reportes de variación de costos
- ✅ Lógica 100% en JavaScript (database-agnostic)

**Fórmula aplicada:**
```
Nuevo Costo Promedio = (Valor Actual + Valor Compra) / (Cantidad Actual + Cantidad Compra)

Donde:
- Valor Actual = Costo Actual × Existencia Actual
- Valor Compra = Costo Unitario Compra × Cantidad Compra
```

---

## Autenticación

**Todos los endpoints requieren autenticación JWT.**

### Obtener Token

```bash
POST /api/auth/login
Content-Type: application/json

{
  "usu_cod": "admin",
  "usu_pass": "tu_password"
}
```

**Respuesta:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Usar Token

En todos los requests, incluir header:
```
x-access-token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## Endpoints

### 1. Registrar Compra

Registra una nueva compra con cálculo automático de costo promedio.

**Endpoint:** `POST /api/compras`

**Headers:**
- `x-access-token`: Token JWT
- `Content-Type`: application/json

**Body:**
```json
{
  "nit_cod": "900123456",
  "fac_fec": "2026-02-15",
  "fac_obs": "Compra de mercancía febrero 2026",
  "detalles": [
    {
      "art_sec": "ART001",
      "cantidad": 100,
      "costo_unitario": 25000
    },
    {
      "art_sec": "ART002",
      "cantidad": 50,
      "costo_unitario": 45000
    }
  ]
}
```

**Parámetros:**

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `nit_cod` | string | ✅ Sí | Código del proveedor (debe existir en tabla `nit`) |
| `fac_fec` | string | ✅ Sí | Fecha de compra (formato: YYYY-MM-DD) |
| `fac_obs` | string | ❌ No | Observaciones de la compra |
| `detalles` | array | ✅ Sí | Array de items comprados (mínimo 1) |
| `detalles[].art_sec` | string | ✅ Sí | Código del artículo |
| `detalles[].cantidad` | number | ✅ Sí | Cantidad comprada (> 0) |
| `detalles[].costo_unitario` | number | ✅ Sí | Costo unitario de compra (> 0) |

**Respuesta Exitosa (201):**
```json
{
  "success": true,
  "message": "Compra registrada exitosamente",
  "data": {
    "fac_nro": "COM000001",
    "total_items": 2,
    "total_valor": 4750000,
    "detalles_actualizacion": [
      {
        "art_sec": "ART001",
        "cantidad": 100,
        "costo_unitario": 25000,
        "costo_anterior": 24000,
        "costo_nuevo": 24500,
        "diferencia": 500,
        "existencia_anterior": 200,
        "existencia_nueva": 300
      },
      {
        "art_sec": "ART002",
        "cantidad": 50,
        "costo_unitario": 45000,
        "costo_anterior": 42000,
        "costo_nuevo": 43000,
        "diferencia": 1000,
        "existencia_anterior": 150,
        "existencia_nueva": 200
      }
    ]
  }
}
```

**Proceso Interno:**

1. **Validación de datos**
2. **Generación de número de compra** (COM000001, COM000002, etc.)
3. **Para cada detalle:**
   - Consulta costo actual y existencia
   - Calcula nuevo costo promedio ponderado
   - Inserta en `facturakardes` (kárdex)
   - Actualiza `articulosdetalle.art_bod_cos_cat`
   - Registra en `historial_costos`
4. **Inserta encabezado en `factura`**
5. **Commit de transacción**

**Ejemplo cURL:**
```bash
curl -X POST http://localhost:3000/api/compras \
  -H "x-access-token: eyJhbGc..." \
  -H "Content-Type: application/json" \
  -d '{
    "nit_cod": "900123456",
    "fac_fec": "2026-02-15",
    "fac_obs": "Compra febrero 2026",
    "detalles": [
      {
        "art_sec": "ART001",
        "cantidad": 100,
        "costo_unitario": 25000
      }
    ]
  }'
```

---

### 2. Listar Compras

Obtiene el historial de compras con filtros opcionales.

**Endpoint:** `GET /api/compras`

**Headers:**
- `x-access-token`: Token JWT

**Query Parameters (todos opcionales):**

| Parámetro | Tipo | Descripción | Ejemplo |
|-----------|------|-------------|---------|
| `fecha_desde` | string | Fecha inicio (YYYY-MM-DD) | 2026-01-01 |
| `fecha_hasta` | string | Fecha fin (YYYY-MM-DD) | 2026-02-28 |
| `nit_cod` | string | Filtrar por proveedor | 900123456 |
| `limit` | number | Límite de registros (default: 100) | 50 |

**Respuesta Exitosa (200):**
```json
{
  "success": true,
  "data": [
    {
      "fac_nro": "COM000002",
      "fac_fec": "2026-02-15T00:00:00.000Z",
      "nit_cod": "900123456",
      "proveedor": "Distribuidora XYZ S.A.S.",
      "total": 4750000,
      "fac_obs": "Compra febrero 2026",
      "usu_cod": "admin",
      "total_items": 2
    },
    {
      "fac_nro": "COM000001",
      "fac_fec": "2026-02-10T00:00:00.000Z",
      "nit_cod": "800567890",
      "proveedor": "Importadora ABC Ltda.",
      "total": 3200000,
      "fac_obs": "Compra inicial",
      "usu_cod": "admin",
      "total_items": 3
    }
  ],
  "total": 2,
  "filtros_aplicados": {
    "fecha_desde": "2026-02-01",
    "fecha_hasta": "2026-02-28",
    "limit": 100
  }
}
```

**Ejemplo cURL:**
```bash
# Listar todas las compras (últimas 100)
curl -X GET http://localhost:3000/api/compras \
  -H "x-access-token: eyJhbGc..."

# Filtrar por fecha y proveedor
curl -X GET "http://localhost:3000/api/compras?fecha_desde=2026-02-01&fecha_hasta=2026-02-28&nit_cod=900123456" \
  -H "x-access-token: eyJhbGc..."

# Limitar a 20 registros
curl -X GET "http://localhost:3000/api/compras?limit=20" \
  -H "x-access-token: eyJhbGc..."
```

---

### 3. Obtener Detalle de Compra

Obtiene el detalle completo de una compra específica (encabezado + detalles).

**Endpoint:** `GET /api/compras/:fac_nro`

**Headers:**
- `x-access-token`: Token JWT

**URL Parameters:**

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `fac_nro` | string | Número de compra (ej: COM000001) |

**Respuesta Exitosa (200):**
```json
{
  "success": true,
  "data": {
    "encabezado": {
      "fac_nro": "COM000001",
      "fac_fec": "2026-02-15T00:00:00.000Z",
      "nit_cod": "900123456",
      "proveedor": "Distribuidora XYZ S.A.S.",
      "fac_sub": 4750000,
      "fac_tot": 4750000,
      "fac_obs": "Compra febrero 2026",
      "usu_cod": "admin"
    },
    "detalles": [
      {
        "kar_sec": 1,
        "art_sec": "ART001",
        "art_cod": "PROD001",
        "art_nom": "Producto de Ejemplo 1",
        "cantidad": 100,
        "costo_unitario": 25000,
        "valor_total": 2500000,
        "costo_actual": 24500
      },
      {
        "kar_sec": 2,
        "art_sec": "ART002",
        "art_cod": "PROD002",
        "art_nom": "Producto de Ejemplo 2",
        "cantidad": 50,
        "costo_unitario": 45000,
        "valor_total": 2250000,
        "costo_actual": 43000
      }
    ]
  }
}
```

**Respuesta Error (404):**
```json
{
  "success": false,
  "message": "Compra COM000999 no encontrada"
}
```

**Ejemplo cURL:**
```bash
curl -X GET http://localhost:3000/api/compras/COM000001 \
  -H "x-access-token: eyJhbGc..."
```

---

### 4. Reporte de Variación de Costos

Genera un reporte de los artículos con mayor variación de costos en un período.

**Endpoint:** `GET /api/compras/reportes/variacion-costos`

**Headers:**
- `x-access-token`: Token JWT

**Query Parameters (todos opcionales):**

| Parámetro | Tipo | Descripción | Ejemplo |
|-----------|------|-------------|---------|
| `fecha_desde` | string | Fecha inicio (YYYY-MM-DD) | 2026-01-01 |
| `fecha_hasta` | string | Fecha fin (YYYY-MM-DD) | 2026-02-28 |
| `limit` | number | Límite de registros (default: 50) | 20 |

**Respuesta Exitosa (200):**
```json
{
  "success": true,
  "data": [
    {
      "hc_art_sec": "ART003",
      "art_cod": "PROD003",
      "art_nom": "Producto con Mayor Variación",
      "total_cambios": 5,
      "costo_minimo": 20000,
      "costo_maximo": 28000,
      "costo_promedio": 24500,
      "variacion_absoluta": 8000,
      "variacion_porcentual": 40.0,
      "ultima_actualizacion": "2026-02-15T10:30:00.000Z"
    },
    {
      "hc_art_sec": "ART001",
      "art_cod": "PROD001",
      "art_nom": "Producto de Ejemplo 1",
      "total_cambios": 3,
      "costo_minimo": 24000,
      "costo_maximo": 26000,
      "costo_promedio": 25000,
      "variacion_absoluta": 2000,
      "variacion_porcentual": 8.33,
      "ultima_actualizacion": "2026-02-14T15:20:00.000Z"
    }
  ],
  "total": 2,
  "filtros": {
    "fecha_desde": "2026-02-01",
    "fecha_hasta": "2026-02-28",
    "limit": 50
  }
}
```

**Descripción de Campos:**

- `total_cambios`: Número de compras que afectaron el costo
- `costo_minimo`: Costo más bajo registrado en el período
- `costo_maximo`: Costo más alto registrado en el período
- `costo_promedio`: Promedio de costos en el período
- `variacion_absoluta`: Diferencia entre costo máximo y mínimo
- `variacion_porcentual`: Porcentaje de variación ((max - min) / min × 100)

**Ejemplo cURL:**
```bash
# Reporte completo
curl -X GET http://localhost:3000/api/compras/reportes/variacion-costos \
  -H "x-access-token: eyJhbGc..."

# Reporte de febrero 2026, top 10
curl -X GET "http://localhost:3000/api/compras/reportes/variacion-costos?fecha_desde=2026-02-01&fecha_hasta=2026-02-28&limit=10" \
  -H "x-access-token: eyJhbGc..."
```

---

### 5. Reporte de Compras por Proveedor

Genera un reporte agrupado por proveedor con totales y promedios.

**Endpoint:** `GET /api/compras/reportes/por-proveedor`

**Headers:**
- `x-access-token`: Token JWT

**Query Parameters (todos opcionales):**

| Parámetro | Tipo | Descripción | Ejemplo |
|-----------|------|-------------|---------|
| `fecha_desde` | string | Fecha inicio (YYYY-MM-DD) | 2026-01-01 |
| `fecha_hasta` | string | Fecha fin (YYYY-MM-DD) | 2026-02-28 |

**Respuesta Exitosa (200):**
```json
{
  "success": true,
  "data": [
    {
      "nit_cod": "900123456",
      "proveedor": "Distribuidora XYZ S.A.S.",
      "total_compras": 12,
      "valor_total": 45800000,
      "valor_promedio": 3816666.67,
      "primera_compra": "2026-01-05T00:00:00.000Z",
      "ultima_compra": "2026-02-15T00:00:00.000Z"
    },
    {
      "nit_cod": "800567890",
      "proveedor": "Importadora ABC Ltda.",
      "total_compras": 8,
      "valor_total": 32500000,
      "valor_promedio": 4062500.0,
      "primera_compra": "2026-01-10T00:00:00.000Z",
      "ultima_compra": "2026-02-10T00:00:00.000Z"
    }
  ],
  "total_proveedores": 2,
  "filtros": {
    "fecha_desde": "2026-01-01",
    "fecha_hasta": "2026-02-28"
  }
}
```

**Descripción de Campos:**

- `total_compras`: Número de compras realizadas al proveedor
- `valor_total`: Suma total de todas las compras
- `valor_promedio`: Promedio del valor de las compras
- `primera_compra`: Fecha de la primera compra
- `ultima_compra`: Fecha de la compra más reciente

**Ejemplo cURL:**
```bash
# Reporte completo
curl -X GET http://localhost:3000/api/compras/reportes/por-proveedor \
  -H "x-access-token: eyJhbGc..."

# Reporte de febrero 2026
curl -X GET "http://localhost:3000/api/compras/reportes/por-proveedor?fecha_desde=2026-02-01&fecha_hasta=2026-02-28" \
  -H "x-access-token: eyJhbGc..."
```

---

## Escenarios de Uso

### Escenario 1: Registrar Primera Compra de un Producto

**Situación:** Artículo sin costo previo (costo_actual = 0, existencia = 0)

**Request:**
```json
POST /api/compras
{
  "nit_cod": "900123456",
  "fac_fec": "2026-02-15",
  "detalles": [
    {
      "art_sec": "NUEVO001",
      "cantidad": 50,
      "costo_unitario": 30000
    }
  ]
}
```

**Cálculo:**
```
Valor Actual = 0 × 0 = 0
Valor Compra = 30000 × 50 = 1,500,000
Cantidad Total = 0 + 50 = 50

Nuevo Costo Promedio = (0 + 1,500,000) / 50 = 30,000
```

**Resultado:**
```json
{
  "costo_anterior": 0,
  "costo_nuevo": 30000,
  "existencia_anterior": 0,
  "existencia_nueva": 50
}
```

---

### Escenario 2: Compra con Inventario Existente

**Situación:** Artículo con inventario (costo_actual = 24,000, existencia = 200)

**Request:**
```json
POST /api/compras
{
  "nit_cod": "900123456",
  "fac_fec": "2026-02-15",
  "detalles": [
    {
      "art_sec": "ART001",
      "cantidad": 100,
      "costo_unitario": 25000
    }
  ]
}
```

**Cálculo:**
```
Valor Actual = 24,000 × 200 = 4,800,000
Valor Compra = 25,000 × 100 = 2,500,000
Cantidad Total = 200 + 100 = 300

Nuevo Costo Promedio = (4,800,000 + 2,500,000) / 300 = 24,333.33
```

**Resultado:**
```json
{
  "costo_anterior": 24000,
  "costo_nuevo": 24333.33,
  "diferencia": 333.33,
  "existencia_anterior": 200,
  "existencia_nueva": 300
}
```

---

### Escenario 3: Compra Múltiple (varios artículos)

**Request:**
```json
POST /api/compras
{
  "nit_cod": "900123456",
  "fac_fec": "2026-02-15",
  "fac_obs": "Compra quincenal febrero",
  "detalles": [
    {
      "art_sec": "ART001",
      "cantidad": 100,
      "costo_unitario": 25000
    },
    {
      "art_sec": "ART002",
      "cantidad": 50,
      "costo_unitario": 45000
    },
    {
      "art_sec": "ART003",
      "cantidad": 200,
      "costo_unitario": 15000
    }
  ]
}
```

**Resultado:**
- ✅ Genera un solo `fac_nro` (ej: COM000005)
- ✅ Calcula costo promedio para cada artículo independientemente
- ✅ Registra 3 líneas en `facturakardes`
- ✅ Actualiza 3 costos en `articulosdetalle`
- ✅ Registra 3 entradas en `historial_costos`
- ✅ Total de compra: $7,750,000

---

### Escenario 4: Consultar Impacto de Compras

**Paso 1:** Registrar compra
```bash
POST /api/compras
{
  "nit_cod": "900123456",
  "fac_fec": "2026-02-15",
  "detalles": [...]
}

# Respuesta: { "fac_nro": "COM000001", ... }
```

**Paso 2:** Ver detalle
```bash
GET /api/compras/COM000001

# Respuesta: encabezado + detalles + costo_actual de cada producto
```

**Paso 3:** Ver reporte de variación
```bash
GET /api/compras/reportes/variacion-costos?fecha_desde=2026-02-01

# Respuesta: productos con mayor variación de costo
```

---

## Validaciones y Reglas de Negocio

### Validaciones de Entrada

**Campos requeridos:**
- ✅ `nit_cod` (proveedor)
- ✅ `fac_fec` (fecha)
- ✅ `detalles` (array con al menos 1 elemento)
- ✅ `detalles[].art_sec` (artículo)
- ✅ `detalles[].cantidad` (> 0)
- ✅ `detalles[].costo_unitario` (> 0)

**Validaciones de negocio:**
1. Proveedor (`nit_cod`) debe existir en tabla `nit`
2. Artículos (`art_sec`) deben existir en tabla `articulos`
3. Cantidades y costos deben ser mayores a 0
4. Fecha de compra no debe ser futura (opcional, según política)

### Reglas de Cálculo

**Fórmula de Costo Promedio Ponderado:**
```
Si cantidad_total > 0:
  Nuevo Costo = (Valor Actual + Valor Compra) / (Cantidad Actual + Cantidad Compra)
Sino:
  Nuevo Costo = 0
```

**Redondeo:**
- Costos se redondean a 2 decimales
- Valores totales se redondean a 2 decimales

### Transacciones

**Todo el proceso de compra se ejecuta en una sola transacción SQL:**

1. Generar número de compra (con UPDLOCK)
2. Insertar encabezado (`factura`)
3. Por cada detalle:
   - Calcular costo promedio
   - Insertar kárdex (`facturakardes`)
   - Actualizar costo (`articulosdetalle`)
   - Registrar historial (`historial_costos`)
4. **COMMIT** (si todo OK) o **ROLLBACK** (si error)

---

## Códigos de Error

### 400 - Bad Request

**Causa:** Datos inválidos o faltantes

```json
{
  "success": false,
  "message": "El código del proveedor (nit_cod) es requerido"
}
```

```json
{
  "success": false,
  "message": "Detalle 2: cantidad debe ser mayor a 0"
}
```

### 404 - Not Found

**Causa:** Compra no encontrada

```json
{
  "success": false,
  "message": "Compra COM000999 no encontrada"
}
```

### 500 - Internal Server Error

**Causa:** Error en servidor o base de datos

```json
{
  "success": false,
  "message": "Error registrando compra",
  "error": "Artículo ART999 no encontrado"
}
```

```json
{
  "success": false,
  "message": "Error calculando costo promedio",
  "error": "Transaction failed: deadlock detected"
}
```

---

## Notas Técnicas

### Database-Agnostic

**Toda la lógica de negocio está en JavaScript:**
- ✅ Cálculo de costo promedio en `compraModel.js`
- ✅ Generación de consecutivos en JavaScript
- ✅ Validaciones en controladores
- ✅ Transacciones manejadas con `mssql` driver

**SQL usado:**
- ✅ Solo queries estándar (SELECT, INSERT, UPDATE)
- ✅ Sin stored procedures
- ✅ Compatible con PostgreSQL con ajustes mínimos

**Migración futura a PostgreSQL:**
1. Cambiar driver: `mssql` → `pg`
2. Ajustar sintaxis menor: `GETDATE()` → `NOW()`
3. Ajustar tipos de datos: `DECIMAL` → `NUMERIC`
4. ✅ **No hay lógica que migrar** (todo en JS)

### Performance

**Optimizaciones implementadas:**
- ✅ Índices en `facturakardes(art_sec, kar_nat)`
- ✅ Índices en `factura(fac_tip_cod, fac_fec)`
- ✅ Índices en `historial_costos(hc_art_sec, hc_fecha)`
- ✅ Vista `vwCostoPromedioArticulos` para consultas rápidas

**Recomendaciones:**
- Para compras con +100 detalles, considerar procesamiento por lotes
- Ejecutar reportes en horarios de baja carga
- Usar `limit` en consultas para evitar timeouts

---

## Próximos Pasos

Después de Fase 1:

### ✅ Completado
- [x] Endpoints de registro de compras
- [x] Cálculo automático de costo promedio
- [x] Reportes básicos

### 📍 Siguiente: Fase 2 - Módulo de Ventas

Ver: `ANALISIS_SISTEMA_COMPRAS_COSTO_PROMEDIO.md` → Fase 2

**Tareas Fase 2:**
1. Registro de ventas con costo promedio
2. Cálculo automático de margen de utilidad
3. Kardex de salidas
4. Reportes de rentabilidad

---

**Documento creado por:** Claude Code
**Fecha:** 2026-02-15
**Versión:** 1.0
**Estado:** ✅ Implementado y Documentado
