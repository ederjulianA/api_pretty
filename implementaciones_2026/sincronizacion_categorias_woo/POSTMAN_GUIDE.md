# Guía de Uso - Postman Collection

Esta guía explica cómo importar y usar la collection de Postman para la sincronización de categorías WooCommerce.

## 📦 Archivos incluidos

- `Sincronizacion_Categorias_WooCommerce.postman_collection.json` - Collection con todos los endpoints
- `API_Pretty_Local.postman_environment.json` - Environment con variables de configuración

## 🚀 Instalación

### 1. Importar Collection

1. Abre Postman
2. Click en **"Import"** (esquina superior izquierda)
3. Arrastra o selecciona el archivo: `Sincronizacion_Categorias_WooCommerce.postman_collection.json`
4. Click en **"Import"**

### 2. Importar Environment

1. Click en **"Import"** nuevamente
2. Arrastra o selecciona el archivo: `API_Pretty_Local.postman_environment.json`
3. Click en **"Import"**

### 3. Configurar Environment

1. Click en el selector de environments (esquina superior derecha)
2. Selecciona **"API Pretty - Local"**
3. Click en el ícono de ojo 👁️ junto al selector
4. Click en **"Edit"** para configurar las variables:

```
base_url: http://localhost:3000  (o tu URL de API)
token: (se llena automáticamente al hacer login)
usuario: tu_usuario_del_sistema
password: tu_contraseña
```

5. Click en **"Save"**

## 📋 Estructura de la Collection

La collection está organizada en 5 carpetas:

### 0. Autenticación
- **Login**: Obtiene el JWT token (se guarda automáticamente en `{{token}}`)

### 1. Sincronización Principal
- **Sincronizar Todos los Productos**: Sincroniza todos los productos de WooCommerce
- **Sincronizar Solo Productos con Stock**: Filtra solo productos con stock (~600)
- **Sincronizar Primeros 100 Productos**: Para testing rápido
- **Sincronizar con Imágenes**: Incluye procesamiento de imágenes (más lento)

### 2. Auditoría de Categorías
- **Ver Todas las Categorías**: Lista completa con estadísticas
- **Ver Solo Discrepancias**: Solo productos con categorías diferentes

### 3. Corrección de Categorías
- **Corregir Producto Individual (desde WooCommerce)**: ✅ Recomendado
- **Corregir Producto Individual (hacia WooCommerce)**: ⚠️ Solo casos específicos

### 4. Sincronización Masiva
- **Simular Sincronización Masiva**: ✅ Ejecutar SIEMPRE primero (dry_run=true)
- **Aplicar Sincronización Masiva**: ⚠️ Aplica cambios reales (dry_run=false)

## 🔄 Flujo de trabajo recomendado

### Primer uso (sincronización inicial)

```
1. 📝 Login
   └─> Obtener token de autenticación

2. 🔄 Sincronizar Productos con Stock
   └─> Extraer categorías de WooCommerce y sistema local

3. 🔍 Ver Solo Discrepancias
   └─> Identificar productos con categorías diferentes

4. 🧪 Simular Sincronización Masiva (dry_run=true)
   └─> Revisar qué cambios se aplicarían

5. ✅ Aplicar Sincronización Masiva (dry_run=false)
   └─> Sincronizar categorías realmente
```

### Uso periódico (mantenimiento)

```
1. 📝 Login
   └─> Autenticar

2. 🔄 Sincronizar Productos con Stock
   └─> Actualizar datos desde WooCommerce

3. 🔍 Ver Solo Discrepancias
   └─> ¿Hay productos con categorías diferentes?

   Si HAY discrepancias:
   └─> 4. 🧪 Simular Sincronización Masiva
       └─> 5. ✅ Aplicar Sincronización Masiva

   Si NO hay discrepancias:
   └─> ✅ Todo está sincronizado
```

## 📝 Variables disponibles

La collection usa variables de Postman para facilitar el uso:

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `{{base_url}}` | URL base de la API | `http://localhost:3000` |
| `{{token}}` | JWT token (se llena automáticamente) | `eyJhbGciOiJIUzI1...` |
| `{{usuario}}` | Usuario para login | `admin` |
| `{{password}}` | Contraseña para login | `tu_contraseña` |

## 🎯 Ejemplos de uso

### Ejemplo 1: Sincronización completa

1. **Login** → Token guardado automáticamente
2. **Sincronizar Productos con Stock** → 599 productos procesados
3. **Ver Solo Discrepancias** → 49 productos con diferencias
4. **Simular Sincronización Masiva** → 45 exitosos, 4 sin mapeo
5. **Aplicar Sincronización Masiva** → 45 productos actualizados

