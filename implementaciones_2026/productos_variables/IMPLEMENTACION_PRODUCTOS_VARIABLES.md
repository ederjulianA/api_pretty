# IMPLEMENTACION: Productos Variables con Variaciones de Tono/Color

**Fecha:** 2026-02-04
**Version:** 2.0 (Refinada 2026-02-06)
**Estado:** En Implementacion
**Prioridad:** URGENTE

---

## RESUMEN EJECUTIVO

### Objetivo
Implementar soporte para productos variables en WooCommerce que permitan manejar multiples variaciones de tono/color para un mismo producto (ejemplo: labial con 4 tonos distintos).

### Alcance Inicial
- **3 productos nuevos** con variaciones de tono/color
- Creacion desde Backend -> WooCommerce
- Sincronizacion de pedidos WooCommerce -> Backend
- Promociones aplican al producto completo (padre)
- **NO** se requiere importar productos variables existentes de WooCommerce

### Atributo de Variacion
- **Tono/Color** unicamente en esta fase

---

## ERRORES CRITICOS CORREGIDOS (v1.0 -> v2.0)

> **IMPORTANTE:** La version 1.0 del documento contenia errores graves que habrian causado fallos en produccion. A continuacion se detallan y sus correcciones.

### BUG 1 - Tipo de `art_sec` incorrecto
- **v1.0:** Usaba `DECIMAL(18,0)` en los ALTER TABLE y en el codigo JS
- **Real:** `art_sec` es `VARCHAR(30)` en la tabla `dbo.articulos`
- **Impacto:** Los ALTER TABLE y queries fallan por tipo incompatible
- **Correccion:** Todos los nuevos campos que referencian `art_sec` usan `VARCHAR(30)`

### BUG 2 - `art_cod` no puede ser NULL
- **v1.0:** Proponia `art_cod = NULL` para productos padre
- **Real:** `art_cod` es `VARCHAR(30) NOT NULL` en el esquema
- **Impacto:** INSERT falla con violacion de constraint NOT NULL
- **Correccion:** Producto padre SIEMPRE tiene `art_cod` (codigo base obligatorio)

### BUG 3 - Columna `inv_gru_cod` no existe en `articulos`
- **v1.0:** INSERT incluia `inv_gru_cod` y `art_est`
- **Real:** `articulos` solo tiene `inv_sub_gru_cod` (SMALLINT). No tiene `inv_gru_cod` ni `art_est`
- **Impacto:** INSERT falla por columnas inexistentes
- **Correccion:** Solo usar `inv_sub_gru_cod` (SMALLINT) en INSERT

### BUG 4 - Falta campo `pre_sec` obligatorio
- **v1.0:** No incluia `pre_sec` en los INSERT
- **Real:** `pre_sec` es `VARCHAR(16) NOT NULL`
- **Impacto:** INSERT falla por violacion de constraint NOT NULL
- **Correccion:** Incluir `pre_sec = '1'` en todos los INSERT

### BUG 5 - Campos duplicados (ya existen en BD)
- **v1.0:** Proponia crear `art_parent_sec` y `art_woo_type`
- **Real:** Ya existen `art_sec_padre VARCHAR(30)` y `art_variable VARCHAR(1)`
- **Impacto:** Redundancia de datos y confusion
- **Correccion:** Reutilizar `art_sec_padre` existente. Solo agregar los campos realmente nuevos

### BUG 6 - Generacion de `art_sec` no segura para concurrencia
- **v1.0:** Usaba `MAX(art_sec) + 1` para generar ID
- **Real:** El sistema usa `dbo.secuencia` con `UPDLOCK, HOLDLOCK`
- **Impacto:** IDs duplicados bajo carga concurrente
- **Correccion:** Usar el mismo patron de `dbo.secuencia` que usa `createArticulo`

### BUG 7 - Sistema de modulos incompatible
- **v1.0:** `variationUtils.js` usa `import`/`export` (ES Modules)
- **Real:** Todo el proyecto usa `require`/`module.exports` (CommonJS)
- **Impacto:** Error de sintaxis al importar el modulo
- **Correccion:** Convertir a CommonJS

### BUG 8 - SKU puede exceder VARCHAR(30)
- **v1.0:** SKU generado como `LABLIQ001-CHAMPAGNE-SHIMMER` = 31 chars
- **Real:** `art_cod` es `VARCHAR(30)` maximo
- **Impacto:** Truncamiento de SKU o error de INSERT
- **Correccion:** Truncar SKU a 30 caracteres y validar longitud

### BUG 9 - `inv_sub_gru_cod` tipo incorrecto en JS
- **v1.0:** Usaba `sql.VarChar(50)` para subcategoria
- **Real:** `inv_sub_gru_cod` es `SMALLINT` en la tabla
- **Impacto:** Error de tipo al insertar
- **Correccion:** Usar `sql.SmallInt` en los inputs

---

## CASOS DE USO

### Caso de Uso Principal
1. Usuario crea un producto padre: "Labial Mate Professional"
2. Define que tendra variaciones de "Tono"
3. Crea 4 variaciones:
   - Rojo Pasion
   - Rosa Nude
   - Ciruela Oscuro
   - Coral Brillante
4. Cada variacion tiene:
   - SKU unico (LAB001-ROJO, LAB001-ROSA, etc.)
   - Precio detal y mayor propios
   - Stock independiente
5. Sistema sincroniza a WooCommerce:
   - Producto variable padre
   - 4 variaciones hijas
6. Cliente hace pedido en WooCommerce:
   - Selecciona "Labial Mate Professional - Tono: Rojo Pasion"
7. Pedido se sincroniza al backend correctamente con SKU especifico

---

## ARQUITECTURA DE LA SOLUCION

### Modelo de Datos (Alineado al Esquema Real)

```
TABLA dbo.articulos - CAMPOS EXISTENTES REUTILIZADOS:
├── art_sec           VARCHAR(30) PK  -- Identificador unico
├── art_cod           VARCHAR(30) NOT NULL -- SKU (OBLIGATORIO, nunca NULL)
├── art_nom           VARCHAR(100) NOT NULL
├── inv_sub_gru_cod   SMALLINT NOT NULL -- Subcategoria
├── pre_sec           VARCHAR(16) NOT NULL -- Presentacion (default '1')
├── art_sec_padre     VARCHAR(30) NULL -- YA EXISTE: referencia al padre
├── art_variable      VARCHAR(1) NULL  -- YA EXISTE: 'S' = es variable
├── art_woo_id        INT NULL -- ID en WooCommerce
└── art_url_img_servi VARCHAR(1000) NULL -- URL imagen principal

CAMPOS NUEVOS A AGREGAR:
├── art_woo_type              VARCHAR(20) DEFAULT 'simple' -- 'simple'|'variable'|'variation'
├── art_parent_woo_id         INT NULL -- WooCommerce ID del padre
├── art_variation_attributes  NVARCHAR(MAX) NULL -- JSON: {"Tono":"Rojo Pasion"}
└── art_woo_variation_id      INT NULL -- ID variacion en WooCommerce
```

### Estructura de Producto Variable

```
PRODUCTO PADRE (Variable)
├── art_sec = '50001'
├── art_cod = 'LAB001' (OBLIGATORIO, codigo base)
├── art_variable = 'S'
├── art_woo_type = 'variable'
├── art_sec_padre = NULL
├── art_woo_id = 12345 (WooCommerce product ID)
├── Precios de referencia en articulosdetalle
└── No tiene stock propio (stock en variaciones)

VARIACION (Hija)
├── art_sec = '50002'
├── art_cod = 'LAB001-ROJO' (SKU unico, max 30 chars)
├── art_variable = NULL
├── art_woo_type = 'variation'
├── art_sec_padre = '50001' (referencia al padre)
├── art_parent_woo_id = 12345
├── art_variation_attributes = '{"Tono":"Rojo Pasion"}'
├── art_woo_variation_id = 12346 (WooCommerce variation ID)
├── Precios propios en articulosdetalle
└── Stock propio
```

