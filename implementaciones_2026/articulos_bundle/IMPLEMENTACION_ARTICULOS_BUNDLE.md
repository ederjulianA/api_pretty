# Implementación: Artículos Armados (Bundles)
**Fecha:** 2026-02-10
**Versión:** 1.0 (Documentación corregida)
**Estado:** Listo para revisión

---

## ⚠️ CORRECCIONES APLICADAS

Esta documentación corrige **7 problemas críticos** encontrados tras el análisis de compatibilidad:

1. ✅ Estructura real de `facturakardes` (fac_sec DECIMAL, kar_sec INT, kar_uni no kar_can)
2. ✅ WooCommerce type correcto (`'simple'` no `'bundle'`)
3. ✅ Patrón de transaction correcto (`new sql.Request(transaction)`)
4. ✅ Campos promocionales completos (7 campos kar_*)
5. ✅ ES Modules en orderModel.js
6. ✅ Validación de stock PRE-transaction
7. ✅ DEFAULT NULL en kar_bundle_padre para compatibilidad

---

## 1. Resumen Ejecutivo

### Objetivo
Implementar funcionalidad de **artículos armados (bundles)** SIN ROMPER funcionalidad existente de productos simples, variables y facturación.

### Ejemplo
```
Bundle: "Combo Amor y Amistad" ($50.000)
  ├─ 1x Labial Rojo Pasión
  ├─ 1x Máscara de Pestañas Negra
  └─ 1x Rubor Rosa Suave
```

### Características Confirmadas
- ✅ Precio independiente (manual, no calculado)
- ✅ Stock físico propio (pre-ensamblado)
- ✅ Validación de stock de componentes antes de vender
- ✅ Factura muestra bundle + componentes (precio $0)
- ✅ WooCommerce: producto simple con descripción HTML
- ✅ Edición libre de componentes
- ❌ NO bundles anidados

---

## 2. Base de Datos

### 2.1 Tabla Existente (✅ YA EXISTE - NO CREAR)

```sql
CREATE TABLE [dbo].[articulosArmado] (
    [art_sec] VARCHAR(30) NOT NULL,      -- Bundle padre
    [ComArtSec] VARCHAR(30) NOT NULL,    -- Componente
    [ConKarUni] INT NOT NULL,             -- Cantidad del componente
    PRIMARY KEY CLUSTERED ([art_sec] ASC, [ComArtSec] ASC)
)
```

### 2.2 Campos Nuevos

**Tabla: `articulos`**
```sql
ALTER TABLE dbo.articulos
ADD art_bundle CHAR(1) NULL DEFAULT 'N';  -- 'S' = bundle, 'N' = normal

-- Constraint
ALTER TABLE dbo.articulos
ADD CONSTRAINT CK_articulos_art_bundle CHECK (art_bundle IN ('S', 'N'));
```

**Tabla: `facturakardes`**
```sql
-- CRITICAL: DEFAULT NULL para NO romper INSERTs existentes
ALTER TABLE dbo.facturakardes
ADD kar_bundle_padre VARCHAR(30) NULL DEFAULT NULL;

-- FK opcional
ALTER TABLE dbo.facturakardes
ADD CONSTRAINT FK_facturakardes_bundle_padre
    FOREIGN KEY (kar_bundle_padre)
    REFERENCES dbo.articulos(art_sec);
```

**⚠️ IMPORTANTE:** El campo `kar_bundle_padre` tiene `DEFAULT NULL` para que código existente que hace INSERT sin especificar esta columna NO SE ROMPA.

---

## 3. Estructura Real de facturakardes

### Campos Completos (según `orderModel.js`)

