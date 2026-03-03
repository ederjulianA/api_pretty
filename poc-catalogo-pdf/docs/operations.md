# Guía de Operaciones y Actualización

Instrucciones para mantener el catálogo actualizado y asegurar que los clientes siempre vean la última versión.

## Actualización Mensual del Catálogo

Cuando se cambian precios o entran productos nuevos, sigue estos pasos:

### 1. Generar el nuevo PDF
```bash
node poc-catalogo-pdf/generate-catalog.js
```
Verifica en la consola que los criterios de éxito (Peso < 25MB, Tiempo < 6min) se cumplan.

### 2. Subida a Azure
1.  Ingresa al Storage Explorer o Portal de Azure.
2.  Sube el nuevo archivo a `prettycontenedor`.
3.  **Recomendación:** Usa nombres con fecha para trazabilidad (ej. `catalogo-2026-04.pdf`).

### 3. Actualización de Enlaces
Si cambiaste el nombre del archivo, debes actualizar el botón de descarga en tu WordPress o cambiar la Regla de Redirección en Cloudflare si usas un enlace amigable como `prettymakeupcol.com/descarga-catalogo`.

## Gestión de Caché (IMPORTANTE)

Como Cloudflare tiene una caché de 1 mes, si subes un archivo con el **mismo nombre** que el anterior para reemplazarlo, los clientes seguirán viendo el viejo durante 30 días.

Para forzar la actualización inmediata:
1.  Entra a **Cloudflare**.
2.  Ve a **Caching** -> **Configuration**.
3.  Haz clic en **Custom Purge**.
4.  Escribe la URL exacta del PDF: `https://catalogos.prettymakeupcol.com/prettycontenedor/catalogo-xxx.pdf`.
5.  Haz clic en **Purge**.

## Buenas Prácticas en Redes Sociales

1.  **No usar links directos de Azure:** Usa siempre el subdominio `catalogos.prettymakeupcol.com`.
2.  **Landing Page:** Siempre dirige el tráfico de Instagram a una página de tu web (ej. `prettymakeupcol.com/catalogo`) donde tengas el Pixel de Meta instalado, y desde ahí ofreces el botón de descarga. Esto permite hacer "Retargeting" a quienes se interesaron en el catálogo.
