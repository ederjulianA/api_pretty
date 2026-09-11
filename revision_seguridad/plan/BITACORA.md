# Bitácora — Plan de Hardening de Seguridad

Registro append-only. Entrada más reciente arriba. Cada sesión de Claude que toque el plan escribe aquí antes de terminar.

Formato: fecha, tarea, repo, qué se hizo, cómo se validó, qué quedó abierto.

---

## 2026-09-10 — SEC-21 requirePermission (CRÍTICO-2) + ajustes al despliegue

**Repo:** backend (`main` = `823a98f`, desplegado 18:09)
**Estado:** SEC-21 desplegada. Avance **10/30**.

**Hecho:**
- `middlewares/authorize.js`: `requirePermission(mod_codigo, acc_codigo)` consulta el RBAC en cada request (no el JWT), falla cerrado ante error de BD, y registra cada denegación como `[PERMISO-DENEGADO]`.
- `routes/userRoutes.js` (3 rutas) y `routes/roleRoutes.js` (5 rutas): `requirePermission('admin', 'manage_users' | 'manage_roles')`.
- `update-app.ps1`: health check de 30s → 60s; parseo de `pm2 jlist` recortando los avisos que PM2 antepone al JSON; las advertencias incluyen ahora el mensaje de la excepción. **En `develop`, aún no en `main`.**

**Validado:** simulación de la consulta contra la BD con usuarios reales antes de tocar rutas (EDER permite, LADY deniega en admin, LADY permite en products). Gate: Admin 200 / Supervisor 403 / sin token 401 en users y roles; supervisor sigue con 200 en artículos, parámetros, compras, costos y cierre de mes. Despliegue: health check OK al primer intento del segundo run.

⚠️ **Pendiente de confirmar funcionalmente en producción** que un Supervisor recibe 403 en Gestión de Usuarios. Eder dijo "avancemos" sin reportar esa prueba.

**Aprendido:**
1. **Estructura real del RBAC** — cada acción pertenece a un módulo (`Acciones.mod_id`), hay 9 `view` distintos; `RolesPermisos` enlaza por `mod_id`, no por `mod_codigo`. El informe lo tenía mal. → memoria `rbac-estructura-real` (con la tabla de qué roles tienen qué módulos).
2. **Supervisor NO tiene `admin` ni `conteos`; Vendedor solo `orders` y `pos`.** Cualquier aplicación futura de permisos debe simularse contra la BD primero. → memoria.
3. **`/api/parametros` no tiene módulo en el RBAC** y lo consumen todos los roles vía POS y cotizaciones. Aplicarle `admin` rompería a los vendedores. → **SEC-30**.
4. **Rollback falso en el primer despliegue:** el arranque tardó más de 30s, el segundo intento idéntico pasó en 7s. → script corregido (60s), memoria del despliegue.
5. **`pm2 jlist` antepone avisos al JSON** en el servidor, así que el parseo fallaba y el script caía al nombre por defecto `index` — que coincide con el real **por casualidad**. La comprobación de `online` estaba ciega. → script corregido, memoria. La app en PM2 se llama `index`.

**Abierto:**
- Confirmar el 403 del supervisor en producción.
- Las mejoras al script están en `develop`: pasarlas a `main` con la próxima tanda para que el servidor las tome.
- **SEC-31** (9 módulos restantes) desbloqueada. Aplicar de a uno, simulando cada consulta contra la BD.
- **SEC-30** (`/api/parametros`) requiere decidir si se crea un módulo nuevo o se mapea la lectura a uno común.
- Ventana de SEC-00: analizar a partir del **2026-09-17**.

---

## 2026-09-10 — FASE 1 COMPLETA (SEC-04 a SEC-08)

**Repos:** backend (`main` = `c44fc70`) + frontend (`main` = `83039b4`, desplegado por Vercel)
**Estado:** las 8 tareas de Fase 1 desplegadas y verificadas por Eder. Avance total **9/28**.

