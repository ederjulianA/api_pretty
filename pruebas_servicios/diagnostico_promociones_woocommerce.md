# 🔍 Diagnóstico de Promociones WooCommerce

Este documento contiene ejemplos de uso de los endpoints de diagnóstico para revisar artículos que aparecen y que no aparecen en las secciones de promociones de WooCommerce.

## 📋 Endpoints Disponibles

### 1. Obtener Datos de un Producto Específico
**Método:** `GET`  
**URL:** `http://localhost:3000/api/diagnostic/product/{sku}`

#### Ejemplo en Postman:
```
GET http://localhost:3000/api/diagnostic/product/4672
```

**Headers:**
```
Content-Type: application/json
```

**Respuesta Esperada:**
```json
{
  "success": true,
  "message": "Datos del producto obtenidos correctamente",
  "data": {
    "id": 12345,
    "sku": "4672",
    "name": "Acondicionador 4 en 1 Click Hair",
    "status": "publish",
    "catalog_visibility": "visible",
    "on_sale": true,
    "sale_price": "20000",
    "regular_price": "32900",
    "date_on_sale_from": "2024-01-15T00:00:00",
    "date_on_sale_to": "2024-01-30T23:59:59",
    "stock_status": "instock",
    "should_appear_in_special_deals": true,
    "meta_data": [...]
  }
}
```

---

### 2. Comparar Dos Productos
**Método:** `POST`  
**URL:** `http://localhost:3000/api/diagnostic/compare`

#### Ejemplo en Postman:
```
POST http://localhost:3000/api/diagnostic/compare
```

**Headers:**
```
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "sku1": "4672",
  "sku2": "4588"
}
```

**Respuesta Esperada:**
```json
{
  "success": true,
  "message": "Comparación completada",
  "data": {
    "product1": {
      "sku": "4672",
      "name": "Acondicionador 4 en 1 Click Hair",
      "should_appear": true
    },
    "product2": {
      "sku": "4588",
      "name": "Acondicionador Con Banano Anyeluz",
      "should_appear": true
    },
    "differences": {
      "sale_price": {
        "product1": "20000",
        "product2": "22000"
      },
      "meta_data": {
        "_codigo_promocion": {
          "product1": "",
          "product2": "ofertas_septiembre"
        },
        "_descripcion_promocion": {
          "product1": "",
          "product2": "ofertas septiembre"
        }
      }
    },
    "recommendations": []
  }
}
```

---

### 3. Diagnosticar Múltiples Productos
**Método:** `POST`  
**URL:** `http://localhost:3000/api/diagnostic/multiple`

#### Ejemplo en Postman:
```
POST http://localhost:3000/api/diagnostic/multiple
```

**Headers:**
```
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "skus": ["4672", "4588", "4617", "4361", "4520", "4390"]
}
```

**Respuesta Esperada:**
```json
{
  "success": true,
  "message": "Diagnóstico múltiple completado",
  "data": {
    "total_products": 6,
    "appearing_products": 3,
    "not_appearing_products": 3,
    "errors": 0,
    "appearing_skus": ["4672", "4617", "4520"],
    "not_appearing_skus": ["4588", "4361", "4390"],
    "summary": {
      "success_rate": "3/6 productos aparecen correctamente",
      "common_issues": [
        "meta_data: 3 productos",
        "on_sale: 0 productos"
      ]
    }
  }
}
```

---

### 4. Diagnosticar Promoción Completa
**Método:** `POST`  
**URL:** `http://localhost:3000/api/diagnostic/promotion`

#### Ejemplo en Postman:
```
POST http://localhost:3000/api/diagnostic/promotion
```

**Headers:**
```
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "pro_sec": 123
}
```

**Respuesta Esperada:**
```json
{
  "success": true,
  "message": "Diagnóstico de promoción completado",
  "data": {
    "total_products": 6,
    "appearing_products": 3,
    "not_appearing_products": 3,
    "promotion_info": {
      "pro_sec": 123,
      "total_articles_in_promotion": 6,
      "articles_with_woo_id": 6,
      "articles_without_woo_id": 0
    },
    "summary": {
      "success_rate": "3/6 productos aparecen correctamente",
      "common_issues": [
        "meta_data: 3 productos"
      ]
    }
  }
}
```

---

## 🔍 Campos Críticos para Special Deals

Los siguientes campos son verificados para determinar si un producto debe aparecer en special deals:

### ✅ Campos Requeridos:
- `status`: Debe ser `"publish"`
- `catalog_visibility`: Debe ser `"visible"`
- `on_sale`: Debe ser `true`
- `sale_price`: Debe tener un valor válido (no vacío)
- `stock_status`: Debe ser `"instock"`

### ❌ Meta_data Problemáticos:
- `_codigo_promocion`: Puede interferir con la lógica de WooCommerce
- `_descripcion_promocion`: Puede interferir con la lógica de WooCommerce
- `_descuento_porcentaje`: Puede interferir con la lógica de WooCommerce

### ✅ Meta_data Permitidos:
- `_precio_mayorista`: Necesario para el negocio

---

## 🚨 Problemas Identificados

### Patrón Encontrado:
- **Productos que SÍ aparecen**: NO tienen meta_data de promoción (`_codigo_promocion`, `_descripcion_promocion`)
- **Productos que NO aparecen**: SÍ tienen meta_data de promoción

### Solución Implementada:
Se modificó `updateWooProductPrices.js` para NO agregar los meta_data problemáticos que interfieren con la lógica de special deals de WooCommerce.

---

## 📝 Ejemplos de Pruebas Recomendadas

### 1. Verificar Producto Individual
```bash
GET /api/diagnostic/product/4672
```

### 2. Comparar Productos Problemáticos
```bash
POST /api/diagnostic/compare
{
  "sku1": "4672",  # Producto que aparece
  "sku2": "4588"   # Producto que no aparece
}
```

### 3. Diagnosticar Promoción Completa
```bash
POST /api/diagnostic/promotion
{
  "pro_sec": [ID_DE_TU_PROMOCION]
}
```

### 4. Verificar Múltiples Productos
```bash
POST /api/diagnostic/multiple
{
  "skus": ["4672", "4588", "4617", "4361", "4520", "4390"]
}
```

---

## 🔧 Configuración de Postman

### Variables de Entorno:
- `base_url`: `http://localhost:3000`
- `api_path`: `/api/diagnostic`

### Headers Globales:
```
Content-Type: application/json
```

### Colección de Pruebas:
1. Crear una colección llamada "Diagnóstico Promociones WooCommerce"
2. Agregar los 4 endpoints con sus respectivos ejemplos
3. Configurar variables de entorno para facilitar las pruebas

---

## 📊 Interpretación de Resultados

### ✅ Producto Aparece Correctamente:
- `should_appear_in_special_deals: true`
- Todos los campos críticos están correctos
- NO tiene meta_data problemáticos

### ❌ Producto No Aparece:
- `should_appear_in_special_deals: false`
- Revisar campos críticos faltantes
- Verificar meta_data problemáticos

### 🔍 Diferencias Clave:
- Comparar `sale_price`, `on_sale`, `meta_data`
- Identificar patrones en productos problemáticos
- Verificar fechas de promoción

---

## 🎯 Próximos Pasos

1. **Ejecutar diagnósticos** con productos reales
2. **Identificar patrones** en productos problemáticos
3. **Aplicar soluciones** basadas en los hallazgos
4. **Verificar resultados** después de las correcciones
5. **Documentar casos** para futuras referencias
