/**
 * Controlador: Compras con Costo Promedio Ponderado
 * Fecha: 2026-02-16
 * Descripción: Endpoints para gestión de compras
 *              SIN Stored Procedures (lógica en JavaScript)
 *              Database-agnostic para facilitar migración futura
 *
 * CORRECCIÓN: Alineado con estructura real de BD (nit_sec, no nit_cod)
 */

const {
  registrarCompra,
  obtenerHistorialCompras,
  obtenerDetalleCompra
} = require('../models/compraModel');

/**
 * POST /api/compras
 * Registra una nueva compra con cálculo automático de costo promedio
 *
 * Body:
 * {
 *   "nit_sec": "900123456",
 *   "fac_fec": "2026-02-15",
 *   "fac_obs": "Compra de mercancía febrero",
 *   "detalles": [
 *     {
 *       "art_sec": "ART001",
 *       "cantidad": 100,
 *       "costo_unitario": 25000
 *     }
 *   ]
 * }
 */
const crearCompra = async (req, res) => {
  try {
    // Validaciones básicas
    const { nit_sec, fac_fec, detalles } = req.body;

    if (!nit_sec) {
      return res.status(400).json({
        success: false,
        message: 'El código del proveedor (nit_sec) es requerido'
      });
    }

    if (!fac_fec) {
      return res.status(400).json({
        success: false,
        message: 'La fecha de compra (fac_fec) es requerida'
      });
    }

    if (!detalles || !Array.isArray(detalles) || detalles.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Debe incluir al menos un detalle de compra'
      });
    }

    // Validar cada detalle
    for (let i = 0; i < detalles.length; i++) {
      const detalle = detalles[i];

      if (!detalle.art_sec) {
        return res.status(400).json({
          success: false,
          message: `Detalle ${i + 1}: art_sec es requerido`
        });
      }

      if (!detalle.cantidad || parseFloat(detalle.cantidad) <= 0) {
        return res.status(400).json({
          success: false,
          message: `Detalle ${i + 1}: cantidad debe ser mayor a 0`
        });
      }

      if (!detalle.costo_unitario || parseFloat(detalle.costo_unitario) <= 0) {
        return res.status(400).json({
          success: false,
          message: `Detalle ${i + 1}: costo_unitario debe ser mayor a 0`
        });
      }
    }

    // Obtener usuario del token JWT
    const usu_cod = req.user?.usu_cod || 'SYSTEM';

    // Registrar compra
    const resultado = await registrarCompra({
      nit_sec,
      fac_fec,
      fac_obs: req.body.fac_obs || '',
      usu_cod,
      detalles
    });

    res.status(201).json({
      success: true,
      message: 'Compra registrada exitosamente',
      data: {
        fac_sec: resultado.fac_sec,
        fac_nro: resultado.fac_nro,
        total_items: resultado.total_items,
        total_valor: resultado.total_valor,
        detalles_actualizacion: resultado.detalles_actualizacion
      }
    });

  } catch (error) {
    console.error('Error en crearCompra:', error);
    res.status(500).json({
      success: false,
      message: 'Error registrando compra',
      error: error.message
    });
  }
};

/**
 * GET /api/compras
 * Obtiene el historial de compras con filtros opcionales
 *
 * Query params:
 * - fecha_desde: Fecha inicio (YYYY-MM-DD)
 * - fecha_hasta: Fecha fin (YYYY-MM-DD)
 * - nit_sec: Código del proveedor
 * - limit: Límite de registros (default: 100)
 */
const listarCompras = async (req, res) => {
  try {
    const filtros = {
      fecha_desde: req.query.fecha_desde,
      fecha_hasta: req.query.fecha_hasta,
      nit_sec: req.query.nit_sec,
      limit: parseInt(req.query.limit) || 100
    };

    const compras = await obtenerHistorialCompras(filtros);

    res.status(200).json({
      success: true,
      data: compras,
      total: compras.length,
      filtros_aplicados: filtros
    });

  } catch (error) {
    console.error('Error en listarCompras:', error);
    res.status(500).json({
      success: false,
      message: 'Error obteniendo historial de compras',
      error: error.message
    });
  }
};

/**
 * GET /api/compras/:fac_nro
 * Obtiene el detalle completo de una compra
 */
const obtenerCompra = async (req, res) => {
  try {
    const { fac_nro } = req.params;

    if (!fac_nro) {
      return res.status(400).json({
        success: false,
        message: 'El número de compra (fac_nro) es requerido'
      });
    }

    const compra = await obtenerDetalleCompra(fac_nro);

    res.status(200).json({
      success: true,
      data: compra
    });

  } catch (error) {
    if (error.message.includes('no encontrada')) {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }

    console.error('Error en obtenerCompra:', error);
    res.status(500).json({
      success: false,
      message: 'Error obteniendo detalle de compra',
      error: error.message
    });
  }
};

