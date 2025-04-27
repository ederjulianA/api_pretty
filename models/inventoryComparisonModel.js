import { sql, poolPromise } from "../db.js";
import wcPkg from "@woocommerce/woocommerce-rest-api";
const WooCommerceRestApi = wcPkg.default || wcPkg;

// Configuración de WooCommerce API
const wcApi = new WooCommerceRestApi({
    url: process.env.WC_URL,
    consumerKey: process.env.WC_CONSUMER_KEY,
    consumerSecret: process.env.WC_CONSUMER_SECRET,
    version: "wc/v3",
    timeout: 30000
});

// Función auxiliar para dividir array en chunks
const chunkArray = (array, size) => {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size));
    }
    return chunks;
};

const getInventoryDifferences = async (options = {}) => {
    const {
        page = 1,
        limit = 50,
        filterByCategory = null,
        sortBy = 'diferencia',
        sortOrder = 'desc'
    } = options;

    try {
        const pool = await poolPromise;

        // 1. Obtener inventario local
        let localInventoryQuery = `
            SELECT 
                a.art_sec,
                a.art_cod,
                a.art_nom,
                a.art_woo_id,
                ISNULL(ve.existencia, 0) as stock_local,
                a.inv_sub_gru_cod,
                ig.inv_gru_nom as categoria,
                ig.inv_gru_cod
            FROM dbo.articulos a
            LEFT JOIN dbo.vwExistencias ve ON a.art_sec = ve.art_sec
            LEFT JOIN dbo.inventario_subgrupo s ON s.inv_sub_gru_cod = a.inv_sub_gru_cod
            LEFT JOIN dbo.inventario_grupo ig ON s.inv_gru_cod = ig.inv_gru_cod
            WHERE a.art_woo_id IS NOT NULL
        `;

        if (filterByCategory) {
            localInventoryQuery += " AND ig.inv_gru_cod = @categoryId";
        }

        const request = pool.request();
        if (filterByCategory) {
            request.input('categoryId', sql.VarChar(30), filterByCategory);
        }

        const localInventory = await request.query(localInventoryQuery);

        // 2. Obtener inventario de WooCommerce de forma más eficiente
        const wooProducts = [];
        const wooIds = localInventory.recordset
            .map(item => item.art_woo_id?.toString())
            .filter(id => id); // Filtrar IDs nulos o undefined

        // Dividir los IDs en chunks de 10 para evitar URLs demasiado largas
        const idChunks = chunkArray(wooIds, 10);

        // Obtener productos por chunks
        for (const chunk of idChunks) {
            try {
                const response = await wcApi.get("products", {
                    include: chunk,
                    per_page: chunk.length,
                    status: "publish"
                });
                wooProducts.push(...response.data);
            } catch (wooError) {
                console.error('Error obteniendo chunk de productos:', wooError);
                // Continuar con el siguiente chunk en caso de error
                continue;
            }
        }

        // Crear un mapa de productos WooCommerce para búsqueda más eficiente
        const wooProductsMap = new Map(wooProducts.map(p => [p.id.toString(), p]));

        // 3. Comparar y encontrar diferencias (solo guardar los que tienen diferencias)
        const differences = localInventory.recordset
            .map(localItem => {
                const wooProduct = wooProductsMap.get(localItem.art_woo_id?.toString());
                const wooStock = wooProduct ? (wooProduct.stock_quantity || 0) : 0;
                const difference = localItem.stock_local - wooStock;
                const absDifference = Math.abs(difference);

                // Solo incluir si hay diferencia
                if (absDifference === 0) return null;

                return {
                    art_sec: localItem.art_sec,
                    art_cod: localItem.art_cod,
                    art_nom: localItem.art_nom,
                    art_woo_id: localItem.art_woo_id,
                    categoria: localItem.categoria,
                    inv_sub_gru_cod: localItem.inv_sub_gru_cod,
                    inv_gru_cod: localItem.inv_gru_cod,
                    stock_local: localItem.stock_local,
                    stock_woo: wooStock,
                    diferencia: difference,
                    diferencia_absoluta: absDifference,
                    woo_product_exists: !!wooProduct,
                    woo_product_status: wooProduct?.status || 'no_exists'
                };
            })
            .filter(item => item !== null);

        // 4. Ordenar resultados
        differences.sort((a, b) => {
            if (sortBy === 'codigo') {
                return sortOrder === 'asc'
                    ? a.art_cod.localeCompare(b.art_cod)
                    : b.art_cod.localeCompare(a.art_cod);
            } else { // sortBy === 'diferencia'
                return sortOrder === 'asc'
                    ? a.diferencia_absoluta - b.diferencia_absoluta
                    : b.diferencia_absoluta - a.diferencia_absoluta;
            }
        });

        // 5. Paginar resultados
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const paginatedResults = differences.slice(startIndex, endIndex);

        // 6. Preparar resumen
        const summary = {
            totalItems: differences.length,
            totalPages: Math.ceil(differences.length / limit),
            currentPage: page,
            itemsPerPage: limit,
            totalItemsShowing: paginatedResults.length,
            maxDifference: differences.length > 0 ? Math.max(...differences.map(item => item.diferencia_absoluta)) : 0,
            minDifference: differences.length > 0 ? Math.min(...differences.map(item => item.diferencia_absoluta)) : 0,
            categorias: [...new Set(differences.map(item => item.categoria))].sort(),
            resumenPorCategoria: differences.reduce((acc, item) => {
                if (!acc[item.categoria]) {
                    acc[item.categoria] = {
                        total: 0,
                        maxDiferencia: 0
                    };
                }
                acc[item.categoria].total++;
                acc[item.categoria].maxDiferencia = Math.max(acc[item.categoria].maxDiferencia, item.diferencia_absoluta);
                return acc;
            }, {})
        };

        return {
            success: true,
            data: paginatedResults,
            summary
        };

    } catch (error) {
        console.error('Error en getInventoryDifferences:', error);
        throw error;
    }
};

export { getInventoryDifferences }; 