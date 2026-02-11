# Plan de fases – Implementación Artículos Bundle

**Supuesto:** Los scripts de base de datos ya están ejecutados (`01_migracion_bundles.sql`).  
**Objetivo:** Implementar por fases y validar cada una antes de seguir.

---

## Orden de implementación

| Fase | Nombre | Objetivo | Entregable | Validación |
|------|--------|----------|------------|------------|
| **1** | Modelo Bundle | CRUD bundle + componentes y validación de stock | `models/bundleModel.js` | Crear/leer/actualizar bundles y validar stock vía código o pruebas manuales |
| **2** | API Bundles | Exponer endpoints REST | Controller, routes, registro en `index.js` | Postman/curl: POST/GET/PUT componentes, POST validar-stock |
| **3** | Facturación | Expandir bundles en órdenes y validar stock antes de facturar | Cambios en `orderModel.js` y `orderController.js` | Crear orden con ítem bundle y verificar kardex (padre + componentes con precio 0) |
| **4** | WooCommerce | Sincronizar bundle a WooCommerce como producto simple | Lógica en bundleModel o servicio WooCommerce | Bundle visible en WooCommerce con descripción de componentes |
| **5** | Pruebas y cierre | Regresión y casos borde | Checklist y ajustes finales | Órdenes mixtas, stock insuficiente, productos simples sin cambios |

---

## Fase 1 – Modelo Bundle (primera implementación)

**Archivo nuevo:** `models/bundleModel.js` (CommonJS, mismo estilo que otros models que usan `require`/`module.exports`).

**Funciones a implementar:**

1. **createBundle(** `{ art_nom, art_cod, inv_sub_gru_cod, precio_detal, precio_mayor, componentes: [{ art_sec, cantidad }] }` **)**  
   - Obtener siguiente `art_sec` de `dbo.secuencia` (sec_cod = 'ARTICULOS').  
   - INSERT en `articulos` (incluir `art_bundle = 'S'`).  
   - INSERT en `articulosdetalle` (lis_pre_cod 1 y 2).  
   - INSERT en `articulosArmado` (art_sec, ComArtSec, ConKarUni).  
   - Usar transacción; en caso de error, rollback.  
   - No llamar aún a WooCommerce (Fase 4).

2. **getBundleComponents(art_sec)**  
   - SELECT de `articulosArmado` + datos de articulos y existencias (vwExistencias) para el bundle y sus componentes.  
   - Devolver bundle (art_sec, art_cod, art_nom, precios, stock) y lista de componentes (art_sec, art_cod, art_nom, cantidad, stock).

3. **updateBundleComponents(art_sec, componentes)**  
   - Borrar filas de `articulosArmado` donde art_sec = @art_sec.  
   - Insertar nuevas filas con los componentes recibidos.  
   - Validar que el artículo sea bundle (art_bundle = 'S').

4. **validateBundleStock(art_sec, cantidad_bundle)**  
   - Stock del bundle (vwExistencias).  
   - Para cada componente: stock necesario = ConKarUni * cantidad_bundle.  
   - Devolver objeto tipo `{ puede_vender, detalles: [{ art_sec, art_nom, cantidad_necesaria, stock_disponible, cumple, faltante? }] }`.  
   - Lanzar error o marcar puede_vender=false si falta stock.

**Validación Fase 1:**  
- Desde Node (script o test) o desde un endpoint temporal: crear un bundle, leer componentes, actualizar componentes, validar stock con cantidad que cumpla y que no cumpla.  
- Revisar en BD: `articulos.art_bundle = 'S'`, filas en `articulosArmado` y `articulosdetalle`.

---

## Fase 2 – API Bundles

**Archivos:**  
- `controllers/bundleController.js`  
- `routes/bundleRoutes.js`  
- `index.js` (registrar rutas).

