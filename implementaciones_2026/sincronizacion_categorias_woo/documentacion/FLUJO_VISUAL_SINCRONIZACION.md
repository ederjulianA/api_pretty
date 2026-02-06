# Flujo Visual: Sincronización de Categorías

**Fecha:** 2026-02-05

---

## Diagrama de Arquitectura

```
┌─────────────────────────────────────────────────────────────────────┐
│                        SISTEMA API PRETTY                           │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    Base de Datos SQL Server                   │  │
│  │                                                               │  │
│  │  ┌─────────────────┐    ┌────────────────────┐              │  │
│  │  │ inventario_grupo│    │inventario_subgrupo │              │  │
│  │  │ (Categorías)    │───▶│  (Subcategorías)   │              │  │
│  │  └─────────────────┘    └────────┬───────────┘              │  │
│  │                                   │                          │  │
│  │                                   ▼                          │  │
│  │                          ┌─────────────────┐                │  │
│  │                          │   articulos     │                │  │
│  │                          │   (Productos)   │                │  │
│  │                          └────────┬────────┘                │  │
│  │                                   │                          │  │
│  │  ┌────────────────────────────────┴──────────────────────┐  │  │
│  │  │            ArticuloHook (Tabla de Auditoría)          │  │  │
│  │  │                                                        │  │  │
│  │  │  • ArtHookCatSysCod/Nombre (Sistema Local)           │  │  │
│  │  │  • ArtHookSubcatSysCod/Nombre (Sistema Local)        │  │  │
│  │  │  • ArtHookCatWooId/Nombre (WooCommerce)              │  │  │
│  │  │  • ArtHookSubcatWooId/Nombre (WooCommerce)           │  │  │
│  │  │  • ArtHookCategoriaMatch (1=Coincide, 0=Discrepancia)│  │  │
│  │  │  • ArtHookCatFechaVerificacion (Timestamp)           │  │  │
│  │  └────────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                   Backend (Node.js + Express)                │  │
│  │                                                               │  │
│  │  ┌──────────────────────────────────────────────────────┐   │  │
│  │  │  wooSyncController.js                                │   │  │
│  │  │                                                       │   │  │
│  │  │  • syncWooProducts()  ─────────┐                     │   │  │
│  │  │  • auditCategories()           │                     │   │  │
│  │  │  • fixProductCategory()        │                     │   │  │
│  │  └────────────────────────────────┼───────────────────┘   │  │
│  │                                   │                        │  │
│  └───────────────────────────────────┼────────────────────────┘  │
│                                      │                           │
└──────────────────────────────────────┼───────────────────────────┘
                                       │
                                       │ WooCommerce API
                                       │ (REST API v3)
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          WOOCOMMERCE                                │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                     WooCommerce Database                      │  │
│  │                                                               │  │
│  │  ┌────────────────┐         ┌─────────────────┐             │  │
│  │  │   Products     │────────▶│   Categories    │             │  │
│  │  │   (Productos)  │         │   (Categorías)  │             │  │
│  │  └────────────────┘         └─────────────────┘             │  │
│  │                                                               │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Flujo 1: Sincronización de Productos (syncWooProducts)

```
┌─────────┐
│  INICIO │
└────┬────┘
     │
     ▼
┌────────────────────────────────────────┐
│ POST /api/woo/sync                     │
│ (Usuario ejecuta sincronización)       │
└────┬───────────────────────────────────┘
     │
     ▼
┌────────────────────────────────────────┐
│ WooCommerce API                        │
│ GET /products?per_page=100&page=1      │
│                                        │
│ Retorna:                               │
│ {                                      │
│   id, sku, name, categories: [        │
│     { id: 12, name: "Maquillaje" },   │
│     { id: 45, name: "Labiales" }      │
│   ]                                    │
│ }                                      │
└────┬───────────────────────────────────┘
     │
     ▼
┌────────────────────────────────────────┐
│ Para cada producto:                    │
│                                        │
│ 1. Extraer SKU y categorías WooCommerce│
└────┬───────────────────────────────────┘
     │
     ▼