```sql
CREATE TABLE facturakardes (
    fac_sec              DECIMAL(18,0) NOT NULL,  -- FK to factura
    kar_sec              INT NOT NULL,             -- Línea (secuencia MAX+1 por fac_sec)
    art_sec              VARCHAR(30) NOT NULL,     -- FK to articulos
    kar_bod_sec          VARCHAR(1) NOT NULL,      -- Bodega (siempre '1')
    kar_uni              DECIMAL(17,2),            -- Cantidad (NO kar_can!)
    kar_nat              VARCHAR(1),               -- Naturaleza: '+' o '-'
    kar_pre_pub          DECIMAL(17,2),            -- Precio público (NO kar_vuni!)
    kar_total            DECIMAL(17,2),            -- = kar_uni * kar_pre_pub * (1-desc%)
    kar_lis_pre_cod      INT,                      -- 1=detal, 2=mayor
    kar_des_uno          DECIMAL(11,5),            -- Descuento línea %
    kar_kar_sec_ori      INT,                      -- Línea original (devoluciones)
    kar_fac_sec_ori      INT,                      -- Factura original (devoluciones)

    -- CAMPOS PROMOCIONALES (7 campos - OBLIGATORIOS en INSERT)
    kar_pre_pub_detal         DECIMAL(17,2),       -- Precio base detal
    kar_pre_pub_mayor         DECIMAL(17,2),       -- Precio base mayor
    kar_tiene_oferta          CHAR(1),             -- 'S'/'N'
    kar_precio_oferta         DECIMAL(17,2),       -- Precio oferta (si aplica)
    kar_descuento_porcentaje  DECIMAL(5,2),        -- % descuento (si aplica)
    kar_codigo_promocion      VARCHAR(20),         -- Código promo
    kar_descripcion_promocion VARCHAR(200),        -- Descripción promo

    -- NUEVO CAMPO PARA BUNDLES
    kar_bundle_padre     VARCHAR(30) NULL,         -- art_sec del bundle (NULL si no es componente)

    PRIMARY KEY (fac_sec, kar_sec)
)
```

### Generación de kar_sec

```javascript
// SIEMPRE seguir este patrón (líneas 613-621 de orderModel.js)
const karSecQuery = `
  SELECT ISNULL(MAX(kar_sec), 0) + 1 AS NewKarSec
  FROM dbo.facturakardes
  WHERE fac_sec = @fac_sec
`;
const karSecResult = await detailRequest.query(karSecQuery);
const NewKarSec = karSecResult.recordset[0].NewKarSec;
```

---

## 4. Flujo de Facturación Corregido

### 4.1 Modificación en `orderModel.js` (ES Modules)

**UBICACIÓN:** Antes del loop de detalles (línea ~611)