### Flujo de Sincronizacion de Pedidos

```
WooCommerce Order
└── Line Item: "Labial - Rojo Pasion"
    └── SKU: "LAB001-ROJO"
        └── Backend busca en articulos por art_cod
            └── Encuentra art_sec de la variacion
                └── Detecta art_woo_type = 'variation'
                    └── Busca promociones en art_sec_padre (padre)
                        └── Crea registro en facturakardes
```

---

## IMPLEMENTACION PASO A PASO

---

## **PASO 1: Modificaciones en Base de Datos**

### 1.1. Agregar Campos Nuevos a Tabla `articulos`

**Archivo:** `implementaciones_2026/sql/01_alter_articulos_variaciones.sql`

> NOTA: `art_sec_padre` y `art_variable` YA EXISTEN en la tabla. Solo agregamos los campos realmente nuevos.

```sql
-- =====================================================
-- Script: Agregar soporte para productos variables
-- Fecha: 2026-02-04 (Corregido: 2026-02-06)
-- IMPORTANTE: art_sec es VARCHAR(30), NO DECIMAL
-- =====================================================

USE [NombreDeBaseDeDatos];
GO

IF OBJECT_ID('dbo.articulos', 'U') IS NOT NULL
BEGIN
    PRINT 'Agregando campos para productos variables...';

    -- Tipo de producto en WooCommerce (simple, variable, variation)
    IF NOT EXISTS (SELECT * FROM sys.columns
                   WHERE object_id = OBJECT_ID('dbo.articulos')
                   AND name = 'art_woo_type')
    BEGIN
        ALTER TABLE dbo.articulos
        ADD art_woo_type VARCHAR(20) NULL
        CONSTRAINT DF_articulos_art_woo_type DEFAULT 'simple';

        PRINT 'Campo art_woo_type agregado';
    END
    ELSE
        PRINT 'Campo art_woo_type ya existe';

    -- NOTA: art_sec_padre VARCHAR(30) YA EXISTE en la tabla
    -- No es necesario crearlo. Verificamos que exista:
    IF EXISTS (SELECT * FROM sys.columns
               WHERE object_id = OBJECT_ID('dbo.articulos')
               AND name = 'art_sec_padre')
        PRINT 'Campo art_sec_padre ya existe (OK - reutilizando)';
    ELSE
        PRINT 'ADVERTENCIA: art_sec_padre no existe, creando...';
        -- Solo como respaldo, no deberia ejecutarse
        ALTER TABLE dbo.articulos
        ADD art_sec_padre VARCHAR(30) NULL;

    -- NOTA: art_variable VARCHAR(1) YA EXISTE en la tabla
    IF EXISTS (SELECT * FROM sys.columns
               WHERE object_id = OBJECT_ID('dbo.articulos')
               AND name = 'art_variable')
        PRINT 'Campo art_variable ya existe (OK - reutilizando)';

    -- ID del producto padre en WooCommerce
    IF NOT EXISTS (SELECT * FROM sys.columns
                   WHERE object_id = OBJECT_ID('dbo.articulos')
                   AND name = 'art_parent_woo_id')
    BEGIN
        ALTER TABLE dbo.articulos
        ADD art_parent_woo_id INT NULL;

        PRINT 'Campo art_parent_woo_id agregado';
    END
    ELSE
        PRINT 'Campo art_parent_woo_id ya existe';

    -- Atributos de variacion (JSON)
    IF NOT EXISTS (SELECT * FROM sys.columns
                   WHERE object_id = OBJECT_ID('dbo.articulos')
                   AND name = 'art_variation_attributes')
    BEGIN
        ALTER TABLE dbo.articulos
        ADD art_variation_attributes NVARCHAR(MAX) NULL;

        PRINT 'Campo art_variation_attributes agregado';
    END
    ELSE
        PRINT 'Campo art_variation_attributes ya existe';

    -- ID de la variacion en WooCommerce
    IF NOT EXISTS (SELECT * FROM sys.columns
                   WHERE object_id = OBJECT_ID('dbo.articulos')
                   AND name = 'art_woo_variation_id')
    BEGIN
        ALTER TABLE dbo.articulos
        ADD art_woo_variation_id INT NULL;

        PRINT 'Campo art_woo_variation_id agregado';
    END
    ELSE
        PRINT 'Campo art_woo_variation_id ya existe';

    PRINT '================================================';
    PRINT 'Migracion completada exitosamente';
    PRINT '================================================';
END
ELSE
BEGIN
    PRINT 'ERROR: La tabla dbo.articulos no existe';
END
GO

-- Actualizar productos existentes para asegurar que son 'simple'
UPDATE dbo.articulos
SET art_woo_type = 'simple'
WHERE art_woo_type IS NULL;

PRINT 'Productos existentes marcados como simple';
GO

-- Crear indices para mejorar rendimiento
-- NOTA: art_sec_padre es VARCHAR(30), no DECIMAL
IF NOT EXISTS (SELECT * FROM sys.indexes
               WHERE name = 'IX_articulos_sec_padre'
               AND object_id = OBJECT_ID('dbo.articulos'))
BEGIN
    CREATE INDEX IX_articulos_sec_padre
    ON dbo.articulos(art_sec_padre)
    WHERE art_sec_padre IS NOT NULL;

    PRINT 'Indice IX_articulos_sec_padre creado';
END

IF NOT EXISTS (SELECT * FROM sys.indexes
               WHERE name = 'IX_articulos_woo_type'
               AND object_id = OBJECT_ID('dbo.articulos'))
BEGIN
    CREATE INDEX IX_articulos_woo_type
    ON dbo.articulos(art_woo_type);

    PRINT 'Indice IX_articulos_woo_type creado';
END
GO

PRINT '================================================';
PRINT 'Script completado - Base de datos lista';
PRINT '================================================';
```

### 1.2. Verificar Migracion

**Archivo:** `implementaciones_2026/sql/02_verificar_migracion.sql`

```sql
-- =====================================================
-- Script: Verificar migracion de productos variables
-- =====================================================

USE [NombreDeBaseDeDatos];
GO

PRINT '================================================';
PRINT 'VERIFICACION DE MIGRACION';
PRINT '================================================';
PRINT '';

-- Verificar campos (existentes + nuevos)
SELECT
    'art_sec_padre (existente)' AS campo,
    CASE WHEN EXISTS (
        SELECT * FROM sys.columns
        WHERE object_id = OBJECT_ID('dbo.articulos')
        AND name = 'art_sec_padre'
    ) THEN 'EXISTE' ELSE 'FALTA' END AS estado
UNION ALL
SELECT
    'art_variable (existente)',
    CASE WHEN EXISTS (
        SELECT * FROM sys.columns
        WHERE object_id = OBJECT_ID('dbo.articulos')
        AND name = 'art_variable'
    ) THEN 'EXISTE' ELSE 'FALTA' END
UNION ALL
SELECT
    'art_woo_type (nuevo)',
    CASE WHEN EXISTS (
        SELECT * FROM sys.columns
        WHERE object_id = OBJECT_ID('dbo.articulos')
        AND name = 'art_woo_type'
    ) THEN 'EXISTE' ELSE 'FALTA' END
UNION ALL
SELECT
    'art_parent_woo_id (nuevo)',
    CASE WHEN EXISTS (
        SELECT * FROM sys.columns
        WHERE object_id = OBJECT_ID('dbo.articulos')
        AND name = 'art_parent_woo_id'
    ) THEN 'EXISTE' ELSE 'FALTA' END
UNION ALL
SELECT
    'art_variation_attributes (nuevo)',
    CASE WHEN EXISTS (
        SELECT * FROM sys.columns
        WHERE object_id = OBJECT_ID('dbo.articulos')
        AND name = 'art_variation_attributes'
    ) THEN 'EXISTE' ELSE 'FALTA' END
UNION ALL
SELECT
    'art_woo_variation_id (nuevo)',
    CASE WHEN EXISTS (
        SELECT * FROM sys.columns
        WHERE object_id = OBJECT_ID('dbo.articulos')
        AND name = 'art_woo_variation_id'
    ) THEN 'EXISTE' ELSE 'FALTA' END;

PRINT '';
PRINT 'Conteo de productos por tipo:';
SELECT
    ISNULL(art_woo_type, 'NULL') AS tipo_producto,
    COUNT(*) AS cantidad
FROM dbo.articulos
GROUP BY art_woo_type;

PRINT '';
PRINT '================================================';
```

