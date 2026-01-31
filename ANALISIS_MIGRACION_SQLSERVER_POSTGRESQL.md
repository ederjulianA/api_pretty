# Análisis de Migración: SQL Server → PostgreSQL

## 📋 Resumen Ejecutivo

Este documento analiza el impacto y la estrategia para migrar el proyecto `api_pretty` de SQL Server a PostgreSQL, motivado por la reducción de costos operativos.

**Fecha de análisis:** 2025-01-27  
**Proyecto:** api_pretty  
**Motor actual:** SQL Server (mssql v11.0.1)  
**Motor objetivo:** PostgreSQL

---

## 🎯 Objetivo

Evaluar el impacto técnico, identificar riesgos y definir un plan de migración estructurado para cambiar de SQL Server a PostgreSQL sin interrumpir las operaciones del sistema.

---

## 📊 Inventario de Componentes

### 1. Dependencias de Base de Datos

#### Driver Actual
- **Paquete:** `mssql` v11.0.1
- **Ubicación:** `package.json`
- **Uso:** Conexión y ejecución de consultas en todo el proyecto

#### Archivos de Configuración
- **`db.js`**: Configuración principal de conexión
  - Pool de conexiones (max: 10, min: 0)
  - Timeouts configurados
  - Opciones de encriptación

### 2. Archivos que Requieren Modificación

#### Modelos (15 archivos)
- `models/userModel.js`
- `models/articulosModel.js`
- `models/nitModel.js`
- `models/orderModel.js`
- `models/parametrosModel.js`
- `models/proveedorModel.js`
- `models/inventarioConteo.js`
- `models/inventarioGrupoModel.js`
- `models/inventarioSubgrupoModel.js`
- `models/inventoryModel.js`
- `models/inventoryComparisonModel.js`
- `models/kardexModel.js`
- `models/promocionModel.js`
- `models/salesModel.js`
- `models/ciudadesModel.js`

#### Controladores (20+ archivos)
- `controllers/authController.js`
- `controllers/articulosController.js`
- `controllers/syncWooOrdersController.js`
- `controllers/orderController.js`
- Y otros controladores que ejecutan consultas SQL

#### Jobs Programados
- `jobs/syncWooOrders.js`
- `jobs/updateWooOrderStatusAndStock.js`
- `jobs/updateWooProductPrices.js`
- `jobs/updateArticleImagesFromWoo.js`

#### Utilidades
- `utils/facturaUtils.js`
- `utils/precioUtils.js`
- `utils/ArticuloUtils.js`

---

## 🔍 Características Específicas de SQL Server Identificadas

### 1. Funciones y Sintaxis SQL

| Característica SQL Server | Uso en Proyecto | Equivalente PostgreSQL |
|---------------------------|------------------|------------------------|
| `GETDATE()` | Múltiples consultas | `NOW()` o `CURRENT_TIMESTAMP` |
| `ISNULL(expr, default)` | Múltiples consultas | `COALESCE(expr, default)` |
| `STRING_AGG(col, separator)` | `orderModel.js` | `STRING_AGG(col, separator)` ✅ Compatible |
| `OUTPUT INSERTED.column` | `userModel.js`, `syncWooOrdersController.js` | `RETURNING column` |
| `TOP N` | `articulosModel.js`, `syncWooOrdersController.js` | `LIMIT N` |
| `ROW_NUMBER() OVER()` | `articulosModel.js` | `ROW_NUMBER() OVER()` ✅ Compatible |
| `OFFSET ... ROWS FETCH NEXT ... ROWS ONLY` | Múltiples archivos | `OFFSET ... LIMIT ...` ✅ Compatible |
| `WITH (UPDLOCK, HOLDLOCK)` | `articulosModel.js`, `orderModel.js` | `FOR UPDATE` (comportamiento similar) |
| `OPTION (RECOMPILE)` | `articulosModel.js` | Eliminar (no necesario en PostgreSQL) |
| `dbo.` schema prefix | Todas las consultas | Eliminar o usar `public.` |
| `IDENTITY(1,1)` | Scripts SQL | `SERIAL` o `GENERATED ALWAYS AS IDENTITY` |

