

// index.js
const express = require('express');
const cors = require('cors'); // Importa el paquete cors
const app = express();
require('dotenv').config();

const inventarioGrupoRoutes    = require('./routes/inventarioGrupoRoutes');
const articulosRoutes          = require('./routes/articulosRoutes');
const nitsRoutes               = require('./routes/nitsRoutes');
const orderRoutes              = require('./routes/orderRoutes');
const authRoutes               = require('./routes/authRoutes');
const parametrosRoutes         = require('./routes/parametrosRoutes');
const ciudadesRoutes           = require('./routes/ciudadesRoutes');
const inventarioSubgrupoRoutes = require('./routes/inventarioSubgrupoRoutes');
const crearArticuloRoutes      = require('./routes/articulosRoutes');
const editarArticuloRoutes     = require('./routes/articulosRoutes');
const ordenesRoutes            = require('./routes/orderRoutes');
app.use(express.json());
app.use(cors());

app.use('/api/categorias', inventarioGrupoRoutes);
app.use('/api/articulos', articulosRoutes);
app.use('/api/nits', nitsRoutes);
app.use('/api/order', orderRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/parametros',parametrosRoutes);
app.use('/api/ciudades', ciudadesRoutes);
app.use('/api/subcategorias', inventarioSubgrupoRoutes);
app.use('/api/crearArticulo', crearArticuloRoutes);
app.use('/api/editarArticulo', editarArticuloRoutes);
app.use('/api/ordenes', ordenesRoutes);

app.get('/' , (req,res)=>{
  res.send("API Working")
})

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});