---

## **PASO 2: Corregir Funciones de Utilidad**

### 2.1. Funciones para Manejo de Variaciones (CORREGIDO)

**Archivo:** `utils/variationUtils.js`

> CAMBIOS: CommonJS en lugar de ES Modules, tipos VARCHAR(30) para art_sec, limite de 30 chars para SKU, bod_sec en JOINs.

```javascript
// utils/variationUtils.js
const { poolPromise, sql } = require('../db');

/**
 * Valida atributos de variacion
 * @param {Object} attributes - Objeto con atributos {Tono: "Rojo Pasion"}
 * @returns {boolean}
 */
const validateVariationAttributes = (attributes) => {
  if (!attributes || typeof attributes !== 'object') {
    return false;
  }

  const allowedAttributes = ['Tono', 'Color'];
  const attributeKeys = Object.keys(attributes);

  if (attributeKeys.length === 0) {
    return false;
  }

  return attributeKeys.every(key => allowedAttributes.includes(key));
};

/**
 * Genera SKU para variacion basado en el codigo padre y atributos
 * IMPORTANTE: art_cod tiene limite de VARCHAR(30)
 * @param {string} parentCode - Codigo del producto padre
 * @param {Object} attributes - Atributos de la variacion
 * @returns {string} SKU generado (max 30 caracteres)
 */
const generateVariationSKU = (parentCode, attributes) => {
  const tono = attributes.Tono || attributes.Color;
  if (!tono) {
    throw new Error('Se requiere atributo Tono o Color para generar SKU');
  }

  // Convertir tono a slug (ej: "Rojo Pasion" -> "ROJO-PASION")
  const tonoSlug = tono
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remover acentos
    .toUpperCase()
    .replace(/\s+/g, '-')
    .replace(/[^A-Z0-9-]/g, '');

  let sku = `${parentCode}-${tonoSlug}`;

  // CRITICO: art_cod es VARCHAR(30), truncar si excede
  if (sku.length > 30) {
    // Mantener el prefijo del padre y truncar el tono
    const maxTonoLength = 30 - parentCode.length - 1; // -1 por el guion
    if (maxTonoLength < 3) {
      throw new Error(`Codigo padre "${parentCode}" es demasiado largo para generar SKU de variacion`);
    }
    sku = `${parentCode}-${tonoSlug.substring(0, maxTonoLength)}`;
  }

  return sku;
};

/**
 * Obtiene todas las variaciones de un producto padre
 * @param {string} parentArtSec - art_sec del producto padre (VARCHAR(30))
 * @returns {Promise<Array>}
 */
const getProductVariations = async (parentArtSec) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('parent_art_sec', sql.VarChar(30), parentArtSec)
      .query(`
        SELECT
          a.art_sec,
          a.art_cod,
          a.art_nom,
          a.art_woo_variation_id,
          a.art_variation_attributes,
          ad1.art_bod_pre AS precio_detal,
          ad2.art_bod_pre AS precio_mayor,
          ISNULL(e.existencia, 0) AS existencia
        FROM dbo.articulos a
        LEFT JOIN dbo.articulosdetalle ad1
          ON a.art_sec = ad1.art_sec AND ad1.lis_pre_cod = 1 AND ad1.bod_sec = '1'
        LEFT JOIN dbo.articulosdetalle ad2
          ON a.art_sec = ad2.art_sec AND ad2.lis_pre_cod = 2 AND ad2.bod_sec = '1'
        LEFT JOIN dbo.vwExistencias e
          ON a.art_sec = e.art_sec
        WHERE a.art_sec_padre = @parent_art_sec
          AND a.art_woo_type = 'variation'
        ORDER BY a.art_cod
      `);

    return result.recordset.map(record => ({
      ...record,
      art_variation_attributes: record.art_variation_attributes
        ? JSON.parse(record.art_variation_attributes)
        : null
    }));
  } catch (error) {
    console.error('Error obteniendo variaciones:', error);
    throw error;
  }
};

/**
 * Verifica si un producto es variable (padre)
 * @param {string} artSec - art_sec VARCHAR(30)
 * @returns {Promise<boolean>}
 */
const isVariableProduct = async (artSec) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('art_sec', sql.VarChar(30), artSec)
      .query('SELECT art_woo_type FROM dbo.articulos WHERE art_sec = @art_sec');

    return result.recordset.length > 0 &&
           result.recordset[0].art_woo_type === 'variable';
  } catch (error) {
    console.error('Error verificando si es producto variable:', error);
    throw error;
  }
};

/**
 * Obtiene informacion del producto padre de una variacion
 * @param {string} variationArtSec
 * @returns {Promise<Object|null>}
 */
const getParentProduct = async (variationArtSec) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('variation_art_sec', sql.VarChar(30), variationArtSec)
      .query(`
        SELECT
          parent.art_sec,
          parent.art_cod,
          parent.art_nom,
          parent.art_woo_id,
          parent.art_woo_type
        FROM dbo.articulos variation
        INNER JOIN dbo.articulos parent
          ON variation.art_sec_padre = parent.art_sec
        WHERE variation.art_sec = @variation_art_sec
          AND variation.art_woo_type = 'variation'
      `);

    return result.recordset.length > 0 ? result.recordset[0] : null;
  } catch (error) {
    console.error('Error obteniendo producto padre:', error);
    throw error;
  }
};

/**
 * Verifica si un SKU ya existe
 * @param {string} sku
 * @returns {Promise<boolean>}
 */
const skuExists = async (sku) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('art_cod', sql.VarChar(30), sku)
      .query('SELECT COUNT(*) AS count FROM dbo.articulos WHERE art_cod = @art_cod');

    return result.recordset[0].count > 0;
  } catch (error) {
    console.error('Error verificando existencia de SKU:', error);
    throw error;
  }
};

module.exports = {
  validateVariationAttributes,
  generateVariationSKU,
  getProductVariations,
  isVariableProduct,
  getParentProduct,
  skuExists
};
```

---

## **PASO 3: Modificar Modelo de Articulos**

### 3.1. Agregar Funcion para Crear Producto Variable (Padre)

**Archivo:** `models/articulosModel.js`

Agregar antes de `module.exports`:

> CAMBIOS CRITICOS vs v1.0:
> - Usa `dbo.secuencia` con UPDLOCK para generar art_sec (no MAX+1)
> - `art_cod` es OBLIGATORIO (NOT NULL en BD)
> - INSERT solo usa columnas que existen: `art_sec, art_cod, art_nom, inv_sub_gru_cod, pre_sec, art_variable, art_woo_type`
> - `inv_sub_gru_cod` es SMALLINT
> - No inserta `inv_gru_cod` ni `art_est` (no existen en la tabla)

