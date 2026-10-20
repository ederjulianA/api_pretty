#!/usr/bin/env python3
"""Genera env.compose y env.api para el VPS a partir del .env del servidor viejo.

  python3 deploy/scripts/preparar_env.py <.env viejo> <carpeta destino>

- Claves NUEVAS para sa y pretty_app (la API deja de entrar como sa).
- Tareas de WooCommerce apagadas; CORS solo al front de Vercel.
- Copia el resto de secretos tal cual (JWT, Woo, Cloudinary, OpenAI, Azure, Cloudflare): se rotan en la fase 2.
  La llave de Woo se reemplaza el día del corte (ver deploy/README.md).
- Archivos en 600. No imprime ningún secreto.
"""
import os
import secrets
import string
import sys

if len(sys.argv) != 3:
    sys.exit(__doc__)
origen, destino = sys.argv[1], sys.argv[2]


def clave(n=32):
    # Cumple la política de SQL Server (mayúscula, minúscula, dígito) y no trae caracteres que haya que escapar
    abc = string.ascii_letters + string.digits
    while True:
        c = ''.join(secrets.choice(abc) for _ in range(n))
        if any(x.isupper() for x in c) and any(x.islower() for x in c) and any(x.isdigit() for x in c):
            return c


viejo = {}
for linea in open(origen, encoding='utf-8'):
    linea = linea.strip()
    if '=' in linea and not linea.startswith('#'):
        k, v = linea.split('=', 1)
        viejo[k.strip()] = v.strip()

COPIAR = ['JWT_SECRET', 'JWT_EXPIRES_IN', 'WC_URL', 'WC_CONSUMER_KEY', 'WC_CONSUMER_SECRET',
          'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET',
          'OPENAI_API_KEY', 'OPENAI_MODEL', 'OPENAI_TEMPERATURE', 'OPENAI_MAX_TOKENS',
          'AZURE_STORAGE_CONNECTION_STRING', 'AZURE_STORAGE_CONTAINER_NAME', 'AZURE_CATALOG_BLOB_NAME',
          'AZURE_CATALOG_PUBLIC_URL', 'CLOUDFLARE_ZONE_ID', 'CLOUDFLARE_API_TOKEN']
faltan = [k for k in ('JWT_SECRET', 'WC_URL') if not viejo.get(k)]
if faltan:
    sys.exit(f'faltan en {origen}: {", ".join(faltan)}')

api = {
    'DB_USER': 'pretty_app', 'DB_PASSWORD': clave(), 'DB_DATABASE': viejo.get('DB_DATABASE', 'PSDATAFEB2024'),
    'NODE_ENV': 'production', 'CORS_ORIGINS': 'https://pretty-front.vercel.app',
    'WOO_PUSH_ENABLED': 'false', 'WOO_IMPORT_ENABLED': 'false',
    'WOO_RECONCILIACION_ENABLED': 'false', 'WOO_VENCIMIENTO_ENABLED': 'false',
}
api.update({k: viejo[k] for k in COPIAR if k in viejo})
compose = {'MSSQL_SA_PASSWORD': clave(), 'TUNNEL_TOKEN': '', 'PRETTY_API_ENV': '/opt/pretty/env.api'}

os.makedirs(destino, mode=0o700, exist_ok=True)
for nombre, datos in (('env.api', api), ('env.compose', compose)):
    ruta = os.path.join(destino, nombre)
    fd = os.open(ruta, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w') as f:
        f.write(''.join(f'{k}={v}\n' for k, v in datos.items()))
    os.chmod(ruta, 0o600)
    print(f'{ruta}: {len(datos)} variables')
print('Falta poner TUNNEL_TOKEN en env.compose (lo da Cloudflare al crear el túnel).')
