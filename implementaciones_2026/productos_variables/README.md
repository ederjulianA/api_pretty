# Implementación: Productos Variables con Variaciones

**Fecha:** 2026-02-06
**Versión:** 2.0
**Estado:** ✅ Completado

---

## 📁 Contenido de esta Carpeta

| Archivo | Descripción |
|---------|-------------|
| `IMPLEMENTACION_PRODUCTOS_VARIABLES.md` | Documentación técnica completa (v2.0 corregida) |
| `API_Productos_Variables.postman_collection.json` | Colección Postman para testing |
| `sql_scripts/` | Symlink a scripts SQL de migración |

---

## 🚀 Guía de Implementación Rápida

### 1. Ejecutar Migración SQL

Los scripts están en `../../EstructuraDatos/`:

```bash
# Orden de ejecución en DBeaver o SSMS:
1. 01_alter_articulos_variaciones.sql  # Agrega columnas e índices
2. 02_verificar_migracion.sql          # Verifica que todo está OK
```

**Verificación exitosa:**
- Todos los campos nuevos deben mostrar "EXISTE"
- Índices creados correctamente
- Productos existentes marcados como `art_woo_type = 'simple'`

### 2. Archivos de Código Implementados

Ya implementados en el codebase:

```
utils/variationUtils.js                    ✅ Utilidades (CommonJS)
models/articulosModel.js                   ✅ +2 funciones
controllers/variableProductController.js   ✅ Nuevo controller
routes/variableProductRoutes.js            ✅ Nuevas rutas
index.js                                   ✅ Rutas registradas
jobs/syncWooOrders.js                      ✅ Promociones heredadas
```

### 3. Importar Colección en Postman

1. Abrir Postman
2. **Import** → Seleccionar `API_Productos_Variables.postman_collection.json`
3. Crear un **Environment** con:
   ```json
   {
     "base_url": "http://localhost:3000",
     "token": ""
   }
   ```
4. Ejecutar endpoint **Login** primero (guarda token automáticamente)
5. Probar endpoints de productos variables

### 4. Testing Manual

#### Crear Producto Variable (Padre)

```bash
POST /api/articulos/variable
Content-Type: multipart/form-data
x-access-token: {{token}}

# Form Data:
art_nom: "Labial Mate Professional"
art_cod: "LAB001"
categoria: "9"
subcategoria: "1"
precio_detal_referencia: 45000
precio_mayor_referencia: 35000
attributes: [{"name":"Tono","options":["Rojo Pasion","Rosa Nude","Ciruela Oscuro","Coral Brillante"]}]
image1: [archivo opcional]
```

**Resultado esperado:**
- Producto creado en BD con `art_woo_type = 'variable'`
- Sincronizado a WooCommerce
- `art_woo_id` asignado

#### Crear Variación

```bash
POST /api/articulos/variable/{parent_art_sec}/variations
Content-Type: multipart/form-data
x-access-token: {{token}}

# Form Data:
art_nom: "Labial Mate Professional - Rojo Pasion"
attributes: {"Tono":"Rojo Pasion"}
precio_detal: 48000
precio_mayor: 38000
image1: [archivo opcional]
```

**Resultado esperado:**
- Variación creada con SKU `LAB001-ROJO-PASION`
- `art_sec_padre` apunta al padre
- Sincronizada a WooCommerce como variación

#### Consultar Variaciones

```bash
GET /api/articulos/variable/{parent_art_sec}/variations
x-access-token: {{token}}
```

**Resultado esperado:**
```json
{
  "success": true,
  "count": 4,
  "data": [/* array de variaciones */]
}
```

---

## 🔧 Arquitectura Implementada

### Base de Datos

**Campos nuevos en `dbo.articulos`:**
```sql
art_woo_type              VARCHAR(20)      -- 'simple'|'variable'|'variation'
art_parent_woo_id         INT NULL         -- WooCommerce ID del padre
art_variation_attributes  NVARCHAR(MAX)    -- JSON: {"Tono":"Rojo"}
art_woo_variation_id      INT NULL         -- ID variación WooCommerce
```