```javascript
// ARCHIVO: models/orderModel.js
// NOTA: Este archivo usa ES MODULES (import/export), NO CommonJS

// ==========================================
// NUEVA FUNCIÓN: Pre-expandir bundles
// ==========================================
async function expandirBundles(detalles) {
  const detallesExpandidos = [];

  for (const detalle of detalles) {
    // Verificar si es bundle
    const articuloCheck = await pool.request()
      .input('art_sec', sql.VarChar(30), detalle.art_sec)
      .query('SELECT art_bundle FROM dbo.articulos WHERE art_sec = @art_sec');

    const esBundle = articuloCheck.recordset[0]?.art_bundle === 'S';

    if (esBundle) {
      // 1. Agregar línea del bundle padre
      detallesExpandidos.push({
        ...detalle,
        kar_bundle_padre: null,  // Es el padre, no tiene padre
        _es_bundle_padre: true   // Flag interno para logging
      });

      // 2. Obtener componentes del bundle
      const componentes = await pool.request()
        .input('bundle_art_sec', sql.VarChar(30), detalle.art_sec)
        .query(`
          SELECT ComArtSec, ConKarUni
          FROM dbo.articulosArmado
          WHERE art_sec = @bundle_art_sec
        `);

      // 3. Agregar líneas de componentes con precio $0
      for (const comp of componentes.recordset) {
        detallesExpandidos.push({
          art_sec: comp.ComArtSec,
          kar_uni: detalle.kar_uni * comp.ConKarUni,  // Cantidad bundle × cantidad componente
          kar_pre_pub: 0,  // Precio $0 para no sumar al total
          kar_nat: detalle.kar_nat || '-',
          kar_bundle_padre: detalle.art_sec,  // Referencia al bundle padre

          // Campos promocionales en 0/NULL (componente no tiene precio)
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
      // Artículo normal - agregar sin modificar
      detallesExpandidos.push({
        ...detalle,
        kar_bundle_padre: null  // Artículo normal no tiene padre
      });
    }
  }

  return detallesExpandidos;
}

// ==========================================
// MODIFICAR createCompleteOrder()
// ==========================================
export const createCompleteOrder = async ({
  nit_sec, fac_usu_cod_cre, fac_tip_cod = 'VTA', detalles,
  descuento = 0, lis_pre_cod = 1, fac_nro_woo, fac_obs, fac_descuento_general = 0
}) => {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    // ... código existente de generación de fac_sec, fac_nro ...
    // (líneas 554-608)

    // *** NUEVO: Expandir bundles ANTES del loop ***
    const detallesExpandidos = await expandirBundles(detalles);

    // 5. Insertar detalles en facturakardes (línea 611)
    for (const detalle of detallesExpandidos) {  // ← Usar detallesExpandidos en lugar de detalles

      // 5.1 Obtener nuevo kar_sec (MAX+1)
      const detailRequest = new sql.Request(transaction);
      detailRequest.input('fac_sec', sql.Decimal(18, 0), NewFacSec);
      const karSecQuery = `
        SELECT ISNULL(MAX(kar_sec), 0) + 1 AS NewKarSec
        FROM dbo.facturakardes
        WHERE fac_sec = @fac_sec
      `;
      const karSecResult = await detailRequest.query(karSecQuery);
      const NewKarSec = karSecResult.recordset[0].NewKarSec;

      // 5.2 Lógica de precios (MANTENER CÓDIGO EXISTENTE líneas 623-738)
      let precioInfo;
      const tieneCamposPromocion =
        detalle.kar_pre_pub_detal !== undefined &&
        detalle.kar_pre_pub_mayor !== undefined &&
        detalle.kar_tiene_oferta !== undefined &&
        detalle.kar_pre_pub_detal !== null &&
        detalle.kar_pre_pub_mayor !== null;

      if (tieneCamposPromocion) {
        // Usar valores que vienen (de WooCommerce o bundle)
        precioInfo = {
          precio_detal: detalle.kar_pre_pub_detal || 0,
          precio_mayor: detalle.kar_pre_pub_mayor || 0,
          precio_oferta: detalle.kar_precio_oferta || null,
          descuento_porcentaje: detalle.kar_descuento_porcentaje || null,
          codigo_promocion: detalle.kar_codigo_promocion || null,
          descripcion_promocion: detalle.kar_descripcion_promocion || null,
          tiene_oferta: detalle.kar_tiene_oferta || 'N'
        };
      } else {
        // Query desde BD (código existente líneas 666-738)
        // ... mantener query completa ...
      }

      // 5.3 INSERT con TODOS los campos (líneas 741-776)
      const insertRequest = new sql.Request(transaction);
      insertRequest.input('fac_sec', sql.Decimal(18, 0), NewFacSec);
      insertRequest.input('NewKarSec', sql.Int, NewKarSec);
      insertRequest.input('art_sec', sql.VarChar(30), detalle.art_sec);
      insertRequest.input('kar_nat', sql.VarChar(1), detalle.kar_nat);
      insertRequest.input('kar_uni', sql.Decimal(17, 2), detalle.kar_uni);
      insertRequest.input('kar_pre_pub', sql.Decimal(17, 2), detalle.kar_pre_pub);
      insertRequest.input('kar_des_uno', sql.Decimal(11, 5), descuento);
      insertRequest.input('lis_pre_cod', sql.Int, lis_pre_cod);
      insertRequest.input('kar_kar_sec_ori', sql.Int, detalle.kar_kar_sec_ori);
      insertRequest.input('kar_fac_sec_ori', sql.Int, detalle.kar_fac_sec_ori);

      // Campos promocionales
      insertRequest.input('kar_pre_pub_detal', sql.Decimal(17, 2), precioInfo.precio_detal);
      insertRequest.input('kar_pre_pub_mayor', sql.Decimal(17, 2), precioInfo.precio_mayor);
      insertRequest.input('kar_tiene_oferta', sql.Char(1), precioInfo.tiene_oferta);
      insertRequest.input('kar_precio_oferta', sql.Decimal(17, 2), precioInfo.precio_oferta);
      insertRequest.input('kar_descuento_porcentaje', sql.Decimal(5, 2), precioInfo.descuento_porcentaje);
      insertRequest.input('kar_codigo_promocion', sql.VarChar(20), precioInfo.codigo_promocion);
      insertRequest.input('kar_descripcion_promocion', sql.VarChar(200), precioInfo.descripcion_promocion);

      // *** NUEVO: Campo kar_bundle_padre ***
      insertRequest.input('kar_bundle_padre', sql.VarChar(30), detalle.kar_bundle_padre);

      let kar_total = Number(detalle.kar_uni) * Number(detalle.kar_pre_pub);
      if (descuento > 0) {
        kar_total = kar_total * (1 - (descuento / 100));
      }
      insertRequest.input('kar_total', sql.Decimal(17, 2), kar_total);

      const insertDetailQuery = `
        INSERT INTO dbo.facturakardes (
          fac_sec, kar_sec, art_sec, kar_bod_sec, kar_uni, kar_nat,
          kar_pre_pub, kar_total, kar_lis_pre_cod, kar_des_uno,
          kar_kar_sec_ori, kar_fac_sec_ori,
          kar_pre_pub_detal, kar_pre_pub_mayor, kar_tiene_oferta,
          kar_precio_oferta, kar_descuento_porcentaje,
          kar_codigo_promocion, kar_descripcion_promocion,
          kar_bundle_padre
        ) VALUES (
          @fac_sec, @NewKarSec, @art_sec, '1', @kar_uni, @kar_nat,
          @kar_pre_pub, @kar_total, @lis_pre_cod, @kar_des_uno,
          @kar_kar_sec_ori, @kar_fac_sec_ori,
          @kar_pre_pub_detal, @kar_pre_pub_mayor, @kar_tiene_oferta,
          @kar_precio_oferta, @kar_descuento_porcentaje,
          @kar_codigo_promocion, @kar_descripcion_promocion,
          @kar_bundle_padre
        )
      `;
      await insertRequest.query(insertDetailQuery);

      // Actualizar fac_nro_origen si aplica (líneas 778-792)
      // ... mantener código existente ...
    }

    await transaction.commit();

    // WooCommerce sync (líneas 797-824)
    // ... mantener código existente ...

  } catch (error) {
    if (transaction) {
      await transaction.rollback();
    }
    throw error;
  }
};
```

