# Análisis de Compatibilidad: Bundles vs Sistema Actual

**Fecha:** 2026-02-10
**Estado:** ⚠️ REQUIERE CORRECCIONES CRÍTICAS

---

## ❌ Problemas Críticos Encontrados

### 1. Campo `kar_bundle_padre` NO EXISTE

**Documento original dice:**
```sql
ALTER TABLE dbo.facturakardes
ADD kar_bundle_padre VARCHAR(30) NULL;
```

**Realidad:**
- La tabla `facturakardes` tiene una estructura MUY específica
- Agregar campos nuevos puede romper código existente que hace INSERT sin especificar columnas
- El sistema usa campos promocionales extensivos ya

**Solución Correcta:**
Usar el campo `kar_fac_sec_ori` existente de forma inteligente, O agregar el campo CON DEFAULT para no romper INSERTs existentes.

---

### 2. Estructura de Kardex Incorrecta en Doc

**Documento dice:**
```sql
INSERT INTO facturakardes (
  fac_nro, kar_sec_item, art_sec, kar_can, kar_vuni, ...
)
```

**Realidad (`orderModel.js` líneas 768-776):**
```sql
INSERT INTO dbo.facturakardes (
  fac_sec,              -- DECIMAL(18,0) NOT VARCHAR!
  kar_sec,              -- INT (secuencia MAX+1 por fac_sec)
  art_sec,              -- VARCHAR(30)
  kar_bod_sec,          -- VARCHAR(1) siempre '1'
  kar_uni,              -- DECIMAL(17,2) NOT kar_can!
  kar_nat,              -- VARCHAR(1) '+' o '-'
  kar_pre_pub,          -- DECIMAL(17,2) NOT kar_vuni!
  kar_total,            -- DECIMAL(17,2) = kar_uni * kar_pre_pub * (1-descuento%)
  kar_lis_pre_cod,      -- INT (1=detal, 2=mayor)
  kar_des_uno,          -- DECIMAL(11,5) descuento línea
  kar_kar_sec_ori,      -- INT (línea original si es devolución)
  kar_fac_sec_ori,      -- INT (factura original si es devolución)
  -- CAMPOS PROMOCIONALES (7 campos adicionales)
  kar_pre_pub_detal,
  kar_pre_pub_mayor,
  kar_tiene_oferta,
  kar_precio_oferta,
  kar_descuento_porcentaje,
  kar_codigo_promocion,
  kar_descripcion_promocion
)
```

**kar_sec se genera así (líneas 613-621):**
```javascript
const karSecQuery = `
  SELECT ISNULL(MAX(kar_sec), 0) + 1 AS NewKarSec
  FROM dbo.facturakardes
  WHERE fac_sec = @fac_sec
`;
```

---

### 3. WooCommerce Type Incorrecto

**Documento dice:**
```javascript
type: 'bundle'  // ❌ NO EXISTE
```

**Realidad:**
WooCommerce solo soporta:
- `'simple'`
- `'grouped'` ← Este es para bundles pero los productos se compran individualmente
- `'variable'`
- `'variation'`

**Solución Correcta:**
```javascript
// Opción A: Producto simple con descripción de contenido
type: 'simple',
description: '<h3>Incluye:</h3><ul><li>1x Labial...</li></ul>',
meta_data: [
  { key: '_es_bundle', value: 'S' },
  { key: '_precio_mayorista', value: precio_mayor }
]

// Opción B: NO recomendada - grouped products
type: 'grouped',
grouped_products: [woo_id_comp1, woo_id_comp2]
// Problema: Se compran separado, no como paquete
```

---

### 4. Pricing Logic Incompleta

**Documento ignora:**
- Sistema de promociones existente (7 campos kar_*)
- Lógica de cálculo dual: viene de WooCommerce O se calcula local
- `lis_pre_cod` para determinar precio base

**Debe seguir patrón `orderModel.js` líneas 623-738:**

