-- Script para eliminar la acción de editar del rol administrador en el módulo dashboard
BEGIN TRY
    BEGIN TRANSACTION;

    -- Primero obtenemos el ID del rol administrador
    DECLARE @rol_id INT = (SELECT rol_id FROM dbo.Roles WHERE rol_nombre = 'Administrador');

    -- Obtenemos el ID del módulo dashboard
    DECLARE @mod_id INT = (SELECT mod_id FROM dbo.Modulos WHERE mod_codigo = 'DASHBOARD');

    -- Verificamos que el rol y el módulo existan
    IF @rol_id IS NULL
        THROW 50000, 'No se encontró el rol Administrador', 1;
    IF @mod_id IS NULL
        THROW 50000, 'No se encontró el módulo DASHBOARD', 1;

    -- Obtenemos el ID de la acción EDITAR
    DECLARE @acc_id INT = (SELECT acc_id FROM dbo.Acciones WHERE mod_id = @mod_id AND acc_codigo = 'edit');

    -- Obtenemos el ID del permiso del rol para el módulo dashboard
    DECLARE @rolperm_id INT = (SELECT rolperm_id FROM dbo.RolesPermisos WHERE rol_id = @rol_id AND mod_id = @mod_id);

    -- Verificamos si existe la asignación de la acción
    IF EXISTS (SELECT 1 FROM dbo.RolesPermisosAcciones 
              WHERE rolperm_id = @rolperm_id AND acc_id = @acc_id)
    BEGIN
        -- Eliminamos la acción permitida
        DELETE FROM dbo.RolesPermisosAcciones 
        WHERE rolperm_id = @rolperm_id AND acc_id = @acc_id;
        PRINT 'Acción EDITAR eliminada exitosamente del rol Administrador';
    END
    ELSE
    BEGIN
        PRINT 'La acción EDITAR no estaba asignada al rol Administrador';
    END

    -- Verificación final de los permisos
    PRINT 'Verificando permisos configurados:';
    SELECT 
        m.mod_codigo as module_code,
        m.mod_nombre as module_name,
        rp.acceso as access,
        a.acc_codigo as action_code,
        a.acc_nombre as action_name,
        rpa.permitido as allowed
    FROM dbo.RolesPermisos rp
    INNER JOIN dbo.Modulos m ON rp.mod_id = m.mod_id
    LEFT JOIN dbo.RolesPermisosAcciones rpa ON rp.rolperm_id = rpa.rolperm_id
    LEFT JOIN dbo.Acciones a ON rpa.acc_id = a.acc_id
    WHERE rp.rol_id = @rol_id
    AND m.mod_codigo = 'DASHBOARD'
    ORDER BY m.mod_codigo, a.acc_codigo;

    COMMIT TRANSACTION;
    PRINT 'Proceso completado exitosamente';
END TRY
BEGIN CATCH
    ROLLBACK TRANSACTION;
    PRINT 'Error: ' + ERROR_MESSAGE();
END CATCH; 