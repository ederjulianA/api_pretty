// controllers/cursosController.js
const cursosModel = require('../models/inventarioGrupoModel');

// Obtener todos los cursos

const getAllCategories = async (req, res) => {
    try {
      
      const result = await cursosModel.getAllCategories();
     
      res.json({success:true, result})
    } catch (error) {
      console.error('Error al obtener Categorias:', error);
  
      res.status(500).json({success:false,message:error.message});
    }
  };

  module.exports = { getAllCategories };