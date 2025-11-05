# Documentación del Sistema de Autenticación JWT

## Descripción General

El sistema de autenticación actual utiliza **JWT (JSON Web Tokens)** para manejar la autenticación y autorización de usuarios. Está implementado en Node.js/Express y utiliza SQL Server como base de datos.

---

## Componentes del Sistema

### 1. **Base de Datos - Estructura de Tablas**

El sistema utiliza las siguientes tablas en SQL Server:

#### Tabla: `dbo.Usuarios`
- `usu_cod` (VarChar) - Código único del usuario (PK)
- `usu_nom` (VarChar) - Nombre del usuario
- `usu_pass` (VarChar) - Contraseña encriptada con bcrypt
- `usu_cambia_pass` (Bit) - Flag que indica si el usuario debe cambiar su contraseña
- `usu_email` (VarChar) - Email del usuario (opcional)

#### Tabla: `dbo.Roles`
- `rol_id` (Int) - ID único del rol (PK)
- `rol_nombre` (VarChar) - Nombre del rol
- `rol_descripcion` (VarChar) - Descripción del rol
- `rol_activo` (Bit) - Indica si el rol está activo (1 = activo, 0 = inactivo)

#### Tabla: `dbo.UsuariosRoles`
- `usurol_id` (Int) - ID único de la relación (PK)
- `usu_cod` (VarChar) - Código del usuario (FK)
- `rol_id` (Int) - ID del rol (FK)
- `fecha_asignacion` (DateTime) - Fecha en que se asignó el rol

#### Tabla: `dbo.Modulos`
- `mod_id` (Int) - ID único del módulo (PK)
- `mod_codigo` (VarChar) - Código único del módulo
- `mod_nombre` (VarChar) - Nombre del módulo
- `mod_activo` (Bit) - Indica si el módulo está activo

#### Tabla: `dbo.Acciones`
- `acc_id` (Int) - ID único de la acción (PK)
- `acc_codigo` (VarChar) - Código único de la acción (ej: "CREATE", "UPDATE", "DELETE", "READ")
- `acc_nombre` (VarChar) - Nombre de la acción

#### Tabla: `dbo.RolesPermisos`
- `rolperm_id` (Int) - ID único del permiso (PK)
- `rol_id` (Int) - ID del rol (FK)
- `mod_id` (Int) - ID del módulo (FK)
- `acceso` (Bit) - Indica si el rol tiene acceso al módulo (1 = tiene acceso, 0 = no tiene acceso)

#### Tabla: `dbo.RolesPermisosAcciones`
- `rolpermacc_id` (Int) - ID único de la relación (PK)
- `rolperm_id` (Int) - ID del permiso del rol (FK)
- `acc_id` (Int) - ID de la acción (FK)
- `permitido` (Bit) - Indica si la acción está permitida (1 = permitida, 0 = no permitida)

---

## Flujo de Autenticación

### 1. **Proceso de Login (`POST /auth/login`)**

#### Paso 1: Validación de Entrada
- El cliente envía `usu_cod` (código de usuario) y `usu_pass` (contraseña en texto plano)
- Se valida que ambos campos estén presentes

#### Paso 2: Consulta a Base de Datos
```sql
SELECT u.usu_cod, u.usu_nom, u.usu_pass,
       r.rol_id, r.rol_nombre, u.usu_cambia_pass
FROM dbo.Usuarios u
LEFT JOIN dbo.UsuariosRoles ur ON u.usu_cod = ur.usu_cod
LEFT JOIN dbo.Roles r ON ur.rol_id = r.rol_id
WHERE u.usu_cod = @usu_cod
  AND r.rol_activo = 1
```

**Nota importante:**
- Solo se obtienen roles activos (`rol_activo = 1`)
- Si el usuario no tiene roles activos o no existe, retorna error de credenciales inválidas

#### Paso 3: Validación de Contraseña
- Se usa **bcrypt** para comparar la contraseña proporcionada con el hash almacenado
- `bcrypt.compare(usu_pass, user.usu_pass)` retorna `true` si coinciden

#### Paso 4: Obtención de Permisos
- Se llama a `getUserPermissions(usu_cod)` que ejecuta una consulta compleja:
  - Obtiene todos los módulos y acciones a los que el usuario tiene acceso
  - Considera todos los roles activos del usuario
  - Agrupa por módulo y acción
  - Solo incluye módulos activos (`mod_activo = 1`)

#### Paso 5: Formateo de Permisos
Los permisos se estructuran como un objeto JavaScript:
```javascript
{
  "MODULO_CODIGO": {
    "access": true/false,  // Si tiene acceso al módulo
    "actions": ["CREATE", "UPDATE", "DELETE", "READ"]  // Acciones permitidas
  }
}
```

