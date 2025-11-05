import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const verifyToken = (req, res, next) => {
  const token = req.headers['x-access-token'];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "No se proporcionó token de acceso"
    });
  }

  try {
    // Generar el secretKey usando el mismo hash SHA-256 que se usa al generar el token
    const secretKey = crypto.createHash('sha256').update(process.env.JWT_SECRET).digest();
    const decoded = jwt.verify(token, secretKey);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Token inválido o expirado"
    });
  }
};

export { verifyToken }; 