| Tarea | Qué quedó |
|---|---|
| SEC-04 | helmet activo, sin `X-Powered-By`. CSP y HSTS desactivados a propósito |
| SEC-05 | 6 puntos toman la identidad del token; el front deja de enviar `usu_cod` |
| SEC-06 | 3 volcados de `req.body`/`req.files` reemplazados por líneas acotadas |
| SEC-07 | 38 → 10 vulnerabilidades, **0 críticas**. `xlsx` fuera, `bcrypt` 5→6 |
| SEC-08 | `Authorization: Bearer` aceptado; extracción centralizada en `tokenHeader.js` |

**Validado:** Eder probó en local con ambos repos en `develop` antes de mergear, y confirmó en producción tras desplegar. Gates propios: helmet sin romper CORS ni el rate limit; equivalencia `xlsx` vs ExcelJS en 6 casos límite (celdas vacías, ceros, filas vacías, sin `art_cod`, fórmula) → **idéntico**; hashes de bcrypt 5 validados por bcrypt 6; Bearer y `x-access-token` funcionando en rutas ESM y CommonJS.

**Aprendido:**
1. **`req.usuario` no existe** — el middleware expone `req.user`. Cuatro controladores (`registrarCostoIndividual`, `aprobarCostoIndividual`, `aprobarCostosMasivo`, `modificarCompra`) lo leían y registraban siempre `'sistema'`. No era que la auditoría fuera falsificable: **no registraba a nadie**. El informe solo señalaba 5 puntos de precedencia; eran 6, y 4 estaban además rotos. → memoria (`Codebase Patterns`).
2. **`req.files` serializado escribía megabytes al log** por cada artículo con foto (`articulosController:91`). No estaba en el informe; apareció al corregir SEC-06.
3. **La lectura de Excel ya no usa `xlsx`** → memoria, para que no se reintroduzca.
4. **Fallo de proceso propio:** el primer `git checkout main` abortó por tener `ESTADO.json` sin commitear, y como no se leyó su salida, el CLI registró un merge que **nunca ocurrió**, apuntando al commit viejo. Se detectó verificando `git show main:index.js | grep helmet` → 0. Corregido el estado y **endurecida la skill `plan-seguridad`**: ahora exige árbol limpio antes del checkout y comprobar que el código llegó de verdad. Lección: encadenar con `&&` y leer la salida, no asumir que un comando hizo lo que se pedía.

**Abierto:**
- **Ventana de observación de SEC-00 corriendo.** Analizar a partir del **2026-09-17** con `analizar-auditoria.py`. Los logs están en `C:\api_pretty\logs\` del servidor Windows: hay que traerlos o correr el análisis allá. Sin esos datos la Fase 2 se haría a ciegas.
- **Fase 2 (9 tareas) desbloqueada** técnicamente, pero conviene esperar los datos.
- Disponible sin esperar: **SEC-21** (`requirePermission`, cierra el CRÍTICO-2), SEC-22, SEC-24, SEC-25, SEC-28, SEC-29.
- SEC-21 ya tiene la estructura del RBAC confirmada contra la BD (nota en la tarea) y la primera piedra puesta: `middlewares/authorize.js` con `requireAdmin`.

---

## 2026-09-10 — SEC-03 + despliegue con verificación

**Repo:** backend
**Estado:** SEC-03 desplegada en producción (`main` = `766ba56`). Fase 1 va 3/8.

### SEC-03 — Rate limiting en login (ALTA-7)

**Hecho:** `middlewares/rateLimits.js` (nuevo) + `routes/authRoutes.js:10` + log de fallos en `controllers/authController.js`. Dependencia nueva: `express-rate-limit@8.7.0`.

**Decisión que se aparta del plan:** el plan pedía limitar "por IP+usuario"; se limita **solo por `usu_cod`**. El front llega por rewrite server-side de Vercel, así que todo el tráfico legítimo comparte la IP de Vercel: un límite por IP habría dejado fuera a todos los usuarios en cuanto un atacante agotara la cuota, convirtiendo la fuerza bruta en una caída de servicio. Y `X-Forwarded-For` no es fiable mientras el puerto 3000 esté expuesto directo (ALTA-18).

**Validado** (local, `PORT=3999`, Node 23): 6º intento → **429**; otro usuario desde la misma IP → **401** (el bloqueo no se propaga); mayúsculas/minúsculas no evaden; cabeceras `RateLimit` presentes; logs `LOGIN-FALLIDO` / `LOGIN-BLOQUEADO` OK; sin regresiones en `/permissions` ni `/login`.

⚠️ **No se pudo ejercitar un login EXITOSO** — no hay credenciales de prueba y adivinarlas es justo lo que este cambio impide. Queda **pendiente de confirmar en vivo** que entrar tras 2-3 fallos funciona (`skipSuccessfulRequests`). Eder confirmó el despliegue, no ese caso concreto.

### Despliegue — `update-app.ps1`

**Hecho:** health check tras el reinicio (6 intentos × 5s contra `http://localhost:<PORT>/`, puerto leído del `.env`), **rollback automático** si no responde, verificación del exit code de `npm install`, detección de `package-lock.json`, log de los commits aplicados, comprobación de `online` en PM2, y `pm2 jlist` en vez de `pm2 list --format json`.

