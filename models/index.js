const Role = require('./Role');
const Module = require('./Module');
const Action = require('./Action');
const UserRole = require('./UserRole');
const RolePermission = require('./RolePermission');
const RolePermissionAction = require('./RolePermissionAction');

// Definir las relaciones entre modelos
Role.belongsToMany(UserRole, { through: 'UsuariosRoles', foreignKey: 'rol_id' });
UserRole.belongsTo(Role, { foreignKey: 'rol_id' });

Role.belongsToMany(Module, { through: RolePermission, foreignKey: 'rol_id' });
Module.belongsToMany(Role, { through: RolePermission, foreignKey: 'mod_id' });

RolePermission.belongsToMany(Action, { through: RolePermissionAction, foreignKey: 'rolperm_id' });
Action.belongsToMany(RolePermission, { through: RolePermissionAction, foreignKey: 'acc_id' });

Module.hasMany(Action, { foreignKey: 'mod_id' });
Action.belongsTo(Module, { foreignKey: 'mod_id' });

module.exports = {
    Role,
    Module,
    Action,
    UserRole,
    RolePermission,
    RolePermissionAction
}; 