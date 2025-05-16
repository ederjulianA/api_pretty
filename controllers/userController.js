const { getAllUsers, createUser, updateUser } = require('../models/userModel');

const getUsers = async (req, res) => {
  try {
    const users = await getAllUsers();
    res.json(users);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al obtener usuarios',
      error: error.message
    });
  }
};

const createUserController = async (req, res) => {
  try {
    const { name, email, role_id } = req.body;
    if (!name || !email || !role_id) {
      return res.status(400).json({
        success: false,
        message: 'Faltan campos requeridos'
      });
    }
    const user = await createUser({ name, email, role_id });
    res.status(201).json({ success: true, user });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al crear usuario',
      error: error.message
    });
  }
};

const updateUserController = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, role_id } = req.body;
    if (!name || !email || !role_id) {
      return res.status(400).json({
        success: false,
        message: 'Faltan campos requeridos'
      });
    }
    const user = await updateUser(id, { name, email, role_id });
    res.json(user);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al actualizar usuario',
      error: error.message
    });
  }
};

module.exports = { getUsers, createUser: createUserController, updateUser: updateUserController }; 