---

### 4.2 Validación Pre-Transaction en Controller

**ARCHIVO:** `controllers/orderController.js` (CommonJS)

```javascript
// Agregar ANTES de llamar createCompleteOrder()
const validarBundles = async (detalles) => {
  const { poolPromise, sql } = require('../db');
  const pool = await poolPromise;

  for (const detalle of detalles) {
    // Verificar si es bundle
    const checkBundle = await pool.request()
      .input('art_sec', sql.VarChar(30), detalle.art_sec)
      .query('SELECT art_bundle FROM dbo.articulos WHERE art_sec = @art_sec');

    if (checkBundle.recordset[0]?.art_bundle !== 'S') continue;

    // Es un bundle - validar stock del bundle Y componentes

    // 1. Stock del bundle
    const stockBundle = await pool.request()
      .input('art_sec', sql.VarChar(30), detalle.art_sec)
      .query(`
        SELECT ISNULL(existencia, 0) as stock, art_cod, art_nom
        FROM dbo.vwExistencias ve
        INNER JOIN dbo.articulos a ON a.art_sec = ve.art_sec
        WHERE ve.art_sec = @art_sec
      `);

    const bundle = stockBundle.recordset[0];
    if (bundle.stock < detalle.kar_uni) {
      throw new Error(
        `Stock insuficiente del bundle "${bundle.art_nom}" (${bundle.art_cod}). ` +
        `Disponible: ${bundle.stock}, Solicitado: ${detalle.kar_uni}`
      );
    }

    // 2. Stock de componentes
    const componentes = await pool.request()
      .input('bundle_art_sec', sql.VarChar(30), detalle.art_sec)
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
      const necesario = comp.ConKarUni * detalle.kar_uni;
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
      throw new Error(
        `Stock insuficiente de componentes para bundle "${bundle.art_nom}": ${detalleError}`
      );
    }
  }

  return { valido: true };
};

// En el endpoint createCompleteOrder:
const createCompleteOrder = async (req, res) => {
  try {
    const { nit_sec, fac_usu_cod_cre, fac_tip_cod = 'VTA', detalles, ... } = req.body;

    // *** VALIDAR BUNDLES ANTES DE CREAR ORDEN ***
    await validarBundles(detalles);

    // Continuar con creación normal
    const { createCompleteOrder: createOrder } = await import('../models/orderModel.js');
    const result = await createOrder({ nit_sec, fac_usu_cod_cre, ... });

    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};
```

---

## 5. WooCommerce Sync (CORREGIDO)

### 5.1 Crear Bundle en WooCommerce

**ARCHIVO:** `models/bundleModel.js` (nuevo, CommonJS)

