# Implementación: Artículos Armados (Bundles)
**Fecha:** 2026-02-10
**Versión:** 1.0
**Estado:** Planificación

---

## 1. Resumen Ejecutivo

### Objetivo
Implementar funcionalidad de **artículos armados (bundles)** que permita crear productos compuestos por múltiples artículos del catálogo. Ejemplos: "Combo Amor y Amistad" compuesto por labial + máscara + rubor.

### Alcance
- Crear y gestionar bundles con componentes y cantidades específicas
- Sincronización con WooCommerce como producto simple con descripción de contenido
- Facturación mostrando bundle + componentes (precio $0 en componentes)
- Validación de stock de componentes antes de vender
- Afectación automática de inventario (kardex) de componentes al facturar bundle

### Beneficios
- **Comercial:** Facilita venta de combos y kits promocionales
- **Inventario:** Control preciso de stock por componente individual
- **Trazabilidad:** Kardex detallado de cada artículo que compone el bundle
- **Flexibilidad:** Edición libre de componentes sin restricciones

---

## 2. Análisis de Impacto

### 2.1 Base de Datos

#### Estructura Existente (✅ Ya existe)
```sql
CREATE TABLE [dbo].[articulosArmado] (
    [art_sec] VARCHAR(30) NOT NULL,      -- Bundle padre
    [ComArtSec] VARCHAR(30) NOT NULL,    -- Componente
    [ConKarUni] INT NOT NULL,             -- Cantidad del componente
    PRIMARY KEY CLUSTERED ([art_sec] ASC, [ComArtSec] ASC)
)
```

**Evaluación:** ✅ La tabla existe y es suficiente para la funcionalidad requerida.

#### Modificaciones Requeridas

**Tabla: `articulos`**
- Agregar campo `art_bundle CHAR(1) NULL DEFAULT 'N'` para marcar si es bundle
- Valores: `'S'` = es bundle, `'N'` = no es bundle

```sql
ALTER TABLE dbo.articulos
ADD art_bundle CHAR(1) NULL DEFAULT 'N';
GO

-- Actualizar registros existentes
UPDATE dbo.articulos
SET art_bundle = 'N'
WHERE art_bundle IS NULL;
GO
```

**Validación recomendada:**
```sql
ALTER TABLE dbo.articulos
ADD CONSTRAINT CK_articulos_art_bundle CHECK (art_bundle IN ('S', 'N'));
GO
```

### 2.2 Módulos Afectados

| Módulo | Impacto | Cambios Requeridos |
|--------|---------|-------------------|
| **models/articulosModel.js** | Alto | Agregar funciones CRUD para bundles y componentes |
| **controllers/bundleController.js** | Alto | Nuevo controller completo para gestión de bundles |
| **routes/bundleRoutes.js** | Alto | Nuevas rutas REST para bundles |
| **models/orderModel.js** | Crítico | Modificar lógica de creación de factura para expandir bundles |
| **jobs/syncWooOrders.js** | Medio | Manejar bundles en sincronización de órdenes WooCommerce |
| **Validaciones stock** | Alto | Verificar stock de componentes antes de facturar |
| **Sincronización WooCommerce** | Medio | Generar descripción con lista de componentes |

---

## 3. Diseño de Solución

### 3.1 Modelo de Datos

#### Relaciones
```
articulos (bundle)
    └─ articulosArmado (1:N)
           └─ articulos (componente)
```

#### Restricciones de Negocio
1. ✅ Un bundle SOLO puede contener productos simples o variables (NO otros bundles)
2. ✅ Un bundle tiene precio independiente (manual, no calculado)
3. ✅ Bundle tiene stock propio (físico, pre-ensamblado)
4. ✅ Al facturar, validar stock de componentes
5. ✅ Los componentes se pueden editar libremente

### 3.2 Flujo de Facturación de Bundle

