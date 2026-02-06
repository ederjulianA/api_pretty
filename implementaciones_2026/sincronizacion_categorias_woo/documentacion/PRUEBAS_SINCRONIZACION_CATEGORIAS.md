# Guía de Pruebas - Sincronización de Categorías

**Fecha:** 2026-02-05
**Implementación:** [IMPLEMENTACION_SINCRONIZACION_CATEGORIAS.md](./IMPLEMENTACION_SINCRONIZACION_CATEGORIAS.md)

---

## Pre-requisitos

- ✅ SQL Server accesible
- ✅ Base de datos `artipla_system` activa
- ✅ Servidor Node.js corriendo (`npm run dev`)
- ✅ Token JWT válido (obtener via `POST /api/auth/login`)
- ✅ Acceso a WooCommerce API (credenciales en `.env`)

---

## Fase 1: Preparación - Migración de Base de Datos

### Paso 1.1: Backup de la Base de Datos (CRÍTICO)

```bash
# Crear backup antes de cualquier modificación
sqlcmd -S localhost -U sa -P your_password -Q "BACKUP DATABASE artipla_system TO DISK='/path/to/backup/artipla_system_backup_20260205.bak'"
```

### Paso 1.2: Ejecutar Script de Migración

```bash
# Conectarse a SQL Server
sqlcmd -S localhost -U sa -P your_password -d artipla_system

# Ejecutar migración
:r /Users/eder/Developer/GitHub/api_pretty/implementaciones_2026/sql/02_alter_articulohook_categorias.sql
GO
```

**Salida esperada:**
```
========================================
Iniciando migración de ArticuloHook
Fecha: 2026-02-05 10:30:00
========================================
Agregando campos de categorías a ArticuloHook...
Campos agregados exitosamente.
Creando índice para optimizar consultas de auditoría...
Índice IX_ArticuloHook_CategoriaMatch creado exitosamente.
Validación exitosa: Todos los campos se crearon correctamente.
========================================
Migración completada exitosamente
Campos agregados: 10
Índices creados: 1
========================================
```

### Paso 1.3: Validar Migración

```bash
# Ejecutar script de validación
:r /Users/eder/Developer/GitHub/api_pretty/implementaciones_2026/sql/02_validar_migracion.sql
GO
```

**Resultado esperado:**
```
✅ Tabla ArticuloHook existe.
Campos de categorías encontrados: 10/10
✅ Todos los campos existen.
✅ Índice IX_ArticuloHook_CategoriaMatch existe.
Total de registros en ArticuloHook: [número]
```

### Paso 1.4: Verificación Manual

```sql
-- Ver estructura de ArticuloHook
SELECT
    COLUMN_NAME,
    DATA_TYPE,
    CHARACTER_MAXIMUM_LENGTH,
    IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'ArticuloHook'
  AND COLUMN_NAME LIKE 'ArtHookCat%'
ORDER BY ORDINAL_POSITION;
```

**Campos esperados:**
- ArtHookCatSysCod
- ArtHookCatSysNombre
- ArtHookSubcatSysCod
- ArtHookSubcatSysNombre
- ArtHookCatWooId
- ArtHookCatWooNombre
- ArtHookSubcatWooId
- ArtHookSubcatWooNombre
- ArtHookCategoriaMatch
- ArtHookCatFechaVerificacion

✅ **Checkpoint:** Si todos los campos existen, continuar a Fase 2.

---

## Fase 2: Backend - Verificación de Código

### Paso 2.1: Verificar Sintaxis

```bash
cd /Users/eder/Developer/GitHub/api_pretty

# Verificar controlador
node --check controllers/wooSyncController.js

# Verificar rutas
node --check routes/wooSyncRoutes.js
```

**Salida esperada:** Sin errores (sin output)

### Paso 2.2: Reiniciar Servidor

```bash
# Si usas npm run dev (nodemon)
# El servidor se reiniciará automáticamente

# Si usas PM2
pm2 restart api_pretty

# Verificar logs
pm2 logs api_pretty --lines 50
```

