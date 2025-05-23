-- Script para agregar la acción de editar al rol administrador en el módulo dashboard
BEGIN TRY
    BEGIN TRANSACTION;

    -- Primero obtenemos el ID del rol administrador
    DECLARE @rol_id INT = (SELECT rol_id FROM dbo.Roles WHERE rol_nombre = 'Administrador');

    -- Obtenemos el ID del módulo dashboard y nos aseguramos que esté activo
    DECLARE @mod_id INT = (SELECT mod_id FROM dbo.Modulos WHERE mod_codigo = 'DASHBOARD');

    -- Verificamos que el rol y el módulo existan
    IF @rol_id IS NULL
        THROW 50000, 'No se encontró el rol Administrador', 1;
    IF @mod_id IS NULL
        THROW 50000, 'No se encontró el módulo DASHBOARD', 1;

    -- Aseguramos que el módulo esté activo
    UPDATE dbo.Modulos 
    SET mod_activo = 1 
    WHERE mod_id = @mod_id;
    PRINT 'Módulo DASHBOARD activado';

    -- Verificamos si la acción EDITAR ya existe, si no, la creamos
    DECLARE @acc_id INT = (SELECT acc_id FROM dbo.Acciones WHERE mod_id = @mod_id AND acc_codigo = 'edit');
    
    IF @acc_id IS NULL
    BEGIN
        -- Insertamos la nueva acción
        INSERT INTO dbo.Acciones (mod_id, acc_codigo, acc_nombre, acc_descripcion)
        VALUES (@mod_id, 'edit', 'Editar Dashboard', 'Permite editar la configuración del dashboard');
        
        -- Obtenemos el ID de la acción recién creada
        SET @acc_id = SCOPE_IDENTITY();
        PRINT 'Nueva acción EDITAR creada para el módulo DASHBOARD';
    END

    -- Obtenemos el ID del permiso del rol para el módulo dashboard
    DECLARE @rolperm_id INT = (SELECT rolperm_id FROM dbo.RolesPermisos WHERE rol_id = @rol_id AND mod_id = @mod_id);

    -- Si no existe el permiso del rol para el módulo, lo creamos
    IF @rolperm_id IS NULL
    BEGIN
        INSERT INTO dbo.RolesPermisos (rol_id, mod_id, acceso)
        VALUES (@rol_id, @mod_id, 1);
        
        SET @rolperm_id = SCOPE_IDENTITY();
        PRINT 'Nuevo permiso creado para el rol Administrador en el módulo DASHBOARD';
    END

    -- Verificamos si la acción ya está asignada al rol
    IF NOT EXISTS (SELECT 1 FROM dbo.RolesPermisosAcciones 
                  WHERE rolperm_id = @rolperm_id AND acc_id = @acc_id)
    BEGIN
        -- Insertamos la nueva acción permitida
        INSERT INTO dbo.RolesPermisosAcciones (rolperm_id, acc_id, permitido)
        VALUES (@rolperm_id, @acc_id, 1);
        PRINT 'Acción EDITAR agregada exitosamente al rol Administrador';
    END
    ELSE
    BEGIN
        PRINT 'La acción EDITAR ya estaba asignada al rol Administrador';
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