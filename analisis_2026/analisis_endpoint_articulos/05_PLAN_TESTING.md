# Plan de Testing - Endpoint /api/articulos

**Fecha:** 2026-03-02
**Objetivo:** Validar todas las implementaciones de Fases 1-4

---

## FASE 1: Seguridad (verifyToken)

### 1.1 Endpoints sin autenticación deben rechazar solicitudes sin token

```bash
# SIN TOKEN - Debe retornar 401/403
curl -X GET "http://localhost:3000/api/articulos"
curl -X GET "http://localhost:3000/api/articulos/validar?art_cod=ART001"
curl -X GET "http://localhost:3000/api/articulos/next-codigo/generate"
curl -X POST "http://localhost:3000/api/articulos" -H "Content-Type: application/json" -d '{}'
curl -X GET "http://localhost:3000/api/articulos/1"
curl -X PUT "http://localhost:3000/api/articulos/1" -H "Content-Type: application/json" -d '{}'
curl -X GET "http://localhost:3000/api/articulos/articulo/ART001"

# CON TOKEN - Debe funcionar (o retornar error de validación de datos, no de auth)
TOKEN="tu_token_valido_aqui"
curl -X GET "http://localhost:3000/api/articulos" -H "x-access-token: $TOKEN"
```

**Resultado esperado:**
- Sin token: `401 Unauthorized` o `403 Forbidden`
- Con token: Continúa con validación de datos

---

## FASE 2: Tipos SQL Correctos

### 2.1 Crear artículo con todos los tipos correctos

```bash
TOKEN="tu_token_valido"
curl -X POST "http://localhost:3000/api/articulos" \
  -H "x-access-token: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "art_cod": "TEST001",
    "art_nom": "Producto Test Fase 2",
    "categoria": "1",
    "subcategoria": "1",
    "precio_detal": 100.00,
    "precio_mayor": 80.00
  }'
```

**Validar en BD:**
```sql
SELECT art_sec, art_cod, art_nom, inv_sub_gru_cod, CAST(art_sec AS VARCHAR) AS art_sec_str
FROM dbo.articulos
WHERE art_cod = 'TEST001'
```

**Resultado esperado:**
- `art_cod` = VARCHAR(30) ✓
- `art_nom` = VARCHAR(100) ✓
- `inv_sub_gru_cod` = SMALLINT (valor 1) ✓
- Sin errores de conversión ✓

### 2.2 Obtener artículo por código

```bash
TOKEN="tu_token_valido"
curl -X GET "http://localhost:3000/api/articulos/articulo/TEST001" \
  -H "x-access-token: $TOKEN"
```

**Resultado esperado:** Retorna artículo con todos los campos (art_cod VARCHAR(30) usado correctamente)

---

## FASE 3: Optimización de Queries + Paginación

### 3.1 GET /api/articulos con paginación

```bash
TOKEN="tu_token_valido"
# Página 1, 10 registros por página
curl -X GET "http://localhost:3000/api/articulos?PageNumber=1&PageSize=10" \
  -H "x-access-token: $TOKEN"

# Página 2
curl -X GET "http://localhost:3000/api/articulos?PageNumber=2&PageSize=10" \
  -H "x-access-token: $TOKEN"

# Con filtros
curl -X GET "http://localhost:3000/api/articulos?nombre=TEST&PageNumber=1&PageSize=5" \
  -H "x-access-token: $TOKEN"
```

**Resultado esperado:**
```json
{
  "success": true,
  "articulos": [
    {
      "art_sec": "123",
      "art_cod": "TEST001",
      "art_nom": "Producto Test Fase 2",
      "costo_promedio": 50.00,
      "rentabilidad_detal": 50.00,
      "margen_ganancia_detal": 100.00,
      "utilidad_bruta_detal": 50.00,
      "clasificacion_rentabilidad": "ALTA",
      "precio_detal": 100.00,
      "precio_mayor": 80.00,
      "existencia": 0,
      ...
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 10,
    "totalRecords": 543,
    "totalPages": 55
  }
}
```

