# Patrón de Sincronización: Variaciones en WooCommerce

**Documento crítico para futuras revisiones de sincronización**
**Fecha:** 2026-02-21
**Versión:** 1.0

---

## El Problema

Cuando sincronizas stock de variaciones con WooCommerce, necesitas:
1. El ID de la variación en WooCommerce (`art_woo_variation_id`)
2. El ID del producto padre en WooCommerce (`art_woo_id` del padre)

**PERO** las variaciones (productos hijos) NO tienen su propio `art_woo_id`.

---

## La Solución: Patrón de JOIN Correcto

### ❌ INCORRECTO

```sql
SELECT
  a.art_woo_id,
  a.art_woo_variation_id,
  a.art_parent_woo_id  -- ❌ PROBLEMA: Este campo es NULL o no existe
FROM dbo.articulos a
WHERE a.art_woo_type = 'variation'
```

**Por qué falla:**
- Las variaciones NO tienen un campo `art_parent_woo_id` con el ID del padre
- Este campo puede existir en algunas filas pero ser NULL
- No es confiable

### ✅ CORRECTO

```sql
SELECT
  a.art_woo_variation_id,
  padre.art_woo_id AS art_parent_woo_id,  -- ✅ El art_woo_id del PADRE
  a.art_sec_padre
FROM dbo.articulos a
LEFT JOIN dbo.articulos padre ON padre.art_sec = a.art_sec_padre
WHERE a.art_woo_type = 'variation'
```

**Por qué funciona:**
- Haces JOIN con el artículo padre usando `art_sec_padre`
- Obtienes el `art_woo_id` del padre (que SÍ tiene este ID)
- Lo renombras como `art_parent_woo_id` para claridad
- **Funciona siempre** porque el padre siempre tiene `art_woo_id`

---

## Aplicar a la API de WooCommerce

```javascript
// Datos de la variación (después del JOIN correcto)
const variation = {
  art_woo_variation_id: 505,  // ID de la variación
  art_parent_woo_id: 500      // ID del padre (via JOIN)
};

// Ruta correcta en WooCommerce API
const apiPath = `products/${variation.art_parent_woo_id}/variations/${variation.art_woo_variation_id}`;
// Resultado: products/500/variations/505

// Actualizar stock
await wcApi.put(apiPath, {
  stock_quantity: 25
});
```

---

## Archivos que Usan Este Patrón (Referencia)

### 1. ✅ `utils/wooStockSync.js` (CORRECTO desde 2026-02-21)

**Línea 119:**
```javascript
padre.art_woo_id AS art_parent_woo_id,
```

**Query completa:**
```sql
SELECT
  a.art_sec, a.art_cod, a.art_woo_id, a.art_woo_type,
  a.art_woo_variation_id,
  padre.art_woo_id AS art_parent_woo_id,
  ISNULL(e.existencia, 0) AS existencia
FROM dbo.facturakardes fk
INNER JOIN dbo.factura f ON f.fac_sec = fk.fac_sec
INNER JOIN dbo.articulos a ON a.art_sec = fk.art_sec
LEFT JOIN dbo.articulos padre ON padre.art_sec = a.art_sec_padre
LEFT JOIN dbo.vwExistencias e ON e.art_sec = a.art_sec
WHERE f.fac_nro = @fac_nro
```

### 2. ✅ `jobs/updateWooOrderStatusAndStock.js` (REFERENCIA)

**Línea 344:**
```javascript
SELECT a.art_woo_id, a.art_woo_type, a.art_woo_variation_id, a.art_sec_padre,
       p.art_woo_id AS parent_woo_id
FROM dbo.articulos a
LEFT JOIN dbo.articulos p ON a.art_sec_padre = p.art_sec
```

---

## Checklist para Nuevas Implementaciones

Cuando escribas código de sincronización que maneje variaciones:

- [ ] ¿Incluyo `LEFT JOIN dbo.articulos padre ON padre.art_sec = a.art_sec_padre`?
- [ ] ¿Obtengo el parent_woo_id via `padre.art_woo_id AS art_parent_woo_id`?
- [ ] ¿NO estoy usando `a.art_parent_woo_id` (podría ser NULL)?
- [ ] ¿Obtengo `a.art_woo_variation_id` (ID de la variación)?
- [ ] ¿Obtengo `a.art_woo_type` para detectar variaciones?
- [ ] ¿Para variaciones uso ruta `products/{parent_woo_id}/variations/{variation_id}`?
- [ ] ¿Para productos simples uso ruta `products/{art_woo_id}`?
- [ ] ¿Valido que parent_woo_id NO sea NULL antes de sincronizar?

---

## Ejemplos de Validación

### Verificar que las variaciones tienen IDs completos

```sql
SELECT
  art_sec, art_cod, art_woo_type,
  art_woo_variation_id,
  art_sec_padre,
  padre.art_woo_id AS parent_woo_id
FROM dbo.articulos a
LEFT JOIN dbo.articulos padre ON padre.art_sec = a.art_sec_padre
WHERE a.art_woo_type = 'variation'
  AND (a.art_woo_variation_id IS NULL OR padre.art_woo_id IS NULL)
-- Resultado: DEBE estar vacío (ninguna fila)
```

### Verificar que los padres tienen art_woo_id

```sql
SELECT
  art_sec, art_cod, art_woo_id, art_woo_type
FROM dbo.articulos
WHERE art_woo_type = 'variable'
  AND art_woo_id IS NULL
-- Resultado: DEBE estar vacío (ninguna fila)
```

---

## Historial de Cambios

| Fecha | Cambio | Archivos Afectados |
|-------|--------|-------------------|
| 2026-02-21 | Corrección critical: `padre.art_woo_id` en lugar de `padre.art_parent_woo_id` | `utils/wooStockSync.js` (línea 119, 297) |
| 2026-02-21 | Documentación del patrón correcto | Este archivo |

---

## Referencia Rápida (Copiar/Pegar)

```sql
-- Query base para sincronizar variaciones
SELECT
  a.art_sec,
  a.art_cod,
  a.art_woo_type,
  a.art_woo_variation_id,
  padre.art_woo_id AS art_parent_woo_id,
  ISNULL(e.existencia, 0) AS existencia
FROM dbo.articulos a
LEFT JOIN dbo.articulos padre ON padre.art_sec = a.art_sec_padre
LEFT JOIN dbo.vwExistencias e ON e.art_sec = a.art_sec
WHERE a.art_woo_type = 'variation'
```

```javascript
// Lógica de sincronización
if (article.art_woo_type === 'variation') {
  if (!article.art_woo_variation_id || !article.art_parent_woo_id) {
    // Skip - faltan IDs
    continue;
  }

  const apiPath = `products/${article.art_parent_woo_id}/variations/${article.art_woo_variation_id}`;
  await wcApi.put(apiPath, {
    stock_quantity: article.existencia
  });
}
```

