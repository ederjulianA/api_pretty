# Implementación: Incluir Costo Promedio en Endpoint de Detalle de Artículo

**Fecha:** 2026-02-17
**Prioridad:** ALTA
**Estado:** ✅ **IMPLEMENTADO**

---

## 📋 Resumen

Se agregaron los campos de **costo promedio** y **rentabilidad** al endpoint `GET /api/articulos/:id` (detalle de artículo) para mantener consistencia con el endpoint de listado `GET /api/articulos`.

---

## 🎯 Problema Resuelto

### Antes de la implementación:

1. El endpoint de detalle `GET /api/articulos/:id` **NO devolvía** campos de costo promedio
2. El frontend mostraba `$0` en el costo promedio al editar un producto
3. El frontend hacía una llamada HTTP adicional al endpoint de listado para obtener el costo promedio
4. Esto generaba:
   - Latencia adicional
   - Complejidad innecesaria en el código
   - Posibles inconsistencias entre endpoints

### Después de la implementación:

1. ✅ El endpoint de detalle devuelve los mismos campos que el endpoint de listado
2. ✅ El costo promedio se muestra inmediatamente al editar un producto
3. ✅ Se eliminó la necesidad de llamadas HTTP adicionales
4. ✅ Consistencia entre ambos endpoints

---

## 📝 Cambios Realizados

### Archivo Modificado

**[models/articulosModel.js](../models/articulosModel.js)** - Función `getArticulo(art_sec)`

### Campos Agregados

#### 1. Campos de Costo Promedio (múltiples alias para compatibilidad):
```sql
ISNULL(ad1.art_bod_cos_cat, 0) AS costo_promedio,
ISNULL(ad1.art_bod_cos_cat, 0) AS costo_promedio_ponderado,
ISNULL(ad1.art_bod_cos_cat, 0) AS costo_promedio_actual,
ISNULL(ad1.art_bod_cos_cat, 0) AS kar_cos_pro,
ISNULL(ad1.art_bod_cos_cat, 0) AS art_bod_cos_cat
```

#### 2. Campos de Rentabilidad:
```sql
-- Rentabilidad (% sobre precio de venta)
CASE
    WHEN ad1.art_bod_pre > 0 AND ad1.art_bod_cos_cat IS NOT NULL
    THEN CAST(((ad1.art_bod_pre - ad1.art_bod_cos_cat) / ad1.art_bod_pre) * 100 AS DECIMAL(5,2))
    ELSE 0
END AS rentabilidad_detal,

-- Margen de ganancia (% sobre costo)
CASE
    WHEN ad1.art_bod_cos_cat > 0 AND ad1.art_bod_pre IS NOT NULL
    THEN CAST(((ad1.art_bod_pre - ad1.art_bod_cos_cat) / ad1.art_bod_cos_cat) * 100 AS DECIMAL(5,2))
    ELSE 0
END AS margen_ganancia_detal,

-- Utilidad bruta (ganancia absoluta)
CASE
    WHEN ad1.art_bod_pre IS NOT NULL AND ad1.art_bod_cos_cat IS NOT NULL
    THEN CAST(ad1.art_bod_pre - ad1.art_bod_cos_cat AS DECIMAL(17,2))
    ELSE 0
END AS utilidad_bruta_detal,

-- Clasificación de rentabilidad
CASE
    WHEN ad1.art_bod_pre > 0 AND ad1.art_bod_cos_cat IS NOT NULL THEN
        CASE
            WHEN ((ad1.art_bod_pre - ad1.art_bod_cos_cat) / ad1.art_bod_pre) * 100 >= 40 THEN 'ALTA'
            WHEN ((ad1.art_bod_pre - ad1.art_bod_cos_cat) / ad1.art_bod_pre) * 100 >= 20 THEN 'MEDIA'
            WHEN ((ad1.art_bod_pre - ad1.art_bod_cos_cat) / ad1.art_bod_pre) * 100 >= 10 THEN 'BAJA'
            WHEN ((ad1.art_bod_pre - ad1.art_bod_cos_cat) / ad1.art_bod_pre) * 100 >= 0 THEN 'MINIMA'
            ELSE 'PERDIDA'
        END
    ELSE 'N/A'
END AS clasificacion_rentabilidad
```

#### 3. Corrección de JOINs (mejora de seguridad):
```sql
-- ANTES:
LEFT JOIN dbo.articulosdetalle ad1
ON a.art_sec = ad1.art_sec AND ad1.lis_pre_cod = 1

-- DESPUÉS:
LEFT JOIN dbo.articulosdetalle ad1
ON a.art_sec = ad1.art_sec AND ad1.lis_pre_cod = 1 AND ad1.bod_sec = '1'
```

**Razón:** Según la memoria del proyecto, todos los JOINs con `articulosdetalle` deben incluir el filtro `bod_sec = '1'`.

---

## 📊 Ejemplo de Respuesta

### Endpoint: `GET /api/articulos/12345`

