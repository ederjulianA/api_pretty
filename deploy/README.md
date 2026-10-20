# Pretty en el VPS de AkaSuite — runbook de la fase 1

> Plan y decisiones: `implementaciones_2026/migracion_servidor_linux/PLAN.md`.
> **Cada paso en el VPS va con el OK de Eder y fuera del horario de Hawars (trabaja hasta mediodía).**
> Nunca tocar `/opt/akasuite*` ni sus contenedores. Pretty no publica puertos: sale solo por el túnel.

```
Laura / Eder ─► pretty-front (Vercel) ── rewrite /api/* ─► https://api-pos.prettymakeupcol.com
                                                             │ Cloudflare Tunnel (conexión de salida)
VPS ─ compose «pretty» (red propia, sin puertos) ────────────┘
      ├─ pretty-tunel   cloudflared                     128 MB
      ├─ pretty-api     Node 24, usuario node, pretty_app  768 MB
      └─ pretty-mssql   SQL Server 2022 Express, TZ Bogotá  2 GB
```

## Archivos

| Archivo | Para qué |
|---|---|
| `Dockerfile`, `docker-compose.yml` | La imagen de la API y los tres servicios |
| `docker-compose.local.yml` | Solo Mac: publica la API en `127.0.0.1:3010` y la base en `127.0.0.1:14334` |
| `env.example` | Qué va en `/opt/pretty/env.compose` y `/opt/pretty/env.api` (600, fuera del repo) |
| `scripts/preparar_env.py` | Genera los dos env desde el `.env` viejo, con claves nuevas para `sa` y `pretty_app` |
| `scripts/restaurar_bak.sh` | Restaura un `.bak`: VERIFYONLY, RESTORE, CHECKDB, conteos contra el origen, `pretty_app` |
| `sql/crear_pretty_app.sql` | Login de la API: lectura, escritura y EXECUTE. Nada de `sa` |
| `respaldos/respaldo_bd_pretty.sh` | Respaldo diario cifrado a Azure, con restauración de prueba los domingos |

## 0. Antes del día del VPS (Eder, desde la Mac o el panel)

1. **Túnel de Cloudflare** (Zero Trust → Networks → Tunnels → *Create a tunnel* → Cloudflared):
   - nombre `pretty-vps`; copiar el **token** del comando de instalación (lo que va después de `--token`);
   - *Public hostname*: `api-pos.prettymakeupcol.com` → servicio `HTTP` → `pretty-api:3000`.
   - Revisar si la zona tiene *Bot Fight Mode* (Security → Bots): las peticiones llegan desde los servidores de
     Vercel y Cloudflare las podría desafiar. En el plan gratuito no se puede eximir un subdominio con una regla
     (solo con Super Bot Fight Mode, de pago): probar primero con el preview de Vercel y decidir con el resultado.
2. **Respaldos — ✅ listo (20-10-2026):** cuenta `prettycol`, contenedor privado `respaldos-pretty` con
   inmutabilidad de 30 días y ciclo de vida (`diario/` 31 días, `mensual/` a Cool a los 30 y borrado a los 365).
   SAS `sp=cw`, solo HTTPS y solo el contenedor, **vence el 2027-10-20**: está en `~/pretty_vps/azure_sas.txt`
   (600) con `AZURE_CUENTA`, `AZURE_CONTENEDOR` y `AZURE_SAS` listos para `respaldo.env`. La llave GPG es la de
   AkaSuite (`respaldos@akasuite.com`, la pública ya está en el VPS).
   - Por la inmutabilidad, un respaldo de prueba no se puede borrar durante 30 días.
   - Rotar la llave de `prettycol` con la que se firmó revoca la SAS: hacerlo solo junto con una SAS nueva.
3. **Env files:** `python3 deploy/scripts/preparar_env.py .env ~/pretty_vps` y pegar el `TUNNEL_TOKEN` en
   `~/pretty_vps/env.compose`.

