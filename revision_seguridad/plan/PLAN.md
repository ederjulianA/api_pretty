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

### Regla 1 — Orden de merge en tareas de dos repos

Tu despliegue es asimétrico y eso manda:

| Repo | Merge a main | Efecto |
|---|---|---|
| `pretty_front` | → Vercel | **Sale en vivo de inmediato.** Punto de no retorno |
| `api_pretty` | → nada | Espera a `pm2 restart api_pretty`, que tú controlas |

Por eso la secuencia de toda tarea que toca ambos repos es:

```
1. FRONT    → rama, cambio, merge a main, push
              Vercel despliega. El front ya manda el token.
              El backend todavía lo ignora → inofensivo, nada se rompe.
2. VERIFICAR en vivo que la función sigue andando
3. BACKEND  → rama, verifyToken, merge a main, push
              Todavía no pasa nada: main no despliega.
4. DESPLEGAR pm2 restart api_pretty
              Recién aquí el endpoint empieza a exigir token.
              Y el front lleva rato mandándolo.
5. VERIFICAR de nuevo en vivo
```

**Invertir esto tumba producción**: si el backend exige token antes de que el front lo mande, la función devuelve 401 para todos los usuarios.

El paso 1 es seguro precisamente porque mandar un header que el servidor ignora no tiene ningún efecto. Esa asimetría es la que hace que el plan no necesite ventana de mantenimiento.

### Regla 2 — Nunca escribir datos reales como prueba

Validas en local contra la **BD de producción**. El gate de cada tarea está redactado para verificar **códigos de respuesta** (401 sin token, 200 con token) y **lecturas**, no escrituras.

Prohibido como prueba: crear facturas, anular documentos, aplicar costos, cambiar la contraseña de `admin`. Donde haga falta probar escritura, usar un usuario y un cliente de prueba dedicados, y decirlo en la bitácora.

---

## Ramas

- **Una rama por tarea:** `seguridad/SEC-XX-slug-corto`
- Sale de `main`, se mergea a `main` al pasar el gate, y se borra.
- Nunca dos tareas en la misma rama: cada corrección entra a main por separado para poder revertirla sola.
- **`ESTADO.json` se commitea siempre directo a `main`**, nunca dentro de la rama de tarea. Así dos sesiones trabajando en paralelo no chocan en un conflicto de merge sobre el estado.

---

## Fases

| Fase | Qué | Tareas | Riesgo de romper producción |
|---|---|---|---|
| **0** | Instrumentación | SEC-00 | Ninguno — no bloquea nada |
| **1** | Backend puro | SEC-01 … SEC-08 | Ninguno — el front no se entera |
| **2** | Cierre de endpoints abiertos | SEC-10 … SEC-18 | Real — requiere la Regla 1 |
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
