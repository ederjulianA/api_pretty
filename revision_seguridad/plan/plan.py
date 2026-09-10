#!/usr/bin/env python3
"""
CLI de estado del plan de hardening de seguridad — API Pretty.

Fuente de verdad: ESTADO.json (junto a este script).
Lo invocan las sesiones de Claude desde cualquiera de los dos repos.

Uso:
  plan.py estado                      Dashboard general
  plan.py siguiente                   Siguiente tarea ejecutable
  plan.py ver SEC-04                  Detalle de una tarea
  plan.py iniciar SEC-04 --repo backend --rama seguridad/SEC-04-helmet
  plan.py validado SEC-04 --repo backend
  plan.py merged SEC-04 --repo backend --commit abc1234
  plan.py desplegado SEC-04
  plan.py bloquear SEC-04 "razon"
  plan.py desbloquear SEC-04
  plan.py nota SEC-04 "texto"
  plan.py agregar SEC-30 --titulo ... --severidad alta --fase 2 --repos backend \
                  --descripcion ... --gate ...        Tarea descubierta sobre la marcha
"""
import json, sys, os, argparse
from datetime import date

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ESTADO.json')

SEV_ORDEN = {'critica': 0, 'alta': 1, 'media': 2, 'baja': 3, 'instrumentacion': 0}
ICONO_SEV = {'critica': '[CRIT]', 'alta': '[ALTA]', 'media': '[MED ]',
             'baja': '[BAJA]', 'instrumentacion': '[INST]'}


def cargar():
    with open(RUTA, encoding='utf-8') as f:
        return json.load(f)


def guardar(d):
    d['actualizado'] = date.today().isoformat()
    with open(RUTA, 'w', encoding='utf-8') as f:
        json.dump(d, f, indent=2, ensure_ascii=False)
        f.write('\n')


def buscar(d, tid):
    for t in d['tareas']:
        if t['id'].upper() == tid.upper():
            return t
    sys.exit(f"ERROR: no existe la tarea {tid}")


def repo_completo(t, repo):
    """Un repo esta cerrado cuando esta merged; backend ademas requiere deploy."""
    p = t['progreso'].get(repo)
    if not p:
        return True
    if not p.get('merged'):
        return False
    if repo == 'backend' and not p.get('desplegado'):
        return False
    return True


def completada(t):
    return all(repo_completo(t, r) for r in t['repos'])


def derivar_estado(d, t):
    """El estado de la tarea se deriva del progreso por repo y de sus dependencias."""
    if t.get('estado') == 'bloqueado_manual':
        return 'bloqueado_manual'
    if completada(t):
        return 'completado'

    pendientes = [dep for dep in t.get('depende_de', [])
                  if not completada(buscar(d, dep))]
    if pendientes:
        return 'bloqueado'

    estados = [t['progreso'][r].get('estado') for r in t['repos']]
    if any(e in ('en_curso', 'validado', 'merged') for e in estados):
        return 'en_curso'
    return 'pendiente'


def refrescar(d):
    for t in d['tareas']:
        t['estado'] = derivar_estado(d, t)
    return d


def linea_progreso(t):
    partes = []
    for r in t['repos']:
        p = t['progreso'][r]
        if repo_completo(t, r):
            m = 'OK'
        elif p.get('merged'):
            m = 'merged, falta deploy'
        else:
            m = p.get('estado', 'pendiente')
        partes.append(f"{r}:{m}")
    return ' | '.join(partes)


# ---------------------------------------------------------------- comandos

def cmd_estado(d, args):
    refrescar(d)
    guardar(d)
    tareas = d['tareas']
    hechas = [t for t in tareas if t['estado'] == 'completado']

    print(f"\n  PLAN: {d['plan']}   (actualizado {d['actualizado']})")
    print(f"  Avance: {len(hechas)}/{len(tareas)} tareas completadas\n")

    for fase in sorted({t['fase'] for t in tareas}):
        dela = [t for t in tareas if t['fase'] == fase]
        ok = sum(1 for t in dela if t['estado'] == 'completado')
        print(f"  --- FASE {fase}  ({ok}/{len(dela)}) " + "-" * 42)
        for t in sorted(dela, key=lambda x: (SEV_ORDEN.get(x['severidad'], 9), x['id'])):
            marca = {'completado': '[x]', 'en_curso': '[~]',
                     'bloqueado': '[-]', 'bloqueado_manual': '[!]'}.get(t['estado'], '[ ]')
            print(f"  {marca} {t['id']}  {ICONO_SEV.get(t['severidad'],'')}  {t['titulo'][:52]}")
            if t['estado'] == 'en_curso':
                print(f"          -> {linea_progreso(t)}")
            elif t['estado'] == 'bloqueado':
                falta = [dep for dep in t.get('depende_de', []) if not completada(buscar(d, dep))]
                print(f"          -> espera {', '.join(falta)}")
            elif t['estado'] == 'bloqueado_manual':
                print(f"          -> BLOQUEADO: {t['notas'][-1] if t['notas'] else 'sin razon'}")
        print()

    sig = elegir_siguiente(d)
    print(f"  SIGUIENTE: {sig['id']} — {sig['titulo']}\n" if sig
          else "  No hay tareas ejecutables (todo completado o bloqueado).\n")