#### Paso 6: Generación del Token JWT
Se crea un token JWT con los siguientes datos:
- **Payload:**
  - `usu_cod`: Código del usuario
  - `usu_nom`: Nombre del usuario
  - `rol_id`: ID del primer rol encontrado
  - `rol_nombre`: Nombre del rol
- **Configuración:**
  - **Secret**: `process.env.JWT_SECRET` (variable de entorno)
  - **Expiración**: 24 horas (`expiresIn: '24h'`)

#### Paso 7: Respuesta
Se retorna un objeto JSON con:
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "usuario": "USUARIO001",
  "usuario_nombre": "Juan Pérez",
  "rol": "Administrador",
  "cambia_pass": 0,
  "permisos": {
    "MODULO_VENTAS": {
      "access": true,
      "actions": ["CREATE", "READ", "UPDATE"]
    },
    "MODULO_INVENTARIO": {
      "access": true,
      "actions": ["READ"]
    }
  }
}
```

---

### 2. **Middleware de Verificación (`verifyToken`)**

#### Ubicación: `middlewares/authMiddleware.js`

#### Funcionamiento:
1. **Extracción del Token:**
   - El token debe enviarse en el header HTTP: `x-access-token`
   - Ejemplo: `x-access-token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

2. **Validación:**
   - Si no hay token, retorna error 401: "No se proporcionó token de acceso"
   - Si el token es inválido o expirado, retorna error 401: "Token inválido o expirado"

3. **Verificación JWT:**
   - Usa `jwt.verify(token, process.env.JWT_SECRET)`
   - Valida la firma del token
   - Verifica la expiración
   - Si es válido, decodifica el payload

4. **Adjuntar al Request:**
   - Guarda el payload decodificado en `req.user`
   - Permite que los controladores accedan a la información del usuario autenticado

5. **Continuar el Flujo:**
   - Llama a `next()` para continuar con el siguiente middleware/controlador

---

### 3. **Sistema de Permisos**

#### Estructura de Permisos

Los permisos siguen una jerarquía:
1. **Rol** → Asignado a un usuario
2. **Permisos del Rol** → Módulos a los que tiene acceso
3. **Acciones del Rol** → Acciones permitidas dentro de cada módulo

#### Consulta de Permisos

La función `getUserPermissions()` ejecuta:
```sql
SELECT DISTINCT
  m.mod_id,
  m.mod_codigo,
  m.mod_nombre,
  a.acc_id,
  a.acc_codigo,
  a.acc_nombre,
  MAX(CAST(rp.acceso AS INT)) as acceso,
  MAX(CAST(rpa.permitido AS INT)) as permitido
FROM dbo.UsuariosRoles ur
INNER JOIN dbo.Roles r ON ur.rol_id = r.rol_id
INNER JOIN dbo.RolesPermisos rp ON r.rol_id = rp.rol_id
INNER JOIN dbo.Modulos m ON rp.mod_id = m.mod_id
LEFT JOIN dbo.RolesPermisosAcciones rpa ON rp.rolperm_id = rpa.rolperm_id
LEFT JOIN dbo.Acciones a ON rpa.acc_id = a.acc_id
WHERE ur.usu_cod = @usu_cod
  AND r.rol_activo = 1
  AND m.mod_activo = 1
GROUP BY m.mod_id, m.mod_codigo, m.mod_nombre, a.acc_id, a.acc_codigo, a.acc_nombre
ORDER BY m.mod_nombre, a.acc_nombre
```

**Características importantes:**
- Solo considera roles activos
- Solo considera módulos activos
- Agrupa permisos por módulo y acción
- Si un usuario tiene múltiples roles, se combinan todos los permisos

---

### 4. **Gestión de Contraseñas**

#### Encriptación
- **Algoritmo**: bcrypt
- **Salt Rounds**: 10
- **Proceso**: `bcrypt.hash(contraseña, salt)`

#### Validación de Contraseña
- **Requisitos mínimos:**
  - Al menos 8 caracteres
  - Al menos una letra mayúscula
  - Al menos una letra minúscula
  - Al menos un número
  - Al menos un carácter especial: `@$!%*?&.`

#### Expresión Regular:
```javascript
/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&.])[A-Za-z\d@$!%*?&.]{8,}$/
```

#### Cambio de Contraseña por Usuario (`POST /auth/change-password`)
1. Requiere autenticación (middleware `verifyToken`)
2. Valida contraseña actual
3. Valida que la nueva contraseña sea diferente
4. Valida requisitos de seguridad
5. Encripta nueva contraseña
6. Actualiza `usu_pass` y establece `usu_cambia_pass = 0`

#### Cambio de Contraseña por Administrador (`POST /auth/change-password-admin`)
1. Requiere autenticación (middleware `verifyToken`)
2. No requiere contraseña actual
3. Valida requisitos de seguridad
4. Encripta nueva contraseña
5. Actualiza `usu_pass` y establece `usu_cambia_pass = 1` (fuerza cambio)

