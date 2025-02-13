// routes/cursosRoutes.js
const express = require('express');
const router = express.Router();
const inventarioGrupoController = require('../controllers/inventarioGrupoController');

router.get('/', inventarioGrupoController.getAllCategories);


module.exports = router;