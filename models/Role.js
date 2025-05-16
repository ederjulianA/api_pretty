// Este archivo define el modelo 'Role' (Rol) usando Sequelize (un ORM para bases de datos)

// Importamos los tipos de datos de Sequelize y la conexión a la base de datos
// Necesitas instalar el paquete 'sequelize' usando npm:
// npm install sequelize
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Definimos el modelo Role con sus campos y configuración
const Role = sequelize.define('Role', {
    // Campo ID del rol - Es la llave primaria que se autoincrementa
    rol_id: {
        type: DataTypes.INTEGER,        // Tipo entero
        primaryKey: true,               // Es llave primaria
        autoIncrement: true             // Se incrementa automáticamente
    },
    // Nombre del rol - Debe ser único
    rol_nombre: {
        type: DataTypes.STRING(50),     // Texto de máximo 50 caracteres
        allowNull: false,               // No puede ser nulo
        unique: true                    // Debe ser único
    },
    // Descripción del rol - Es opcional
    rol_descripcion: {
        type: DataTypes.STRING(200),    // Texto de máximo 200 caracteres
        allowNull: true                 // Puede ser nulo
    },
    // Estado del rol - Por defecto está activo
    rol_activo: {
        type: DataTypes.BOOLEAN,        // Tipo booleano (true/false)
        defaultValue: true              // Valor por defecto: true
    }
}, {
    tableName: 'Roles',                 // Nombre de la tabla en la base de datos
    timestamps: false                   // No crear campos de fecha automáticamente
});

// Exportamos el modelo para usarlo en otros archivos
module.exports = Role; 