```
1. Cliente compra 2x "Combo Amor Amistad" ($50.000 c/u)

2. Sistema valida:
   - Stock del bundle: 2 unidades ✓
   - Stock componentes:
     * Labial Rojo: necesita 2×1=2, tiene 10 ✓
     * Máscara Negra: necesita 2×1=2, tiene 5 ✓
     * Rubor Rosa: necesita 2×1=2, tiene 8 ✓

3. Factura generada (tabla: factura + facturakardes):

   ┌─────────────────────────────────────────────────────┐
   │ FACTURA FAC-12345                                   │
   ├─────────────────────────────────────────────────────┤
   │ 2x Combo Amor Amistad        $50.000   $100.000    │
   │   ├─ 2x Labial Rojo           $0         $0        │
   │   ├─ 2x Máscara Negra         $0         $0        │
   │   └─ 2x Rubor Rosa            $0         $0        │
   │                                                     │
   │ TOTAL:                                  $100.000    │
   └─────────────────────────────────────────────────────┘

4. Registros en facturakardes (kardex):
   - Bundle: 2 unidades salida (kar_nat = '-')
   - Labial: 2 unidades salida (kar_nat = '-')
   - Máscara: 2 unidades salida (kar_nat = '-')
   - Rubor: 2 unidades salida (kar_nat = '-')

5. Actualización de existencias (vwExistencias):
   - Combo Amor Amistad: 5 → 3
   - Labial Rojo: 10 → 8
   - Máscara Negra: 5 → 3
   - Rubor Rosa: 8 → 6
```

### 3.3 Identificación Visual de Componentes

Para que el cliente identifique los items del bundle en la factura, agregar campo adicional en `facturakardes`:

```sql
ALTER TABLE dbo.facturakardes
ADD kar_bundle_padre VARCHAR(30) NULL;
GO

-- FK opcional (recomendada)
ALTER TABLE dbo.facturakardes
ADD CONSTRAINT FK_facturakardes_bundle_padre
    FOREIGN KEY (kar_bundle_padre)
    REFERENCES dbo.articulos(art_sec);
GO
```

**Lógica:**
- Si `kar_bundle_padre IS NULL` → es artículo normal
- Si `kar_bundle_padre = 'ART001'` → es componente del bundle ART001

---

## 4. Especificación Técnica

### 4.1 API Endpoints

#### 4.1.1 Gestión de Bundles

**POST /api/bundles**
```json
{
  "art_nom": "Combo Amor y Amistad",
  "art_cod": "COMBO-AMOR-2024",
  "categoria": "1",
  "subcategoria": 5,
  "precio_detal": 50000,
  "precio_mayor": 45000,
  "componentes": [
    { "art_sec": "ART001", "cantidad": 1 },
    { "art_sec": "ART002", "cantidad": 1 },
    { "art_sec": "ART003", "cantidad": 1 }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Bundle creado exitosamente",
  "data": {
    "art_sec": "ART100",
    "art_cod": "COMBO-AMOR-2024",
    "art_bundle": "S",
    "componentes_count": 3,
    "art_woo_id": 12345
  }
}
```

---

**GET /api/bundles/:art_sec/componentes**

Response:
```json
{
  "success": true,
  "data": {
    "bundle": {
      "art_sec": "ART100",
      "art_cod": "COMBO-AMOR-2024",
      "art_nom": "Combo Amor y Amistad",
      "precio_detal": 50000
    },
    "componentes": [
      {
        "art_sec": "ART001",
        "art_cod": "LABIAL-ROJO",
        "art_nom": "Labial Rojo Pasión",
        "cantidad": 1,
        "precio_unitario": 18000,
        "stock_disponible": 10
      },
      {
        "art_sec": "ART002",
        "art_cod": "MASCARA-NEG",
        "art_nom": "Máscara de Pestañas Negra",
        "cantidad": 1,
        "precio_unitario": 22000,
        "stock_disponible": 5
      }
    ],
    "total_componentes": 2
  }
}
```

---

**PUT /api/bundles/:art_sec/componentes**

Actualizar componentes del bundle:
```json
{
  "componentes": [
    { "art_sec": "ART001", "cantidad": 2 },
    { "art_sec": "ART004", "cantidad": 1 }
  ]
}
```

---

**DELETE /api/bundles/:art_sec/componentes/:componente_art_sec**

Eliminar componente específico del bundle.

---

**POST /api/bundles/:art_sec/validar-stock**

Validar si hay stock suficiente para vender cantidad específica:
```json
{
  "cantidad_bundle": 5
}
```

Response:
```json
{
  "success": true,
  "puede_vender": false,
  "detalles": [
    {
      "art_sec": "ART001",
      "art_nom": "Labial Rojo Pasión",
      "cantidad_necesaria": 5,
      "stock_disponible": 10,
      "cumple": true
    },
    {
      "art_sec": "ART002",
      "art_nom": "Máscara Negra",
      "cantidad_necesaria": 5,
      "stock_disponible": 3,
      "cumple": false,
      "faltante": 2
    }
  ]
}
```

---

#### 4.1.2 Modificación Endpoints Existentes

**POST /api/order (createOrder)**
- Detectar bundles en items de la orden
- Expandir componentes en kardex
- Validar stock de componentes
- Registrar `kar_bundle_padre` en componentes