**Campos reutilizados:**
```sql
art_sec_padre    VARCHAR(30)  -- Referencia al producto padre
art_variable     VARCHAR(1)   -- 'S' si es variable
```

### Flujo de Datos

```
1. CREAR PRODUCTO PADRE
   └─> BD: INSERT con art_woo_type='variable', art_variable='S'
   └─> Cloudinary: Upload imágenes
   └─> WooCommerce: POST /products (type='variable')
   └─> BD: UPDATE con art_woo_id

2. CREAR VARIACIONES
   └─> Validar padre existe y es 'variable'
   └─> Generar SKU: {parent_cod}-{tono_slug}
   └─> BD: INSERT con art_woo_type='variation', art_sec_padre
   └─> Cloudinary: Upload imagen específica
   └─> WooCommerce: POST /products/{parent_id}/variations
   └─> BD: UPDATE con art_woo_variation_id

3. SINCRONIZAR PEDIDOS WooCommerce → BD
   └─> Order line item con SKU de variación
   └─> BD: Buscar art_sec por art_cod (SKU)
   └─> Detectar art_woo_type='variation'
   └─> Buscar promociones en art_sec_padre (herencia)
   └─> Crear factura con precios correctos
```

---

## 🐛 Errores Corregidos (v1.0 → v2.0)

La versión 2.0 del documento corrigió **9 bugs críticos** de la v1.0:

1. ✅ Tipo `art_sec` correcto: `VARCHAR(30)` (no `DECIMAL`)
2. ✅ `art_cod` obligatorio para padre (no `NULL`)
3. ✅ Removidos campos inexistentes (`inv_gru_cod`, `art_est`)
4. ✅ Agregado `pre_sec` obligatorio
5. ✅ Reutilizados `art_sec_padre` y `art_variable` existentes
6. ✅ Generación segura de `art_sec` con `dbo.secuencia`
7. ✅ Convertido a CommonJS (no ES Modules)
8. ✅ SKU truncado a 30 caracteres
9. ✅ Tipo `inv_sub_gru_cod` correcto: `SMALLINT`

---

## 📊 Endpoints Disponibles

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/auth/login` | Autenticación (obtener token) |
| POST | `/api/articulos/variable` | Crear producto variable (padre) |
| POST | `/api/articulos/variable/:parent_art_sec/variations` | Crear variación |
| GET | `/api/articulos/variable/:parent_art_sec/variations` | Listar variaciones |

---

## 🔐 Autenticación

Todos los endpoints (excepto login) requieren header:
```
x-access-token: {jwt_token}
```

Token válido por **24 horas**.

---

## 💡 Casos de Uso

### Ejemplo: Labial con 4 Tonos

1. **Crear padre:**
   - SKU: `LAB001`
   - Nombre: "Labial Mate Professional"
   - Atributo: Tono (opciones: Rojo, Rosa, Ciruela, Coral)

2. **Crear 4 variaciones:**
   - `LAB001-ROJO-PASION` → Precio $48,000
   - `LAB001-ROSA-NUDE` → Precio $48,000
   - `LAB001-CIRUELA-OSCURO` → Precio $45,000
   - `LAB001-CORAL-BRILLANTE` → Precio $50,000

3. **Promoción:**
   - Aplicar descuento 15% al padre (`LAB001`)
   - **TODAS** las variaciones heredan el descuento

4. **Pedido WooCommerce:**
   - Cliente selecciona "Tono: Rojo Pasion"
   - WooCommerce envía SKU `LAB001-ROJO-PASION`
   - Backend encuentra variación, aplica promoción del padre

---

## 📝 Notas Importantes

### SKU Generación
- Formato: `{parent_code}-{tono_slug}`
- Máximo 30 caracteres (se trunca automáticamente)
- Se remueven acentos y caracteres especiales
- Ejemplo: `"Rojo Pasión"` → `"ROJO-PASION"`

### Promociones
- Se registran en `promociones_detalle` usando el `art_sec` del **padre**
- Query en `syncWooOrders.js` usa `COALESCE(art_sec_padre, art_sec)` para herencia
- Variaciones **NO** tienen promociones propias (solo heredan del padre)

### Imágenes
- Máximo 4 imágenes por producto (`image1`, `image2`, `image3`, `image4`)
- Usa `express-fileupload` (no multer)
- Se suben a Cloudinary en carpetas:
  - `productos_variables/` → Padres
  - `productos_variaciones/` → Variaciones
- Primera imagen se asigna a `art_url_img_servi`

---

## 🧪 Testing

### SQL Manual
```sql
-- Ver productos variables
SELECT art_sec, art_cod, art_nom, art_woo_type, art_variable
FROM dbo.articulos
WHERE art_woo_type = 'variable';

