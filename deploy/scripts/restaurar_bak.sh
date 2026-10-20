#!/usr/bin/env bash
# Restaura un .bak de PSDATAFEB2024 en el contenedor pretty-mssql y lo verifica.
#
#   restaurar_bak.sh <archivo.bak> [conteo_origen.json] [--reemplazar]
#
# Pasos: copia el .bak al contenedor → RESTORE VERIFYONLY → RESTORE con MOVE (los archivos de Windows
# pasan a /var/opt/mssql/data) → DBCC CHECKDB → conteo por tabla, comparado con el del origen si se da
# → crea o re-asocia el login pretty_app (deploy/sql/crear_pretty_app.sql).
#
# Si la base ya existe hay que pasar --reemplazar (el corte reemplaza la copia de prueba por la final).
# Variables: PRETTY_ENV_COMPOSE (default /opt/pretty/env.compose) con MSSQL_SA_PASSWORD,
#            PRETTY_APP_PASSWORD (si no está, se toma DB_PASSWORD de PRETTY_ENV_API, default /opt/pretty/env.api),
#            CONTENEDOR (default pretty-mssql).
set -Eeuo pipefail
umask 077

BAK="${1:?uso: restaurar_bak.sh <archivo.bak> [conteo_origen.json] [--reemplazar]}"
ORIGEN=""; REEMPLAZAR=""
for a in "${@:2}"; do
  case "$a" in --reemplazar) REEMPLAZAR=1 ;; *) ORIGEN="$a" ;; esac
done
DB=PSDATAFEB2024
CONTENEDOR="${CONTENEDOR:-pretty-mssql}"
ENV_COMPOSE="${PRETTY_ENV_COMPOSE:-/opt/pretty/env.compose}"
ENV_API="${PRETTY_ENV_API:-/opt/pretty/env.api}"
DIR="$(cd "$(dirname "$0")/.." && pwd)"

leer() { grep -E "^$1=" "$2" | tail -1 | cut -d= -f2-; }
SA="$(leer MSSQL_SA_PASSWORD "$ENV_COMPOSE")"
APP="${PRETTY_APP_PASSWORD:-$(leer DB_PASSWORD "$ENV_API")}"
[ -n "$SA" ] || { echo "falta MSSQL_SA_PASSWORD en $ENV_COMPOSE"; exit 1; }
[ -n "$APP" ] || { echo "falta la clave de pretty_app (DB_PASSWORD en $ENV_API o PRETTY_APP_PASSWORD)"; exit 1; }

sq() { docker exec "$CONTENEDOR" /opt/mssql-tools18/bin/sqlcmd -C -S localhost -U sa -P "$SA" -b -W -h -1 "$@" </dev/null; }
log() { echo "$(date '+%F %T') $*"; }

NOMBRE="$(basename "$BAK")"
log "sha256 local: $(sha256sum "$BAK" 2>/dev/null | cut -c1-16 || shasum -a 256 "$BAK" | cut -c1-16)…"
docker exec "$CONTENEDOR" mkdir -p /var/opt/mssql/backup </dev/null
docker cp "$BAK" "$CONTENEDOR:/var/opt/mssql/backup/$NOMBRE"
RUTA="/var/opt/mssql/backup/$NOMBRE"
# docker cp deja el archivo de root (y el .bak viene en 600): SQL Server corre como mssql (10001)
docker exec -u 0 "$CONTENEDOR" chown 10001:0 "$RUTA" </dev/null

sq -Q "RESTORE VERIFYONLY FROM DISK = N'$RUTA' WITH CHECKSUM"

EXISTE="$(sq -Q "SET NOCOUNT ON; SELECT COUNT(*) FROM sys.databases WHERE name = '$DB'")"
if [ "${EXISTE//[[:space:]]/}" != "0" ] && [ -z "$REEMPLAZAR" ]; then
  echo "La base $DB ya existe. Para reemplazarla pasa --reemplazar."; exit 1
