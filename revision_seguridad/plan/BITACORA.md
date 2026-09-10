# Bitácora — Plan de Hardening de Seguridad

Registro append-only. Entrada más reciente arriba. Cada sesión de Claude que toque el plan escribe aquí antes de terminar.

Formato: fecha, tarea, repo, qué se hizo, cómo se validó, qué quedó abierto.

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
