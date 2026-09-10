# Plan de Hardening de Seguridad — API Pretty

**Creado:** 2026-09-10
**Base:** [`INFORME_SEGURIDAD_2026-09-10.md`](../INFORME_SEGURIDAD_2026-09-10.md) — 19 hallazgos
**Estado vivo:** [`ESTADO.json`](./ESTADO.json) — 26 tareas
**Bitácora:** [`BITACORA.md`](./BITACORA.md)

Este documento explica **cómo** se ejecuta el plan. El **qué** está en `ESTADO.json`, que es la única fuente de verdad y la que leen las sesiones de Claude.

---

## Cómo se opera

Desde cualquiera de los dos repos, en cualquier sesión de Claude:

```
/plan-seguridad estado          # dashboard: qué va, qué sigue, qué está bloqueado
/plan-seguridad siguiente       # toma la siguiente tarea desbloqueada y la ejecuta
/plan-seguridad ejecutar SEC-04 # ejecuta una tarea concreta
/plan-seguridad validar SEC-04  # corre el gate de validación
/plan-seguridad merge SEC-04    # mergea a main y actualiza el estado
/plan-seguridad desplegar SEC-04 # marca el deploy de backend como hecho
/plan-seguridad bloquear SEC-04 "razón"
```

La skill vive en ambos repos y lee y escribe **el mismo** `ESTADO.json`.

---

## Las dos reglas que no se rompen

### Regla 1 — Todo se trabaja en `develop`; a `main` solo con tu visto bueno

```
rama de tarea  ->  develop        Claude, tras pasar el gate
                      |
                      v
                   Eder valida
                      |
                   Eder confirma
                      v
                    main          Claude, con --confirmado
                      |
                      v
              pm2 restart         Eder (solo backend)
```

**Claude nunca pasa nada a `main` por su cuenta.** El CLI lo rechaza sin el flag `--confirmado`, que solo se usa cuando tú lo has dicho explícitamente.

Que todo pase por `develop` cambia el riesgo del pipeline: **`develop` no despliega en ningún repo**, así que dentro de `develop` el orden entre frontend y backend da igual y se puede trabajar cualquiera primero.

Donde el orden sí importa es al pasar a `main`, porque el despliegue es asimétrico:

| Repo | `develop` | `main` |
|---|---|---|
| `pretty_front` | nada | **Vercel despliega al instante.** Punto de no retorno |
| `api_pretty` | nada | nada, hasta `pm2 restart api_pretty` |

Por eso, al pasar una tarea de dos repos a `main`:

```
1. FRONT a main    -> Vercel despliega. El front ya manda el token.
                      El backend todavía lo ignora -> inofensivo.
2. VERIFICAR en vivo
3. BACKEND a main  -> todavía no pasa nada
4. pm2 restart api_pretty
                   -> recién aquí el endpoint exige token,
                      y el front lleva rato mandándolo.
5. VERIFICAR en vivo
```

**Invertir esto tumba producción**: si el backend exige token antes de que el front lo mande, la función devuelve 401 a todos los usuarios. El CLI rechaza el orden invertido en el paso a `main`.

### Regla 2 — Nunca escribir datos reales como prueba

Validas en local contra la **BD de producción**. El gate de cada tarea está redactado para verificar **códigos de respuesta** (401 sin token, 200 con token) y **lecturas**, no escrituras.

Prohibido como prueba: crear facturas, anular documentos, aplicar costos, cambiar la contraseña de `admin`. Donde haga falta probar escritura, usar un usuario y un cliente de prueba dedicados, y decirlo en la bitácora.

> **Levantar el backend en local:** `nvm use 20.20.0` (Node 25 rompe `jsonwebtoken`) y `PORT=3999`, porque el 3000 lo ocupa Docker en esta máquina. No correr el `lsof -ti:3000 | xargs kill -9` que sugiere `CLAUDE.md`: mataría Docker.

## Ramas

