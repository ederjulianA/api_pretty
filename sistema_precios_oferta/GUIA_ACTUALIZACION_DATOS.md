# Guía de Actualización de Datos Históricos

## 📋 Resumen

Esta guía proporciona instrucciones paso a paso para actualizar los registros existentes en la tabla `facturakardes` con información de precios y ofertas, garantizando la consistencia de datos históricos.

## 🎯 Objetivo

Actualizar todos los registros existentes en `facturakardes` con:
- Precios detal y mayor al momento de facturar
- Información de ofertas aplicadas
- Datos de promociones vigentes

## 📁 Scripts Disponibles

### 1. **02_agregar_campos_precios_facturakardes.sql**
- **Propósito**: Crear los nuevos campos en la tabla
- **Cuándo ejecutar**: PRIMERO, antes de cualquier actualización
- **Frecuencia**: Una sola vez

### 2. **03_actualizar_registros_existentes.sql**
- **Propósito**: Actualización completa con progreso detallado
- **Cuándo ejecutar**: Para bases de datos grandes (>10,000 registros)
- **Características**: 
  - Progreso en tiempo real
  - Estimación de tiempo restante
  - Estadísticas detalladas
  - Manejo de errores

### 3. **03_actualizar_registros_simple.sql**
- **Propósito**: Actualización rápida y simple
- **Cuándo ejecutar**: Para bases de datos pequeñas (<10,000 registros)
- **Características**:
  - Ejecución más rápida
  - Menos detalle en el progreso
  - Ideal para pruebas

### 4. **04_verificar_actualizacion.sql**
- **Propósito**: Verificar que la actualización fue exitosa
- **Cuándo ejecutar**: DESPUÉS de cualquier actualización
- **Características**:
  - Verificación completa de integridad
  - Estadísticas detalladas
  - Muestras de datos

## 🚀 Proceso de Actualización

### Paso 1: Preparación
```sql
-- 1. Verificar que no hay transacciones activas
SELECT @@TRANCOUNT;

-- 2. Hacer backup de la tabla (recomendado)
SELECT * INTO facturakardes_backup_YYYYMMDD 
FROM dbo.facturakardes;
```

### Paso 2: Crear Campos
```sql
-- Ejecutar en SQL Server Management Studio
-- Archivo: 02_agregar_campos_precios_facturakardes.sql
```

### Paso 3: Elegir Script de Actualización

#### Opción A: Base de Datos Grande (>10,000 registros)
```sql
-- Ejecutar: 03_actualizar_registros_existentes.sql
-- Este script mostrará:
-- - Progreso en tiempo real
-- - Estimación de tiempo restante
-- - Estadísticas por factura
-- - Resumen final detallado
```

#### Opción B: Base de Datos Pequeña (<10,000 registros)
```sql
-- Ejecutar: 03_actualizar_registros_simple.sql
-- Este script es más rápido pero con menos detalle
```

### Paso 4: Verificar Actualización
```sql
-- Ejecutar: 04_verificar_actualizacion.sql
-- Este script verificará:
-- - Existencia de campos
-- - Completitud de datos
-- - Integridad de información
-- - Estadísticas de ofertas
```

## 📊 Monitoreo del Proceso

### Durante la Actualización (Script Completo)

El script mostrará información como:
```
Procesando factura 1 de 150 (fac_sec: 12345, fecha: 15/01/2024)
  - Registros actualizados en esta factura: 5
  - Progreso total: 5 de 1500
  - Progreso: 0.67% completado
  - Tiempo transcurrido: 2 minutos
  - Tiempo estimado restante: 298 minutos
```

### Después de la Actualización

El script de verificación mostrará:
```
========================================
RESUMEN DE VERIFICACIÓN
========================================
✅ TODOS LOS REGISTROS HAN SIDO ACTUALIZADOS CORRECTAMENTE
✅ INTEGRIDAD DE DATOS: CORRECTA
✅ ACTUALIZACIÓN: EXITOSA (100.00% completado)
```