**Logs esperados:**
```
Server running on port 3000
Database connected successfully
```

### Paso 2.3: Verificar Endpoints Registrados

```bash
# Listar todas las rutas (si tienes express-list-endpoints instalado)
curl http://localhost:3000/api/routes
```

**Rutas esperadas:**
- `POST /api/woo/sync`
- `GET /api/woo/audit-categories`
- `POST /api/woo/fix-category`

✅ **Checkpoint:** Si el servidor inicia sin errores, continuar a Fase 3.

---

## Fase 3: Pruebas de API

### Paso 3.1: Obtener Token JWT

```bash
# Login (ajustar credenciales)
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "usu_cod": "admin",
    "usu_pass": "admin123"
  }'
```

**Respuesta esperada:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "usuario": {...}
}
```

**Guardar el token:**
```bash
export JWT_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### Paso 3.2: Sincronizar Productos (Primera Vez)

```bash
# Sincronizar todos los productos
curl -X POST http://localhost:3000/api/woo/sync \
  -H "Content-Type: application/json" \
  -H "x-access-token: $JWT_TOKEN"
```

**Respuesta esperada:**
```json
{
  "success": true,
  "message": "Synchronization completed successfully",
  "stats": {
    "totalProcessed": 150,
    "totalUpdated": 120,
    "totalCreated": 30,
    "totalErrors": 0,
    "expectedTotal": 150
  }
}
```

**Validar en base de datos:**

```sql
-- Ver campos poblados
SELECT TOP 10
    ArtHookCod,
    ArtHooName,
    ArtHookCatSysNombre,
    ArtHookSubcatSysNombre,
    ArtHookCatWooNombre,
    ArtHookSubcatWooNombre,
    ArtHookCategoriaMatch,
    ArtHookCatFechaVerificacion
FROM ArticuloHook
WHERE ArtHookCatSysNombre IS NOT NULL
ORDER BY ArtHookCod;
```

**Resultado esperado:**
- Campos de categorías con valores (no NULL)
- `ArtHookCategoriaMatch` = 1 o 0
- `ArtHookCatFechaVerificacion` = fecha actual

✅ **Checkpoint:** Si los campos tienen datos, continuar a Paso 3.3.

### Paso 3.3: Auditar Categorías (Todos los Productos)

```bash
# Ver todos los productos
curl http://localhost:3000/api/woo/audit-categories \
  -H "x-access-token: $JWT_TOKEN" | jq
```

**Respuesta esperada:**
```json
{
  "success": true,
  "message": "Auditoría completada",
  "stats": {
    "total": 150,
    "coincidencias": 120,
    "discrepancias": 25,
    "sinVerificar": 5
  },
  "data": [
    {
      "sku": "PROD001",
      "nombre": "Labial Mate Rojo",
      "categoria_sistema": "Maquillaje",
      "subcategoria_sistema": "Labiales",
      "categoria_woocommerce": "Maquillaje",
      "subcategoria_woocommerce": "Labiales",
      "estado": "Coincide",
      "fecha_verificacion": "2026-02-05T10:30:00"
    }
  ]
}
```

### Paso 3.4: Auditar Solo Discrepancias

```bash
# Ver solo productos con discrepancias
curl "http://localhost:3000/api/woo/audit-categories?onlyMismatches=true" \
  -H "x-access-token: $JWT_TOKEN" | jq
```

**Respuesta esperada:**
```json
{
  "success": true,
  "stats": {
    "total": 25,
    "coincidencias": 0,
    "discrepancias": 25,
    "sinVerificar": 0
  },
  "data": [
    {
      "sku": "PROD123",
      "categoria_sistema": "Maquillaje",
      "subcategoria_sistema": "Labiales",
      "categoria_woocommerce": "Makeup",
      "subcategoria_woocommerce": "Labiales",
      "estado": "Discrepancia"
    }
  ]
}
```