**Validado:** sintaxis parseada con `pwsh`; `Get-AppPort` lee `PORT=3000` del `.env`; `Test-AppHealth` → `True` contra servidor vivo y `False` contra puerto muerto. PM2 y el rollback completo no se pudieron probar (requieren Windows).

**Aprendido:**
1. **El servidor de producción es WINDOWS** (`C:\api_pretty`), se despliega con `update-app.bat` → `update-app.ps1`. → memoria `despliegue-backend-windows`.
2. **El script YA hacía `npm install` condicional.** La advertencia de "instala las dependencias a mano antes de reiniciar" que se dio al desplegar SEC-03 era innecesaria. → memoria.
3. **El script hace `git reset --hard origin/main`**, así que nada de `develop` llega nunca al servidor: el paso a `main` es obligatorio para desplegar cualquier cosa, incluidas las mejoras al propio script. → memoria.
4. **`pm2 list --format json` no existe en varias versiones de PM2** — caía al `catch` y usaba `"index"` por defecto, así que probablemente nunca detectó el nombre real. Corregido a `pm2 jlist`.
5. ⚠️ **El health check condiciona SEC-23.** El script pide `GET /` y revierte solo si no responde 200. Si SEC-23 (auth por defecto con whitelist) no deja `/` como ruta pública, **cada despliegue se revertiría solo**, incluido el de esa misma tarea. → nota en **SEC-23**.
6. **SEC-27 hay que replantearla:** Caddy/nginx + Let's Encrypt asumía Linux. En Windows las opciones son IIS como reverse proxy, Caddy para Windows, o TLS en Cloudflare delante de la IP. → nota en SEC-27.

**Abierto:**
- Confirmar en vivo el login exitoso tras fallos (SEC-03).
- Ventana de observación de SEC-00 corriendo desde hoy: analizar a partir del **2026-09-17** con `analizar-auditoria.py`. Los logs están en `C:\api_pretty\logs\` del servidor Windows — hay que traerlos o correr el análisis allá.
- Quedan en Fase 1: SEC-04, SEC-05, SEC-06, SEC-07, SEC-08.

---

## 2026-09-10 — SEC-01 y SEC-02 (+ despliegue de SEC-00)

> Entrada escrita en diferido: al cerrar SEC-01 y SEC-02 no se invocó `cierre-sesion` y la bitácora
> se quedó en SEC-00. El conocimiento no se perdió (quedó en notas del plan, commits y memoria), pero
> durante un rato la bitácora daba a entender que el plan iba por SEC-00. Lección: invocar la skill al
> cerrar **cada** tarea, no al final de una tanda.

**Repo:** backend
**Estado:** SEC-00, SEC-01 y SEC-02 desplegadas en producción (commit `8776f57`). Eder confirmó que todo funciona.

### SEC-01 — Rol admin en change-password-admin (CRÍTICO-1)

**Hecho:**
- `middlewares/authorize.js` (nuevo): `requireAdmin` consulta el rol contra la BD en cada request, no lo lee del JWT — el token dura 24h y lleva el rol congelado del login, así que retirar un rol no surtiría efecto hasta que expire. Ante error al verificar, deniega.
- `routes/authRoutes.js:18`: `verifyToken + requireAdmin` en la ruta.
- `controllers/authController.js`: impide que un admin resetee su propia password por esa vía (no pide la actual); para eso está `/change-password`. Corregido `sql.VarChar(100)` en las queries de este endpoint.

**Validado** (local, `PORT=3999`, Node 23):
- Supervisor (LADY) → **403**; Admin (EDER) sobre usuario inexistente → **404** (pasó el middleware); Admin sobre sí mismo → **400**; sin token → **401**.
- Sin regresiones: `/change-password` → 401 con password incorrecta, `/permissions` → 200, `/login` → 400 sin body.
- ⚠️ **No se ejercitó el UPDATE real (200).** Solo hay 4 usuarios en BD y todos en uso; cambiar la password de cualquiera rompería su acceso. El `UPDATE` no se modificó en esta tarea, solo se añadieron validaciones previas.

### SEC-02 — CORS restringido (ALTA-6)

**Hecho:** `index.js` — lista blanca desde `CORS_ORIGINS`, con `https://pretty-front.vercel.app` incluido en el default para que un olvido de configuración no deje al front fuera. Peticiones sin `Origin` (server-to-server, curl, jobs) siguen pasando. Rechazo sin error y con log.