### 2. Tipos de Datos

| Tipo SQL Server | Uso | Equivalente PostgreSQL |
|-----------------|-----|------------------------|
| `VarChar(n)` | Amplio uso | `VARCHAR(n)` ✅ Compatible |
| `NVarChar(n)` | Amplio uso | `VARCHAR(n)` (PostgreSQL maneja UTF-8 nativamente) |
| `NVarChar(MAX)` | Logs y mensajes | `TEXT` |
| `Decimal(18,0)` | IDs y secuencias | `NUMERIC(18,0)` o `BIGINT` |
| `Decimal(17,2)` | Precios | `NUMERIC(17,2)` o `DECIMAL(17,2)` |
| `Int` | IDs y contadores | `INTEGER` ✅ Compatible |
| `Bit` | Flags booleanos | `BOOLEAN` |
| `DateTime` | Fechas | `TIMESTAMP` o `TIMESTAMPTZ` |
| `Char(1)` | Flags de un carácter | `CHAR(1)` ✅ Compatible |

### 3. Características del Driver mssql

| Método/Propiedad mssql | Uso | Equivalente pg |
|------------------------|-----|----------------|
| `sql.VarChar(n)` | Tipos de parámetros | `pg.types` o strings simples |
| `sql.Int` | Tipos de parámetros | `pg.types` o números |
| `sql.Decimal(18,0)` | Tipos de parámetros | `pg.types` o strings |
| `sql.Bit` | Tipos de parámetros | `pg.types` o booleanos |
| `sql.MAX` | Texto largo | Sin equivalente directo |
| `pool.request()` | Crear request | `pool.query()` |
| `.input(name, type, value)` | Parámetros | `$1, $2, $3...` en query |
| `.query(sql)` | Ejecutar consulta | `pool.query(sql, [params])` |
| `result.recordset` | Resultados | `result.rows` |
| `sql.Transaction` | Transacciones | `pool.query('BEGIN')` + `COMMIT`/`ROLLBACK` |
| `transaction.request()` | Request en transacción | `pool.query()` dentro de transacción |

---

## ⚠️ Riesgos y Desafíos Identificados

### 🔴 Alto Impacto

1. **Cambio de Driver Completo**
   - **Riesgo:** Todas las consultas usan sintaxis específica de `mssql`
   - **Impacto:** ~50+ archivos requieren modificación
   - **Mitigación:** Crear capa de abstracción o migrar gradualmente

2. **Funciones SQL Almacenadas**
   - **Riesgo:** El proyecto menciona funciones como `fn_GetPrecioConOferta`
   - **Impacto:** Requieren reescritura completa en sintaxis PostgreSQL
   - **Mitigación:** Auditar todas las funciones y procedimientos almacenados

3. **Transacciones y Bloqueos**
   - **Riesgo:** `WITH (UPDLOCK, HOLDLOCK)` usado para secuencias
   - **Impacto:** Comportamiento de concurrencia puede cambiar
   - **Mitigación:** Usar `SELECT ... FOR UPDATE` y probar exhaustivamente

4. **OUTPUT INSERTED vs RETURNING**
   - **Riesgo:** Cambio en cómo se obtienen valores insertados
   - **Impacto:** Múltiples modelos afectados
   - **Mitigación:** Reemplazar con `RETURNING` (más estándar)

### 🟡 Impacto Medio

5. **Tipos de Datos**
   - **Riesgo:** Algunos tipos pueden tener diferencias sutiles
   - **Impacto:** Validación y conversión de datos
   - **Mitigación:** Scripts de migración de esquema