## ⚠️ Consideraciones Importantes

### 1. **Tiempo de Ejecución**
- **Bases pequeñas** (<1,000 registros): 1-5 minutos
- **Bases medianas** (1,000-10,000 registros): 5-30 minutos
- **Bases grandes** (>10,000 registros): 30 minutos - varias horas

### 2. **Recursos del Sistema**
- **CPU**: Alto uso durante la actualización
- **Memoria**: Aumento temporal del uso
- **Disco**: Operaciones de lectura/escritura intensivas
- **Red**: Si la BD está en servidor remoto

### 3. **Horario Recomendado**
- **Horario de bajo tráfico**
- **Fin de semana** (si es posible)
- **Respaldo previo** obligatorio

### 4. **Monitoreo**
- Verificar logs de SQL Server
- Monitorear uso de recursos
- Tener plan de rollback listo

## 🔧 Solución de Problemas

### Error: "Los campos de precios no han sido creados"
```sql
-- Solución: Ejecutar primero 02_agregar_campos_precios_facturakardes.sql
```

### Error: "Timeout" en bases grandes
```sql
-- Solución: 
-- 1. Aumentar timeout de la sesión
SET LOCK_TIMEOUT 3600000; -- 1 hora

-- 2. Ejecutar en lotes más pequeños
-- Modificar el script para procesar por rangos de fechas
```

### Error: "Out of memory"
```sql
-- Solución:
-- 1. Cerrar otras aplicaciones
-- 2. Ejecutar en horario de bajo uso
-- 3. Usar el script simple en lugar del completo
```

### Registros pendientes después de la actualización
```sql
-- Verificar registros sin datos:
SELECT COUNT(*) 
FROM dbo.facturakardes 
WHERE kar_pre_pub_detal IS NULL;

-- Si hay registros pendientes, verificar:
-- 1. Artículos sin precios en articulosdetalle
-- 2. Fechas de facturación muy antiguas
-- 3. Artículos eliminados
```

## 📈 Métricas de Éxito

### Antes de la Actualización
- ✅ Campos creados correctamente
- ✅ Backup realizado
- ✅ Horario apropiado seleccionado

### Durante la Actualización
- ✅ Progreso visible
- ✅ Sin errores críticos
- ✅ Tiempo de ejecución razonable

### Después de la Actualización
- ✅ 100% de registros actualizados
- ✅ Integridad de datos verificada
- ✅ Estadísticas de ofertas coherentes
- ✅ Rendimiento de consultas mejorado

## 🔄 Post-Actualización

### 1. **Verificar Funcionalidad**
```sql
-- Probar consulta de órdenes
SELECT TOP 10 * FROM dbo.facturakardes 
WHERE kar_tiene_oferta = 'S';
```

### 2. **Monitorear Rendimiento**
- Verificar que las consultas de órdenes son más rápidas
- Monitorear uso de CPU y memoria
- Verificar que no hay bloqueos

### 3. **Documentar Cambios**
- Registrar fecha de actualización
- Guardar estadísticas finales
- Documentar cualquier problema encontrado

### 4. **Limpiar Recursos**
```sql
-- Eliminar backup temporal si todo está bien
-- DROP TABLE facturakardes_backup_YYYYMMDD;
```

## 📞 Soporte

Si encuentras problemas durante la actualización:

1. **Documentar el error** exacto
2. **Guardar logs** de SQL Server
3. **Verificar recursos** del sistema
4. **Consultar** con el equipo de desarrollo

## ✅ Checklist Final

- [ ] Backup realizado
- [ ] Campos creados (script 02)
- [ ] Actualización ejecutada (script 03)
- [ ] Verificación completada (script 04)
- [ ] Funcionalidad probada
- [ ] Rendimiento verificado
- [ ] Documentación actualizada 