# Plantilla Excel para Carga Inicial de Costos

**Fecha:** 2026-02-09
**Proyecto:** API Pretty - Fase 0: Carga Inicial de Costos
**Relacionado con:** FASE_0_CARGA_INICIAL_COSTOS.md

---

## 📋 Estructura de la Plantilla

### Columnas del Excel

| # | Columna | Tipo | Editable | Descripción | Ejemplo |
|---|---------|------|----------|-------------|---------|
| A | `categoria` | Texto | ❌ NO | Categoría del producto (auto-completado) | "Labiales" |
| B | `subcategoria` | Texto | ❌ NO | Subcategoría del producto (auto-completado) | "Mate" |
| C | `art_cod` | Texto | ❌ NO | SKU del producto (auto-completado) | "RB001" |
| D | `art_nom` | Texto | ❌ NO | Nombre del producto (auto-completado) | "Labial Rojo Rubí" |
| E | `existencia` | Número | ❌ NO | Cantidad en stock actual (auto-completado) | 45 |
| F | `precio_venta_detal` | Moneda | ❌ NO | Precio de venta al detal (auto-completado) | 45,000 |
| G | `precio_venta_mayor` | Moneda | ❌ NO | Precio de venta mayorista (auto-completado) | 38,000 |
| **H** | **`costo_inicial`** | **Moneda** | **✅ SÍ** | **COSTO A CARGAR (usuario llena)** | **30,000** |
| I | `metodo` | Lista | ✅ SÍ | Método de obtención del costo | "ULTIMA_COMPRA" |
| J | `observaciones` | Texto | ✅ SÍ | Notas adicionales (opcional) | "Factura PRV-123" |

### Valores Permitidos en `metodo`

| Valor | Descripción |
|-------|-------------|
| `ULTIMA_COMPRA` | Costo tomado de factura de proveedor reciente |
| `REVERSO_40%` | Calculado desde precio venta con margen 40% |
| `REVERSO_50%` | Calculado desde precio venta con margen 50% |
| `REVERSO_60%` | Calculado desde precio venta con margen 60% |
| `ESTIMADO` | Estimación por categoría o similar |
| `MANUAL` | Otro método no listado |

---

## 📊 Ejemplo Visual de la Plantilla

```
┌────────────┬──────────────┬─────────┬──────────────────────────┬────────────┬─────────────────┬─────────────────┬───────────────┬────────────────┬─────────────────────┐
│ categoria  │ subcategoria │ art_cod │ art_nom                  │ existencia │ precio_venta_   │ precio_venta_   │ costo_inicial │ metodo         │ observaciones       │
│            │              │         │                          │            │ detal           │ mayor           │               │                │                     │
├────────────┼──────────────┼─────────┼──────────────────────────┼────────────┼─────────────────┼─────────────────┼───────────────┼────────────────┼─────────────────────┤
│ Labiales   │ Mate         │ RB001   │ Labial Rojo Rubí         │ 45         │ 45,000          │ 38,000          │ 30,000        │ ULTIMA_COMPRA  │ Factura PRV-123     │
│ Labiales   │ Mate         │ RB002   │ Labial Rosa Pastel       │ 30         │ 42,000          │ 35,000          │ 28,000        │ REVERSO_50%    │ Estimado            │
│ Labiales   │ Brillante    │ BR001   │ Brillo Labial Natural    │ 25         │ 38,000          │ 32,000          │               │                │                     │
│ Sombras    │ Mate         │ SM001   │ Sombra Mate Bronze       │ 40         │ 50,000          │ 42,000          │               │                │                     │
│ Sombras    │ Mate         │ SM002   │ Sombra Mate Dorada       │ 35         │ 52,000          │ 44,000          │               │                │                     │
│ Sombras    │ Shimmer      │ SS001   │ Sombra Shimmer Plata     │ 20         │ 55,000          │ 47,000          │               │                │                     │
│ Base       │ Líquida      │ BS001   │ Base Suave Tono Natural  │ 15         │ 65,000          │ 58,000          │               │                │                     │
│ Base       │ Líquida      │ BS002   │ Base Cobertura Total     │ 12         │ 72,000          │ 65,000          │               │                │                     │
│ Máscaras   │ Volumen      │ MV001   │ Máscara Volumen Extremo  │ 50         │ 48,000          │ 42,000          │               │                │                     │
│ Accesorios │ Brochas      │ BR101   │ Brocha para Rubor        │ 60         │ 28,000          │ 24,000          │               │                │                     │
└────────────┴──────────────┴─────────┴──────────────────────────┴────────────┴─────────────────┴─────────────────┴───────────────┴────────────────┴─────────────────────┘
```