6. **Paginación**
   - **Riesgo:** `OFFSET ... ROWS FETCH NEXT` es compatible pero diferente sintaxis
   - **Impacto:** Múltiples consultas de paginación
   - **Mitigación:** Cambio simple a `OFFSET ... LIMIT`

7. **Manejo de NULLs**
   - **Riesgo:** `ISNULL()` vs `COALESCE()` (comportamiento idéntico)
   - **Impacto:** Cambio en todas las consultas
   - **Mitigación:** Búsqueda y reemplazo global

### 🟢 Bajo Impacto

8. **Schema Prefix (`dbo.`)**
   - **Riesgo:** PostgreSQL usa `public` por defecto
   - **Impacto:** Cambio cosmético en consultas
   - **Mitigación:** Búsqueda y reemplazo

9. **Funciones de Fecha**
   - **Riesgo:** `GETDATE()` vs `NOW()`
   - **Impacto:** Cambio simple
   - **Mitigación:** Búsqueda y reemplazo

---

## 📋 Plan de Migración Recomendado

### Fase 1: Preparación (1-2 semanas)

#### 1.1 Auditoría Completa
- [ ] Inventariar todas las consultas SQL en el proyecto
- [ ] Identificar todas las funciones y procedimientos almacenados
- [ ] Documentar dependencias entre tablas y vistas
- [ ] Crear script de exportación de esquema SQL Server

#### 1.2 Configuración de Entorno
- [ ] Instalar PostgreSQL en entorno de desarrollo
- [ ] Configurar base de datos de prueba
- [ ] Crear scripts de migración de esquema
- [ ] Configurar herramientas de migración (opcional: pgloader, AWS DMS)

#### 1.3 Capa de Abstracción (Opcional pero Recomendado)
- [ ] Crear módulo `db-adapter.js` que abstraiga diferencias
- [ ] Implementar métodos comunes: `query()`, `transaction()`, etc.
- [ ] Mantener compatibilidad con código existente

### Fase 2: Migración de Esquema (1 semana)

#### 2.1 Conversión de DDL
- [ ] Convertir scripts de creación de tablas
- [ ] Migrar índices y constraints
- [ ] Convertir funciones SQL a PostgreSQL
- [ ] Migrar vistas (`vwExistencias`, etc.)

#### 2.2 Migración de Datos
- [ ] Exportar datos de SQL Server
- [ ] Transformar datos según tipos nuevos
- [ ] Importar a PostgreSQL
- [ ] Validar integridad referencial

### Fase 3: Migración de Código (3-4 semanas)

#### 3.1 Actualizar Dependencias
```json
// package.json
{
  "dependencies": {
    "pg": "^8.11.0",           // Reemplazar mssql
    "pg-pool": "^3.6.0"        // Para pool de conexiones
  }
}
```

#### 3.2 Migrar db.js
```javascript
// db.js - Nueva versión para PostgreSQL
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 60000,
});

module.exports = { pool };
```

#### 3.3 Migrar Modelos (Prioridad)
1. **Modelos críticos primero:**
   - `userModel.js` (autenticación)
   - `articulosModel.js` (productos)
   - `orderModel.js` (pedidos)

2. **Patrón de migración:**
```javascript
// ANTES (SQL Server)
const result = await pool.request()
  .input('id', sql.VarChar(100), id)
  .query('SELECT * FROM dbo.Users WHERE usu_cod = @id');
return result.recordset[0];

// DESPUÉS (PostgreSQL)
const result = await pool.query(
  'SELECT * FROM users WHERE usu_cod = $1',
  [id]
);
return result.rows[0];
```

#### 3.4 Migrar Transacciones
```javascript
// ANTES (SQL Server)
const transaction = new sql.Transaction(pool);
await transaction.begin();
try {
  await transaction.request().query('...');
  await transaction.commit();
} catch (error) {
  await transaction.rollback();
}

// DESPUÉS (PostgreSQL)
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query('...');
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
}
```

#### 3.5 Migrar Consultas Específicas