```javascript
// 1. Verificar si tiene_campos_promocion en el detalle
const tieneCamposPromocion =
  detalle.kar_pre_pub_detal !== undefined &&
  detalle.kar_pre_pub_mayor !== undefined &&
  detalle.kar_tiene_oferta !== undefined &&
  detalle.kar_pre_pub_detal !== null &&
  detalle.kar_pre_pub_mayor !== null;

if (tieneCamposPromocion) {
  // Path 1: Usar valores que vienen (de WooCommerce)
  precioInfo = {
    precio_detal: detalle.kar_pre_pub_detal,
    precio_mayor: detalle.kar_pre_pub_mayor,
    precio_oferta: detalle.kar_precio_oferta,
    // ... etc
  };
} else {
  // Path 2: Query desde BD
  const precioQuery = `
    SELECT
      ISNULL(ad1.art_bod_pre, 0) AS precio_detal,
      ISNULL(ad2.art_bod_pre, 0) AS precio_mayor,
      pd.pro_det_precio_oferta,
      pd.pro_det_descuento_porcentaje,
      p.pro_codigo,
      p.pro_descripcion,
      CASE WHEN p.pro_codigo IS NOT NULL ... THEN 'S' ELSE 'N' END AS tiene_oferta
    FROM articulos a
    LEFT JOIN articulosdetalle ad1 ON ... lis_pre_cod=1
    LEFT JOIN articulosdetalle ad2 ON ... lis_pre_cod=2
    LEFT JOIN promociones_detalle pd ON ...
    LEFT JOIN promociones p ON ...
    WHERE a.art_sec = @art_sec
  `;
}
```

---

### 5. Transaction Pattern Incorrecto

**Documento usa:**
```javascript
const transaction = new sql.Transaction(pool);
await transaction.begin();
const request = pool.request();  // ❌ INCORRECTO
```

**Debe ser (`orderModel.js` línea 741):**
```javascript
const transaction = new sql.Transaction(pool);
await transaction.begin();
const request = new sql.Request(transaction);  // ✓ CORRECTO
```

**Cada query nueva necesita nuevo Request:**
```javascript
// Para cada operación dentro de la transacción
const insertRequest = new sql.Request(transaction);
await insertRequest
  .input('param1', sql.VarChar(30), value1)
  .query('INSERT INTO ...');

// Otra operación
const updateRequest = new sql.Request(transaction);
await updateRequest
  .input('param2', sql.Int, value2)
  .query('UPDATE ...');
```

---

### 6. Módulo orderModel.js usa ES Modules

**Documento asume CommonJS:**
```javascript
const orderModel = require('./models/orderModel');  // ❌
```

**Realidad (`orderModel.js` línea 1-11):**
```javascript
import { sql, poolPromise } from '../db.js';  // ES Modules
export const createCompleteOrder = async (...) => { ... }
export const updateOrder = async (...) => { ... }
```

**Solución:**
Todo código que interactúe con orderModel DEBE usar:
```javascript
import { createCompleteOrder, updateOrder } from './models/orderModel.js';
```

---

### 7. Campo `kar_sec_item` No Existe

**Documento usa:**
```sql
SELECT fk.kar_sec_item FROM facturakardes fk  -- ❌ NO EXISTE
```

**Nombre correcto:**
```sql
SELECT fk.kar_sec FROM dbo.facturakardes fk  -- ✓ CORRECTO
```

---

## ✅ Lo Que SÍ Está Correcto en el Doc

1. ✓ Tabla `articulosArmado` ya existe con estructura correcta
2. ✓ Concepto de validar stock de componentes
3. ✓ Precio independiente del bundle (no suma de componentes)
4. ✓ Stock físico del bundle
5. ✓ Componentes con precio $0 en factura

---

## 🔧 Cambios Requeridos al Documento

### Cambio 1: Migración SQL Segura

```sql
-- CORRECTO: Agregar kar_bundle_padre CON DEFAULT
ALTER TABLE dbo.facturakardes
ADD kar_bundle_padre VARCHAR(30) NULL DEFAULT NULL;

-- Agregar índice
CREATE NONCLUSTERED INDEX IX_facturakardes_bundle_padre
ON dbo.facturakardes (kar_bundle_padre)
WHERE kar_bundle_padre IS NOT NULL;

-- CRITICAL: Verificar que INSERTs existentes no se rompan
-- El DEFAULT NULL permite que código existente que no especifica
-- la columna kar_bundle_padre siga funcionando
```

### Cambio 2: Flujo de Facturación Correcto