**Nota:** Las columnas A-G son de **solo lectura** (generadas por el sistema). El usuario solo edita las columnas H, I, J.

---

## 🎯 Flujo de Trabajo por Categorías

### Escenario: Usuario quiere trabajar por categorías

**Total de productos:** 250

**Categorías:**
- Labiales: 30 productos
- Sombras: 40 productos
- Base: 20 productos
- Máscaras: 25 productos
- Accesorios: 135 productos

---

### Paso 1: Exportar Excel Completo

**Sistema genera archivo:** `carga_costos_inicial_2026-02-15.xlsx`

**Contenido:**
- 250 filas (todos los productos activos)
- Columnas A-G completas (auto-completadas)
- Columnas H-J vacías (para que usuario llene)

---

### Paso 2: Usuario Trabaja Categoría "Labiales"

**Acción del usuario:**

1. Abre Excel
2. Aplica **Filtro Automático** en columna `categoria`
3. Filtra solo "Labiales"
4. Ve solo 30 filas de labiales
5. Completa columna `costo_inicial` para esas 30 filas
6. Completa columna `metodo` (lista desplegable)
7. Agrega observaciones si necesita
8. Guarda el archivo (sin cambiar nombre)

**Ejemplo:**

```
Filtro: categoria = "Labiales"

┌────────────┬──────────────┬─────────┬────────────────────┬────────────┬─────────┬─────────┬───────────────┬────────────────┬─────────────────┐
│ categoria  │ subcategoria │ art_cod │ art_nom            │ existencia │ p_detal │ p_mayor │ costo_inicial │ metodo         │ observaciones   │
├────────────┼──────────────┼─────────┼────────────────────┼────────────┼─────────┼─────────┼───────────────┼────────────────┼─────────────────┤
│ Labiales   │ Mate         │ RB001   │ Labial Rojo Rubí   │ 45         │ 45,000  │ 38,000  │ 30,000 ✅     │ ULTIMA_COMPRA  │ Factura PRV-123 │
│ Labiales   │ Mate         │ RB002   │ Labial Rosa Pastel │ 30         │ 42,000  │ 35,000  │ 28,000 ✅     │ REVERSO_50%    │                 │
│ Labiales   │ Brillante    │ BR001   │ Brillo Natural     │ 25         │ 38,000  │ 32,000  │ 25,000 ✅     │ REVERSO_50%    │                 │
│ ... (27 filas más de labiales)                                                                                                                │
└────────────┴──────────────┴─────────┴────────────────────┴────────────┴─────────┴─────────┴───────────────┴────────────────┴─────────────────┘
```

---

### Paso 3: Primera Importación

**Usuario:** Hace clic en "Importar Excel" en el sistema

**Sistema procesa:**
- Lee archivo Excel
- Encuentra 250 filas
- 30 filas tienen `costo_inicial` lleno (Labiales)
- 220 filas tienen `costo_inicial` vacío (otras categorías)

**Resultado de importación:**

```
✓ Importación completada:
  - Total procesados: 30
  - Nuevos: 30
  - Actualizados: 0
  - Ignorados (sin costo): 220
```

**Base de datos ahora:**
- Tabla `carga_inicial_costos`: 30 registros (solo Labiales)
- Estado: PENDIENTE (esperando validación)

---

### Paso 4: Validación Automática

**Sistema ejecuta:** `sp_ValidarCargaInicialCostos`

**Resultados:**
- 28 registros → `VALIDADO` (margen entre 20-80%)
- 2 registros → `VALIDADO_CON_ALERTAS` (margen 18%, requiere revisión)
- 0 registros → `RECHAZADO`