/**
 * GET /api/compras/reportes/variacion-costos
 * Obtiene un reporte de variación de costos por artículo
 *
 * Query params:
 * - fecha_desde: Fecha inicio (YYYY-MM-DD)
 * - fecha_hasta: Fecha fin (YYYY-MM-DD)
 * - limit: Límite de registros (default: 50)
 */
const reporteVariacionCostos = async (req, res) => {
  try {
    const { poolPromise, sql } = require('../db');
    const pool = await poolPromise;

    const fecha_desde = req.query.fecha_desde;
    const fecha_hasta = req.query.fecha_hasta;
    const limit = parseInt(req.query.limit) || 50;

    let query = `
      SELECT TOP (@limit)
        hc.hc_art_sec,
        a.art_cod,
        a.art_nom,
        COUNT(*) AS total_cambios,
        MIN(hc.hc_costo_antes) AS costo_minimo,
        MAX(hc.hc_costo_despues) AS costo_maximo,
        AVG(hc.hc_costo_despues) AS costo_promedio,
        (MAX(hc.hc_costo_despues) - MIN(hc.hc_costo_antes)) AS variacion_absoluta,
        CASE
          WHEN MIN(hc.hc_costo_antes) > 0
          THEN ((MAX(hc.hc_costo_despues) - MIN(hc.hc_costo_antes)) / MIN(hc.hc_costo_antes) * 100)
          ELSE 0
        END AS variacion_porcentual,
        MAX(hc.hc_fecha) AS ultima_actualizacion
      FROM dbo.historial_costos hc
      INNER JOIN dbo.articulos a ON a.art_sec = hc.hc_art_sec
      WHERE hc.hc_tipo_mov = 'COMPRA'
    `;

    const request = pool.request();
    request.input('limit', sql.Int, limit);

    if (fecha_desde) {
      query += ` AND hc.hc_fecha >= @fecha_desde`;
      request.input('fecha_desde', sql.Date, fecha_desde);
    }

    if (fecha_hasta) {
      query += ` AND hc.hc_fecha <= @fecha_hasta`;
      request.input('fecha_hasta', sql.Date, fecha_hasta);
    }

    query += `
      GROUP BY hc.hc_art_sec, a.art_cod, a.art_nom
      ORDER BY variacion_porcentual DESC
    `;

    const result = await request.query(query);

    res.status(200).json({
      success: true,
      data: result.recordset,
      total: result.recordset.length,
      filtros: {
        fecha_desde: fecha_desde || 'Todas',
        fecha_hasta: fecha_hasta || 'Todas',
        limit
      }
    });

  } catch (error) {
    console.error('Error en reporteVariacionCostos:', error);
    res.status(500).json({
      success: false,
      message: 'Error generando reporte de variación de costos',
      error: error.message
    });
  }
};

/**
 * GET /api/compras/reportes/por-proveedor
 * Obtiene un reporte de compras agrupado por proveedor
 *
 * Query params:
 * - fecha_desde: Fecha inicio (YYYY-MM-DD)
 * - fecha_hasta: Fecha fin (YYYY-MM-DD)
 */
const reporteComprasPorProveedor = async (req, res) => {
  try {
    const { poolPromise, sql } = require('../db');
    const pool = await poolPromise;

    const fecha_desde = req.query.fecha_desde;
    const fecha_hasta = req.query.fecha_hasta;

    let query = `
      SELECT
        f.nit_sec,
        n.nit_nom AS proveedor,
        COUNT(DISTINCT f.fac_nro) AS total_compras,
        ISNULL(SUM(fk.kar_total), 0) AS valor_total,
        ISNULL(AVG(fk.kar_total), 0) AS valor_promedio,
        MIN(f.fac_fec) AS primera_compra,
        MAX(f.fac_fec) AS ultima_compra
      FROM dbo.factura f
      LEFT JOIN dbo.nit n ON n.nit_sec = f.nit_sec
      LEFT JOIN dbo.facturakardes fk ON fk.fac_sec = f.fac_sec
      WHERE f.fac_tip_cod = 'COM'
        AND f.fac_est_fac = 'A'
    `;

    const request = pool.request();

    if (fecha_desde) {
      query += ` AND f.fac_fec >= @fecha_desde`;
      request.input('fecha_desde', sql.Date, fecha_desde);
    }

    if (fecha_hasta) {
      query += ` AND f.fac_fec <= @fecha_hasta`;
      request.input('fecha_hasta', sql.Date, fecha_hasta);
    }

    query += `
      GROUP BY f.nit_sec, n.nit_nom
      ORDER BY valor_total DESC
    `;

    const result = await request.query(query);

    res.status(200).json({
      success: true,
      data: result.recordset,
      total_proveedores: result.recordset.length,
      filtros: {
        fecha_desde: fecha_desde || 'Todas',
        fecha_hasta: fecha_hasta || 'Todas'
      }
    });

  } catch (error) {
    console.error('Error en reporteComprasPorProveedor:', error);
    res.status(500).json({
      success: false,
      message: 'Error generando reporte por proveedor',
      error: error.message
    });
  }
};

