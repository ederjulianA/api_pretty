# API Endpoints: Carga Inicial de Costos

**Fecha:** 2026-02-09
**Última actualización:** 2026-02-19
**Versión:** 2.0
**Base URL:** `http://localhost:3000/api`

---

## 📋 Tabla de Contenidos

1. [Autenticación](#autenticación)
2. [Endpoints Disponibles](#endpoints-disponibles)
3. [Flujo Completo de Uso](#flujo-completo-de-uso)
4. [Concepto: Markup vs Margen](#concepto-markup-vs-margen)
5. [Códigos de Respuesta](#códigos-de-respuesta)

---

## Autenticación

Todos los endpoints requieren autenticación mediante JWT.

**Header requerido:**
```
x-access-token: <tu_token_jwt>
```

---

## Endpoints Disponibles

### 1. Exportar Plantilla Excel

**Descripción:** Genera y descarga un archivo Excel con **TODOS** los artículos (sin importar existencia) para cargar o revisar costos.

```http
GET /api/carga-costos/exportar
```

**Estructura del Excel generado (14 columnas):**

| Col | Campo | Descripción | Editable |
|-----|-------|-------------|----------|
| A | categoria | Categoría del producto | ❌ |
| B | subcategoria | Subcategoría del producto | ❌ |
| C | art_cod | SKU del producto | ❌ |
| D | art_nom | Nombre del producto | ❌ |
| E | existencia | Stock actual (puede ser 0) | ❌ |
| F | precio_venta_detal | Precio lista 1 (detal) | ❌ |
| G | precio_venta_mayor | Precio lista 2 (mayor) | ❌ |
| H | costo_promedio_actual | Costo vigente en `art_bod_cos_cat` (0 = sin costo) | ❌ |
| I | rentabilidad_detal_pct | Margen % sobre precio detal (solo si tiene costo) | ❌ |
| J | rentabilidad_mayor_pct | Margen % sobre precio mayor (solo si tiene costo) | ❌ |
| K | total_unidades_vendidas | Unidades vendidas en facturas tipo VTA activas | ❌ |
| **L** | **costo_inicial** | **Costo a asignar** | **✅ SÍ** |
| **M** | **metodo** | **Método de obtención** | **✅ SÍ** |
| **N** | **observaciones** | **Notas adicionales** | **✅ SÍ** |

> **Importante:** Al importar, la posición de columna L es la que se lee como `costo_inicial`. No mover las columnas.

---

### 2. Importar Costos desde Excel

**Descripción:** Importa costos desde el Excel exportado. Soporta importación incremental (UPSERT).

```http
POST /api/carga-costos/importar
```

**Body (FormData):**
- `archivo`: Archivo Excel (.xlsx, .xls) — máximo 10MB
- `usu_cod`: Usuario (opcional)

**Lógica:**
- Lee columna C (art_cod) como identificador
- Lee columna L (costo_inicial) como costo a cargar
- Ignora filas sin `costo_inicial` o sin SKU
- Si el artículo ya existe en `carga_inicial_costos` → ACTUALIZA
- Si es nuevo → INSERTA

**Respuesta:**
```json
{
  "success": true,
  "message": "Importación completada exitosamente",
  "data": {
    "total_filas": 250,
    "procesados": 70,
    "nuevos": 40,
    "actualizados": 30,
    "ignorados": 180,
    "errores": []
  }
}
```

---

### 3. Calcular Costos Automáticamente ⭐

**Descripción:** Calcula costos para todos los artículos SIN costo asignado usando fórmula de markup reverso. Respeta los que ya tienen `art_bod_cos_cat > 0`.

```http
POST /api/carga-costos/calcular-automatico
```

**Body (JSON):**
```json
{
  "usu_cod": "admin",    // Opcional
  "margen_mayor": 25,    // Markup sobre precio mayor (default: 20)
  "margen_detal": 25     // Markup sobre precio detal (default: igual a margen_mayor)
}
```

**Prioridad de cálculo por artículo:**
1. Tiene `precio_mayor > 0` → `Costo = Precio Mayor / (1 + margen_mayor/100)`
2. Solo tiene `precio_detal > 0` → `Costo = Precio Detal / (1 + margen_detal/100)`
3. Sin ningún precio → se omite (contador `sin_precio`)
4. Ya tiene `art_bod_cos_cat > 0` → se omite (contador `ya_con_costo`)

> **⚠️ Concepto clave:** El parámetro `margen_mayor` es un **markup** (sobre costo), no un margen (sobre precio venta). Ver sección [Markup vs Margen](#concepto-markup-vs-margen).

**Respuesta:**
```json
{
  "success": true,
  "message": "Cálculo automático de costos completado exitosamente",
  "data": {
    "total_productos": 650,
    "procesados": 500,
    "ya_con_costo": 150,
    "calculados_desde_mayor": 490,
    "calculados_desde_detal": 10,
    "sin_precio": 5,
    "nuevos": 480,
    "actualizados": 20,
    "markup_mayor_aplicado": "25%",
    "markup_detal_aplicado": "25%",
    "formulas": {
      "desde_mayor": "Costo = Precio Mayor / 1.25",
      "desde_detal": "Costo = Precio Detal / 1.25"
    }
  }
}
```

---

### 4. Obtener Resumen de Carga

```http
GET /api/carga-costos/resumen
```

**Estados posibles:**

| Estado | Descripción |
|--------|-------------|
| `PENDIENTE` | Calculado, aún no validado |
| `VALIDADO` | Aprobado automáticamente (margen ≥ 20%) |
| `VALIDADO_CON_ALERTAS` | Margen < 20%, requiere aprobación manual |
| `RECHAZADO` | Costo inválido (negativo o mayor que precio) |
| `APLICADO` | Ya aplicado a `articulosdetalle` |

**Respuesta:**
```json
{
  "success": true,
  "data": [
    { "estado": "VALIDADO", "cantidad": 65, "margen_promedio": 20.0 },
    { "estado": "VALIDADO_CON_ALERTAS", "cantidad": 435, "margen_promedio": 20.0 },
    { "estado": "RECHAZADO", "cantidad": 2, "margen_promedio": null }
  ]
}
```

> **Nota:** Con `margen_mayor: 25` (markup), el margen resultante es exactamente 20%, que es el límite del SP validador. Puede que algunos queden en `VALIDADO_CON_ALERTAS` por redondeo.

---

### 5. Obtener Productos con Alertas

```http
GET /api/carga-costos/alertas
```

Lista productos en estado `VALIDADO_CON_ALERTAS` o `RECHAZADO`.

**Respuesta:**
```json
{
  "success": true,
  "data": [
    {
      "art_cod": "SM005",
      "art_nom": "Sombra Mate Coral",
      "costo_propuesto": 8000,
      "precio_venta": 10000,
      "margen": 20.0,
      "estado": "VALIDADO_CON_ALERTAS",
      "observaciones": "Cálculo automático... | ALERTA: Margen muy bajo (<20%)"
    },
    {
      "art_cod": "E6123570882129E",
      "art_nom": "PROTECTOR SOLAR GRANDE TRENDY",
      "costo_propuesto": 33333.33,
      "precio_venta": 27000,
      "margen": -23.46,
      "estado": "RECHAZADO",
      "observaciones": "... | ERROR: Costo mayor o igual que precio venta"
    }
  ]
}
```

**Causa común de RECHAZADO:** El precio mayor es mayor que el precio detal (precios invertidos en el sistema). Corregir los precios del artículo antes de reprocesar.

---

### 5b. Actualizar Estado Masivamente

**Descripción:** Cambia el estado de registros en `carga_inicial_costos`. Paso crítico para aprobar `VALIDADO_CON_ALERTAS` antes de aplicar.

```http
PUT /api/carga-costos/actualizar-estado
```

**Modo 1 — Por estado (recomendado para aprobar masivamente):**
```json
{
  "estado_actual": "VALIDADO_CON_ALERTAS",
  "nuevo_estado": "VALIDADO",
  "usu_cod": "admin"
}
```

**Modo 2 — Por lista de artículos:**
```json
{
  "art_cods": ["ART001", "ART002"],
  "nuevo_estado": "VALIDADO",
  "usu_cod": "admin"
}
```

**Estados válidos para `nuevo_estado`:** `VALIDADO`, `VALIDADO_CON_ALERTAS`, `PENDIENTE`, `RECHAZADO`

**Respuesta:**
```json
{
  "success": true,
  "message": "Estado actualizado: 435 registros de VALIDADO_CON_ALERTAS a VALIDADO",
  "data": {
    "afectados": 435
  }
}
```

---

### 6. Aplicar Costos Validados

**Descripción:** Aplica los costos con estado `VALIDADO` a `articulosdetalle.art_bod_cos_cat` y registra en `historial_costos`.

```http
POST /api/carga-costos/aplicar
```

**Body (JSON):**
```json
{
  "usu_cod": "admin"
}
```

**⚠️ Importante:**
- Solo procesa registros en estado `VALIDADO` (no `VALIDADO_CON_ALERTAS`)
- Si retorna `total_aplicados: 0` → usar `GET /resumen` para verificar estados y `PUT /actualizar-estado` si hay `VALIDADO_CON_ALERTAS`
- Operación irreversible — modifica `articulosdetalle`

**Respuesta:**
```json
{
  "success": true,
  "message": "Carga inicial aplicada exitosamente",
  "data": {
    "total_aplicados": 500,
    "errores": 0
  }
}
```

---

## Flujo Completo de Uso

### Flujo A — Cálculo Automático (RECOMENDADO para 600+ productos)

```
1. POST /calcular-automatico  { margen_mayor: 25, margen_detal: 25 }
        ↓
2. GET  /resumen               → verificar estados
        ↓
3. PUT  /actualizar-estado     { estado_actual: "VALIDADO_CON_ALERTAS", nuevo_estado: "VALIDADO" }
        ↓ (si hay RECHAZADOS, corregir precios del artículo y volver al paso 1)
4. POST /aplicar               → aplica a articulosdetalle
```

### Flujo B — Carga Manual por Excel

```
1. GET  /exportar              → descargar Excel con 14 columnas
2.      Completar columna L (costo_inicial) en el Excel
3. POST /importar              → subir Excel completado
4. GET  /resumen               → verificar estados
5. PUT  /actualizar-estado     → aprobar alertas si aplica
6. POST /aplicar               → aplica a articulosdetalle
```

### Reimportar / Recalcular desde cero

```sql
-- Limpiar staging (no toca articulosdetalle)
DELETE FROM dbo.carga_inicial_costos
WHERE cic_estado IN ('PENDIENTE', 'VALIDADO', 'VALIDADO_CON_ALERTAS', 'RECHAZADO');
```
Luego ejecutar Flujo A nuevamente.

---

## Concepto: Markup vs Margen

El parámetro `margen_mayor` del endpoint es en realidad un **markup** (ganancia sobre costo), no un margen (ganancia sobre precio venta). Son la misma ganancia absoluta pero expresada sobre bases diferentes:

| Markup enviado | Margen resultante | ¿Pasa validación SP sin alertas? |
|---|---|---|
| 20% | 16.67% | ❌ VALIDADO_CON_ALERTAS |
| 25% | 20.00% | ⚠️ Límite exacto (posibles alertas por redondeo) |
| **30%** | **23.08%** | ✅ VALIDADO directo |

**Fórmula de conversión:**
```
Markup deseado para obtener margen M:
Markup = M / (1 - M/100)

Ejemplo para margen 20%:
Markup = 20 / (1 - 0.20) = 25%
```

---

## Corrección de costos ya aplicados con margen bajo

Si se aplicaron costos con margen insuficiente, corregir directamente en SQL:

```sql
-- Diagnóstico: artículos con margen < 20%
SELECT a.art_cod, a.art_nom,
       ad_d.art_bod_cos_cat AS costo_actual,
       ad_d.art_bod_pre AS precio_detal,
       ROUND((ad_d.art_bod_pre - ad_d.art_bod_cos_cat) / ad_d.art_bod_pre * 100, 2) AS margen_pct,
       ROUND(ad.art_bod_pre / 1.25, 2) AS costo_corregido
FROM dbo.articulos a
INNER JOIN dbo.articulosdetalle ad_d ON ad_d.art_sec = a.art_sec
    AND ad_d.bod_sec = '1' AND ad_d.lis_pre_cod = 1
INNER JOIN dbo.articulosdetalle ad ON ad.art_sec = a.art_sec
    AND ad.bod_sec = '1' AND ad.lis_pre_cod = 2
WHERE ad_d.art_bod_cos_cat > 0 AND ad_d.art_bod_pre > 0
  AND (ad_d.art_bod_pre - ad_d.art_bod_cos_cat) / ad_d.art_bod_pre * 100 < 20
ORDER BY margen_pct ASC;

-- Corrección: recalcular con markup 25%
UPDATE ad_d
SET ad_d.art_bod_cos_cat = ROUND(ad.art_bod_pre / 1.25, 2)
FROM dbo.articulosdetalle ad_d
INNER JOIN dbo.articulos a ON a.art_sec = ad_d.art_sec
INNER JOIN dbo.articulosdetalle ad ON ad.art_sec = ad_d.art_sec
    AND ad.bod_sec = '1' AND ad.lis_pre_cod = 2
WHERE ad_d.bod_sec = '1' AND ad_d.lis_pre_cod = 1
  AND ad_d.art_bod_cos_cat > 0 AND ad_d.art_bod_pre > 0
  AND (ad_d.art_bod_pre - ad_d.art_bod_cos_cat) / ad_d.art_bod_pre * 100 < 20
  AND ad.art_bod_pre > 0;
```

---

## Códigos de Respuesta

| Código | Descripción |
|--------|-------------|
| 200 | Operación exitosa |
| 400 | Parámetros inválidos o faltantes |
| 401 | Token JWT inválido o expirado |
| 404 | Artículo no encontrado |
| 500 | Error interno del servidor |

---

**Última actualización:** 2026-02-19
**Versión:** 2.0