**GET /api/articulos/:art_sec**
- Incluir campos `art_bundle`, `componentes_count`
- Si es bundle, opcionalmente incluir lista de componentes

---

### 4.2 Funciones del Modelo

**models/bundleModel.js** (nuevo)

```javascript
// Crear bundle
const createBundle = async ({
  art_nom, art_cod, categoria, subcategoria,
  precio_detal, precio_mayor, componentes, images
}) => { ... }

// Obtener componentes de un bundle
const getBundleComponents = async (art_sec) => { ... }

// Actualizar componentes
const updateBundleComponents = async (art_sec, componentes) => { ... }

// Eliminar componente
const removeBundleComponent = async (art_sec, componente_art_sec) => { ... }

// Validar stock de componentes
const validateBundleStock = async (art_sec, cantidad_bundle) => { ... }

// Expandir bundle en componentes (para facturación)
const expandBundleToComponents = async (art_sec, cantidad) => { ... }
```

---

**models/orderModel.js** (modificaciones)

Modificar `createOrder()` para:

```javascript
// Dentro del loop de items de la orden
for (const item of items) {
  const articulo = await getArticulo(item.art_sec);

  // Verificar si es bundle
  if (articulo.art_bundle === 'S') {
    // 1. Insertar línea del bundle con precio normal
    await insertKardexItem({
      fac_nro,
      art_sec: item.art_sec,
      cantidad: item.cantidad,
      precio: articulo.precio_venta,
      kar_bundle_padre: null  // Es el padre
    });

    // 2. Expandir y agregar componentes con precio 0
    const componentes = await getBundleComponents(item.art_sec);
    for (const comp of componentes) {
      await insertKardexItem({
        fac_nro,
        art_sec: comp.art_sec,
        cantidad: item.cantidad * comp.cantidad,
        precio: 0,  // Precio $0 para no sumar al total
        kar_bundle_padre: item.art_sec  // Referencia al bundle padre
      });
    }
  } else {
    // Artículo normal
    await insertKardexItem({
      fac_nro,
      art_sec: item.art_sec,
      cantidad: item.cantidad,
      precio: articulo.precio_venta,
      kar_bundle_padre: null
    });
  }
}
```

---

### 4.3 Sincronización WooCommerce

**Creación de Bundle en WooCommerce:**

```javascript
const wooData = {
  name: art_nom,
  type: 'simple',  // No 'bundle' - WooCommerce no tiene tipo bundle nativo
  sku: art_cod,
  regular_price: precio_detal.toString(),
  description: generarDescripcionBundle(componentes),
  short_description: `Incluye: ${componentes.map(c => c.art_nom).join(', ')}`,
  meta_data: [
    { key: "_precio_mayorista", value: precio_mayor.toString() },
    { key: "_es_bundle", value: "S" },
    { key: "_bundle_componentes_count", value: componentes.length.toString() }
  ],
  categories: [...],
  images: [...]
};
```

**Función `generarDescripcionBundle()`:**
```javascript
function generarDescripcionBundle(componentes) {
  let desc = '<h3>Este combo incluye:</h3><ul>';
  for (const comp of componentes) {
    desc += `<li><strong>${comp.cantidad}x</strong> ${comp.art_nom}</li>`;
  }
  desc += '</ul>';
  return desc;
}
```

**Resultado en WooCommerce:**
```
Combo Amor y Amistad - $50.000

Este combo incluye:
• 1x Labial Rojo Pasión
• 1x Máscara de Pestañas Negra
• 1x Rubor Rosa Suave
```

---

### 4.4 Validaciones

#### Pre-Facturación
```javascript
async function validarStockAntesDeFact urar(items) {
  for (const item of items) {
    const articulo = await getArticulo(item.art_sec);

    // Validar stock del bundle mismo
    if (articulo.existencia < item.cantidad) {
      throw new Error(`Stock insuficiente del bundle ${articulo.art_nom}`);
    }

    // Si es bundle, validar componentes
    if (articulo.art_bundle === 'S') {
      const validacion = await validateBundleStock(item.art_sec, item.cantidad);
      if (!validacion.puede_vender) {
        const faltantes = validacion.detalles
          .filter(d => !d.cumple)
          .map(d => `${d.art_nom} (faltan ${d.faltante})`)
          .join(', ');
        throw new Error(
          `Componentes insuficientes para el bundle: ${faltantes}`
        );
      }
    }
  }
}
```