/**
 * GET /api/compras/reportes/valorizado-inventario
 * Obtiene el valorizado de inventario con análisis de rotación y clasificación ABC
 *
 * Query params:
 * - inv_sub_gru_cod: Código de subcategoría
 * - fecha_compra_desde: Fecha inicio (YYYY-MM-DD)
 * - fecha_compra_hasta: Fecha fin (YYYY-MM-DD)
 * - limit: Límite de registros (default: 100, max: 1000)
 * - offset: Offset para paginación (default: 0)
 *
 * Nota: No existe campo art_est en articulos, se incluyen todos los artículos con costo
 */
const reporteValorizadoInventario = async (req, res) => {
  try {
    // Validar parámetros
    const filtros = {};

    if (req.query.inv_sub_gru_cod) {
      const subgrupo = parseInt(req.query.inv_sub_gru_cod);
      if (isNaN(subgrupo)) {
        return res.status(400).json({
          success: false,
          message: 'inv_sub_gru_cod debe ser un número'
        });
      }
      filtros.inv_sub_gru_cod = subgrupo;
    }

    if (req.query.fecha_compra_desde) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(req.query.fecha_compra_desde)) {
        return res.status(400).json({
          success: false,
          message: 'fecha_compra_desde debe tener formato YYYY-MM-DD'
        });
      }
      filtros.fecha_compra_desde = req.query.fecha_compra_desde;
    }

    if (req.query.fecha_compra_hasta) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(req.query.fecha_compra_hasta)) {
        return res.status(400).json({
          success: false,
          message: 'fecha_compra_hasta debe tener formato YYYY-MM-DD'
        });
      }
      filtros.fecha_compra_hasta = req.query.fecha_compra_hasta;
    }

    filtros.limit = Math.min(parseInt(req.query.limit) || 100, 1000);
    filtros.offset = parseInt(req.query.offset) || 0;

    // Obtener datos del modelo
    const { obtenerValorizadoInventario } = require('../models/compraModel');
    const resultado = await obtenerValorizadoInventario(filtros);

    const {
      articulos,
      articulos_sin_costo,
      total_articulos_global,
      valor_total_global,
      clasificacion_abc_global
    } = resultado;

    // IMPORTANTE: Usar valores globales para el resumen (no solo la página actual)
    const valor_total_inventario = valor_total_global;

    // Calcular días sin movimiento y preparar para clasificación ABC
    const hoy = new Date();
    const articulosConIndicadores = articulos.map(art => {
      const ultima_venta = art.ultima_venta ? new Date(art.ultima_venta) : null;
      const ultima_compra = art.ultima_compra ? new Date(art.ultima_compra) : null;

      const dias_sin_venta = ultima_venta
        ? Math.floor((hoy - ultima_venta) / (1000 * 60 * 60 * 24))
        : null;

      const dias_sin_compra = ultima_compra
        ? Math.floor((hoy - ultima_compra) / (1000 * 60 * 60 * 24))
        : null;

      return {
        art_sec: art.art_sec,
        art_cod: art.art_cod,
        art_nom: art.art_nom,
        inv_sub_gru_cod: art.inv_sub_gru_cod,
        subcategoria_nombre: art.subcategoria_nombre,
        existencia: parseFloat(art.existencia),
        costo_unitario: parseFloat(art.costo_unitario),
        valor_total: parseFloat(art.valor_total),
        ultima_compra: art.ultima_compra,
        ultima_venta: art.ultima_venta,
        dias_sin_venta,
        dias_sin_compra,
        tiene_stock: parseFloat(art.existencia) > 0,
        rotacion_activa: dias_sin_venta !== null && dias_sin_venta <= 30,
        requiere_reorden: dias_sin_venta !== null && dias_sin_venta > 90 && parseFloat(art.existencia) > 0
      };
    });

    // Calcular clasificación ABC individual solo para los artículos paginados
    // Nota: La clasificación se calcula globalmente en el modelo, aquí solo asignamos
    const articulosClasificados = articulosConIndicadores.map(articulo => {
      const porcentaje_valor_total = valor_total_inventario > 0
        ? parseFloat(((articulo.valor_total / valor_total_inventario) * 100).toFixed(2))
        : 0;

      // Determinar clasificación basado en valor acumulado global
      // (Simplificación: asignamos según porcentaje individual como aproximación)
      // La clasificación precisa viene del cálculo global del modelo
      let clasificacion_abc;
      if (porcentaje_valor_total >= 1) {
        clasificacion_abc = 'A';  // Productos de alto valor individual
      } else if (porcentaje_valor_total >= 0.1) {
        clasificacion_abc = 'B';
      } else {
        clasificacion_abc = 'C';
      }

      return {
        ...articulo,
        clasificacion_abc,
        porcentaje_valor_total
      };
    });

    // Construir resumen usando datos GLOBALES calculados en el modelo
    const clasificacion_abc_resumen = {
      tipo_a: {
        articulos: clasificacion_abc_global.A.cantidad,
        valor: clasificacion_abc_global.A.valor,
        porcentaje: valor_total_inventario > 0
          ? parseFloat(((clasificacion_abc_global.A.valor / valor_total_inventario) * 100).toFixed(1))
          : 0
      },
      tipo_b: {
        articulos: clasificacion_abc_global.B.cantidad,
        valor: clasificacion_abc_global.B.valor,
        porcentaje: valor_total_inventario > 0
          ? parseFloat(((clasificacion_abc_global.B.valor / valor_total_inventario) * 100).toFixed(1))
          : 0
      },
      tipo_c: {
        articulos: clasificacion_abc_global.C.cantidad,
        valor: clasificacion_abc_global.C.valor,
        porcentaje: valor_total_inventario > 0
          ? parseFloat(((clasificacion_abc_global.C.valor / valor_total_inventario) * 100).toFixed(1))
          : 0
      }
    };

    res.status(200).json({
      success: true,
      data: {
        resumen: {
          total_articulos: total_articulos_global,  // ← GLOBAL (no paginado)
          articulos_sin_costo,
          valor_total_inventario: parseFloat(valor_total_inventario.toFixed(2)),  // ← GLOBAL
          clasificacion_abc: clasificacion_abc_resumen  // ← GLOBAL
        },
        articulos: articulosClasificados,
        total_registros: articulosClasificados.length,  // ← Paginado
        limit: filtros.limit,
        offset: filtros.offset,
        filtros_aplicados: filtros
      }
    });

  } catch (error) {
    console.error('Error en reporteValorizadoInventario:', error);
    res.status(500).json({
      success: false,
      message: 'Error generando reporte de valorizado de inventario',
      error: error.message
    });
  }
};

