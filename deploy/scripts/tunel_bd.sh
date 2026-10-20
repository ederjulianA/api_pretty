#!/usr/bin/env bash
# Túnel SSH desde la Mac a la base de producción de Pretty (contenedor pretty-mssql en el VPS de AkaSuite).
#
#   deploy/scripts/tunel_bd.sh abrir | cerrar | estado
#
# El contenedor no publica puertos (regla del VPS): el túnel va de 127.0.0.1:14335 en la Mac a la IP interna
# del contenedor en la red docker «pretty». La IP se resuelve en cada apertura porque cambia si se recrea.
# Luego se consulta con .env.vps (fuera de git), p. ej.:
#   DOTENV_CONFIG_PATH=.env.vps node -r dotenv/config scripts/db-query.js "SELECT TOP 5 * FROM dbo.articulos"
set -euo pipefail

PUERTO_LOCAL="${PUERTO_LOCAL:-14335}"
HOST_SSH="${HOST_SSH:-akasuite-vps}"
FIRMA="127.0.0.1:${PUERTO_LOCAL}:"

pid_tunel() { pgrep -f "ssh .*-L ${FIRMA}" || true; }

case "${1:-estado}" in
  abrir)
    if [ -n "$(pid_tunel)" ]; then echo "El túnel ya está abierto en 127.0.0.1:${PUERTO_LOCAL}"; exit 0; fi
    IP="$(ssh -o BatchMode=yes -o ControlPath=none "$HOST_SSH" \
      "docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' pretty-mssql" </dev/null)"
    [ -n "$IP" ] || { echo "No se pudo resolver la IP de pretty-mssql (¿está corriendo?)"; exit 1; }
    ssh -f -N -o BatchMode=yes -o ControlPath=none -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 \
      -L "${FIRMA}${IP}:1433" "$HOST_SSH"
    echo "Túnel abierto: 127.0.0.1:${PUERTO_LOCAL} → pretty-mssql (${IP}:1433). Ciérralo al terminar: $0 cerrar"
    ;;
  cerrar)
    P="$(pid_tunel)"
    if [ -z "$P" ]; then echo "No hay túnel abierto"; else kill $P && echo "Túnel cerrado"; fi
    ;;
  estado)
    if [ -n "$(pid_tunel)" ]; then echo "Abierto en 127.0.0.1:${PUERTO_LOCAL}"; else echo "Cerrado"; fi
    ;;
  *) echo "uso: $0 abrir | cerrar | estado"; exit 2 ;;
esac
