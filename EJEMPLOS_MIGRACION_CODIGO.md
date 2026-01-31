# Ejemplos Prácticos de Migración de Código

Este documento proporciona ejemplos concretos de cómo migrar código de SQL Server a PostgreSQL en el proyecto `api_pretty`.

---

## 1. Configuración de Conexión

### ANTES (SQL Server - db.js)
```javascript
// db.js
require('dotenv').config();
const sql = require('mssql');

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  port: parseInt(process.env.DB_PORT, 10),
  options: {
    encrypt: false,
    trustServerCertificate: false,
    requestTimeout: 300000,
    connectionTimeout: 60000,
    cancelTimeout: 5000
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
    acquireTimeoutMillis: 60000
  }
};

const poolPromise = new sql.ConnectionPool(config)
  .connect()
  .then(pool => {
    console.log('Conexión a SQL Server establecida.');
    return pool;
  })
  .catch(err => {
    console.error('Error al conectar a SQL Server:', err);
    process.exit(1);
  });

module.exports = { sql, poolPromise };
```

### DESPUÉS (PostgreSQL - db.js)
```javascript
// db.js
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 60000,
  // PostgreSQL no necesita opciones de encriptación como SQL Server
});

// Verificar conexión
pool.on('connect', () => {
  console.log('Conexión a PostgreSQL establecida.');
});

pool.on('error', (err) => {
  console.error('Error inesperado en el pool de PostgreSQL:', err);
  process.exit(1);
});

module.exports = { pool };
```

---

## 2. Consultas Simples con Parámetros

### ANTES (SQL Server)
```javascript
// models/userModel.js
const findUserByCod = async (usu_cod) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('usu_cod', sql.VarChar(100), usu_cod)
      .query('SELECT * FROM dbo.Usuarios WHERE usu_cod = @usu_cod');
    return result.recordset[0];
  } catch (error) {
    throw error;
  }
};
```

### DESPUÉS (PostgreSQL)
```javascript
// models/userModel.js
const findUserByCod = async (usu_cod) => {
  try {
    const { pool } = require('../db');
    const result = await pool.query(
      'SELECT * FROM usuarios WHERE usu_cod = $1',
      [usu_cod]
    );
    return result.rows[0];
  } catch (error) {
    throw error;
  }
};
```

---

## 3. INSERT con OUTPUT INSERTED

### ANTES (SQL Server)
```javascript
// models/userModel.js
const createUser = async ({ name, email, role_id }) => {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const userResult = await transaction.request()
      .input('usu_nom', sql.VarChar(100), name)
      .input('usu_email', sql.VarChar(100), email)
      .query('INSERT INTO dbo.Usuarios (usu_nom, usu_email) OUTPUT INSERTED.usu_cod as id VALUES (@usu_nom, @usu_email)');
    const usu_cod = userResult.recordset[0].id;
    
    await transaction.request()
      .input('usu_cod', sql.VarChar(100), usu_cod)
      .input('rol_id', sql.Int, role_id)
      .query('INSERT INTO dbo.UsuariosRoles (usu_cod, rol_id) VALUES (@usu_cod, @rol_id)');
    
    await transaction.commit();
    return { id: usu_cod, name, email, role_id };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};
```

### DESPUÉS (PostgreSQL)
```javascript
// models/userModel.js
const createUser = async ({ name, email, role_id }) => {
  const { pool } = require('../db');
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const userResult = await client.query(
      'INSERT INTO usuarios (usu_nom, usu_email) VALUES ($1, $2) RETURNING usu_cod as id',
      [name, email]
    );
    const usu_cod = userResult.rows[0].id;
    
    await client.query(
      'INSERT INTO usuarios_roles (usu_cod, rol_id) VALUES ($1, $2)',
      [usu_cod, role_id]
    );
    
    await client.query('COMMIT');
    return { id: usu_cod, name, email, role_id };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
```

---

## 4. Consultas con ISNULL

### ANTES (SQL Server)
```javascript
// models/articulosModel.js
const query = `
  SELECT 
    ISNULL(ad1.art_bod_pre, 0) AS precio_detal_original,
    ISNULL(ad2.art_bod_pre, 0) AS precio_mayor_original
  FROM dbo.articulos a
  LEFT JOIN dbo.articulosdetalle ad1 ON a.art_sec = ad1.art_sec AND ad1.lis_pre_cod = 1
  LEFT JOIN dbo.articulosdetalle ad2 ON a.art_sec = ad2.art_sec AND ad2.lis_pre_cod = 2