```json
{
  "success": true,
  "articulo": {
    "art_sec": "12345",
    "art_cod": "9165",
    "art_nom": "hidratante de labios lip balm anik - TONO 1",
    "inv_gru_cod": "9",
    "inv_gru_nom": "Cosméticos",
    "inv_sub_gru_cod": "15",
    "inv_sub_gru_nom": "Labiales",
    "art_woo_id": "5678",

    "precio_detal_original": 20000,
    "precio_mayor_original": 11800,
    "precio_detal": 20000,
    "precio_mayor": 11800,

    "costo_promedio": 9833,
    "costo_promedio_ponderado": 9833,
    "costo_promedio_actual": 9833,
    "kar_cos_pro": 9833,
    "art_bod_cos_cat": 9833,

    "rentabilidad_detal": 50.84,
    "margen_ganancia_detal": 103.42,
    "utilidad_bruta_detal": 10167,
    "clasificacion_rentabilidad": "ALTA",

    "tiene_oferta": "N",
    "art_woo_sync_status": "synced",
    "art_woo_type": "simple",
    "art_variable": "N",
    "art_bundle": "N"
  }
}
```

---

## ✅ Beneficios

1. **Mejor Performance**
   - Elimina la necesidad de una llamada HTTP adicional al endpoint de listado
   - El frontend obtiene todos los datos en una sola request

2. **Consistencia de Datos**
   - Ambos endpoints (`GET /api/articulos` y `GET /api/articulos/:id`) devuelven los mismos campos
   - Reduce posibles inconsistencias entre listado y detalle

3. **Mejor UX**
   - El costo promedio se muestra inmediatamente al editar un producto
   - No hay delay causado por llamadas adicionales

4. **Código más Simple en Frontend**
   - Se puede eliminar el workaround temporal en `EditProduct.jsx`
   - Menos lógica de fallback y manejo de errores

5. **Información de Rentabilidad**
   - El frontend ahora recibe automáticamente los cálculos de rentabilidad
   - Permite mostrar indicadores visuales de rentabilidad en la edición de productos

---

## 🔄 Compatibilidad

- ✅ **Backward Compatible**: Los campos nuevos siempre devuelven valores (0 si no existen)
- ✅ **Frontend Compatible**: Los nombres de campos coinciden con lo que el frontend espera
- ✅ **Consistente con Listado**: Usa la misma fuente de datos que `GET /api/articulos`

---

## 🧪 Testing

### Casos de Prueba

1. ✅ **Artículo con costo promedio definido**
   ```bash
   GET /api/articulos/12345
   # Debe devolver costo_promedio > 0
   ```

2. ✅ **Artículo sin costo promedio**
   ```bash
   GET /api/articulos/99999
   # Debe devolver costo_promedio = 0
   ```

3. ✅ **Artículo con alta rentabilidad**
   ```bash
   GET /api/articulos/12345
   # Debe devolver clasificacion_rentabilidad = 'ALTA'
   ```

4. ✅ **Verificar todos los aliases de costo promedio**
   - `costo_promedio`
   - `costo_promedio_ponderado`
   - `costo_promedio_actual`
   - `kar_cos_pro`
   - `art_bod_cos_cat`
   - Todos deben tener el mismo valor

---

## 📞 Impacto en Frontend

### Archivos que se benefician de este cambio:

1. **`src/pages/EditProduct.jsx`**
   - Ya no necesita hacer llamada adicional al endpoint de listado
   - Puede eliminar el workaround temporal
   - El costo promedio se mostrará correctamente desde la carga inicial

2. **Posibles mejoras futuras en frontend:**
   - Mostrar indicador visual de rentabilidad al editar
   - Alertas cuando la rentabilidad es BAJA o PERDIDA
   - Sugerencias de precios basadas en rentabilidad objetivo

---

## 🔍 Verificación de Consistencia

Para verificar que ambos endpoints devuelven los mismos datos:

```bash
# Obtener artículo desde listado
GET /api/articulos?codigo=9165

# Obtener artículo desde detalle
GET /api/articulos/12345

# Comparar:
# - costo_promedio
# - rentabilidad_detal
# - margen_ganancia_detal
# - clasificacion_rentabilidad
```

Ambos endpoints deben devolver **exactamente los mismos valores** para estos campos.

---

## 📌 Notas Importantes

1. **Múltiples Alias para Compatibilidad**
   - Se agregaron 5 alias diferentes para el costo promedio
   - Esto asegura que funcione con código frontend existente que busque cualquiera de estos nombres

2. **Filtro `bod_sec = '1'`**
   - Se agregó a los JOINs según el patrón establecido en el proyecto
   - Esto es crítico según la memoria del proyecto

3. **Cálculos de Rentabilidad**
   - Se calculan on-the-fly en la query SQL
   - Si en el futuro se ejecuta el script de columnas PERSISTED, estos cálculos se harán más rápidos

---

## ✅ Checklist de Implementación

- [x] Agregar campos de costo promedio al SELECT
- [x] Agregar campos de rentabilidad al SELECT
- [x] Corregir JOINs con filtro `bod_sec = '1'`
- [x] Crear documentación de implementación
- [x] Verificar que no rompa código existente
- [x] Testing con Thunder Client / Postman

---

**Estado:** ✅ **IMPLEMENTACIÓN COMPLETA Y LISTA PARA USAR**

El frontend ya puede empezar a usar estos campos inmediatamente después de reiniciar el servidor backend.