**Estado (20-10-2026):** túnel `pretty-vps` creado, con la ruta `api-pos.prettymakeupcol.com` →
`http://pretty-api:3000`. Probado desde la Mac: HTTPS 200, rutas sin token 401, y Vercel llega por el túnel (Bot
Fight Mode no estorba). Los dos env están en `~/pretty_vps/` con el token. **Pendiente: rotar el token** (botón
*Rotar token* en la página del túnel) antes de montar, porque quedó escrito fuera de `env.compose`. Para guardar el
nuevo sin que se vea, copiarlo con el ícono del comando y correr:
```bash
T=$(pbpaste | grep -oE 'eyJ[A-Za-z0-9+/=_-]+' | head -1); [ -n "$T" ] && sed -i '' "s|^TUNNEL_TOKEN=.*|TUNNEL_TOKEN=$T|" ~/pretty_vps/env.compose && echo "token guardado (${#T} caracteres)"; unset T; pbcopy </dev/null
```

## 1. Montar en el VPS (con el OK de Eder)

```bash
# 1.1 Carpeta (sudo: lo corre Eder en el VPS)
sudo mkdir -p /opt/pretty && sudo chown akasuite:akasuite /opt/pretty && chmod 750 /opt/pretty

# 1.2 Código y env (desde la Mac, en api_pretty; <rama> = main el día del corte)
ssh akasuite-vps 'mkdir -p /opt/pretty/source /opt/pretty/respaldos/bin /opt/pretty/respaldos/archivos'
git archive <rama> | ssh akasuite-vps 'tar -x -C /opt/pretty/source'
scp ~/pretty_vps/env.api ~/pretty_vps/env.compose akasuite-vps:/opt/pretty/
ssh akasuite-vps 'chmod 600 /opt/pretty/env.*'

# 1.3 Base: arrancar SQL y restaurar la copia más reciente
scp ~/pretty_respaldo/<copia>.bak ~/pretty_respaldo/conteo_origen_<etiqueta>.json akasuite-vps:/opt/pretty/respaldos/archivos/
ssh akasuite-vps 'bash -s' <<'EOF'
set -euo pipefail
cd /opt/pretty/source
docker compose -f deploy/docker-compose.yml --env-file /opt/pretty/env.compose up -d pretty-mssql
until [ "$(docker inspect pretty-mssql --format '{{.State.Health.Status}}')" = healthy ]; do sleep 5; done
deploy/scripts/restaurar_bak.sh /opt/pretty/respaldos/archivos/<copia>.bak /opt/pretty/respaldos/archivos/conteo_origen_<etiqueta>.json
EOF

# 1.4 API y túnel
ssh akasuite-vps 'bash -s' <<'EOF'
set -euo pipefail
cd /opt/pretty/source
docker compose -f deploy/docker-compose.yml --env-file /opt/pretty/env.compose --profile tunel up -d --build
sleep 20; docker compose -f deploy/docker-compose.yml --env-file /opt/pretty/env.compose ps
docker logs pretty-api 2>&1 | grep -E "Entorno|escuchando|SQL Server" </dev/null
docker stats --no-stream --format '{{.Name}} {{.MemUsage}}' </dev/null
EOF

# 1.5 Por el subdominio, todavía sin tráfico de Laura
curl -s https://api-pos.prettymakeupcol.com/                                  # API Working
curl -s -o /dev/null -w '%{http_code}\n' https://api-pos.prettymakeupcol.com/api/categorias   # 401
```

**Respaldo diario** (mismo modelo que AkaSuite, ver `akasuite_front/deploy/respaldos/README.md`):
- copiar `respaldos/respaldo_bd_pretty.sh` a `/opt/pretty/respaldos/bin/` y crear `/opt/pretty/respaldos/respaldo.env` (600):
  ```
  CONTENEDOR=pretty-mssql
  BASE=PSDATAFEB2024
  ENV_COMPOSE=/opt/pretty/env.compose
  DIR_LOCAL=/opt/pretty/respaldos/archivos
  RETENCION_LOCAL_DIAS=3
  MIN_FILAS=100000
  GPG_DESTINATARIO=respaldos@akasuite.com
  # estas tres líneas salen tal cual de ~/pretty_vps/azure_sas.txt
  AZURE_CUENTA=prettycol
  AZURE_CONTENEDOR=respaldos-pretty
  AZURE_SAS='<sp=cw, vence 2027-10-20>'
  AVISO_PARA=ederalvarez2091057@gmail.com
  SMTP_ENV=/opt/akasuite/backend/env.prod
  ```