┌────────────────────────────────────────┐
│ SQL Query: Obtener categorías del      │
│            sistema local               │
│                                        │
│ SELECT                                 │
│   ig.inv_gru_nom AS cat_sys_nombre,   │
│   isg.inv_sub_gru_nom AS subcat_nombre│
│ FROM articulos a                       │
│ JOIN inventario_subgrupo isg ...       │
│ JOIN inventario_grupo ig ...           │
│ WHERE a.art_cod = @sku                 │
└────┬───────────────────────────────────┘
     │
     ▼
┌────────────────────────────────────────┐
│ Comparar categorías:                   │
│                                        │
│ Sistema Local:                         │
│   Categoría: "Maquillaje"              │
│   Subcategoría: "Labiales"             │
│                                        │
│ WooCommerce:                           │
│   Categoría: "Makeup"                  │
│   Subcategoría: "Labiales"             │
│                                        │
│ ¿Coinciden?                            │
└────┬───────────────────────────────────┘
     │
     ├─── Sí (match) ────▶ ArtHookCategoriaMatch = 1
     │
     └─── No (mismatch) ─▶ ArtHookCategoriaMatch = 0
                           (Log warning)
     │
     ▼
┌────────────────────────────────────────┐
│ UPDATE/INSERT ArticuloHook             │
│                                        │
│ SET                                    │
│   ArtHookCatSysNombre = 'Maquillaje',  │
│   ArtHookSubcatSysNombre = 'Labiales', │
│   ArtHookCatWooNombre = 'Makeup',      │
│   ArtHookSubcatWooNombre = 'Labiales', │
│   ArtHookCategoriaMatch = 0,           │
│   ArtHookCatFechaVerificacion = NOW()  │
│ WHERE ArtHookCod = @sku                │
└────┬───────────────────────────────────┘
     │
     ▼
┌────────────────────────────────────────┐
│ ¿Más productos por sincronizar?        │
└────┬───────────────────────────────────┘
     │
     ├─── Sí ───▶ (Siguiente producto)
     │
     └─── No ───▶ Retornar estadísticas
                  {
                    totalProcessed: 150,
                    totalUpdated: 120,
                    totalCreated: 30
                  }
     │
     ▼
┌────────┐
│  FIN   │
└────────┘
```

---

## Flujo 2: Auditoría de Categorías (auditCategories)

```
┌─────────┐
│  INICIO │
└────┬────┘
     │
     ▼
┌────────────────────────────────────────┐
│ GET /api/woo/audit-categories          │
│ Query: ?onlyMismatches=true            │
│ (Usuario solicita auditoría)           │
└────┬───────────────────────────────────┘
     │
     ▼
┌────────────────────────────────────────┐
│ SQL Query: Obtener productos           │
│                                        │
│ SELECT                                 │
│   ArtHookCod,                          │
│   ArtHookCatSysNombre,                 │
│   ArtHookCatWooNombre,                 │
│   ArtHookCategoriaMatch                │
│ FROM ArticuloHook                      │
│ WHERE ArtHookCategoriaMatch = 0        │
│   (si onlyMismatches = true)           │
└────┬───────────────────────────────────┘
     │
     ▼
┌────────────────────────────────────────┐
│ Calcular estadísticas:                 │
│                                        │
│ Total: 150 productos                   │
│ Coincidencias: 120 (80%)               │
│ Discrepancias: 25 (17%)                │
│ Sin verificar: 5 (3%)                  │
└────┬───────────────────────────────────┘
     │
     ▼
┌────────────────────────────────────────┐
│ Retornar JSON:                         │
│                                        │
│ {                                      │
│   success: true,                       │
│   stats: { ... },                      │
│   data: [                              │
│     {                                  │
│       sku: "PROD123",                  │
│       categoria_sistema: "Maquillaje", │
│       categoria_woocommerce: "Makeup", │
│       estado: "Discrepancia"           │
│     },                                 │
│     ...                                │
│   ]                                    │
│ }                                      │
└────┬───────────────────────────────────┘
     │
     ▼
