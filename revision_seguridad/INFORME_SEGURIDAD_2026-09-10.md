# Informe de Seguridad — Revisión completa de la API

**Fecha:** 2026-09-10
**Alcance:** `api_pretty` (backend) — revisión de código estático, sin ejecutar contra producción
**Base:** valida y amplía `revision_seguridad/INFORME_ENDPOINTS_SIN_AUTH.md` (2026-08-13)
**Método:** enumeración de las 41 rutas de `/routes`, lectura de middlewares/controladores implicados, `npm audit`

---

## 1. Resumen ejecutivo

El informe de agosto se enfocó en **un** problema: endpoints sin `verifyToken`. Esa remediación avanzó parcialmente (Grupo A aplicado, 12 rutas). Pero la revisión completa muestra que **la falta de `verifyToken` no es el problema más grave de la API**.

Hay tres fallas que permiten comprometer el sistema incluso con la autenticación funcionando al 100 %:

1. **Cualquier usuario autenticado puede cambiar la contraseña del administrador** (`change-password-admin` no valida rol).
2. **No existe autorización en el backend.** El RBAC de `dbo.RolesPermisos` solo alimenta la UI. Cualquier token válido abre toda la API.
3. **Se pueden crear facturas sin token y con el precio decidido por el cliente** — descuenta inventario real y sincroniza a WooCommerce.

| Severidad | Hallazgos |
|---|---|
| 🔴 Crítica | 3 |
| 🟠 Alta | 5 |
| 🟡 Media | 7 |
| 🔵 Baja | 4 |

---

## 2. Validación del informe anterior (2026-08-13)

### ✅ Grupo A — Aplicado y verificado

Las 12 rutas del Grupo A tienen hoy `verifyToken`. Confirmado línea por línea:

| Endpoint | Ubicación actual | Estado |
|---|---|---|
| `POST /api/promociones/` | `routes/promocionRoutes.js:17` | ✅ |
| `PUT /api/promociones/:pro_sec` | `routes/promocionRoutes.js:18` | ✅ |
| `PUT /api/updateWooStock/:art_cod` | `routes/updateWooStockRoutes.js:9` | ✅ |
| `POST/GET/PUT /api/inventory/adjustment` | `routes/inventoryRoutes.js:12-14` | ✅ |
| `POST/GET/PUT /api/bundles/*` (4) | `routes/bundleRoutes.js:11-14` | ✅ |
| `GET /api/proveedor/:nit_ide`, `GET /api/proveedores` | `routes/proveedorRoutes.js:7-8` | ✅ |

### ❌ Grupo B — Nada aplicado (13 grupos de endpoints)

**Ninguno** de los endpoints del Grupo B fue protegido. Todos siguen abiertos:
`POST /api/order/`, `PUT /api/order/:fac_nro`, `POST /api/order/anular`, `POST /api/nits/`, los 6 de `productPhotoRoutes.js`, `POST /api/woo/sync-article-image/:art_cod`, `POST /api/woo/sync`, `POST /api/documento-inventario`, `GET /api/ciudades/`, `GET /api/categorias/`, los 9 de `inventarioConteo.js`, `GET /api/kardex/:art_cod`.

Esto es esperable: el informe condicionaba el Grupo B a que el frontend corrigiera sus llamadas primero. **Lo que falta es confirmar si esa coordinación con frontend llegó a ocurrir.** Si no ha ocurrido en un mes, el bloqueo hay que escalarlo — ver §5.

### ❌ Grupo C — Nada aplicado, incluido el que se marcó como "riesgo cero"

El informe recomendaba proteger `POST /api/woo/sync-weight-dimensions` de inmediato por no tener consumidor. Sigue sin `verifyToken` en `routes/woo.js:132`. Igual el resto del Grupo C (confirmOrder, sincronizar-precios, diagnostic, sales, syncOrders, testSync, audit/fix-categories, subcategorias/old).

