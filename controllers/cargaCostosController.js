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
        ISNULL(ad_detal.art_bod_cos_cat, 0) AS costo_promedio_actual,
        CASE
          WHEN ISNULL(ad_detal.art_bod_cos_cat, 0) > 0 AND ISNULL(ad_detal.art_bod_pre, 0) > 0
          THEN ROUND((ad_detal.art_bod_pre - ad_detal.art_bod_cos_cat) / ad_detal.art_bod_pre * 100, 2)
          ELSE NULL
        END AS rentabilidad_detal_pct,
        CASE
          WHEN ISNULL(ad_detal.art_bod_cos_cat, 0) > 0 AND ISNULL(ad_mayor.art_bod_pre, 0) > 0
          THEN ROUND((ad_mayor.art_bod_pre - ad_detal.art_bod_cos_cat) / ad_mayor.art_bod_pre * 100, 2)
          ELSE NULL
        END AS rentabilidad_mayor_pct,
        ISNULL((
          SELECT SUM(fk.kar_uni)
          FROM dbo.facturakardes fk
          INNER JOIN dbo.factura f ON f.fac_sec = fk.fac_sec
          WHERE fk.art_sec = a.art_sec
            AND fk.kar_nat = '-'
            AND f.fac_tip_cod = 'VTA'
            AND f.fac_est_fac = 'A'
        ), 0) AS total_unidades_vendidas,
        NULL AS costo_inicial,
        NULL AS metodo,
        NULL AS observaciones
      FROM dbo.articulos a
      LEFT JOIN dbo.vwExistencias ve ON ve.art_sec = a.art_sec
      LEFT JOIN dbo.inventario_subgrupo isg ON isg.inv_sub_gru_cod = a.inv_sub_gru_cod
      LEFT JOIN dbo.inventario_grupo ig ON ig.inv_gru_cod = isg.inv_gru_cod
      LEFT JOIN dbo.articulosdetalle ad_detal ON ad_detal.art_sec = a.art_sec
        AND ad_detal.bod_sec = '1' AND ad_detal.lis_pre_cod = 1
      LEFT JOIN dbo.articulosdetalle ad_mayor ON ad_mayor.art_sec = a.art_sec
        AND ad_mayor.bod_sec = '1' AND ad_mayor.lis_pre_cod = 2
      ORDER BY ig.inv_gru_nom, isg.inv_sub_gru_nom, a.art_nom
    `);

    // Crear workbook
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(result.recordset);

    ws['!cols'] = [
      { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 35 },
      { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 18 },
      { wch: 18 }, { wch: 18 }, { wch: 20 }, { wch: 15 }, { wch: 18 }, { wch: 30 }
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Productos');

    // Hoja de instrucciones
    const instrucciones = [
      { Instruccion: '═══════════════════════════════════════════════════════════' },
      { Instruccion: 'INSTRUCCIONES: Carga Inicial de Costos' },
      { Instruccion: '═══════════════════════════════════════════════════════════' },
      { Instruccion: '' },
      { Instruccion: '1. COLUMNAS A-K: NO EDITAR (datos del sistema)' },
      { Instruccion: '   COLUMNA H (costo_promedio_actual): Costo vigente en el sistema (referencia)' },
      { Instruccion: '   COLUMNA I (rentabilidad_detal_pct): Margen % sobre precio detal con costo actual' },
      { Instruccion: '   COLUMNA J (rentabilidad_mayor_pct): Margen % sobre precio mayor con costo actual' },
      { Instruccion: '   COLUMNA K (total_unidades_vendidas): Total unidades vendidas (ventas activas)' },
      { Instruccion: '2. COLUMNA L (costo_inicial): OBLIGATORIA - Ingrese el nuevo costo a aplicar' },
      { Instruccion: '3. COLUMNA M (metodo): ULTIMA_COMPRA, REVERSO_XX%, ESTIMADO, MANUAL' },
      { Instruccion: '4. COLUMNA N (observaciones): OPCIONAL' },
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
 * Calcular costos automáticamente basados en precio mayor y/o detal con margen fijo
 * POST /api/carga-costos/calcular-automatico
 *
 * Prioridad de cálculo por artículo:
 *   1. Si tiene precio_mayor → Costo = Precio Mayor / (1 + margen_mayor/100)
 *   2. Si NO tiene precio_mayor pero SÍ precio_detal → Costo = Precio Detal / (1 + margen_detal/100)
 *   3. Si no tiene ningún precio → se omite (sin_precio)
 *
 * Respeta artículos que ya tienen art_bod_cos_cat > 0 (no los sobreescribe)
 */
const calcularCostosAutomatico = async (req, res) => {
  try {
    const usuario = req.body.usu_cod || req.user?.usu_cod || 'SYSTEM';
    const margen_mayor = parseFloat(req.body.margen_mayor) || 20;
    const margen_detal = parseFloat(req.body.margen_detal) || margen_mayor; // Por defecto usa el mismo margen
    const divisor_mayor = 1 + (margen_mayor / 100);
    const divisor_detal = 1 + (margen_detal / 100);

    const pool = await poolPromise;
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    let procesados = 0;
    let actualizados = 0;
    let nuevos = 0;
    let sin_precio = 0;
    let ya_con_costo = 0;
    let calculados_desde_mayor = 0;
    let calculados_desde_detal = 0;
    const errores = [];

    try {
      // 1. Obtener TODOS los productos (con y sin existencia, con cualquier precio)
      const productos = await transaction.request().query(`
        SELECT
          a.art_sec,
          a.art_cod,
          a.art_nom,
          ISNULL(ve.existencia, 0) AS existencia,
          ISNULL(ad_detal.art_bod_pre, 0) AS precio_venta_detal,
          ISNULL(ad_mayor.art_bod_pre, 0) AS precio_venta_mayor,
          ISNULL(ad_detal.art_bod_cos_cat, 0) AS costo_actual
        FROM dbo.articulos a
        LEFT JOIN dbo.vwExistencias ve ON ve.art_sec = a.art_sec
        LEFT JOIN dbo.articulosdetalle ad_detal ON ad_detal.art_sec = a.art_sec
          AND ad_detal.bod_sec = '1' AND ad_detal.lis_pre_cod = 1
        LEFT JOIN dbo.articulosdetalle ad_mayor ON ad_mayor.art_sec = a.art_sec
          AND ad_mayor.bod_sec = '1' AND ad_mayor.lis_pre_cod = 2
        WHERE ad_detal.art_bod_pre > 0 OR ad_mayor.art_bod_pre > 0
      `);

      // 2. Procesar cada producto
      for (const prod of productos.recordset) {
        // Respetar artículos que ya tienen costo asignado
        if (prod.costo_actual > 0) {
          ya_con_costo++;
          continue;
        }

        // Determinar precio base y parámetros según prioridad
        let precio_base, costo_calculado, metodo, observacion;

        if (prod.precio_venta_mayor > 0) {
          precio_base = prod.precio_venta_mayor;
          costo_calculado = Math.round((precio_base / divisor_mayor) * 100) / 100;
          metodo = `REVERSO_MAYOR_${margen_mayor}%`;
          observacion = `Cálculo automático desde precio mayor ($${precio_base}) con markup ${margen_mayor}%. Fórmula: Costo = Precio Mayor / ${divisor_mayor.toFixed(2)}`;
          calculados_desde_mayor++;
        } else if (prod.precio_venta_detal > 0) {
          precio_base = prod.precio_venta_detal;
          costo_calculado = Math.round((precio_base / divisor_detal) * 100) / 100;
          metodo = `REVERSO_DETAL_${margen_detal}%`;
          observacion = `Cálculo automático desde precio detal ($${precio_base}) con markup ${margen_detal}%. Fórmula: Costo = Precio Detal / ${divisor_detal.toFixed(2)}`;
          calculados_desde_detal++;
        } else {
          sin_precio++;
          continue;
        }

        // Verificar si ya existe en carga_inicial_costos (UPSERT)
        const existeResult = await transaction.request()
          .input('art_sec', sql.VarChar(30), prod.art_sec)
          .query('SELECT cic_id FROM dbo.carga_inicial_costos WHERE cic_art_sec = @art_sec');

        const params = (req) => req
          .input('art_sec', sql.VarChar(30), prod.art_sec)
          .input('art_cod', sql.VarChar(30), prod.art_cod)
          .input('art_nom', sql.VarChar(100), prod.art_nom)
          .input('existencia', sql.Decimal(17, 2), prod.existencia)
          .input('precio_detal', sql.Decimal(17, 2), prod.precio_venta_detal)
          .input('precio_mayor', sql.Decimal(17, 2), prod.precio_venta_mayor)
          .input('costo', sql.Decimal(17, 2), costo_calculado)
          .input('metodo', sql.VarChar(50), metodo)
          .input('obs', sql.VarChar(500), observacion)
          .input('usuario', sql.VarChar(100), usuario);

        if (existeResult.recordset.length > 0) {
          await params(transaction.request()).query(`
            UPDATE dbo.carga_inicial_costos
            SET cic_art_cod = @art_cod,
                cic_art_nom = @art_nom,
                cic_existencia = @existencia,
                cic_precio_venta_detal = @precio_detal,
                cic_precio_venta_mayor = @precio_mayor,
                cic_costo_propuesto = @costo,
                cic_metodo_calculo = @metodo,
                cic_observaciones = @obs,
                cic_estado = 'PENDIENTE',
                cic_fecha_carga = GETDATE(),
                cic_usuario_carga = @usuario
            WHERE cic_art_sec = @art_sec
          `);
          actualizados++;
        } else {
          await params(transaction.request()).query(`
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

      // 3. Ejecutar validación automática
      await pool.request().execute('sp_ValidarCargaInicialCostos');

      return res.json({
        success: true,
        message: 'Cálculo automático de costos completado exitosamente',
        data: {
          total_productos: productos.recordset.length,
          procesados,
          ya_con_costo,
          calculados_desde_mayor,
          calculados_desde_detal,
          sin_precio,
          nuevos,
          actualizados,
          markup_mayor_aplicado: `${margen_mayor}%`,
          markup_detal_aplicado: `${margen_detal}%`,
          formulas: {
            desde_mayor: `Costo = Precio Mayor / ${divisor_mayor.toFixed(2)}`,
            desde_detal: `Costo = Precio Detal / ${divisor_detal.toFixed(2)}`
          },
          siguiente_paso: 'Revisar con GET /api/carga-costos/resumen. Si hay VALIDADO_CON_ALERTAS usar PUT /actualizar-estado antes de aplicar.'
        }
      });

    } catch (error) {
      await transaction.rollback();
      throw error;
    }

  } catch (error) {
    console.error('Error en cálculo automático de costos:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al calcular costos automáticamente',
      error: error.message
    });
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