`;
```

### DESPUÉS (PostgreSQL)
```javascript
// models/articulosModel.js
const query = `
  SELECT 
    COALESCE(ad1.art_bod_pre, 0) AS precio_detal_original,
    COALESCE(ad2.art_bod_pre, 0) AS precio_mayor_original
  FROM articulos a
  LEFT JOIN articulosdetalle ad1 ON a.art_sec = ad1.art_sec AND ad1.lis_pre_cod = 1
  LEFT JOIN articulosdetalle ad2 ON a.art_sec = ad2.art_sec AND ad2.lis_pre_cod = 2
`;
```

---

## 5. Consultas con GETDATE()

### ANTES (SQL Server)
```javascript
// models/articulosModel.js
const query = `
  SELECT * FROM dbo.promociones p
  INNER JOIN dbo.promociones_detalle pd ON p.pro_sec = pd.pro_sec
  WHERE p.pro_activa = 'S'
    AND GETDATE() BETWEEN p.pro_fecha_inicio AND p.pro_fecha_fin
`;
```

### DESPUÉS (PostgreSQL)
```javascript
// models/articulosModel.js
const query = `
  SELECT * FROM promociones p
  INNER JOIN promociones_detalle pd ON p.pro_sec = pd.pro_sec
  WHERE p.pro_activa = 'S'
    AND NOW() BETWEEN p.pro_fecha_inicio AND p.pro_fecha_fin
`;
```

---

## 6. Paginación con OFFSET/FETCH

### ANTES (SQL Server)
```javascript
// models/nitModel.js
const query = `
  SELECT *
  FROM dbo.nit
  WHERE (@nit_ide IS NULL OR nit_ide = @nit_ide)
    AND (@nit_nom IS NULL OR nit_nom LIKE '%' + @nit_nom + '%')
  ORDER BY nit_nom
  OFFSET (@PageNumber - 1) * @PageSize ROWS
  FETCH NEXT @PageSize ROWS ONLY
`;

const result = await pool.request()
  .input('nit_ide', sql.VarChar(16), nit_ide)
  .input('nit_nom', sql.VarChar(100), nit_nom)
  .input('PageNumber', sql.Int, PageNumber)
  .input('PageSize', sql.Int, PageSize)
  .query(query);
```

### DESPUÉS (PostgreSQL)
```javascript
// models/nitModel.js
const query = `
  SELECT *
  FROM nit
  WHERE ($1 IS NULL OR nit_ide = $1)
    AND ($2 IS NULL OR nit_nom LIKE '%' || $2 || '%')
  ORDER BY nit_nom
  OFFSET ($3 - 1) * $4
  LIMIT $4
`;

const result = await pool.query(query, [
  nit_ide || null,
  nit_nom || null,
  PageNumber,
  PageSize
]);
```

---

## 7. TOP N → LIMIT

### ANTES (SQL Server)
```javascript
// models/articulosModel.js
const query = `
  SELECT TOP 1 art_cod
  FROM dbo.articulos
  WHERE LEN(art_cod) = 4
    AND art_cod LIKE '[0-9][0-9][0-9][0-9]'
  ORDER BY CAST(art_cod AS INT) DESC
`;
```

### DESPUÉS (PostgreSQL)
```javascript
// models/articulosModel.js
const query = `
  SELECT art_cod
  FROM articulos
  WHERE LENGTH(art_cod) = 4
    AND art_cod ~ '^[0-9]{4}$'
  ORDER BY CAST(art_cod AS INTEGER) DESC
  LIMIT 1
`;
```

---

## 8. STRING_AGG (Compatible)

### ANTES (SQL Server)
```javascript
// models/orderModel.js
const query = `
  SELECT 
    f.fac_nro,
    (SELECT STRING_AGG(fac_nro_origen, ', ') 
     FROM (SELECT DISTINCT f2.fac_nro_origen 
           FROM factura f2 
           WHERE f2.fac_nro = f.fac_nro_origen 
           AND f2.fac_est_fac = 'A') AS docs) as documentos
  FROM dbo.factura f