✅ **Checkpoint:** Si el endpoint retorna datos correctos, continuar a Paso 3.5.

### Paso 3.5: Corregir Categoría Individual

**Prueba 1: Producto que existe en ambos sistemas**

```bash
# Obtener un SKU con discrepancia
export SKU_PRUEBA="PROD123"

# Corregir sincronizando desde sistema local a WooCommerce
curl -X POST http://localhost:3000/api/woo/fix-category \
  -H "Content-Type: application/json" \
  -H "x-access-token: $JWT_TOKEN" \
  -d "{
    \"art_cod\": \"$SKU_PRUEBA\",
    \"action\": \"sync-to-woo\"
  }" | jq
```

**Respuesta esperada:**
```json
{
  "success": true,
  "message": "Categorías actualizadas en WooCommerce desde el sistema local",
  "action": "sync-to-woo",
  "product": "PROD123",
  "categories": {
    "categoria": "Maquillaje",
    "subcategoria": "Labiales"
  }
}
```

**Validar en WooCommerce:**
1. Ir al admin de WooCommerce
2. Buscar producto `PROD123`
3. Verificar que las categorías coincidan con el sistema local

**Validar en ArticuloHook:**
```sql
SELECT
    ArtHookCod,
    ArtHookCatSysNombre,
    ArtHookSubcatSysNombre,
    ArtHookCatWooNombre,
    ArtHookSubcatWooNombre,
    ArtHookCategoriaMatch,
    ArtHookCatFechaVerificacion
FROM ArticuloHook
WHERE ArtHookCod = 'PROD123';
```

**Resultado esperado:**
- `ArtHookCategoriaMatch` = 1 (aún no, necesita nueva sincronización)
- `ArtHookCatFechaVerificacion` = fecha actualizada

**Prueba 2: Producto sin art_woo_id (debe fallar)**

```bash
curl -X POST http://localhost:3000/api/woo/fix-category \
  -H "Content-Type: application/json" \
  -H "x-access-token: $JWT_TOKEN" \
  -d '{
    "art_cod": "PROD_SIN_WOO_ID",
    "action": "sync-to-woo"
  }' | jq
```

**Respuesta esperada:**
```json
{
  "success": false,
  "message": "El producto no tiene art_woo_id. No está sincronizado con WooCommerce."
}
```

**Prueba 3: Parámetros inválidos**

```bash
curl -X POST http://localhost:3000/api/woo/fix-category \
  -H "Content-Type: application/json" \
  -H "x-access-token: $JWT_TOKEN" \
  -d '{
    "art_cod": "PROD123"
  }' | jq
```

**Respuesta esperada:**
```json
{
  "success": false,
  "message": "Parámetros requeridos: art_cod, action"
}
```

✅ **Checkpoint:** Si las correcciones funcionan correctamente, continuar a Fase 4.

---

## Fase 4: Pruebas de Integración

### Paso 4.1: Flujo Completo

```bash
# 1. Sincronizar productos
curl -X POST http://localhost:3000/api/woo/sync \
  -H "x-access-token: $JWT_TOKEN"

# 2. Ver discrepancias
curl "http://localhost:3000/api/woo/audit-categories?onlyMismatches=true" \
  -H "x-access-token: $JWT_TOKEN" > discrepancias.json

# 3. Ver cuántas discrepancias hay
cat discrepancias.json | jq '.stats.discrepancias'

# 4. Obtener primer SKU con discrepancia
export FIRST_SKU=$(cat discrepancias.json | jq -r '.data[0].sku')
echo "Corrigiendo producto: $FIRST_SKU"

# 5. Corregir
curl -X POST http://localhost:3000/api/woo/fix-category \
  -H "Content-Type: application/json" \
  -H "x-access-token: $JWT_TOKEN" \
  -d "{
    \"art_cod\": \"$FIRST_SKU\",
    \"action\": \"sync-to-woo\"
  }"

# 6. Re-sincronizar para actualizar ArticuloHook
curl -X POST http://localhost:3000/api/woo/sync \
  -H "x-access-token: $JWT_TOKEN"

# 7. Verificar que la discrepancia desapareció
curl "http://localhost:3000/api/woo/audit-categories?onlyMismatches=true" \
  -H "x-access-token: $JWT_TOKEN" | jq '.stats.discrepancias'
```