### ⚠️ El informe subcontó: hay endpoints abiertos que no listó

Conteo actual verificado: **53 endpoints sin autenticación** (54 rutas sin middleware, menos `POST /api/auth/login` que debe ser público). El informe reportaba 60 y se corrigieron 12 — la aritmética no cuadra porque estos nunca se listaron:

| Endpoint | Ubicación | Por qué importa |
|---|---|---|
| `GET /api/order/` | `routes/orderRoutes.js:12` | Listado completo de facturas con datos de cliente |
| `GET /api/order/:fac_nro` | `routes/orderRoutes.js:10` | Detalle de cualquier factura por número |
| `GET /api/nits/` | `routes/nitsRoutes.js:10` | **Base completa de clientes con PII** (ver 🟠-4) |
| `GET /api/inventory-comparison` | `routes/inventoryComparisonRoutes.js:7` | Inventario completo local vs. Woo |
| `GET /api/inventory-differences/differences` | `routes/inventoryDifferenceRoutes.js:6` | Ídem |
| `POST /api/woo/sync-orders` | `routes/syncWooOrdersRoutes.js:6` | Dispara importación masiva de pedidos |
| `GET /api/promociones/`, `GET /api/promociones/:pro_sec` | `routes/promocionRoutes.js:19-20` | Estrategia comercial y márgenes |
| `GET /api/promociones/:pro_sec/articulos-sincronizacion` | `routes/promocionRoutes.js:25` | Ídem |

**Corrección de metodología:** el informe anterior clasificó por "¿lo llama el frontend?". Eso encuentra endpoints de escritura, pero pasa por alto los `GET` de lectura masiva, que son precisamente los que causan fuga de datos.

---

## 3. Hallazgos nuevos

### 🔴 CRÍTICO-1 — Escalada a administrador vía `change-password-admin`

**Ubicación:** `controllers/authController.js:236` (`changePasswordAdmin`), expuesto en `routes/authRoutes.js:16`

El endpoint tiene `verifyToken`, pero **nunca comprueba que quien llama sea administrador**. Toma `usu_cod` del body y reescribe la contraseña de ese usuario sin pedir la contraseña actual:

```js
const changePasswordAdmin = async (req, res) => {
    const { usu_cod, newPassword } = req.body;   // usu_cod viene del CLIENTE
    // ...no hay comparación contra req.user, ni consulta de rol...
    UPDATE dbo.Usuarios SET usu_pass = @usu_pass WHERE usu_cod = @usu_cod
```

**Explotación:** cualquier usuario con el rol más bajo (un cajero del POS) hace login, obtiene su token, y llama:

```
POST /api/auth/change-password-admin
x-access-token: <token de cajero>
{ "usu_cod": "admin", "newPassword": "Nuevo123." }
```

Ahora controla la cuenta de administrador. Es toma de control total del ERP.

**Corrección:** exigir rol administrador antes de ejecutar (ver §4, middleware `requirePermission`). Adicionalmente, no permitir que el endpoint apunte al propio `usu_cod` del llamante (para eso está `change-password`).

---

### 🔴 CRÍTICO-2 — No existe autorización en el backend (RBAC solo cosmético)

**Ubicación:** transversal — `middlewares/auth.js`, `middlewares/authMiddleware.js`, todos los controladores

Grep sobre `controllers/`, `routes/`, `models/` y `utils/`: **cero** ocurrencias de verificación de rol o permiso (`req.user.rol`, `checkPermission`, `requireRole`, `hasPermission`). `req.user` aparece 14 veces y **todas** son para escribir el nombre de usuario en un campo de auditoría — ninguna para decidir acceso.

Las tablas `dbo.RolesPermisos` y `dbo.RolesPermisosAcciones` solo se leen en `authController.loginUser` para devolver el JSON `permisos` que el frontend usa para pintar u ocultar botones. **La API no lo consulta jamás.**

