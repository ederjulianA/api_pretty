# 🚀 Guía de Instalación - API Pretty en MacBook

## 📋 Requisitos del Sistema

### 1. Node.js y npm
- **Versión mínima**: Node.js 14+ (recomendado: LTS más reciente)
- **Instalación con Homebrew**:
  ```bash
  brew install node
  ```
- **O descarga directa**: https://nodejs.org/ (versión LTS)
- **Verificar instalación**:
  ```bash
  node --version
  npm --version
  ```

### 2. Git
- Generalmente viene preinstalado en macOS
- **Verificar**:
  ```bash
  git --version
  ```
- **Si no está instalado**:
  ```bash
  xcode-select --install
  ```

### 3. Herramientas Adicionales (Opcional pero Recomendado)

#### PM2 (Gestor de Procesos para Producción)
```bash
npm install -g pm2
```

#### Nodemon (Desarrollo - Auto-reload)
```bash
npm install -g nodemon
```

---

## 🔧 Configuración del Proyecto

### Paso 1: Clonar/Descargar el Repositorio
```bash
cd ~/Developer/GitHub
git clone [URL_DEL_REPOSITORIO]
cd api_pretty
```

### Paso 2: Instalar Dependencias
```bash
npm install
```

Esto instalará todas las dependencias listadas en `package.json`:
- Express.js
- Sequelize
- mssql (SQL Server)
- JWT
- bcrypt
- Cloudinary
- WooCommerce REST API
- Y otras dependencias...

### Paso 3: Configurar Variables de Entorno

Crear un archivo `.env` en la raíz del proyecto con las siguientes variables:

```env
# ============================================
# CONFIGURACIÓN DEL SERVIDOR
# ============================================
PORT=3000
NODE_ENV=development

# ============================================
# BASE DE DATOS SQL SERVER
# ============================================
DB_USER=tu_usuario_sql_server
DB_PASSWORD=tu_password_sql_server
DB_SERVER=tu_servidor_sql_server
DB_DATABASE=tu_base_de_datos
DB_PORT=1433

# ============================================
# AUTENTICACIÓN JWT
# ============================================
JWT_SECRET=tu_secreto_jwt_muy_seguro_y_largo_aqui

# ============================================
# CLOUDINARY (Gestión de Imágenes)
# ============================================
CLOUDINARY_CLOUD_NAME=tu_cloud_name
CLOUDINARY_API_KEY=tu_api_key
CLOUDINARY_API_SECRET=tu_api_secret

# ============================================
# WOOCOMMERCE API
# ============================================
WC_URL=https://tu-tienda.com
WC_CONSUMER_KEY=tu_consumer_key
WC_CONSUMER_SECRET=tu_consumer_secret

# ============================================
# OTRAS CONFIGURACIONES (si aplican)
# ============================================
# Agregar otras variables según sea necesario
```

**⚠️ IMPORTANTE**: 
- No compartas el archivo `.env` públicamente
- Asegúrate de que `.env` esté en `.gitignore`
- Usa valores seguros, especialmente para `JWT_SECRET`

### Paso 4: Verificar Configuración de Base de Datos

Asegúrate de tener acceso a SQL Server:
- **Local**: SQL Server instalado en tu Mac (requiere Docker o máquina virtual)
- **Remoto**: Acceso a servidor SQL Server remoto

**Nota**: En macOS, SQL Server no se ejecuta nativamente. Opciones:
1. Usar Docker con SQL Server
2. Conectarse a un servidor SQL Server remoto
3. Usar Azure SQL Database

---

## 🚀 Ejecutar el Proyecto

### Modo Desarrollo
```bash
# Si tienes nodemon instalado globalmente
nodemon index.js

# O directamente con Node.js
node index.js
```

### Modo Producción con PM2
```bash
pm2 start index.js --name api_pretty
pm2 save
pm2 startup
```

### Verificar que el Servidor Está Corriendo
Abre tu navegador o usa curl:
```bash
curl http://localhost:3000
```

Deberías ver: `API Working`

---

## 📦 Dependencias del Proyecto

### Dependencias Principales
- **express**: Framework web
- **mssql**: Cliente SQL Server
- **sequelize**: ORM para bases de datos
- **jsonwebtoken**: Autenticación JWT
- **bcrypt**: Encriptación de contraseñas
- **cloudinary**: Gestión de imágenes
- **@woocommerce/woocommerce-rest-api**: Integración WooCommerce
- **cors**: Manejo de CORS
- **dotenv**: Variables de entorno
- **express-fileupload**: Manejo de archivos
- **validator**: Validación de datos
- **winston**: Sistema de logging
- **winston-loki**: Integración con Loki para logs

### Dependencias de Desarrollo
- **tailwindcss**: Framework CSS (si se usa en frontend)
- **autoprefixer**: Procesador CSS
- **postcss**: Procesador CSS

---

## ✅ Checklist de Instalación

- [ ] Node.js instalado (versión 14+)
- [ ] npm instalado
- [ ] Git instalado
- [ ] Repositorio clonado/descargado
- [ ] Dependencias instaladas (`npm install`)
- [ ] Archivo `.env` creado con todas las variables
- [ ] Acceso a SQL Server configurado
- [ ] Credenciales de WooCommerce configuradas (si aplica)
- [ ] Credenciales de Cloudinary configuradas (si aplica)
- [ ] Servidor ejecutándose correctamente

---

## 🔍 Solución de Problemas Comunes

### Error: "Cannot find module"
```bash
# Reinstalar dependencias
rm -rf node_modules package-lock.json
npm install
```

### Error de conexión a SQL Server
- Verifica que las credenciales en `.env` sean correctas
- Verifica que el servidor SQL Server esté accesible
- Verifica el firewall y la red

### Error: "Port 3000 already in use"
```bash
# Cambiar el puerto en .env o matar el proceso
lsof -ti:3000 | xargs kill -9
```

### Error con ES Modules
Asegúrate de que `package.json` tenga:
```json
{
  "type": "module"
}
```

---

## 📚 Recursos Adicionales

- Documentación del proyecto: Ver archivos `.md` en el repositorio
- Postman Collection: `api_pretty.postman_collection.json`
- Documentación de autenticación: `DOCUMENTACION_SISTEMA_AUTENTICACION.md`

---

## 🆘 Soporte

Si encuentras problemas:
1. Revisa los logs del servidor
2. Verifica las variables de entorno
3. Consulta la documentación del proyecto
4. Revisa los archivos de diagnóstico en `/routes/diagnosticRoutes.js`

