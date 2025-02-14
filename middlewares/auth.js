// middlewares/auth.js
const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
  // Se espera que el token se envíe en el header "x-access-token"
  const token = req.headers['x-access-token'];
  
  if (!token) {
    return res.status(401).json({ success: false, error: 'No token provided.' });
  }
  
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({ success: false, error: 'Invalid token.' });
    }
    // Se almacena la información del token en req.user para usarla en los endpoints
    req.user = decoded;
    next();
  });
};

module.exports = verifyToken;