**Validado:** sin Origin → 200 sin cabecera; `localhost:5174` → cabecera con el origen exacto; origen ajeno → sin cabecera y `[CORS] Origen no permitido` en el log; preflight OPTIONS permitido → 204 con métodos y headers correctos.

**Aprendido:**
1. **El backend de producción es `http://154.53.62.220:3000` — HTTP plano sobre IP pública, sin TLS.** Visto en `pretty_front/vercel.json`. El `x-access-token` viaja en claro por internet en cada request. El informe lo tenía como BAJA-18 ("confirmar si hay TLS"): no hay. → informe corregido a **ALTA-18**, SEC-27 elevada a alta, y se añadió `plan.py severidad` al CLI porque esta recalibración se va a repetir.
2. **El informe se equivocó en la estructura del RBAC.** Proponía `RolesPermisos.mod_codigo`; la tabla real usa `rolperm_id` + `mod_id` con JOIN a `dbo.Modulos`, y `RolesPermisosAcciones` usa `acc_id` con JOIN a `dbo.Acciones`. La consulta propuesta para SEC-21 no habría funcionado. → nota en **SEC-21**.
3. **Roles reales:** 1=Administrador (2 usuarios), 2=Vendedor (0), 3=Supervisor (2). → constante documentada en `authorize.js`.
4. **`usu_cod` es `VARCHAR(100)`, no `VARCHAR(20)`** como declara el código en 7 puntos. → memoria (`Database Schema Critical Facts`) + tarea nueva **SEC-28**.
5. **El front no usa CORS en ningún entorno**: `vercel.json` hace rewrite server-side y Vite hace proxy en dev; el navegador siempre ve same-origin. Por eso SEC-02 fue de riesgo nulo. → nota en SEC-02.

**Abierto:**
- **Ventana de observación de SEC-00 arrancó el 2026-09-10.** Analizar con `analizar-auditoria.py` a partir del **2026-09-17**. Fase 2 desbloqueada pero conviene esperar los datos.
- `CLAUDE.md` sigue sin corregir: afirma que hay Winston+Loki (falso) y recomienda `lsof -ti:3000 | xargs kill -9`, que aquí mataría Docker. **Pendiente de aprobación de Eder** (preguntado dos veces).
- Falta definir `CORS_ORIGINS` en el `.env` del servidor (el default ya cubre el dominio del front, así que no es urgente).
- Siguiente sugerida: **SEC-03** (rate limiting en login), backend-puro.

---

## 2026-09-10 — SEC-00 Middleware de auditoría de auth

**Repo:** backend
**Hecho:**
- `middlewares/authAudit.js` (nuevo): registra por request si llegó con token válido, inválido o sin token. No bloquea nunca — todo en try/catch y siempre `next()`.
- `index.js:25,72`: montado antes de las rutas.
- `.gitignore`: se añadió `logs/`.
- `revision_seguridad/plan/analizar-auditoria.py` (nuevo, fuera del alcance original): cruza el tráfico observado con las rutas sin `verifyToken` y emite veredicto por endpoint (SEGURO PROTEGER / CORREGIR FRONT PRIMERO / HUÉRFANO). Sin esto los datos quedaban crudos y la decisión de la Fase 2 seguía siendo manual.