```javascript
const WooCommerceRestApi = require("@woocommerce/woocommerce-rest-api").default;

const wcApi = new WooCommerceRestApi({
  url: process.env.WC_URL,
  consumerKey: process.env.WC_CONSUMER_KEY,
  consumerSecret: process.env.WC_CONSUMER_SECRET,
  version: "wc/v3"
});

function generarDescripcionBundleHTML(componentes) {
  let html = '<div class="bundle-contents" style="background:#f9f9f9;padding:15px;border-radius:5px;margin:10px 0;">';
  html += '<h3 style="color:#333;margin-top:0;">🎁 Este combo incluye:</h3>';
  html += '<ul style="list-style:none;padding:0;">';

  for (const comp of componentes) {
    html += '<li style="padding:5px 0;border-bottom:1px solid #eee;">';
    html += `<strong style="color:#e91e63;">${comp.cantidad}×</strong> `;
    html += `<span style="font-size:16px;">${comp.art_nom}</span>`;
    if (comp.art_cod) {
      html += ` <small style="color:#999;">(${comp.art_cod})</small>`;
    }
    html += '</li>';
  }

  html += '</ul></div>';
  html += '<p style="color:#666;font-size:14px;"><em>Todos los productos incluidos en el combo se despacharán juntos.</em></p>';

  return html;
}

const createBundleWooCommerce = async ({ art_nom, art_cod, precio_detal, precio_mayor, componentes, images, categories }) => {
  const shortDesc = componentes.map(c => `${c.cantidad}x ${c.art_nom}`).join(', ');

  const wooData = {
    name: art_nom,
    type: 'simple',  // NO 'bundle' - WooCommerce no tiene ese tipo
    sku: art_cod,
    regular_price: precio_detal.toString(),
    description: generarDescripcionBundleHTML(componentes),
    short_description: `Incluye: ${shortDesc}`,
    manage_stock: true,
    stock_quantity: 0,  // Se actualiza después
    meta_data: [
      { key: "_precio_mayorista", value: precio_mayor.toString() },
      { key: "_es_bundle", value: "S" },
      { key: "_bundle_componentes_count", value: componentes.length.toString() },
      { key: "_bundle_componentes_json", value: JSON.stringify(componentes) }
    ],
    categories: categories || [],
    images: images || []
  };

  console.log('Creando bundle en WooCommerce:', JSON.stringify(wooData, null, 2));

  const wooProduct = await wcApi.post('products', wooData);

  return {
    art_woo_id: wooProduct.data.id,
    permalink: wooProduct.data.permalink
  };
};

module.exports = { createBundleWooCommerce, generarDescripcionBundleHTML };
```

---

## 6. API Endpoints

### 6.1 Gestión de Bundles

**POST /api/bundles**

Request:
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

Response:
```json
{
  "success": true,
  "message": "Bundle creado exitosamente",
  "data": {
    "art_sec": "100",
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
      "art_sec": "100",
      "art_cod": "COMBO-AMOR-2024",
      "art_nom": "Combo Amor y Amistad",
      "precio_detal": 50000,
      "stock_bundle": 5
    },
    "componentes": [
      {
        "art_sec": "ART001",
        "art_cod": "LABIAL-ROJO",
        "art_nom": "Labial Rojo Pasión",
        "cantidad": 1,
        "stock_disponible": 10
      }
    ]
  }
}
```

---

**PUT /api/bundles/:art_sec/componentes**

Actualizar componentes:
```json
{
  "componentes": [
    { "art_sec": "ART001", "cantidad": 2 },
    { "art_sec": "ART004", "cantidad": 1 }
  ]
}
```

---

**POST /api/bundles/:art_sec/validar-stock**

Request:
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
      "art_nom": "Labial Rojo",
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

## 7. Plan de Implementación CORREGIDO

### Fase 0: Migración BD (1 día)
- [x] Script SQL con DEFAULT NULL
- [ ] Ejecutar en desarrollo
- [ ] Validar que INSERTs existentes NO se rompan
- [ ] Ejecutar en producción

### Fase 1: Modelo Bundle (2 días)
- [ ] Crear `models/bundleModel.js` (CommonJS)
  - `createBundle()`
  - `getBundleComponents()`
  - `updateBundleComponents()`
  - `validateBundleStock()`
  - `createBundleWooCommerce()`

