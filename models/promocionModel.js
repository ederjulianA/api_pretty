import { sql, poolPromise } from '../db.js';
import { validarPrecioOferta, validarDescuentoPorcentual, obtenerPreciosConOferta } from '../utils/precioUtils.js';
import { obtenerExistenciaArticuloPorSec } from '../utils/ArticuloUtils.js';
import { updateWooProductPrices } from '../jobs/updateWooProductPrices.js';
import wcPkg from '@woocommerce/woocommerce-rest-api';
const WooCommerceRestApi = wcPkg.default || wcPkg;

const wcApi = new WooCommerceRestApi({
  url: process.env.WC_URL,
  consumerKey: process.env.WC_CONSUMER_KEY,
  consumerSecret: process.env.WC_CONSUMER_SECRET,
  version: 'wc/v3',
  timeout: 15000
});

// Crear promoción (encabezado y detalle)
const crearPromocion = async (promocionData) => {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  
  try {
    await transaction.begin();
    const request = new sql.Request(transaction);
    
    // Validar fechas
    const fechaInicio = new Date(promocionData.fecha_inicio);
    const fechaFin = new Date(promocionData.fecha_fin);
    
    if (fechaInicio >= fechaFin) {
      throw new Error('La fecha de inicio debe ser menor a la fecha de fin');
    }
    
    // Crear encabezado de promoción
    const resultEncabezado = await request
      .input('codigo', sql.VarChar(20), promocionData.codigo)
      .input('descripcion', sql.VarChar(200), promocionData.descripcion)
      .input('fecha_inicio', sql.DateTime, fechaInicio)
      .input('fecha_fin', sql.DateTime, fechaFin)
      .input('tipo', sql.VarChar(20), promocionData.tipo || 'OFERTA')
      .input('observaciones', sql.VarChar(500), promocionData.observaciones || null)
      .input('usuario', sql.VarChar(50), promocionData.usuario || 'SISTEMA')
      .query(`
        INSERT INTO dbo.promociones 
        (pro_codigo, pro_descripcion, pro_fecha_inicio, pro_fecha_fin, pro_tipo, pro_observaciones, pro_usuario_creacion)
        OUTPUT INSERTED.pro_sec
        VALUES (@codigo, @descripcion, @fecha_inicio, @fecha_fin, @tipo, @observaciones, @usuario)
      `);
    
    const proSec = resultEncabezado.recordset[0].pro_sec;
    
    // Validar y crear detalles de promoción
    for (const detalle of promocionData.articulos) {
      // Obtener art_cod para mostrar en mensajes de error
      let artCodigo = detalle.art_cod;
      if (!artCodigo) {
        // Si no viene art_cod, obtenerlo desde la BD usando art_sec
        try {
          const artCodRequest = new sql.Request(transaction);
          const artCodResult = await artCodRequest
            .input('art_sec', sql.VarChar(30), detalle.art_sec)
            .query('SELECT art_cod FROM dbo.articulos WHERE art_sec = @art_sec');
          
          if (artCodResult.recordset.length > 0) {
            artCodigo = artCodResult.recordset[0].art_cod;
          }
        } catch (error) {
          // Si no se puede obtener art_cod, usar art_sec como fallback
          artCodigo = detalle.art_sec;
        }
      }
      
      // Validar que al menos tenga precio o descuento
      if ((!detalle.precio_oferta || detalle.precio_oferta <= 0) && 
          (!detalle.descuento_porcentaje || detalle.descuento_porcentaje <= 0)) {
        throw new Error(`El artículo ${artCodigo} debe tener precio de oferta o descuento porcentual`);
      }
      
      // Validar que el artículo tenga existencias solo si está activo
      if (detalle.estado === 'A' || detalle.estado === undefined) {
        try {
          const existencia = await obtenerExistenciaArticuloPorSec(detalle.art_sec);
          if (existencia <= 0) {
            throw new Error(`El artículo ${artCodigo} no tiene existencias disponibles (existencia: ${existencia})`);
          }
        } catch (error) {
          if (error.message.includes('No se encontró el artículo')) {
            throw new Error(`El artículo ${artCodigo} no existe en el sistema`);
          }
          throw new Error(`Error al validar existencias del artículo ${artCodigo}: ${error.message}`);
        }
      }
      
      // Validar precio de oferta usando función global
      if (detalle.precio_oferta && detalle.precio_oferta > 0) {
        const validacionPrecio = await validarPrecioOferta(detalle.art_sec, detalle.precio_oferta);
        if (!validacionPrecio.valido) {
          throw new Error(validacionPrecio.mensaje);
        }
      }
      
      // Validar descuento porcentual usando función global
      if (detalle.descuento_porcentaje && detalle.descuento_porcentaje > 0) {
        const validacionDescuento = await validarDescuentoPorcentual(detalle.art_sec, detalle.descuento_porcentaje);
        if (!validacionDescuento.valido) {
          throw new Error(validacionDescuento.mensaje);
        }
      }
      
      // Crear detalle de promoción
      const requestInsert = new sql.Request(transaction);
      await requestInsert
        .input('pro_sec', sql.Decimal(18, 0), proSec)
        .input('art_sec', sql.VarChar(30), detalle.art_sec)
        .input('precio_oferta', sql.Decimal(17, 2), detalle.precio_oferta || null)
        .input('descuento_porcentaje', sql.Decimal(5, 2), detalle.descuento_porcentaje || null)
        .input('observaciones_detalle', sql.VarChar(200), detalle.observaciones || null)
        .input('estado', sql.Char(1), detalle.estado || 'A')
        .input('usuario_detalle', sql.VarChar(50), promocionData.usuario || 'SISTEMA')
        .query(`
          INSERT INTO dbo.promociones_detalle 
          (pro_sec, art_sec, pro_det_precio_oferta, pro_det_descuento_porcentaje, pro_det_observaciones, pro_det_estado, pro_det_usuario_creacion)
          VALUES (@pro_sec, @art_sec, @precio_oferta, @descuento_porcentaje, @observaciones_detalle, @estado, @usuario_detalle)
        `);
    }
    
    await transaction.commit();
    
    // Sincronizar precios con WooCommerce después de crear la promoción
    let resultadoSincronizacion = null;
    let errorSincronizacion = null;
    
    try {
      resultadoSincronizacion = await sincronizarPreciosPromocion(proSec, {
        solo_activos: false, // Sincronizar todos los artículos para quitar ofertas de inactivos
        fechasPromocion: {
          fecha_inicio: fechaInicio,
          fecha_fin: fechaFin
        }
      });
    } catch (error) {
      errorSincronizacion = error;
    }
    
    // Preparar respuesta
    const respuesta = {
      success: true,
      message: 'Promoción creada exitosamente',
      data: {
        pro_sec: proSec,
        codigo: promocionData.codigo,
        descripcion: promocionData.descripcion,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        articulos_count: promocionData.articulos.length
      }
    };
    
    // Agregar información de sincronización si se ejecutó
    if (resultadoSincronizacion) {
      respuesta.sincronizacion = {
        ejecutada: true,
        exitosa: resultadoSincronizacion.success,
        articulos_procesados: resultadoSincronizacion.data?.articulos_procesados,
        articulos_exitosos: resultadoSincronizacion.data?.articulos_exitosos,
        articulos_con_error: resultadoSincronizacion.data?.articulos_con_error,
        duracion: resultadoSincronizacion.data?.duracion,
        log_id: resultadoSincronizacion.data?.log_id
      };
      
      if (!resultadoSincronizacion.success) {
        respuesta.warnings = [
          'La promoción se creó correctamente, pero hubo errores en la sincronización de precios',
          `Log ID: ${resultadoSincronizacion.data?.log_id}`
        ];
      }
    } else if (errorSincronizacion) {
      respuesta.sincronizacion = {
        ejecutada: true,
        exitosa: false,
        error: errorSincronizacion.message
      };
      respuesta.warnings = [
        'La promoción se creó correctamente, pero falló la sincronización de precios',
        `Error: ${errorSincronizacion.message}`
      ];
    }
    
    return respuesta;
    
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

// Actualizar promoción (encabezado y detalle)
const actualizarPromocion = async (proSec, promocionData) => {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  
  try {
    await transaction.begin();
    
    // Verificar que la promoción existe
    const requestCheck = new sql.Request(transaction);
    const promocionExistente = await requestCheck
      .input('pro_sec', sql.Decimal(18, 0), proSec)
      .query(`
        SELECT pro_sec, pro_codigo, pro_descripcion, pro_fecha_inicio, pro_fecha_fin, pro_tipo, pro_observaciones
        FROM dbo.promociones 
        WHERE pro_sec = @pro_sec
      `);
    
    if (promocionExistente.recordset.length === 0) {
      throw new Error('La promoción no existe');
    }
    
    // Validar fechas si se proporcionan
    let fechaInicio = promocionExistente.recordset[0].pro_fecha_inicio;
    let fechaFin = promocionExistente.recordset[0].pro_fecha_fin;
    
    if (promocionData.fecha_inicio) {
      fechaInicio = new Date(promocionData.fecha_inicio);
    }
    if (promocionData.fecha_fin) {
      fechaFin = new Date(promocionData.fecha_fin);
    }
    
    if (fechaInicio >= fechaFin) {
      throw new Error('La fecha de inicio debe ser menor a la fecha de fin');
    }
    
    // Actualizar encabezado de promoción
    const requestUpdate = new sql.Request(transaction);
    await requestUpdate
      .input('pro_sec', sql.Decimal(18, 0), proSec)
      .input('codigo', sql.VarChar(20), promocionData.codigo || promocionExistente.recordset[0].pro_codigo)
      .input('descripcion', sql.VarChar(200), promocionData.descripcion || promocionExistente.recordset[0].pro_descripcion)
      .input('fecha_inicio', sql.DateTime, fechaInicio)
      .input('fecha_fin', sql.DateTime, fechaFin)
      .input('tipo', sql.VarChar(20), promocionData.tipo || promocionExistente.recordset[0].pro_tipo)
      .input('observaciones', sql.VarChar(500), promocionData.observaciones || promocionExistente.recordset[0].pro_observaciones)
      .input('usuario', sql.VarChar(50), promocionData.usuario || 'SISTEMA')
      .query(`
        UPDATE dbo.promociones 
        SET pro_codigo = @codigo,
            pro_descripcion = @descripcion,
            pro_fecha_inicio = @fecha_inicio,
            pro_fecha_fin = @fecha_fin,
            pro_tipo = @tipo,
            pro_observaciones = @observaciones,
            pro_usuario_modificacion = @usuario,
            pro_fecha_modificacion = GETDATE()
        WHERE pro_sec = @pro_sec
      `);
    
    // Si se proporcionan artículos, actualizar detalles
    if (promocionData.articulos && promocionData.articulos.length > 0) {
      // Marcar todos los artículos existentes como inactivos
      const requestDeactivate = new sql.Request(transaction);
      await requestDeactivate
        .input('pro_sec', sql.Decimal(18, 0), proSec)
        .input('usuario', sql.VarChar(50), promocionData.usuario || 'SISTEMA')
        .query(`
          UPDATE dbo.promociones_detalle 
          SET pro_det_estado = 'I',
              pro_det_fecha_modificacion = GETDATE(),
              pro_det_usuario_modificacion = @usuario
          WHERE pro_sec = @pro_sec
        `);
      
      // Actualizar o insertar artículos según corresponda
      for (const detalle of promocionData.articulos) {
        // Obtener art_cod para mostrar en mensajes de error
        let artCodigo = detalle.art_cod;
        if (!artCodigo) {
          // Si no viene art_cod, obtenerlo desde la BD usando art_sec
          try {
            const artCodRequest = new sql.Request(transaction);
            const artCodResult = await artCodRequest
              .input('art_sec', sql.VarChar(30), detalle.art_sec)
              .query('SELECT art_cod FROM dbo.articulos WHERE art_sec = @art_sec');
            
            if (artCodResult.recordset.length > 0) {
              artCodigo = artCodResult.recordset[0].art_cod;
            }
          } catch (error) {
            // Si no se puede obtener art_cod, usar art_sec como fallback
            artCodigo = detalle.art_sec;
          }
        }
        
        // Validar que al menos tenga precio o descuento
        if ((!detalle.precio_oferta || detalle.precio_oferta <= 0) && 
            (!detalle.descuento_porcentaje || detalle.descuento_porcentaje <= 0)) {
          throw new Error(`El artículo ${artCodigo} debe tener precio de oferta o descuento porcentual`);
        }
        
        // Validar que el artículo tenga existencias solo si está activo
        if (detalle.estado === 'A' || detalle.estado === undefined) {
          try {
            const existencia = await obtenerExistenciaArticuloPorSec(detalle.art_sec);
            if (existencia <= 0) {
              throw new Error(`El artículo ${artCodigo} no tiene existencias disponibles (existencia: ${existencia})`);
            }
          } catch (error) {
            if (error.message.includes('No se encontró el artículo')) {
              throw new Error(`El artículo ${artCodigo} no existe en el sistema`);
            }
            throw new Error(`Error al validar existencias del artículo ${artCodigo}: ${error.message}`);
          }
        }
        
        // Validar precio de oferta usando función global
        if (detalle.precio_oferta && detalle.precio_oferta > 0) {
          const validacionPrecio = await validarPrecioOferta(detalle.art_sec, detalle.precio_oferta);
          if (!validacionPrecio.valido) {
            throw new Error(validacionPrecio.mensaje);
          }
        }
        
        // Validar descuento porcentual usando función global
        if (detalle.descuento_porcentaje && detalle.descuento_porcentaje > 0) {
          const validacionDescuento = await validarDescuentoPorcentual(detalle.art_sec, detalle.descuento_porcentaje);
          if (!validacionDescuento.valido) {
            throw new Error(validacionDescuento.mensaje);
          }
        }
        
        // Verificar si el artículo ya existe
        const requestCheck = new sql.Request(transaction);
        const articuloExistente = await requestCheck
          .input('pro_sec', sql.Decimal(18, 0), proSec)
          .input('art_sec', sql.VarChar(30), detalle.art_sec)
          .query(`
            SELECT pro_det_sec FROM dbo.promociones_detalle 
            WHERE pro_sec = @pro_sec AND art_sec = @art_sec
          `);
        
        if (articuloExistente.recordset.length > 0) {
          // Actualizar artículo existente
          const requestUpdate = new sql.Request(transaction);
          await requestUpdate
            .input('pro_sec', sql.Decimal(18, 0), proSec)
            .input('art_sec', sql.VarChar(30), detalle.art_sec)
            .input('precio_oferta', sql.Decimal(17, 2), detalle.precio_oferta || null)
            .input('descuento_porcentaje', sql.Decimal(5, 2), detalle.descuento_porcentaje || null)
            .input('observaciones', sql.VarChar(200), detalle.observaciones || null)
            .input('estado', sql.Char(1), detalle.estado || 'A')
            .input('usuario', sql.VarChar(50), promocionData.usuario || 'SISTEMA')
            .query(`
              UPDATE dbo.promociones_detalle 
              SET pro_det_precio_oferta = @precio_oferta,
                  pro_det_descuento_porcentaje = @descuento_porcentaje,
                  pro_det_observaciones = @observaciones,
                  pro_det_estado = @estado,
                  pro_det_fecha_modificacion = GETDATE(),
                  pro_det_usuario_modificacion = @usuario
              WHERE pro_sec = @pro_sec AND art_sec = @art_sec
            `);
        } else {
          // Insertar nuevo artículo
          const requestInsert = new sql.Request(transaction);
          await requestInsert
            .input('pro_sec', sql.Decimal(18, 0), proSec)
            .input('art_sec', sql.VarChar(30), detalle.art_sec)
            .input('precio_oferta', sql.Decimal(17, 2), detalle.precio_oferta || null)
            .input('descuento_porcentaje', sql.Decimal(5, 2), detalle.descuento_porcentaje || null)
            .input('observaciones', sql.VarChar(200), detalle.observaciones || null)
            .input('estado', sql.Char(1), detalle.estado || 'A')
            .input('usuario', sql.VarChar(50), promocionData.usuario || 'SISTEMA')
            .query(`
              INSERT INTO dbo.promociones_detalle 
              (pro_sec, art_sec, pro_det_precio_oferta, pro_det_descuento_porcentaje, pro_det_observaciones, pro_det_estado, pro_det_usuario_creacion)
              VALUES (@pro_sec, @art_sec, @precio_oferta, @descuento_porcentaje, @observaciones, @estado, @usuario)
            `);
        }
      }
    }
    
    await transaction.commit();
    
    // Sincronizar precios con WooCommerce después de actualizar la promoción
    let resultadoSincronizacion = null;
    let errorSincronizacion = null;
    
    try {
      // Sincronizar todos los artículos de la promoción (activos e inactivos)
      // Se ejecuta siempre que se actualice la promoción, ya que las fechas pueden haber cambiado
      resultadoSincronizacion = await sincronizarPreciosPromocion(proSec, {
        solo_activos: false, // Sincronizar todos los artículos para quitar ofertas de inactivos
        fechasPromocion: {
          fecha_inicio: fechaInicio,
          fecha_fin: fechaFin
        }
      });
    } catch (error) {
      errorSincronizacion = error;
    }
    
    // Preparar respuesta
    const respuesta = {
      success: true,
      message: 'Promoción actualizada exitosamente',
      data: {
        pro_sec: proSec,
        codigo: promocionData.codigo || promocionExistente.recordset[0].pro_codigo,
        descripcion: promocionData.descripcion || promocionExistente.recordset[0].pro_descripcion,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        articulos_count: promocionData.articulos ? promocionData.articulos.length : 0
      }
    };
    
    // Agregar información de sincronización si se ejecutó
    if (resultadoSincronizacion) {
      respuesta.sincronizacion = {
        ejecutada: true,
        exitosa: resultadoSincronizacion.success,
        articulos_procesados: resultadoSincronizacion.data?.articulos_procesados,
        articulos_exitosos: resultadoSincronizacion.data?.articulos_exitosos,
        articulos_con_error: resultadoSincronizacion.data?.articulos_con_error,
        duracion: resultadoSincronizacion.data?.duracion,
        log_id: resultadoSincronizacion.data?.log_id
      };
      
      if (!resultadoSincronizacion.success) {
        respuesta.warnings = [
          'La promoción se actualizó correctamente, pero hubo errores en la sincronización de precios',
          `Log ID: ${resultadoSincronizacion.data?.log_id}`
        ];
      }
    } else if (errorSincronizacion) {
      respuesta.sincronizacion = {
        ejecutada: true,
        exitosa: false,
        error: errorSincronizacion.message
      };
      respuesta.warnings = [
        'La promoción se actualizó correctamente, pero falló la sincronización de precios',
        `Error: ${errorSincronizacion.message}`
      ];
    } else {
      respuesta.sincronizacion = {
        ejecutada: false,
        motivo: 'No se pudo ejecutar la sincronización'
      };
    }
    
    return respuesta;
    
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

// Obtener listado de promociones con filtros y paginación
const obtenerPromociones = async ({ fechaDesde, fechaHasta, codigo, descripcion, tipo, estado, PageNumber, PageSize }) => {
  try {
    const pool = await poolPromise;
    
    // Construir la consulta base con filtros
    let whereConditions = [];
    let parameters = {};
    
    // Filtro por fecha desde
    if (fechaDesde) {
      whereConditions.push('p.pro_fecha_inicio >= @fechaDesde');
      parameters.fechaDesde = new Date(fechaDesde);
    }
    
    // Filtro por fecha hasta
    if (fechaHasta) {
      whereConditions.push('p.pro_fecha_fin <= @fechaHasta');
      parameters.fechaHasta = new Date(fechaHasta);
    }
    
    // Filtro por código
    if (codigo) {
      whereConditions.push('p.pro_codigo LIKE @codigo');
      parameters.codigo = `%${codigo}%`;
    }
    
    // Filtro por descripción
    if (descripcion) {
      whereConditions.push('p.pro_descripcion LIKE @descripcion');
      parameters.descripcion = `%${descripcion}%`;
    }
    
    // Filtro por tipo
    if (tipo) {
      whereConditions.push('p.pro_tipo = @tipo');
      parameters.tipo = tipo;
    }
    
    // Filtro por estado (activa/inactiva)
    if (estado) {
      whereConditions.push('p.pro_activa = @estado');
      parameters.estado = estado;
    }
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    
    // Consulta principal con conteo total
    const query = `
      WITH PromocionesConConteo AS (
        SELECT 
          p.pro_sec,
          p.pro_codigo,
          p.pro_descripcion,
          p.pro_fecha_inicio,
          p.pro_fecha_fin,
          p.pro_activa,
          p.pro_tipo,
          p.pro_observaciones,
          p.pro_fecha_creacion,
          p.pro_usuario_creacion,
          p.pro_fecha_modificacion,
          p.pro_usuario_modificacion,
          COUNT(pd.art_sec) as total_articulos,
          SUM(CASE WHEN pd.pro_det_estado = 'A' THEN 1 ELSE 0 END) as articulos_activos,
          SUM(CASE WHEN pd.pro_det_precio_oferta > 0 THEN 1 ELSE 0 END) as articulos_precio_oferta,
          SUM(CASE WHEN pd.pro_det_descuento_porcentaje > 0 THEN 1 ELSE 0 END) as articulos_descuento,
          CASE 
            WHEN GETDATE() < p.pro_fecha_inicio THEN 'PENDIENTE'
            WHEN GETDATE() BETWEEN p.pro_fecha_inicio AND p.pro_fecha_fin THEN 'ACTIVA'
            WHEN GETDATE() > p.pro_fecha_fin THEN 'VENCIDA'
            ELSE 'DESCONOCIDA'
          END as estado_temporal,
          DATEDIFF(day, GETDATE(), p.pro_fecha_fin) as dias_restantes
        FROM dbo.promociones p
        LEFT JOIN dbo.promociones_detalle pd ON p.pro_sec = pd.pro_sec
        ${whereClause}
        GROUP BY 
          p.pro_sec, p.pro_codigo, p.pro_descripcion, p.pro_fecha_inicio, p.pro_fecha_fin,
          p.pro_activa, p.pro_tipo, p.pro_observaciones, p.pro_fecha_creacion,
          p.pro_usuario_creacion, p.pro_fecha_modificacion, p.pro_usuario_modificacion
      ),
      TotalCount AS (
        SELECT COUNT(*) as total FROM PromocionesConConteo
      )
      SELECT 
        p.*,
        t.total as total_registros
      FROM PromocionesConConteo p
      CROSS JOIN TotalCount t
      ORDER BY p.pro_fecha_creacion DESC
      OFFSET (@PageNumber - 1) * @PageSize ROWS
      FETCH NEXT @PageSize ROWS ONLY
    `;
    
    // Preparar la consulta con parámetros
    const request = pool.request();
    
    // Agregar parámetros de filtro
    Object.keys(parameters).forEach(key => {
      if (key === 'fechaDesde' || key === 'fechaHasta') {
        request.input(key, sql.DateTime, parameters[key]);
      } else {
        request.input(key, sql.VarChar(100), parameters[key]);
      }
    });
    
    // Agregar parámetros de paginación
    request.input('PageNumber', sql.Int, PageNumber || 1);
    request.input('PageSize', sql.Int, PageSize || 15);
    
    const result = await request.query(query);
    
    return {
      success: true,
      data: result.recordset,
      pagination: {
        page: PageNumber || 1,
        pageSize: PageSize || 15,
        total: result.recordset.length > 0 ? result.recordset[0].total_registros : 0,
        totalPages: Math.ceil((result.recordset.length > 0 ? result.recordset[0].total_registros : 0) / (PageSize || 15))
      }
    };
    
  } catch (error) {
    throw new Error(`Error al obtener promociones: ${error.message}`);
  }
};

// Obtener promoción específica con todos sus detalles
const obtenerPromocionPorId = async (proSec) => {
  try {
    const pool = await poolPromise;
    
    // Consulta para obtener la información del encabezado de la promoción
    const queryEncabezado = `
      SELECT 
        p.pro_sec,
        p.pro_codigo,
        p.pro_descripcion,
        p.pro_fecha_inicio,
        p.pro_fecha_fin,
        p.pro_activa,
        p.pro_tipo,
        p.pro_observaciones,
        p.pro_fecha_creacion,
        p.pro_usuario_creacion,
        p.pro_fecha_modificacion,
        p.pro_usuario_modificacion,
        CASE 
          WHEN GETDATE() < p.pro_fecha_inicio THEN 'PENDIENTE'
          WHEN GETDATE() BETWEEN p.pro_fecha_inicio AND p.pro_fecha_fin THEN 'ACTIVA'
          WHEN GETDATE() > p.pro_fecha_fin THEN 'VENCIDA'
          ELSE 'DESCONOCIDA'
        END as estado_temporal,
        DATEDIFF(day, GETDATE(), p.pro_fecha_fin) as dias_restantes
      FROM dbo.promociones p
      WHERE p.pro_sec = @pro_sec
    `;
    
    const resultEncabezado = await pool.request()
      .input('pro_sec', sql.Decimal(18, 0), proSec)
      .query(queryEncabezado);
    
    if (resultEncabezado.recordset.length === 0) {
      throw new Error('Promoción no encontrada');
    }
    
    const promocion = resultEncabezado.recordset[0];
    
    // Consulta para obtener los detalles de artículos de la promoción
    const queryDetalles = `
      SELECT 
        pd.pro_det_sec,
        pd.pro_sec,
        pd.art_sec,
        pd.pro_det_precio_oferta,
        pd.pro_det_descuento_porcentaje,
        pd.pro_det_observaciones,
        pd.pro_det_estado,
        pd.pro_det_fecha_creacion,
        pd.pro_det_usuario_creacion,
        pd.pro_det_fecha_modificacion,
        pd.pro_det_usuario_modificacion,
        -- Información del artículo
        a.art_cod,
        a.art_nom,
        a.art_url_img_servi,
        -- Precios base del artículo
        ISNULL(ad1.art_bod_pre, 0) AS precio_detal_base,
        ISNULL(ad2.art_bod_pre, 0) AS precio_mayor_base,
        -- Existencia del artículo
        ISNULL(e.existencia, 0) AS existencia,
        -- Categorías del artículo
        ig.inv_gru_cod,
        ig.inv_gru_nom AS categoria,
        isg.inv_sub_gru_cod,
        isg.inv_sub_gru_nom AS sub_categoria
      FROM dbo.promociones_detalle pd
      INNER JOIN dbo.articulos a ON pd.art_sec = a.art_sec
      LEFT JOIN dbo.articulosdetalle ad1 ON a.art_sec = ad1.art_sec AND ad1.lis_pre_cod = 1 AND ad1.bod_sec = '1'
      LEFT JOIN dbo.articulosdetalle ad2 ON a.art_sec = ad2.art_sec AND ad2.lis_pre_cod = 2 AND ad2.bod_sec = '1'
      LEFT JOIN dbo.vwExistencias e ON a.art_sec = e.art_sec
      LEFT JOIN dbo.inventario_subgrupo isg ON a.inv_sub_gru_cod = isg.inv_sub_gru_cod
      LEFT JOIN dbo.inventario_grupo ig ON isg.inv_gru_cod = ig.inv_gru_cod
      WHERE pd.pro_sec = @pro_sec
      ORDER BY pd.pro_det_sec ASC
    `;
    
    const resultDetalles = await pool.request()
      .input('pro_sec', sql.Decimal(18, 0), proSec)
      .query(queryDetalles);
    
    // Calcular estadísticas de la promoción
    const totalArticulos = resultDetalles.recordset.length;
    const articulosActivos = resultDetalles.recordset.filter(d => d.pro_det_estado === 'A').length;
    const articulosPrecioOferta = resultDetalles.recordset.filter(d => d.pro_det_precio_oferta > 0).length;
    const articulosDescuento = resultDetalles.recordset.filter(d => d.pro_det_descuento_porcentaje > 0).length;
    
    // Calcular precios con descuento para cada artículo
    const articulosConPreciosCalculados = resultDetalles.recordset.map(detalle => {
      let precioFinalDetal = detalle.precio_detal_base;
      let precioFinalMayor = detalle.precio_mayor_base;
      
      // Si hay precio de oferta, usarlo directamente
      if (detalle.pro_det_precio_oferta && detalle.pro_det_precio_oferta > 0) {
        precioFinalDetal = detalle.pro_det_precio_oferta;
        precioFinalMayor = detalle.pro_det_precio_oferta;
      }
      // Si hay descuento porcentual, aplicarlo
      else if (detalle.pro_det_descuento_porcentaje && detalle.pro_det_descuento_porcentaje > 0) {
        const factorDescuento = 1 - (detalle.pro_det_descuento_porcentaje / 100);
        precioFinalDetal = detalle.precio_detal_base * factorDescuento;
        precioFinalMayor = detalle.precio_mayor_base * factorDescuento;
      }
      
      return {
        ...detalle,
        precio_final_detal: Math.round(precioFinalDetal * 100) / 100,
        precio_final_mayor: Math.round(precioFinalMayor * 100) / 100,
        ahorro_detal: detalle.precio_detal_base - precioFinalDetal,
        ahorro_mayor: detalle.precio_mayor_base - precioFinalMayor,
        porcentaje_ahorro_detal: detalle.precio_detal_base > 0 ? 
          ((detalle.precio_detal_base - precioFinalDetal) / detalle.precio_detal_base * 100) : 0,
        porcentaje_ahorro_mayor: detalle.precio_mayor_base > 0 ? 
          ((detalle.precio_mayor_base - precioFinalMayor) / detalle.precio_mayor_base * 100) : 0
      };
    });
    
    return {
      success: true,
      data: {
        ...promocion,
        articulos: articulosConPreciosCalculados,
        estadisticas: {
          total_articulos: totalArticulos,
          articulos_activos: articulosActivos,
          articulos_inactivos: totalArticulos - articulosActivos,
          articulos_precio_oferta: articulosPrecioOferta,
          articulos_descuento: articulosDescuento,
          articulos_sin_oferta: totalArticulos - articulosPrecioOferta - articulosDescuento
        }
      }
    };
    
  } catch (error) {
    throw new Error(`Error al obtener promoción: ${error.message}`);
  }
};

// Sincronizar precios de una promoción específica con WooCommerce
const sincronizarPreciosPromocion = async (proSec, opciones = {}) => {
  try {
    const pool = await poolPromise;
    
    // Obtener información de la promoción
    const promocionResult = await pool.request()
      .input('pro_sec', sql.Decimal(18, 0), proSec)
      .query(`
        SELECT 
          p.pro_sec,
          p.pro_codigo,
          p.pro_descripcion,
          p.pro_fecha_inicio,
          p.pro_fecha_fin,
          p.pro_activa,
          CASE 
            WHEN GETDATE() < p.pro_fecha_inicio THEN 'PENDIENTE'
            WHEN GETDATE() BETWEEN p.pro_fecha_inicio AND p.pro_fecha_fin THEN 'ACTIVA'
            WHEN GETDATE() > p.pro_fecha_fin THEN 'VENCIDA'
            ELSE 'DESCONOCIDA'
          END as estado_temporal
        FROM dbo.promociones p
        WHERE p.pro_sec = @pro_sec
      `);
    
    if (promocionResult.recordset.length === 0) {
      throw new Error('Promoción no encontrada');
    }
    
    const promocion = promocionResult.recordset[0];
    
    // Verificar que la promoción esté activa
    if (promocion.pro_activa !== 'S') {
      throw new Error('La promoción debe estar activa para sincronizar precios');
    }
    
    // Obtener artículos de la promoción que tengan art_woo_id o sean variaciones con art_woo_variation_id
    const articulosResult = await pool.request()
      .input('pro_sec', sql.Decimal(18, 0), proSec)
      .query(`
        SELECT DISTINCT
          a.art_sec,
          a.art_cod,
          a.art_nom,
          a.art_woo_id,
          ISNULL(a.art_woo_type, 'simple') AS art_woo_type,
          a.art_woo_variation_id,
          a.art_sec_padre,
          padre.art_woo_id AS parent_woo_id,
          pd.pro_det_estado
        FROM dbo.promociones_detalle pd
        INNER JOIN dbo.articulos a ON pd.art_sec = a.art_sec
        LEFT JOIN dbo.articulos padre ON padre.art_sec = a.art_sec_padre
        WHERE pd.pro_sec = @pro_sec
          AND (
            (a.art_woo_id IS NOT NULL AND a.art_woo_id > 0)
            OR (a.art_woo_variation_id IS NOT NULL AND a.art_woo_variation_id > 0)
          )
        ORDER BY a.art_cod
      `);
    
    if (articulosResult.recordset.length === 0) {
      return {
        success: true,
        message: 'No se encontraron artículos con ID de WooCommerce para sincronizar',
        data: {
          pro_sec: proSec,
          codigo: promocion.pro_codigo,
          articulos_procesados: 0,
          estado_promocion: promocion.estado_temporal
        }
      };
    }
    
    // Separar productos simples/variables de variaciones
    const productosSimples = [];
    const variaciones = [];
    const estadosArticulos = {};

    articulosResult.recordset.forEach(art => {
      estadosArticulos[art.art_cod] = art.pro_det_estado;

      if (art.art_woo_type === 'variation' && art.art_woo_variation_id && art.parent_woo_id) {
        variaciones.push(art);
      } else if (art.art_woo_type !== 'variable' && art.art_woo_id) {
        // Solo productos simples - los variable (padres) NO manejan precios directamente
        productosSimples.push(art);
      }
    });

    // Determinar fechas de promoción
    let fechasPromocion;
    if (opciones.fechasPromocion && opciones.fechasPromocion.fecha_inicio && opciones.fechasPromocion.fecha_fin) {
      fechasPromocion = opciones.fechasPromocion;
    } else {
      fechasPromocion = {
        fecha_inicio: promocion.pro_fecha_inicio,
        fecha_fin: promocion.pro_fecha_fin
      };
    }

    let totalProcesados = 0;
    let totalExitosos = 0;
    let totalErrores = 0;
    let totalOmitidos = 0;
    let mensajes = [];
    let logId = null;

    // 1. Sincronizar productos simples via batch (updateWooProductPrices)
    if (productosSimples.length > 0) {
      const art_cods = productosSimples.map(art => art.art_cod);
      const opcionesSincronizacion = {
        estadosArticulos,
        fechasPromocion
      };

      const resultadoSincronizacion = await updateWooProductPrices(art_cods, opcionesSincronizacion);

      totalProcesados += resultadoSincronizacion.summary.totalItems;
      totalExitosos += resultadoSincronizacion.summary.successCount;
      totalErrores += resultadoSincronizacion.summary.errorCount;
      totalOmitidos += resultadoSincronizacion.summary.skippedCount;
      mensajes = mensajes.concat(resultadoSincronizacion.messages.slice(0, 10));
      logId = resultadoSincronizacion.summary.logId;
    }

    // 2. Sincronizar variaciones individualmente
    if (variaciones.length > 0) {
      for (const variation of variaciones) {
        totalProcesados++;
        try {
          const articuloActivoEnPromocion = estadosArticulos[variation.art_cod] === 'A';
          const apiPath = `products/${variation.parent_woo_id}/variations/${variation.art_woo_variation_id}`;

          // Obtener precios con oferta del artículo
          const preciosData = await obtenerPreciosConOferta(variation.art_sec);

          const wooData = {
            regular_price: preciosData.precio_detal_original.toString(),
            meta_data: [{ key: "_precio_mayorista", value: preciosData.precio_mayor_original.toString() }]
          };

          if (preciosData.tiene_oferta && articuloActivoEnPromocion) {
            if (preciosData.oferta_info?.precio_oferta > 0) {
              wooData.sale_price = preciosData.oferta_info.precio_oferta.toString();
            } else if (preciosData.oferta_info?.descuento_porcentaje > 0) {
              const salePrice = preciosData.precio_detal_original * (1 - (preciosData.oferta_info.descuento_porcentaje / 100));
              wooData.sale_price = salePrice.toString();
            }
            if (fechasPromocion.fecha_inicio && fechasPromocion.fecha_fin) {
              const fechaInicio = new Date(fechasPromocion.fecha_inicio);
              const fechaFin = new Date(fechasPromocion.fecha_fin);
              wooData.date_on_sale_from = fechaInicio.toISOString().slice(0, 19);
              wooData.date_on_sale_to = fechaFin.toISOString().slice(0, 19).replace(/T\d{2}:\d{2}:\d{2}/, 'T23:59:59');
            }
          } else {
            wooData.sale_price = '';
            wooData.date_on_sale_from = '';
            wooData.date_on_sale_to = '';
          }

          await wcApi.put(apiPath, wooData);
          totalExitosos++;
          mensajes.push(`Variación ${variation.art_cod} (${variation.art_woo_variation_id}) actualizada exitosamente`);
        } catch (varError) {
          totalErrores++;
          mensajes.push(`Error actualizando variación ${variation.art_cod}: ${varError.message}`);
          console.error(`[PROMO-SYNC] Error variación ${variation.art_cod}:`, varError.message);
        }
      }
    }

    // Preparar respuesta
    const respuesta = {
      success: totalErrores === 0,
      message: totalErrores === 0
        ? 'Precios sincronizados exitosamente con WooCommerce'
        : 'Sincronización completada con algunos errores',
      data: {
        pro_sec: proSec,
        codigo: promocion.pro_codigo,
        descripcion: promocion.pro_descripcion,
        estado_promocion: promocion.estado_temporal,
        fecha_inicio: promocion.pro_fecha_inicio,
        fecha_fin: promocion.pro_fecha_fin,
        articulos_procesados: totalProcesados,
        articulos_exitosos: totalExitosos,
        articulos_con_error: totalErrores,
        articulos_omitidos: totalOmitidos,
        productos_simples: productosSimples.length,
        variaciones: variaciones.length,
        duracion: null,
        log_id: logId,
        mensajes: mensajes.slice(0, 20)
      }
    };

    if (totalErrores > 0) {
      respuesta.warnings = [
        'Algunos artículos no pudieron ser sincronizados',
        'Revisa los logs para más detalles'
      ];
      if (logId) respuesta.warnings.push(`Log ID: ${logId}`);
    }
    
    return respuesta;
    
  } catch (error) {
    throw new Error(`Error al sincronizar precios de la promoción: ${error.message}`);
  }
};

// Sincronizar precios de múltiples promociones
const sincronizarPreciosMultiplesPromociones = async (proSecs, opciones = {}) => {
  try {
    const resultados = [];
    const errores = [];
    
    for (const proSec of proSecs) {
      try {
        const resultado = await sincronizarPreciosPromocion(proSec, opciones);
        resultados.push({
          pro_sec: proSec,
          ...resultado
        });
      } catch (error) {
        errores.push({
          pro_sec: proSec,
          error: error.message
        });
      }
    }
    
    const totalProcesadas = resultados.length;
    const totalErrores = errores.length;
    const totalExitosas = resultados.filter(r => r.success).length;
    
    return {
      success: totalErrores === 0,
      message: totalErrores === 0 
        ? `Todas las promociones (${totalProcesadas}) sincronizadas exitosamente`
        : `${totalExitosas} de ${totalProcesadas} promociones sincronizadas exitosamente`,
      data: {
        total_promociones: totalProcesadas,
        promociones_exitosas: totalExitosas,
        promociones_con_error: totalErrores,
        resultados,
        errores: errores.length > 0 ? errores : undefined
      }
    };
    
  } catch (error) {
    throw new Error(`Error al sincronizar múltiples promociones: ${error.message}`);
  }
};

// Obtener artículos de una promoción que necesitan sincronización
const obtenerArticulosParaSincronizacion = async (proSec, opciones = {}) => {
  try {
    const pool = await poolPromise;
    
    const result = await pool.request()
      .input('pro_sec', sql.Decimal(18, 0), proSec)
      .query(`
        SELECT
          a.art_sec,
          a.art_cod,
          a.art_nom,
          a.art_woo_id,
          ISNULL(a.art_woo_type, 'simple') AS art_woo_type,
          a.art_woo_variation_id,
          pd.pro_det_estado,
          pd.pro_det_precio_oferta,
          pd.pro_det_descuento_porcentaje,
          CASE
            WHEN ISNULL(a.art_woo_type, 'simple') = 'variation'
              AND a.art_woo_variation_id IS NOT NULL AND a.art_woo_variation_id > 0 THEN 'LISTO'
            WHEN (a.art_woo_id IS NULL OR a.art_woo_id = 0)
              AND ISNULL(a.art_woo_type, 'simple') != 'variation' THEN 'SIN_WOO_ID'
            WHEN pd.pro_det_estado = 'I' THEN 'INACTIVO'
            WHEN ISNULL(a.art_woo_type, 'simple') = 'variable' THEN 'VARIABLE_PADRE'
            ELSE 'LISTO'
          END as estado_sincronizacion
        FROM dbo.promociones_detalle pd
        INNER JOIN dbo.articulos a ON pd.art_sec = a.art_sec
        WHERE pd.pro_sec = @pro_sec
          ${opciones.solo_activos !== false ? "AND pd.pro_det_estado = 'A'" : ""}
        ORDER BY
          CASE
            WHEN (a.art_woo_id IS NULL OR a.art_woo_id = 0)
              AND ISNULL(a.art_woo_type, 'simple') != 'variation' THEN 1
            WHEN pd.pro_det_estado = 'I' THEN 2
            ELSE 3
          END,
          a.art_cod
      `);
    
    const articulos = result.recordset;
    const estadisticas = {
      total: articulos.length,
      listos: articulos.filter(a => a.estado_sincronizacion === 'LISTO').length,
      sin_woo_id: articulos.filter(a => a.estado_sincronizacion === 'SIN_WOO_ID').length,
      inactivos: articulos.filter(a => a.estado_sincronizacion === 'INACTIVO').length
    };
    
    return {
      success: true,
      data: {
        articulos,
        estadisticas,
        recomendaciones: {
          sin_woo_id: estadisticas.sin_woo_id > 0 ? 
            `${estadisticas.sin_woo_id} artículos necesitan ID de WooCommerce` : null,
          inactivos: estadisticas.inactivos > 0 ? 
            `${estadisticas.inactivos} artículos están inactivos en la promoción` : null
        }
      }
    };
    
  } catch (error) {
    throw new Error(`Error al obtener artículos para sincronización: ${error.message}`);
  }
};

export default {
  crearPromocion,
  actualizarPromocion,
  obtenerPromociones,
  obtenerPromocionPorId,
  sincronizarPreciosPromocion,
  sincronizarPreciosMultiplesPromociones,
  obtenerArticulosParaSincronizacion
}; 