```javascript
/**
 * Crea un producto variable (padre) que puede tener variaciones
 * @param {Object} productData - Datos del producto padre
 * @returns {Promise<Object>}
 */
const createVariableProduct = async (productData) => {
  const {
    art_nom,
    art_cod, // Codigo base OBLIGATORIO (ej: "LAB001")
    subcategoria, // inv_sub_gru_cod (SMALLINT)
    categoria, // inv_gru_cod (solo para buscar WooCommerce categories, no se inserta en articulos)
    precio_detal_referencia,
    precio_mayor_referencia,
    attributes, // [{name: "Tono", options: ["Rojo", "Rosa", "Ciruela", "Coral"]}]
    images
  } = productData;

  const pool = await poolPromise;
  let transaction = null;
  let art_sec = null;
  let art_woo_id = null;
  const errors = {};

  try {
    // Validar que art_cod sea proporcionado (NOT NULL en BD)
    if (!art_cod || !art_cod.trim()) {
      throw new Error('art_cod es obligatorio para productos variables (NOT NULL en BD)');
    }

    // Validar longitud de art_cod
    if (art_cod.length > 30) {
      throw new Error('art_cod no puede exceder 30 caracteres');
    }

    // Validar que se proporcionen atributos
    if (!attributes || !Array.isArray(attributes) || attributes.length === 0) {
      throw new Error('Se deben proporcionar atributos para el producto variable');
    }

    // Validar que solo sea el atributo "Tono" o "Color" en esta fase
    const validAttributes = attributes.filter(
      attr => attr.name === 'Tono' || attr.name === 'Color'
    );

    if (validAttributes.length === 0) {
      throw new Error('Solo se permite el atributo "Tono" o "Color" en esta fase');
    }

    // Iniciar transaccion
    transaction = new sql.Transaction(pool);
    await transaction.begin();
    const request = new sql.Request(transaction);

    // 1. Generar art_sec usando dbo.secuencia (patron existente, seguro para concurrencia)
    const secResult = await request.query(`
      SELECT sec_num + 1 AS NewArtSec
      FROM dbo.secuencia WITH (UPDLOCK, HOLDLOCK)
      WHERE sec_cod = 'ARTICULOS'
    `);
    art_sec = secResult.recordset[0].NewArtSec;

    // Actualizar secuencia
    await request
      .input('newSecNum', sql.Decimal(18, 0), art_sec)
      .query(`
        UPDATE dbo.secuencia
        SET sec_num = @newSecNum
        WHERE sec_cod = 'ARTICULOS'
      `);

    console.log('Nuevo art_sec generado:', art_sec);

    // 2. Insertar producto padre en dbo.articulos
    // NOTA: Solo columnas que EXISTEN en la tabla
    // art_sec es VARCHAR(30), inv_sub_gru_cod es SMALLINT, pre_sec es obligatorio
    await request
      .input('art_sec', sql.VarChar(30), art_sec.toString())
      .input('art_cod', sql.VarChar(30), art_cod)
      .input('art_nom', sql.VarChar(100), art_nom)
      .input('subcategoria', sql.SmallInt, parseInt(subcategoria, 10))
      .query(`
        INSERT INTO dbo.articulos (
          art_sec, art_cod, art_nom, inv_sub_gru_cod, pre_sec,
          art_variable, art_woo_type
        )
        VALUES (
          @art_sec, @art_cod, @art_nom, @subcategoria, '1',
          'S', 'variable'
        )
      `);

    console.log('Producto variable padre creado en BD');

    // 3. Subir imagenes a Cloudinary si se proporcionan
    let imageUrls = [];
    if (images && images.length > 0) {
      try {
        const uploadPromises = images.map((image, index) => {
          const base64Image = `data:${image.mimetype};base64,${image.data.toString('base64')}`;
          return cloudinary.uploader.upload(base64Image, {
            folder: 'productos_variables',
            public_id: `${art_cod}_${index + 1}`
          });
        });

        const uploadResults = await Promise.all(uploadPromises);
        imageUrls = uploadResults.map(result => result.secure_url);

        // Actualizar primera imagen como URL principal
        if (imageUrls.length > 0) {
          await request
            .input('imageUrl', sql.VarChar(1000), imageUrls[0])
            .input('artSecImage', sql.VarChar(30), art_sec.toString())
            .query(`
              UPDATE dbo.articulos
              SET art_url_img_servi = @imageUrl
              WHERE art_sec = @artSecImage
            `);
        }
      } catch (error) {
        errors.cloudinary = {
          message: 'Error al subir imagenes a Cloudinary',
          details: error.message
        };
        console.error('Error al subir imagenes:', error);
      }
    }

    // 4. Insertar precios de referencia
    if (precio_detal_referencia) {
      await request
        .input('artSecDetal', sql.VarChar(30), art_sec.toString())
        .input('precio_detal', sql.Decimal(17, 2), precio_detal_referencia)
        .query(`
          INSERT INTO dbo.articulosdetalle (art_sec, bod_sec, lis_pre_cod, art_bod_pre)
          VALUES (@artSecDetal, '1', 1, @precio_detal)
        `);
    }

    if (precio_mayor_referencia) {
      await request
        .input('artSecMayor', sql.VarChar(30), art_sec.toString())
        .input('precio_mayor', sql.Decimal(17, 2), precio_mayor_referencia)
        .query(`
          INSERT INTO dbo.articulosdetalle (art_sec, bod_sec, lis_pre_cod, art_bod_pre)
          VALUES (@artSecMayor, '1', 2, @precio_mayor)
        `);
    }

    // Commit de la transaccion local
    await transaction.commit();
    transaction = null; // Evitar rollback en el catch

    // 5. Crear producto variable en WooCommerce
    try {
      // Obtener IDs de categorias de WooCommerce
      const catRequest = pool.request();
      catRequest.input('categoria', sql.VarChar(16), categoria);
      catRequest.input('subcategoria_woo', sql.SmallInt, parseInt(subcategoria, 10));
      const catResult = await catRequest.query(`
        SELECT inv_sub_gru_parend_woo, inv_sub_gru_woo_id
        FROM dbo.inventario_subgrupo
        WHERE inv_gru_cod = @categoria AND inv_sub_gru_cod = @subcategoria_woo
      `);

      const categories = [];
      if (catResult.recordset.length > 0) {
        const { inv_sub_gru_parend_woo, inv_sub_gru_woo_id } = catResult.recordset[0];
        if (inv_sub_gru_parend_woo) {
          categories.push({ id: parseInt(inv_sub_gru_parend_woo, 10) });
        }
        if (inv_sub_gru_woo_id) {
          categories.push({ id: parseInt(inv_sub_gru_woo_id, 10) });
        }
      }

      // Preparar atributos para WooCommerce
      const wooAttributes = validAttributes.map(attr => ({
        name: attr.name,
        visible: true,
        variation: true,
        options: attr.options
      }));

      const wooData = {
        name: art_nom,
        type: 'variable',
        sku: art_cod,
        attributes: wooAttributes,
        categories: categories,
        images: imageUrls.map(url => ({ src: url }))
      };

      console.log('Creando producto variable en WooCommerce:', JSON.stringify(wooData, null, 2));

      const wooProduct = await wcApi.post('products', wooData);
      art_woo_id = wooProduct.data.id;

      console.log('Producto variable creado en WooCommerce con ID:', art_woo_id);

      // Actualizar art_woo_id en la base de datos
      await pool.request()
        .input('art_woo_id', sql.Int, art_woo_id)
        .input('artSecWoo', sql.VarChar(30), art_sec.toString())
        .query(`
          UPDATE dbo.articulos
          SET art_woo_id = @art_woo_id
          WHERE art_sec = @artSecWoo
        `);

      // Registrar las fotos en producto_fotos
      if (wooProduct.data.images && wooProduct.data.images.length > 0) {
        for (let i = 0; i < wooProduct.data.images.length; i++) {
          const image = wooProduct.data.images[i];
          const photo = new ProductPhoto({
            id: uuidv4(),
            art_sec: art_sec.toString(),
            nombre: `${art_cod}_${i + 1}`,
            url: image.src,
            tipo: images[i] ? images[i].mimetype : 'image/jpeg',
            tamanio: images[i] ? images[i].size : 0,
            fecha_creacion: new Date(),
            woo_photo_id: image.id.toString(),
            es_principal: i === 0,
            posicion: i,
            estado: 'woo'
          });
          await photo.save();
        }
      }

    } catch (wooError) {
      errors.wooCommerce = {
        message: 'Error al crear producto variable en WooCommerce',
        details: wooError.message,
        response: wooError.response?.data
      };
      console.error('Error en WooCommerce:', errors.wooCommerce);
    }

    return {
      success: true,
      data: {
        art_sec: art_sec.toString(),
        art_cod,
        art_nom,
        art_woo_id,
        art_woo_type: 'variable',
        attributes: validAttributes,
        images: imageUrls
      },
      errors: Object.keys(errors).length > 0 ? errors : undefined
    };

  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error("Error en rollback:", rollbackError);
      }
    }
    throw {
      success: false,
      message: 'Error al crear producto variable',
      error: error.message
    };
  }
};
```