Consecuencia: `verifyToken` responde "¿este token es válido?", nunca "¿este usuario puede hacer esto?". Un token de cualquier empleado abre:

- `POST/PUT /api/users` — crear usuarios y modificar cualquier cuenta
- `POST/PUT/DELETE /api/roles/:id` — crear y borrar roles
- `PUT /api/parametros/:par_cod` — alterar parámetros de negocio (comisiones, pedido mínimo)
- `POST /api/cierre-mes`, `POST /api/cierre-mes/:cie_sec/anular` — cerrar y reabrir períodos contables
- `POST /api/compras`, `POST /api/carga-costos/aplicar` — costos e inventario valorizado
- `GET /api/reportes/rentabilidad`, `GET /api/dashboard/ventas/*`, `GET /api/auditoria/facturas/*` — márgenes, costos y utilidades de todo el negocio

Es el caso de libro de **A01:2021 Broken Access Control**: autorización implementada en el cliente.

---

### 🔴 CRÍTICO-3 — Facturación sin token y con precio controlado por el cliente

**Ubicación:** `routes/orderRoutes.js:9,14,15` + `models/orderModel.js:408`

Dos fallas que se combinan:

**(a) Sin autenticación.** `POST /api/order/`, `PUT /api/order/:fac_nro` y `POST /api/order/anular` no tienen middleware. Además `orderRoutes` está montado dos veces en `index.js` (`/api/order` y `/api/ordenes`), así que hay dos rutas por cada uno.

**(b) El precio lo pone el cliente.** El modelo inserta `kar_pre_pub` tal cual llega del body, sin contrastarlo con `articulosdetalle` ni con las promociones vigentes:

```js
.input('kar_pre_pub', sql.Decimal(17, 2), detail.kar_pre_pub)   // orderModel.js:408
```

Los precios reales solo se consultan para *rellenar* `kar_pre_pub_detal`/`kar_pre_pub_mayor` (columnas informativas), nunca para validar. El total se calcula sobre el precio enviado: `kar_total = kar_uni * detail.kar_pre_pub` (`orderModel.js:368`).

**Explotación, sin credenciales:**
```
POST /api/order/
{ "nit_sec": "1", "fac_tip_cod": "VTA",
  "detalles": [{ "art_sec": "...", "kar_uni": 100, "kar_pre_pub": 1 }] }
```
Se emite una factura real, se descuenta inventario en el kardex, y `syncDocumentStockToWoo()` propaga la baja de stock a la tienda. `POST /api/order/anular` permite después anular facturas legítimas ajenas.

**Corrección:** `verifyToken` + `requirePermission` en las tres rutas, y **recalcular el precio en el servidor** desde `articulosdetalle`/`promociones` — el body solo debería aportar `art_sec`, `kar_uni` y `kar_lis_pre_cod`. Si el negocio necesita precios manuales, que sea un campo explícito de descuento sujeto a permiso y auditado.

---

### 🟠 ALTA-4 — Fuga de datos personales de clientes sin autenticación

**Ubicación:** `routes/nitsRoutes.js:10` → `models/nitModel.js:76`

`GET /api/nits/` devuelve, sin token, paginado y con filtro por nombre o cédula:

`nit_ide` (identificación), `nit_nom`, `nit_tel`, `nit_email`, `nit_dir`, `nit_bar`, `nit_ciudad`, `nit_con_pag`, `nit_fec_cre`

Un `GET /api/nits/?PageSize=99999` extrae la base completa de clientes. Se refuerza con `GET /api/sales/` y `GET /api/order/`, que cruzan factura + cliente (`salesModel.js` hace `INNER JOIN dbo.nit`).

**Riesgo legal:** son datos personales bajo la Ley 1581 de 2012 (habeas data). Una extracción de este tipo es un incidente reportable a la SIC, más allá del daño competitivo.

---

### 🟠 ALTA-5 — La pista de auditoría es falsificable

