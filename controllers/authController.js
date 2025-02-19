// controllers/authController.js
const userModel = require('../models/userModel');
const validator = require('validator');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const loginUser = async (req, res) => {
  try {
    const { usu_cod, usu_pass } = req.body;

    // Validar que los campos existan y no estén vacíos
    if (!usu_cod || !usu_pass) {
      return res.status(400).json({ success: false, error: "Los campos 'usu_cod' y 'usu_pass' son requeridos." });
    }
    if (validator.isEmpty(usu_cod) || validator.isEmpty(usu_pass)) {
      return res.status(400).json({ success: false, error: "Los campos 'usu_cod' y 'usu_pass' no pueden estar vacíos." });
    }

    // Buscar el usuario en la base de datos
    const user = await userModel.findUserByCod(usu_cod);
    if (!user) {
      return res.status(401).json({ success: false, error: "Credenciales inválidas." });
    }

    // Comparar la contraseña ingresada con la almacenada (debe estar previamente encriptada)
    const isMatch = await bcrypt.compare(usu_pass, user.usu_pass);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: "Credenciales inválidas." });
    }

    // Generar el token JWT. El payload puede incluir la información que consideres necesaria.
    const payload = {
      usu_cod: user.usu_cod,
      usu_nom: user.usu_nom,
      usu_email: user.usu_email
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '1h' });

    return res.json({ success: true, token, message: "Login exitoso.",usuario:user.usu_cod });
  } catch (error) {
    console.error("Error en login:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = { loginUser };
