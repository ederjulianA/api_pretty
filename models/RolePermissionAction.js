const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const RolePermissionAction = sequelize.define('RolePermissionAction', {
    rolpermacc_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    rolperm_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    acc_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    permitido: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    }
}, {
    tableName: 'RolesPermisosAcciones',
    timestamps: false
});

module.exports = RolePermissionAction; 