┌────────┐
│  FIN   │
└────────┘
```

---

## Flujo 3: Corrección de Categoría (fixProductCategory)

### Opción A: sync-to-woo (Recomendado)

```
┌─────────┐
│  INICIO │
└────┬────┘
     │
     ▼
┌────────────────────────────────────────┐
│ POST /api/woo/fix-category             │
│ Body: {                                │
│   art_cod: "PROD123",                  │
│   action: "sync-to-woo"                │
│ }                                      │
└────┬───────────────────────────────────┘
     │
     ▼
┌────────────────────────────────────────┐
│ SQL Query: Obtener datos del sistema   │
│            local                       │
│                                        │
│ SELECT                                 │
│   a.art_woo_id,                        │
│   isg.inv_sub_gru_woo_id,              │
│   isg.inv_sub_gru_parend_woo,          │
│   ig.inv_gru_nom AS categoria          │
│ FROM articulos a                       │
│ JOIN inventario_subgrupo isg ...       │
│ JOIN inventario_grupo ig ...           │
│ WHERE a.art_cod = 'PROD123'            │
└────┬───────────────────────────────────┘
     │
     ▼
┌────────────────────────────────────────┐
│ Resultado:                             │
│   art_woo_id: 789                      │
│   inv_sub_gru_woo_id: 45               │
│   inv_sub_gru_parend_woo: 12           │
│   categoria: "Maquillaje"              │
└────┬───────────────────────────────────┘
     │
     ▼
┌────────────────────────────────────────┐
│ WooCommerce API                        │
│ PUT /products/789                      │
│                                        │
│ Body: {                                │
│   categories: [                        │
│     { id: 12 },  // Padre              │
│     { id: 45 }   // Hija               │
│   ]                                    │
│ }                                      │
└────┬───────────────────────────────────┘
     │
     ▼
┌────────────────────────────────────────┐
│ ✅ WooCommerce actualizado             │
│                                        │
│ Producto 789 ahora tiene:              │
│   - Categoría: "Maquillaje" (ID 12)    │
│   - Subcategoría: "Labiales" (ID 45)   │
└────┬───────────────────────────────────┘
     │
     ▼
┌────────────────────────────────────────┐
│ SQL: Actualizar ArticuloHook           │
│                                        │
│ UPDATE ArticuloHook                    │
│ SET ArtHookCategoriaMatch = 1,         │
│     ArtHookCatFechaVerificacion = NOW()│
│ WHERE ArtHookCod = 'PROD123'           │
└────┬───────────────────────────────────┘
     │
     ▼
┌────────────────────────────────────────┐
│ Retornar éxito:                        │
│                                        │
│ {                                      │
│   success: true,                       │
│   message: "Categorías actualizadas",  │
│   action: "sync-to-woo",               │
│   product: "PROD123"                   │
│ }                                      │
└────┬───────────────────────────────────┘
     │
     ▼
┌────────┐
│  FIN   │
└────────┘
```

### Opción B: sync-from-woo (NO Recomendado)

```
┌─────────┐
│  INICIO │
└────┬────┘
     │
     ▼
┌────────────────────────────────────────┐
│ POST /api/woo/fix-category             │
│ Body: {                                │
│   art_cod: "PROD123",                  │
│   action: "sync-from-woo"              │
│ }                                      │
│                                        │
│ ⚠️  WARNING: No recomendado            │
└────┬───────────────────────────────────┘
     │
     ▼
┌────────────────────────────────────────┐
│ SQL: Obtener categorías de WooCommerce │
│      almacenadas en ArticuloHook       │
│                                        │
│ SELECT                                 │
│   ArtHookSubcatWooId,                  │
│   ArtHookSubcatWooNombre               │
│ FROM ArticuloHook                      │
│ WHERE ArtHookCod = 'PROD123'           │
└────┬───────────────────────────────────┘
     │
     ▼
┌────────────────────────────────────────┐
│ Resultado:                             │
│   ArtHookSubcatWooId: 45               │
│   ArtHookSubcatWooNombre: "Labiales"   │
└────┬───────────────────────────────────┘
     │
     ▼