**Validado:** gate corrido en local con `PORT=3999` y Node 20.20.0.
- Comportamiento **idéntico** al previo: `/api/articulos` sin token → 401 y con token válido → 200; `/api/ciudades` (sin auth) → 200, o sea el middleware **no bloquea**; rutas públicas y 404 sin cambios.
- El log registra ts, método, ruta, url, estado_auth, status, ip, origin, referer, ua. No escribe el token.
- Agrupación correcta: 4 llamadas a `/api/kardex/ART001|ART002|FAC123` se consolidaron en `GET /api/kardex/:art_cod`.
- Los tres estados se distinguen: `GET /api/articulos` quedó con sin_token=1, inválido=1, válido=1 y capturó el usuario del token.
- Logs de prueba eliminados antes del commit.

**Aprendido:**
1. **Winston no existe.** `CLAUDE.md` afirma que hay Winston+Loki configurado; es falso (0 imports, 643 `console.*`). → memoria `logging-winston-no-existe`, nota en **SEC-22**, y corrección en el informe (MEDIA-10 decía "registre el detalle en Winston").
2. **El puerto 3000 lo ocupa Docker** en esta máquina. El primer intento de gate falló con `EADDRINUSE` y los curl respondían desde Docker — `/` daba 200 y todo `/api/*` daba 404. Casi se toma por válido un gate que nunca corrió. → memoria `entorno-local-desarrollo`.
3. **`CLAUDE.md:271` da un consejo peligroso**: recomienda `lsof -ti:3000 | xargs kill -9` ante "Port already in use", lo que aquí mataría Docker. → registrado en memoria; corrección de `CLAUDE.md` **propuesta al usuario, pendiente de su visto bueno**.
4. **53 vs 58 endpoints:** el informe cuenta definiciones de ruta, el script cuenta paths efectivos (los 5 de `orderRoutes` montados dos veces dan 10). → aclaración añadida al informe.

**Abierto:**
- **SEC-00 mergeado pero NO desplegado.** Falta que el usuario corra `pm2 restart api_pretty` y luego `plan.py desplegado SEC-00`. Hasta entonces no se está midiendo nada.
- Al desplegar, actualizar la nota de SEC-00 con la fecha real: el análisis de Fase 2 se hace ~7 días después.
- Corrección de `CLAUDE.md` (Winston + el `kill -9`) pendiente de aprobación del usuario.
- Siguiente tarea sugerida: **SEC-01** (escalada a admin), backend-puro, no depende de SEC-00.

---

## 2026-09-10 — Andamiaje del plan

**Tarea:** setup inicial (no es una SEC-XX)
**Repos:** api_pretty + pretty_front

**Hecho:**
- Informe de seguridad completo con 19 hallazgos (`INFORME_SEGURIDAD_2026-09-10.md`).
- Validación del informe de agosto: Grupo A aplicado, Grupos B y C sin tocar, conteo corregido a 53 endpoints sin auth.
- `ESTADO.json` con 26 tareas en 4 fases, con dependencias y gates.
- `PLAN.md` con las reglas de operación.
- Skill `plan-seguridad` instalada en ambos repos.

**Decisiones tomadas con el usuario:**
- Frontend lo ejecuta él mismo con Claude → el Grupo B se desbloquea, no hay handoff a otro equipo.
- Backend despliega manual con PM2; frontend auto-despliega en Vercel al mergear → de ahí sale la Regla 1 de orden de merge.
- Validación local contra BD de producción, sin staging → los gates evitan escrituras reales.
- Merge local + push, sin PR.

**Abierto:**
- SEC-00 es el siguiente paso y no tiene dependencias.
- Sin confirmar: nombres reales de `dbo.UsuariosRoles` y `dbo.RolesPermisosAcciones` (los necesita SEC-21).
- Sin confirmar: si hay reverse proxy con TLS delante de la API en producción (lo necesita SEC-27).