**Usuario revisa:** Los 2 productos con alertas, confirma que están correctos

---

### Paso 5: Usuario Trabaja Categoría "Sombras"

**Acción del usuario:**

1. Abre **EL MISMO archivo Excel** (no crea uno nuevo)
2. Quita filtro de "Labiales"
3. Aplica filtro "Sombras"
4. Ve 40 filas de sombras
5. Completa `costo_inicial` para esas 40 filas
6. Guarda el archivo (mismo nombre)

**Estado del archivo:**

```
Total filas: 250
- Labiales (30): Tienen costo ✅
- Sombras (40): Tienen costo ✅ (NUEVO)
- Base (20): Sin costo aún
- Máscaras (25): Sin costo aún
- Accesorios (135): Sin costo aún
```

---

### Paso 6: Segunda Importación (INCREMENTAL)

**Usuario:** Hace clic en "Importar Excel" nuevamente

**Sistema procesa:**
- Lee archivo Excel
- Encuentra 250 filas
- 70 filas tienen `costo_inicial` lleno (30 Labiales + 40 Sombras)
- 180 filas sin costo

**🔑 CLAVE - Importación Incremental:**

```javascript
Para cada fila con costo:
  ¿Ya existe en tabla carga_inicial_costos?
    SÍ → ACTUALIZAR registro existente
    NO → INSERTAR nuevo registro
```

**Resultado de importación:**

```
✓ Importación completada:
  - Total procesados: 70
  - Nuevos: 40 (Sombras)
  - Actualizados: 30 (Labiales - se actualizaron por si cambió algo)
  - Ignorados (sin costo): 180
```

**✅ NO HAY ERROR DE "REGISTRO DUPLICADO"**

**Base de datos ahora:**
- Tabla `carga_inicial_costos`: 70 registros
  - 30 Labiales (actualizados)
  - 40 Sombras (nuevos)

---

### Paso 7: Aplicar Costos

**Usuario:** Cuando termina de cargar todas las categorías, hace clic en "Aplicar Costos"

**Sistema ejecuta:** `sp_AplicarCargaInicialCostos`

**Resultado:**
```sql
UPDATE articulosdetalle
SET art_bod_cos_cat = costo_de_tabla_temporal
WHERE estado = 'VALIDADO'
```

**Base de datos final:**
- `articulosdetalle.art_bod_cos_cat`: Actualizado para los productos cargados
- `historial_costos`: Registro de carga inicial

---

## 🔧 Script SQL para Generar Excel

```sql
-- Script para exportar datos a Excel
SELECT
    ig.inv_gru_nom AS categoria,
    isg.inv_sub_gru_nom AS subcategoria,
    a.art_cod,
    a.art_nom,
    ISNULL(ve.existencia, 0) AS existencia,
    ad_detal.art_bod_pre AS precio_venta_detal,
    ad_mayor.art_bod_pre AS precio_venta_mayor,
    NULL AS costo_inicial,  -- Usuario llenará
    NULL AS metodo,         -- Usuario llenará
    NULL AS observaciones   -- Usuario llenará
FROM articulos a
INNER JOIN inventario_subgrupo isg ON isg.inv_sub_gru_cod = a.inv_sub_gru_cod
INNER JOIN inventario_grupo ig ON ig.inv_gru_cod = isg.inv_gru_cod
LEFT JOIN vwExistencias ve ON ve.art_sec = a.art_sec
LEFT JOIN articulosdetalle ad_detal ON ad_detal.art_sec = a.art_sec
    AND ad_detal.bod_sec = '1'
    AND ad_detal.lis_pre_cod = 1  -- Precio detal
LEFT JOIN articulosdetalle ad_mayor ON ad_mayor.art_sec = a.art_sec
    AND ad_mayor.bod_sec = '1'
    AND ad_mayor.lis_pre_cod = 2  -- Precio mayor
WHERE a.art_sec IS NOT NULL  -- Solo productos activos
ORDER BY
    ig.inv_gru_nom,
    isg.inv_sub_gru_nom,
    a.art_nom
```

---