**Resultado esperado:**
- El número de discrepancias disminuyó en 1

### Paso 4.2: Performance Test

```bash
# Medir tiempo de sincronización
time curl -X POST http://localhost:3000/api/woo/sync \
  -H "x-access-token: $JWT_TOKEN"
```

**Expectativa:**
- Para 100 productos: ~30-60 segundos
- Para 500 productos: ~2-5 minutos
- Para 1000 productos: ~5-10 minutos

**Si es muy lento:**
- Verificar índice `IX_ArticuloHook_CategoriaMatch` existe
- Revisar logs de SQL Server para queries lentos
- Considerar aumentar `BATCH_SIZE` en el controlador

### Paso 4.3: Prueba de Concurrencia

```bash
# Abrir 2 terminales y ejecutar simultáneamente:

# Terminal 1
curl -X POST http://localhost:3000/api/woo/sync \
  -H "x-access-token: $JWT_TOKEN"

# Terminal 2 (esperar 5 segundos)
curl "http://localhost:3000/api/woo/audit-categories?onlyMismatches=true" \
  -H "x-access-token: $JWT_TOKEN"
```

**Resultado esperado:**
- Ambas peticiones completan sin errores
- No hay locks de base de datos

---

## Fase 5: Validación de Datos

### Paso 5.1: Integridad de Datos

```sql
-- Verificar que no hay productos sin categorías en sistema local
SELECT COUNT(*)
FROM ArticuloHook ah
LEFT JOIN dbo.articulos a ON ah.ArtHookCod = a.art_cod
WHERE a.art_cod IS NULL;
-- Resultado esperado: 0

-- Verificar que todas las categorías tienen fecha de verificación
SELECT COUNT(*)
FROM ArticuloHook
WHERE ArtHookCatFechaVerificacion IS NULL
  AND ArtHookCatSysNombre IS NOT NULL;
-- Resultado esperado: 0

-- Verificar consistencia de ArtHookCategoriaMatch
SELECT
    ArtHookCod,
    ArtHookCatSysNombre,
    ArtHookCatWooNombre,
    ArtHookCategoriaMatch
FROM ArticuloHook
WHERE
    (ArtHookCatSysNombre = ArtHookCatWooNombre AND ArtHookCategoriaMatch = 0)
    OR (ArtHookCatSysNombre != ArtHookCatWooNombre AND ArtHookCategoriaMatch = 1);
-- Resultado esperado: 0 filas (no inconsistencias)
```

### Paso 5.2: Estadísticas

```sql
-- Resumen general
SELECT
    COUNT(*) AS total_productos,
    SUM(CASE WHEN ArtHookCategoriaMatch = 1 THEN 1 ELSE 0 END) AS coincidencias,
    SUM(CASE WHEN ArtHookCategoriaMatch = 0 THEN 1 ELSE 0 END) AS discrepancias,
    SUM(CASE WHEN ArtHookCategoriaMatch IS NULL THEN 1 ELSE 0 END) AS sin_verificar,
    CAST(SUM(CASE WHEN ArtHookCategoriaMatch = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*) AS DECIMAL(5,2)) AS porcentaje_correcto
FROM ArticuloHook;
```

**Meta de calidad:**
- Coincidencias: > 90%
- Discrepancias: < 10%
- Sin verificar: 0%

---

## Fase 6: Pruebas de Error Handling

### Caso 1: WooCommerce API No Disponible

```bash
# Apagar conexión a WooCommerce (modificar temporalmente .env)
# Ejecutar sincronización
curl -X POST http://localhost:3000/api/woo/sync \
  -H "x-access-token: $JWT_TOKEN"
```