### 3.2. Agregar Funcion para Crear Variacion

Continuar en el mismo archivo:

```javascript
/**
 * Crea una variacion de un producto variable
 * @param {Object} variationData - Datos de la variacion
 * @returns {Promise<Object>}
 */
const createProductVariation = async (variationData) => {
  const {
    parent_art_sec,    // art_sec del producto padre (VARCHAR(30))
    art_nom,           // Nombre de la variacion
    attributes,        // {Tono: "Rojo Pasion"}
    precio_detal,
    precio_mayor,
    images
  } = variationData;

  const pool = await poolPromise;
  let transaction = null;
  let art_sec = null;
  let art_woo_variation_id = null;
  const errors = {};

  try {
    // Validar que el producto padre exista y sea tipo 'variable'
    const parentResult = await pool.request()
      .input('parent_art_sec', sql.VarChar(30), parent_art_sec)
      .query(`
        SELECT art_sec, art_cod, art_nom, art_woo_id, art_woo_type, inv_sub_gru_cod
        FROM dbo.articulos
        WHERE art_sec = @parent_art_sec
      `);

    if (parentResult.recordset.length === 0) {
      throw new Error('El producto padre no existe');
    }

    const parentProduct = parentResult.recordset[0];

    if (parentProduct.art_woo_type !== 'variable') {
      throw new Error('El producto padre no es de tipo variable');
    }

    if (!parentProduct.art_woo_id) {
      throw new Error('El producto padre no tiene art_woo_id (no fue sincronizado a WooCommerce)');
    }

    // Validar atributos
    const { validateVariationAttributes, generateVariationSKU, skuExists } = require('../utils/variationUtils');

    if (!validateVariationAttributes(attributes)) {
      throw new Error('Atributos de variacion invalidos. Solo se permite "Tono" o "Color"');
    }

    // Generar SKU automatico (maximo 30 caracteres)
    const art_cod = generateVariationSKU(parentProduct.art_cod, attributes);

    // Verificar que el SKU no exista
    if (await skuExists(art_cod)) {
      throw new Error(`El SKU ${art_cod} ya existe en la base de datos`);
    }

    // Iniciar transaccion
    transaction = new sql.Transaction(pool);
    await transaction.begin();
    const request = new sql.Request(transaction);

    // 1. Generar art_sec usando dbo.secuencia (seguro para concurrencia)
    const secResult = await request.query(`
      SELECT sec_num + 1 AS NewArtSec
      FROM dbo.secuencia WITH (UPDLOCK, HOLDLOCK)
      WHERE sec_cod = 'ARTICULOS'
    `);
    art_sec = secResult.recordset[0].NewArtSec;

    await request
      .input('newSecNum', sql.Decimal(18, 0), art_sec)
      .query(`
        UPDATE dbo.secuencia
        SET sec_num = @newSecNum
        WHERE sec_cod = 'ARTICULOS'
      `);

    console.log('Nuevo art_sec para variacion:', art_sec);

    // 2. Insertar variacion en dbo.articulos
    // NOTA: Solo columnas que EXISTEN. inv_sub_gru_cod es SMALLINT. pre_sec es obligatorio.
    await request
      .input('art_sec', sql.VarChar(30), art_sec.toString())
      .input('art_cod', sql.VarChar(30), art_cod)
      .input('art_nom', sql.VarChar(100), art_nom)
      .input('parent_art_sec', sql.VarChar(30), parent_art_sec)
      .input('parent_woo_id', sql.Int, parentProduct.art_woo_id)
      .input('attributes_json', sql.NVarChar(sql.MAX), JSON.stringify(attributes))
      .input('subcategoria', sql.SmallInt, parentProduct.inv_sub_gru_cod)
      .query(`
        INSERT INTO dbo.articulos (
          art_sec, art_cod, art_nom, inv_sub_gru_cod, pre_sec,
          art_woo_type, art_sec_padre, art_parent_woo_id,
          art_variation_attributes
        )
        VALUES (
          @art_sec, @art_cod, @art_nom, @subcategoria, '1',
          'variation', @parent_art_sec, @parent_woo_id,
          @attributes_json
        )
      `);

    console.log('Variacion creada en BD con SKU:', art_cod);

    // 3. Insertar precios
    await request
      .input('artSecDetal', sql.VarChar(30), art_sec.toString())
      .input('precio_detal', sql.Decimal(17, 2), precio_detal)
      .query(`
        INSERT INTO dbo.articulosdetalle (art_sec, bod_sec, lis_pre_cod, art_bod_pre)
        VALUES (@artSecDetal, '1', 1, @precio_detal)
      `);

    await request
      .input('artSecMayor', sql.VarChar(30), art_sec.toString())
      .input('precio_mayor', sql.Decimal(17, 2), precio_mayor)
      .query(`
        INSERT INTO dbo.articulosdetalle (art_sec, bod_sec, lis_pre_cod, art_bod_pre)
        VALUES (@artSecMayor, '1', 2, @precio_mayor)
      `);

    // Commit de la transaccion local
    await transaction.commit();
    transaction = null;

    // 4. Subir imagenes a Cloudinary si se proporcionan
    let imageUrls = [];
    if (images && images.length > 0) {
      try {
        const uploadPromises = images.map((image, index) => {
          const base64Image = `data:${image.mimetype};base64,${image.data.toString('base64')}`;
          return cloudinary.uploader.upload(base64Image, {
            folder: 'productos_variaciones',
            public_id: `${art_cod}_${index + 1}`
          });
        });

        const uploadResults = await Promise.all(uploadPromises);
        imageUrls = uploadResults.map(result => result.secure_url);

        if (imageUrls.length > 0) {
          await pool.request()
            .input('imageUrl', sql.VarChar(1000), imageUrls[0])
            .input('artSecImage', sql.VarChar(30), art_sec.toString())
            .query(`
              UPDATE dbo.articulos
              SET art_url_img_servi = @imageUrl
              WHERE art_sec = @artSecImage
            `);
        }
      } catch (error) {
        errors.cloudinary = {
          message: 'Error al subir imagenes',
          details: error.message
        };
        console.error('Error al subir imagenes:', error);
      }
    }

    // 5. Crear variacion en WooCommerce
    try {
      const wooAttributes = Object.entries(attributes).map(([name, option]) => ({
        name: name,
        option: option
      }));

      const wooVariationData = {
        sku: art_cod,
        regular_price: precio_detal.toString(),
        manage_stock: true,
        stock_quantity: 0,
        attributes: wooAttributes,
        meta_data: [
          {
            key: "_precio_mayorista",
            value: precio_mayor.toString()
          }
        ],
        image: imageUrls.length > 0 ? { src: imageUrls[0] } : undefined
      };

      console.log('Creando variacion en WooCommerce:', JSON.stringify(wooVariationData, null, 2));

      const wooVariation = await wcApi.post(
        `products/${parentProduct.art_woo_id}/variations`,
        wooVariationData
      );

      art_woo_variation_id = wooVariation.data.id;

      console.log('Variacion creada en WooCommerce con ID:', art_woo_variation_id);

      // Actualizar art_woo_variation_id en la BD
      await pool.request()
        .input('variation_id', sql.Int, art_woo_variation_id)
        .input('artSecWoo', sql.VarChar(30), art_sec.toString())
        .query(`
          UPDATE dbo.articulos
          SET art_woo_variation_id = @variation_id
          WHERE art_sec = @artSecWoo
        `);

      // Registrar imagen en producto_fotos
      if (wooVariation.data.image && imageUrls.length > 0) {
        const photo = new ProductPhoto({
          id: uuidv4(),
          art_sec: art_sec.toString(),
          nombre: `${art_cod}_1`,
          url: wooVariation.data.image.src,
          tipo: images[0] ? images[0].mimetype : 'image/jpeg',
          tamanio: images[0] ? images[0].size : 0,
          fecha_creacion: new Date(),
          woo_photo_id: wooVariation.data.image.id.toString(),
          es_principal: true,
          posicion: 0,
          estado: 'woo'
        });
        await photo.save();
      }

    } catch (wooError) {
      errors.wooCommerce = {
        message: 'Error al crear variacion en WooCommerce',
        details: wooError.message,
        response: wooError.response?.data
      };
      console.error('Error en WooCommerce:', errors.wooCommerce);
    }

    return {
      success: true,
      data: {
        art_sec: art_sec.toString(),
        art_cod,
        art_nom,
        parent_art_sec,
        art_woo_variation_id,
        art_woo_type: 'variation',
        attributes,
        precio_detal,
        precio_mayor,
        images: imageUrls
      },
      errors: Object.keys(errors).length > 0 ? errors : undefined
    };

  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error("Error en rollback:", rollbackError);
      }
    }
    throw {
      success: false,
      message: 'Error al crear variacion',
      error: error.message
    };
  }
};
```

