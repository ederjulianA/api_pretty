const cors = require('cors'); // Importa el paquete cors

// index.js
const express = require('express');
const app = express();
require('dotenv').config();

const inventarioGrupoRoutes = require('./routes/inventarioGrupoRoutes');
const articulosRoutes = require('./routes/articulosRoutes');
const nitsRoutes = require('./routes/nitsRoutes');
const orderRoutes = require('./routes/orderRoutes');

app.use(express.json());
app.use(cors());

app.use('/api/categorias', inventarioGrupoRoutes);
app.use('/api/articulos', articulosRoutes);
app.use('/api/nits', nitsRoutes);
app.use('/api/order', orderRoutes);

app.get('/' , (req,res)=>{
  res.send("API Working")
})

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});