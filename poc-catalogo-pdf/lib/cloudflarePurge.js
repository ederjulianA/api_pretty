'use strict';

const axios = require('axios');

const CLOUDFLARE_API = 'https://api.cloudflare.com/client/v4';
const MAX_REINTENTOS = 2;

/**
 * Purga la caché de Cloudflare para la URL pública del catálogo.
 *
 * Requiere en .env:
 *   CLOUDFLARE_ZONE_ID
 *   CLOUDFLARE_API_TOKEN
 *   AZURE_CATALOG_PUBLIC_URL  (URL a purgar)
 *
 * Nota: La respuesta de la API llega en milisegundos, pero la propagación
 * completa a todos los edge nodes de Cloudflare puede tardar hasta 30 segundos.
 *
 * @returns {Promise<{exito: boolean, omitido: boolean}>}
 */
async function purgarCache() {
  const zoneId = process.env.CLOUDFLARE_ZONE_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const urlCatalogo = process.env.AZURE_CATALOG_PUBLIC_URL;

  // Degradación graceful si no están configuradas las variables
  if (!zoneId || !apiToken) {
    console.log('   ℹ️  Variables de Cloudflare no configuradas. Omitiendo purga de caché.');
    return { exito: false, omitido: true };
  }

  if (!urlCatalogo) {
    console.log('   ⚠️  AZURE_CATALOG_PUBLIC_URL no configurada. No se puede purgar caché.');
    return { exito: false, omitido: true };
  }

  let ultimoError;
  for (let intento = 1; intento <= MAX_REINTENTOS; intento++) {
    try {
      const response = await axios.post(
        `${CLOUDFLARE_API}/zones/${zoneId}/purge_cache`,
        { files: [urlCatalogo] },
        {
          headers: {
            Authorization: `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        }
      );

      if (response.data && response.data.success) {
        return { exito: true, omitido: false };
      }

      const errores = response.data?.errors?.map(e => e.message).join(', ') || 'Error desconocido';
      throw new Error(`Cloudflare respondió con error: ${errores}`);

    } catch (error) {
      ultimoError = error;
      if (intento < MAX_REINTENTOS) {
        console.log(`   ⚠️  Intento ${intento} fallido. Reintentando...`);
      }
    }
  }

  throw new Error(`Purga de caché fallida después de ${MAX_REINTENTOS} intentos: ${ultimoError.message}`);
}

module.exports = { purgarCache };
