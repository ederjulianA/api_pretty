# ✅ Correcciones de Campos de Base de Datos

**Fecha:** 2026-02-12
**Problema:** Uso de campos inexistentes en la tabla `articulos`

---

## 🔍 Campos Corregidos

### ❌ Campo que NO existe: `art_des`
- **Error:** Se intentaba usar `art_des` (descripción) que no existe en la tabla `articulos`
- **Corrección:** Eliminado de todas las consultas y referencias
- **Nota:** La tabla `articulos` solo tiene `art_nom` (nombre), no tiene campo de descripción

### ❌ Campo que NO existe: `art_est`
- **Error:** Se intentaba filtrar por `art_est = 'A'` para artículos activos
- **Corrección:** Eliminado el filtro (no existe campo de estado en la tabla)
- **Nota:** Si se necesita filtrar artículos activos, usar `art_actualizado` u otro criterio

---

## ✅ Estructura Real de la Tabla `articulos`

Según `EstructuraDatos/PS_ESTRUCTURA.sql`:

```sql
CREATE TABLE [dbo].[articulos](
    [art_sec] [varchar](30) NOT NULL,          -- PK
    [art_cod] [varchar](30) NOT NULL,          -- Código SKU
    [art_nom] [varchar](100) NOT NULL,         -- Nombre (NO hay art_des)
    [art_img] [varchar](200) NULL,
    [inv_sub_gru_cod] [smallint] NOT NULL,     -- FK a inventario_subgrupo
    [pre_sec] [varchar](16) NOT NULL,
    [art_actualizado] [varchar](1) NULL,        -- Flag de actualización
    [art_woo_id] [int] NULL,
    [art_sec_padre] [varchar](30) NULL,
    [art_variable] [varchar](1) NULL,
    [art_bundle] [char](1) NULL,
    -- ... otros campos
)
```

**Campos importantes:**
- ✅ `art_sec` - ID único
- ✅ `art_cod` - Código SKU
- ✅ `art_nom` - Nombre del producto
- ✅ `inv_sub_gru_cod` - Subcategoría (FK)
- ❌ `art_des` - **NO EXISTE**
- ❌ `art_est` - **NO EXISTE**

---

## 📝 Cambios Realizados

### 1. `models/articulosModel.js`
- ✅ Eliminado `a.art_des` de la consulta `getArticulo()`
- ✅ Agregado `g.inv_gru_nom` y `s.inv_sub_gru_nom` para obtener nombres de categorías

### 2. `controllers/aiController.js`
- ✅ Eliminado `art_des` del objeto `productoData`
- ✅ Corregida consulta en `batchOptimize()` para obtener precios desde `articulosdetalle`
- ✅ Corregida consulta para usar JOINs correctos con `inventario_grupo` e `inventario_subgrupo`
- ✅ Eliminado filtro `art_est = 'A'` (campo no existe)

### 3. `config/promptTemplates.js`
- ✅ Eliminado `{art_des}` de los templates de prompts
- ✅ Actualizada función `buildPrompt()` para no reemplazar `art_des`

---

## 🔄 Relaciones Correctas

### Para obtener categoría del producto:
```sql
SELECT 
  a.art_sec,
  a.art_nom,
  g.inv_gru_cod,        -- Código de categoría
  g.inv_gru_nom,        -- Nombre de categoría
  s.inv_sub_gru_cod,    -- Código de subcategoría
  s.inv_sub_gru_nom     -- Nombre de subcategoría
FROM dbo.articulos a
LEFT JOIN dbo.inventario_subgrupo s ON s.inv_sub_gru_cod = a.inv_sub_gru_cod
LEFT JOIN dbo.inventario_grupo g ON g.inv_gru_cod = s.inv_gru_cod
```

### Para obtener precios:
```sql
SELECT 
  a.art_sec,
  ISNULL(ad1.art_bod_pre, 0) AS precio_detal,  -- lis_pre_cod = 1
  ISNULL(ad2.art_bod_pre, 0) AS precio_mayor   -- lis_pre_cod = 2
FROM dbo.articulos a
LEFT JOIN dbo.articulosdetalle ad1 ON a.art_sec = ad1.art_sec AND ad1.lis_pre_cod = 1
LEFT JOIN dbo.articulosdetalle ad2 ON a.art_sec = ad2.art_sec AND ad2.lis_pre_cod = 2
```

---

## ✅ Verificación

Todos los campos ahora coinciden con la estructura real de la base de datos:
- ✅ `art_sec` - Usado correctamente
- ✅ `art_cod` - Usado correctamente
- ✅ `art_nom` - Usado correctamente
- ✅ `inv_sub_gru_cod` - Usado correctamente
- ✅ `inv_gru_cod` - Obtenido via JOIN con `inventario_grupo`
- ✅ `precio_detal` y `precio_mayor` - Obtenidos desde `articulosdetalle`
- ❌ `art_des` - Eliminado (no existe)
- ❌ `art_est` - Eliminado (no existe)

---

**Última actualización:** 2026-02-12
**Estado:** ✅ Todos los campos corregidos según estructura real de BD
