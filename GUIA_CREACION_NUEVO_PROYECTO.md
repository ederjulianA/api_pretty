# Guía para Crear un Nuevo Proyecto con Arquitectura API Pretty

> **⚠️ IMPORTANTE:** Todo el código mostrado en este documento es **EJEMPLO** y debe ser adaptado según las necesidades específicas del proyecto `api_academia`.

## 📋 Índice
1. [Descripción General](#descripción-general)
2. [Tecnologías y Stack](#tecnologías-y-stack)
3. [Arquitectura del Proyecto](#arquitectura-del-proyecto)
4. [Estructura de Directorios](#estructura-de-directorios)
5. [Configuración Inicial](#configuración-inicial)
6. [Implementación de Principios SOLID](#implementación-de-principios-solid)
7. [Patrones de Desarrollo](#patrones-de-desarrollo)
8. [Configuración de Base de Datos](#configuración-de-base-de-datos)
9. [Sistema de Autenticación](#sistema-de-autenticación)
10. [Estructura de Rutas](#estructura-de-rutas)
11. [Controladores](#controladores)
12. [Modelos](#modelos)
13. [Middleware](#middleware)
14. [Servicios](#servicios)
15. [Jobs Programados](#jobs-programados)
16. [Configuración de Entorno](#configuración-de-entorno)
17. [Despliegue](#despliegue)
18. [Buenas Prácticas](#buenas-prácticas)
19. [Checklist de Implementación](#checklist-de-implementación)

---

## 🎯 Descripción General

Esta guía proporciona las instrucciones paso a paso para crear un nuevo proyecto siguiendo la arquitectura y tecnologías utilizadas en el proyecto API Pretty. El nuevo proyecto mantendrá la misma estructura modular, aplicando los principios SOLID y utilizando las mismas tecnologías de base.

### Características Principales:
- **Arquitectura MVC** con separación clara de responsabilidades
- **Autenticación JWT** con sistema de roles y permisos
- **Base de datos SQL Server** con conexión optimizada
- **API RESTful** con documentación completa
- **Jobs programados** para tareas automáticas
- **Integración con servicios externos** (Cloudinary, etc.)

---

## 🛠 Tecnologías y Stack

### Backend
- **Node.js** (v18+) - Runtime de JavaScript
- **Express.js** (v4.21+) - Framework web
- **SQL Server** - Base de datos principal
- **mssql** (v11.0+) - Driver para SQL Server
- **Sequelize** (v6.37+) - ORM (opcional)

### Autenticación y Seguridad
- **JWT** (jsonwebtoken v9.0+) - Tokens de autenticación
- **bcrypt** (v5.1+) - Encriptación de contraseñas
- **cors** (v2.8+) - Cross-Origin Resource Sharing

### Utilidades y Herramientas
- **dotenv** (v16.4+) - Variables de entorno
- **express-fileupload** (v1.5+) - Manejo de archivos
- **validator** (v13.12+) - Validación de datos

### Servicios Externos
- **Cloudinary** (v2.6+) - Gestión de imágenes

---

## 🏗 Arquitectura del Proyecto

### Patrón MVC (Model-View-Controller)
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│     ROUTES      │───▶│   CONTROLLERS   │───▶│     MODELS      │
│   (Endpoints)   │    │  (Business      │    │  (Data Access)  │
│                 │    │   Logic)        │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   MIDDLEWARE    │    │    SERVICES     │    │   DATABASE      │
│ (Auth, Validation)│    │ (External APIs) │    │   (SQL Server)  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Flujo de Datos
1. **Request** → Routes
2. **Routes** → Middleware (autenticación, validación)
3. **Middleware** → Controllers
4. **Controllers** → Services (lógica de negocio)
5. **Services** → Models (acceso a datos)
6. **Models** → Database
7. **Response** ← Controllers ← Services ← Models

---

## 📁 Estructura de Directorios

```
proyecto-nuevo/
├── config/
│   ├── cloudinary.js
│   └── database.js
├── controllers/
│   ├── authController.js
│   ├── userController.js
│   └── [otroController].js
├── middlewares/
│   ├── auth.js
│   ├── authMiddleware.js
│   └── validation.js
├── models/
│   ├── index.js
│   ├── userModel.js
│   └── [otroModel].js
├── routes/
│   ├── authRoutes.js
│   ├── userRoutes.js
│   └── [otroRoutes].js
├── services/
│   ├── externalApiService.js
│   └── [otroService].js
├── jobs/
│   └── [tareasProgramadas].js
├── utils/
│   ├── helpers.js
│   └── validators.js
├── .env
├── .env.example
├── .gitignore
├── index.js
├── db.js
├── package.json
├── package-lock.json
└── README.md
```

---

## ⚙ Configuración Inicial

### 1. Crear el Proyecto
```bash
# Crear directorio del proyecto
mkdir api_academia
cd api_academia

# Inicializar proyecto Node.js
npm init -y

# Instalar dependencias principales
npm install express cors dotenv jsonwebtoken bcrypt mssql
npm install express-fileupload validator
npm install cloudinary

# Dependencias de desarrollo
npm install --save-dev nodemon
```

> **📝 NOTA:** Los comandos anteriores son ejemplos. Ajusta las dependencias según las necesidades específicas del proyecto.

### 2. Configurar package.json
```json
{
  "name": "api_academia",
  "version": "1.0.0",
  "main": "index.js",
  "type": "module",
  "scripts": {
    "start": "node index.js",
    "dev": "nodemon index.js",
    "test": "echo \"Error: no test specified\" && exit 1"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "description": ""
}
```

> **📝 NOTA:** Este es un ejemplo de configuración básica. Personaliza según las necesidades del proyecto.

### 3. Archivo .env
```env
# Configuración del servidor
PORT=3000
NODE_ENV=development

# Base de datos SQL Server
DB_USER=tu_usuario
DB_PASSWORD=tu_password
DB_SERVER=tu_servidor
DB_DATABASE=tu_base_datos
DB_PORT=1433

# JWT
JWT_SECRET=tu_secreto_jwt_super_seguro

# Cloudinary (opcional)
CLOUDINARY_CLOUD_NAME=tu_cloud_name
CLOUDINARY_API_KEY=tu_api_key
CLOUDINARY_API_SECRET=tu_api_secret

# Otros servicios externos
EXTERNAL_API_URL=https://api.externa.com
EXTERNAL_API_KEY=tu_api_key
```

> **📝 NOTA:** Este es un ejemplo de variables de entorno. Configura con los valores reales de tu proyecto.

---

## 🔧 Implementación de Principios SOLID

### 1. Single Responsibility Principle (SRP)
Cada clase/módulo tiene una sola responsabilidad:

```javascript
// ✅ Correcto - Cada clase tiene una responsabilidad
class UserController {
  async createUser(req, res) { /* solo maneja creación */ }
}

class UserService {
  async validateUserData(data) { /* solo valida datos */ }
}

class UserModel {
  async saveUser(user) { /* solo guarda en BD */ }
}
```

### 2. Open/Closed Principle (OCP)
Extensible sin modificar código existente:

```javascript
// ✅ Correcto - Extensible sin modificar
class BaseController {
  async handle(req, res) {
    // Lógica común
  }
}

class UserController extends BaseController {
  async handle(req, res) {
    // Lógica específica de usuario
    await super.handle(req, res);
  }
}
```

### 3. Liskov Substitution Principle (LSP)
Las clases derivadas pueden sustituir a las base:

```javascript
// ✅ Correcto - Interfaz común
class BaseModel {
  async findById(id) { throw new Error('Not implemented'); }
}

class UserModel extends BaseModel {
  async findById(id) {
    // Implementación específica
    return await this.pool.request()
      .input('id', sql.VarChar, id)
      .query('SELECT * FROM Users WHERE id = @id');
  }
}
```

### 4. Interface Segregation Principle (ISP)
Interfaces específicas en lugar de una general:

```javascript
// ✅ Correcto - Interfaces específicas
class IUserRepository {
  async findById(id) { }
  async save(user) { }
}

class IUserValidator {
  async validate(userData) { }
}

class IUserService {
  async createUser(userData) { }
}
```

### 5. Dependency Inversion Principle (DIP)
Depender de abstracciones, no de implementaciones:

```javascript
// ✅ Correcto - Inyección de dependencias
class UserController {
  constructor(userService, userValidator) {
    this.userService = userService;
    this.userValidator = userValidator;
  }
  
  async createUser(req, res) {
    const validation = await this.userValidator.validate(req.body);
    if (!validation.isValid) {
      return res.status(400).json(validation.errors);
    }
    
    const user = await this.userService.createUser(req.body);
    res.json(user);
  }
}
```

---

## 🎨 Patrones de Desarrollo

### 1. Repository Pattern
```javascript
// models/userRepository.js
class UserRepository {
  constructor(pool) {
    this.pool = pool;
  }
  
  async findById(id) {
    const result = await this.pool.request()
      .input('id', sql.VarChar, id)
      .query('SELECT * FROM Users WHERE id = @id');
    return result.recordset[0];
  }
  
  async save(user) {
    const result = await this.pool.request()
      .input('name', sql.VarChar, user.name)
      .input('email', sql.VarChar, user.email)
      .query('INSERT INTO Users (name, email) OUTPUT INSERTED.id VALUES (@name, @email)');
    return result.recordset[0];
  }
}
```

### 2. Service Layer Pattern
```javascript
// services/userService.js
class UserService {
  constructor(userRepository, userValidator) {
    this.userRepository = userRepository;
    this.userValidator = userValidator;
  }
  
  async createUser(userData) {
    // Validación
    const validation = await this.userValidator.validate(userData);
    if (!validation.isValid) {
      throw new Error(validation.errors.join(', '));
    }
    
    // Lógica de negocio
    const hashedPassword = await bcrypt.hash(userData.password, 10);
    const user = { ...userData, password: hashedPassword };
    
    // Persistencia
    return await this.userRepository.save(user);
  }
}
```

### 3. Factory Pattern
```javascript
// utils/controllerFactory.js
class ControllerFactory {
  static createUserController() {
    const userRepository = new UserRepository(pool);
    const userValidator = new UserValidator();
    const userService = new UserService(userRepository, userValidator);
    return new UserController(userService);
  }
}
```

---

## 🗄 Configuración de Base de Datos

### 1. Archivo db.js
```javascript
// db.js - EJEMPLO de configuración de base de datos
import sql from 'mssql';
import dotenv from 'dotenv';

dotenv.config();

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  port: parseInt(process.env.DB_PORT, 10),
  options: {
    encrypt: false,
    trustServerCertificate: false
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

const poolPromise = new sql.ConnectionPool(config)
  .connect()
  .then(pool => {
    console.log('Conexión a SQL Server establecida.');
    return pool;
  })
  .catch(err => {
    console.error('Error al conectar a SQL Server:', err);
    process.exit(1);
  });

export { sql, poolPromise };
```

> **📝 NOTA:** Este es un ejemplo de configuración de base de datos. Ajusta según tu servidor SQL Server.

### 2. Scripts de Base de Datos
```sql
-- EJEMPLO: Crear tabla de usuarios
CREATE TABLE Users (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE()
);

-- EJEMPLO: Crear tabla de roles
CREATE TABLE Roles (
    id INT IDENTITY(1,1) PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    description VARCHAR(255),
    active BIT DEFAULT 1
);

-- EJEMPLO: Crear tabla de relación usuario-rol
CREATE TABLE UserRoles (
    user_id VARCHAR(50),
    role_id INT,
    FOREIGN KEY (user_id) REFERENCES Users(id),
    FOREIGN KEY (role_id) REFERENCES Roles(id),
    PRIMARY KEY (user_id, role_id)
);
```

> **📝 NOTA:** Estos son ejemplos de tablas. Crea las tablas específicas para tu proyecto `api_academia`.

---

## 🔐 Sistema de Autenticación

### 1. Middleware de Autenticación
```javascript
// middlewares/authMiddleware.js - EJEMPLO de middleware de autenticación
import jwt from 'jsonwebtoken';

const verifyToken = (req, res, next) => {
  const token = req.headers['x-access-token'] || req.headers['authorization'];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "No se proporcionó token de acceso"
    });
  }

  try {
    const tokenClean = token.replace('Bearer ', '');
    const decoded = jwt.verify(tokenClean, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Token inválido o expirado"
    });
  }
};

const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Acceso no autorizado"
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "No tienes permisos para esta acción"
      });
    }

    next();
  };
};

export { verifyToken, requireRole };
```

> **📝 NOTA:** Este es un ejemplo de middleware de autenticación. Adapta según tus necesidades de seguridad.

### 2. Controlador de Autenticación
```javascript
// controllers/authController.js - EJEMPLO de controlador de autenticación
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { sql, poolPromise } from '../db.js';

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Se requieren email y contraseña"
      });
    }

    const pool = await poolPromise;
    const result = await pool.request()
      .input('email', sql.VarChar, email)
      .query(`
        SELECT u.id, u.name, u.email, u.password, r.name as role
        FROM Users u
        LEFT JOIN UserRoles ur ON u.id = ur.user_id
        LEFT JOIN Roles r ON ur.role_id = r.id
        WHERE u.email = @email AND r.active = 1
      `);

    if (result.recordset.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Credenciales inválidas"
      });
    }

    const user = result.recordset[0];
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(401).json({
        success: false,
        message: "Credenciales inválidas"
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });

  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({
      success: false,
      message: "Error interno del servidor"
    });
  }
};

export { login };
```

> **📝 NOTA:** Este es un ejemplo de controlador de autenticación. Adapta la lógica según tus tablas y campos específicos.

---

## 🛣 Estructura de Rutas

### 1. Archivo Principal de Rutas
```javascript
// routes/index.js - EJEMPLO de configuración de rutas
import express from 'express';
import authRoutes from './authRoutes.js';
import userRoutes from './userRoutes.js';
import productRoutes from './productRoutes.js';

const router = express.Router();

// Rutas de autenticación (públicas)
router.use('/auth', authRoutes);

// Rutas protegidas
router.use('/users', userRoutes);
router.use('/products', productRoutes);

export default router;
```

> **📝 NOTA:** Este es un ejemplo de configuración de rutas. Crea las rutas específicas para tu proyecto `api_academia`.

### 2. Ejemplo de Rutas de Usuario
```javascript
// routes/userRoutes.js - EJEMPLO de rutas de usuario
import express from 'express';
import { verifyToken, requireRole } from '../middlewares/authMiddleware.js';
import { 
  getAllUsers, 
  getUserById, 
  createUser, 
  updateUser, 
  deleteUser 
} from '../controllers/userController.js';

const router = express.Router();

// Aplicar middleware de autenticación a todas las rutas
router.use(verifyToken);

// Rutas
router.get('/', requireRole(['admin']), getAllUsers);
router.get('/:id', getUserById);
router.post('/', requireRole(['admin']), createUser);
router.put('/:id', requireRole(['admin']), updateUser);
router.delete('/:id', requireRole(['admin']), deleteUser);

export default router;
```

> **📝 NOTA:** Este es un ejemplo de rutas de usuario. Crea las rutas específicas para tu proyecto `api_academia`.

---

## 🎮 Controladores

### 1. Estructura Base del Controlador
```javascript
// controllers/baseController.js - EJEMPLO de controlador base
class BaseController {
  constructor(service) {
    this.service = service;
  }

  async handleRequest(req, res, operation) {
    try {
      const result = await operation(req, res);
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Error en controlador:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error interno del servidor'
      });
    }
  }

  async getAll(req, res) {
    await this.handleRequest(req, res, async () => {
      return await this.service.getAll();
    });
  }

  async getById(req, res) {
    await this.handleRequest(req, res, async () => {
      const { id } = req.params;
      return await this.service.getById(id);
    });
  }

  async create(req, res) {
    await this.handleRequest(req, res, async () => {
      return await this.service.create(req.body);
    });
  }

  async update(req, res) {
    await this.handleRequest(req, res, async () => {
      const { id } = req.params;
      return await this.service.update(id, req.body);
    });
  }

  async delete(req, res) {
    await this.handleRequest(req, res, async () => {
      const { id } = req.params;
      return await this.service.delete(id);
    });
  }
}

export default BaseController;
```

> **📝 NOTA:** Este es un ejemplo de controlador base. Extiende y adapta según las necesidades específicas de tu proyecto.

### 2. Controlador Específico
```javascript
// controllers/userController.js - EJEMPLO de controlador específico
import BaseController from './baseController.js';

class UserController extends BaseController {
  constructor(userService) {
    super(userService);
  }

  // Métodos específicos del usuario
  async changePassword(req, res) {
    await this.handleRequest(req, res, async () => {
      const { currentPassword, newPassword } = req.body;
      const userId = req.user.id;
      return await this.service.changePassword(userId, currentPassword, newPassword);
    });
  }

  async getProfile(req, res) {
    await this.handleRequest(req, res, async () => {
      const userId = req.user.id;
      return await this.service.getById(userId);
    });
  }
}

export default UserController;
```

> **📝 NOTA:** Este es un ejemplo de controlador específico. Crea controladores específicos para las entidades de tu proyecto `api_academia`.

---

## 📊 Modelos

### 1. Modelo Base
```javascript
// models/baseModel.js - EJEMPLO de modelo base
class BaseModel {
  constructor(pool, tableName) {
    this.pool = pool;
    this.tableName = tableName;
  }

  async findAll() {
    const result = await this.pool.request()
      .query(`SELECT * FROM ${this.tableName}`);
    return result.recordset;
  }

  async findById(id) {
    const result = await this.pool.request()
      .input('id', sql.VarChar, id)
      .query(`SELECT * FROM ${this.tableName} WHERE id = @id`);
    return result.recordset[0];
  }

  async create(data) {
    const columns = Object.keys(data).join(', ');
    const values = Object.keys(data).map(key => `@${key}`).join(', ');
    
    const request = this.pool.request();
    Object.keys(data).forEach(key => {
      request.input(key, sql.VarChar, data[key]);
    });

    const result = await request.query(`
      INSERT INTO ${this.tableName} (${columns}) 
      OUTPUT INSERTED.id 
      VALUES (${values})
    `);
    
    return result.recordset[0];
  }

  async update(id, data) {
    const setClause = Object.keys(data)
      .map(key => `${key} = @${key}`)
      .join(', ');

    const request = this.pool.request()
      .input('id', sql.VarChar, id);
    
    Object.keys(data).forEach(key => {
      request.input(key, sql.VarChar, data[key]);
    });

    const result = await request.query(`
      UPDATE ${this.tableName} 
      SET ${setClause} 
      WHERE id = @id
    `);
    
    return result.rowsAffected[0] > 0;
  }

  async delete(id) {
    const result = await this.pool.request()
      .input('id', sql.VarChar, id)
      .query(`DELETE FROM ${this.tableName} WHERE id = @id`);
    
    return result.rowsAffected[0] > 0;
  }
}

export default BaseModel;
```

> **📝 NOTA:** Este es un ejemplo de modelo base. Crea modelos específicos para las entidades de tu proyecto `api_academia`.

### 2. Modelo Específico
```javascript
// models/userModel.js - EJEMPLO de modelo específico
import BaseModel from './baseModel.js';
import { sql } from '../db.js';

class UserModel extends BaseModel {
  constructor(pool) {
    super(pool, 'Users');
  }

  async findByEmail(email) {
    const result = await this.pool.request()
      .input('email', sql.VarChar, email)
      .query('SELECT * FROM Users WHERE email = @email');
    return result.recordset[0];
  }

  async findWithRole(id) {
    const result = await this.pool.request()
      .input('id', sql.VarChar, id)
      .query(`
        SELECT u.*, r.name as role
        FROM Users u
        LEFT JOIN UserRoles ur ON u.id = ur.user_id
        LEFT JOIN Roles r ON ur.role_id = r.id
        WHERE u.id = @id
      `);
    return result.recordset[0];
  }

  async updatePassword(id, hashedPassword) {
    const result = await this.pool.request()
      .input('id', sql.VarChar, id)
      .input('password', sql.VarChar, hashedPassword)
      .query('UPDATE Users SET password = @password WHERE id = @id');
    
    return result.rowsAffected[0] > 0;
  }
}

export default UserModel;
```

> **📝 NOTA:** Este es un ejemplo de modelo específico. Crea modelos específicos para las entidades de tu proyecto `api_academia`.

---

## 🔧 Middleware

### 1. Middleware de Validación
```javascript
// middlewares/validation.js - EJEMPLO de middleware de validación
import { body, validationResult } from 'express-validator';

const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Datos de entrada inválidos",
      errors: errors.array()
    });
  }
  next();
};

const userValidationRules = [
  body('name').notEmpty().withMessage('El nombre es requerido'),
  body('email').isEmail().withMessage('Email inválido'),
  body('password').isLength({ min: 6 }).withMessage('La contraseña debe tener al menos 6 caracteres')
];

const loginValidationRules = [
  body('email').isEmail().withMessage('Email inválido'),
  body('password').notEmpty().withMessage('La contraseña es requerida')
];

export { validateRequest, userValidationRules, loginValidationRules };
```

> **📝 NOTA:** Este es un ejemplo de middleware de validación. Crea reglas de validación específicas para tu proyecto `api_academia`.



---

## 🔌 Servicios

### 1. Servicio Base
```javascript
// services/baseService.js - EJEMPLO de servicio base
class BaseService {
  constructor(repository) {
    this.repository = repository;
  }

  async getAll() {
    return await this.repository.findAll();
  }

  async getById(id) {
    const item = await this.repository.findById(id);
    if (!item) {
      throw new Error('Elemento no encontrado');
    }
    return item;
  }

  async create(data) {
    return await this.repository.create(data);
  }

  async update(id, data) {
    const exists = await this.repository.findById(id);
    if (!exists) {
      throw new Error('Elemento no encontrado');
    }
    return await this.repository.update(id, data);
  }

  async delete(id) {
    const exists = await this.repository.findById(id);
    if (!exists) {
      throw new Error('Elemento no encontrado');
    }
    return await this.repository.delete(id);
  }
}

export default BaseService;
```

> **📝 NOTA:** Este es un ejemplo de servicio base. Crea servicios específicos para la lógica de negocio de tu proyecto `api_academia`.

### 2. Servicio de Usuario
```javascript
// services/userService.js - EJEMPLO de servicio específico
import BaseService from './baseService.js';
import bcrypt from 'bcrypt';

class UserService extends BaseService {
  constructor(userRepository, userValidator) {
    super(userRepository);
    this.userValidator = userValidator;
  }

  async createUser(userData) {
    // Validación
    const validation = await this.userValidator.validate(userData);
    if (!validation.isValid) {
      throw new Error(validation.errors.join(', '));
    }

    // Verificar email único
    const existingUser = await this.repository.findByEmail(userData.email);
    if (existingUser) {
      throw new Error('El email ya está registrado');
    }

    // Encriptar contraseña
    const hashedPassword = await bcrypt.hash(userData.password, 10);
    const userToCreate = { ...userData, password: hashedPassword };

    // Crear usuario
    return await this.repository.create(userToCreate);
  }

  async changePassword(userId, currentPassword, newPassword) {
    const user = await this.repository.findById(userId);
    if (!user) {
      throw new Error('Usuario no encontrado');
    }

    // Verificar contraseña actual
    const isValidPassword = await bcrypt.compare(currentPassword, user.password);
    if (!isValidPassword) {
      throw new Error('Contraseña actual incorrecta');
    }

    // Encriptar nueva contraseña
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    
    // Actualizar contraseña
    return await this.repository.updatePassword(userId, hashedNewPassword);
  }
}

export default UserService;
```

> **📝 NOTA:** Este es un ejemplo de servicio específico. Crea servicios específicos para la lógica de negocio de tu proyecto `api_academia`.

---

## ⏰ Jobs Programados

### 1. Configuración de Jobs
```javascript
// jobs/scheduler.js - EJEMPLO de configuración de jobs programados
import cron from 'node-cron';

class JobScheduler {
  constructor() {
    this.jobs = [];
  }

  addJob(name, schedule, task) {
    const job = cron.schedule(schedule, async () => {
      try {
        console.log(`Ejecutando job: ${name}`);
        await task();
        console.log(`Job completado: ${name}`);
      } catch (error) {
        console.error(`Error en job ${name}:`, error);
      }
    });

    this.jobs.push({ name, job });
    console.log(`Job programado: ${name} - ${schedule}`);
  }

  startAll() {
    this.jobs.forEach(({ name, job }) => {
      job.start();
      console.log(`Job iniciado: ${name}`);
    });
  }

  stopAll() {
    this.jobs.forEach(({ name, job }) => {
      job.stop();
      console.log(`Job detenido: ${name}`);
    });
  }
}

export default JobScheduler;
```

> **📝 NOTA:** Este es un ejemplo de configuración de jobs. Crea jobs específicos para las tareas automáticas de tu proyecto `api_academia`.

### 2. Ejemplo de Job
```javascript
// jobs/cleanupJob.js - EJEMPLO de job programado
import { sql, poolPromise } from '../db.js';

const cleanupOldRecords = async () => {
  try {
    const pool = await poolPromise;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await pool.request()
      .input('date', sql.DateTime, thirtyDaysAgo)
      .query('DELETE FROM OldRecords WHERE created_at < @date');

    console.log(`Limpieza completada: ${result.rowsAffected[0]} registros eliminados`);
  } catch (error) {
    console.error('Error en limpieza de registros:', error);
  }
};

export { cleanupOldRecords };
```

> **📝 NOTA:** Este es un ejemplo de job programado. Crea jobs específicos para las tareas automáticas de tu proyecto `api_academia`.

---

## ⚙ Configuración de Entorno

### 1. Archivo Principal (index.js)
```javascript
// index.js - EJEMPLO de archivo principal de la aplicación
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fileUpload from 'express-fileupload';
import routes from './routes/index.js';
import JobScheduler from './jobs/scheduler.js';
import { cleanupOldRecords } from './jobs/cleanupJob.js';

dotenv.config();

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(fileUpload({
  createParentPath: true,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB
  },
}));

// Rutas
app.use('/api', routes);

// Ruta de salud
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
});

// Manejo de errores global
app.use((err, req, res, next) => {
  console.error('Error no manejado:', err);
  res.status(500).json({
    success: false,
    message: 'Error interno del servidor'
  });
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor ejecutándose en puerto ${PORT}`);
  console.log(`Ambiente: ${process.env.NODE_ENV}`);
});

// Iniciar jobs programados
const scheduler = new JobScheduler();
scheduler.addJob('cleanup-records', '0 2 * * *', cleanupOldRecords); // Diario a las 2 AM
scheduler.startAll();

export default app;
```

> **📝 NOTA:** Este es un ejemplo de archivo principal. Adapta según las necesidades específicas de tu proyecto `api_academia`.



---

## 🚀 Despliegue

### 1. Configuración de PM2
```javascript
// ecosystem.config.js - EJEMPLO de configuración de PM2
module.exports = {
  apps: [{
    name: 'api_academia',
    script: 'index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'development',
      PORT: 3000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },

    time: true
  }]
};
```

> **📝 NOTA:** Este es un ejemplo de configuración de PM2. Ajusta según las necesidades de tu servidor Windows.

### 2. Scripts de Despliegue para Windows
```batch
@echo off
REM deploy.bat - EJEMPLO de script de despliegue para Windows

echo Iniciando despliegue...

REM Instalar dependencias
npm install

REM Crear directorio de logs si no existe
if not exist "logs" mkdir logs

REM Ejecutar migraciones (si aplica)
REM npm run migrate

REM Iniciar aplicación con PM2
pm2 start ecosystem.config.js --env production

echo Despliegue completado
pause
```

> **📝 NOTA:** Este es un ejemplo de script de despliegue. Adapta según tu configuración específica de servidor Windows.

### 3. Scripts de PowerShell (Alternativo)
```powershell
# deploy.ps1 - EJEMPLO de script de despliegue en PowerShell

Write-Host "Iniciando despliegue..." -ForegroundColor Green

# Instalar dependencias
npm install

# Crear directorio de logs si no existe
if (!(Test-Path "logs")) {
    New-Item -ItemType Directory -Name "logs"
}

# Ejecutar migraciones (si aplica)
# npm run migrate

# Iniciar aplicación con PM2
pm2 start ecosystem.config.js --env production

Write-Host "Despliegue completado" -ForegroundColor Green
```

> **📝 NOTA:** Este es un ejemplo de script de despliegue en PowerShell. Adapta según tu configuración específica de servidor Windows.

---

## 📋 Buenas Prácticas

### 1. Manejo de Errores
```javascript
// utils/errorHandler.js - EJEMPLO de manejo de errores
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

const handleError = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (process.env.NODE_ENV === 'development') {
    res.status(err.statusCode).json({
      status: err.status,
      error: err,
      message: err.message,
      stack: err.stack
    });
  } else {
    // Error en producción
    if (err.isOperational) {
      res.status(err.statusCode).json({
        status: err.status,
        message: err.message
      });
    } else {
      // Error de programación
      console.error('ERROR 💥', err);
      res.status(500).json({
        status: 'error',
        message: 'Algo salió mal'
      });
    }
  }
};

export { AppError, handleError };
```

> **📝 NOTA:** Este es un ejemplo de manejo de errores. Adapta según las necesidades específicas de tu proyecto.

### 2. Validación de Datos
```javascript
// utils/validators.js - EJEMPLO de validación de datos
import validator from 'validator';

export const validateEmail = (email) => {
  return validator.isEmail(email);
};

export const validatePassword = (password) => {
  const minLength = 8;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecialChar = /[@$!%*?&]/.test(password);

  return {
    isValid: password.length >= minLength && hasUpperCase && hasLowerCase && hasNumbers && hasSpecialChar,
    errors: []
  };
};

export const sanitizeInput = (input) => {
  return validator.escape(input);
};
```

> **📝 NOTA:** Este es un ejemplo de validación de datos. Crea validaciones específicas para tu proyecto `api_academia`.

### 3. Respuestas Estandarizadas
```javascript
// utils/responseHandler.js - EJEMPLO de respuestas estandarizadas
export const successResponse = (res, data, message = 'Operación exitosa') => {
  res.json({
    success: true,
    message,
    data
  });
};

export const errorResponse = (res, message, statusCode = 400) => {
  res.status(statusCode).json({
    success: false,
    message
  });
};

export const paginatedResponse = (res, data, page, limit, total) => {
  res.json({
    success: true,
    data,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit)
    }
  });
};
```

> **📝 NOTA:** Este es un ejemplo de respuestas estandarizadas. Adapta según las necesidades específicas de tu proyecto.

---

## ✅ Checklist de Implementación

### Configuración Inicial
- [ ] Crear estructura de directorios
- [ ] Inicializar proyecto Node.js
- [ ] Instalar dependencias
- [ ] Configurar variables de entorno
- [ ] Crear archivo principal (index.js)

### Base de Datos
- [ ] Configurar conexión SQL Server
- [ ] Crear scripts de base de datos
- [ ] Implementar modelos base
- [ ] Configurar pool de conexiones

### Autenticación
- [ ] Implementar middleware de autenticación
- [ ] Crear controlador de autenticación
- [ ] Configurar JWT
- [ ] Implementar encriptación de contraseñas

### Estructura MVC
- [ ] Crear controladores base
- [ ] Implementar modelos específicos
- [ ] Configurar rutas
- [ ] Implementar servicios

### Middleware
- [ ] Middleware de autenticación
- [ ] Middleware de validación
- [ ] Middleware de logging
- [ ] Middleware de manejo de errores

### Funcionalidades Específicas
- [ ] CRUD de usuarios
- [ ] Sistema de roles y permisos
- [ ] Validación de datos
- [ ] Manejo de archivos

### Jobs y Tareas
- [ ] Configurar scheduler
- [ ] Implementar jobs programados

### Despliegue
- [ ] Configurar PM2
- [ ] Crear scripts de despliegue para Windows
- [ ] Configurar servidor Windows
- [ ] Documentar APIs

### Testing y Calidad
- [ ] Implementar validaciones
- [ ] Manejo de errores
- [ ] Documentación de código

---

## 📚 Recursos Adicionales

### Documentación Recomendada
- [Express.js Documentation](https://expressjs.com/)
- [SQL Server Documentation](https://docs.microsoft.com/en-us/sql/)
- [JWT.io](https://jwt.io/)
- [bcrypt Documentation](https://github.com/dcodeIO/bcrypt.js)

### Herramientas Útiles
- **Postman** - Para pruebas de API
- **PM2** - Gestión de procesos
- **Validator.js** - Validación de datos

### Patrones de Diseño
- **Repository Pattern** - Abstracción de acceso a datos
- **Service Layer** - Lógica de negocio
- **Factory Pattern** - Creación de objetos
- **Dependency Injection** - Inversión de dependencias

---

## 🎯 Conclusión

Esta guía proporciona una base sólida para crear nuevos proyectos siguiendo la arquitectura y tecnologías del proyecto API Pretty. Al seguir estos principios y patrones, se asegura:

1. **Escalabilidad** - Código modular y extensible
2. **Mantenibilidad** - Separación clara de responsabilidades
3. **Seguridad** - Autenticación y validación robustas
4. **Rendimiento** - Conexiones optimizadas y caching
5. **Calidad** - Principios SOLID y buenas prácticas

Recuerda adaptar esta guía según las necesidades específicas de tu nuevo proyecto, manteniendo siempre los principios de desarrollo limpio y arquitectura sólida. 