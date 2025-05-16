const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const UserRole = sequelize.define('UserRole', {
    usurol_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    usu_cod: {
        type: DataTypes.STRING(20),
        allowNull: false
    },
    rol_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    fecha_asignacion: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: 'UsuariosRoles',
    timestamps: false
});

module.exports = UserRole; 