### 3.3. Actualizar exports del modelo

Al final de `models/articulosModel.js`, agregar al `module.exports`:

```javascript
module.exports = {
  // ... exports existentes
  getArticulos,
  validateArticulo,
  createArticulo,
  getArticulo,
  updateArticulo,
  getArticuloByArtCod,
  getNextArticuloCodigo,
  // Nuevos exports para productos variables
  createVariableProduct,
  createProductVariation,
};
```

---

## **PASO 4: Crear Controladores**

### 4.1. Controlador para Productos Variables

**Archivo:** `controllers/variableProductController.js`

```javascript
// controllers/variableProductController.js
const {
  createVariableProduct,
  createProductVariation
} = require('../models/articulosModel');
const { getProductVariations } = require('../utils/variationUtils');

/**
 * Crea un producto variable (padre)
 * POST /api/articulos/variable
 */
const createVariable = async (req, res) => {
  try {
    const {
      art_nom,
      art_cod,
      categoria,
      subcategoria,
      precio_detal_referencia,
      precio_mayor_referencia,
      attributes
    } = req.body;

    // Validaciones
    if (!art_nom || !art_cod || !subcategoria || !attributes) {
      return res.status(400).json({
        success: false,
        message: 'Faltan campos requeridos: art_nom, art_cod, subcategoria, attributes'
      });
    }

    // Obtener imagenes del request (si se suben)
    const images = req.files || [];

    const result = await createVariableProduct({
      art_nom,
      art_cod,
      categoria,
      subcategoria,
      precio_detal_referencia,
      precio_mayor_referencia,
      attributes,
      images
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Error en createVariable:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear producto variable',
      error: error.message || error.error
    });
  }
};

/**
 * Crea una variacion de un producto variable
 * POST /api/articulos/variable/:parent_art_sec/variations
 */
const createVariation = async (req, res) => {
  try {
    const { parent_art_sec } = req.params;
    const {
      art_nom,
      attributes,
      precio_detal,
      precio_mayor
    } = req.body;

    // Validaciones
    if (!parent_art_sec || !art_nom || !attributes || !precio_detal || !precio_mayor) {
      return res.status(400).json({
        success: false,
        message: 'Faltan campos requeridos: parent_art_sec, art_nom, attributes, precio_detal, precio_mayor'
      });
    }

    const images = req.files || [];

    const result = await createProductVariation({
      parent_art_sec,
      art_nom,
      attributes,
      precio_detal,
      precio_mayor,
      images
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Error en createVariation:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear variacion',
      error: error.message || error.error
    });
  }
};

/**
 * Obtiene todas las variaciones de un producto variable
 * GET /api/articulos/variable/:parent_art_sec/variations
 */
const getVariations = async (req, res) => {
  try {
    const { parent_art_sec } = req.params;

    if (!parent_art_sec) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere parent_art_sec'
      });
    }

    const variations = await getProductVariations(parent_art_sec);

    res.json({
      success: true,
      count: variations.length,
      data: variations
    });
  } catch (error) {
    console.error('Error en getVariations:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener variaciones',
      error: error.message
    });
  }
};

module.exports = {
  createVariable,
  createVariation,
  getVariations
};
```

---

## **PASO 5: Crear Rutas**

### 5.1. Rutas para Productos Variables

> NOTA: Se integran bajo `/api/articulos/variable` para mantener coherencia con las rutas existentes de articulos, en lugar de crear un prefijo separado `/api/products`.

**Archivo:** `routes/variableProductRoutes.js`

```javascript
// routes/variableProductRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const {
  createVariable,
  createVariation,
  getVariations
} = require('../controllers/variableProductController');
const verifyToken = require('../middlewares/auth');

// Configurar multer para subida de imagenes (mismo patron que articulosRoutes)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB max
});

/**
 * @route   POST /api/articulos/variable
 * @desc    Crear producto variable (padre)
 * @access  Private
 */
router.post(
  '/',
  verifyToken,
  upload.array('images', 5),
  createVariable
);

/**
 * @route   POST /api/articulos/variable/:parent_art_sec/variations
 * @desc    Crear variacion de un producto variable
 * @access  Private
 */
router.post(
  '/:parent_art_sec/variations',
  verifyToken,
  upload.array('images', 3),
  createVariation
);

/**
 * @route   GET /api/articulos/variable/:parent_art_sec/variations
 * @desc    Obtener todas las variaciones de un producto variable
 * @access  Private
 */
router.get(
  '/:parent_art_sec/variations',
  verifyToken,
  getVariations
);

module.exports = router;
```

### 5.2. Registrar Rutas en el Servidor Principal

**Archivo:** `index.js`

Agregar junto a las demas importaciones de rutas:

```javascript
// Importar rutas de productos variables
const variableProductRoutes = require('./routes/variableProductRoutes');

// Registrar rutas (ANTES de las rutas con parametros de articulosRoutes)
app.use('/api/articulos/variable', variableProductRoutes);
```

> IMPORTANTE: Registrar `/api/articulos/variable` ANTES de `/api/articulos` para que Express no confunda `/variable` con un `:id_articulo`.

---

## **PASO 6: Ajustes en Sincronizacion de Pedidos**

### 6.1. Modificar Busqueda de Promociones para Variaciones

**Archivo:** `jobs/syncWooOrders.js`

Modificar la funcion `getArticuloPromocionInfo` (lineas 120-197) para que cuando el articulo sea una variacion, busque promociones en el producto padre:

