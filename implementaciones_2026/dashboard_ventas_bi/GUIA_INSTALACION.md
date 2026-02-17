# Guía de Instalación - Dashboard de Ventas BI

**Fecha:** 2026-02-17
**Versión:** 1.0
**Tiempo estimado:** 30-45 minutos

---

## 📋 Prerequisitos

Antes de comenzar, asegúrate de tener:

- ✅ SQL Server con acceso de administrador
- ✅ Node.js y npm instalados
- ✅ PM2 instalado (para gestión del proceso)
- ✅ Sistema de rentabilidad ya implementado (columnas calculadas en `articulosdetalle`)
- ✅ Backup reciente de la base de datos

---

## 🚀 Instalación Paso a Paso

### FASE 1: Base de Datos (15 minutos)

#### Paso 1.1: Crear Vista Principal

1. Abrir SQL Server Management Studio
2. Conectar a tu base de datos
3. Abrir el archivo:
   ```
   implementaciones_2026/dashboard_ventas_bi/sql/01_crear_vista_ventas_dashboard.sql
   ```
4. **IMPORTANTE:** Cambiar la línea 14:
   ```sql
   USE [pruebas_ps_02092026]; -- Cambiar por tu base de datos
   ```
   Por el nombre de tu base de datos real.

5. Ejecutar el script completo (F5)
6. Verificar la salida - debe decir:
   ```
   ✓ Vista vw_ventas_dashboard creada exitosamente
   ✓ Query de prueba ejecutada exitosamente
   ```

#### Paso 1.2: Crear Índices de Performance

1. Abrir el archivo:
   ```
   implementaciones_2026/dashboard_ventas_bi/sql/02_indices_performance.sql
   ```
2. Cambiar el nombre de la base de datos (línea 14)
3. Ejecutar el script completo
4. Verificar que se crearon 6 índices:
   ```
   ✓ Índice IX_factura_fac_fec creado exitosamente
   ✓ Índice IX_factura_estado_fecha creado exitosamente
   ✓ Índice IX_facturakardes_fac_art creado exitosamente
   ✓ Índice IX_nit_sec_nombre creado exitosamente
   ✓ Índice IX_articulos_sec_subgrupo creado exitosamente
   ✓ Índice IX_articulosdetalle_art_bodega_lista creado exitosamente
   ```

**⏱️ Checkpoint 1:** La vista debe retornar datos cuando ejecutes:
```sql
SELECT TOP 10 * FROM dbo.vw_ventas_dashboard
```

---

### FASE 2: Backend (10 minutos)

#### Paso 2.1: Copiar Archivos del Backend

Desde la carpeta `implementaciones_2026/dashboard_ventas_bi/backend/`:

1. **Copiar el modelo:**
   ```bash
   cp implementaciones_2026/dashboard_ventas_bi/backend/models/ventasKpiModel.js models/
   ```

2. **Copiar el controlador:**
   ```bash
   cp implementaciones_2026/dashboard_ventas_bi/backend/controllers/ventasKpiController.js controllers/
   ```

3. **Copiar las rutas:**
   ```bash
   cp implementaciones_2026/dashboard_ventas_bi/backend/routes/ventasKpiRoutes.js routes/
   ```

#### Paso 2.2: Registrar Rutas en index.js

Abrir tu archivo `index.js` principal y agregar:

```javascript
// Importar rutas del dashboard de ventas (agregar con las otras importaciones)
const ventasKpiRoutes = require('./routes/ventasKpiRoutes');

// Registrar rutas (agregar con las otras rutas)
app.use('/api/dashboard/ventas', ventasKpiRoutes);
```

**Ejemplo de ubicación:**
```javascript
// ... otras importaciones ...
const articulosRoutes = require('./routes/articulosRoutes');
const comprasRoutes = require('./routes/comprasRoutes');
const ventasKpiRoutes = require('./routes/ventasKpiRoutes'); // ← AGREGAR AQUÍ

// ... código ...

// Rutas
app.use('/api/articulos', articulosRoutes);
app.use('/api/compras', comprasRoutes);
app.use('/api/dashboard/ventas', ventasKpiRoutes); // ← AGREGAR AQUÍ
```

#### Paso 2.3: Reiniciar Servidor

```bash
# Si usas PM2
pm2 restart api_pretty

# Si usas npm
npm restart

# Si usas nodemon
# Se reiniciará automáticamente
```

**⏱️ Checkpoint 2:** El servidor debe iniciar sin errores. Verificar logs:
```bash
pm2 logs api_pretty
```

---

### FASE 3: Pruebas (10 minutos)

#### Paso 3.1: Obtener Token JWT

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "usu_cod": "tu_usuario",
    "usu_pass": "tu_password"
  }'
```

Guardar el token de la respuesta:
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### Paso 3.2: Probar Endpoint Principal

```bash
# Reemplazar {TOKEN} con tu token JWT
curl -X GET "http://localhost:3000/api/dashboard/ventas/kpis?periodo=mes_actual" \
  -H "x-access-token: {TOKEN}"
```

**Respuesta esperada:**
```json
{
  "success": true,
  "data": {
    "ventas_totales": ...,
    "numero_ordenes": ...,
    "ticket_promedio": ...,
    ...
  },
  "periodo": {
    "fecha_inicio": "2026-02-01",
    "fecha_fin": "2026-02-17"
  }
}
```

#### Paso 3.3: Probar Dashboard Completo

```bash
curl -X GET "http://localhost:3000/api/dashboard/ventas/completo?periodo=ultimos_30_dias" \
  -H "x-access-token: {TOKEN}"