**Ubicación:** `controllers/cargaCostosController.js:162, 430, 596, 1005, 1244` y `controllers/orderController.js:101`

El body tiene **precedencia sobre el token** al resolver quién ejecutó la acción:

```js
const usuario = req.body.usu_cod || req.user?.usu_cod || 'SYSTEM';
```

Cualquier usuario autenticado puede firmar aprobaciones de costo a nombre de otro simplemente incluyendo `usu_cod` en el body. Igual en la creación de órdenes, donde `fac_usu_cod_cre` se toma del body (`orderController.js:101`) — y ese endpoint ni siquiera pide token.

Esto rompe el no repudio justo en los flujos financieros donde más importa: aprobación de costos y emisión de facturas.

**Corrección:** invertir la precedencia a `req.user?.usu_cod` como única fuente, y eliminar `usu_cod`/`fac_usu_cod_cre` de los contratos de entrada.

---

### 🟠 ALTA-6 — CORS completamente abierto

**Ubicación:** `index.js:63` — `app.use(cors());`

Sin opciones, `cors()` emite `Access-Control-Allow-Origin: *`. Cualquier sitio web puede hacer peticiones a la API desde el navegador de un empleado.

Como la autenticación va por header `x-access-token` (no cookies), no hay CSRF clásico sobre los endpoints protegidos. **Pero para los 53 endpoints sin auth el CSRF es irrelevante**: funcionan directo. Basta con que un empleado en la red donde vive la API abra una página maliciosa para que esa página cree facturas, anule documentos, borre fotos de productos o dispare sincronizaciones masivas.

**Corrección:** `cors({ origin: [<dominios del frontend>], credentials: false })` desde variable de entorno.

---

### 🟠 ALTA-7 — Login sin rate limiting ni bloqueo de cuenta

**Ubicación:** `routes/authRoutes.js:9` → `controllers/authController.js:8`

No hay `express-rate-limit` (ni ninguna dependencia equivalente en `package.json`). `POST /api/auth/login` acepta intentos ilimitados: fuerza bruta contra contraseñas de usuarios, sin bloqueo tras N fallos y sin registro de intentos fallidos.

Efecto secundario: cada intento cuesta un round-trip a SQL Server más un `bcrypt.compare` (deliberadamente costoso en CPU). Unas pocas decenas de peticiones concurrentes bastan para degradar el servidor. DoS barato.

**Corrección:** `express-rate-limit` en `/api/auth/login` (p. ej. 5 intentos / 15 min por IP + usuario), contador de fallos en `dbo.Usuarios` con bloqueo temporal, y log de fallos hacia Winston/Loki.

---

### 🟠 ALTA-8 — Endpoints de sincronización masiva abiertos (DoS sobre la tienda)

Sin token, cualquiera puede disparar jobs pesados en bucle:

| Endpoint | Ubicación | Efecto |
|---|---|---|
| `POST /api/woo/sync` | `routes/wooSyncRoutes.js:21` | Sincroniza el catálogo completo a WooCommerce |
| `POST /api/woo/sync-orders` | `routes/syncWooOrdersRoutes.js:6` | Importación masiva de pedidos |
| `POST /api/woo/update-article-images` | `routes/woo.js:19` | Descarga masiva de imágenes |
| `POST /api/woo/sync-weight-dimensions` | `routes/woo.js:132` | Sube peso/dimensiones de 844 productos |
| `POST /api/woo/fix-all-categories` | `routes/wooSyncRoutes.js:46` | Reescribe categorías de todos los productos |
| `POST /api/promociones/sincronizar-multiples` | `routes/promocionRoutes.js:24` | **Reescribe precios en la tienda** |
| `POST /api/test/test-sync` | `routes/testSyncRoutes.js:8` | Job de stock |
| `GET /api/syncOrders/` | `routes/syncOrdersRoutes.js:7` | Job de órdenes |