```javascript
// DENTRO DE createCompleteOrder() en orderModel.js
// Agregar lógica ANTES del loop de detalles (línea 611)

// 1. Pre-procesar items para expandir bundles
const detallesExpandidos = [];
for (const detalle of detalles) {
  // Verificar si es bundle
  const articuloCheck = await pool.request()
    .input('art_sec', sql.VarChar(30), detalle.art_sec)
    .query('SELECT art_bundle FROM dbo.articulos WHERE art_sec = @art_sec');

  const esBundle = articuloCheck.recordset[0]?.art_bundle === 'S';

  if (esBundle) {
    // Agregar línea del bundle
    detallesExpandidos.push({
      ...detalle,
      es_bundle_padre: true,
      kar_bundle_padre: null
    });

    // Obtener componentes
    const componentes = await pool.request()
      .input('bundle_art_sec', sql.VarChar(30), detalle.art_sec)
      .query(`
        SELECT ComArtSec, ConKarUni
        FROM dbo.articulosArmado
        WHERE art_sec = @bundle_art_sec
      `);

    // Agregar líneas de componentes
    for (const comp of componentes.recordset) {
      detallesExpandidos.push({
        art_sec: comp.ComArtSec,
        kar_uni: detalle.kar_uni * comp.ConKarUni,
        kar_pre_pub: 0,  // Precio $0
        kar_nat: detalle.kar_nat,
        kar_bundle_padre: detalle.art_sec,  // Referencia al bundle
        // Campos promocionales en NULL o heredados
        kar_pre_pub_detal: 0,
        kar_pre_pub_mayor: 0,
        kar_tiene_oferta: 'N',
        kar_precio_oferta: null,
        kar_descuento_porcentaje: null,
        kar_codigo_promocion: null,
        kar_descripcion_promocion: null
      });
    }
  } else {
    // Artículo normal
    detallesExpandidos.push({
      ...detalle,
      kar_bundle_padre: null
    });
  }
}

// 2. Ahora procesar detallesExpandidos con el loop existente
for (const detalle of detallesExpandidos) {
  // Código existente de líneas 611-793
  // AGREGANDO kar_bundle_padre al INSERT
}
```

### Cambio 3: WooCommerce Sync Correcto

```javascript
// En createBundle() o al sincronizar bundle a WooCommerce
const wooData = {
  name: art_nom,
  type: 'simple',  // NO 'bundle'
  sku: art_cod,
  regular_price: precio_detal.toString(),
  description: generarDescripcionBundleHTML(componentes),
  short_description: `Combo incluye: ${componentes.map(c => c.cantidad + 'x ' + c.art_nom).join(', ')}`,
  manage_stock: true,
  stock_quantity: stock_bundle,
  meta_data: [
    { key: "_precio_mayorista", value: precio_mayor.toString() },
    { key: "_es_bundle", value: "S" },
    { key: "_bundle_componentes_json", value: JSON.stringify(componentes) }
  ],
  categories: [...],
  images: [...]
};

function generarDescripcionBundleHTML(componentes) {
  let html = '<div class="bundle-contents">';
  html += '<h3>Este combo incluye:</h3>';
  html += '<ul class="bundle-list">';
  for (const comp of componentes) {
    html += `<li><strong>${comp.cantidad}x</strong> ${comp.art_nom}`;
    if (comp.art_cod) html += ` (${comp.art_cod})`;
    html += '</li>';
  }
  html += '</ul></div>';
  return html;
}
```

### Cambio 4: Validación de Stock Correcta

