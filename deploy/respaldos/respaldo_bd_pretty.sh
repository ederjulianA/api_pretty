#!/usr/bin/env bash
# Respaldo diario de la base de Pretty (SQL Server Express en Docker, VPS de AkaSuite).
# Adaptado de akasuite_front/deploy/respaldos/respaldo_bd.sh: mismo modelo, motor distinto.
#
#   respaldo_bd_pretty.sh <archivo.env> [--forzar-semanal]
#
# Pasos: BACKUP ... WITH CHECKSUM dentro del contenedor → RESTORE VERIFYONLY → copia al host → cifrado GPG con la
# llave PÚBLICA (la privada no vive en el VPS) → subida a Azure Blob con una SAS que solo crea/escribe → el día 1
# también a mensual/ → los domingos (o con --forzar-semanal): restauración de prueba en una base temporal
# comparando conteos con la viva. Cualquier falla manda un correo.
#
# Express no tiene SQL Agent ni compresión de respaldos: la programación va en el crontab del host y GPG comprime.
#
# Variables del .env (600, fuera del repo; ver README.md):
#   CONTENEDOR, BASE, ENV_COMPOSE (archivo con MSSQL_SA_PASSWORD), DIR_LOCAL, RETENCION_LOCAL_DIAS, MIN_FILAS,
#   GPG_DESTINATARIO, AZURE_CUENTA, AZURE_CONTENEDOR, AZURE_SAS, AVISO_PARA, SMTP_ENV (archivo con SPRING_MAIL_*)
set -Eeuo pipefail
umask 077

ENV_FILE="${1:?uso: respaldo_bd_pretty.sh <archivo.env> [--forzar-semanal]}"
FORZAR_SEMANAL="${2:-}"
# shellcheck disable=SC1090
source "$ENV_FILE"

AMBIENTE=pretty
TS="$(date +%Y%m%d-%H%M)"
DIA_MES="$(date +%d)"; DIA_SEMANA="$(date +%u)"   # 7 = domingo
NOMBRE="pretty-${TS}.bak"
DENTRO="/var/opt/mssql/backup/$NOMBRE"
LOG="${DIR_LOCAL}/respaldo.log"
mkdir -p "$DIR_LOCAL"
exec > >(tee -a "$LOG") 2>&1
PASO="inicio"

log() { echo "$(date '+%F %T') [$AMBIENTE] $*"; }
SA="$(grep -E '^MSSQL_SA_PASSWORD=' "$ENV_COMPOSE" | tail -1 | cut -d= -f2-)"
sq() { docker exec "$CONTENEDOR" /opt/mssql-tools18/bin/sqlcmd -C -S localhost -U sa -P "$SA" -b -W -h -1 "$@" </dev/null; }
CONTEO_SQL="SET NOCOUNT ON; SELECT CAST(COUNT(DISTINCT t.object_id) AS varchar) + ' tablas, ' + CAST(SUM(p.rows) AS varchar) + ' filas' FROM sys.tables t JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0,1)"

avisar_falla() {
  local motivo="$1"
  log "FALLA en el paso '$PASO': $motivo"
  [ -n "${AVISO_PARA:-}" ] && [ -f "${SMTP_ENV:-}" ] || { log "sin aviso por correo (AVISO_PARA/SMTP_ENV)"; return 0; }
  local host port user pass
  host=$(grep -E '^SPRING_MAIL_HOST=' "$SMTP_ENV" | cut -d= -f2- | tr -d '"')
  port=$(grep -E '^SPRING_MAIL_PORT=' "$SMTP_ENV" | cut -d= -f2- | tr -d '"')
  user=$(grep -E '^SPRING_MAIL_USERNAME=' "$SMTP_ENV" | cut -d= -f2- | tr -d '"')
  pass=$(grep -E '^SPRING_MAIL_PASSWORD=' "$SMTP_ENV" | cut -d= -f2- | tr -d '"')
  local remitente="${AVISO_DE:-$(grep -E '^APP_EMAIL_FROM=' "$SMTP_ENV" | cut -d= -f2- | tr -d '"')}"
  printf 'From: Respaldos Pretty <%s>\r\nTo: %s\r\nSubject: [Pretty] FALLO el respaldo de la base %s\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\nPaso: %s\r\nMotivo: %s\r\nServidor: %s\r\nRevisar: %s\r\n' \
    "$remitente" "$AVISO_PARA" "$TS" "$PASO" "$motivo" "$(hostname)" "$LOG" > "$DIR_LOCAL/.aviso.eml"
  curl -s --ssl-reqd --url "smtp://${host}:${port}" --user "${user}:${pass}" \
    --mail-from "$remitente" --mail-rcpt "$AVISO_PARA" --upload-file "$DIR_LOCAL/.aviso.eml" \
    && log "aviso enviado a $AVISO_PARA" || log "no se pudo enviar el aviso"
  rm -f "$DIR_LOCAL/.aviso.eml"
}
trap 'avisar_falla "comando con error (línea $LINENO)"; exit 1' ERR
# Pase lo que pase, no dejar el .bak ni la base de prueba dentro del contenedor
BD_PRUEBA=""
limpiar() {
  docker exec -u 0 "$CONTENEDOR" rm -f "$DENTRO" </dev/null >/dev/null 2>&1 || true
  [ -z "$BD_PRUEBA" ] || sq -Q "IF DB_ID('$BD_PRUEBA') IS NOT NULL DROP DATABASE [$BD_PRUEBA]" >/dev/null 2>&1 || true
}
trap limpiar EXIT