-- Ver variaciones de un padre
SELECT art_sec, art_cod, art_nom, art_sec_padre, art_variation_attributes
FROM dbo.articulos
WHERE art_sec_padre = '50001';

-- Ver promociones heredadas
SELECT
  v.art_sec, v.art_cod,
  COALESCE(v.art_sec_padre, v.art_sec) AS promo_lookup_art_sec,
  pd.pro_det_precio_oferta
FROM dbo.articulos v
LEFT JOIN dbo.promociones_detalle pd
  ON COALESCE(v.art_sec_padre, v.art_sec) = pd.art_sec
WHERE v.art_sec = '50002';  -- Variación
```

### Verificar WooCommerce
```bash
# Producto variable padre
GET https://tu-tienda.com/wp-json/wc/v3/products/{art_woo_id}
# Debe mostrar type: "variable", attributes: [{name: "Tono", ...}]

# Variaciones
GET https://tu-tienda.com/wp-json/wc/v3/products/{parent_woo_id}/variations
# Debe listar todas las variaciones con sus atributos
```

---

## 🆘 Troubleshooting

### Error: "Invalid column name 'art_woo_type'"
**Causa:** Script SQL no ejecutado o ejecutado con error en DBeaver.
**Solución:** Usar `EXEC()` para UPDATE/CREATE INDEX (ya corregido en v2).

### Error: "El SKU ya existe"
**Causa:** Dos variaciones con el mismo tono o SKU manual duplicado.
**Solución:** Asegurar que cada variación tiene atributos únicos.

### Error: "El producto padre no es de tipo variable"
**Causa:** Intentar crear variación de un producto simple.
**Solución:** Verificar `art_woo_type = 'variable'` del padre.

### Promociones no aplican a variaciones
**Causa:** Promoción registrada en `art_sec` de variación en vez del padre.
**Solución:** Siempre registrar promociones en el `art_sec` del **padre**.

---

## 📚 Referencias

- Documento técnico: `IMPLEMENTACION_PRODUCTOS_VARIABLES.md`
- Scripts SQL: `../../EstructuraDatos/01_alter_articulos_variaciones.sql`
- WooCommerce API: https://woocommerce.github.io/woocommerce-rest-api-docs/
- Memoria del proyecto: `~/.claude/projects/.../memory/MEMORY.md`

---

## ✅ Checklist de Implementación

- [x] Migración SQL ejecutada
- [x] Campos nuevos verificados
- [x] Índices creados
- [x] `variationUtils.js` implementado
- [x] Funciones en `articulosModel.js` agregadas
- [x] Controller `variableProductController.js` creado
- [x] Rutas registradas en `index.js`
- [x] Sincronización de pedidos ajustada
- [x] Colección Postman creada
- [ ] Testing con datos reales
- [ ] Sincronización con WooCommerce validada
- [ ] Promociones heredadas verificadas

---

**Implementado por:** Claude Code (Opus 4.6)
**Fecha:** 2026-02-06