### Ejemplo 2: Corrección individual

1. **Login**
2. **Sincronizar Productos con Stock**
3. **Ver Solo Discrepancias** → Identificar SKU con problema
4. **Corregir Producto Individual**:
   ```json
   {
     "art_cod": "9168",
     "action": "sync-from-woo"
   }
   ```
5. **Ver Solo Discrepancias** → Verificar corrección

### Ejemplo 3: Testing con límite

1. **Login**
2. **Sincronizar Primeros 100 Productos** → Testing rápido
3. **Ver Todas las Categorías** → Revisar resultados
4. Si todo está bien → Sincronizar todos los productos

## ⚙️ Scripts automáticos incluidos

La collection incluye scripts que se ejecutan automáticamente:

### Pre-request Script
- Log de la URL del request
- Útil para debugging

### Test Script (después de cada request)
- Muestra tiempo de respuesta
- Valida status code
- Guarda token automáticamente después del login
- Logs útiles en consola de Postman

### Para ver los logs:
1. Ejecuta cualquier request
2. Click en **"Console"** (parte inferior de Postman)
3. Verás logs detallados de cada request

## 🐛 Troubleshooting

### Error: "Unauthorized" o 401
**Causa:** Token expirado o no válido
**Solución:** Ejecutar nuevamente el endpoint de **Login**

### Error: "ECONNREFUSED"
**Causa:** El servidor no está corriendo
**Solución:**
```bash
npm run dev  # o npm start
```

### Error: "Token no válido"
**Causa:** La variable `{{token}}` no tiene valor
**Solución:**
1. Verificar que el environment está seleccionado
2. Ejecutar el endpoint de Login
3. Verificar que el token se guardó (ícono de ojo 👁️)

### Respuestas vacías o errores 500
**Causa:** Problema en el servidor o base de datos
**Solución:**
1. Revisar logs del servidor (`pm2 logs` o consola)
2. Verificar conexión a base de datos
3. Revisar que la migración SQL fue ejecutada

## 📊 Interpretación de respuestas

### Respuesta exitosa de sincronización:
```json
{
  "success": true,
  "message": "Synchronization completed successfully",
  "stats": {
    "totalProcessed": 599,    // Total de productos procesados
    "totalUpdated": 599,      // Productos actualizados
    "totalCreated": 0,        // Productos nuevos creados
    "totalSkipped": 0,        // Productos saltados (filtros)
    "totalErrors": 0,         // Errores encontrados
    "expectedTotal": 599      // Total esperado
  }
}
```

### Respuesta con errores:
```json
{
  "success": true,
  "stats": {
    "totalErrors": 5
  },
  "errors": [
    {
      "productId": "1234",
      "productName": "Producto ejemplo",
      "error": "Mensaje de error descriptivo"
    }
  ]
}
```

### Respuesta de auditoría:
```json
{
  "success": true,
  "stats": {
    "total": 599,          // Total de productos
    "coincidencias": 550,  // Categorías que coinciden
    "discrepancias": 49,   // Categorías diferentes
    "sinVerificar": 0      // No verificados aún
  },
  "data": [...]
}
```

## 🔐 Seguridad

### Protección de credenciales
1. **NO compartir** el archivo de environment con credenciales reales
2. Usar variables de tipo **"secret"** para datos sensibles
3. El token expira después de 24 horas (configurado en el servidor)

### Buenas prácticas
1. Siempre usar **dry_run=true** antes de aplicar cambios masivos
2. Revisar resultados de simulación antes de aplicar
3. Tener respaldo de base de datos antes de sincronizaciones masivas
4. Documentar cambios importantes

## 📖 Documentación adicional

Para más información, consultar:
- [README.md](README.md) - Documentación general del proyecto
- [IMPLEMENTACION_SINCRONIZACION_CATEGORIAS.md](documentacion/IMPLEMENTACION_SINCRONIZACION_CATEGORIAS.md) - Documentación técnica
- [PRUEBAS_SINCRONIZACION_CATEGORIAS.md](documentacion/PRUEBAS_SINCRONIZACION_CATEGORIAS.md) - Casos de prueba

## 🆘 Soporte

Si encuentras problemas:
1. Revisar esta guía
2. Consultar logs del servidor
3. Verificar la documentación técnica
4. Revisar scripts SQL de diagnóstico en `sql/`

---

**Última actualización:** Febrero 6, 2026
**Versión de la collection:** 1.0.0