Repetir cualquiera de estos agota la cuota de la REST API de WooCommerce y puede tumbar la tienda. `sincronizar-multiples` y `fix-all-categories` además **modifican datos de producción de la tienda** — precios y categorías — sin ninguna credencial.

---

### 🟡 MEDIA-9 — Sin revocación de tokens; cambios de rol o contraseña no invalidan sesiones

Token HS256 de 24 h, sin lista de revocación, sin refresh token, sin `jti`, sin `iss`/`aud`. El payload lleva `rol_id`/`rol_nombre` congelados al momento del login.

Consecuencias:
- Un empleado despedido conserva acceso hasta 24 h después.
- Bajar el rol de un usuario no surte efecto hasta que expire su token.
- Cambiar la contraseña (propia o vía CRÍTICO-1) no cierra las sesiones existentes.

---

### 🟡 MEDIA-10 — 207 respuestas devuelven `error.message` al cliente

Patrón repetido en 207 puntos de `controllers/` y `routes/`:

```js
res.status(500).json({ success: false, error: error.message });
```

Filtra mensajes del driver `mssql` (nombres de tablas y columnas, violaciones de constraint), errores de la API de WooCommerce y rutas internas. Le entrega a un atacante el mapa del esquema gratis, y en endpoints sin auth es accesible para cualquiera.

**Corrección:** un middleware de manejo de errores centralizado que registre el detalle en Winston y devuelva un mensaje genérico + un `requestId` correlacionable.

---

### 🟡 MEDIA-11 — Inyección SQL en `aiController.batchOptimize`

**Ubicación:** `controllers/aiController.js:288`

```js
const { categoria, subcategoria, limit = 50, modelo } = req.body;
let query = `SELECT TOP ${limit} ...`;   // limit sin parseInt ni validación
```

`limit` viene del body sin sanear e interpolado directo. `{"limit": "1 art_sec FROM articulos; DROP TABLE ..."}` cierra el statement.

Hoy la ruta está comentada en `index.js:24`, así que **no es explotable en producción ahora mismo** — pero el código está en el repo y se reactivará. Corregir antes de descomentar.

*Contraste:* `models/aiOptimizationModel.js:314` hace lo mismo pero con `parseInt()` — seguro. Y `rentabilidadModel.js:102,156` y `ventasKpiModel.js:173` interpolan solo valores de listas blancas internas — también seguros. El resto del proyecto usa parametrización correctamente; esta es la única excepción real encontrada.

---

### 🟡 MEDIA-12 — Subida de archivos sin autenticación

**Ubicación:** `routes/productPhotoRoutes.js:10` → `controllers/productPhotoController.js:44-57`

`POST /api/productos/:productId/fotos/temp` no pide token. El controlador valida lista blanca de mimetypes y 5 MB, pero:

- El mimetype lo declara el cliente (`file.mimetype`) — es falsificable; no se inspeccionan los magic bytes.
- `express-fileupload` está configurado con `fileSize: 50 * 1024 * 1024` (`index.js:66`), así que **acepta y bufferiza 50 MB en memoria** antes de que el controlador rechace por los 5 MB.

Permite abusar de la cuota de Cloudinary, alojar contenido arbitrario bajo un dominio de la empresa, y consumir memoria del proceso con subidas de 50 MB repetidas.

Los otros 5 endpoints de la galería (borrar foto, marcar principal, reordenar, sync a Woo) también están abiertos: cualquiera puede borrar las imágenes del catálogo.

---

### 🟡 MEDIA-13 — 38 vulnerabilidades en dependencias (4 críticas, 25 altas)

`npm audit --omit=dev`:

| Paquete | Severidad | Nota |
|---|---|---|
| `axios` | Alta | SSRF, prototype pollution, fuga de credenciales en redirects. Usado en toda la integración WooCommerce |
| `xlsx` | Alta | Prototype Pollution + ReDoS, **sin fix en npm**. Usado en `POST /api/carga-costos/importar`, que procesa Excel subido por el usuario |
| `ws` | Alta | Divulgación de memoria no inicializada |
| `validator` | Alta | Bypass de validación de URL |
| `tmp` | Alta | Path traversal |
| `uuid` (vía `exceljs`) | Media | Fix requiere downgrade de `exceljs` (breaking) |