subir_azure() {   # $1 archivo local, $2 ruta del blob
  local codigo
  codigo=$(curl -s -o /dev/null -w '%{http_code}' -X PUT -H "x-ms-blob-type: BlockBlob" \
    -H "Content-Type: application/octet-stream" --data-binary @"$1" \
    "https://${AZURE_CUENTA}.blob.core.windows.net/${AZURE_CONTENEDOR}/$2?${AZURE_SAS}")
  [ "$codigo" = "201" ] || { avisar_falla "Azure respondió $codigo al subir $2"; exit 1; }
  log "subido a Azure: $2"
}

log "=== respaldo $NOMBRE ==="

PASO="backup"
docker exec -u 0 "$CONTENEDOR" sh -c "mkdir -p /var/opt/mssql/backup && chown 10001:0 /var/opt/mssql/backup" </dev/null
sq -Q "BACKUP DATABASE [$BASE] TO DISK = N'$DENTRO' WITH CHECKSUM, INIT, FORMAT, NAME = N'$BASE $TS'" >/dev/null
PASO="verificacion"
sq -Q "RESTORE VERIFYONLY FROM DISK = N'$DENTRO' WITH CHECKSUM" >/dev/null
VIVA="$(sq -d "$BASE" -Q "$CONTEO_SQL" | tr -d '\r')"
FILAS="$(echo "$VIVA" | sed -E 's/.* ([0-9]+) filas/\1/')"
[ "${FILAS:-0}" -ge "${MIN_FILAS:-100000}" ] || { avisar_falla "la base viva solo tiene $VIVA (mínimo ${MIN_FILAS:-100000} filas)"; exit 1; }
docker cp "$CONTENEDOR:$DENTRO" "$DIR_LOCAL/$NOMBRE"
docker exec -u 0 "$CONTENEDOR" rm -f "$DENTRO" </dev/null
chmod 600 "$DIR_LOCAL/$NOMBRE"
SHA=$(sha256sum "$DIR_LOCAL/$NOMBRE" | cut -d' ' -f1)
log "backup ok: $(du -h "$DIR_LOCAL/$NOMBRE" | cut -f1), base viva [$VIVA], sha256 ${SHA:0:16}…"

PASO="cifrado"
gpg --batch --yes --quiet --trust-model always -r "$GPG_DESTINATARIO" -o "$DIR_LOCAL/$NOMBRE.gpg" -e "$DIR_LOCAL/$NOMBRE"
echo "$SHA  $NOMBRE" > "$DIR_LOCAL/$NOMBRE.sha256"

PASO="azure"
subir_azure "$DIR_LOCAL/$NOMBRE.gpg" "diario/$NOMBRE.gpg"
subir_azure "$DIR_LOCAL/$NOMBRE.sha256" "diario/$NOMBRE.sha256"
if [ "$DIA_MES" = "01" ]; then
  subir_azure "$DIR_LOCAL/$NOMBRE.gpg" "mensual/$NOMBRE.gpg"
  subir_azure "$DIR_LOCAL/$NOMBRE.sha256" "mensual/$NOMBRE.sha256"
fi

if [ "$DIA_SEMANA" = "7" ] || [ "$FORZAR_SEMANAL" = "--forzar-semanal" ]; then
  PASO="restauracion-de-prueba"
  BD_PRUEBA="respaldo_prueba_${TS//-/_}"
  docker cp "$DIR_LOCAL/$NOMBRE" "$CONTENEDOR:$DENTRO"
  docker exec -u 0 "$CONTENEDOR" chown 10001:0 "$DENTRO" </dev/null
  MOVES="$(sq -Q "SET NOCOUNT ON; SELECT STRING_AGG('MOVE N''' + name + ''' TO N''/var/opt/mssql/data/${BD_PRUEBA}_' + CAST(file_id AS varchar) + '''', ', ') FROM [$BASE].sys.database_files" | tr -d '\r')"
  sq -Q "RESTORE DATABASE [$BD_PRUEBA] FROM DISK = N'$DENTRO' WITH $MOVES, CHECKSUM, RECOVERY" >/dev/null
  sq -Q "DBCC CHECKDB ([$BD_PRUEBA]) WITH NO_INFOMSGS" >/dev/null
  REST="$(sq -d "$BD_PRUEBA" -Q "$CONTEO_SQL" | tr -d '\r')"
  sq -Q "DROP DATABASE [$BD_PRUEBA]" >/dev/null
  docker exec -u 0 "$CONTENEDOR" rm -f "$DENTRO" </dev/null
  log "restauración de prueba (CHECKDB limpio): base viva [$VIVA] · restaurada [$REST]"
  [ -n "$REST" ] || { avisar_falla "la restauración de prueba no devolvió conteos"; exit 1; }
fi

PASO="limpieza-local"
find "$DIR_LOCAL" -maxdepth 1 -name "pretty-*.bak*" -mtime +"${RETENCION_LOCAL_DIAS:-3}" -delete
printf '{"ambiente":"%s","ultimo":"%s","archivo":"%s","base":"%s","sha256":"%s"}\n' "$AMBIENTE" "$(date -Is)" "$NOMBRE" "$VIVA" "$SHA" > "$DIR_LOCAL/ultimo.json"
log "=== ok ==="