`;
```

### DESPUÉS (PostgreSQL)
```javascript
// models/orderModel.js
const query = `
  SELECT 
    f.fac_nro,
    (SELECT STRING_AGG(fac_nro_origen, ', ') 
     FROM (SELECT DISTINCT f2.fac_nro_origen 
           FROM factura f2 
           WHERE f2.fac_nro = f.fac_nro_origen 
           AND f2.fac_est_fac = 'A') AS docs) as documentos
  FROM factura f
`;
// Nota: STRING_AGG es compatible, solo se elimina dbo.
```

---

## 9. Secuencias con Bloqueos (UPDLOCK, HOLDLOCK)

### ANTES (SQL Server)
```javascript
// models/articulosModel.js
const getNextSecQuery = `
  SELECT sec_num + 1 AS NewArtSec
  FROM dbo.secuencia WITH (UPDLOCK, HOLDLOCK)
  WHERE sec_cod = 'ARTICULOS'
`;

const secResult = await request.query(getNextSecQuery);
art_sec = secResult.recordset[0].NewArtSec;

const updateSecQuery = `
  UPDATE dbo.secuencia
  SET sec_num = @newSecNum
  WHERE sec_cod = 'ARTICULOS'
`;

await request
  .input('newSecNum', sql.Decimal(18, 0), art_sec)
  .query(updateSecQuery);
```

### DESPUÉS (PostgreSQL)
```javascript
// models/articulosModel.js
// Opción 1: Usar SELECT FOR UPDATE
const getNextSecQuery = `
  SELECT sec_num + 1 AS NewArtSec
  FROM secuencia
  WHERE sec_cod = $1
  FOR UPDATE
`;

const secResult = await client.query(getNextSecQuery, ['ARTICULOS']);
art_sec = secResult.rows[0].newartsec;

const updateSecQuery = `
  UPDATE secuencia
  SET sec_num = $1
  WHERE sec_cod = $2
`;

await client.query(updateSecQuery, [art_sec, 'ARTICULOS']);

// Opción 2: Usar secuencias nativas de PostgreSQL (RECOMENDADO)
const getNextSecQuery = `SELECT nextval('articulos_art_sec_seq')`;
const secResult = await client.query(getNextSecQuery);
art_sec = secResult.rows[0].nextval;
```

---

## 10. Consultas con LIKE y Concatenación

### ANTES (SQL Server)
```javascript
// models/proveedorModel.js
query += " AND nit_nom LIKE '%' + @nit_nom + '%'";
```

### DESPUÉS (PostgreSQL)
```javascript
// models/proveedorModel.js
query += " AND nit_nom LIKE '%' || $1 || '%'";
// O mejor aún:
query += " AND nit_nom ILIKE $1"; // ILIKE es case-insensitive
// Y pasar el parámetro: `%${nit_nom}%`
```

---

## 11. Tipos de Datos en Parámetros

### ANTES (SQL Server)
```javascript
const result = await pool.request()
  .input('art_cod', sql.VarChar(50), art_cod)
  .input('precio', sql.Decimal(17, 2), precio)
  .input('activo', sql.Bit, activo)
  .input('cantidad', sql.Int, cantidad)
  .query('INSERT INTO articulos ...');
```

### DESPUÉS (PostgreSQL)
```javascript
// PostgreSQL infiere tipos automáticamente, pero puedes especificarlos
const result = await pool.query(
  'INSERT INTO articulos (art_cod, precio, activo, cantidad) VALUES ($1, $2, $3, $4)',
  [
    art_cod,           // VARCHAR - se infiere automáticamente
    precio,            // NUMERIC - se infiere automáticamente
    activo,            // BOOLEAN - se infiere automáticamente
    cantidad           // INTEGER - se infiere automáticamente
  ]
);

// Si necesitas casting explícito:
const result = await pool.query(
  'INSERT INTO articulos (art_cod, precio) VALUES ($1::VARCHAR, $2::NUMERIC(17,2))',
  [art_cod, precio]
);
```

---

## 12. Consultas Complejas con Subconsultas