## 🎨 Formato Recomendado en Excel

### Encabezados

- **Fila 1:** Encabezados en negrita, fondo azul claro
- **Filtro automático:** Activado en fila 1

### Columnas

| Columna | Ancho | Formato | Protección |
|---------|-------|---------|------------|
| A (categoria) | 15 | Texto | 🔒 Bloqueada |
| B (subcategoria) | 15 | Texto | 🔒 Bloqueada |
| C (art_cod) | 12 | Texto | 🔒 Bloqueada |
| D (art_nom) | 35 | Texto | 🔒 Bloqueada |
| E (existencia) | 12 | Número (sin decimales) | 🔒 Bloqueada |
| F (precio_venta_detal) | 15 | Moneda COP | 🔒 Bloqueada |
| G (precio_venta_mayor) | 15 | Moneda COP | 🔒 Bloqueada |
| **H (costo_inicial)** | **15** | **Moneda COP** | **✅ Editable** |
| **I (metodo)** | **18** | **Lista desplegable** | **✅ Editable** |
| **J (observaciones)** | **30** | **Texto** | **✅ Editable** |

### Validaciones en Excel

**Columna H (costo_inicial):**
```excel
Validación de datos:
- Tipo: Decimal
- Permitir: >= 0
- Mensaje error: "El costo debe ser mayor o igual a cero"
```

**Columna I (metodo):**
```excel
Validación de datos:
- Tipo: Lista
- Origen: ULTIMA_COMPRA, REVERSO_40%, REVERSO_50%, REVERSO_60%, ESTIMADO, MANUAL
- Mostrar lista desplegable: SÍ
```

### Formato Condicional

**Columna H (costo_inicial):**

```excel
Regla 1: Si H es vacío → Fondo amarillo claro (pendiente)
Regla 2: Si H > 0 → Fondo verde claro (completado)
Regla 3: Si H > F (costo > precio venta) → Fondo rojo (ERROR)
```

**Columna E (existencia):**

```excel
Regla 1: Si E > 0 → Texto en negrita (prioridad alta)
Regla 2: Si E = 0 → Texto en gris (prioridad media)
```

---

## 📝 Instrucciones para el Usuario (Incluir en Excel)

**Hoja adicional "INSTRUCCIONES":**

```
═══════════════════════════════════════════════════════════════════════
  INSTRUCCIONES: Carga Inicial de Costos
═══════════════════════════════════════════════════════════════════════

1. COLUMNAS A-G: NO EDITAR (datos del sistema)

2. COLUMNA H (costo_inicial): OBLIGATORIA
   → Ingresar el costo de compra del producto
   → Puede ser:
     • Último precio pagado a proveedor (ideal)
     • Costo calculado desde precio venta
     • Costo estimado por categoría

3. COLUMNA I (metodo): OBLIGATORIA
   → Seleccionar de la lista desplegable cómo se obtuvo el costo

4. COLUMNA J (observaciones): OPCIONAL
   → Agregar notas (ej: "Factura PRV-123", "Estimado")

───────────────────────────────────────────────────────────────────────
  TRABAJO POR CATEGORÍAS (Recomendado)
───────────────────────────────────────────────────────────────────────

✓ Use el filtro de la columna "categoria" para trabajar por secciones
✓ Complete los costos de una categoría a la vez
✓ Puede importar múltiples veces SIN generar errores
✓ Si ya importó una categoría y modifica el costo, al volver a
  importar se ACTUALIZARÁ automáticamente

───────────────────────────────────────────────────────────────────────
  EJEMPLO DE CÁLCULO (Costo Reverso)
───────────────────────────────────────────────────────────────────────

Si NO tiene factura del proveedor, puede estimar el costo:

Fórmula: Costo = Precio Venta / (1 + Margen)

Ejemplo:
• Precio venta: $45,000
• Margen objetivo: 50% (productos masivos)
• Costo estimado: $45,000 / 1.50 = $30,000

Márgenes comunes en maquillaje:
• Productos masivos: 40-50% → dividir entre 1.40 o 1.50
• Productos premium: 50-70% → dividir entre 1.50 o 1.70
• Productos exclusivos: 60-80% → dividir entre 1.60 o 1.80

───────────────────────────────────────────────────────────────────────
  VALIDACIONES AUTOMÁTICAS
───────────────────────────────────────────────────────────────────────

Al importar, el sistema validará:

✓ Costo negativo → RECHAZADO
✗ Costo > Precio venta → RECHAZADO
⚠ Margen < 20% → ALERTA (requiere revisión)
✓ Margen entre 20-80% → APROBADO

───────────────────────────────────────────────────────────────────────
```