- **Una rama por tarea:** `seguridad/SEC-XX-slug-corto`
- Sale de `develop`, se mergea a `develop` al pasar el gate, y se borra.
- `develop` llega a `main` solo cuando tú lo confirmas, tarea por tarea.
- Nunca dos tareas en la misma rama: cada corrección entra a main por separado para poder revertirla sola.
- **`ESTADO.json` se commitea siempre directo a `develop`**, nunca dentro de la rama de tarea. Así dos sesiones trabajando en paralelo no chocan en un conflicto de merge sobre el estado.

---

## Fases

| Fase | Qué | Tareas | Riesgo de romper producción |
|---|---|---|---|
| **0** | Instrumentación | SEC-00 | Ninguno — no bloquea nada |
| **1** | Backend puro | SEC-01 … SEC-08 | Ninguno — el front no se entera |
| **2** | Cierre de endpoints abiertos | SEC-10 … SEC-18 | Real, pero solo al pasar a `main` |
| **3** | Estructural | SEC-20 … SEC-27 | Variable — SEC-20 y SEC-21 son los delicados |

### Fase 0 — SEC-00 primero, y sola

`SEC-00` instala un middleware que **registra sin bloquear**: por cada request anota ruta, método, IP y si traía token válido.

Es la pieza que cambia el plan de naturaleza. El informe de agosto quedó trabado un mes en "confirmar con el equipo si alguien usa estos endpoints". Con SEC-00 desplegado durante ~7 días, eso deja de ser una pregunta y pasa a ser un dato: se ve exactamente qué endpoints reciben tráfico sin token y desde dónde.

Por eso toda la Fase 2 depende de SEC-00 y arranca marcada como `bloqueado`. No es burocracia: sin esos datos estás protegiendo endpoints a ciegas.

### Fase 1 — se puede ejecutar hoy, en paralelo con la ventana de datos

Ocho tareas que no tocan ningún contrato con el frontend. Se ejecutan mientras SEC-00 acumula logs. Incluye el crítico **SEC-01** (escalada a admin), que es lo más urgente de todo el plan.

### Fase 2 — el orden importa

Se sugiere estrenar el flujo de dos repos con **SEC-16** (ciudades y categorías): riesgo bajo, verificación visual inmediata, y sirve para ajustar el procedimiento antes de tocar facturación.

Después por severidad: SEC-11 (órdenes) → SEC-12 (clientes) → SEC-17 (sync Woo) → SEC-13 (fotos) → SEC-15 (kardex) → SEC-18 (lecturas) → SEC-14 (conteo, el de mayor riesgo operativo).

**SEC-14** exige coordinación con bodega: no mergear el backend con un conteo físico en curso.

### Fase 3 — lo estructural

**SEC-21** (`requirePermission`) es el que de verdad cierra el CRÍTICO-2, y se aplica módulo por módulo, no de golpe. Antes de escribirlo hay que validar con `db-explorer` los nombres reales de `dbo.UsuariosRoles` y `dbo.RolesPermisosAcciones`: la consulta propuesta en el informe se dedujo de `userRoleModel.js` y **no está confirmada contra la BD**.

**SEC-20** (recalcular precios) es la tarea de mayor riesgo funcional del plan: cambia cómo se calcula el total de un pedido. Su gate exige comparar contra 5 pedidos históricos reales antes de mergear.

**SEC-23** (auth por defecto) es el cierre. Depende de que toda la Fase 2 esté desplegada y de 7 días limpios en el log de auditoría.

---

## Estados de una tarea

```
pendiente → en_curso → esperando_validacion → listo_merge → merged → desplegado
                                                    ↓
                                                bloqueado
```

En tareas de dos repos cada repo lleva su propio progreso dentro de `progreso.frontend` y `progreso.backend`. La tarea solo llega a `desplegado` cuando ambos lados cerraron.

`bloqueado` es un estado legítimo y esperado: significa que falta una dependencia o que apareció algo que decidir. Se anota la razón en `notas` y en la bitácora, y se sigue con otra tarea.

---

## Al terminar cada sesión

La skill escribe en `BITACORA.md`: qué se tocó, qué se validó, qué quedó abierto y cuál es el siguiente paso concreto. Es lo que lee la siguiente sesión para retomar sin que tengas que reexplicar el contexto.