#### Restricciones
1. **No bundles anidados:**
```javascript
async function validarComponente(componente_art_sec) {
  const articulo = await getArticulo(componente_art_sec);
  if (articulo.art_bundle === 'S') {
    throw new Error('No se pueden agregar bundles como componentes de otro bundle');
  }
}
```

2. **No duplicados:**
```javascript
// Al agregar componente, verificar que no exista ya
const existe = await pool.request()
  .input('art_sec', sql.VarChar(30), bundle_art_sec)
  .input('comp_art_sec', sql.VarChar(30), componente_art_sec)
  .query(`
    SELECT COUNT(*) as count
    FROM articulosArmado
    WHERE art_sec = @art_sec AND ComArtSec = @comp_art_sec
  `);

if (existe.recordset[0].count > 0) {
  throw new Error('Este componente ya existe en el bundle');
}
```

---

## 5. Plan de Implementación

### Fase 0: Preparación Base de Datos (1 día)
- [ ] Script SQL: Agregar campo `art_bundle` a tabla `articulos`
- [ ] Script SQL: Agregar campo `kar_bundle_padre` a tabla `facturakardes`
- [ ] Script SQL: Agregar constraints y validaciones
- [ ] Ejecutar scripts en BD desarrollo y producción
- [ ] Verificar integridad de datos

### Fase 1: Modelo y Utilidades (2 días)
- [ ] Crear `models/bundleModel.js`:
  - `createBundle()`
  - `getBundleComponents()`
  - `updateBundleComponents()`
  - `removeBundleComponent()`
  - `validateBundleStock()`
  - `expandBundleToComponents()`
- [ ] Crear `utils/bundleUtils.js`:
  - `generarDescripcionBundle()`
  - `validarComponenteNoEsBundle()`
  - `calcularStockDisponibleBundle()`
- [ ] Pruebas unitarias de funciones

### Fase 2: API Endpoints (2 días)
- [ ] Crear `controllers/bundleController.js`
- [ ] Crear `routes/bundleRoutes.js`
- [ ] Registrar rutas en `index.js`
- [ ] Endpoints:
  - POST /api/bundles
  - GET /api/bundles/:art_sec/componentes
  - PUT /api/bundles/:art_sec/componentes
  - DELETE /api/bundles/:art_sec/componentes/:comp_art_sec
  - POST /api/bundles/:art_sec/validar-stock
- [ ] Pruebas con Postman

### Fase 3: Integración Facturación (3 días)
- [ ] Modificar `models/orderModel.js`:
  - Detectar bundles en `createOrder()`
  - Expandir componentes en kardex
  - Registrar `kar_bundle_padre`
  - Validar stock de componentes pre-facturación
- [ ] Modificar `controllers/orderController.js`:
  - Agregar validaciones de stock
  - Mensajes de error descriptivos
- [ ] Pruebas de facturación:
  - Factura solo con bundles
  - Factura mixta (bundles + artículos normales)
  - Validación de stock insuficiente
  - Verificación de kardex

### Fase 4: Sincronización WooCommerce (2 días)
- [ ] Modificar `models/articulosModel.js`:
  - `createArticulo()` → detectar bundles y generar descripción
  - `updateArticulo()` → actualizar descripción si cambian componentes
- [ ] Modificar `jobs/syncWooOrders.js`:
  - Manejar bundles en sincronización de órdenes desde WooCommerce
- [ ] Pruebas de sincronización:
  - Crear bundle local → verificar en WooCommerce
  - Actualizar componentes → verificar descripción actualizada
  - Orden WooCommerce con bundle → verificar expansión en kardex local

### Fase 5: Endpoints de Consulta (1 día)
- [ ] Modificar `GET /api/articulos/:art_sec`:
  - Incluir `art_bundle`, `componentes_count`
  - Opción para incluir componentes
- [ ] Crear `GET /api/bundles`:
  - Listar todos los bundles con paginación
- [ ] Documentación de API

### Fase 6: Testing y Documentación (2 días)
- [ ] Pruebas de integración end-to-end
- [ ] Pruebas de regresión (funcionalidad existente no afectada)
- [ ] Documentación técnica
- [ ] Postman collection actualizada
- [ ] Video/tutorial de uso para equipo

**Total estimado: 13 días hábiles**

---

## 6. Casos de Prueba

### 6.1 Creación de Bundle

| # | Escenario | Input | Output Esperado |
|---|-----------|-------|-----------------|
| 1 | Crear bundle válido | 3 componentes simples | Bundle creado, sincronizado en WooCommerce |
| 2 | Componente es bundle | Componente art_bundle='S' | Error: no se permiten bundles anidados |
| 3 | Componente duplicado | Agregar mismo art_sec 2 veces | Error: componente duplicado |
| 4 | Sin componentes | Array vacío | Error: bundle requiere al menos 1 componente |

