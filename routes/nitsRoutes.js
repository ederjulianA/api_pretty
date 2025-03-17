// routes/nitsRoutes.js
const express = require('express');
const router = express.Router();
const nitsController = require('../controllers/nitsController');


// Endpoint GET para la consulta de Nits
// Ejemplo de uso:
// GET /api/nits?nit_nom=ejemplo&PageNumber=1&PageSize=50
router.get('/', nitsController.getNits);

// Endpoint POST para insertar un nuevo registro en Nit
router.post('/', nitsController.createNitEndpoint);
module.exports = router;