### Fase 2: Controller y Routes (2 días)
- [ ] Crear `controllers/bundleController.js`
- [ ] Crear `routes/bundleRoutes.js`
- [ ] Registrar en `index.js`
- [ ] Testing con Postman

### Fase 3: Integración Facturación (3 días) - MÁS CRÍTICO
- [ ] Modificar `orderModel.js` (ES Modules)
  - Agregar función `expandirBundles()`
  - Modificar loop para usar `detallesExpandidos`
  - Agregar `kar_bundle_padre` al INSERT
- [ ] Modificar `orderController.js`
  - Agregar validación pre-transaction
- [ ] Testing exhaustivo:
  - Orden solo bundles
  - Orden mixta
  - Stock insuficiente
  - Verificar kardex

### Fase 4: WooCommerce Sync (2 días)
- [ ] Sync de bundles con descripción HTML
- [ ] Actualización de stock
- [ ] Importación de órdenes desde WooCommerce

### Fase 5: Testing y Rollback (2 días)
- [ ] Pruebas de regresión
- [ ] Validar que productos simples siguen funcionando
- [ ] Validar que variables siguen funcionando
- [ ] Plan de rollback documentado

**Total: 12 días hábiles**

---

## 8. Queries Útiles

**Listar bundles:**
```sql
SELECT
  a.art_sec,
  a.art_cod,
  a.art_nom,
  COUNT(aa.ComArtSec) as componentes_count,
  ve.existencia as stock
FROM dbo.articulos a
LEFT JOIN dbo.articulosArmado aa ON aa.art_sec = a.art_sec
LEFT JOIN dbo.vwExistencias ve ON ve.art_sec = a.art_sec
WHERE a.art_bundle = 'S'
GROUP BY a.art_sec, a.art_cod, a.art_nom, ve.existencia;
```

**Ver componentes de un bundle:**
```sql
SELECT
  c.art_cod,
  c.art_nom,
  aa.ConKarUni as cantidad,
  ve.existencia as stock
FROM dbo.articulosArmado aa
INNER JOIN dbo.articulos c ON c.art_sec = aa.ComArtSec
LEFT JOIN dbo.vwExistencias ve ON ve.art_sec = c.art_sec
WHERE aa.art_sec = '100';
```

**Kardex de factura con bundles:**
```sql
SELECT
  fk.fac_sec,
  fk.kar_sec,  -- NO kar_sec_item!
  a.art_cod,
  a.art_nom,
  fk.kar_uni,  -- NO kar_can!
  fk.kar_pre_pub,  -- NO kar_vuni!
  fk.kar_total,
  CASE
    WHEN fk.kar_bundle_padre IS NULL THEN 'Normal/Bundle Padre'
    ELSE 'Componente de ' + bp.art_cod
  END as tipo,
  fk.kar_bundle_padre
FROM dbo.facturakardes fk
INNER JOIN dbo.articulos a ON a.art_sec = fk.art_sec
LEFT JOIN dbo.articulos bp ON bp.art_sec = fk.kar_bundle_padre
WHERE fk.fac_sec = 12345
ORDER BY fk.kar_sec;
```

---

## 9. Checklist de Compatibilidad

### ✅ BD
- [x] Campo `kar_bundle_padre` con DEFAULT NULL
- [x] Nombres de campos correctos (kar_sec, kar_uni, kar_pre_pub)
- [x] Tipos correctos (fac_sec DECIMAL, kar_sec INT, art_sec VARCHAR)

### ✅ Código
- [x] Usar `new sql.Request(transaction)` no `pool.request()`
- [x] Mantener 7 campos promocionales en INSERT
- [x] ES Modules en orderModel.js
- [x] Validación PRE-transaction
- [x] WooCommerce type 'simple' no 'bundle'

### ✅ Testing
- [ ] INSERTs existentes NO se rompen
- [ ] Productos simples siguen funcionando
- [ ] Productos variables siguen funcionando
- [ ] Facturación normal sin bundles funciona
- [ ] WooCommerce sync no afectado

---

## 10. Advertencias Finales

1. **NO modificar orderModel.js sin ES Modules knowledge**
2. **Validar SIEMPRE stock ANTES de transaction.begin()**
3. **Usar nombres de campos EXACTOS** (kar_sec NO kar_sec_item)
4. **Mantener campos promocionales** (7 campos kar_*)
5. **Testing exhaustivo antes de producción**

---

**APROBACIÓN REQUERIDA ANTES DE IMPLEMENTAR**
