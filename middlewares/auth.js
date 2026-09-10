// middlewares/auth.js
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { extraerToken } = require('./tokenHeader');

const verifyToken = (req, res, next) => {
  // Acepta "x-access-token" (historico) y "Authorization: Bearer" (estandar)
  const token = extraerToken(req);
  
  if (!token) {
    return res.status(401).json({ success: false, error: 'No token provided.' });
  }
  
  // Generar el secretKey usando el mismo hash SHA-256 que se usa al generar el token
  const secretKey = crypto.createHash('sha256').update(process.env.JWT_SECRET).digest();
  
  jwt.verify(token, secretKey, (err, decoded) => {
    if (err) {
      return res.status(401).json({ success: false, error: 'Invalid token.' });
    }
    // Se almacena la información del token en req.user para usarla en los endpoints
    req.user = decoded;
    next();
  });
};

module.exports = verifyToken;