### ANTES (SQL Server)
```javascript
// models/articulosModel.js
const query = `
  SELECT 
    a.art_sec,
    a.art_cod,
    CASE 
      WHEN oferta_prioritaria.pro_det_precio_oferta IS NOT NULL 
        THEN oferta_prioritaria.pro_det_precio_oferta 
      ELSE ISNULL(ad1.art_bod_pre, 0) 
    END AS precio_detal
  FROM dbo.articulos a
  LEFT JOIN dbo.articulosdetalle ad1 ON a.art_sec = ad1.art_sec AND ad1.lis_pre_cod = 1
  LEFT JOIN (
    SELECT 
      pd.art_sec,
      pd.pro_det_precio_oferta,
      ROW_NUMBER() OVER (
        PARTITION BY pd.art_sec 
        ORDER BY ISNULL(pd.pro_det_precio_oferta, 0) DESC
      ) as rn
    FROM dbo.promociones_detalle pd
    INNER JOIN dbo.promociones p ON pd.pro_sec = p.pro_sec 
    WHERE p.pro_activa = 'S'
      AND GETDATE() BETWEEN p.pro_fecha_inicio AND p.pro_fecha_fin
  ) oferta_prioritaria ON a.art_sec = oferta_prioritaria.art_sec 
    AND oferta_prioritaria.rn = 1
  OPTION (RECOMPILE);
`;
```

### DESPUÉS (PostgreSQL)
```javascript
// models/articulosModel.js
const query = `
  SELECT 
    a.art_sec,
    a.art_cod,
    CASE 
      WHEN oferta_prioritaria.pro_det_precio_oferta IS NOT NULL 
        THEN oferta_prioritaria.pro_det_precio_oferta 
      ELSE COALESCE(ad1.art_bod_pre, 0) 
    END AS precio_detal
  FROM articulos a
  LEFT JOIN articulosdetalle ad1 ON a.art_sec = ad1.art_sec AND ad1.lis_pre_cod = 1
  LEFT JOIN (
    SELECT 
      pd.art_sec,
      pd.pro_det_precio_oferta,
      ROW_NUMBER() OVER (
        PARTITION BY pd.art_sec 
        ORDER BY COALESCE(pd.pro_det_precio_oferta, 0) DESC
      ) as rn
    FROM promociones_detalle pd
    INNER JOIN promociones p ON pd.pro_sec = p.pro_sec 
    WHERE p.pro_activa = 'S'
      AND NOW() BETWEEN p.pro_fecha_inicio AND p.pro_fecha_fin
  ) oferta_prioritaria ON a.art_sec = oferta_prioritaria.art_sec 
    AND oferta_prioritaria.rn = 1
`;
// Nota: Se elimina OPTION (RECOMPILE) - no existe en PostgreSQL
```

---

## 13. Funciones de Fecha

### ANTES (SQL Server)
```javascript
// Varios archivos
const query = `
  INSERT INTO nit (nit_fec_cre) VALUES (GETDATE())
`;

const query2 = `
  WHERE fac_fec >= DATEADD(day, -7, GETDATE())
`;
```

### DESPUÉS (PostgreSQL)
```javascript
// Varios archivos
const query = `
  INSERT INTO nit (nit_fec_cre) VALUES (NOW())
`;

const query2 = `
  WHERE fac_fec >= NOW() - INTERVAL '7 days'
`;
// O también:
const query2 = `
  WHERE fac_fec >= CURRENT_DATE - INTERVAL '7 days'
`;
```

---

## 14. Eliminar Schema Prefix (dbo.)

### ANTES (SQL Server)
```javascript
// Todas las consultas
SELECT * FROM dbo.articulos
INSERT INTO dbo.factura ...
UPDATE dbo.nit SET ...
```

### DESPUÉS (PostgreSQL)
```javascript
// Todas las consultas
SELECT * FROM articulos
INSERT INTO factura ...
UPDATE nit SET ...

// O si necesitas especificar schema explícitamente:
SELECT * FROM public.articulos
```

---

## 15. Patrón de Helper para Migración

