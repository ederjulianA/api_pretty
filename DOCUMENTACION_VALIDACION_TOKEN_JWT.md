# Documentación: Validación de Token JWT para Microservicios Spring Boot

## Propósito

Este documento explica **cómo validar tokens JWT** generados por el sistema de autenticación principal (Node.js/Express) en microservicios desarrollados con Spring Boot. El objetivo es proteger endpoints y obtener información del usuario autenticado.

---

## Especificación del Token JWT

### 1. **Algoritmo y Firma**

- **Algoritmo**: `HS256` (HMAC SHA-256)
- **Tipo**: `JWT` (JSON Web Token)
- **Firma**: Se firma con un **secret compartido** almacenado en variable de entorno

### 2. **Estructura del Token**

Un token JWT tiene 3 partes separadas por puntos:

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c3VfY29kIjoiVVNVMTIzIiwidXN1X25vbSI6Ikp1YW4gUMOpcmV6In0.signature
     ↓                                                         ↓                                               ↓
   Header                                                  Payload                                        Signature
```

#### Header (sin decodificar):
```json
{
  "alg": "HS256",
  "typ": "JWT"
}
```

#### Payload (contenido decodificado):
```json
{
  "usu_cod": "USUARIO001",
  "usu_nom": "Juan Pérez",
  "rol_id": 1,
  "rol_nombre": "Administrador",
  "iat": 1234567890,      // Issued at (timestamp)
  "exp": 1234654290       // Expiration (timestamp, 24h después de iat)
}
```

**Campos del Payload:**
- `usu_cod` (String): Código único del usuario - **Requerido para identificar al usuario**
- `usu_nom` (String): Nombre del usuario - **Opcional, solo para display**
- `rol_id` (Number): ID del rol del usuario - **Opcional, información de contexto**
- `rol_nombre` (String): Nombre del rol - **Opcional, información de contexto**
- `iat` (Number): Timestamp de cuando se emitió el token
- `exp` (Number): Timestamp de cuando expira el token (24 horas después de `iat`)

### 3. **Secret Key**

El token se firma y verifica usando un **secret compartido**:

- **Variable de entorno**: `JWT_SECRET`
- **Debe ser el mismo valor** en el servicio que genera tokens y en los microservicios que los validan
- **Recomendación**: Cadena aleatoria de al menos 32 caracteres

**Ejemplo:**
```
JWT_SECRET=mi_secreto_super_seguro_12345678901234567890
```

---

## Ubicación del Token en la Request HTTP

### Header HTTP

El token **NO** se envía en el header estándar `Authorization: Bearer`, sino en un header personalizado:

**Header Name:** `x-access-token`

**Formato:**
```
x-access-token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c3VfY29kIjoiVVNVMTIzIn0.abc123...
```

### Ejemplo de Request Completo

```http
GET /api/endpoint-protegido HTTP/1.1
Host: tu-microservicio.com
x-access-token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c3VfY29kIjoiVVNVMTIzIn0.abc123...
Content-Type: application/json
```

---

## Proceso de Validación (Algoritmo)

### Paso 1: Extraer el Token del Header

1. Leer el valor del header `x-access-token`
2. Si el header no existe o está vacío → **Error 401: "No se proporcionó token de acceso"**
3. Si existe, continuar al siguiente paso

### Paso 2: Validar Formato del Token

1. Verificar que el token tenga exactamente 3 partes separadas por puntos (`.`)
2. Si el formato es incorrecto → **Error 401: "Token inválido o expirado"**

### Paso 3: Verificar Firma del Token

1. Separar el token en sus 3 partes: `[header].[payload].[signature]`
2. Reconstruir la firma esperada usando:
   - Header y Payload originales
   - Secret Key (`JWT_SECRET`)
   - Algoritmo HS256
3. Comparar la firma reconstruida con la firma del token
4. Si las firmas no coinciden → **Error 401: "Token inválido o expirado"**

### Paso 4: Verificar Expiración

1. Decodificar el payload del token
2. Extraer el campo `exp` (expiration timestamp)
3. Comparar con el timestamp actual
4. Si `exp < timestamp actual` → **Error 401: "Token inválido o expirado"**

### Paso 5: Decodificar y Extraer Información

1. Decodificar el payload (Base64 URL-safe)
2. Extraer los campos necesarios:
   - `usu_cod` → **Este es el identificador principal del usuario**
   - `usu_nom` → Nombre (opcional)
   - `rol_id` → ID del rol (opcional)
   - `rol_nombre` → Nombre del rol (opcional)

### Paso 6: Adjuntar al Contexto de la Request

1. Crear un objeto de contexto de usuario con la información decodificada
2. Adjuntar este objeto al request para que los controladores puedan acceder a él
3. Continuar con el flujo normal de la aplicación

---

## Respuestas de Error Estándar

### 1. Token No Proporcionado

**HTTP Status:** `401 Unauthorized`

**Response Body:**
```json
{
  "success": false,
  "message": "No se proporcionó token de acceso"
}
```

**Cuándo ocurre:**
- El header `x-access-token` no está presente en la request
- El header `x-access-token` está presente pero está vacío

---

### 2. Token Inválido o Expirado

**HTTP Status:** `401 Unauthorized`

**Response Body:**
```json
{
  "success": false,
  "message": "Token inválido o expirado"
}
```

**Cuándo ocurre:**
- El token tiene un formato incorrecto (no tiene 3 partes)
- La firma del token no coincide con la esperada (token modificado o secret incorrecto)
- El token ha expirado (`exp < tiempo actual`)
- El algoritmo del token no es HS256
- El token está mal formado o corrupto

---

## Ejemplo de Validación en Spring Boot

### Configuración Necesaria

#### 1. Dependencias (pom.xml)

```xml
<dependency>
    <groupId>io.jsonwebtoken</groupId>
    <artifactId>jjwt-api</artifactId>
    <version>0.11.5</version>
