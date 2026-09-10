#!/usr/bin/env python3
"""
Analiza los datos de la auditoria de auth (SEC-00) y emite un veredicto por endpoint.

Cruza tres fuentes:
  1. index.js          -> prefijo de montaje de cada router
  2. routes/*.js       -> rutas declaradas y si llevan verifyToken/auth
  3. logs/auth-audit-resumen.json -> trafico real observado

Y responde la pregunta que bloqueaba el plan: de los endpoints sin auth,
cuales se pueden proteger sin romper nada.

Uso:  python3 analizar-auditoria.py [--dias N]
"""
import json, os, re, sys, argparse
from datetime import datetime, timezone

RAIZ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
RESUMEN = os.path.join(RAIZ, 'logs', 'auth-audit-resumen.json')


def montajes():
    """variable_router -> [prefijos]  (un router puede montarse varias veces)"""
    src = open(os.path.join(RAIZ, 'index.js'), encoding='utf-8').read()
    var2file = {}
    for m in re.finditer(r"import\s+(\w+)\s+from\s+['\"]\./routes/([\w.]+)['\"]", src):
        var2file[m.group(1)] = m.group(2)
    for m in re.finditer(r"const\s+(\w+)\s*=\s*require\(['\"]\./routes/([\w.]+)['\"]\)", src):
        var2file[m.group(1)] = m.group(2)

    out = {}
    for m in re.finditer(r"app\.use\(\s*['\"]([^'\"]+)['\"]\s*,\s*(\w+)\s*\)", src):
        prefijo, var = m.group(1), m.group(2)
        archivo = var2file.get(var)
        if archivo:
            out.setdefault(archivo, []).append(prefijo)
    return out


def endpoints():
    """[(metodo, ruta_completa, protegido, archivo, linea)]"""
    mnt = montajes()
    res = []
    rdir = os.path.join(RAIZ, 'routes')
    for archivo in sorted(os.listdir(rdir)):
        if not archivo.endswith('.js'):
            continue
        prefijos = mnt.get(archivo, [])
        if not prefijos:
            continue
        for i, linea in enumerate(open(os.path.join(rdir, archivo), encoding='utf-8'), 1):
            m = re.search(r"router\.(get|post|put|delete|patch)\(\s*['\"]([^'\"]*)['\"]\s*,?\s*(.*)$",
                          linea.strip(), re.I)
            if not m:
                continue
            metodo, ruta, resto = m.group(1).upper(), m.group(2), m.group(3)
            protegido = bool(re.search(r"\b(verifyToken|auth)\b", resto))
            for p in prefijos:
                completa = (p.rstrip('/') + ruta) if ruta != '/' else p
                res.append((metodo, completa or '/', protegido, archivo, i))
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dias', type=int, default=7,
                    help='dias minimos de observacion para confiar en un veredicto de huerfano')
    args = ap.parse_args()

    if not os.path.exists(RESUMEN):
        sys.exit(f"No existe {RESUMEN}\nEl middleware de SEC-00 aun no ha corrido o no ha volcado el resumen.")

    d = json.load(open(RESUMEN, encoding='utf-8'))
    obs = {e['endpoint']: e for e in d['endpoints']}

    desde = datetime.fromisoformat(d['desde'].replace('Z', '+00:00'))
    dias = (datetime.now(timezone.utc) - desde).total_seconds() / 86400

    print(f"\n  AUDITORIA DE AUTH — {dias:.1f} dias de observacion (desde {d['desde'][:10]})")
    if dias < args.dias:
        print(f"  AVISO: menos de {args.dias} dias. Un veredicto HUERFANO todavia no es confiable:")
        print(f"         un consumidor semanal o mensual aun no habria aparecido.\n")
    else:
        print()

    grupos = {'CORREGIR FRONT PRIMERO': [], 'SEGURO PROTEGER': [], 'HUERFANO': []}

    for metodo, ruta, protegido, archivo, linea in endpoints():
        if protegido:
            continue
        if ruta == '/api/auth/login':
            continue  # debe ser publico
        o = obs.get(f"{metodo} {ruta}")
        ref = f"{archivo}:{linea}"
        if not o or o['total'] == 0:
            grupos['HUERFANO'].append((f"{metodo} {ruta}", ref, ''))
        elif o['sin_token'] > 0 or o['token_invalido'] > 0:
            det = f"sin_token={o['sin_token']} invalido={o['token_invalido']} valido={o['token_valido']}"
            ips = ', '.join(o['ips_sin_token'][:3])
            grupos['CORREGIR FRONT PRIMERO'].append((f"{metodo} {ruta}", ref, f"{det}  ips: {ips}"))
        else:
            grupos['SEGURO PROTEGER'].append(
                (f"{metodo} {ruta}", ref, f"valido={o['token_valido']} usuarios={','.join(o['usuarios'][:3])}"))

    leyenda = {
        'SEGURO PROTEGER': 'todo su trafico llega con token valido -> agregar verifyToken no rompe nada',
        'CORREGIR FRONT PRIMERO': 'recibe trafico SIN token -> protegerlo ahora devolveria 401 a usuarios reales',
        'HUERFANO': 'cero trafico observado -> proteger es seguro si el periodo fue suficiente',
    }
    for g in ['CORREGIR FRONT PRIMERO', 'SEGURO PROTEGER', 'HUERFANO']:
        items = grupos[g]
        print(f"  --- {g}  ({len(items)}) " + '-' * max(0, 46 - len(g)))
        print(f"      {leyenda[g]}\n")
        for ruta, ref, det in sorted(items):
            print(f"      {ruta:<46} {ref}")
            if det:
                print(f"        {det}")
        print()

    print(f"  Endpoints sin auth: {sum(len(v) for v in grupos.values())}\n")


if __name__ == '__main__':
    main()