`npm audit fix` resuelve la mayoría sin romper. `xlsx` no tiene fix en el registro npm — hay que migrar a `exceljs` (ya está en el proyecto) o instalar SheetJS desde su CDN oficial. Prioritario porque `xlsx` parsea archivos que suben los usuarios.

---

### 🟡 MEDIA-14 — Diagnóstico y logs de sync abiertos

`GET /api/diagnostic/product/:sku` y los otros 3 de `diagnosticRoutes.js` devuelven la respuesta cruda de WooCommerce para cualquier SKU, y en error retornan `error.message` de la API de Woo. `GET /api/test/sync-logs` y `/sync-logs/:id` (`testSyncRoutes.js:144,248`) exponen el historial de sincronización con los payloads. Sin token.

---

### 🟡 MEDIA-15 — Fuga de costos y márgenes sin autenticación

`GET /api/kardex/:art_cod` (`routes/kardexRoutes.js:7`) devuelve el kardex completo de cualquier artículo. `GET /api/inventory-comparison` y `GET /api/inventory-differences/differences` devuelven el inventario completo. `GET /api/promociones/*` expone la estructura de ofertas. Un competidor reconstruye la estructura de costos, rotación y márgenes de todo el catálogo sin credenciales.

---

### 🔵 BAJA-16 — Sin cabeceras de seguridad (`helmet`)

No está instalado. Falta `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, HSTS. Además Express anuncia `X-Powered-By: Express` por defecto, revelando el stack. Una línea: `app.use(helmet())`.

### 🔵 BAJA-17 — Datos de cliente volcados a los logs en texto plano

`controllers/orderController.js:102` — `console.log(req.body);` en `createCompleteOrder` escribe el pedido completo (incluidos datos del cliente) a los logs de PM2 sin rotación ni control de acceso.

### 🔵 BAJA-18 — Sin TLS forzado ni HSTS

`app.listen(PORT, '0.0.0.0')` en HTTP plano (`index.js:120`). Si no hay un reverse proxy con TLS delante, el token viaja en claro en cada petición. Confirmar la terminación TLS del despliegue.

### 🔵 BAJA-19 — Rutas montadas múltiples veces (superficie duplicada)

En `index.js`, `orderRoutes` se monta en `/api/order` y `/api/ordenes`; `articulosRoutes` se monta **cinco** veces (`/api/articulos`, `/api/crearArticulo`, `/api/editarArticulo`, `/api/consultarArticuloByArtCod`, más el import duplicado). No es una vulnerabilidad por sí sola, pero multiplica los paths a auditar y hace fácil que una corrección de seguridad cubra un alias y no el otro.

---

## 4. Correcciones estructurales propuestas

### 4.1 Middleware de autorización (resuelve CRÍTICO-1 y CRÍTICO-2)

Crear `middlewares/authorize.js` que consulte el RBAC que ya existe en BD:

```js
// middlewares/authorize.js
const { poolPromise, sql } = require('../db');

