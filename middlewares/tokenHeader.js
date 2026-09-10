// middlewares/tokenHeader.js
//
// Extraccion del token de la peticion, en un solo sitio.
//
// El proyecto naci0 leyendo unicamente 'x-access-token'. Eso hacia que
// DiferenciaInventario.jsx, que envia 'Authorization: Bearer <token>',
// llegara al backend como si no trajera token: el frontend creia estar
// autenticando y el servidor no reconocia la cabecera.
//
// Aceptar ambas alinea la API con el estandar sin romper a los clientes
// existentes, y evita que la logica quede duplicada en los dos middlewares
// de auth (que son CommonJS y ESM) y en el de auditoria.
//
// CommonJS a proposito: asi lo consumen tanto los modulos ESM como los CJS.

const extraerToken = (req) => {
  const h = (req && req.headers) || {};

  const directo = h['x-access-token'];
  if (typeof directo === 'string' && directo.trim()) return directo.trim();

  // Se acepta cualquier capitalizacion del esquema: el RFC 7235 lo define
  // como case-insensitive y hay clientes que envian 'bearer'.
  const auth = h.authorization;
  if (typeof auth === 'string') {
    const m = auth.match(/^\s*Bearer\s+(.+)$/i);
    if (m && m[1].trim()) return m[1].trim();
  }

  return null;
};

module.exports = { extraerToken };