fi

# Archivos lógicos del respaldo -> rutas Linux
MOVES="$(sq -Q "SET NOCOUNT ON; DECLARE @f TABLE (LogicalName nvarchar(128), PhysicalName nvarchar(260), Type char(1), FileGroupName nvarchar(128), Size numeric(20,0), MaxSize numeric(20,0), FileId bigint, CreateLSN numeric(25,0), DropLSN numeric(25,0), UniqueId uniqueidentifier, ReadOnlyLSN numeric(25,0), ReadWriteLSN numeric(25,0), BackupSizeInBytes bigint, SourceBlockSize int, FileGroupId int, LogGroupGUID uniqueidentifier, DifferentialBaseLSN numeric(25,0), DifferentialBaseGUID uniqueidentifier, IsReadOnly bit, IsPresent bit, TDEThumbprint varbinary(32), SnapshotUrl nvarchar(360));
INSERT @f EXEC('RESTORE FILELISTONLY FROM DISK = N''$RUTA''');
SELECT STRING_AGG('MOVE N''' + LogicalName + ''' TO N''/var/opt/mssql/data/$DB' + CASE WHEN Type = 'L' THEN '_log.ldf' WHEN FileId = 1 THEN '.mdf' ELSE '_' + CAST(FileId AS varchar) + '.ndf' END + '''', ', ') FROM @f;")"
[ -n "$MOVES" ] || { echo "no se pudieron leer los archivos lógicos del respaldo"; exit 1; }

if [ "${EXISTE//[[:space:]]/}" != "0" ]; then
  sq -Q "ALTER DATABASE [$DB] SET SINGLE_USER WITH ROLLBACK IMMEDIATE" >/dev/null
fi
sq -Q "RESTORE DATABASE [$DB] FROM DISK = N'$RUTA' WITH $MOVES, REPLACE, CHECKSUM, RECOVERY, STATS = 25"
sq -Q "ALTER DATABASE [$DB] SET MULTI_USER" >/dev/null
log "RESTORE ok"

sq -Q "DBCC CHECKDB ([$DB]) WITH NO_INFOMSGS, ALL_ERRORMSGS" && log "CHECKDB limpio"

CONTEO="$(sq -d "$DB" -s '|' -Q "SET NOCOUNT ON; SELECT t.name, SUM(p.rows) FROM sys.tables t JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0,1) GROUP BY t.name ORDER BY t.name")"
SALIDA="$(dirname "$BAK")/conteo_restaurado_${NOMBRE%.bak}.txt"
echo "$CONTEO" > "$SALIDA"
log "conteo: $(echo "$CONTEO" | wc -l | tr -d ' ') tablas, $(echo "$CONTEO" | awk -F'|' '{s+=$2} END {print s}') filas → $SALIDA"

if [ -n "$ORIGEN" ]; then
  python3 - "$ORIGEN" "$SALIDA" <<'PY'
import json, sys
origen = {r['name']: int(r['filas']) for r in json.load(open(sys.argv[1]))}
rest = dict((l.split('|')[0], int(l.split('|')[1])) for l in open(sys.argv[2]) if '|' in l)
dif = [f"{t}: origen {origen.get(t)} · restaurada {rest.get(t)}" for t in sorted(set(origen) | set(rest)) if origen.get(t) != rest.get(t)]
print("conteos IGUALES al origen" if not dif else "DIFERENCIAS:\n  " + "\n  ".join(dif))
sys.exit(1 if dif else 0)
PY
fi

docker cp "$DIR/sql/crear_pretty_app.sql" "$CONTENEDOR:/tmp/crear_pretty_app.sql"
sq -v PRETTY_APP_PASSWORD="$APP" -i /tmp/crear_pretty_app.sql
docker exec -u 0 "$CONTENEDOR" rm -f /tmp/crear_pretty_app.sql "$RUTA" </dev/null
log "listo"