┌────────────────────────────────────────┐
│ SQL: Mapear ID de WooCommerce a        │
│      código del sistema local          │
│                                        │
│ SELECT inv_sub_gru_cod                 │
│ FROM inventario_subgrupo               │
│ WHERE inv_sub_gru_woo_id = 45          │
└────┬───────────────────────────────────┘
     │
     ▼
┌────────────────────────────────────────┐
│ ¿Se encontró mapeo?                    │
└────┬───────────────────────────────────┘
     │
     ├─── NO ───▶ Error 400:
     │            "No se encontró mapeo para
     │             categoría de WooCommerce"
     │
     └─── SÍ ───▶ inv_sub_gru_cod = "LAB01"
     │
     ▼
┌────────────────────────────────────────┐
│ SQL: Actualizar producto en sistema    │
│      local                             │
│                                        │
│ UPDATE articulos                       │
│ SET inv_sub_gru_cod = 'LAB01'          │
│ WHERE art_cod = 'PROD123'              │
└────┬───────────────────────────────────┘
     │
     ▼
┌────────────────────────────────────────┐
│ ⚠️  Sistema local modificado           │
│                                        │
│ Producto PROD123 ahora tiene:          │
│   - inv_sub_gru_cod: "LAB01"           │
│     (categoría de WooCommerce)         │
└────┬───────────────────────────────────┘
     │
     ▼
┌────────────────────────────────────────┐
│ SQL: Actualizar ArticuloHook           │
│                                        │
│ UPDATE ArticuloHook                    │
│ SET ArtHookCategoriaMatch = 1,         │
│     ArtHookCatFechaVerificacion = NOW()│
│ WHERE ArtHookCod = 'PROD123'           │
└────┬───────────────────────────────────┘
     │
     ▼
┌────────────────────────────────────────┐
│ Retornar éxito con advertencia:        │
│                                        │
│ {                                      │
│   success: true,                       │
│   warning: "NO recomendado",           │
│   action: "sync-from-woo",             │
│   product: "PROD123"                   │
│ }                                      │
└────┬───────────────────────────────────┘
     │
     ▼
┌────────┐
│  FIN   │
└────────┘
```

---

## Flujo Completo: Ciclo de Vida

```
┌─────────────────────────────────────────────────────────────┐
│                   CICLO DE VIDA COMPLETO                    │
└─────────────────────────────────────────────────────────────┘

DÍA 1 - SETUP INICIAL
─────────────────────
1. Ejecutar migración SQL
   └─▶ ArticuloHook tiene 10 campos nuevos

2. Reiniciar servidor
   └─▶ Endpoints disponibles

3. Primera sincronización
   └─▶ POST /api/woo/sync
       └─▶ ArticuloHook poblado con categorías


DÍA 2 - AUDITORÍA
─────────────────
4. Revisar estado
   └─▶ GET /api/woo/audit-categories
       └─▶ Se detectan 25 discrepancias

5. Exportar discrepancias
   └─▶ GET /api/woo/audit-categories?onlyMismatches=true
       └─▶ Guardar en Excel para revisión


DÍA 3 - CORRECCIÓN
─────────────────
6. Revisar discrepancias manualmente
   └─▶ Decidir fuente de verdad por producto

7. Corregir productos
   └─▶ POST /api/woo/fix-category (uno por uno)
       └─▶ Categorías actualizadas en WooCommerce

8. Re-sincronizar
   └─▶ POST /api/woo/sync
       └─▶ ArtHookCategoriaMatch actualizado


DÍA 4+ - MANTENIMIENTO
──────────────────────
9. Job nocturno (3 AM)
   └─▶ POST /api/woo/sync
       └─▶ Detecta nuevas discrepancias automáticamente

10. Reporte semanal
    └─▶ GET /api/woo/audit-categories
        └─▶ Email con estadísticas

11. Corrección continua
    └─▶ POST /api/woo/fix-category
        └─▶ Mantener < 5% discrepancias