### Crear un helper para facilitar la migración
```javascript
// utils/dbHelper.js
const { pool } = require('../db');

class DBHelper {
  /**
   * Ejecuta una consulta con parámetros
   * @param {string} query - Consulta SQL con $1, $2, etc.
   * @param {Array} params - Array de parámetros
   * @returns {Promise<Object>} - Resultado de la consulta
   */
  static async query(query, params = []) {
    try {
      const result = await pool.query(query, params);
      return {
        rows: result.rows,
        rowCount: result.rowCount,
        recordset: result.rows // Alias para compatibilidad
      };
    } catch (error) {
      console.error('Error en consulta:', error);
      throw error;
    }
  }

  /**
   * Ejecuta una transacción
   * @param {Function} callback - Función que recibe el client
   * @returns {Promise<any>} - Resultado de la transacción
   */
  static async transaction(callback) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Obtiene un solo registro
   * @param {string} query - Consulta SQL
   * @param {Array} params - Parámetros
   * @returns {Promise<Object|null>} - Primer registro o null
   */
  static async one(query, params = []) {
    const result = await this.query(query, params);
    return result.rows[0] || null;
  }

  /**
   * Obtiene múltiples registros
   * @param {string} query - Consulta SQL
   * @param {Array} params - Parámetros
   * @returns {Promise<Array>} - Array de registros
   */
  static async many(query, params = []) {
    const result = await this.query(query, params);
    return result.rows;
  }
}

module.exports = DBHelper;
```

### Uso del Helper
```javascript
// models/userModel.js
const DBHelper = require('../utils/dbHelper');

const findUserByCod = async (usu_cod) => {
  return await DBHelper.one(
    'SELECT * FROM usuarios WHERE usu_cod = $1',
    [usu_cod]
  );
};

const getAllUsers = async () => {
  return await DBHelper.many(
    'SELECT * FROM usuarios'
  );
};

const createUser = async ({ name, email, role_id }) => {
  return await DBHelper.transaction(async (client) => {
    const userResult = await client.query(
      'INSERT INTO usuarios (usu_nom, usu_email) VALUES ($1, $2) RETURNING usu_cod',
      [name, email]
    );
    const usu_cod = userResult.rows[0].usu_cod;
    
    await client.query(
      'INSERT INTO usuarios_roles (usu_cod, rol_id) VALUES ($1, $2)',
      [usu_cod, role_id]
    );
    
    return { id: usu_cod, name, email, role_id };
  });
};
```

---

## 16. Script de Búsqueda y Reemplazo Global

### Comandos útiles para migración masiva

```bash
# Buscar y reemplazar en todos los archivos .js
# 1. ISNULL → COALESCE
find . -name "*.js" -type f -exec sed -i 's/ISNULL(/COALESCE(/g' {} \;

# 2. GETDATE() → NOW()
find . -name "*.js" -type f -exec sed -i "s/GETDATE()/NOW()/g" {} \;

# 3. dbo. → (vacío)
find . -name "*.js" -type f -exec sed -i "s/dbo\.//g" {} \;

# 4. TOP 1 → LIMIT 1 (requiere revisión manual)
# 5. OUTPUT INSERTED → RETURNING (requiere revisión manual)
```

**⚠️ IMPORTANTE:** Estos comandos son guías. Siempre revisar manualmente después de reemplazos automáticos.

---

## 17. Checklist de Migración por Archivo

Para cada archivo migrado, verificar:

- [ ] Imports actualizados (`require('mssql')` → `require('pg')`)
- [ ] `poolPromise` → `pool`
- [ ] `.request()` → `pool.query()` o helper
- [ ] `.input()` → parámetros posicionales `$1, $2, $3...`
- [ ] `result.recordset` → `result.rows`
- [ ] `@parametro` → `$1, $2, $3...`
- [ ] `ISNULL()` → `COALESCE()`
- [ ] `GETDATE()` → `NOW()`
- [ ] `dbo.` → eliminado
- [ ] `TOP N` → `LIMIT N`
- [ ] `OUTPUT INSERTED` → `RETURNING`
- [ ] `WITH (UPDLOCK, HOLDLOCK)` → `FOR UPDATE`
- [ ] `OPTION (RECOMPILE)` → eliminado
- [ ] Transacciones migradas correctamente
- [ ] Manejo de errores actualizado
- [ ] Tests actualizados y pasando

---

**Documento generado:** 2025-01-27  
**Versión:** 1.0