```javascript
// Funcion para obtener informacion de promociones de un articulo en una fecha especifica
// MODIFICADA: Si el articulo es una variacion, busca promociones en el padre
const getArticuloPromocionInfo = async (art_sec, fecha) => {
  const pool = await poolPromise;

  // Primero verificar si es una variacion para buscar promociones en el padre
  const artInfoResult = await pool.request()
    .input("art_sec_check", sql.VarChar(30), art_sec)
    .query(`
      SELECT art_woo_type, art_sec_padre
      FROM dbo.articulos
      WHERE art_sec = @art_sec_check
    `);

  let artSecParaPromo = art_sec;
  if (artInfoResult.recordset.length > 0) {
    const artInfo = artInfoResult.recordset[0];
    if (artInfo.art_woo_type === 'variation' && artInfo.art_sec_padre) {
      artSecParaPromo = artInfo.art_sec_padre;
      console.log(`[PROMOCION] Articulo ${art_sec} es variacion, buscando promociones en padre ${artSecParaPromo}`);
    }
  }

  // Consulta existente, usando artSecParaPromo para buscar promociones
  // pero manteniendo los precios base de la VARIACION (no del padre)
  const result = await pool.request()
    .input("art_sec", sql.VarChar(30), art_sec) // precios de la variacion
    .input("art_sec_promo", sql.VarChar(30), artSecParaPromo) // promociones del padre
    .input("fecha", sql.DateTime, fecha)
    .query(`
      SELECT
        a.art_sec,
        a.art_cod,
        a.art_nom,
        -- Precios base de la VARIACION (no del padre)
        ISNULL(ad1.art_bod_pre, 0) AS precio_detal_original,
        ISNULL(ad2.art_bod_pre, 0) AS precio_mayor_original,
        -- Informacion de promocion (puede venir del PADRE)
        pd.pro_det_precio_oferta,
        pd.pro_det_descuento_porcentaje,
        p.pro_fecha_inicio,
        p.pro_fecha_fin,
        p.pro_codigo AS codigo_promocion,
        p.pro_descripcion AS descripcion_promocion,
        -- Determinar si tiene oferta activa
        CASE
            WHEN p.pro_sec IS NOT NULL
                 AND ((pd.pro_det_precio_oferta IS NOT NULL AND pd.pro_det_precio_oferta > 0)
                      OR (pd.pro_det_descuento_porcentaje IS NOT NULL AND pd.pro_det_descuento_porcentaje > 0))
            THEN 'S'
            ELSE 'N'
        END AS tiene_oferta
      FROM dbo.articulos a
      LEFT JOIN dbo.articulosdetalle ad1 ON a.art_sec = ad1.art_sec AND ad1.lis_pre_cod = 1 AND ad1.bod_sec = '1'
      LEFT JOIN dbo.articulosdetalle ad2 ON a.art_sec = ad2.art_sec AND ad2.lis_pre_cod = 2 AND ad2.bod_sec = '1'
      -- Promociones: buscar en el art_sec del padre (o del mismo producto si es simple)
      LEFT JOIN dbo.promociones_detalle pd ON @art_sec_promo = pd.art_sec AND pd.pro_det_estado = 'A'
      LEFT JOIN dbo.promociones p ON pd.pro_sec = p.pro_sec
        AND p.pro_activa = 'S'
        AND @fecha BETWEEN p.pro_fecha_inicio AND p.pro_fecha_fin
      WHERE a.art_sec = @art_sec
    `);

  // Resto de la funcion permanece igual (lineas 158-197)
  if (result.recordset.length === 0) {
    return null;
  }

  const data = result.recordset[0];

  let precioFinalDetal = data.precio_detal_original;
  let precioFinalMayor = data.precio_mayor_original;

  if (data.tiene_oferta === 'S') {
    if (data.pro_det_precio_oferta && data.pro_det_precio_oferta > 0) {
      precioFinalDetal = data.pro_det_precio_oferta;
      precioFinalMayor = data.pro_det_precio_oferta;
    } else if (data.pro_det_descuento_porcentaje && data.pro_det_descuento_porcentaje > 0) {
      const factorDescuento = 1 - (data.pro_det_descuento_porcentaje / 100);
      precioFinalDetal = data.precio_detal_original * factorDescuento;
      precioFinalMayor = data.precio_mayor_original * factorDescuento;
    }
  }

  return {
    art_sec: data.art_sec,
    art_cod: data.art_cod,
    art_nom: data.art_nom,
    precio_detal_original: data.precio_detal_original,
    precio_mayor_original: data.precio_mayor_original,
    precio_detal: precioFinalDetal,
    precio_mayor: precioFinalMayor,
    precio_oferta: data.pro_det_precio_oferta,
    descuento_porcentaje: data.pro_det_descuento_porcentaje,
    pro_fecha_inicio: data.pro_fecha_inicio,
    pro_fecha_fin: data.pro_fecha_fin,
    codigo_promocion: data.codigo_promocion,
    descripcion_promocion: data.descripcion_promocion,
    tiene_oferta: data.tiene_oferta
  };
};
```

---

## **PASO 7: Testing y Validacion**

### 7.1. Script de Prueba

**Archivo:** `implementaciones_2026/test/test_variable_product.js`

```javascript
// implementaciones_2026/test/test_variable_product.js
const axios = require('axios');

const API_URL = 'http://localhost:3000/api';
let authToken = '';

const login = async () => {
  try {
    const response = await axios.post(`${API_URL}/auth/login`, {
      usu_cod: 'admin',    // Ajustar segun tus credenciales
      usu_pass: 'tu_password'
    });
    authToken = response.data.token;
    console.log('Login exitoso');
    return authToken;
  } catch (error) {
    console.error('Error en login:', error.response?.data || error.message);
    throw error;
  }
};

const createVariableProduct = async () => {
  try {
    const response = await axios.post(
      `${API_URL}/articulos/variable`,
      {
        art_nom: 'Labial Mate Professional TEST',
        art_cod: 'LABTEST01',  // OBLIGATORIO, max 30 chars
        categoria: '9',        // Ajustar segun tu BD (inv_gru_cod)
        subcategoria: '1',     // Ajustar segun tu BD (inv_sub_gru_cod SMALLINT)
        precio_detal_referencia: 45000,
        precio_mayor_referencia: 35000,
        attributes: [
          {
            name: 'Tono',
            options: ['Rojo Pasion', 'Rosa Nude', 'Ciruela Oscuro', 'Coral Brillante']
          }
        ]
      },
      {
        headers: { 'x-access-token': authToken }
      }
    );

    console.log('Producto variable creado:');
    console.log(JSON.stringify(response.data, null, 2));
    return response.data.data.art_sec;
  } catch (error) {
    console.error('Error creando producto variable:', error.response?.data || error.message);
    throw error;
  }
};

const createVariations = async (parentArtSec) => {
  const variaciones = [
    {
      art_nom: 'Labial Mate Professional TEST - Rojo Pasion',
      attributes: { Tono: 'Rojo Pasion' },
      precio_detal: 45000,
      precio_mayor: 35000
    },
    {
      art_nom: 'Labial Mate Professional TEST - Rosa Nude',
      attributes: { Tono: 'Rosa Nude' },
      precio_detal: 45000,
      precio_mayor: 35000
    }
  ];

  for (const variacion of variaciones) {
    try {
      const response = await axios.post(
        `${API_URL}/articulos/variable/${parentArtSec}/variations`,
        variacion,
        { headers: { 'x-access-token': authToken } }
      );

      console.log(`Variacion creada: ${variacion.attributes.Tono}`);
      console.log(`  SKU: ${response.data.data.art_cod}`);
      console.log(`  SKU length: ${response.data.data.art_cod.length}/30`);
    } catch (error) {
      console.error(`Error creando variacion ${variacion.attributes.Tono}:`,
        error.response?.data || error.message);
    }
  }
};

const getVariations = async (parentArtSec) => {
  try {
    const response = await axios.get(
      `${API_URL}/articulos/variable/${parentArtSec}/variations`,
      { headers: { 'x-access-token': authToken } }
    );

    console.log('Variaciones obtenidas:');
    console.log(JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('Error obteniendo variaciones:', error.response?.data || error.message);
  }
};

const runTests = async () => {
  console.log('='.repeat(60));
  console.log('PRUEBA: Creacion de Producto Variable con Variaciones');
  console.log('='.repeat(60));

  try {
    console.log('\nPASO 1: Autenticacion');
    await login();

    console.log('\nPASO 2: Crear Producto Variable (Padre)');
    const parentArtSec = await createVariableProduct();

    console.log('\nPASO 3: Crear Variaciones');
    await createVariations(parentArtSec);

    console.log('\nPASO 4: Obtener Variaciones Creadas');
    await getVariations(parentArtSec);

    console.log('\n' + '='.repeat(60));
    console.log('PRUEBA COMPLETADA');
    console.log('='.repeat(60));
  } catch (error) {
    console.error('\nPRUEBA FALLIDA');
  }
};

runTests();
```

---

## **PASO 8: Verificacion SQL**

### 8.1. Script de Verificacion

**Archivo:** `implementaciones_2026/sql/03_verificar_productos_creados.sql`