const requirePermission = (mod_codigo, acc_codigo = null) => async (req, res, next) => {
  try {
    if (!req.user?.usu_cod) {
      return res.status(401).json({ success: false, error: 'No autenticado.' });
    }
    const pool = await poolPromise;
    const result = await pool.request()
      .input('usu_cod',    sql.VarChar(20), req.user.usu_cod)
      .input('mod_codigo', sql.VarChar(50), mod_codigo)
      .input('acc_codigo', sql.VarChar(50), acc_codigo)
      .query(`
        SELECT TOP 1 1 AS ok
        FROM dbo.UsuariosRoles ur
        INNER JOIN dbo.Roles r         ON r.rol_id = ur.rol_id AND r.rol_activo = 1
        INNER JOIN dbo.RolesPermisos rp ON rp.rol_id = r.rol_id
        LEFT  JOIN dbo.RolesPermisosAcciones rpa
               ON rpa.rol_id = r.rol_id AND rpa.mod_codigo = rp.mod_codigo
              AND rpa.acc_codigo = @acc_codigo
        WHERE ur.usu_cod = @usu_cod
          AND rp.mod_codigo = @mod_codigo
          AND rp.acceso = 1
          AND (@acc_codigo IS NULL OR rpa.permitido = 1)
      `);

    if (!result.recordset.length) {
      return res.status(403).json({ success: false, error: 'No autorizado para esta operación.' });
    }
    next();
  } catch (error) {
    console.error('Error verificando permisos:', error);
    return res.status(500).json({ success: false, error: 'Error verificando permisos.' });
  }
};

module.exports = { requirePermission };
```

> Validar los nombres reales de `dbo.UsuariosRoles` / `dbo.RolesPermisosAcciones` y sus columnas contra la BD antes de implementar — la consulta de arriba se derivó de `models/userRoleModel.js` y necesita confirmación con `db-explorer`.

Uso: `router.post('/', verifyToken, requirePermission('ORDENES', 'CREAR'), createCompleteOrder);`

Consultar el permiso en BD en cada request (en lugar de leerlo del JWT) resuelve además MEDIA-9 parcialmente: revocar un rol surte efecto de inmediato.

### 4.2 Autenticación por defecto (whitelist en vez de blacklist)

Hoy un endpoint nuevo nace desprotegido — hay que acordarse de añadir el middleware. Invertir eso en `index.js`:

```js
const PUBLIC_PATHS = ['/api/auth/login', '/api/woo/test', '/'];

app.use((req, res, next) => {
  if (PUBLIC_PATHS.includes(req.path)) return next();
  return verifyToken(req, res, next);
});
// ...los app.use("/api/...") van DESPUÉS de esta línea
```

Es el único cambio que garantiza que no vuelva a repetirse el problema. **No se puede activar hasta cerrar el Grupo B** (rompería producción), pero debe ser el objetivo final de la remediación.

### 4.3 Aceptar `Authorization: Bearer` además de `x-access-token`

El bug de `DiferenciaInventario.jsx` que reportó el informe anterior (frontend enviando `Bearer`) se resuelve más rápido desde el backend, y de paso alinea la API con el estándar:

```js
const token = req.headers['x-access-token']
  || (req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : null);
