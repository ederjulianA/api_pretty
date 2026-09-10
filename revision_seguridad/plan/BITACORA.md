# Bitácora — Plan de Hardening de Seguridad

Registro append-only. Entrada más reciente arriba. Cada sesión de Claude que toque el plan escribe aquí antes de terminar.

Formato: fecha, tarea, repo, qué se hizo, cómo se validó, qué quedó abierto.

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
