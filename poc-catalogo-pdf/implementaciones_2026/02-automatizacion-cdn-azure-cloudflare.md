# Análisis: Automatización de Distribución del Catálogo PDF (Azure + Cloudflare)

Este documento detalla la propuesta técnica para automatizar el ciclo de vida del catálogo PDF de Pretty Makeup Colombia. El objetivo es lograr una "Actualización de un solo clic" donde la ejecución del script generador también se encargue de subir el archivo a la nube y asegurar que los clientes vean la última versión instantáneamente.

## 🎯 Objetivo de la Automatización

Actualmente, el comando `node poc-catalogo-pdf/generate-catalog.js` genera un archivo local (ej. `output/catalogo-2026-03-03T...pdf`). El proceso manual posterior requiere:
1. Abrir el portal de Azure.
2. Subir el archivo al contenedor `prettycontenedor`.
3. Purgar la caché en Cloudflare (si se usa nombre fijo) o actualizar los links en WordPress (si se usa nombre dinámico).

La automatización busca eliminar los pasos 1, 2 y 3, integrándolos al final de `generate-catalog.js`.

---

## 🏗️ Arquitectura Propuesta ("Estrategia de Nombre Fijo")

Para maximizar la eficiencia y tener un solo enlace en todo momento (WordPress, Linktree, Instagram), se recomienda la "Estrategia de Nombre Fijo".

*   **Enlace Público Permanente:** `https://catalogos.prettymakeupcol.com/prettycontenedor/catalogo-mayorista.pdf`
*   **Nombre del Archivo en Azure:** Omitiremos la fecha en el nombre final público (solo se mantiene internamente para backups) y lo llamaremos siempre `catalogo-mayorista.pdf`.

### Pre-requisito: Verificar Dominio Custom en Cloudflare

Antes de implementar, se debe verificar que:
*   El dominio `catalogos.prettymakeupcol.com` esté correctamente configurado como proxy en Cloudflare apuntando al blob storage de Azure.
*   El contenedor `prettycontenedor` tenga acceso público de lectura habilitado (o que Cloudflare actúe como proxy autenticado).
*   Las reglas de caché en Cloudflare estén configuradas específicamente para este path.

---

## 🔧 Detalles de la Implementación (Qué debemos cambiar)

Para lograr esto, necesitamos agregar dos nuevos módulos al script actual:

### 1. Módulo de Subida (Azure Blob Storage)
Se integrará el SDK oficial de Microsoft para Node.js.

*   **Dependencia a instalar:** `@azure/storage-blob`
*   **Variables de Entorno (.env):**
    *   `AZURE_STORAGE_CONNECTION_STRING`: Cadena de conexión de la cuenta de Azure.
    *   `AZURE_STORAGE_CONTAINER_NAME`: `prettycontenedor`
*   **Comportamiento en Script:**
    1. Una vez guardado el PDF local, el script **valida** que el archivo exista y tenga tamaño > 0 (y opcionalmente < 30MB para evitar subir archivos corruptos).
    2. Se conecta a Azure y lo sube con el nombre `catalogo-mayorista.pdf`.
    3. **Se configuran los headers HTTP del blob:**
        *   `Content-Type: application/pdf` — para que el navegador lo muestre en vez de descargarlo.
        *   `Content-Disposition: inline; filename="catalogo-mayorista.pdf"` — para visualización directa.
    4. Azure automáticamente sobreescribe la versión anterior.
    5. El SDK `@azure/storage-blob` incluye **retry policy por defecto** con backoff exponencial, lo que cubre fallas de red transitorias automáticamente.

### 2. Módulo de Purgado de Caché (Cloudflare API)
Dado que Cloudflare almacena el PDF durante 1 mes en sus servidores de borde (Edge Servers) para entregarlo rápido, si subimos uno nuevo con el *mismo nombre*, Cloudflare seguirá entregando el viejo hasta que pase el mes. Debemos decirle a Cloudflare "borra el viejo ahora".

*   **Dependencia:** No requiere instalar librerías pesadas, usaremos `axios` (que ya está en el proyecto, v1.6.0) para llamar a la API REST de Cloudflare.
*   **Variables de Entorno (.env):**
    *   `CLOUDFLARE_ZONE_ID`: El ID de tu dominio (se saca del panel de Cloudflare).
    *   `CLOUDFLARE_API_TOKEN`: Un token de seguridad generado en Cloudflare con permisos de "Cache Purge".