```javascript
// ANTES de crear la orden (en controller o antes del transaction.begin())
async function validarStockBundle(art_sec_bundle, cantidad_solicitada) {
  const pool = await poolPromise;

  // 1. Validar stock del bundle mismo
  const stockBundle = await pool.request()
    .input('art_sec', sql.VarChar(30), art_sec_bundle)
    .query(`
      SELECT ISNULL(existencia, 0) as stock
      FROM dbo.vwExistencias
      WHERE art_sec = @art_sec
    `);

  if (stockBundle.recordset[0].stock < cantidad_solicitada) {
    throw new Error(`Stock insuficiente del bundle. Disponible: ${stockBundle.recordset[0].stock}, Solicitado: ${cantidad_solicitada}`);
  }

  // 2. Validar stock de CADA componente
  const componentes = await pool.request()
    .input('bundle_art_sec', sql.VarChar(30), art_sec_bundle)
    .query(`
      SELECT
        aa.ComArtSec,
        aa.ConKarUni,
        a.art_cod,
        a.art_nom,
        ISNULL(ve.existencia, 0) as stock_actual
      FROM dbo.articulosArmado aa
      INNER JOIN dbo.articulos a ON a.art_sec = aa.ComArtSec
      LEFT JOIN dbo.vwExistencias ve ON ve.art_sec = aa.ComArtSec
      WHERE aa.art_sec = @bundle_art_sec
    `);

  const faltantes = [];
  for (const comp of componentes.recordset) {
    const necesario = comp.ConKarUni * cantidad_solicitada;
    if (comp.stock_actual < necesario) {
      faltantes.push({
        art_cod: comp.art_cod,
        art_nom: comp.art_nom,
        necesita: necesario,
        tiene: comp.stock_actual,
        falta: necesario - comp.stock_actual
      });
    }
  }

  if (faltantes.length > 0) {
    const detalleError = faltantes.map(f =>
      `${f.art_nom} (${f.art_cod}): necesita ${f.necesita}, tiene ${f.tiene}, faltan ${f.falta}`
    ).join('; ');
    throw new Error(`Stock insuficiente de componentes: ${detalleError}`);
  }

  return { valido: true, mensaje: 'Stock suficiente' };
}
```

---

## 📋 Checklist de Correcciones Requeridas

### Documento SQL
- [ ] Cambiar `kar_bundle_padre` a tener `DEFAULT NULL`
- [ ] Agregar nota sobre compatibilidad con INSERTs existentes
- [ ] Verificar nombres de campos (kar_sec NO kar_sec_item)

### Documento Implementación
- [ ] Corregir estructura de INSERT a facturakardes
- [ ] Incluir TODOS los campos promocionales (7 campos kar_*)
- [ ] Cambiar WooCommerce type de 'bundle' a 'simple'
- [ ] Corregir patrón de transaction: `new sql.Request(transaction)`
- [ ] Documentar lógica de precios dual (WooCommerce vs local)
- [ ] Agregar nota sobre ES Modules en orderModel.js
- [ ] Cambiar kar_sec_item a kar_sec en queries
- [ ] Documentar cálculo de kar_sec (MAX+1 por fac_sec)

### Flujo de Facturación
- [ ] Pre-expandir bundles ANTES del loop
- [ ] Validar stock de componentes ANTES de transaction.begin()
- [ ] Insertar bundle padre con kar_bundle_padre=NULL
- [ ] Insertar componentes con kar_bundle_padre=art_sec_bundle
- [ ] Usar kar_pre_pub=0 para componentes
- [ ] Mantener estructura de campos promocionales

### WooCommerce
- [ ] Usar `type: 'simple'` no 'bundle'
- [ ] Generar descripción HTML con componentes
- [ ] Agregar meta_data `_es_bundle` y `_bundle_componentes_json`
- [ ] Mantener compatibilidad con `_precio_mayorista`

---

## ⚠️ ADVERTENCIAS CRÍTICAS

1. **NO modificar orderModel.js directamente** - Es ES Modules y muy crítico
2. **Validar stock ANTES de transaction** - No dentro, para evitar bloqueos largos
3. **Expansion de bundles ANTES del loop** - No cambiar estructura del loop existente
4. **Mantener campos promocionales** - Sistema depende de ellos para reportes
5. **Usar sql.VarChar(30) para art_sec** - NO Decimal, NO Int
6. **Respetar patrón de kar_sec** - Siempre MAX+1 por fac_sec

---

## 🎯 Estrategia de Implementación Segura

1. **Fase 0:** SQL migration con DEFAULT NULL ✓
2. **Fase 1:** Crear bundleModel.js (CommonJS) con funciones auxiliares
3. **Fase 2:** Modificar orderController.js para validar bundles PRE-transaction
4. **Fase 3:** Modificar orderModel.js mínimamente (solo pre-expansión)
5. **Fase 4:** Testing extensivo con órdenes mixtas
6. **Fase 5:** WooCommerce sync
7. **Fase 6:** Rollback plan y monitoring

---

**CONCLUSIÓN:** El documento original tiene buenas ideas pero necesita correcciones técnicas críticas para NO romper el sistema actual. La implementación debe ser MUCHO más cuidadosa de lo documentado.
