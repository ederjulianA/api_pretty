# Comandos PM2

## Iniciar la aplicación
```bash
# Iniciar la aplicación
pm2 start index.js

# Iniciar con un nombre específico
pm2 start index.js --name "api-pretty"

# Iniciar con modo cluster (múltiples instancias)
pm2 start index.js -i max

# Iniciar con variables de entorno
pm2 start index.js --env production
```

## Monitoreo
```bash
# Ver lista de procesos
pm2 list

# Ver detalles de un proceso específico
pm2 show api-pretty

# Monitoreo en tiempo real
pm2 monit

# Ver logs
pm2 logs
pm2 logs api-pretty

# Ver logs con seguimiento en tiempo real
pm2 logs --follow
```

## Gestión de procesos
```bash
# Detener un proceso
pm2 stop api-pretty

# Reiniciar un proceso
pm2 restart api-pretty

# Eliminar un proceso
pm2 delete api-pretty

# Eliminar todos los procesos
pm2 delete all
```

## Reinicio automático
```bash
# Configurar para reinicio automático
pm2 startup

# Guardar la configuración actual
pm2 save

# Restaurar la configuración guardada
pm2 resurrect
```

## Actualización
```bash
# Actualizar PM2
pm2 update

# Actualizar PM2 a la última versión
pm2 update latest
```

## Configuración
```bash
# Crear archivo de configuración
pm2 ecosystem

# Iniciar con archivo de configuración
pm2 start ecosystem.config.js
```

## Ejemplo de ecosystem.config.js
```javascript
module.exports = {
  apps: [{
    name: "api-pretty",
    script: "index.js",
    instances: "max",
    exec_mode: "cluster",
    env: {
      NODE_ENV: "development",
    },
    env_production: {
      NODE_ENV: "production"
    }
  }]
}
```

## Comandos útiles adicionales
```bash
# Ver uso de recursos
pm2 status

# Ver uso de CPU
pm2 top

# Reiniciar todos los procesos
pm2 restart all

# Detener todos los procesos
pm2 stop all

# Ver versión de PM2
pm2 -v
``` 