```

Aplicar en **ambos** middlewares (`middlewares/auth.js` y `middlewares/authMiddleware.js`, que están duplicados — conviene unificarlos).

---

## 5. Plan de remediación priorizado

### Fase 0 — Hoy, sin coordinación con nadie (no rompe nada)

| # | Acción | Archivo |
|---|---|---|
| 1 | Exigir rol admin en `changePasswordAdmin` | `controllers/authController.js:236` |
| 2 | Restringir CORS a los dominios del frontend | `index.js:63` |
| 3 | `express-rate-limit` en `/api/auth/login` | `routes/authRoutes.js:9` |
| 4 | `helmet()` + `app.disable('x-powered-by')` | `index.js` |
| 5 | Invertir precedencia: `req.user.usu_cod` sobre `req.body.usu_cod` | `cargaCostosController.js` (5 puntos), `orderController.js:101` |
| 6 | Quitar `console.log(req.body)` | `orderController.js:102` |
| 7 | `npm audit fix` + reemplazar `xlsx` por `exceljs` | `package.json` |
| 8 | `verifyToken` a los 15 endpoints huérfanos del Grupo C | ver §2 |

> El punto 8 requiere el paso previo que el informe anterior ya señalaba y **sigue pendiente**: confirmar con el equipo que ningún script, cron o colección Postman los consume. Es una pregunta de 10 minutos en el chat del equipo, no un bloqueo real.

### Fase 1 — Esta semana (requiere coordinación con frontend)

1. **Escalar el bloqueo del Grupo B.** Lleva un mes parado. Enviar al equipo de frontend la lista concreta de archivos a corregir (`POS2.jsx`, `AnularDocumentoModal.jsx`, `CreateClientModal.jsx`, `photoService.js`, `DiferenciaInventario.jsx`, `Orders.jsx`, `useCategories.jsx`, `ConteoCreate.jsx`) con una fecha comprometida. La solución robusta es migrar todas esas llamadas a `axiosInstance`, que ya inyecta el header por interceptor.
2. **Aceptar `Bearer` en el backend** (§4.3) — desbloquea `DiferenciaInventario.jsx` de inmediato.
3. **Proteger por severidad de negocio**, a medida que frontend confirme cada uno:
   `/api/order/*` y `/anular` → `/api/nits/` → `productPhotoRoutes` → `inventarioConteo` → el resto.
4. **Recalcular precios en el servidor** en `createCompleteOrder` / `updateOrder` (CRÍTICO-3b). Es independiente de la auth y hay que hacerlo igual: un usuario autenticado sin permiso de descuento tampoco debería poder fijar el precio.

### Fase 2 — Siguientes dos semanas

1. Middleware `requirePermission` (§4.1) aplicado módulo por módulo, empezando por `/api/users`, `/api/roles`, `/api/parametros`, `/api/cierre-mes`.
2. Middleware de errores centralizado (MEDIA-10).
3. Autenticación por defecto con whitelist (§4.2) — **solo cuando el Grupo B esté cerrado**.
4. Unificar `middlewares/auth.js` y `middlewares/authMiddleware.js` en un único módulo.
5. Confirmar terminación TLS en el despliegue y añadir HSTS.

---

## 6. Anexo — Los 53 endpoints sin autenticación (2026-09-10)

Excluye `POST /api/auth/login`, que debe ser público.

| Archivo | Líneas | Endpoints |
|---|---|---|
| `routes/inventarioConteo.js` | 6,9,12,15,18,21,24,27,30 | 9 |
| `routes/productPhotoRoutes.js` | 7,10,13,16,19,22 | 6 |
| `routes/promocionRoutes.js` | 19,20,23,24,25,28 | 6 |
| `routes/orderRoutes.js` | 9,10,12,14,15 | 5 *(×2 por doble montaje)* |
| `routes/diagnosticRoutes.js` | 14,50,93,129 | 4 |
| `routes/wooSyncRoutes.js` | 21,29,38,46 | 4 |
| `routes/woo.js` | 19,35,132 | 3 |
| `routes/testSyncRoutes.js` | 8,144,248 | 3 |
| `routes/nitsRoutes.js` | 10,13 | 2 |
| `routes/ciudadesRoutes.js` | 7 | 1 |
| `routes/confirmOrderRoutes.js` | 9 | 1 |
| `routes/documentoInventarioRoutes.js` | 7 | 1 |
| `routes/inventarioGrupoRoutes.js` | 13 | 1 |
| `routes/inventarioSubgrupoRoutes.js` | 65 | 1 |
| `routes/inventoryComparisonRoutes.js` | 7 | 1 |
| `routes/inventoryDifferenceRoutes.js` | 6 | 1 |
| `routes/kardexRoutes.js` | 7 | 1 |
| `routes/salesRoutes.js` | 7 | 1 |
| `routes/syncOrdersRoutes.js` | 7 | 1 |
| `routes/syncWooOrdersRoutes.js` | 6 | 1 |
| **Total** | | **53** |

---

**Nota de alcance:** este documento es diagnóstico. No se modificó ningún archivo de código. Los hallazgos se derivaron de lectura estática del repositorio — no se ejecutó ninguna prueba contra el entorno de producción, y ninguna explotación descrita fue verificada en vivo.