**OUTPUT INSERTED:**
```sql
-- SQL Server
INSERT INTO Users (name, email) 
OUTPUT INSERTED.id 
VALUES (@name, @email);

-- PostgreSQL
INSERT INTO users (name, email) 
VALUES ($1, $2) 
RETURNING id;
```

**ISNULL:**
```sql
-- SQL Server
SELECT ISNULL(price, 0) AS price

-- PostgreSQL
SELECT COALESCE(price, 0) AS price
```

**GETDATE:**
```sql
-- SQL Server
WHERE created_at >= GETDATE()

-- PostgreSQL
WHERE created_at >= NOW()
```

**TOP N:**
```sql
-- SQL Server
SELECT TOP 1 * FROM articles

-- PostgreSQL
SELECT * FROM articles LIMIT 1
```

**WITH (UPDLOCK, HOLDLOCK):**
```sql
-- SQL Server
SELECT sec_num FROM secuencia 
WITH (UPDLOCK, HOLDLOCK) 
WHERE sec_cod = 'ARTICULOS'

-- PostgreSQL
SELECT sec_num FROM secuencia 
WHERE sec_cod = 'ARTICULOS' 
FOR UPDATE
```

### Fase 4: Testing (2 semanas)

#### 4.1 Testing Unitario
- [ ] Probar cada modelo migrado
- [ ] Validar tipos de datos
- [ ] Verificar transacciones

#### 4.2 Testing de Integración
- [ ] Probar endpoints completos
- [ ] Validar sincronización con WooCommerce
- [ ] Probar jobs programados

#### 4.3 Testing de Carga
- [ ] Probar con volúmenes de datos reales
- [ ] Validar performance
- [ ] Optimizar consultas si es necesario

### Fase 5: Despliegue (1 semana)

#### 5.1 Preparación
- [ ] Backup completo de SQL Server
- [ ] Migración final de datos
- [ ] Configurar PostgreSQL en producción

#### 5.2 Despliegue Gradual
- [ ] Desplegar en horario de bajo tráfico
- [ ] Monitorear errores y performance
- [ ] Tener plan de rollback listo

#### 5.3 Post-Despliegue
- [ ] Monitoreo continuo (1 semana)
- [ ] Optimización de consultas
- [ ] Documentación de cambios

---

## 🛠️ Herramientas Recomendadas

### Migración de Datos
1. **pgloader**: Herramienta open-source para migración
   ```bash
   pgloader mssql://user:pass@server/db postgresql://user:pass@server/db
   ```

2. **AWS Database Migration Service (DMS)**: Si usas AWS

3. **Scripts personalizados**: Para transformaciones complejas

### Desarrollo
1. **pgAdmin**: Cliente gráfico para PostgreSQL
2. **DBeaver**: Cliente universal de bases de datos
3. **PostgreSQL Extension para VS Code**: Desarrollo local

### Testing
1. **Jest**: Testing unitario
2. **Supertest**: Testing de APIs
3. **Artillery**: Testing de carga

---

## 📊 Estimación de Esfuerzo

| Fase | Tareas | Tiempo Estimado | Complejidad |
|------|--------|-----------------|-------------|
| Preparación | Auditoría y setup | 1-2 semanas | Media |
| Migración de Esquema | DDL y datos | 1 semana | Alta |
| Migración de Código | Modelos y controladores | 3-4 semanas | Alta |
| Testing | Unitario, integración, carga | 2 semanas | Media |
| Despliegue | Producción y monitoreo | 1 semana | Alta |
| **TOTAL** | | **8-10 semanas** | |

**Recursos necesarios:**
- 1-2 desarrolladores backend
- 1 DBA (tiempo parcial)
- 1 QA (testing)

---

## 💰 Consideraciones de Costos

### Ahorros Esperados
- **Licencias SQL Server**: Eliminación de costos de licenciamiento
- **Hosting**: PostgreSQL puede ser más económico en cloud
- **Mantenimiento**: Menor costo de soporte

