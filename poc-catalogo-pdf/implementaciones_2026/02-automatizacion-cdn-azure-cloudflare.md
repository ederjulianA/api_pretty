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
    1. Una vez guardado el PDF local, el script lee el archivo.
    2. Se conecta a Azure y lo sube con el nombre `catalogo-mayorista.pdf`.
    3. Azure automáticamente sobreescribe la versión anterior.

### 2. Módulo de Purgado de Caché (Cloudflare API)
Dado que Cloudflare almacena el PDF durante 1 mes en sus servidores de borde (Edge Servers) para entregarlo rápido, si subimos uno nuevo con el *mismo nombre*, Cloudflare seguirá entregando el viejo hasta que pase el mes. Debemos decirle a Cloudflare "borra el viejo ahora".

*   **Dependencia:** No requiere instalar librerías pesadas, usaremos `axios` (que ya está en el proyecto) para llamar a la API REST de Cloudflare.
*   **Variables de Entorno (.env):**
    *   `CLOUDFLARE_ZONE_ID`: El ID de tu dominio (se saca del panel de Cloudflare).
    *   `CLOUDFLARE_API_TOKEN`: Un token de seguridad generado en Cloudflare con permisos de "Cache Purge".
*   **Comportamiento en Script:**
    1. Apenas Azure confirme la subida exitosa, el script hace una llamada a la API de Cloudflare.
    2. Le envía el comando de purgar la URL específica: `https://catalogos.prettymakeupcol.com/prettycontenedor/catalogo-mayorista.pdf`
    3. Tiempo de ejecución: Milisegundos.

---

## 🔄 Flujo Operativo Final (Cómo se verá)

Una vez implementado, cuando necesites publicar el nuevo catálogo de Abril, solo harás esto:

```bash
# Ejecutas el comando en la terminal
node poc-catalogo-pdf/generate-catalog.js

# La consola mostrará:
# ...
# [✓] PDF generado localmente: output/catalogo-2026-04-01...pdf
# [🚀] Subiendo a Azure Blob Storage...
# [✓] Subida exitosa a: prettycol.blob.core.windows.net/prettycontenedor/catalogo-mayorista.pdf
# [🧹] Purgando caché en Cloudflare CDN...
# [✓] Caché purgada.
# 🎉 ¡LISTO! El nuevo catálogo ya está disponible a máxima velocidad en: https://catalogos.prettymakeupcol.com/prettycontenedor/catalogo-mayorista.pdf
```

## ⚖️ Riesgos y Mitigaciones

1.  **Pérdida de Histórico Público:** Al usar el mismo nombre (`catalogo-mayorista.pdf`) y sobreescribir, el enlace público no muestra versiones antiguas.
    *   *Mitigación:* El archivo local generado en tu PC (`output/`) sí mantiene la fecha en el nombre. Tendrás un backup histórico seguro en tu computadora o en Git.
2.  **Seguridad de Credenciales:** El script requerirá llaves de acceso a Azure y Cloudflare.
    *   *Mitigación:* Usaremos variables de entorno (`.env`) asegurándonos de que nunca se suban a GitHub.
3.  **Fallas de Red durante la Subida:** Posible error al intentar cargar el archivo pesando 10MB+.
    *   *Mitigación:* Implementar un bloque `try/catch` robusto. Si la subida falla, el script avisa el error pero *MANTIENE* el archivo local generado para que se pueda subir manual.

---

## 📌 Pasos Requeridos de Parte de ti (El Cliente) si apruebas:

Para proceder con la codificación, necesitaremos obtener las siguientes credenciales (que colocarás en tu `.env` tú mismo por seguridad):

1.  **En Azure:** Cadenas de conexión de la cuenta de almacenamiento.
2.  **En Cloudflare:** Generar un API Token (Desde "Mi Perfil" > "Tokens de API") con permisos `Zone -> Cache Purge -> Edit`.

Si el análisis es correcto y deseas proceder, confirmalo para preparar el código.