```

---

## Estado de ArticuloHook en Diferentes Momentos

### Antes de la Implementación

```
ArticuloHook
────────────────────────────────────────────
ArtHookCod | ArtHooName        | ArtHooStok
────────────────────────────────────────────
PROD001    | Labial Mate Rojo  | 50
PROD002    | Sombra Azul       | 30
PROD003    | Crema Hidratante  | 100
────────────────────────────────────────────
(Solo precios y stock)
```

### Después de Migración SQL (Sin datos aún)

```
ArticuloHook
──────────────────────────────────────────────────────────────────
ArtHookCod | ArtHookCatSysNombre | ArtHookCatWooNombre | ...Match
──────────────────────────────────────────────────────────────────
PROD001    | NULL                | NULL                | NULL
PROD002    | NULL                | NULL                | NULL
PROD003    | NULL                | NULL                | NULL
──────────────────────────────────────────────────────────────────
(Campos nuevos vacíos)
```

### Después de Primera Sincronización

```
ArticuloHook
────────────────────────────────────────────────────────────────────────────────
ArtHookCod | ArtHookCatSysNombre | ArtHookCatWooNombre | ...Match | FechaVerif
────────────────────────────────────────────────────────────────────────────────
PROD001    | Maquillaje          | Maquillaje          | 1        | 2026-02-05
PROD002    | Maquillaje          | Makeup              | 0        | 2026-02-05
PROD003    | Skincare            | Skincare            | 1        | 2026-02-05
────────────────────────────────────────────────────────────────────────────────
(Campos poblados, discrepancia detectada en PROD002)
```

### Después de Corrección

```
ArticuloHook
────────────────────────────────────────────────────────────────────────────────
ArtHookCod | ArtHookCatSysNombre | ArtHookCatWooNombre | ...Match | FechaVerif
────────────────────────────────────────────────────────────────────────────────
PROD001    | Maquillaje          | Maquillaje          | 1        | 2026-02-05
PROD002    | Maquillaje          | Maquillaje          | 1        | 2026-02-06  ← Corregido
PROD003    | Skincare            | Skincare            | 1        | 2026-02-05
────────────────────────────────────────────────────────────────────────────────
(Discrepancia corregida, ArtHookCategoriaMatch = 1)
```

---

## Mapa de Decisiones

```
                     ┌────────────────────┐
                     │ ¿Necesito auditar? │
                     └─────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
           SÍ │                │ NO             │
              ▼                ▼                ▼
   GET /audit-categories   (Continuar    POST /fix-category
                           trabajando)    (Corrección directa)
              │
              ▼
   ┌──────────────────┐
   │ ¿Discrepancias?  │
   └────────┬─────────┘
            │
       ┌────┼────┐
       │    │    │
    SÍ │    │ NO │
       ▼    ▼    ▼
   Corregir │  ¡Todo OK!
            │
            ▼
   ┌─────────────────────┐
   │ ¿Qué acción tomar?  │
   └──────────┬──────────┘
              │
     ┌────────┼────────┐
     │                 │
     ▼                 ▼
 sync-to-woo     sync-from-woo
 (Recomendado)   (NO recomendado)
     │                 │
     ▼                 ▼
 Sistema Local    WooCommerce
 → WooCommerce    → Sistema Local
     │                 │
     └────────┬────────┘
              ▼
   ┌─────────────────────┐
   │ Re-sincronizar      │
   │ POST /sync          │
   └─────────────────────┘
              │
              ▼
   ┌─────────────────────┐
   │ Verificar           │
   │ GET /audit-categories│
   └─────────────────────┘
```

---

## Leyenda de Símbolos

```
┌─────┐
│ Box │  Proceso o acción
└─────┘

   │
   ▼      Flujo de datos

───▶      Flujo condicional

✅        Acción recomendada
⚠️         Advertencia
❌        Error o no recomendado

[TABLA]   Base de datos
{JSON}    API Response
```

---

**Fin del documento de flujo visual**

**Fecha:** 2026-02-05