---

## Endpoints Disponibles

### 1. `POST /auth/login`
**Público** - No requiere autenticación

**Request:**
```json
{
  "usu_cod": "USUARIO001",
  "usu_pass": "Password123!"
}
```

**Response (Éxito):**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "usuario": "USUARIO001",
  "usuario_nombre": "Juan Pérez",
  "rol": "Administrador",
  "cambia_pass": 0,
  "permisos": {
    "MODULO_VENTAS": {
      "access": true,
      "actions": ["CREATE", "READ", "UPDATE"]
    }
  }
}
```

**Response (Error):**
```json
{
  "success": false,
  "message": "Credenciales inválidas"
}
```

---

### 2. `GET /auth/permissions`
**Protegido** - Requiere token JWT en header `x-access-token`

**Headers:**
```
x-access-token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:**
```json
{
  "success": true,
  "permisos": {
    "MODULO_VENTAS": {
      "access": true,
      "actions": ["CREATE", "READ", "UPDATE"]
    }
  }
}
```

**Nota:** Útil para refrescar permisos sin hacer login nuevamente.

---

### 3. `POST /auth/change-password`
**Protegido** - Requiere token JWT

**Request:**
```json
{
  "currentPassword": "Password123!",
  "newPassword": "NewPassword456@"
}
```

**Response (Éxito):**
```json
{
  "success": true,
  "message": "Contraseña actualizada correctamente"
}
```

---

### 4. `POST /auth/change-password-admin`
**Protegido** - Requiere token JWT (solo administradores)

**Request:**
```json
{
  "usu_cod": "USUARIO002",
  "newPassword": "NewPassword456@"
}
```

**Response (Éxito):**
```json
{
  "success": true,
  "message": "Contraseña actualizada correctamente"
}
```

---

## Variables de Entorno Requeridas

```env
JWT_SECRET=tu_secreto_jwt_muy_seguro_aqui
```

**Importante:**
- Debe ser una cadena larga y aleatoria
- No debe compartirse públicamente
- Debe ser el mismo para generar y verificar tokens

---

## Flujo de Uso Típico

1. **Cliente solicita login:**
   ```
   POST /auth/login
   Body: { "usu_cod": "USU001", "usu_pass": "pass123" }
   ```

2. **Servidor valida y retorna token:**
   ```
   Response: { "token": "eyJ...", "permisos": {...} }
   ```

3. **Cliente almacena token y lo usa en requests:**
   ```
   GET /api/recursos
   Headers: x-access-token: eyJ...
   ```

4. **Middleware verifica token:**
   - Si es válido: continúa al controlador
   - Si es inválido: retorna 401

5. **Controlador accede a información del usuario:**
   ```javascript
   const { usu_cod, usu_nom, rol_id } = req.user;
   ```

---

## Consideraciones de Seguridad

1. **Tokens JWT:**
   - Son **stateless**: no se almacenan en el servidor
   - Contienen información del usuario en el payload
   - Deben enviarse por HTTPS en producción
   - Expiran después de 24 horas

2. **Contraseñas:**
   - Nunca se almacenan en texto plano
   - Se usan con bcrypt (hash unidireccional)
   - Se validan con requisitos estrictos

3. **Roles y Permisos:**
   - Los roles inactivos no se consideran
   - Los módulos inactivos no se incluyen
   - Un usuario puede tener múltiples roles

4. **Headers:**
   - El token debe enviarse en `x-access-token`
   - No usar `Authorization: Bearer` (esto es diferente al estándar)

---

## Estructura de Archivos

```
controllers/
  └── authController.js      # Lógica de autenticación
middlewares/
  └── authMiddleware.js      # Middleware de verificación de token
models/
  ├── userModel.js           # Modelos de usuario
  └── userRoleModel.js       # Modelos de roles y permisos
routes/
  └── authRoutes.js          # Definición de rutas de autenticación
```

---

## Notas Adicionales

1. **Campo `usu_cambia_pass`:**
   - `0`: Usuario no necesita cambiar contraseña
   - `1`: Usuario debe cambiar contraseña en próximo login
   - Se actualiza automáticamente cuando el usuario cambia su contraseña

2. **Soporte de Múltiples Roles:**
   - Un usuario puede tener múltiples roles activos
   - Los permisos se combinan de todos los roles
   - El token solo incluye el primer rol encontrado (para display)

3. **Permisos Granulares:**
   - Se puede controlar acceso a nivel de módulo (`access: true/false`)
   - Se puede controlar acciones específicas dentro del módulo (`actions: [...]`)

4. **Manejo de Errores:**
   - Errores de autenticación retornan 401
   - Errores de validación retornan 400
   - Errores del servidor retornan 500
   - Los mensajes de error no exponen información sensible

