# Flujo de pruebas – Bundles

**Estado:** Endpoints de bundles OK → Siguiente: validar **facturación** y **regresión**.

---

## 1. Pruebas de facturación (Fase 3)

### 1.1 Orden con un ítem bundle

**Objetivo:** Que al facturar un bundle se expanda en kardex (1 línea padre + N líneas de componentes a $0).

**Pasos:**

1. Tener al menos un bundle creado y anotar su `art_sec` (ej: el que devolvió POST `/api/bundles`).
2. Crear una orden con ese bundle como único ítem:
   - **Endpoint:** `POST /api/order` (o el que uses para crear órdenes).
   - **Body de ejemplo:**
     ```json
     {
       "nit_sec": "<nit_sec_válido>",
       "fac_usu_cod_cre": "<usuario>",
       "fac_tip_cod": "VTA",
       "detalles": [
         {
           "art_sec": "<art_sec_del_bundle>",
           "kar_uni": 1,
           "kar_pre_pub": 50000,
           "kar_nat": "-"
         }
       ],
       "descuento": 0,
       "lis_pre_cod": 1
     }
     ```
3. Verificar respuesta 201 y anotar `fac_nro` (o `fac_sec`).

**Validación en BD:**

Ejecutar (reemplaza `FAC_SEC` por el de la orden creada):

```sql
SELECT
  fk.kar_sec,
  a.art_cod,
  a.art_nom,
  fk.kar_uni,
  fk.kar_pre_pub,
  fk.kar_total,
  fk.kar_bundle_padre,
  CASE WHEN fk.kar_bundle_padre IS NULL THEN 'Padre' ELSE 'Componente' END AS tipo
FROM dbo.facturakardes fk
INNER JOIN dbo.articulos a ON a.art_sec = fk.art_sec
WHERE fk.fac_sec = FAC_SEC
ORDER BY fk.kar_sec;
```

**Esperado:**

- Una línea **Padre**: `art_sec` = bundle, `kar_bundle_padre` = NULL, `kar_pre_pub` = precio del bundle.
- N líneas **Componente**: `kar_bundle_padre` = art_sec del bundle, `kar_pre_pub` = 0.
- El total de la factura debe coincidir con la suma de las líneas padre (las de componentes no suman).

---

### 1.2 Orden solo con artículos simples (regresión)

**Objetivo:** Confirmar que facturar sin bundles sigue igual.

**Pasos:**

1. Crear una orden con 1 o más ítems que **no** sean bundles (art_sec de productos normales).
2. Mismo endpoint y estructura de body que arriba, cambiando `art_sec` por artículos simples.

**Esperado:**

- 201, factura creada.
- En `facturakardes` solo líneas normales (una por ítem), todas con `kar_bundle_padre` NULL.

---

### 1.3 Orden mixta (simple + bundle)

**Objetivo:** Que en la misma factura convivan ítems normales y un bundle.

**Pasos:**

1. Body con dos ítems: uno con `art_sec` de artículo simple y otro con `art_sec` del bundle.
2. Crear la orden.

**Esperado:**

- 201.
- En kardex: líneas del artículo simple (kar_bundle_padre NULL) + 1 línea padre del bundle + N líneas de componentes del bundle (kar_pre_pub = 0, kar_bundle_padre = art_sec del bundle).

---

### 1.4 Stock insuficiente (bundle o componentes)

**Objetivo:** Que se rechace la orden **antes** de crear la factura si no hay stock.

**Pasos:**

1. Usar `POST /api/bundles/:art_sec/validar-stock` con `cantidad_bundle` mayor al stock (o asegurarse de que algún componente tenga menos stock del necesario).
2. Crear una orden con ese bundle y cantidad que requiera más stock del disponible.

**Esperado:**

- Respuesta 400 o 500 con mensaje claro tipo: *"Stock insuficiente para el bundle ..."* (o similar).
- No debe crearse factura (no debe haber nueva fila en `factura` para esa petición).

---

## 2. Resumen de checklist

| # | Prueba | Resultado |
|---|--------|-----------|
| 1 | Orden con ítem bundle → kardex con padre + componentes a $0 | ☐ |
| 2 | Orden solo artículos simples (regresión) | ☐ |
| 3 | Orden mixta (simple + bundle) | ☐ |
| 4 | Orden con bundle sin stock → rechazo sin crear factura | ☐ |

Cuando todas pasen, la **Fase 3 (Facturación)** queda validada.

---

## 3. Siguiente paso opcional: WooCommerce (Fase 4)

Si quieres que el bundle se vea en la tienda:

- Al crear/actualizar bundle desde la API, sincronizar a WooCommerce como producto **simple** con descripción HTML de componentes (y meta _es_bundle, etc.).
- Esto aún no está implementado en el flujo actual; si lo necesitas, se puede añadir en `bundleModel` o en un servicio de sync.

---

## 4. Queries útiles

**Bundles existentes:**

```sql
SELECT a.art_sec, a.art_cod, a.art_nom, COUNT(aa.ComArtSec) AS componentes
FROM dbo.articulos a
LEFT JOIN dbo.articulosArmado aa ON aa.art_sec = a.art_sec
WHERE a.art_bundle = 'S'
GROUP BY a.art_sec, a.art_cod, a.art_nom;
```

**Última factura creada (para revisar fac_sec):**

```sql
SELECT TOP 1 fac_sec, fac_nro, fac_fec, nit_sec
FROM dbo.factura
ORDER BY fac_sec DESC;
```