/**
 * Registrar costo individual para un artículo
 * POST /api/carga-costos/registrar-individual
 */
const registrarCostoIndividual = async (req, res) => {
  try {
    const { art_sec, art_cod, costo_inicial, cantidad, metodo, observaciones } = req.body;
    const usu_cod = req.usuario?.usu_cod || 'sistema';

    // Validaciones
    if (!art_sec && !art_cod) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere art_sec o art_cod'
      });
    }

    if (!costo_inicial || parseFloat(costo_inicial) < 0) {
      return res.status(400).json({
        success: false,
        message: 'El costo inicial debe ser un número mayor o igual a 0'
      });
    }

    const pool = await poolPromise;

    // 1. Buscar el artículo y sus precios
    const articuloQuery = `
      SELECT
        a.art_sec,
        a.art_cod,
        a.art_nom,
        ISNULL(ad_detal.art_bod_pre, 0) AS precio_venta_detal,
        ISNULL(ad_mayor.art_bod_pre, 0) AS precio_venta_mayor
      FROM dbo.articulos a
      LEFT JOIN dbo.articulosdetalle ad_detal ON ad_detal.art_sec = a.art_sec
        AND ad_detal.bod_sec = '1' AND ad_detal.lis_pre_cod = 1
      LEFT JOIN dbo.articulosdetalle ad_mayor ON ad_mayor.art_sec = a.art_sec
        AND ad_mayor.bod_sec = '1' AND ad_mayor.lis_pre_cod = 2
      WHERE ${art_sec ? 'a.art_sec = @art_sec' : 'a.art_cod = @art_cod'}
    `;

    const articuloResult = await pool.request()
      .input('art_sec', sql.VarChar(30), art_sec || null)
      .input('art_cod', sql.VarChar(30), art_cod || null)
      .query(articuloQuery);

    if (articuloResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Artículo no encontrado'
      });
    }

    const articulo = articuloResult.recordset[0];
    const costoNumerico = parseFloat(costo_inicial);
    const precioVenta = parseFloat(articulo.precio_venta_detal) || parseFloat(articulo.precio_venta_mayor) || 0;

    // 2. Calcular margen y determinar estado
    let margen = 0;
    let estado = 'PENDIENTE';
    let observacionesValidacion = observaciones || '';

    if (precioVenta > 0 && costoNumerico > 0) {
      margen = ((precioVenta - costoNumerico) / precioVenta) * 100;

      if (costoNumerico >= precioVenta) {
        estado = 'RECHAZADO';
        observacionesValidacion += ' | ERROR: Costo mayor o igual que precio venta';
      } else if (margen < 20) {
        estado = 'VALIDADO_CON_ALERTAS';
        observacionesValidacion += ' | ALERTA: Margen muy bajo (<20%)';
      } else {
        estado = 'VALIDADO';
      }
    } else if (costoNumerico === 0) {
      estado = 'PENDIENTE';
    } else {
      estado = 'RECHAZADO';
      observacionesValidacion += ' | ERROR: Sin precio de venta definido';
    }

    // 3. Insertar o actualizar en tabla temporal
    const upsertQuery = `
      MERGE INTO dbo.carga_inicial_costos AS target
      USING (SELECT @art_sec AS cic_art_sec) AS source
      ON target.cic_art_sec = source.cic_art_sec
      WHEN MATCHED THEN
        UPDATE SET
          cic_costo_propuesto = @costo_inicial,
          cic_metodo_calculo = @metodo,
          cic_observaciones = @observaciones,
          cic_estado = @estado
      WHEN NOT MATCHED THEN
        INSERT (
          cic_art_sec,
          cic_art_cod,
          cic_art_nom,
          cic_precio_venta_detal,
          cic_precio_venta_mayor,
          cic_costo_propuesto,
          cic_metodo_calculo,
          cic_observaciones,
          cic_estado,
          cic_usuario_carga,
          cic_fecha_carga
        )
        VALUES (
          @art_sec,
          @art_cod,
          @art_nom,
          @precio_detal,
          @precio_mayor,
          @costo_inicial,
          @metodo,
          @observaciones,
          @estado,
          @usu_cod,
          GETDATE()
        );
    `;

    await pool.request()
      .input('art_sec', sql.VarChar(30), articulo.art_sec)
      .input('art_cod', sql.VarChar(30), articulo.art_cod)
      .input('art_nom', sql.VarChar(100), articulo.art_nom)
      .input('precio_detal', sql.Decimal(17, 2), parseFloat(articulo.precio_venta_detal) || 0)
      .input('precio_mayor', sql.Decimal(17, 2), parseFloat(articulo.precio_venta_mayor) || 0)
      .input('costo_inicial', sql.Decimal(17, 2), costoNumerico)
      .input('metodo', sql.VarChar(50), metodo || 'MANUAL')
      .input('observaciones', sql.VarChar(500), observacionesValidacion)
      .input('estado', sql.VarChar(50), estado)
      .input('usu_cod', sql.VarChar(50), usu_cod)
      .query(upsertQuery);

    // 4. Devolver respuesta
    return res.json({
      success: true,
      message: estado === 'VALIDADO'
        ? 'Costo registrado exitosamente. Use /api/carga-costos/aplicar para confirmar.'
        : estado === 'VALIDADO_CON_ALERTAS'
        ? 'Costo registrado con alertas. Revise antes de aplicar.'
        : 'Costo rechazado. Corrija los errores antes de aplicar.',
      data: {
        art_sec: articulo.art_sec,
        art_cod: articulo.art_cod,
        art_nom: articulo.art_nom,
        costo_propuesto: costoNumerico,
        precio_venta: precioVenta,
        margen: margen.toFixed(2),
        estado,
        observaciones: observacionesValidacion,
        siguiente_paso: estado === 'RECHAZADO'
          ? 'Corrija el costo antes de aplicar'
          : 'Use POST /api/carga-costos/aplicar para confirmar'
      }
    });

  } catch (error) {
    console.error('Error registrando costo individual:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al registrar costo individual',
      error: error.message
    });
  }
};

