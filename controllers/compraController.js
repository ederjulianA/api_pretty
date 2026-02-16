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
  actualizarCompra,
  obtenerHistorialCompras,
  obtenerDetalleCompra,
  obtenerValorizadoPorCategorias,
  obtenerValorizadoPorSubcategorias,
  obtenerArticulosPorSubcategoria
} = require('../models/compraModel');

const { syncDocumentStockToWoo } = require('../utils/wooStockSync');

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

    // Sincronizar stock con WooCommerce (modo silencioso para no bloquear la compra)
    let wooSyncResult = null;
    try {
      wooSyncResult = await syncDocumentStockToWoo(resultado.fac_nro, { silent: true });
    } catch (wooError) {
      console.warn('Error sincronizando stock con WooCommerce:', wooError.message);
      // No bloqueamos la respuesta por error de WooCommerce
    }

    res.status(201).json({
      success: true,
      message: 'Compra registrada exitosamente',
      data: {
        fac_sec: resultado.fac_sec,
        fac_nro: resultado.fac_nro,
        total_items: resultado.total_items,
        total_valor: resultado.total_valor,
        detalles_actualizacion: resultado.detalles_actualizacion
      },
      woo_sync: wooSyncResult
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

    if (req.query.clasificacion_abc) {
      const clasificacion = req.query.clasificacion_abc.toUpperCase();
      if (!['A', 'B', 'C'].includes(clasificacion)) {
        return res.status(400).json({
          success: false,
          message: 'clasificacion_abc debe ser A, B o C'
        });
      }
      filtros.clasificacion_abc = clasificacion;
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

/**
 * GET /api/compras/reportes/valorizado-arbol/categorias
 * Obtiene valorizado de inventario agrupado por categorías (Nivel 1 del árbol)
 *
 * Query params:
 * - fecha_compra_desde: Fecha inicio (YYYY-MM-DD)
 * - fecha_compra_hasta: Fecha fin (YYYY-MM-DD)
 * - clasificacion_abc: Filtrar por tipo A, B o C
 * - solo_con_stock: boolean (true|false)
 */
const reporteValorizadoArbolCategorias = async (req, res) => {
  try {
    const filtros = {};

    // Validar fecha_compra_desde
    if (req.query.fecha_compra_desde) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(req.query.fecha_compra_desde)) {
        return res.status(400).json({
          success: false,
          message: 'fecha_compra_desde debe tener formato YYYY-MM-DD'
        });
      }
      filtros.fecha_compra_desde = req.query.fecha_compra_desde;
    }

    // Validar fecha_compra_hasta
    if (req.query.fecha_compra_hasta) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(req.query.fecha_compra_hasta)) {
        return res.status(400).json({
          success: false,
          message: 'fecha_compra_hasta debe tener formato YYYY-MM-DD'
        });
      }
      filtros.fecha_compra_hasta = req.query.fecha_compra_hasta;
    }

    // Validar clasificacion_abc
    if (req.query.clasificacion_abc) {
      const clasificacion = req.query.clasificacion_abc.toUpperCase();
      if (!['A', 'B', 'C'].includes(clasificacion)) {
        return res.status(400).json({
          success: false,
          message: 'clasificacion_abc debe ser A, B o C'
        });
      }
      filtros.clasificacion_abc = clasificacion;
    }

    // Validar solo_con_stock
    if (req.query.solo_con_stock !== undefined) {
      if (!['true', 'false'].includes(req.query.solo_con_stock.toLowerCase())) {
        return res.status(400).json({
          success: false,
          message: 'solo_con_stock debe ser true o false'
        });
      }
      filtros.solo_con_stock = req.query.solo_con_stock.toLowerCase() === 'true';
    }

    // Obtener datos del modelo
    const resultado = await obtenerValorizadoPorCategorias(filtros);

    res.status(200).json({
      success: true,
      data: resultado.categorias,
      resumen_global: resultado.resumen_global,
      filtros_aplicados: filtros
    });

  } catch (error) {
    console.error('Error en reporteValorizadoArbolCategorias:', error);
    res.status(500).json({
      success: false,
      message: 'Error generando reporte de valorizado por categorías',
      error: error.message
    });
  }
};

