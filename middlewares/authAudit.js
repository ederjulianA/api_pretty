// middlewares/authAudit.js
//
// Auditoria de autenticacion — REGISTRA SIN BLOQUEAR.
//
// Instrumentacion temporal del plan de hardening (SEC-00). Su unico proposito
// es medir, durante ~7 dias, que endpoints reciben trafico y si ese trafico
// llega autenticado. Con esos datos se decide con evidencia cuales endpoints
// se pueden proteger sin romper produccion (ver revision_seguridad/plan/).
//
// INVARIANTE: este middleware NUNCA debe alterar el comportamiento de la API.
// Todo su cuerpo va dentro de try/catch y siempre llama next(). Si algo falla
// aqui, se pierde una medicion — jamas una request.
//
// No registra el token en si, solo si era valido: un log con tokens es una
// fuga de credenciales.

const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { extraerToken } = require('./tokenHeader');

const DIR = path.join(__dirname, '..', 'logs');
const LOG_EVENTOS = path.join(DIR, 'auth-audit.log');       // solo trafico anomalo (append)

// Un archivo de resumen POR PROCESO. El agregado vive en memoria, asi que si
// todos los procesos escribieran el mismo archivo, el ultimo en volcar pisaria
// a los demas: en cluster mode se perderian workers enteros, y un simple
// 'pm2 restart' arrancaria con el agregado vacio y borraria el historico.
// analizar-auditoria.py consolida todos los auth-audit-resumen-*.json.
const ID_PROCESO = `${process.pid}-${Date.now().toString(36)}`;
const LOG_RESUMEN = path.join(DIR, `auth-audit-resumen-${ID_PROCESO}.json`);

const INTERVALO_VOLCADO_MS = 5 * 60 * 1000;

// Agregado en memoria: "METODO /ruta" -> contadores
const resumen = new Map();
let secretKey = null;
let escrituraRota = false;

try {
  fs.mkdirSync(DIR, { recursive: true });
} catch (e) {
  escrituraRota = true;
}

// El secreto se deriva una sola vez; si falta JWT_SECRET no se cae, solo
// queda sin poder distinguir token valido de invalido.
try {
  if (process.env.JWT_SECRET) {
    secretKey = crypto.createHash('sha256').update(process.env.JWT_SECRET).digest();
  }
} catch (e) {
  secretKey = null;
}

const ipReal = (req) => {
  const fwd = req.headers && req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'desconocida';
};

// Ruta declarada en Express (p.ej. "/api/order/:fac_nro") en vez de la
// concreta ("/api/order/FAC123"), para que el agregado no se disperse.
// req.route solo existe si alguna ruta matcheo; si no, se normaliza a mano.
const rutaAgrupada = (req) => {
  try {
    if (req.route && req.route.path) {
      const base = req.baseUrl || '';
      const p = req.route.path === '/' ? '' : req.route.path;
      return (base + p) || '/';
    }
  } catch (e) { /* cae al fallback */ }

  return (req.path || req.url || '/')
    .split('?')[0]
    .split('/')
    .map((seg) => (/\d/.test(seg) && seg.length > 1 ? ':param' : seg))
    .join('/');
};

const escribirEvento = (registro) => {
  if (escrituraRota) {
    console.log('[AUTH-AUDIT]', JSON.stringify(registro));
    return;
  }
  fs.appendFile(LOG_EVENTOS, JSON.stringify(registro) + '\n', (err) => {
    if (err) {
      escrituraRota = true;
      console.log('[AUTH-AUDIT]', JSON.stringify(registro));
    }
  });
};

const volcarResumen = () => {
  try {
    const salida = {
      generado: new Date().toISOString(),
      desde: arranque,
      proceso: ID_PROCESO,
      endpoints: Array.from(resumen.entries())
        .map(([clave, v]) => ({
          endpoint: clave,
          sin_token: v.sin_token,
          token_invalido: v.token_invalido,
          token_valido: v.token_valido,
          total: v.sin_token + v.token_invalido + v.token_valido,
          usuarios: Array.from(v.usuarios).slice(0, 20),
          ips_sin_token: Array.from(v.ips_sin_token).slice(0, 20),
          ultimo: v.ultimo,
        }))
        .sort((a, b) => b.total - a.total),
    };
    if (escrituraRota) return;
    fs.writeFile(LOG_RESUMEN, JSON.stringify(salida, null, 2), () => {});
  } catch (e) { /* nunca propagar */ }
};

const arranque = new Date().toISOString();

const authAudit = (req, res, next) => {
  try {
    // Se registra al terminar la respuesta: ahi ya existe req.route (la ruta
    // declarada) y el status final. Antes del routing esa informacion no esta.
    res.on('finish', () => {
      try {
        const token = extraerToken(req);
        let estado = 'sin_token';
        let usuario = null;

        if (token) {
          if (!secretKey) {
            estado = 'token_invalido'; // sin JWT_SECRET no se puede afirmar validez
          } else {
            try {
              const dec = jwt.verify(token, secretKey);
              estado = 'token_valido';
              usuario = dec && dec.usu_cod ? dec.usu_cod : null;
            } catch (e) {
              estado = 'token_invalido';
            }
          }
        }

        const clave = `${req.method} ${rutaAgrupada(req)}`;
        if (!resumen.has(clave)) {
          resumen.set(clave, {
            sin_token: 0, token_invalido: 0, token_valido: 0,
            usuarios: new Set(), ips_sin_token: new Set(), ultimo: null,
          });
        }
        const acc = resumen.get(clave);
        acc[estado] += 1;
        acc.ultimo = new Date().toISOString();
        if (usuario) acc.usuarios.add(usuario);

        // Detalle solo del trafico anomalo. El trafico autenticado ya queda
        // suficientemente descrito en el agregado, y registrarlo entero
        // inflaria el log sin aportar nada a la decision.
        if (estado !== 'token_valido') {
          acc.ips_sin_token.add(ipReal(req));
          escribirEvento({
            ts: new Date().toISOString(),
            metodo: req.method,
            ruta: rutaAgrupada(req),
            url: (req.originalUrl || '').split('?')[0],
            estado_auth: estado,
            status: res.statusCode,
            ip: ipReal(req),
            origin: (req.headers && req.headers.origin) || null,
            referer: (req.headers && req.headers.referer) || null,
            ua: ((req.headers && req.headers['user-agent']) || '').slice(0, 120),
          });
        }
      } catch (e) { /* una medicion perdida no puede afectar la respuesta */ }
    });
  } catch (e) { /* idem */ }

  return next();
};

// Volcado periodico para que el agregado sobreviva a un reinicio.
// unref() evita que este timer mantenga vivo el proceso.
const timer = setInterval(volcarResumen, INTERVALO_VOLCADO_MS);
if (timer.unref) timer.unref();

['SIGTERM', 'SIGINT'].forEach((sig) => process.on(sig, () => { volcarResumen(); }));

module.exports = authAudit;
module.exports.volcarResumen = volcarResumen;
module.exports._resumen = resumen;