**Resultado esperado:**
```json
{
  "success": false,
  "message": "Synchronization failed",
  "error": "connect ECONNREFUSED..."
}
```

### Caso 2: Base de Datos No Disponible

```bash
# Detener SQL Server temporalmente
# Ejecutar auditoría
curl http://localhost:3000/api/woo/audit-categories \
  -H "x-access-token: $JWT_TOKEN"
```

**Resultado esperado:**
```json
{
  "success": false,
  "message": "Error al auditar categorías",
  "error": "Connection lost..."
}
```

### Caso 3: Token JWT Inválido

```bash
curl http://localhost:3000/api/woo/audit-categories \
  -H "x-access-token: token_invalido"
```

**Resultado esperado:**
```json
{
  "success": false,
  "message": "Token inválido o expirado"
}
```

---

## Checklist Final

### Base de Datos
- [ ] Migración ejecutada sin errores
- [ ] Índice creado
- [ ] Campos visibles en ArticuloHook
- [ ] Datos poblados después de sincronización

### Backend
- [ ] Servidor inicia sin errores
- [ ] `syncWooProducts()` actualiza campos de categorías
- [ ] `auditCategories()` retorna datos correctos
- [ ] `fixProductCategory()` actualiza WooCommerce

### API
- [ ] `POST /api/woo/sync` funciona
- [ ] `GET /api/woo/audit-categories` retorna JSON
- [ ] `POST /api/woo/fix-category` actualiza y retorna éxito
- [ ] Manejo de errores funciona correctamente

### Datos
- [ ] `ArtHookCategoriaMatch` se calcula correctamente
- [ ] Comparación case-insensitive funciona
- [ ] Fecha de verificación se registra
- [ ] No hay inconsistencias de datos

### Performance
- [ ] Sincronización completa en tiempo razonable
- [ ] Índice mejora velocidad de consultas
- [ ] No hay locks de base de datos

---

## Problemas Comunes y Soluciones

### Error: "Column 'ArtHookCatSysCod' is invalid"

**Causa:** Migración SQL no se ejecutó correctamente.

**Solución:**
```sql
-- Verificar si los campos existen
SELECT * FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'ArticuloHook'
  AND COLUMN_NAME LIKE 'ArtHookCat%';

-- Si no existen, re-ejecutar migración
:r /path/to/02_alter_articulohook_categorias.sql
GO
```

### Error: "Cannot destructure property 'categories' of 'product'"

**Causa:** API de WooCommerce no retorna el campo `categories`.

**Solución:**
```javascript
// En wooSyncController.js, agregar validación:
const categories = product.categories || [];
```

### Error: "Request Timeout" al sincronizar

**Causa:** Demasiados productos o conexión lenta.

**Solución:**
```javascript
// En wooSyncController.js, aumentar timeout:
const wooCommerce = new WooCommerceRestApi({
    url: process.env.WC_URL,
    consumerKey: process.env.WC_CONSUMER_KEY,
    consumerSecret: process.env.WC_CONSUMER_SECRET,
    version: "wc/v3",
    timeout: 15000,  // Aumentar a 15 segundos
});
```

### Discrepancias no disminuyen después de corrección

**Causa:** Necesitas re-sincronizar después de corregir para actualizar `ArtHookCategoriaMatch`.

**Solución:**
```bash
# Después de fix-category, ejecutar:
curl -X POST http://localhost:3000/api/woo/sync \
  -H "x-access-token: $JWT_TOKEN"
```

---

## Siguiente Paso

Una vez completadas todas las pruebas exitosamente:

1. ✅ Marcar implementación como **PRODUCCIÓN**
2. ✅ Configurar job nocturno para sincronización automática
3. ✅ Crear reporte semanal de discrepancias
4. ✅ Capacitar al equipo en uso de endpoints

---

**Fecha de última actualización:** 2026-02-05
**Contacto:** API Pretty Team