/**
 * GET /api/compras/reportes/valorizado-arbol/categorias/:inv_gru_cod/subcategorias
 * Obtiene valorizado de inventario agrupado por subcategorías de una categoría (Nivel 2 del árbol)
 *
 * Path params:
 * - inv_gru_cod: Código de categoría padre
 *
 * Query params:
 * - fecha_compra_desde: Fecha inicio (YYYY-MM-DD)
 * - fecha_compra_hasta: Fecha fin (YYYY-MM-DD)
 * - clasificacion_abc: Filtrar por tipo A, B o C
 * - solo_con_stock: boolean (true|false)
 */
const reporteValorizadoArbolSubcategorias = async (req, res) => {
  try {
    const { inv_gru_cod } = req.params;

    if (!inv_gru_cod) {
      return res.status(400).json({
        success: false,
        message: 'inv_gru_cod es requerido'
      });
    }

    const filtros = {};

    // Validar fecha_compra_desde
    if (req.query.fecha_compra_desde) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(req.query.fecha_compra_desde)) {
        return res.status(400).json({
          success: false,
          message: 'fecha_compra_desde debe tener formato YYYY-MM-DD'
        });
      }
      filtros.fecha_compra_desde = req.query.fecha_compra_desde;
    }

    // Validar fecha_compra_hasta
    if (req.query.fecha_compra_hasta) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(req.query.fecha_compra_hasta)) {
        return res.status(400).json({
          success: false,
          message: 'fecha_compra_hasta debe tener formato YYYY-MM-DD'
        });
      }
      filtros.fecha_compra_hasta = req.query.fecha_compra_hasta;
    }

    // Validar clasificacion_abc
    if (req.query.clasificacion_abc) {
      const clasificacion = req.query.clasificacion_abc.toUpperCase();
      if (!['A', 'B', 'C'].includes(clasificacion)) {
        return res.status(400).json({
          success: false,
          message: 'clasificacion_abc debe ser A, B o C'
        });
      }
      filtros.clasificacion_abc = clasificacion;
    }

    // Validar solo_con_stock
    if (req.query.solo_con_stock !== undefined) {
      if (!['true', 'false'].includes(req.query.solo_con_stock.toLowerCase())) {
        return res.status(400).json({
          success: false,
          message: 'solo_con_stock debe ser true o false'
        });
      }
      filtros.solo_con_stock = req.query.solo_con_stock.toLowerCase() === 'true';
    }

    // Obtener datos del modelo
    const resultado = await obtenerValorizadoPorSubcategorias(inv_gru_cod, filtros);

    res.status(200).json({
      success: true,
      data: resultado.subcategorias,
      filtros_aplicados: {
        inv_gru_cod,
        ...filtros
      }
    });

  } catch (error) {
    console.error('Error en reporteValorizadoArbolSubcategorias:', error);
    res.status(500).json({
      success: false,
      message: 'Error generando reporte de valorizado por subcategorías',
      error: error.message
    });
  }
};

/**
 * GET /api/compras/reportes/valorizado-arbol/subcategorias/:inv_sub_gru_cod/articulos
 * Obtiene artículos valorizados de una subcategoría (Nivel 3 del árbol)
 *
 * Path params:
 * - inv_sub_gru_cod: Código de subcategoría
 *
 * Query params:
 * - fecha_compra_desde: Fecha inicio (YYYY-MM-DD)
 * - fecha_compra_hasta: Fecha fin (YYYY-MM-DD)
 * - clasificacion_abc: Filtrar por tipo A, B o C
 * - solo_con_stock: boolean (true|false)
 * - limit: Límite de registros (default: 100, max: 1000)
 * - offset: Offset para paginación (default: 0)
 */
