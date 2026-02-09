# API Endpoints: Carga Inicial de Costos

**Fecha:** 2026-02-09
**Versión:** 1.0
**Base URL:** `http://localhost:3000/api`

---

## 📋 Tabla de Contenidos

1. [Autenticación](#autenticación)
2. [Endpoints Disponibles](#endpoints-disponibles)
3. [Flujo Completo de Uso](#flujo-completo-de-uso)
4. [Ejemplos de Peticiones](#ejemplos-de-peticiones)
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

**Descripción:** Genera y descarga un archivo Excel con todos los productos activos para que el usuario cargue los costos iniciales.

```http
GET /api/carga-costos/exportar
```

**Headers:**
```
x-access-token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Respuesta Exitosa:**
- **Tipo:** `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- **Archivo:** `carga_costos_inicial_2026-02-09.xlsx`

**Estructura del Excel generado:**

| Columna | Descripción | Editable |
|---------|-------------|----------|
| categoria | Categoría del producto | ❌ NO |
| subcategoria | Subcategoría del producto | ❌ NO |
| art_cod | SKU del producto | ❌ NO |
| art_nom | Nombre del producto | ❌ NO |
| existencia | Cantidad en stock | ❌ NO |
| precio_venta_detal | Precio de venta detal | ❌ NO |
| precio_venta_mayor | Precio de venta mayor | ❌ NO |
| **costo_inicial** | **Costo a cargar** | **✅ SÍ** |
| **metodo** | **Método de obtención** | **✅ SÍ** |
| **observaciones** | **Notas adicionales** | **✅ SÍ** |

---

### 2. Importar Costos desde Excel

**Descripción:** Importa costos desde un archivo Excel. Soporta importación incremental (actualiza registros existentes, crea nuevos).

```http
POST /api/carga-costos/importar
```

**Headers:**
```
x-access-token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: multipart/form-data
```

**Body (FormData):**
```
archivo: [archivo Excel]
usu_cod: "juan.perez"  (opcional, se toma del token si no se envía)
```

**Respuesta Exitosa (200):**
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
    "errores": [
      "Producto XYZ123: No encontrado en sistema"
    ]
  }
}
```

**Respuesta con Errores (400/500):**
```json
{
  "success": false,
  "message": "Error al importar el archivo Excel",
  "error": "Detalle del error"
}
```

**Validaciones:**
- Tamaño máximo: 10MB
- Formatos: `.xlsx`, `.xls`
- Costo debe ser numérico >= 0
- `art_cod` debe existir en la base de datos

---

### 3. Obtener Resumen de Carga

**Descripción:** Retorna un resumen del estado actual de los costos cargados.

```http
GET /api/carga-costos/resumen
```

**Headers:**
```
x-access-token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Respuesta Exitosa (200):**
```json
{
  "success": true,
  "data": [
    {
      "estado": "VALIDADO",
      "cantidad": 65,
      "margen_promedio": 45.5
    },
    {
      "estado": "VALIDADO_CON_ALERTAS",
      "cantidad": 5,
      "margen_promedio": 18.2
    },
    {
      "estado": "RECHAZADO",
      "cantidad": 2,
      "margen_promedio": null
    },
    {
      "estado": "PENDIENTE",
      "cantidad": 180,
      "margen_promedio": null
    }
  ]
}
```

**Estados posibles:**
- `PENDIENTE`: Aún no ha sido validado
- `VALIDADO`: Aprobado automáticamente
- `VALIDADO_CON_ALERTAS`: Requiere revisión manual (margen < 20%)
- `RECHAZADO`: Costo inválido (negativo o > precio venta)
- `APLICADO`: Ya fue aplicado a `articulosdetalle`

---

### 4. Obtener Productos con Alertas

**Descripción:** Lista todos los productos que requieren revisión manual (con alertas o rechazados).

```http
GET /api/carga-costos/alertas
```

**Headers:**
```
x-access-token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Respuesta Exitosa (200):**
```json
{
  "success": true,
  "data": [
    {
      "art_cod": "SM005",
      "art_nom": "Sombra Mate Coral",
      "costo_propuesto": 41000,
      "precio_venta": 50000,
      "margen": 18.0,
      "estado": "VALIDADO_CON_ALERTAS",
      "observaciones": " | ALERTA: Margen muy bajo (<20%)"
    },
    {
      "art_cod": "LP012",
      "art_nom": "Labial Premium Oro",
      "costo_propuesto": 65000,
      "precio_venta": 60000,
      "margen": -8.33,
      "estado": "RECHAZADO",
      "observaciones": " | ERROR: Costo mayor o igual que precio venta"
    }
  ]
}
```

---

### 5. Aplicar Costos Validados

**Descripción:** Aplica todos los costos validados a la tabla `articulosdetalle` y registra en el historial.

```http
POST /api/carga-costos/aplicar
```

**Headers:**
```
x-access-token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json
```

**Body (JSON):**
```json
{
  "usu_cod": "juan.perez"
}
```
*Nota: `usu_cod` es opcional, se toma del token si no se envía*

**Respuesta Exitosa (200):**
```json
{
  "success": true,
  "message": "Carga inicial aplicada exitosamente",
  "data": {
    "total_aplicados": 65,
    "errores": 0
  }
}
```

**Respuesta con Error (500):**
```json
{
  "success": false,
  "message": "Error al aplicar los costos",
  "error": "Detalle del error"
}
```

**⚠️ Importante:**
- Esta operación es **irreversible** en el sentido de que modifica los costos en `articulosdetalle`
- Solo aplica costos con estado `VALIDADO`
- Costos con alertas o rechazados NO se aplican hasta que se corrijan
- Se registra todo en `historial_costos` para auditoría

---

## Flujo Completo de Uso

### Escenario: Usuario carga costos por categorías

#### Paso 1: Exportar Plantilla

```bash
curl -X GET http://localhost:3000/api/carga-costos/exportar \
  -H "x-access-token: YOUR_TOKEN" \
  --output carga_costos.xlsx
```

**Resultado:** Descarga archivo `carga_costos_inicial_2026-02-09.xlsx` con 250 productos.

---

#### Paso 2: Usuario Completa Costos (Excel)

- Abre Excel
- Filtra por `categoria = "Labiales"`
- Completa columnas `costo_inicial` y `metodo` para 30 labiales
- Guarda archivo

---

#### Paso 3: Primera Importación

```bash
curl -X POST http://localhost:3000/api/carga-costos/importar \
  -H "x-access-token: YOUR_TOKEN" \
  -F "archivo=@carga_costos.xlsx" \
  -F "usu_cod=maria.lopez"
```

**Respuesta:**
```json
{
  "success": true,
  "message": "Importación completada exitosamente",
  "data": {
    "total_filas": 250,
    "procesados": 30,
    "nuevos": 30,
    "actualizados": 0,
    "ignorados": 220
  }
}
```

---

#### Paso 4: Verificar Estado

```bash
curl -X GET http://localhost:3000/api/carga-costos/resumen \
  -H "x-access-token: YOUR_TOKEN"
```

**Respuesta:**
```json
{
  "success": true,
  "data": [
    { "estado": "VALIDADO", "cantidad": 28, "margen_promedio": 46.2 },
    { "estado": "VALIDADO_CON_ALERTAS", "cantidad": 2, "margen_promedio": 18.5 },
    { "estado": "PENDIENTE", "cantidad": 220, "margen_promedio": null }
  ]
}
```

---

#### Paso 5: Revisar Alertas

```bash
curl -X GET http://localhost:3000/api/carga-costos/alertas \
  -H "x-access-token: YOUR_TOKEN"
```

**Respuesta:**
```json
{
  "success": true,
  "data": [
    {
      "art_cod": "LB005",
      "art_nom": "Labial Económico Rosa",
      "costo_propuesto": 33000,
      "precio_venta": 40000,
      "margen": 17.5,
      "estado": "VALIDADO_CON_ALERTAS",
      "observaciones": " | ALERTA: Margen muy bajo (<20%)"
    }
  ]
}
```

**Acción del usuario:** Revisar producto LB005, decidir si el margen 17.5% es aceptable o ajustar costo/precio.

---

#### Paso 6: Usuario Trabaja Segunda Categoría

- Abre el **mismo archivo Excel**
- Filtra por `categoria = "Sombras"`
- Completa costos para 40 sombras
- Guarda archivo

---

#### Paso 7: Segunda Importación (Incremental)

```bash
curl -X POST http://localhost:3000/api/carga-costos/importar \
  -H "x-access-token: YOUR_TOKEN" \
  -F "archivo=@carga_costos.xlsx"
```

**Respuesta:**
```json
{
  "success": true,
  "message": "Importación completada exitosamente",
  "data": {
    "total_filas": 250,
    "procesados": 70,
    "nuevos": 40,        // Sombras (nueva categoría)
    "actualizados": 30,  // Labiales (se actualizan automáticamente)
    "ignorados": 180
  }
}
```

**✅ NO genera error de duplicados**

---

#### Paso 8: Aplicar Costos Finales

Una vez que el usuario completó todas las categorías y revisó las alertas:

```bash
curl -X POST http://localhost:3000/api/carga-costos/aplicar \
  -H "x-access-token: YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"usu_cod": "maria.lopez"}'
```

**Respuesta:**
```json
{
  "success": true,
  "message": "Carga inicial aplicada exitosamente",
  "data": {
    "total_aplicados": 250,
    "errores": 0
  }
}
```

**Resultado en BD:**
- `articulosdetalle.art_bod_cos_cat` actualizado para 250 productos
- 250 registros creados en `historial_costos` tipo `CARGA_INICIAL`
- Sistema listo para Fase 1 (compras con costo promedio)

---

## Ejemplos de Peticiones

### Con cURL

**Exportar:**
```bash
curl -X GET "http://localhost:3000/api/carga-costos/exportar" \
  -H "x-access-token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -o carga_costos.xlsx
```

**Importar:**
```bash
curl -X POST "http://localhost:3000/api/carga-costos/importar" \
  -H "x-access-token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -F "archivo=@/Users/maria/Downloads/carga_costos.xlsx" \
  -F "usu_cod=maria.lopez"
```

**Resumen:**
```bash
curl -X GET "http://localhost:3000/api/carga-costos/resumen" \
  -H "x-access-token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Alertas:**
```bash
curl -X GET "http://localhost:3000/api/carga-costos/alertas" \
  -H "x-access-token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Aplicar:**
```bash
curl -X POST "http://localhost:3000/api/carga-costos/aplicar" \
  -H "x-access-token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{"usu_cod":"maria.lopez"}'
```

---

### Con JavaScript (Fetch API)

**Exportar:**
```javascript
const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';

fetch('http://localhost:3000/api/carga-costos/exportar', {
  method: 'GET',
  headers: {
    'x-access-token': token
  }
})
  .then(response => response.blob())
  .then(blob => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'carga_costos.xlsx';
    a.click();
  });
```

**Importar:**
```javascript
const fileInput = document.querySelector('input[type="file"]');
const formData = new FormData();
formData.append('archivo', fileInput.files[0]);
formData.append('usu_cod', 'maria.lopez');

fetch('http://localhost:3000/api/carga-costos/importar', {
  method: 'POST',
  headers: {
    'x-access-token': token
  },
  body: formData
})
  .then(response => response.json())
  .then(data => console.log(data));
```

---

## Códigos de Respuesta

| Código | Significado | Descripción |
|--------|-------------|-------------|
| `200` | OK | Operación exitosa |
| `400` | Bad Request | Datos inválidos o archivo incorrecto |
| `401` | Unauthorized | Token inválido o expirado |
| `404` | Not Found | Recurso no encontrado |
| `500` | Internal Server Error | Error del servidor |

---

## Notas Adicionales

### Seguridad

- Todos los endpoints requieren autenticación JWT
- Archivos Excel limitados a 10MB
- Solo se permiten formatos `.xlsx` y `.xls`
- Validación de tipos de datos en cada campo

### Rendimiento

- La importación procesa filas en transacción única
- Si falla alguna operación, se hace rollback completo
- La validación automática se ejecuta después de cada importación
- Exportación optimizada con queries indexadas

### Logs y Auditoría

- Cada importación registra usuario y fecha
- Historial completo de cambios de costo
- Observaciones guardadas por método de cálculo

---

**Documento creado por:** Claude Code
**Fecha:** 2026-02-09
**Versión:** 1.0