*   **Comportamiento en Script:**
    1. Apenas Azure confirme la subida exitosa, el script hace una llamada a la API de Cloudflare.
    2. Le envía el comando de purgar la URL específica: `https://catalogos.prettymakeupcol.com/prettycontenedor/catalogo-mayorista.pdf`
    3. Si falla, se reintenta 1 vez antes de reportar error (retry simple).
    4. **Nota sobre propagación:** La respuesta de la API es casi instantánea (milisegundos), pero la purga tarda **hasta 30 segundos** en propagarse a todos los edge nodes globales. No es un problema real, pero es importante saberlo si se prueba inmediatamente después.

### 3. Degradación Graceful (Sin credenciales cloud)

Si las variables de entorno de Azure y/o Cloudflare **no están configuradas**, el script debe seguir funcionando normalmente:
*   Genera el PDF localmente como siempre.
*   Muestra un mensaje informativo: `[ℹ️] Variables de Azure no configuradas. Omitiendo subida a la nube.`
*   No lanza errores ni interrumpe el flujo.

Esto es importante para:
*   **Desarrollo local:** El desarrollador puede generar PDFs sin credenciales cloud.
*   **Primer uso:** El script funciona desde el primer día sin configuración extra.

### 4. Logging con Winston

Los nuevos módulos de subida y purga deben usar el **logger de Winston** existente en el proyecto (en vez de `console.log`) para mantener trazabilidad consistente con el resto de la API, incluyendo integración con Loki para monitoreo en producción.

---

## 🔄 Flujo Operativo Final (Cómo se verá)

Una vez implementado, cuando necesites publicar el nuevo catálogo de Abril, solo harás esto:

```bash
# Ejecutas el comando en la terminal
node poc-catalogo-pdf/generate-catalog.js

# La consola mostrará:
# ...
# [✓] PDF generado localmente: output/catalogo-2026-04-01...pdf
# [✓] Validación: archivo existe, 12.4 MB (OK)
# [🚀] Subiendo a Azure Blob Storage...
# [✓] Subida exitosa a: prettycol.blob.core.windows.net/prettycontenedor/catalogo-mayorista.pdf
# [✓] Headers configurados: Content-Type=application/pdf, Content-Disposition=inline
# [🧹] Purgando caché en Cloudflare CDN...
# [✓] Caché purgada. (propagación global: ~30 segundos)
# 🎉 ¡LISTO! El nuevo catálogo ya está disponible en: https://catalogos.prettymakeupcol.com/prettycontenedor/catalogo-mayorista.pdf
```

## ⚖️ Riesgos y Mitigaciones

1.  **Pérdida de Histórico Público:** Al usar el mismo nombre (`catalogo-mayorista.pdf`) y sobreescribir, el enlace público no muestra versiones antiguas.
    *   *Mitigación primaria:* El archivo local generado en tu PC (`output/`) sí mantiene la fecha en el nombre. Tendrás un backup histórico seguro en tu computadora o en Git.
    *   *Mitigación adicional (recomendada):* Habilitar **Blob Versioning** en la cuenta de Azure Storage. Esto mantiene automáticamente versiones anteriores del archivo en la nube sin código extra. Se activa desde el portal de Azure en "Data protection" > "Enable versioning for blobs".
2.  **Seguridad de Credenciales:** El script requerirá llaves de acceso a Azure y Cloudflare.
    *   *Mitigación:* Usaremos variables de entorno (`.env`) asegurándonos de que nunca se suban a GitHub.
3.  **Fallas de Red durante la Subida:** Posible error al intentar cargar el archivo pesando 10MB+.
    *   *Mitigación:* El SDK de Azure incluye retry policy con backoff exponencial por defecto. Adicionalmente, el script usa `try/catch` robusto. Si la subida falla después de los reintentos, el script avisa el error pero *MANTIENE* el archivo local generado para que se pueda subir manualmente.
4.  **PDF Corrupto o Incompleto:** Posible que la generación falle parcialmente y produzca un archivo vacío o dañado.
    *   *Mitigación:* Validar que el archivo exista y tenga tamaño > 0 antes de intentar la subida. Opcionalmente, rechazar archivos > 30MB como medida de seguridad.

---

## 📌 Pasos Requeridos de Parte de ti (El Cliente) si apruebas:

Para proceder con la codificación, necesitaremos obtener las siguientes credenciales (que colocarás en tu `.env` tú mismo por seguridad):

1.  **En Azure:**
    *   Cadenas de conexión de la cuenta de almacenamiento.
    *   *(Recomendado)* Habilitar Blob Versioning desde el portal: Storage Account > Data protection > "Enable versioning for blobs".
2.  **En Cloudflare:**
    *   Generar un API Token (Desde "Mi Perfil" > "Tokens de API") con permisos `Zone -> Cache Purge -> Edit`.
    *   Verificar que el dominio `catalogos.prettymakeupcol.com` esté correctamente proxied hacia Azure.

Si el análisis es correcto y deseas proceder, confirmalo para preparar el código.