/**
 * Aprobar costo individual (cambiar de VALIDADO_CON_ALERTAS a VALIDADO)
 * PUT /api/carga-costos/aprobar/:art_cod
 */
const aprobarCostoIndividual = async (req, res) => {
  try {
    const { art_cod } = req.params;
    const { observaciones } = req.body;
    const usu_cod = req.usuario?.usu_cod || 'sistema';

    if (!art_cod) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere art_cod'
      });
    }

    const pool = await poolPromise;

    // 1. Verificar que existe y obtener datos actuales
    const checkQuery = `
      SELECT
        cic_art_cod,
        cic_art_nom,
        cic_estado,
        cic_margen_resultante_detal,
        cic_observaciones
      FROM dbo.carga_inicial_costos
      WHERE cic_art_cod = @art_cod
    `;

    const checkResult = await pool.request()
      .input('art_cod', sql.VarChar(30), art_cod)
      .query(checkQuery);

    if (checkResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No se encontró costo para el artículo ${art_cod}`
      });
    }

    const costoActual = checkResult.recordset[0];

    // 2. Verificar que el estado actual permite la aprobación
    if (costoActual.cic_estado !== 'VALIDADO_CON_ALERTAS' && costoActual.cic_estado !== 'RECHAZADO') {
      return res.status(400).json({
        success: false,
        message: `Solo se pueden aprobar costos con estado VALIDADO_CON_ALERTAS o RECHAZADO. Estado actual: ${costoActual.cic_estado}`
      });
    }

    // 3. Actualizar estado a VALIDADO
    const nuevaObservacion = (costoActual.cic_observaciones || '') +
      ` | Aprobado manualmente por ${usu_cod}: ${observaciones || 'Sin observaciones'}`;

    const updateQuery = `
      UPDATE dbo.carga_inicial_costos
      SET cic_estado = 'VALIDADO',
          cic_observaciones = @nuevaObservacion,
          cic_fecha_validacion = GETDATE(),
          cic_usuario_validacion = @usu_cod
      WHERE cic_art_cod = @art_cod
    `;

    await pool.request()
      .input('art_cod', sql.VarChar(30), art_cod)
      .input('nuevaObservacion', sql.VarChar(500), nuevaObservacion.substring(0, 500))
      .input('usu_cod', sql.VarChar(100), usu_cod)
      .query(updateQuery);

    return res.json({
      success: true,
      message: 'Costo aprobado exitosamente',
      data: {
        art_cod: costoActual.cic_art_cod,
        art_nom: costoActual.cic_art_nom,
        estado_anterior: costoActual.cic_estado,
        estado_nuevo: 'VALIDADO',
        margen: costoActual.cic_margen_resultante_detal,
        aprobado_por: usu_cod
      }
    });

  } catch (error) {
    console.error('Error aprobando costo individual:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al aprobar costo',
      error: error.message
    });
  }
};

/**
 * Actualizar estado masivamente
 * PUT /api/carga-costos/actualizar-estado
 *
 * Modo 1 (por estado): { estado_actual, nuevo_estado } → actualiza TODOS los registros en estado_actual
 * Modo 2 (por lista):  { art_cods: [...], nuevo_estado } → actualiza solo los art_cods indicados
 */
const aprobarCostosMasivo = async (req, res) => {
  try {
    const { estado_actual, nuevo_estado, art_cods, observaciones } = req.body;
    const usu_cod = req.body.usu_cod || req.usuario?.usu_cod || 'sistema';

    // Validar que se indicó al menos un modo de selección
    const porEstado = estado_actual && nuevo_estado;
    const porLista = art_cods && Array.isArray(art_cods) && art_cods.length > 0;

    if (!porEstado && !porLista) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere (estado_actual + nuevo_estado) o un array de art_cods'
      });
    }

    // Validar nuevo_estado
    const estadosValidos = ['VALIDADO', 'VALIDADO_CON_ALERTAS', 'PENDIENTE', 'RECHAZADO'];
    const estadoDestino = nuevo_estado || 'VALIDADO';
    if (!estadosValidos.includes(estadoDestino)) {
      return res.status(400).json({
        success: false,
        message: `nuevo_estado debe ser uno de: ${estadosValidos.join(', ')}`
      });
    }

    const pool = await poolPromise;
    let totalActualizados = 0;
    const errores = [];

    if (porEstado) {
      // MODO 1: Actualizar todos los registros del estado origen
      const estadosOrigen = ['PENDIENTE', 'VALIDADO', 'VALIDADO_CON_ALERTAS', 'RECHAZADO', 'APLICADO'];
      if (!estadosOrigen.includes(estado_actual)) {
        return res.status(400).json({
          success: false,
          message: `estado_actual debe ser uno de: ${estadosOrigen.join(', ')}`
        });
      }

      const result = await pool.request()
        .input('estado_actual', sql.VarChar(50), estado_actual)
        .input('nuevo_estado', sql.VarChar(50), estadoDestino)
        .input('usu_cod', sql.VarChar(100), usu_cod)
        .query(`
          UPDATE dbo.carga_inicial_costos
          SET cic_estado = @nuevo_estado,
              cic_fecha_validacion = GETDATE(),
              cic_usuario_validacion = @usu_cod
          WHERE cic_estado = @estado_actual
        `);

      totalActualizados = result.rowsAffected[0];

    } else {
      // MODO 2: Actualizar por lista de art_cods
      for (const art_cod of art_cods) {
        try {
          const checkResult = await pool.request()
            .input('art_cod', sql.VarChar(30), art_cod)
            .query('SELECT cic_art_cod, cic_estado FROM dbo.carga_inicial_costos WHERE cic_art_cod = @art_cod');

          if (checkResult.recordset.length === 0) {
            errores.push(`${art_cod}: No encontrado`);
            continue;
          }

          await pool.request()
            .input('art_cod', sql.VarChar(30), art_cod)
            .input('nuevo_estado', sql.VarChar(50), estadoDestino)
            .input('usu_cod', sql.VarChar(100), usu_cod)
            .query(`
              UPDATE dbo.carga_inicial_costos
              SET cic_estado = @nuevo_estado,
                  cic_fecha_validacion = GETDATE(),
                  cic_usuario_validacion = @usu_cod
              WHERE cic_art_cod = @art_cod
            `);

          totalActualizados++;
        } catch (error) {
          errores.push(`${art_cod}: ${error.message}`);
        }
      }
    }

    return res.json({
      success: true,
      message: porEstado
        ? `Estado actualizado: ${totalActualizados} registros de ${estado_actual} a ${estadoDestino}`
        : `Estados actualizados: ${totalActualizados}/${art_cods.length}`,
      data: {
        afectados: totalActualizados,
        errores: errores.length > 0 ? errores : undefined
      }
    });

  } catch (error) {
    console.error('Error actualizando estados:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al actualizar estados',
      error: error.message
    });
  }
};

/**
 * Actualizar costos masivamente directo en articulosdetalle
 * POST /api/carga-costos/actualizar-costos-masivo
 *
 * A diferencia de calcular-automatico (que usa tabla staging y respeta costos existentes),
 * este endpoint actualiza DIRECTAMENTE art_bod_cos_cat con control por forzar:
 *   - forzar: false (default) → actualiza solo artículos con costo=0 O margen actual < margen parámetro
 *   - forzar: true            → actualiza absolutamente todos los artículos con precio configurado
 *
 * Registra cada cambio en historial_costos para auditoría.
 */
const actualizarCostosMasivo = async (req, res) => {
  try {
    const usuario      = req.body.usu_cod || req.user?.usu_cod || 'SYSTEM';
    const margen_mayor = parseFloat(req.body.margen_mayor) || 20;
    const margen_detal = parseFloat(req.body.margen_detal) || margen_mayor;
    const forzar       = req.body.forzar === true || req.body.forzar === 'true';

    const divisor_mayor = 1 + (margen_mayor / 100);
    const divisor_detal = 1 + (margen_detal / 100);

    const pool = await poolPromise;

    // 1. Obtener todos los artículos con al menos un precio configurado
    const productosResult = await pool.request().query(`
      SELECT
        a.art_sec,
        a.art_cod,
        a.art_nom,
        ISNULL(ve.existencia, 0)            AS existencia,
        ISNULL(ad_detal.art_bod_pre, 0)     AS precio_venta_detal,
        ISNULL(ad_mayor.art_bod_pre, 0)     AS precio_venta_mayor,
        ISNULL(ad_detal.art_bod_cos_cat, 0) AS costo_actual
      FROM dbo.articulos a
      LEFT JOIN dbo.vwExistencias ve
        ON ve.art_sec = a.art_sec
      LEFT JOIN dbo.articulosdetalle ad_detal
        ON ad_detal.art_sec = a.art_sec
        AND ad_detal.bod_sec = '1' AND ad_detal.lis_pre_cod = 1
      LEFT JOIN dbo.articulosdetalle ad_mayor
        ON ad_mayor.art_sec = a.art_sec
        AND ad_mayor.bod_sec = '1' AND ad_mayor.lis_pre_cod = 2
      WHERE ad_detal.art_bod_pre > 0 OR ad_mayor.art_bod_pre > 0
    `);

    const productos = productosResult.recordset;

    let total            = productos.length;
    let actualizados     = 0;
    let omitidos         = 0;
    let sin_precio       = 0;
    let calculados_mayor = 0;
    let calculados_detal = 0;
    const errores        = [];

    console.log(`[actualizarCostosMasivo] Inicio | total=${total} | margen_mayor=${margen_mayor}% | margen_detal=${margen_detal}% | forzar=${forzar}`);
    const tiempoInicio = Date.now();

    // 2. Calcular en JS qué artículos deben actualizarse y con qué costo
    const aActualizar = [];

    for (const prod of productos) {
      let precio_base, costo_calculado, fuente;

      if (prod.precio_venta_mayor > 0) {
        precio_base     = prod.precio_venta_mayor;
        costo_calculado = Math.round((precio_base / divisor_mayor) * 100) / 100;
        fuente          = 'mayor';
        calculados_mayor++;
      } else if (prod.precio_venta_detal > 0) {
        precio_base     = prod.precio_venta_detal;
        costo_calculado = Math.round((precio_base / divisor_detal) * 100) / 100;
        fuente          = 'detal';
        calculados_detal++;
      } else {
        sin_precio++;
        omitidos++;
        continue;
      }

      if (!forzar) {
        const margen_referencia = fuente === 'mayor' ? margen_mayor : margen_detal;
        const margen_actual = prod.costo_actual > 0 && precio_base > 0
          ? ((precio_base - prod.costo_actual) / precio_base) * 100
          : null;

        const debe_actualizar =
          prod.costo_actual === 0 ||
          margen_actual === null ||
          margen_actual < margen_referencia;

        if (!debe_actualizar) {
          omitidos++;
          fuente === 'mayor' ? calculados_mayor-- : calculados_detal--;
          continue;
        }
      }

      aActualizar.push({
        art_sec:         prod.art_sec,
        art_cod:         prod.art_cod,
        existencia:      prod.existencia,
        costo_anterior:  prod.costo_actual,
        costo_calculado,
        precio_base,
        fuente,
        metodo: fuente === 'mayor'
          ? `REVERSO_MAYOR_${margen_mayor}%`
          : `REVERSO_DETAL_${margen_detal}%`
      });
    }

    actualizados = aActualizar.length;
    console.log(`[actualizarCostosMasivo] Calculados en JS: ${actualizados} a actualizar, ${omitidos} omitidos, ${sin_precio} sin precio | ${((Date.now() - tiempoInicio)/1000).toFixed(1)}s`);

    // 3. Ejecutar en batches de 100 artículos (un UPDATE + un INSERT por batch)
    const BATCH_SIZE = 100;
    const batches = [];
    for (let i = 0; i < aActualizar.length; i += BATCH_SIZE) {
      batches.push(aActualizar.slice(i, i + BATCH_SIZE));
    }

    for (let bIdx = 0; bIdx < batches.length; bIdx++) {
      const batch = batches[bIdx];
      const elapsed = ((Date.now() - tiempoInicio) / 1000).toFixed(1);
      console.log(`[actualizarCostosMasivo] Batch ${bIdx + 1}/${batches.length} (${batch.length} arts) | ${elapsed}s`);

      const transaction = new sql.Transaction(pool);
      await transaction.begin();

      try {
        // UPDATE masivo: UPDATE articulosdetalle SET ... FROM ... JOIN (VALUES(...)) AS v
        const updateRows = batch
          .map((r, i) => `(@sec${i}, @cos${i})`)
          .join(',\n              ');

        const updateReq = transaction.request();
        batch.forEach((r, i) => {
          updateReq.input(`sec${i}`, sql.VarChar(30),    r.art_sec);
          updateReq.input(`cos${i}`, sql.Decimal(17, 2), r.costo_calculado);
        });

        await updateReq.query(`
          UPDATE ad
          SET ad.art_bod_cos_cat = v.costo
          FROM dbo.articulosdetalle ad
          INNER JOIN (VALUES ${updateRows}) AS v(art_sec, costo)
            ON ad.art_sec = v.art_sec
          WHERE ad.bod_sec = '1'
        `);

        // INSERT masivo en historial_costos
        const insertRows = batch
          .map((r, i) => `(@hs${i}, NULL, GETDATE(), 'AJUSTE_MANUAL', @qb${i}, @cb${i}, @vb${i}, 0, @cd${i}, 0, @qb${i}, @cd${i}, @vd${i}, @usr, @obs${i})`)
          .join(',\n              ');

        const insertReq = transaction.request();
        insertReq.input('usr', sql.VarChar(100), usuario);
        batch.forEach((r, i) => {
          insertReq.input(`hs${i}`,  sql.VarChar(30),    r.art_sec);
          insertReq.input(`qb${i}`,  sql.Decimal(17, 2), r.existencia);
          insertReq.input(`cb${i}`,  sql.Decimal(17, 2), r.costo_anterior);
          insertReq.input(`vb${i}`,  sql.Decimal(17, 2), r.existencia * r.costo_anterior);
          insertReq.input(`cd${i}`,  sql.Decimal(17, 2), r.costo_calculado);
          insertReq.input(`vd${i}`,  sql.Decimal(17, 2), r.existencia * r.costo_calculado);
          insertReq.input(`obs${i}`, sql.VarChar(500),
            `Ajuste masivo | ${r.metodo} | Base: $${r.precio_base} | Antes: $${r.costo_anterior} | Nuevo: $${r.costo_calculado} | forzar: ${forzar}`
          );
        });

        await insertReq.query(`
          INSERT INTO dbo.historial_costos (
            hc_art_sec, hc_fac_sec, hc_fecha, hc_tipo_mov,
            hc_cantidad_antes, hc_costo_antes, hc_valor_antes,
            hc_cantidad_mov,   hc_costo_mov,   hc_valor_mov,
            hc_cantidad_despues, hc_costo_despues, hc_valor_despues,
            hc_usu_cod, hc_observaciones
          ) VALUES ${insertRows}
        `);

        await transaction.commit();

      } catch (errBatch) {
        try { await transaction.rollback(); } catch (_) { /* conexión ya cerrada */ }
        console.error(`[actualizarCostosMasivo] ERROR en batch ${bIdx + 1}: ${errBatch.message}`);
        // Registrar artículos del batch fallido
        batch.forEach(r => errores.push(`${r.art_cod}: batch error - ${errBatch.message}`));
        actualizados -= batch.length;
        omitidos     += batch.length;
      }
    }

    const totalSegundos = ((Date.now() - tiempoInicio) / 1000).toFixed(1);
    console.log(`[actualizarCostosMasivo] Finalizado | total=${total} | actualizados=${actualizados} | omitidos=${omitidos} | errores=${errores.length} | tiempo=${totalSegundos}s`);

    return res.json({
      success: true,
      message: `Actualización masiva completada. ${actualizados} artículos actualizados.`,
      data: {
        total,
        actualizados,
        omitidos,
        sin_precio,
        calculados_desde_mayor: calculados_mayor,
        calculados_desde_detal: calculados_detal,
        errores_count: errores.length,
        errores: errores.length > 0 ? errores : undefined,
        parametros_usados: {
          margen_mayor:  `${margen_mayor}%`,
          margen_detal:  `${margen_detal}%`,
          forzar,
          formulas: {
            desde_mayor: `Costo = Precio Mayor / ${divisor_mayor.toFixed(2)}`,
            desde_detal: `Costo = Precio Detal / ${divisor_detal.toFixed(2)}`
          }
        }
      }
    });

  } catch (error) {
    console.error('Error en actualización masiva de costos:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al actualizar costos masivamente',
      error: error.message
    });
  }
};

module.exports = {
  exportarPlantillaCostos,
  importarCostosDesdeExcel,
  obtenerResumenCarga,
  obtenerProductosConAlertas,
  calcularCostosAutomatico,
  aplicarCostosValidados,
  registrarCostoIndividual,
  aprobarCostoIndividual,
  aprobarCostosMasivo,
  actualizarCostosMasivo
};