def elegir_siguiente(d):
    refrescar(d)
    listas = [t for t in d['tareas'] if t['estado'] in ('pendiente', 'en_curso')]
    if not listas:
        return None
    return sorted(listas, key=lambda t: (t['fase'], SEV_ORDEN.get(t['severidad'], 9), t['id']))[0]


def cmd_siguiente(d, args):
    t = elegir_siguiente(d)
    guardar(d)
    if not t:
        print("No hay tareas ejecutables.")
        return
    mostrar(d, t)


def cmd_ver(d, args):
    refrescar(d)
    mostrar(d, buscar(d, args.id))


def mostrar(d, t):
    print(f"\n  {t['id']} — {t['titulo']}")
    print(f"  Severidad: {t['severidad']}   Fase: {t['fase']}   Estado: {t['estado']}")
    print(f"  Hallazgo:  {t['hallazgo']}")
    print(f"  Repos:     {', '.join(t['repos'])}   (secuencia: {' -> '.join(t['secuencia'])})")
    if t.get('depende_de'):
        print(f"  Depende:   {', '.join(t['depende_de'])}")
    print(f"\n  QUE:  {t['descripcion']}")
    print(f"\n  GATE: {t['gate']}")
    print("\n  ARCHIVOS:")
    for repo, files in t['archivos'].items():
        print(f"    {repo}:")
        for fl in files:
            print(f"      - {fl}")
    if t.get('notas'):
        print("\n  NOTAS:")
        for n in t['notas']:
            print(f"    * {n}")
    print(f"\n  PROGRESO: {linea_progreso(t)}\n")


def cmd_iniciar(d, args):
    t = buscar(d, args.id)
    if args.repo not in t['repos']:
        sys.exit(f"ERROR: {t['id']} no toca el repo '{args.repo}' (toca: {', '.join(t['repos'])})")
    refrescar(d)
    if t['estado'] == 'bloqueado':
        falta = [x for x in t.get('depende_de', []) if not completada(buscar(d, x))]
        sys.exit(f"ERROR: {t['id']} esta bloqueada, espera {', '.join(falta)}")
    # Regla 1: respetar la secuencia entre repos
    seq = t['secuencia']
    idx = seq.index(args.repo)
    for previo in seq[:idx]:
        if not t['progreso'][previo].get('merged'):
            sys.exit(f"ERROR (Regla 1): antes de '{args.repo}' hay que mergear '{previo}'. "
                     f"Invertir el orden tumba produccion.")
    t['progreso'][args.repo].update({'estado': 'en_curso', 'rama': args.rama})
    refrescar(d); guardar(d)
    print(f"OK  {t['id']} / {args.repo} -> en_curso   rama: {args.rama}")


def cmd_validado(d, args):
    t = buscar(d, args.id)
    t['progreso'][args.repo]['estado'] = 'validado'
    refrescar(d); guardar(d)
    print(f"OK  {t['id']} / {args.repo} -> validado (gate superado, listo para merge)")


def cmd_merged(d, args):
    t = buscar(d, args.id)
    p = t['progreso'][args.repo]
    if p.get('estado') != 'validado':
        sys.exit(f"ERROR: {t['id']}/{args.repo} no esta validado. Corre el gate primero.")
    p.update({'estado': 'merged', 'merged': True, 'commit': args.commit})
    refrescar(d); guardar(d)
    print(f"OK  {t['id']} / {args.repo} -> merged a main ({args.commit})")
    if args.repo == 'frontend':
        print("    Vercel esta desplegando. Verifica EN VIVO antes de tocar el backend.")
    if args.repo == 'backend':
        print("    Falta desplegar: pm2 restart api_pretty   (luego: plan.py desplegado " + t['id'] + ")")


def cmd_desplegado(d, args):
    t = buscar(d, args.id)
    p = t['progreso'].get('backend')
    if not p:
        sys.exit(f"ERROR: {t['id']} no tiene parte de backend.")
    if not p.get('merged'):
        sys.exit(f"ERROR: {t['id']} backend aun no esta mergeado.")
    p['estado'] = 'desplegado'
    p['desplegado'] = True
    refrescar(d); guardar(d)
    print(f"OK  {t['id']} backend desplegado. Estado de la tarea: {t['estado']}")
    if t['estado'] == 'completado':
        libres = [x['id'] for x in d['tareas']
                  if t['id'] in x.get('depende_de', []) and x['estado'] == 'pendiente']
        if libres:
            print(f"    Desbloquea: {', '.join(libres)}")


