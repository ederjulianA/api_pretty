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
    encrypt: false, // Si tu servidor requiere conexión cifrada
    trustServerCertificate: false, // En desarrollo, puede ser útil
    requestTimeout: 300000, // 5 minutos para consultas largas
    connectionTimeout: 60000, // 1 minuto para conexión
    cancelTimeout: 5000 // 5 segundos para cancelar operaciones
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
    acquireTimeoutMillis: 60000 // 1 minuto para adquirir conexión
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