**Validaciones:**
- ✓ `pagination` objeto presente
- ✓ `totalRecords` > 0
- ✓ `totalPages` = ceil(totalRecords / pageSize)
- ✓ Array `articulos` tiene longitud ≤ pageSize
- ✓ Solo una métrica de costo (`costo_promedio`), no 5 aliases

### 3.2 Columnas PERSISTED para productos simples

**Validar en BD:**
```sql
SELECT TOP 1
  ad1.art_bod_pre,
  ad1.rentabilidad,
  ad1.margen_ganancia,
  ad1.utilidad_bruta,
  ad1.clasificacion_rentabilidad
FROM dbo.articulosdetalle ad1
WHERE ad1.lis_pre_cod = 1
  AND ad1.bod_sec = '1'
  AND ad1.art_bod_pre > 0
```

**Resultado esperado:**
- Las columnas PERSISTED tienen valores calculados ✓
- No hay valores NULL en rentabilidad/margen para artículos con precio ✓

### 3.3 getNextArticuloCodigo - Un solo query

```bash
TOKEN="tu_token_valido"
# Llamar varias veces seguidas (debe ser rápido)
for i in {1..5}; do
  curl -X GET "http://localhost:3000/api/articulos/next-codigo/generate" \
    -H "x-access-token: $TOKEN"
  echo ""
done
```

**Resultado esperado:**
- Cada llamada retorna un código diferente ✓
- Códigos son secuenciales: 5000, 5001, 5002, etc. ✓
- Respuesta < 100ms (muy rápida - 1 query en lugar de 1000) ✓

---

## FASE 4: Upload de Imágenes Fuera de Transacción

### 4.1 Crear artículo CON imágenes

**Con archivo local (usar Postman o herramienta multipart):**

```bash
TOKEN="tu_token_valido"
curl -X POST "http://localhost:3000/api/articulos" \
  -H "x-access-token: $TOKEN" \
  -F "art_cod=IMGTEST001" \
  -F "art_nom=Producto con Imagen" \
  -F "categoria=1" \
  -F "subcategoria=1" \
  -F "precio_detal=150.00" \
  -F "precio_mayor=120.00" \
  -F "image1=@/ruta/a/imagen.jpg"
```

**Resultado esperado:**
```json
{
  "success": true,
  "data": {
    "art_sec": "124",
    "art_cod": "IMGTEST001",
    "art_nom": "Producto con Imagen",
    "art_woo_id": 12345,
    "images": ["https://res.cloudinary.com/..."]
  },
  "errors": {}
}
```

**Validaciones:**
- ✓ Artículo creado en BD
- ✓ Imagen subida a Cloudinary
- ✓ URL de imagen retornada
- ✓ No hay bloqueo en `dbo.secuencia` durante upload (fue rápido)
- ✓ No hay transacción abierta durante upload

### 4.2 Validar bloqueo corto en secuencia

**En SQL Server:**
```sql
-- Monitorear durante creacion de articulo
SELECT *
FROM sys.dm_tran_locks
WHERE resource_type = 'KEY'
  AND resource_associated_entity_id IN (
    SELECT object_id FROM sys.tables WHERE name = 'secuencia'
  )
```

**Resultado esperado:**
- Lock en `secuencia` durante INSERT nada más (milisegundos)
- No hay lock durante Cloudinary upload
- Lock liberado rápidamente ✓

### 4.3 Crear artículo SIN imágenes (debe funcionar igual)

```bash
TOKEN="tu_token_valido"
curl -X POST "http://localhost:3000/api/articulos" \
  -H "x-access-token: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "art_cod": "NOIMG001",
    "art_nom": "Sin Imagen",
    "categoria": "1",
    "subcategoria": "1",
    "precio_detal": 75.00,
    "precio_mayor": 60.00
  }'
```

**Resultado esperado:**
- ✓ Artículo creado
- ✓ errors.cloudinary = null
- ✓ images = []

---

## TESTS ADICIONALES (Regresión)