### Costos de Migración
- **Tiempo de desarrollo**: 8-10 semanas
- **Testing y QA**: 2 semanas
- **Riesgo de downtime**: Mitigar con plan adecuado
- **Capacitación**: Si el equipo no conoce PostgreSQL

---

## ✅ Checklist de Migración

### Pre-Migración
- [ ] Backup completo de SQL Server
- [ ] Documentación de esquema actual
- [ ] Inventario de todas las consultas
- [ ] Identificación de funciones/procedimientos almacenados
- [ ] Plan de rollback definido

### Durante Migración
- [ ] Entorno de desarrollo configurado
- [ ] Esquema migrado y validado
- [ ] Datos migrados y verificados
- [ ] Código migrado por módulos
- [ ] Tests pasando

### Post-Migración
- [ ] Monitoreo activo
- [ ] Performance validada
- [ ] Documentación actualizada
- [ ] Equipo capacitado
- [ ] Plan de optimización

---

## 🚨 Puntos Críticos de Atención

1. **Secuencias y Auto-incremento**
   - SQL Server usa `IDENTITY`, PostgreSQL usa `SERIAL` o `GENERATED ALWAYS AS IDENTITY`
   - Verificar que los valores se migren correctamente

2. **Bloqueos y Concurrencia**
   - PostgreSQL maneja bloqueos de forma diferente
   - Probar exhaustivamente las secuencias y transacciones concurrentes

3. **Funciones SQL Almacenadas**
   - Revisar todas las funciones mencionadas en documentación
   - Convertir sintaxis T-SQL a PL/pgSQL

4. **Vistas Materializadas**
   - Si existen, migrarlas correctamente
   - Verificar `vwExistencias` y otras vistas

5. **Jobs y Tareas Programadas**
   - Asegurar que los jobs funcionen con PostgreSQL
   - Verificar timeouts y reconexiones

---

## 📚 Recursos y Referencias

### Documentación
- [PostgreSQL Official Docs](https://www.postgresql.org/docs/)
- [node-postgres (pg) Documentation](https://node-postgres.com/)
- [SQL Server to PostgreSQL Migration Guide](https://www.postgresql.org/docs/current/migration.html)

### Guías de Migración
- [Migrating from SQL Server to PostgreSQL](https://wiki.postgresql.org/wiki/Converting_from_other_Databases_to_PostgreSQL#Microsoft_SQL_Server)

### Herramientas
- [pgloader](https://pgloader.readthedocs.io/)
- [AWS DMS](https://aws.amazon.com/dms/)

---

## 🎯 Recomendación Final

**La migración es factible pero requiere planificación cuidadosa.**

### Ventajas
✅ Reducción significativa de costos  
✅ PostgreSQL es open-source y robusto  
✅ Mejor soporte para JSON y tipos avanzados  
✅ Comunidad activa y recursos abundantes

### Desafíos
⚠️ Tiempo de desarrollo (8-10 semanas)  
⚠️ Riesgo de bugs durante transición  
⚠️ Necesidad de testing exhaustivo  
⚠️ Curva de aprendizaje del equipo

### Estrategia Recomendada
1. **Empezar con módulo piloto** (ej: autenticación)
2. **Migrar gradualmente** por módulos
3. **Mantener SQL Server en paralelo** durante transición
4. **Testing exhaustivo** antes de producción
5. **Despliegue gradual** con monitoreo intensivo

---

## 📝 Notas Adicionales

- Este análisis se basa en el código actual del proyecto
- Se recomienda una auditoría más profunda antes de iniciar
- Considerar usar un ORM (Sequelize ya está en dependencias) para abstraer diferencias
- Evaluar migración a TypeScript para mejor tipado y mantenibilidad

---

**Documento generado:** 2025-01-27  
**Versión:** 1.0  
**Autor:** Análisis Automatizado