```sql
-- Verificar productos variables creados
SELECT
    'PRODUCTOS PADRES' AS tipo,
    COUNT(*) AS cantidad
FROM dbo.articulos
WHERE art_woo_type = 'variable'

UNION ALL

SELECT
    'VARIACIONES',
    COUNT(*)
FROM dbo.articulos
WHERE art_woo_type = 'variation';

-- Detalle de productos variables y sus variaciones
SELECT
    padre.art_sec AS padre_art_sec,
    padre.art_cod AS padre_codigo,
    padre.art_nom AS padre_nombre,
    padre.art_woo_id AS padre_woo_id,
    COUNT(hijo.art_sec) AS cantidad_variaciones
FROM dbo.articulos padre
LEFT JOIN dbo.articulos hijo
    ON padre.art_sec = hijo.art_sec_padre
    AND hijo.art_woo_type = 'variation'
WHERE padre.art_woo_type = 'variable'
GROUP BY padre.art_sec, padre.art_cod, padre.art_nom, padre.art_woo_id
ORDER BY padre.art_sec;

-- Detalle completo de una familia de productos
-- Cambiar el codigo segun necesidad
DECLARE @parent_code VARCHAR(30) = 'LABTEST01';

SELECT
    a.art_sec,
    a.art_cod,
    a.art_nom,
    a.art_woo_type,
    a.art_woo_id,
    a.art_woo_variation_id,
    a.art_sec_padre,
    a.art_variation_attributes,
    LEN(a.art_cod) AS sku_length,
    ad1.art_bod_pre AS precio_detal,
    ad2.art_bod_pre AS precio_mayor
FROM dbo.articulos a
LEFT JOIN dbo.articulosdetalle ad1
    ON a.art_sec = ad1.art_sec AND ad1.lis_pre_cod = 1 AND ad1.bod_sec = '1'
LEFT JOIN dbo.articulosdetalle ad2
    ON a.art_sec = ad2.art_sec AND ad2.lis_pre_cod = 2 AND ad2.bod_sec = '1'
WHERE a.art_cod = @parent_code
   OR a.art_sec_padre = (
       SELECT art_sec FROM dbo.articulos WHERE art_cod = @parent_code
   )
ORDER BY
    CASE WHEN a.art_woo_type = 'variable' THEN 0 ELSE 1 END,
    a.art_cod;
```

---

## CHECKLIST DE IMPLEMENTACION

### Fase 1: Base de Datos
- [ ] Hacer BACKUP de la base de datos
- [ ] Ejecutar `01_alter_articulos_variaciones.sql`
- [ ] Ejecutar `02_verificar_migracion.sql`
- [ ] Verificar que los 3 campos nuevos existan (`art_woo_type`, `art_parent_woo_id`, `art_variation_attributes`, `art_woo_variation_id`)
- [ ] Verificar que `art_sec_padre` y `art_variable` ya existian

### Fase 2: Backend
- [ ] Actualizar `utils/variationUtils.js` (CommonJS, tipos VARCHAR(30))
- [ ] Agregar funciones a `models/articulosModel.js` y actualizar exports
- [ ] Crear `controllers/variableProductController.js`
- [ ] Crear `routes/variableProductRoutes.js`
- [ ] Registrar rutas en `index.js` (ANTES de articulos para evitar conflictos)

### Fase 3: Ajustes en Sincronizacion
- [ ] Modificar `getArticuloPromocionInfo` en `jobs/syncWooOrders.js`

### Fase 4: Testing
- [ ] Ejecutar `test_variable_product.js`
- [ ] Verificar creacion en BD con SQL
- [ ] Verificar creacion en WooCommerce
- [ ] Verificar que SKUs no excedan 30 caracteres

### Fase 5: Validacion de Pedidos
- [ ] Crear pedido de prueba en WooCommerce con variacion
- [ ] Sincronizar pedido
- [ ] Verificar que la promocion del padre se aplique a la variacion

---

## CONSIDERACIONES IMPORTANTES

### 1. Backup de Base de Datos
```sql
BACKUP DATABASE [NombreDB]
TO DISK = 'C:\Backups\antes_variaciones_2026-02-06.bak'
WITH FORMAT, INIT, NAME = 'Full Backup Before Variations';
```

### 2. Entorno de Prueba
- Ejecutar PRIMERO en ambiente de desarrollo
- Validar completamente antes de pasar a produccion

### 3. Rollback Plan
Si algo sale mal:
```sql
-- Eliminar variaciones y productos variables de prueba
DELETE FROM dbo.articulosdetalle WHERE art_sec IN (
    SELECT art_sec FROM dbo.articulos WHERE art_woo_type IN ('variable', 'variation')
);

DELETE FROM dbo.producto_fotos WHERE art_sec IN (
    SELECT art_sec FROM dbo.articulos WHERE art_woo_type IN ('variable', 'variation')
);

DELETE FROM dbo.articulos WHERE art_woo_type IN ('variable', 'variation');

-- Eliminar SOLO las columnas nuevas (NO las existentes)
-- PRECAUCION: Ejecutar solo si es estrictamente necesario
ALTER TABLE dbo.articulos DROP CONSTRAINT IF EXISTS DF_articulos_art_woo_type;
ALTER TABLE dbo.articulos DROP COLUMN IF EXISTS art_woo_type;
ALTER TABLE dbo.articulos DROP COLUMN IF EXISTS art_parent_woo_id;
ALTER TABLE dbo.articulos DROP COLUMN IF EXISTS art_variation_attributes;
ALTER TABLE dbo.articulos DROP COLUMN IF EXISTS art_woo_variation_id;

-- NO ELIMINAR art_sec_padre ni art_variable (ya existian antes)
```

### 4. Tabla de Tipos de Datos Correctos (Referencia Rapida)

| Campo | Tipo Real en BD | Tipo en JS (mssql) |
|-------|----------------|-------------------|
| `art_sec` | VARCHAR(30) | `sql.VarChar(30)` |
| `art_cod` | VARCHAR(30) NOT NULL | `sql.VarChar(30)` |
| `art_nom` | VARCHAR(100) NOT NULL | `sql.VarChar(100)` |
| `inv_sub_gru_cod` | SMALLINT NOT NULL | `sql.SmallInt` |
| `pre_sec` | VARCHAR(16) NOT NULL | `sql.VarChar(16)` |
| `art_sec_padre` | VARCHAR(30) NULL | `sql.VarChar(30)` |
| `art_variable` | VARCHAR(1) NULL | `sql.VarChar(1)` |
| `art_woo_id` | INT NULL | `sql.Int` |
| `art_woo_type` | VARCHAR(20) NULL | `sql.VarChar(20)` |
| `art_parent_woo_id` | INT NULL | `sql.Int` |
| `art_variation_attributes` | NVARCHAR(MAX) NULL | `sql.NVarChar(sql.MAX)` |
| `art_woo_variation_id` | INT NULL | `sql.Int` |

---

## HISTORIAL DE CAMBIOS

| Version | Fecha | Cambios |
|---------|-------|---------|
| 1.0 | 2026-02-04 | Documento inicial |
| 2.0 | 2026-02-06 | Refinamiento completo: 9 bugs criticos corregidos, alineado con esquema real de BD |

### Resumen de Correcciones v2.0
1. `art_sec` VARCHAR(30) en lugar de DECIMAL(18,0)
2. `art_cod` obligatorio (NOT NULL), nunca NULL para padres
3. Eliminadas columnas inexistentes (`inv_gru_cod`, `art_est`) de INSERT statements
4. Agregado `pre_sec = '1'` obligatorio en INSERT
5. Reutilizados `art_sec_padre` y `art_variable` existentes
6. Generacion de `art_sec` via `dbo.secuencia` con UPDLOCK/HOLDLOCK
7. Convertido de ES Modules a CommonJS
8. Validacion de longitud de SKU (max 30 chars)
9. Tipo `inv_sub_gru_cod` corregido a SMALLINT
10. Agregado `bod_sec = '1'` en JOINs de articulosdetalle
11. Rutas bajo `/api/articulos/variable` (coherente con rutas existentes)
12. Multer con `memoryStorage()` (patron existente del proyecto)

---

**FIN DEL DOCUMENTO**
