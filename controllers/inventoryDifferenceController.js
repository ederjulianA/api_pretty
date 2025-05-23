import { poolPromise, sql } from '../db.js';

/**
 * Gets the list of articles where WooCommerce stock differs from system stock
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const getInventoryDifferences = async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .query(`
                SELECT 
                    ArtHookCod as sku,
                    ArtHooName as name,
                    ArtHooStok as wooStock,
                    ArtHooStockSys as systemStock,
                    ArtHookDetal as retailPrice,
                    ArtHookMayor as wholesalePrice,
                    ArtHookFchMod as lastModified
                FROM ArticuloHook 
                WHERE ArtHooStok <> ArtHooStockSys
                ORDER BY ArtHookCod
            `);

        res.json({
            success: true,
            data: result.recordset,
            total: result.recordset.length
        });

    } catch (error) {
        console.error('Error fetching inventory differences:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching inventory differences',
            error: error.message
        });
    }
}; 