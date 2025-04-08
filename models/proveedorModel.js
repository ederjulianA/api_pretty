import { sql, poolPromise } from "../db.js";

const getProveedor = async (nit_ide) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('nit_ide', sql.VarChar(16), nit_ide)
      .query(`
        SELECT 
          nit_sec,
          nit_ide,
          nit_nom,
          nit_dir,
          nit_tel,
          nit_email
          
     
        FROM dbo.nit 
        WHERE nit_ide = @nit_ide 
        AND nit_ind_pro = 'S'
      `);

    if (result.recordset.length === 0) {
      throw new Error("Proveedor no encontrado");
    }

    return result.recordset[0];
  } catch (error) {
    throw error;
  }
};

const getProveedores = async ({ 
  nit_ide = null, 
  nit_nom = null, 
  pageSize = 10, 
  pageNumber = 1 
}) => {
  try {
    const pool = await poolPromise;
    
    // Construir la consulta base
    let query = `
      SELECT 
        nit_sec,
        nit_ide,
        nit_nom,
        nit_dir,
        nit_tel,
        nit_email,
        ciu_cod
      FROM dbo.nit 
      WHERE nit_ind_pro = 'S'
    `;

    // Agregar filtros si existen
    const parameters = [];
    if (nit_ide) {
      query += " AND nit_ide LIKE @nit_ide + '%'";
      parameters.push({
        name: 'nit_ide',
        type: sql.VarChar(16),
        value: nit_ide
      });
    }

    if (nit_nom) {
      query += " AND nit_nom LIKE '%' + @nit_nom + '%'";
      parameters.push({
        name: 'nit_nom',
        type: sql.VarChar(100),
        value: nit_nom
      });
    }

    // Agregar paginación
    query += `
      ORDER BY nit_nom
      OFFSET @offset ROWS
      FETCH NEXT @pageSize ROWS ONLY
    `;

    // Calcular el offset
    const offset = (pageNumber - 1) * pageSize;

    // Crear la solicitud
    const request = pool.request();

    // Agregar los parámetros de filtro
    parameters.forEach(param => {
      request.input(param.name, param.type, param.value);
    });

    // Agregar parámetros de paginación
    request.input('offset', sql.Int, offset);
    request.input('pageSize', sql.Int, pageSize);

    // Ejecutar la consulta
    const result = await request.query(query);

    // Obtener el total de registros para la paginación
    const countQuery = `
      SELECT COUNT(*) as total
      FROM dbo.nit 
      WHERE nit_ind_pro = 'S'
      ${nit_ide ? "AND nit_ide LIKE @nit_ide + '%'" : ''}
      ${nit_nom ? "AND nit_nom LIKE '%' + @nit_nom + '%'" : ''}
    `;

    const totalCount = await request.query(countQuery);
    const total = totalCount.recordset[0].total;

    return {
      data: result.recordset,
      pagination: {
        total,
        pageSize,
        pageNumber,
        totalPages: Math.ceil(total / pageSize)
      }
    };
  } catch (error) {
    throw error;
  }
};

export { getProveedor, getProveedores }; 