### 6.2 Facturación de Bundle

| # | Escenario | Stock Bundle | Stock Componentes | Resultado |
|---|-----------|--------------|-------------------|-----------|
| 1 | Stock suficiente | 5 | Todos >10 | Factura OK, kardex con bundle + componentes |
| 2 | Bundle sin stock | 0 | Todos >10 | Error: stock insuficiente del bundle |
| 3 | Componente sin stock | 5 | Uno tiene 0 | Error: componente X sin stock |
| 4 | Stock justo | 2 | Exactos para 2 | Factura OK, existencias = 0 |

### 6.3 Sincronización WooCommerce

| # | Escenario | Acción | Verificación WooCommerce |
|---|-----------|--------|--------------------------|
| 1 | Crear bundle local | POST /api/bundles | Producto simple con descripción HTML de componentes |
| 2 | Actualizar componentes | PUT /api/bundles/.../componentes | Descripción actualizada en WooCommerce |
| 3 | Orden WooCommerce con bundle | Compra desde tienda | Factura local con bundle + componentes en kardex |

---

## 7. Riesgos y Mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Desincronización stock componentes | Media | Alto | Validación estricta pre-factura, transacciones SQL |
| Rendimiento en facturas con múltiples bundles | Media | Medio | Optimizar queries, usar transacciones eficientes |
| Confusión usuario con items precio $0 | Baja | Bajo | UI clara con indicador visual "Componente de bundle X" |
| WooCommerce no refleja bien contenido | Baja | Medio | Descripción HTML formateada, meta_data adicional |

---

## 8. Métricas de Éxito

- ✅ Crear bundle con 5 componentes en <3 segundos
- ✅ Facturar 10 bundles en orden mixta en <5 segundos
- ✅ Sincronización WooCommerce sin errores
- ✅ 0 errores de stock insuficiente no detectados
- ✅ Kardex 100% consistente con movimientos reales

---

## 9. Anexos

### A. Queries SQL Útiles

**Listar todos los bundles:**
```sql
SELECT
  a.art_sec,
  a.art_cod,
  a.art_nom,
  COUNT(aa.ComArtSec) as componentes_count
FROM dbo.articulos a
LEFT JOIN dbo.articulosArmado aa ON aa.art_sec = a.art_sec
WHERE a.art_bundle = 'S'
GROUP BY a.art_sec, a.art_cod, a.art_nom;
```

**Ver componentes de un bundle:**
```sql
SELECT
  aa.art_sec as bundle_art_sec,
  b.art_nom as bundle_nombre,
  aa.ComArtSec as componente_art_sec,
  c.art_cod as componente_codigo,
  c.art_nom as componente_nombre,
  aa.ConKarUni as cantidad,
  ve.existencia as stock_disponible
FROM dbo.articulosArmado aa
INNER JOIN dbo.articulos b ON b.art_sec = aa.art_sec
INNER JOIN dbo.articulos c ON c.art_sec = aa.ComArtSec
LEFT JOIN dbo.vwExistencias ve ON ve.art_sec = c.art_sec
WHERE aa.art_sec = 'ART100';
```

**Kardex de factura con bundles:**
```sql
SELECT
  fk.fac_nro,
  fk.kar_sec_item,
  a.art_cod,
  a.art_nom,
  fk.kar_can,
  fk.kar_vuni,
  fk.kar_vuni * fk.kar_can as total_linea,
  CASE
    WHEN fk.kar_bundle_padre IS NULL THEN 'Bundle Padre'
    ELSE 'Componente de ' + bp.art_cod
  END as tipo,
  fk.kar_bundle_padre
FROM dbo.facturakardes fk
INNER JOIN dbo.articulos a ON a.art_sec = fk.art_sec
LEFT JOIN dbo.articulos bp ON bp.art_sec = fk.kar_bundle_padre
WHERE fk.fac_nro = 'FAC12345'
ORDER BY fk.kar_sec_item;
```

### B. Ejemplo JSON Completo Postman

Ver archivo: `API_Bundles.postman_collection.json`

---

## 10. Aprobaciones

| Rol | Nombre | Fecha | Firma |
|-----|--------|-------|-------|
| Product Owner | | | |
| Tech Lead | | | |
| QA Lead | | | |

---

**Notas:**
- Este documento es dinámico y se actualizará durante la implementación
- Cualquier cambio significativo requiere aprobación del Product Owner
- Versionar cambios en el historial de Git