- primera corrida a mano con `--forzar-semanal` y revisar `respaldo.log`;
- `crontab -e` del usuario `akasuite`, entre los dos de AkaSuite (2:00 prod y 2:30 QA):
  `15 2 * * * /opt/pretty/respaldos/bin/respaldo_bd_pretty.sh /opt/pretty/respaldos/respaldo.env >/dev/null 2>&1`

## 2. Corte (minutos, a una hora sin ventas web)

1. Avisar a Laura que no registre nada durante el corte.
2. **Copia final**, desde la Mac: `node implementaciones_2026/migracion_servidor_linux/copia_bak_remota.js ~/pretty_respaldo corte`
   y restaurarla en el VPS con `restaurar_bak.sh … --reemplazar`. Los conteos tienen que dar iguales.
3. **WooCommerce:** crear una llave nueva (lectura/escritura) para el VPS, ponerla en `/opt/pretty/env.api`
   (`WC_CONSUMER_KEY`, `WC_CONSUMER_SECRET`) y **revocar la vieja**: la API vieja sigue viva en Windows y sin esto
   seguiría empujando stock a la tienda desde la base vieja. `docker compose … up -d pretty-api` para que la tome.
4. **Front:** mergear a `main` de `pretty_front` la rama `migracion/vercel-api-vps` (cambia el `rewrite` `/api` a
   `https://api-pos.prettymakeupcol.com` y quita `/apigenexus`). Vercel despliega solo.
5. Eder y Laura prueban: login, POS (cotización, pedido, factura), pedidos, anular, inventario.
6. Encender las tareas de Woo **una por una**, con OK de Eder, cambiando `/opt/pretty/env.api` y recreando
   `pretty-api`: importador en `simulacion` y luego `real`; después push de stock, reconciliación y vencimiento.

**Volver atrás:** mientras no se registren ventas en la base nueva, basta con revertir el merge del front y volver a
la llave vieja de Woo. Después, volver atrás pierde lo registrado: se decide en el momento.

## 3. Operación

```bash
cd /opt/pretty/source && C="docker compose -f deploy/docker-compose.yml --env-file /opt/pretty/env.compose"
$C ps                       # estado
docker logs --tail 100 pretty-api
# actualizar el código: git archive <rama> desde la Mac a /opt/pretty/source y luego
$C up -d --build pretty-api
```

## 4. Montado en el VPS (20-10-2026, 16:10-16:15)

`main` `08bd776` en `/opt/pretty/source`; copia del 20-10 restaurada (CHECKDB limpio, conteos iguales al origen);
los tres contenedores sanos (~770 MB en total) y ningún puerto nuevo en el host; `api-pos.prettymakeupcol.com`
responde 200 en la raíz, 401 sin token y 200 con token (0,3-0,5 s). Primer respaldo subido a Azure
(`diario/pretty-20261020-1613.bak.gpg`) con restauración de prueba ok, y cron a las 2:15. AkaSuite prod y QA sin
cambios. **Falta el corte (§2).**

## 5. Probado en la Mac (20-10-2026)

- Restauración de la copia del 20-10 con `restaurar_bak.sh`: CHECKDB limpio, 64 tablas y 164.550 filas iguales al
  origen, `pretty_app` creado. SQL Server 2022 CU27, hora de Colombia en SQL y en Node.
- API en contenedor con `pretty_app`: sana, ~80 MB (SQL ~1 GB). 48 pantallas recorridas como Laura y como Eder
  sin ninguna llamada sin token ni rechazada; flujo de escritura completo (cliente, cotización, edición, anulación,
  kardex) y el mismo flujo sin token da 401. Sin un solo «permission denied» de `pretty_app`.
- Respaldo: 93 MB → 13 MB cifrado; descifrado = original (sha256); restauración de prueba con CHECKDB y conteos
  iguales; falla controlada con limpieza del `.bak` y de la base temporal.
