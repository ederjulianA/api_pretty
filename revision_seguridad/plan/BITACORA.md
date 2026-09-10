# Bitácora — Plan de Hardening de Seguridad

Registro append-only. Entrada más reciente arriba. Cada sesión de Claude que toque el plan escribe aquí antes de terminar.

Formato: fecha, tarea, repo, qué se hizo, cómo se validó, qué quedó abierto.

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