const reporteValorizadoArbolArticulos = async (req, res) => {
  try {
    const { inv_sub_gru_cod } = req.params;

    if (!inv_sub_gru_cod) {
      return res.status(400).json({
        success: false,
        message: 'inv_sub_gru_cod es requerido'
      });
    }

    const subgrupo = parseInt(inv_sub_gru_cod);
    if (isNaN(subgrupo)) {
      return res.status(400).json({
        success: false,
        message: 'inv_sub_gru_cod debe ser un número'
      });
    }

    const filtros = {};

    // Validar fecha_compra_desde
    if (req.query.fecha_compra_desde) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(req.query.fecha_compra_desde)) {
        return res.status(400).json({
          success: false,
          message: 'fecha_compra_desde debe tener formato YYYY-MM-DD'
        });
      }
      filtros.fecha_compra_desde = req.query.fecha_compra_desde;
    }

    // Validar fecha_compra_hasta
    if (req.query.fecha_compra_hasta) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(req.query.fecha_compra_hasta)) {
        return res.status(400).json({
          success: false,
          message: 'fecha_compra_hasta debe tener formato YYYY-MM-DD'
        });
      }
      filtros.fecha_compra_hasta = req.query.fecha_compra_hasta;
    }

    // Validar clasificacion_abc
    if (req.query.clasificacion_abc) {
      const clasificacion = req.query.clasificacion_abc.toUpperCase();
      if (!['A', 'B', 'C'].includes(clasificacion)) {
        return res.status(400).json({
          success: false,
          message: 'clasificacion_abc debe ser A, B o C'
        });
      }
      filtros.clasificacion_abc = clasificacion;
    }

    // Validar solo_con_stock
    if (req.query.solo_con_stock !== undefined) {
      if (!['true', 'false'].includes(req.query.solo_con_stock.toLowerCase())) {
        return res.status(400).json({
          success: false,
          message: 'solo_con_stock debe ser true o false'
        });
      }
      filtros.solo_con_stock = req.query.solo_con_stock.toLowerCase() === 'true';
    }

    // Validar limit y offset
    filtros.limit = Math.min(parseInt(req.query.limit) || 100, 1000);
    filtros.offset = parseInt(req.query.offset) || 0;

    // Obtener datos del modelo (reutiliza función existente)
    const resultado = await obtenerArticulosPorSubcategoria(subgrupo, filtros);

    res.status(200).json({
      success: true,
      data: {
        articulos: resultado.articulos || [],
        total_registros: resultado.articulos ? resultado.articulos.length : 0,
        limit: filtros.limit,
        offset: filtros.offset
      },
      filtros_aplicados: {
        inv_sub_gru_cod: subgrupo,
        ...filtros
      }
    });

  } catch (error) {
    console.error('Error en reporteValorizadoArbolArticulos:', error);
    res.status(500).json({
      success: false,
      message: 'Error generando reporte de artículos por subcategoría',
      error: error.message
    });
  }
};

/**
 * PUT /api/compras/:fac_nro
 * Actualiza una compra existente (encabezado y/o detalles)
 *
 * Body (todos los campos son opcionales):
 * {
 *   "fac_fec": "2026-02-16",
 *   "nit_sec": "900123456",
 *   "fac_obs": "Observaciones actualizadas",
 *   "fac_est_fac": "A",  // A=Activa, I=Inactiva, C=Cancelada
 *   "detalles": [
 *     {
 *       "kar_sec": 1,
 *       "cantidad": 150,
 *       "costo_unitario": 26500
 *     }
 *   ]
 * }
 */