```

Debe retornar un JSON grande con todos los KPIs.

**⏱️ Checkpoint 3:** Si ambos endpoints retornan datos, ¡la instalación fue exitosa! ✅

---

### FASE 4: Verificación Final (5 minutos)

#### Prueba cada endpoint:

```bash
# 1. KPIs principales
GET /api/dashboard/ventas/kpis?periodo=mes_actual

# 2. Crecimiento
GET /api/dashboard/ventas/crecimiento?periodo=mes_actual

# 3. Top productos
GET /api/dashboard/ventas/top-productos?limite=10&ordenar_por=ingresos

# 4. Ventas por categoría
GET /api/dashboard/ventas/categorias?periodo=mes_actual

# 5. Ventas por rentabilidad
GET /api/dashboard/ventas/rentabilidad?periodo=mes_actual

# 6. Top clientes
GET /api/dashboard/ventas/top-clientes?limite=10

# 7. Órdenes por estado
GET /api/dashboard/ventas/ordenes-estado?periodo=mes_actual

# 8. Órdenes por canal
GET /api/dashboard/ventas/ordenes-canal?periodo=mes_actual

# 9. Tendencia diaria
GET /api/dashboard/ventas/tendencia-diaria?periodo=ultimos_30_dias

# 10. Ventas por hora
GET /api/dashboard/ventas/ventas-hora?periodo=mes_actual

# 11. Dashboard completo
GET /api/dashboard/ventas/completo?periodo=mes_actual
```

#### Checklist de verificación:

- [ ] Todos los endpoints retornan `"success": true`
- [ ] Los datos son consistentes (ventas_totales coincide con suma de categorías)
- [ ] Las fechas del período son correctas
- [ ] No hay errores en los logs del servidor
- [ ] Los tiempos de respuesta son < 2 segundos

---

## 📚 Documentación

Después de instalar, revisar la documentación completa:

1. **[README.md](README.md)** - Resumen ejecutivo y arquitectura
2. **[docs/01_KPIS_DEFINICIONES.md](docs/01_KPIS_DEFINICIONES.md)** - Definición matemática de cada KPI
3. **[docs/03_ENDPOINTS_API.md](docs/03_ENDPOINTS_API.md)** - Especificación completa de API

---

## 🔧 Troubleshooting

### Error: "Vista vw_ventas_dashboard no existe"
**Solución:** Ejecutar el script SQL `01_crear_vista_ventas_dashboard.sql`

### Error: "Columna rentabilidad no existe"
**Solución:** Implementar primero el sistema de rentabilidad:
```
implementaciones_2026/sistema_rentabilidad/01_agregar_columnas_calculadas.sql
```

### Error: "Cannot find module ventasKpiModel"
**Solución:** Verificar que los archivos estén en las carpetas correctas:
- `models/ventasKpiModel.js`
- `controllers/ventasKpiController.js`
- `routes/ventasKpiRoutes.js`

### Error: "Invalid token" o 401
**Solución:** Obtener un nuevo token JWT haciendo login

### Endpoint retorna datos vacíos
**Solución:**
1. Verificar que existen ventas en el período solicitado
2. Verificar que `factura` tiene registros con `fac_est_fac = 'A'`
3. Ejecutar query de prueba directamente en SQL:
   ```sql
   SELECT COUNT(*) FROM dbo.vw_ventas_dashboard
   WHERE fecha_venta >= DATEADD(DAY, -30, GETDATE())
   ```

### Performance lento (> 3 segundos)
**Solución:**
1. Verificar que los índices se crearon correctamente
2. Actualizar estadísticas: `UPDATE STATISTICS dbo.factura WITH FULLSCAN`
3. Revisar plan de ejecución en SQL Server

---

## 🎯 Próximos Pasos

Una vez instalado y probado:

1. **Compartir con Frontend:**
   - Enviar documentación de [docs/03_ENDPOINTS_API.md](docs/03_ENDPOINTS_API.md)
   - Compartir ejemplos de respuestas JSON
   - Coordinar estructura de componentes visuales

2. **Monitorear Performance:**
   ```bash
   pm2 monit
   ```
   - Verificar que no haya picos de CPU
   - Tiempos de respuesta deben estar < 2 segundos

3. **Configurar Caché (Opcional):**
   - Implementar caché en memoria para resultados del dashboard completo
   - Tiempo de caché recomendado: 5-15 minutos

4. **Crear Dashboards Visuales:**
   - Gráficos de tendencias (Chart.js, D3.js, Recharts)
   - Tarjetas de KPIs principales
   - Tablas de top productos/clientes

---

## 📞 Soporte

Si encuentras problemas:

1. **Revisar logs del servidor:**
   ```bash
   pm2 logs api_pretty --lines 100
   ```

2. **Revisar logs de errores SQL:**
   - SQL Server Management Studio > Activity Monitor
   - Verificar deadlocks o timeouts

3. **Consultar documentación:**
   - [README.md](README.md)
   - [docs/01_KPIS_DEFINICIONES.md](docs/01_KPIS_DEFINICIONES.md)
   - [docs/03_ENDPOINTS_API.md](docs/03_ENDPOINTS_API.md)

---

## ✅ Checklist Final

Antes de dar por completada la instalación:

- [ ] Vista `vw_ventas_dashboard` creada
- [ ] 6 índices creados y verificados
- [ ] Archivos del backend copiados
- [ ] Rutas registradas en `index.js`
- [ ] Servidor reiniciado sin errores
- [ ] Endpoint `/kpis` funciona
- [ ] Endpoint `/completo` funciona
- [ ] Todos los endpoints probados
- [ ] Documentación compartida con frontend
- [ ] Performance verificado (< 2 segundos)

---

**¡Instalación completada!** 🎉

El dashboard de ventas BI está listo para ser consumido por el frontend.

**Versión:** 1.0
**Fecha:** 2026-02-17
**Tiempo de instalación:** ~30-45 minutos
