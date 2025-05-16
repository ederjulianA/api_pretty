const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Module = sequelize.define('Module', {
    mod_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    mod_codigo: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true
    },
    mod_nombre: {
        type: DataTypes.STRING(100),
        allowNull: false
    },
    mod_descripcion: {
        type: DataTypes.STRING(200),
        allowNull: true
    },
    mod_activo: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    }
}, {
    tableName: 'Modulos',
    timestamps: false
});

module.exports = Module; 