def cmd_bloquear(d, args):
    t = buscar(d, args.id)
    t['estado'] = 'bloqueado_manual'
    t.setdefault('notas', []).append(f"[{date.today().isoformat()}] BLOQUEADO: {args.razon}")
    guardar(d)
    print(f"OK  {t['id']} -> bloqueado_manual: {args.razon}")


def cmd_desbloquear(d, args):
    t = buscar(d, args.id)
    if t.get('estado') == 'bloqueado_manual':
        t['estado'] = 'pendiente'
    t.setdefault('notas', []).append(f"[{date.today().isoformat()}] Desbloqueada")
    refrescar(d); guardar(d)
    print(f"OK  {t['id']} -> {t['estado']}")


def cmd_nota(d, args):
    t = buscar(d, args.id)
    t.setdefault('notas', []).append(f"[{date.today().isoformat()}] {args.texto}")
    guardar(d)
    print(f"OK  nota agregada a {t['id']}")


def cmd_agregar(d, args):
    """Registra una tarea descubierta durante la ejecucion, no prevista en el plan original."""
    if any(t['id'].upper() == args.id.upper() for t in d['tareas']):
        sys.exit(f"ERROR: {args.id} ya existe.")
    repos = [r.strip() for r in args.repos.split(',')]
    for r in repos:
        if r not in ('backend', 'frontend'):
            sys.exit(f"ERROR: repo invalido '{r}' (usa backend y/o frontend)")
    deps = [x.strip().upper() for x in args.depende_de.split(',')] if args.depende_de else []
    for dep in deps:
        buscar(d, dep)  # valida que exista

    progreso = {}
    for r in repos:
        progreso[r] = {'estado': 'pendiente', 'rama': None, 'commit': None, 'merged': False}
        if r == 'backend':
            progreso[r]['desplegado'] = False

    d['tareas'].append({
        'id': args.id.upper(),
        'titulo': args.titulo,
        'severidad': args.severidad,
        'fase': args.fase,
        'hallazgo': args.hallazgo,
        'estado': 'pendiente',
        'repos': repos,
        'secuencia': ['frontend', 'backend'] if len(repos) > 1 else repos,
        'depende_de': deps,
        'bloquea': [],
        'archivos': {r: [] for r in repos},
        'descripcion': args.descripcion,
        'gate': args.gate,
        'progreso': progreso,
        'notas': [f"[{date.today().isoformat()}] Descubierta durante la ejecucion del plan, no estaba en el informe original."],
    })
    refrescar(d); guardar(d)
    print(f"OK  {args.id.upper()} agregada al plan (fase {args.fase}, {args.severidad})")
    print(f"    Repos: {', '.join(repos)}" + (f"   Depende de: {', '.join(deps)}" if deps else ""))



def main():
    ap = argparse.ArgumentParser(description='Estado del plan de hardening')
    sub = ap.add_subparsers(dest='cmd', required=True)

    sub.add_parser('estado')
    sub.add_parser('siguiente')
    p = sub.add_parser('ver');         p.add_argument('id')
    p = sub.add_parser('iniciar');     p.add_argument('id'); p.add_argument('--repo', required=True); p.add_argument('--rama', required=True)
    p = sub.add_parser('validado');    p.add_argument('id'); p.add_argument('--repo', required=True)
    p = sub.add_parser('merged');      p.add_argument('id'); p.add_argument('--repo', required=True); p.add_argument('--commit', required=True)
    p = sub.add_parser('desplegado');  p.add_argument('id')
    p = sub.add_parser('bloquear');    p.add_argument('id'); p.add_argument('razon')
    p = sub.add_parser('desbloquear'); p.add_argument('id')
    p = sub.add_parser('nota');        p.add_argument('id'); p.add_argument('texto')
    p = sub.add_parser('agregar')
    p.add_argument('id')
    p.add_argument('--titulo', required=True)
    p.add_argument('--severidad', required=True, choices=['critica','alta','media','baja','instrumentacion'])
    p.add_argument('--fase', required=True, type=int)
    p.add_argument('--repos', required=True, help='backend, frontend, o "frontend,backend"')
    p.add_argument('--descripcion', required=True)
    p.add_argument('--gate', required=True)
    p.add_argument('--hallazgo', default='Descubierto durante la ejecucion')
    p.add_argument('--depende-de', dest='depende_de', default='')

    args = ap.parse_args()
    d = cargar()
    globals()[f'cmd_{args.cmd}'](d, args)


if __name__ == '__main__':
    main()