const modificarCompra = async (req, res) => {
  try {
    const { fac_nro } = req.params;

    if (!fac_nro) {
      return res.status(400).json({
        success: false,
        message: 'El número de compra (fac_nro) es requerido'
      });
    }

    // Validaciones de campos opcionales
    const datosActualizacion = {};

    // Validar fecha si se proporciona
    if (req.body.fac_fec !== undefined) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(req.body.fac_fec)) {
        return res.status(400).json({
          success: false,
          message: 'fac_fec debe tener formato YYYY-MM-DD'
        });
      }
      datosActualizacion.fac_fec = req.body.fac_fec;
    }

    // Validar proveedor si se proporciona
    if (req.body.nit_sec !== undefined) {
      if (!req.body.nit_sec || req.body.nit_sec.trim() === '') {
        return res.status(400).json({
          success: false,
          message: 'nit_sec no puede estar vacío'
        });
      }
      datosActualizacion.nit_sec = req.body.nit_sec;
    }

    // Validar observaciones si se proporciona
    if (req.body.fac_obs !== undefined) {
      datosActualizacion.fac_obs = req.body.fac_obs || '';
    }

    // Validar estado si se proporciona
    if (req.body.fac_est_fac !== undefined) {
      const estadosValidos = ['A', 'I', 'C'];
      if (!estadosValidos.includes(req.body.fac_est_fac)) {
        return res.status(400).json({
          success: false,
          message: 'fac_est_fac debe ser A (Activa), I (Inactiva) o C (Cancelada)'
        });
      }
      datosActualizacion.fac_est_fac = req.body.fac_est_fac;
    }

    // Validar detalles si se proporcionan
    if (req.body.detalles !== undefined) {
      if (!Array.isArray(req.body.detalles)) {
        return res.status(400).json({
          success: false,
          message: 'detalles debe ser un array'
        });
      }

      // Validar cada detalle
      for (const detalle of req.body.detalles) {
        if (!detalle.kar_sec) {
          return res.status(400).json({
            success: false,
            message: 'Cada detalle debe tener kar_sec (secuencia del detalle)'
          });
        }

        if (detalle.cantidad !== undefined) {
          const cantidad = parseFloat(detalle.cantidad);
          if (isNaN(cantidad) || cantidad <= 0) {
            return res.status(400).json({
              success: false,
              message: `cantidad debe ser un número mayor a 0 (kar_sec ${detalle.kar_sec})`
            });
          }
        }

        if (detalle.costo_unitario !== undefined) {
          const costo = parseFloat(detalle.costo_unitario);
          if (isNaN(costo) || costo < 0) {
            return res.status(400).json({
              success: false,
              message: `costo_unitario debe ser un número mayor o igual a 0 (kar_sec ${detalle.kar_sec})`
            });
          }
        }

        // Validar que al menos se proporcione cantidad o costo
        if (detalle.cantidad === undefined && detalle.costo_unitario === undefined) {
          return res.status(400).json({
            success: false,
            message: `Debe proporcionar cantidad y/o costo_unitario para actualizar (kar_sec ${detalle.kar_sec})`
          });
        }
      }

      datosActualizacion.detalles = req.body.detalles;
    }

    // Verificar que al menos un campo se proporcionó
    if (Object.keys(datosActualizacion).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Debe proporcionar al menos un campo para actualizar (fac_fec, nit_sec, fac_obs, fac_est_fac, detalles)'
      });
    }

    // Agregar usuario que modifica
    datosActualizacion.usu_cod = req.usuario?.usu_cod || 'SYSTEM';

    // Llamar al modelo
    const resultado = await actualizarCompra(fac_nro, datosActualizacion);

    // Sincronizar stock con WooCommerce si se actualizaron detalles (modo silencioso)
    let wooSyncResult = null;
    if (resultado.detalles_actualizados && resultado.detalles_actualizados.length > 0) {
      try {
        wooSyncResult = await syncDocumentStockToWoo(fac_nro, { silent: true });
      } catch (wooError) {
        console.warn('Error sincronizando stock con WooCommerce:', wooError.message);
        // No bloqueamos la respuesta por error de WooCommerce
      }
    }

    res.status(200).json({
      ...resultado,
      woo_sync: wooSyncResult
    });

  } catch (error) {
    console.error('Error en modificarCompra:', error);

    // Errores de validación del modelo
    if (error.message.includes('no encontrada') ||
        error.message.includes('no encontrado') ||
        error.message.includes('no es una compra') ||
        error.message.includes('Proveedor') ||
        error.message.includes('Artículo') ||
        error.message.includes('Detalle') ||
        error.message.includes('Estado inválido')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    // Otros errores
    res.status(500).json({
      success: false,
      message: 'Error actualizando compra',
      error: error.message
    });
  }
};

module.exports = {
  crearCompra,
  modificarCompra,
  listarCompras,
  obtenerCompra,
  reporteVariacionCostos,
  reporteComprasPorProveedor,
  reporteValorizadoInventario,
  reporteArticulosSinCosto,
  reporteValorizadoArbolCategorias,
  reporteValorizadoArbolSubcategorias,
  reporteValorizadoArbolArticulos
};
