const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Action = sequelize.define('Action', {
    acc_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    mod_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    acc_codigo: {
        type: DataTypes.STRING(50),
        allowNull: false
    },
    acc_nombre: {
        type: DataTypes.STRING(100),
        allowNull: false
    },
    acc_descripcion: {
        type: DataTypes.STRING(200),
        allowNull: true
    }
}, {
    tableName: 'Acciones',
    timestamps: false
});

module.exports = Action; 