**Endpoints:**

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/bundles` | Crear bundle (body: art_nom, art_cod, categoria/subcategoria o inv_sub_gru_cod, precio_detal, precio_mayor, componentes). |
| GET | `/api/bundles/:art_sec/componentes` | Listar bundle + componentes (usar getBundleComponents). |
| PUT | `/api/bundles/:art_sec/componentes` | Actualizar componentes (body: componentes). |
| POST | `/api/bundles/:art_sec/validar-stock` | Validar stock (body: cantidad_bundle). |

**Validación Fase 2:**  
- Postman/curl para cada endpoint.  
- Comprobar códigos HTTP y cuerpos de respuesta según documentación existente (README/IMPLEMENTACION_ARTICULOS_BUNDLE.md).

---

## Fase 3 – Facturación (integración con órdenes)

**Archivos a modificar:**  
- `models/orderModel.js` (ES Modules).  
- `controllers/orderController.js`.

**Cambios:**

1. **orderModel.js**  
   - Añadir función **expandirBundles(detalles)** (async):  
     - Por cada ítem: si `articulos.art_bundle = 'S'`, agregar una línea “padre” (igual al ítem, kar_bundle_padre = null) y N líneas de componentes desde `articulosArmado` (kar_uni = cantidad_ítem * ConKarUni, kar_pre_pub = 0, kar_bundle_padre = art_sec del bundle).  
     - Los componentes deben incluir los 7 campos promocionales en 0/NULL según doc.  
   - En **createCompleteOrder**, antes del `for (const detalle of detalles)`:  
     - `detallesExpandidos = await expandirBundles(detalles)`.  
     - Usar `detallesExpandidos` en el loop.  
   - En el INSERT a `facturakardes`, añadir columna y parámetro **kar_bundle_padre** (valor del detalle, null para no-componentes).  
   - Mantener `new sql.Request(transaction)` para cada operación y no usar `pool.request()` dentro de la transacción.

2. **orderController.js**  
   - Antes de llamar a `createCompleteOrder`: llamar a **validarBundles(detalles)**.  
   - validarBundles: para cada detalle con art_bundle = 'S', validar stock del bundle y de componentes (misma lógica que validateBundleStock). Si algo falla, lanzar error con mensaje claro (ej. “Stock insuficiente de componentes para bundle X: …”).

**Validación Fase 3:**  
- Crear orden con un ítem que sea bundle.  
- Consultar `facturakardes` para esa factura: una línea con kar_bundle_padre NULL y precio, N líneas con kar_bundle_padre = art_sec del bundle y kar_pre_pub = 0.  
- Probar orden solo con artículos simples (regresión).  
- Probar orden mixta (simple + bundle).  
- Probar con stock insuficiente de componentes y verificar que se rechace antes de crear la factura.

---

## Fase 4 – WooCommerce

- Al crear o actualizar bundle (desde API o flujo interno), llamar a función que cree/actualice producto en WooCommerce:  
  - **type: 'simple'** (nunca 'bundle').  
  - Descripción HTML con lista de componentes (según IMPLEMENTACION_ARTICULOS_BUNDLE.md).  
  - Meta: _es_bundle, _precio_mayorista, _bundle_componentes_json (o equivalente).  
- Reutilizar cliente WooCommerce existente (config/URL/credenciales).  
- No modificar `jobs/syncWooOrders.js` ni `updateWooOrderStatusAndStock.js` para esta fase (bundles se tratan como productos simples en órdenes WooCommerce).

**Validación Fase 4:**  
- Crear/actualizar bundle desde API y comprobar en WooCommerce que el producto sea simple, con descripción y meta correctas.

---

## Fase 5 – Pruebas y cierre

- **Regresión:** Órdenes solo simples, solo variables, mixtas con y sin bundle.  
- **Stock:** Validar que no se pueda facturar bundle si falta stock del bundle o de algún componente.  
- **Kardex:** Verificar totales y que solo las líneas “padre” sumen al total.  
- **Documentación:** Dejar referenciado MODELO_DATOS_REFERENCIA.md y este plan en README o LEEME_PRIMERO.

---

## Orden recomendado de validación por fase

1. **Fase 1:** Implementar `bundleModel.js` → ejecutar pruebas (crear/leer/actualizar/validar stock) → validar en BD.  
2. **Fase 2:** Implementar controller + routes + registro → probar todos los endpoints.  
3. **Fase 3:** Implementar expandirBundles y validarBundles → probar creación de orden con bundle y revisar kardex.  
4. **Fase 4:** Integrar sync WooCommerce en flujo de bundles → comprobar en tienda.  
5. **Fase 5:** Ejecutar checklist de regresión y ajustar si hace falta.

Cada fase se considera cerrada cuando la validación indicada pasa y no se rompe lo existente (productos simples, variables, facturación actual).
