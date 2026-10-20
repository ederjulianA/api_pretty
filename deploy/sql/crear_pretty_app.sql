-- Login de la API con permisos mínimos (en vez de sa).
--   sqlcmd ... -v PRETTY_APP_PASSWORD="..." -i crear_pretty_app.sql
-- Idempotente: se corre de nuevo después de cada restauración (RESTORE trae el usuario de la base
-- sin su login, y así queda re-asociado).
--
-- Permisos: lectura y escritura de datos + EXECUTE (6 procedimientos y 2 funciones de dbo).
-- Revisado el 20-10-2026: la API no hace DDL, ni TRUNCATE, ni IDENTITY_INSERT, ni bulk insert, y
-- los procedimientos no usan SQL dinámico, así que el encadenamiento de propiedad de dbo alcanza.
SET NOCOUNT ON;
USE master;
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = 'pretty_app')
  CREATE LOGIN pretty_app WITH PASSWORD = '$(PRETTY_APP_PASSWORD)', CHECK_POLICY = ON, DEFAULT_DATABASE = PSDATAFEB2024;
ELSE
  ALTER LOGIN pretty_app WITH PASSWORD = '$(PRETTY_APP_PASSWORD)';
GO
USE PSDATAFEB2024;
IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'pretty_app')
  ALTER USER pretty_app WITH LOGIN = pretty_app;
ELSE
  CREATE USER pretty_app FOR LOGIN pretty_app;
ALTER ROLE db_datareader ADD MEMBER pretty_app;
ALTER ROLE db_datawriter ADD MEMBER pretty_app;
GRANT EXECUTE ON SCHEMA::dbo TO pretty_app;
GO
SELECT 'pretty_app listo' AS resultado,
       IS_ROLEMEMBER('db_datareader', 'pretty_app') AS lector,
       IS_ROLEMEMBER('db_datawriter', 'pretty_app') AS escritor;
GO
