# Guía de Configuración de Infraestructura

Este documento detalla los pasos realizados para configurar la red de distribución (CDN) del catálogo.

## 1. Azure Blob Storage

### Configuración del Contenedor
*   **Nombre:** `prettycontenedor`
*   **Nivel de acceso:** `Blob` (Lectura anónima para blobs solamente).
*   **URL de Origen:** `https://prettycol.blob.core.windows.net/prettycontenedor/`

### Dominio Personalizado
*   **Dominio:** `catalogos.prettymakeupcol.com`
*   **Validación:** Se requiere que el Proxy de Cloudflare esté APAGADO (nube gris) durante la vinculación inicial en el portal de Azure.

## 2. Cloudflare (DNS)

*   **Tipo:** `CNAME`
*   **Nombre:** `catalogos`
*   **Contenido:** `prettycol.blob.core.windows.net`
*   **Proxy Status:** `Proxied` (Nube Naranja) - ACTIVADO después de la validación en Azure.

## 3. Reglas de Cloudflare (Performance y Seguridad)

### Regla de Caché (Cache Rule)
*   **Filtro:** `Hostname == catalogos.prettymakeupcol.com`
*   **Acción:** Elegible para caché.
*   **Edge TTL:** "Ignorar encabezado de control de caché y usar este TTL" -> **1 mes**.
*   **Objetivo:** Evitar que cada descarga consuma ancho de banda de Azure y acelerar la entrega.

### Regla de Página (Page Rule - SSL)
*   **URL:** `catalogos.prettymakeupcol.com/*`
*   **Ajuste:** `SSL: Completo (Full)`
*   **Razón:** Azure requiere HTTPS estricto. Cloudflare debe hablar con Azure vía puerto 443 incluso si el origen no tiene un certificado de tercero (Azure usa el suyo interno).

## Solución de Problemas Comunes

### Error: `AccountRequiresHttps`
*   **Causa:** Cloudflare intenta conectar por HTTP (puerto 80).
*   **Solución:** Asegurar que la Page Rule de SSL esté en modo "Completo".

### Error: `InvalidUri`
*   **Causa:** Azure no reconoce el dominio `catalogos...` porque no se ha guardado en la sección de "Custom Domains" de la cuenta de almacenamiento.
*   **Solución:** Vincular el dominio en el Portal de Azure (Paso 1. Dominio Personalizado).
