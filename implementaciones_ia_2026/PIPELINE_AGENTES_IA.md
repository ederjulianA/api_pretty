# Pipeline de Agentes IA — API Pretty

> Arquitectura del sistema de agentes/skills para automatizar el flujo de desarrollo

---

## Visión General

El pipeline convierte un **requerimiento en texto** en una **implementación documentada y probada**, pasando por etapas controladas donde el desarrollador mantiene el control en cada punto de decisión.

```
REQUERIMIENTO
     │
     ▼
┌─────────────────┐
│  /spec-analyzer │  ← Análisis técnico + SPEC.md + GAPS
└────────┬────────┘
         │ ¿Hay gaps? → Responder con el usuario
         │ ¿BD involucrada? →
         ▼
┌─────────────────┐
│  /db-explorer   │  ← Exploración BD + IMPACTO_BD.sql
└────────┬────────┘
         │
         ▼
  [REVISIÓN USUARIO]  ← Aprobación del SPEC antes de implementar
         │
         ▼
┌─────────────────┐
│  Implementación │  ← Claude Code genera el código
│  (Claude Code)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐    (Próximos skills)
│  /impl-builder  │  ← Genera código siguiendo patrones del proyecto
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  /test-builder  │  ← Genera colección Postman completa
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ /security-review│  ← Ya disponible — valida OWASP top 10
└────────┬────────┘
         │
         ▼
   IMPLEMENTACIÓN COMPLETA + DOCUMENTACIÓN
```

---

## Skills Disponibles Hoy

### `/spec-analyzer` ✅ Activo
**Propósito:** Primer paso del pipeline — análisis de requerimientos  
**Cuándo usarlo:** Antes de implementar cualquier cosa (feature, bug, perf)  
**Output:**
- Carpeta `implementaciones_ia_2026/{nombre}_{dd}-{mm}-{yyyy}/`
- Archivo `SPEC.md` con análisis completo
- Lista de GAPS y dudas bloqueantes

**Cómo invocarlo:** `/spec-analyzer`  
**Modelo:** Sonnet (siempre). Consultar usuario si se necesita Opus.

---

### `/db-explorer` ✅ Activo
**Propósito:** Exploración segura de la BD SQL Server  
**Cuándo usarlo:** Cuando el SPEC necesita validar estructuras de BD, o cuando hay cambios de esquema  
**Output:**
- Análisis de estructuras de tablas con tipos exactos
- `IMPACTO_BD.sql` — script de cambios propuestos (para revisión manual)
- `CASOS_PRUEBA_POSTMAN.md` — casos de prueba estructurados

**Restricciones:** Solo SELECT. Nunca DML ni DDL directo.  
**Cómo invocarlo:** `/db-explorer`  
**Modelo:** Sonnet.

---

## Skills Planificados (Roadmap)

### `/impl-builder` 🔜 Por construir
**Propósito:** Genera código del modelo + controller + route siguiendo los patrones del proyecto  
**Input:** SPEC.md aprobado  
**Output:**
- `models/{nombre}Model.js` con queries parametrizadas
- `controllers/{nombre}Controller.js` con lógica de negocio
- `routes/{nombre}Routes.js` con endpoints protegidos
- Fragmento de código para registrar en `app.js`

**Restricciones:**
- Solo usa CommonJS (`require`/`module.exports`)
- Siempre incluye transacciones SQL para multi-tabla
- Siempre usa tipos correctos (`sql.VarChar(30)` para `art_sec`, etc.)
- Nunca mezcla capas (sin SQL en controllers)

---

### `/test-builder` 🔜 Por construir
**Propósito:** Genera colección Postman completa lista para importar  
**Input:** SPEC.md + endpoints implementados  
**Output:**
- Archivo `.postman_collection.json` listo para importar
- Variables de entorno de Postman
- Tests automáticos (scripts de Postman) para validar respuestas
- Cobertura: happy path + edge cases + error cases

---

### `/migration-builder` 🔜 Por construir
**Propósito:** Genera scripts SQL de migración versionados  
**Input:** Cambios de BD del SPEC  
**Output:**
- `V{version}__descripcion.sql` — script de migración
- `V{version}__rollback.sql` — script de rollback
- Validaciones pre/post migración

---

### `/woo-sync-analyzer` 🔜 Por construir
**Propósito:** Analiza impacto en sincronización WooCommerce de un cambio  
**Cuándo:** Cualquier cambio que toque artículos, precios, stock, órdenes  
**Output:**
- Lista de jobs afectados (`jobs/syncWooOrders.js`, etc.)
- Campos WooCommerce impactados
- Puntos de rollback si falla el sync

---

## Principios del Pipeline

### Optimización de Tokens
- **Sonnet siempre por defecto** para todos los skills
- **Consultar al usuario** antes de escalar a Opus
- Los skills leen solo los archivos necesarios (no escanean todo el proyecto)
- El SPEC es el contrato — evita idas y venidas costosas

### Control del Desarrollador
- **Ningún skill implementa sin aprobación** del SPEC primero
- **Ningún skill ejecuta DDL** directamente en la BD
- **Ningún skill hace push** a git — solo genera código localmente
- El desarrollador revisa cada artefacto generado

### Calidad
- SOLID aplicado en cada análisis
- Patrones del proyecto siempre respetados (CommonJS, transacciones, tipos SQL correctos)
- Riesgos y gaps siempre documentados, no ocultados

---

## Estructura de Carpetas por Requerimiento

```
implementaciones_ia_2026/
└── {nombre_requerimiento}_{dd}-{mm}-{yyyy}/
    ├── SPEC.md                    ← spec-analyzer genera esto
    ├── IMPACTO_BD.sql             ← db-explorer genera esto
    ├── CASOS_PRUEBA_POSTMAN.md    ← db-explorer / test-builder
    ├── IMPLEMENTACION.md          ← Notas del desarrollador durante impl
    └── CHANGELOG.md               ← Qué se cambió y por qué
```

---

## Cómo Usar el Pipeline

### Caso 1: Nueva Funcionalidad
```
1. Describe el requerimiento al asistente
2. Invoca /spec-analyzer
3. Revisa el SPEC.md generado
4. Responde los GAPS identificados
5. Si hay cambios de BD → /db-explorer
6. Aprueba el SPEC
7. Solicita la implementación
8. Prueba con los casos Postman generados
```

### Caso 2: Bug
```
1. Describe el bug y cómo reproducirlo
2. Invoca /spec-analyzer (clasifica como BUG)
3. El SPEC incluirá análisis de causa raíz
4. Si el bug es en BD → /db-explorer para validar datos
5. Aprueba el fix propuesto
6. Implementa y prueba
```

### Caso 3: Solo necesito explorar la BD
```
1. Describe qué estructura necesitas entender
2. Invoca /db-explorer directamente
3. El skill ejecuta SELECTs y reporta hallazgos
```

---

## Historial de Implementaciones IA

| Fecha | Requerimiento | Skills Usados | Estado |
|-------|---------------|---------------|--------|
| 26/04/2026 | Setup inicial del pipeline | — | ✅ Completado |

---

*Pipeline iniciado: 26/04/2026 — Versión 1.0*