### Test A: Actualizar artículo (UPDATE)

```bash
TOKEN="tu_token_valido"
curl -X PUT "http://localhost:3000/api/articulos/123" \
  -H "x-access-token: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "art_cod": "TEST001",
    "art_nom": "Producto Actualizado",
    "categoria": "1",
    "subcategoria": "1",
    "art_woo_id": 12345,
    "precio_detal": 110.00,
    "precio_mayor": 85.00
  }'
```

**Resultado esperado:**
- ✓ Artículo actualizado
- ✓ Precios reflejados en BD
- ✓ Sincronización con WooCommerce completada

### Test B: Validar artículo existente

```bash
TOKEN="tu_token_valido"
curl -X GET "http://localhost:3000/api/articulos/validar?art_cod=TEST001" \
  -H "x-access-token: $TOKEN"
```

**Resultado esperado:**
- ✓ `exists: true` para artículo existente
- ✓ `exists: false` para código inexistente

### Test C: Filtros de búsqueda

```bash
TOKEN="tu_token_valido"
# Por nombre
curl -X GET "http://localhost:3000/api/articulos?nombre=Test" \
  -H "x-access-token: $TOKEN"

# Por categoría
curl -X GET "http://localhost:3000/api/articulos?inv_gru_cod=1" \
  -H "x-access-token: $TOKEN"

# Por subcategoría
curl -X GET "http://localhost:3000/api/articulos?inv_sub_gru_cod=1" \
  -H "x-access-token: $TOKEN"

# Con existencia
curl -X GET "http://localhost:3000/api/articulos?tieneExistencia=1" \
  -H "x-access-token: $TOKEN"

# Combinados
curl -X GET "http://localhost:3000/api/articulos?nombre=Test&inv_gru_cod=1&tieneExistencia=0&PageNumber=1&PageSize=20" \
  -H "x-access-token: $TOKEN"
```

**Resultado esperado:**
- ✓ Filtros aplican correctamente
- ✓ Resultados coinciden con criterios
- ✓ Paginación funciona con filtros

### Test D: Performance - Comparar tiempos

**Antes (v Fases 1-3):**
```bash
# Medir tiempo de respuesta
time curl -X GET "http://localhost:3000/api/articulos?PageNumber=1&PageSize=50" \
  -H "x-access-token: $TOKEN"
```

**Resultado esperado:**
- Respuesta < 500ms para consulta de 50 artículos
- Con Fase 4: creación de artículos < 2 segundos (sin bloquear secuencia)

---

## CHECKLIST FINAL

- [ ] **Fase 1:** Todos los endpoints requieren token
- [ ] **Fase 2:** Tipos SQL correctos (VARCHAR(30), SmallInt, etc.)
- [ ] **Fase 3:** Paginación con `totalRecords` y `totalPages`
- [ ] **Fase 3:** Un solo alias de costo (`costo_promedio`), no 5
- [ ] **Fase 3:** `getNextArticuloCodigo` retorna en < 100ms
- [ ] **Fase 4:** Crear artículo con imagen < 2 segundos (no bloqueado en secuencia)
- [ ] **Fase 4:** Crear artículo sin imagen funciona correctamente
- [ ] **Regresión:** UPDATE de artículos funciona
- [ ] **Regresión:** Validación de artículos funciona
- [ ] **Regresión:** Filtros funcionan correctamente
- [ ] **Regresión:** No hay errores en logs
- [ ] **Performance:** Tiempos de respuesta mejoraron

---

## Notas Importantes

1. **Token válido:** Necesitas un JWT válido. Obtenerlo de POST `/api/auth/login`
2. **Base de datos:** Asegúrate que la BD está accesible y con datos de prueba
3. **Cloudinary:** Verificar credenciales en `.env` para tests de imagen
4. **WooCommerce:** Verificar credenciales si se prueban sincronizaciones
5. **Logs:** Revisar Winston logs en `/var/log/api_pretty/` para errores
6. **Transacciones:** Durante pruebas de Fase 4, monitorear bloqueos en SQL Server

