# Resumen Ejecutivo - Analisis Endpoint /api/articulos

**Fecha:** 2026-02-28

## Metricas del analisis

| Metrica | Valor |
|---------|-------|
| Lineas de codigo analizadas | ~2,300 (3 archivos) |
| Hallazgos criticos | 7 |
| Hallazgos de performance | 8 |
| Hallazgos de buenas practicas | 9 |
| **Total hallazgos** | **24** |

---

## Top 10 - Ordenado por prioridad (impacto + facilidad de implementacion)

### Prioridad 1 - Arreglos rapidos y seguros (sin cambio de logica)

| # | Hallazgo | Esfuerzo | Riesgo de romper |
|---|----------|----------|-----------------|
| 1 | **Endpoints sin autenticacion** - POST/PUT sin `verifyToken` | 5 min | Bajo - solo agrega middleware |
| 2 | **Tipos SQL incorrectos** - `art_sec` como Decimal, `art_cod` VarChar(50), etc. | 30 min | Medio - probar cada endpoint |
| 3 | **WooCommerce API duplicada** - nueva instancia en cada update | 2 min | Nulo - solo cambiar variable |
| 4 | **5 alias identicos de costo_promedio** en getArticulo | 10 min | Bajo - solo en response |
| 5 | **Importaciones inconsistentes** en controller | 5 min | Nulo |

### Prioridad 2 - Optimizaciones de performance

| # | Hallazgo | Esfuerzo | Riesgo de romper |
|---|----------|----------|-----------------|
| 6 | **Usar columnas PERSISTED** de articulosdetalle en vez de recalcular | 1 hora | Medio - validar con bundles |
| 7 | **CTE intermedio para costo bundle** - eliminar 9 repeticiones del CASE | 1 hora | Medio - probar con datos reales |
| 8 | **getNextArticuloCodigo** - reemplazar loop N+1 por query unico | 30 min | Bajo - funcion aislada |
| 9 | **Paginacion sin total** - agregar COUNT(*) OVER() | 15 min | Bajo - solo agrega campo |

### Prioridad 3 - Mejoras estructurales (planificacion requerida)

| # | Hallazgo | Esfuerzo | Riesgo de romper |
|---|----------|----------|-----------------|
| 10 | **Transaccion con Cloudinary** - mover upload fuera de la transaccion | 1 hora | Medio - cambio de flujo |

---

## Guia de implementacion segura

### Principio: No romper nada

Dado que el endpoint esta productivo, toda modificacion debe seguir:

1. **Hacer cambio en una rama separada**
2. **Probar manualmente cada endpoint afectado** antes de merge:
   - `GET /api/articulos?PageNumber=1&PageSize=10`
   - `GET /api/articulos?nombre=test&tieneExistencia=1`
   - `GET /api/articulos/:id_articulo` (con art_sec numerico)
   - `POST /api/articulos` (crear articulo de prueba)
   - `PUT /api/articulos/:id_articulo` (actualizar articulo existente)
   - `GET /api/articulos/validar?art_cod=CODIGO`
   - `GET /api/articulos/articulo/:art_cod`
   - `GET /api/articulos/next-codigo/generate`
3. **Validar que WooCommerce sincroniza correctamente** despues de create/update
4. **Revisar logs** para confirmar que no hay errores nuevos
5. **Deploy en horario de bajo trafico**

### Orden recomendado de implementacion

```
Fase 1 (Seguridad - inmediato):
  -> Agregar verifyToken a todos los endpoints

Fase 2 (Quick wins - 1 dia):
  -> Corregir tipos SQL
  -> Usar instancia global wcApi
  -> Limpiar aliases duplicados de costo

Fase 3 (Performance - 1-2 dias):
  -> Optimizar query getArticulos (CTE intermedio + columnas PERSISTED)
  -> Optimizar getNextArticuloCodigo
  -> Agregar total a paginacion

Fase 4 (Arquitectura - cuando haya tiempo):
  -> Mover upload de imagenes fuera de transaccion
  -> Separar articulosModel en modulos
  -> Migrar console.log a Winston
```

---

## Notas sobre compatibilidad

- **Agregar `verifyToken`:** El frontend ya envia el token en otros endpoints. Solo necesita enviarlo tambien en estos. Verificar que el frontend actual SI envia `x-access-token` en todas las peticiones a `/api/articulos`.

- **Corregir tipos SQL:** Los cambios de tipo (ej: `sql.Decimal -> sql.VarChar` para art_sec) son transparentes si los valores actuales son siempre numericos. SQL Server convierte implicitamente, pero el nuevo tipo es mas correcto.

- **Paginacion con total:** Es un campo nuevo en la respuesta (`totalRecords`). El frontend existente puede ignorarlo si no lo usa. Cambio retrocompatible.

- **Columnas PERSISTED:** Solo aplican a productos simples. Los bundles siguen necesitando calculo manual del costo. El query optimizado debe mantener ambos paths.
