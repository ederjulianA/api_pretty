const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const RolePermission = sequelize.define('RolePermission', {
    rolperm_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    rol_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    mod_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    acceso: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    }
}, {
    tableName: 'RolesPermisos',
    timestamps: false
});

module.exports = RolePermission; 