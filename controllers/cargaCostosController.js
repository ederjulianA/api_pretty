/**
 * Controlador: Carga Inicial de Costos
 * Descripción: Gestiona la exportación/importación de costos iniciales
 *              para el sistema de costo promedio ponderado
 * Fecha: 2026-02-09
 */

const { poolPromise, sql } = require('../db');
const XLSX = require('xlsx');

/**
 * Exportar productos activos a Excel para carga de costos
 * GET /api/carga-costos/exportar
 */
const exportarPlantillaCostos = async (req, res) => {
  try {
    const pool = await poolPromise;

    const result = await pool.request().query(`
      SELECT
        ig.inv_gru_nom AS categoria,
        isg.inv_sub_gru_nom AS subcategoria,
        a.art_cod,
        a.art_nom,
        ISNULL(ve.existencia, 0) AS existencia,
        ISNULL(ad_detal.art_bod_pre, 0) AS precio_venta_detal,
        ISNULL(ad_mayor.art_bod_pre, 0) AS precio_venta_mayor,
        NULL AS costo_inicial,
        NULL AS metodo,
        NULL AS observaciones
      FROM dbo.articulos a
      INNER JOIN dbo.vwExistencias ve ON ve.art_sec = a.art_sec
      LEFT JOIN dbo.inventario_subgrupo isg ON isg.inv_sub_gru_cod = a.inv_sub_gru_cod
      LEFT JOIN dbo.inventario_grupo ig ON ig.inv_gru_cod = isg.inv_gru_cod
      LEFT JOIN dbo.articulosdetalle ad_detal ON ad_detal.art_sec = a.art_sec
        AND ad_detal.bod_sec = '1' AND ad_detal.lis_pre_cod = 1
      LEFT JOIN dbo.articulosdetalle ad_mayor ON ad_mayor.art_sec = a.art_sec
        AND ad_mayor.bod_sec = '1' AND ad_mayor.lis_pre_cod = 2
      WHERE ve.existencia > 0
      ORDER BY ig.inv_gru_nom, isg.inv_sub_gru_nom, a.art_nom
    `);

    // Crear workbook
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(result.recordset);

    ws['!cols'] = [
      { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 35 },
      { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
      { wch: 18 }, { wch: 30 }
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Productos');

    // Hoja de instrucciones
    const instrucciones = [
      { Instruccion: '═══════════════════════════════════════════════════════════' },
      { Instruccion: 'INSTRUCCIONES: Carga Inicial de Costos' },
      { Instruccion: '═══════════════════════════════════════════════════════════' },
      { Instruccion: '' },
      { Instruccion: '1. COLUMNAS A-G: NO EDITAR (datos del sistema)' },
      { Instruccion: '2. COLUMNA H (costo_inicial): OBLIGATORIA' },
      { Instruccion: '3. COLUMNA I (metodo): ULTIMA_COMPRA, REVERSO_XX%, ESTIMADO, MANUAL' },
      { Instruccion: '4. COLUMNA J (observaciones): OPCIONAL' },
      { Instruccion: '' },
      { Instruccion: 'TRABAJO POR CATEGORÍAS: Use filtros, puede importar múltiples veces' }
    ];

    const wsInstr = XLSX.utils.json_to_sheet(instrucciones);
    wsInstr['!cols'] = [{ wch: 70 }];
    XLSX.utils.book_append_sheet(wb, wsInstr, 'INSTRUCCIONES');

    const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const fecha = new Date().toISOString().split('T')[0];
    const fileName = `carga_costos_inicial_${fecha}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    return res.send(excelBuffer);

  } catch (error) {
    console.error('Error exportando plantilla:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al generar el archivo Excel',
      error: error.message
    });
  }
};

/**
 * Importar costos desde archivo Excel
 * POST /api/carga-costos/importar
 */
const importarCostosDesdeExcel = async (req, res) => {
  try {
    if (!req.files || !req.files.archivo) {
      return res.status(400).json({
        success: false,
        message: 'No se recibió ningún archivo Excel. Asegúrate de enviar el archivo con el campo "archivo"'
      });
    }

    const usuarioCarga = req.body.usu_cod || req.user?.usu_cod || 'SYSTEM';
    const archivoExcel = req.files.archivo;
    const workbook = XLSX.read(archivoExcel.data, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const datos = XLSX.utils.sheet_to_json(worksheet);

    if (datos.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'El archivo Excel está vacío'
      });
    }

    const pool = await poolPromise;
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    let procesados = 0;
    let actualizados = 0;
    let nuevos = 0;
    let ignorados = 0;
    const errores = [];

    try {
      for (const fila of datos) {
        if (!fila.art_cod || fila.costo_inicial === null || fila.costo_inicial === undefined || fila.costo_inicial === '') {
          ignorados++;
          continue;
        }

        const costo = parseFloat(fila.costo_inicial);
        if (isNaN(costo)) {
          errores.push(`Producto ${fila.art_cod}: Costo inválido`);
          ignorados++;
          continue;
        }

        const artResult = await transaction.request()
          .input('art_cod', sql.VarChar(30), fila.art_cod)
          .query('SELECT art_sec FROM dbo.articulos WHERE art_cod = @art_cod');

        if (artResult.recordset.length === 0) {
          errores.push(`Producto ${fila.art_cod}: No encontrado`);
          ignorados++;
          continue;
        }

        const art_sec = artResult.recordset[0].art_sec;

        const datosResult = await transaction.request()
          .input('art_sec', sql.VarChar(30), art_sec)
          .query(`
            SELECT a.art_cod, a.art_nom, ISNULL(ve.existencia, 0) AS existencia,
                   ad_detal.art_bod_pre AS precio_venta_detal,
                   ad_mayor.art_bod_pre AS precio_venta_mayor
            FROM dbo.articulos a
            LEFT JOIN dbo.vwExistencias ve ON ve.art_sec = a.art_sec
            LEFT JOIN dbo.articulosdetalle ad_detal ON ad_detal.art_sec = a.art_sec
              AND ad_detal.bod_sec = '1' AND ad_detal.lis_pre_cod = 1
            LEFT JOIN dbo.articulosdetalle ad_mayor ON ad_mayor.art_sec = a.art_sec
              AND ad_mayor.bod_sec = '1' AND ad_mayor.lis_pre_cod = 2
            WHERE a.art_sec = @art_sec
          `);

        const datosProducto = datosResult.recordset[0];

        const existeResult = await transaction.request()
          .input('art_sec', sql.VarChar(30), art_sec)
          .query('SELECT cic_id FROM dbo.carga_inicial_costos WHERE cic_art_sec = @art_sec');

        if (existeResult.recordset.length > 0) {
          await transaction.request()
            .input('art_sec', sql.VarChar(30), art_sec)
            .input('art_cod', sql.VarChar(30), datosProducto.art_cod)
            .input('art_nom', sql.VarChar(100), datosProducto.art_nom)
            .input('existencia', sql.Decimal(17, 2), datosProducto.existencia)
            .input('precio_detal', sql.Decimal(17, 2), datosProducto.precio_venta_detal)
            .input('precio_mayor', sql.Decimal(17, 2), datosProducto.precio_venta_mayor)
            .input('costo', sql.Decimal(17, 2), costo)
            .input('metodo', sql.VarChar(50), fila.metodo || 'MANUAL')
            .input('obs', sql.VarChar(500), fila.observaciones || '')
            .input('usuario', sql.VarChar(100), usuarioCarga)
            .query(`
              UPDATE dbo.carga_inicial_costos
              SET cic_art_cod = @art_cod, cic_art_nom = @art_nom,
                  cic_existencia = @existencia, cic_precio_venta_detal = @precio_detal,
                  cic_precio_venta_mayor = @precio_mayor, cic_costo_propuesto = @costo,
                  cic_metodo_calculo = @metodo, cic_observaciones = @obs,
                  cic_estado = 'PENDIENTE', cic_fecha_carga = GETDATE(),
                  cic_usuario_carga = @usuario
              WHERE cic_art_sec = @art_sec
            `);
          actualizados++;
        } else {
          await transaction.request()
            .input('art_sec', sql.VarChar(30), art_sec)
            .input('art_cod', sql.VarChar(30), datosProducto.art_cod)
            .input('art_nom', sql.VarChar(100), datosProducto.art_nom)
            .input('existencia', sql.Decimal(17, 2), datosProducto.existencia)
            .input('precio_detal', sql.Decimal(17, 2), datosProducto.precio_venta_detal)
            .input('precio_mayor', sql.Decimal(17, 2), datosProducto.precio_venta_mayor)
            .input('costo', sql.Decimal(17, 2), costo)
            .input('metodo', sql.VarChar(50), fila.metodo || 'MANUAL')
            .input('obs', sql.VarChar(500), fila.observaciones || '')
            .input('usuario', sql.VarChar(100), usuarioCarga)
            .query(`
              INSERT INTO dbo.carga_inicial_costos (
                cic_art_sec, cic_art_cod, cic_art_nom, cic_existencia,
                cic_precio_venta_detal, cic_precio_venta_mayor,
                cic_costo_propuesto, cic_metodo_calculo, cic_observaciones, cic_usuario_carga
              ) VALUES (
                @art_sec, @art_cod, @art_nom, @existencia,
                @precio_detal, @precio_mayor, @costo, @metodo, @obs, @usuario
              )
            `);
          nuevos++;
        }

        procesados++;
      }

      await transaction.commit();
      await pool.request().execute('sp_ValidarCargaInicialCostos');

      return res.json({
        success: true,
        message: 'Importación completada exitosamente',
        data: { total_filas: datos.length, procesados, nuevos, actualizados, ignorados, errores: errores.length > 0 ? errores : undefined }
      });

    } catch (error) {
      await transaction.rollback();
      throw error;
    }

  } catch (error) {
    console.error('Error importando costos:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al importar el archivo Excel',
      error: error.message
    });
  }
};

/**
 * Obtener resumen de carga
 * GET /api/carga-costos/resumen
 */
const obtenerResumenCarga = async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT cic_estado AS estado, COUNT(*) AS cantidad,
             AVG(cic_margen_resultante_detal) AS margen_promedio
      FROM dbo.carga_inicial_costos
      GROUP BY cic_estado
      ORDER BY CASE cic_estado
        WHEN 'VALIDADO' THEN 1 WHEN 'VALIDADO_CON_ALERTAS' THEN 2
        WHEN 'PENDIENTE' THEN 3 WHEN 'RECHAZADO' THEN 4 WHEN 'APLICADO' THEN 5
      END
    `);

    return res.json({ success: true, data: result.recordset });
  } catch (error) {
    console.error('Error obteniendo resumen:', error);
    return res.status(500).json({ success: false, message: 'Error al obtener resumen', error: error.message });
  }
};

/**
 * Obtener productos con alertas
 * GET /api/carga-costos/alertas
 */
const obtenerProductosConAlertas = async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT cic_art_cod AS art_cod, cic_art_nom AS art_nom,
             cic_costo_propuesto AS costo_propuesto,
             cic_precio_venta_detal AS precio_venta,
             cic_margen_resultante_detal AS margen,
             cic_estado AS estado, cic_observaciones AS observaciones
      FROM dbo.carga_inicial_costos
      WHERE cic_estado IN ('VALIDADO_CON_ALERTAS', 'RECHAZADO')
      ORDER BY CASE cic_estado WHEN 'RECHAZADO' THEN 1 WHEN 'VALIDADO_CON_ALERTAS' THEN 2 END,
               cic_margen_resultante_detal ASC
    `);

    return res.json({ success: true, data: result.recordset });
  } catch (error) {
    console.error('Error obteniendo alertas:', error);
    return res.status(500).json({ success: false, message: 'Error al obtener alertas', error: error.message });
  }
};

/**
 * Aplicar costos validados
 * POST /api/carga-costos/aplicar
 */
const aplicarCostosValidados = async (req, res) => {
  try {
    const usuario = req.body.usu_cod || req.user?.usu_cod || 'SYSTEM';
    const pool = await poolPromise;
    const result = await pool.request()
      .input('usuario', sql.VarChar(100), usuario)
      .execute('sp_AplicarCargaInicialCostos');

    const resumen = result.recordset[0];

    return res.json({
      success: true,
      message: resumen.mensaje,
      data: { total_aplicados: resumen.total_aplicados, errores: resumen.errores }
    });

  } catch (error) {
    console.error('Error aplicando costos:', error);
    return res.status(500).json({ success: false, message: 'Error al aplicar costos', error: error.message });
  }
};

module.exports = {
  exportarPlantillaCostos,
  importarCostosDesdeExcel,
  obtenerResumenCarga,
  obtenerProductosConAlertas,
  aplicarCostosValidados
};
