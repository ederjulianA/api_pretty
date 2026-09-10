// middlewares/rateLimits.js
//
// Limites de tasa. Hoy solo cubre el login (SEC-03), que aceptaba intentos
// ilimitados contra bcrypt.
//
// POR QUE SE LIMITA POR USUARIO Y NO POR IP
//
// El frontend llega a esta API a traves de un rewrite server-side de Vercel
// (pretty_front/vercel.json), asi que TODAS las peticiones legitimas llegan
// con la misma IP: la de Vercel. Un limite por IP bloquearia a todos los
// usuarios a la vez en cuanto un solo atacante agotara la cuota — seria
// convertir un intento de fuerza bruta en una caida de servicio.
//
// Confiar en X-Forwarded-For tampoco sirve por ahora: el puerto 3000 esta
// expuesto directo a internet (ver ALTA-18 del informe), asi que cualquiera
// puede saltarse Vercel y falsificar esa cabecera para evadir el limite.
//
// Limitar por usu_cod es inmune a ambos problemas: protege cada cuenta sin
// importar desde donde venga el intento, y un atacante no puede afectar a
// otros usuarios. Cuando SEC-27 ponga un reverse proxy con TLS delante y la
// IP real sea confiable, tiene sentido anadir un limite por IP encima.

const rateLimit = require('express-rate-limit');

const VENTANA_MS = 15 * 60 * 1000;
const MAX_INTENTOS_FALLIDOS = 5;

const claveLogin = (req) => {
  const usu = req.body && req.body.usu_cod;
  if (typeof usu === 'string' && usu.trim()) {
    return `usu:${usu.trim().toLowerCase()}`;
  }
  // Sin usu_cod no hay a quien atribuirle el intento. Se agrupan todos bajo
  // una misma clave para que un flood de peticiones malformadas no quede sin
  // freno; un login legitimo siempre trae usu_cod.
  return 'sin-usuario';
};

const loginLimiter = rateLimit({
  windowMs: VENTANA_MS,
  limit: MAX_INTENTOS_FALLIDOS,
  keyGenerator: claveLogin,
  // Solo cuentan los intentos FALLIDOS (respuesta >= 400). Quien se equivoca
  // dos veces y acierta a la tercera no arrastra penalizacion.
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // La clave es el usuario, no la IP: se desactivan las validaciones que
  // express-rate-limit hace sobre la deteccion de IP tras proxy.
  validate: { trustProxy: false, xForwardedForHeader: false },
  handler: (req, res) => {
    const usu = (req.body && req.body.usu_cod) || '(sin usu_cod)';
    console.warn(`[LOGIN-BLOQUEADO] usuario=${usu} ip=${req.ip} ts=${new Date().toISOString()}`);
    return res.status(429).json({
      success: false,
      message: 'Demasiados intentos fallidos. Espere 15 minutos e intente de nuevo.'
    });
  },
});

module.exports = { loginLimiter, MAX_INTENTOS_FALLIDOS, VENTANA_MS };