</dependency>
<dependency>
    <groupId>io.jsonwebtoken</groupId>
    <artifactId>jjwt-impl</artifactId>
    <version>0.11.5</version>
    <scope>runtime</scope>
</dependency>
<dependency>
    <groupId>io.jsonwebtoken</groupId>
    <artifactId>jjwt-jackson</artifactId>
    <version>0.11.5</version>
    <scope>runtime</scope>
</dependency>
```

#### 2. Variables de Entorno (application.properties o application.yml)

```properties
# application.properties
jwt.secret=tu_secreto_jwt_muy_seguro_aqui
```

```yaml
# application.yml
jwt:
  secret: tu_secreto_jwt_muy_seguro_aqui
```

**IMPORTANTE:** Este valor debe ser **exactamente el mismo** que `JWT_SECRET` en el servicio de autenticación principal.

---

### Flujo de Validación Esperado

1. **Request llega al microservicio con header `x-access-token`**

2. **Filtro/Interceptor de Spring Boot:**
   - Intercepta todas las requests a endpoints protegidos
   - Extrae el token del header `x-access-token`
   - Valida el token usando el secret compartido

3. **Si el token es válido:**
   - Decodifica el payload
   - Crea un objeto `Authentication` o `Principal` con la información del usuario
   - Adjunta al contexto de seguridad de Spring
   - Permite que el request continúe al controlador

4. **Si el token es inválido:**
   - Retorna HTTP 401 con mensaje de error
   - Detiene el flujo, no permite acceso al endpoint

5. **En el Controlador:**
   - Puede acceder a la información del usuario desde el contexto de seguridad
   - Usa `usu_cod` para identificar al usuario
   - Puede usar información adicional del token (`usu_nom`, `rol_id`, etc.)

---

## Información del Usuario Disponible

Después de validar el token exitosamente, tienes acceso a:

| Campo del Token | Tipo | Descripción | Uso Recomendado |
|----------------|------|-------------|-----------------|
| `usu_cod` | String | Código único del usuario | **Identificar usuario en consultas a BD, logs, auditoría** |
| `usu_nom` | String | Nombre del usuario | Display, logs, auditoría |
| `rol_id` | Number | ID del rol | Contexto, pero **NO confiar para autorización** |
| `rol_nombre` | String | Nombre del rol | Display, contexto |

### ⚠️ Advertencia Importante sobre Autorización

El token JWT **NO contiene información de permisos**. Solo contiene información básica del usuario y su rol.

**Si necesitas verificar permisos específicos:**
- El token solo te da `usu_cod` para identificar al usuario
- Debes consultar la base de datos para obtener permisos del usuario
- Los permisos se obtienen de las tablas: `RolesPermisos`, `RolesPermisosAcciones`, etc.
- **NO confíes en `rol_id` o `rol_nombre` del token para autorización** - estos pueden estar desactualizados

---

## Casos Especiales

### 1. Token Válido pero Usuario Eliminado

**Situación:** El token es válido técnicamente, pero el usuario ya no existe en la base de datos.

**Manejo recomendado:**
- Validar que el `usu_cod` del token existe en la tabla `Usuarios`
- Si no existe, retornar 401 o 403 según tu política de seguridad

### 2. Token Válido pero Rol Desactivado

**Situación:** El token contiene un `rol_id` válido, pero el rol fue desactivado después de emitir el token.

**Manejo recomendado:**
- El token sigue siendo técnicamente válido hasta que expire
- Para verificar permisos actuales, siempre consultar la BD
- El `rol_id` en el token es solo informativo

### 3. Token Casi Expirado

**Situación:** El token es válido pero expira en pocos minutos.

**Manejo recomendado:**
- Validar normalmente, el token sigue siendo válido
- El cliente debería renovar el token llamando a `/auth/login` nuevamente
- No es responsabilidad del microservicio renovar tokens

---

## Testing de Validación

### Ejemplo de Token de Prueba

Puedes generar un token de prueba usando herramientas como:
- https://jwt.io
- Tu servicio de autenticación principal

**Payload de ejemplo:**
```json
{
  "usu_cod": "TEST001",
  "usu_nom": "Usuario de Prueba",
  "rol_id": 1,
  "rol_nombre": "Administrador",
  "iat": 1699123456,
  "exp": 1699209856
}
```

### Casos de Prueba

1. **Token válido:**
   - Debe pasar la validación
   - Debe extraer `usu_cod` correctamente

2. **Token sin header:**
   - Debe retornar 401: "No se proporcionó token de acceso"

3. **Token expirado:**
   - Debe retornar 401: "Token inválido o expirado"

4. **Token con firma incorrecta:**
   - Debe retornar 401: "Token inválido o expirado"

5. **Token mal formado (no tiene 3 partes):**
   - Debe retornar 401: "Token inválido o expirado"

---

## Resumen de Validación

### Checklist para Implementación

- [ ] Extraer token del header `x-access-token`
- [ ] Validar formato (3 partes separadas por `.`)
- [ ] Verificar algoritmo es `HS256`
- [ ] Verificar firma usando `JWT_SECRET`
- [ ] Verificar expiración (`exp` vs tiempo actual)
- [ ] Decodificar payload
- [ ] Extraer `usu_cod` (campo principal para identificar usuario)
- [ ] Adjuntar información al contexto de seguridad
- [ ] Retornar errores HTTP 401 con mensajes apropiados

### Configuración Requerida

- [ ] Variable de entorno `JWT_SECRET` configurada
- [ ] `JWT_SECRET` es **exactamente igual** al del servicio de autenticación
- [ ] Dependencias JWT agregadas al proyecto Spring Boot
- [ ] Filtro/Interceptor configurado para interceptar requests
- [ ] Endpoints protegidos configurados para requerir autenticación

---

## Notas Finales

1. **El token es stateless:**
   - No requiere consulta a base de datos para validar
   - La validación es rápida y eficiente
   - No hay sesión almacenada en el servidor

2. **Tiempo de expiración:**
   - Los tokens expiran después de 24 horas
   - El cliente debe renovar el token haciendo login nuevamente

3. **Secret compartido:**
   - Debe mantenerse seguro y no exponerse
   - Debe ser el mismo en todos los servicios
   - Si cambia, todos los tokens existentes se invalidan

4. **Header personalizado:**
   - Usa `x-access-token` en lugar del estándar `Authorization: Bearer`
   - Esto es específico de esta implementación

5. **Información del usuario:**
   - Usa `usu_cod` como identificador principal
   - Consulta la BD si necesitas permisos o información adicional
   - El token solo contiene información básica para identificación