---

## 🔒 Protección del Excel

**Configuración recomendada:**

```vba
' Proteger hoja dejando solo columnas H, I, J editables
ActiveSheet.Protect Password:="", _
    DrawingObjects:=True, _
    Contents:=True, _
    Scenarios:=True, _
    AllowFiltering:=True, _
    AllowSorting:=True

' Desbloquear solo columnas H, I, J
Range("H:J").Locked = False
```

**Resultado:**
- Usuario NO puede editar columnas A-G (datos del sistema)
- Usuario SÍ puede editar columnas H-J (datos a cargar)
- Usuario SÍ puede filtrar y ordenar

---

## 📊 Reporte Post-Importación

**Después de cada importación, mostrar al usuario:**

```
╔═══════════════════════════════════════════════════════════╗
║  REPORTE DE IMPORTACIÓN                                   ║
╠═══════════════════════════════════════════════════════════╣
║                                                           ║
║  Fecha: 2026-02-15 10:30:25                              ║
║  Archivo: carga_costos_inicial_2026-02-15.xlsx          ║
║  Usuario: juan.perez                                     ║
║                                                           ║
║  ───────────────────────────────────────────────────     ║
║  RESUMEN                                                  ║
║  ───────────────────────────────────────────────────     ║
║                                                           ║
║  Total filas procesadas:         70                       ║
║  Registros nuevos:               40 (Sombras)            ║
║  Registros actualizados:         30 (Labiales)           ║
║  Ignorados (sin costo):         180                       ║
║                                                           ║
║  ───────────────────────────────────────────────────     ║
║  VALIDACIÓN AUTOMÁTICA                                    ║
║  ───────────────────────────────────────────────────     ║
║                                                           ║
║  ✓ Validados:                    65                       ║
║  ⚠ Con alertas (revisar):         5                       ║
║  ✗ Rechazados (corregir):         0                       ║
║                                                           ║
╠═══════════════════════════════════════════════════════════╣
║  PRODUCTOS CON ALERTAS                                    ║
╠═══════════════════════════════════════════════════════════╣
║                                                           ║
║  SM005 - Sombra Mate Coral                               ║
║  ⚠ Margen bajo (18%) - Revisar costo o precio venta     ║
║                                                           ║
║  SM012 - Sombra Mate Verde Oliva                         ║
║  ⚠ Margen bajo (19%) - Revisar costo o precio venta     ║
║                                                           ║
║  ... (3 más)                                             ║
║                                                           ║
╠═══════════════════════════════════════════════════════════╣
║  PRÓXIMOS PASOS                                          ║
╠═══════════════════════════════════════════════════════════╣
║                                                           ║
║  1. Revisar productos con alertas (si los hay)           ║
║  2. Continuar cargando más categorías                    ║
║  3. Cuando termine, hacer clic en "Aplicar Costos"       ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
```

---

## 🎯 Resumen de Ventajas

### ✅ Trabajo por Categorías
- Usuario filtra Excel por categoría
- Trabaja solo en lo que necesita
- No se confunde con 250 productos a la vez

### ✅ Importación Incremental
- Puede importar múltiples veces
- NO genera errores de duplicados
- Actualiza automáticamente registros existentes

### ✅ Validación en Excel
- Listas desplegables para `metodo`
- Formato condicional para detectar errores visuales
- Protección de columnas del sistema

### ✅ Validación en Sistema
- Rechaza costos negativos o mayores al precio
- Alerta sobre márgenes sospechosos
- Reporte detallado post-importación

---

**Documento creado por:** Claude Code
**Fecha:** 2026-02-09
**Versión:** 1.0