/**
 * GET /api/compras/reportes/articulos-sin-costo
 * Obtiene listado de artículos sin costo asignado
 *
 * Query params:
 * - inv_sub_gru_cod: Código de subcategoría
 * - solo_con_existencia: boolean (default: false) - Solo artículos con stock
 * - limit: Límite de registros (default: 100, max: 1000)
 * - offset: Offset para paginación (default: 0)
 */
const reporteArticulosSinCosto = async (req, res) => {
  try {
    const filtros = {};

    if (req.query.inv_sub_gru_cod) {
      const subgrupo = parseInt(req.query.inv_sub_gru_cod);
      if (isNaN(subgrupo)) {
        return res.status(400).json({
          success: false,
          message: 'inv_sub_gru_cod debe ser un número'
        });
      }
      filtros.inv_sub_gru_cod = subgrupo;
    }

    if (req.query.solo_con_existencia !== undefined) {
      filtros.solo_con_existencia = req.query.solo_con_existencia === 'true';
    }

    filtros.limit = Math.min(parseInt(req.query.limit) || 100, 1000);
    filtros.offset = parseInt(req.query.offset) || 0;

    // Obtener datos del modelo
    const { obtenerArticulosSinCosto } = require('../models/compraModel');
    const articulos = await obtenerArticulosSinCosto(filtros);

    // Calcular costo sugerido basado en precio mayor (usando la fórmula de Fase 0)
    const margenSugerido = 20; // 20% de margen por defecto
    const articulosConSugerencia = articulos.map(art => ({
      ...art,
      existencia: parseFloat(art.existencia),
      precio_mayor: parseFloat(art.precio_mayor) || 0,
      precio_detal: parseFloat(art.precio_detal) || 0,
      costo_sugerido: art.precio_mayor
        ? parseFloat((art.precio_mayor / (1 + margenSugerido / 100)).toFixed(2))
        : 0
    }));

    res.status(200).json({
      success: true,
      data: {
        total_articulos: articulosConSugerencia.length,
        margen_sugerido: margenSugerido,
        articulos: articulosConSugerencia,
        filtros_aplicados: filtros
      }
    });

  } catch (error) {
    console.error('Error en reporteArticulosSinCosto:', error);
    res.status(500).json({
      success: false,
      message: 'Error obteniendo artículos sin costo',
      error: error.message
    });
  }
};

module.exports = {
  crearCompra,
  listarCompras,
  obtenerCompra,
  reporteVariacionCostos,
  reporteComprasPorProveedor,
  reporteValorizadoInventario,
  reporteArticulosSinCosto
};
