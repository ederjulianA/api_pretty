'use strict';

const { BlobServiceClient } = require('@azure/storage-blob');
const fs = require('fs').promises;

const MAX_PDF_SIZE_MB = 30;

/**
 * Sube el catálogo PDF a Azure Blob Storage con nombre fijo.
 * Sobreescribe la versión anterior. Configura Content-Type e inline display.
 *
 * Requiere en .env:
 *   AZURE_STORAGE_CONNECTION_STRING
 *   AZURE_STORAGE_CONTAINER_NAME
 *   AZURE_CATALOG_BLOB_NAME
 *
 * @param {string} rutaLocalPDF - Ruta absoluta al archivo PDF generado
 * @returns {Promise<{exito: boolean, url: string|null, tamanoMB: number|null}>}
 */
async function subirCatalogo(rutaLocalPDF) {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME;
  const blobName = process.env.AZURE_CATALOG_BLOB_NAME || 'catalogo-mayorista.pdf';

  // Degradación graceful si no están configuradas las variables
  if (!connectionString || !containerName) {
    console.log('   ℹ️  Variables de Azure no configuradas. Omitiendo subida a la nube.');
    return { exito: false, url: null, tamanoMB: null, omitido: true };
  }

  // Validar que el archivo existe y tiene tamaño válido
  let stats;
  try {
    stats = await fs.stat(rutaLocalPDF);
  } catch {
    throw new Error(`No se encontró el archivo PDF: ${rutaLocalPDF}`);
  }

  if (stats.size === 0) {
    throw new Error('El archivo PDF generado está vacío (0 bytes). Abortando subida.');
  }

  const tamanoMB = parseFloat((stats.size / (1024 * 1024)).toFixed(2));
  if (tamanoMB > MAX_PDF_SIZE_MB) {
    throw new Error(`El PDF pesa ${tamanoMB} MB, supera el límite de ${MAX_PDF_SIZE_MB} MB. Abortando subida.`);
  }

  console.log(`   ✓ Validación: archivo existe, ${tamanoMB} MB (OK)`);

  // Conectar a Azure y subir
  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
  const containerClient = blobServiceClient.getContainerClient(containerName);
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);

  const buffer = await fs.readFile(rutaLocalPDF);

  await blockBlobClient.upload(buffer, buffer.length, {
    blobHTTPHeaders: {
      blobContentType: 'application/pdf',
      blobContentDisposition: `inline; filename="${blobName}"`,
    },
    overwrite: true,
  });

  const url = process.env.AZURE_CATALOG_PUBLIC_URL ||
    `https://${BlobServiceClient.fromConnectionString(connectionString).accountName}.blob.core.windows.net/${containerName}/${blobName}`;

  return { exito: true, url, tamanoMB, omitido: false };
}

module.exports = { subirCatalogo };
