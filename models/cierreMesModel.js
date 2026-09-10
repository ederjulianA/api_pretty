/**
 * models/cierreMesModel.js
 *
 * Acceso a datos del proceso de Cierre de Mes.
 *
 * Notas de dominio que condicionan todas las consultas de este modelo:
 *  - fac_nro_origen se guarda en la COT apuntando a la VTA generada, y la COT
 *    permanece fac_est_fac='A' despues de facturarse. Por eso "cotizacion
 *    pendiente" es fac_nro_origen IS NULL, no un estado.
 *  - fac_est_woo vive en la COT, no en la VTA. La grilla de pedidos se alimenta
 *    de las COT.
 *  - dbo.factura.fac_sec es DECIMAL(12,0).
 *  - Las fechas se pasan como string 'YYYY-MM-DD' y los rangos son semiabiertos
 *    por el bug de timezone del driver mssql.
 */

const { poolPromise, sql } = require('../db');
const { porcentajeDeCanal, redondear2 } = require('../utils/comisionUtils');

/** Estados de WooCommerce que se consideran pago confirmado. */
const ESTADOS_CONFIRMADOS = Object.freeze([
  'processing',
  'completed',
  'epayco_processing',
  'epayco_completed'
]);

/**
 * Estados que cierran el caso sin pago porque el usuario ya decidio.
 *
 * "Confirmado" y "resuelto" no son lo mismo: un pedido cancelado nunca va a
 * estar confirmado, pero tampoco debe bloquear el cierre — si lo hiciera, la
 * accion "marcar como no pagado" seria un callejon sin salida.
 *
 * Deliberadamente NO incluye refunded, failed, epayco_failed, epayco_cancelled
 * ni epayco_refunded: esos no los resolvio nadie dentro del wizard y conviene
 * que alguien los revise antes de cerrar el mes.
 */
const ESTADOS_CANCELADOS = Object.freeze(['cancelled']);

/** Un pedido esta resuelto si se confirmo el pago o si se cancelo. */
const estaResuelto = (fac_est_woo) =>
  ESTADOS_CONFIRMADOS.includes(fac_est_woo) || ESTADOS_CANCELADOS.includes(fac_est_woo);

/**
 * Rango semiabierto del mes: [inicio, fin).
 * @returns {{inicio: string, fin: string}} fechas 'YYYY-MM-DD'
 */
const rangoMes = (anio, mes) => {
  const dosDigitos = (n) => String(n).padStart(2, '0');
  const anioFin = mes === 12 ? anio + 1 : anio;
  const mesFin = mes === 12 ? 1 : mes + 1;
  return {
    inicio: `${anio}-${dosDigitos(mes)}-01`,
    fin: `${anioFin}-${dosDigitos(mesFin)}-01`
  };
};

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const etiquetaPeriodo = (anio, mes) => `${MESES[mes - 1]} ${anio}`;

/* ==========================================================================
   VALIDACION DE PERIODO
   ========================================================================== */

/**
 * Busca el cierre ACTIVO de un periodo, si existe.
 * @param {sql.Request} [request] - request opcional para operar dentro de una transaccion
 */
const buscarCierreActivo = async (anio, mes, request = null) => {
  const req = request || (await poolPromise).request();
  const result = await req
    .input('anio', sql.Int, anio)
    .input('mes', sql.Int, mes)
    .query(`
      SELECT cie_sec, cie_fec_cierre, cie_usu_cod
      FROM dbo.cierre_mes
      WHERE cie_anio = @anio AND cie_mes = @mes AND cie_estado = 'A'
    `);
  return result.recordset[0] || null;
};

/**
 * Valida las dos reglas de periodo:
 *  1. No puede existir otro cierre activo para el mismo anio/mes.
 *  2. El periodo debe ser estrictamente anterior al mes en curso del servidor.
 *
 * @returns {Promise<{puede_cerrar: boolean, motivo: string|null, codigo: string, cierre_existente?: object}>}
 */
const validarPeriodo = async (anio, mes) => {
  const ahora = new Date();
  const anioActual = ahora.getFullYear();
  const mesActual = ahora.getMonth() + 1;

  // Regla 2 primero: es puramente aritmetica y no toca la BD.
  if (anio > anioActual || (anio === anioActual && mes >= mesActual)) {
    return {
      puede_cerrar: false,
      motivo: `El periodo ${etiquetaPeriodo(anio, mes)} aun no ha vencido. Solo se puede cerrar un mes ya terminado.`,
      codigo: 'MES_NO_VENCIDO'
    };
  }

  const existente = await buscarCierreActivo(anio, mes);
  if (existente) {
    return {
      puede_cerrar: false,
      motivo: `Ya existe un cierre activo para ${etiquetaPeriodo(anio, mes)}`,
      codigo: 'CIERRE_EXISTENTE',
      cierre_existente: {
        cie_sec: existente.cie_sec,
        cie_fec_cierre: existente.cie_fec_cierre,
        cie_usu_cod: existente.cie_usu_cod
      }
    };
  }

  return { puede_cerrar: true, motivo: null, codigo: 'OK' };
};

/* ==========================================================================
   CONSULTAS DEL PERIODO
   ========================================================================== */

/**
 * Pedidos del periodo: COT activas con pedido de WooCommerce asociado.
 * Incluye tanto las ya facturadas como las pendientes — el frontend distingue
 * por los flags `confirmado` y `facturado`.
 */
const obtenerPedidosPeriodo = async (anio, mes) => {
  const { inicio, fin } = rangoMes(anio, mes);
  const pool = await poolPromise;

  const result = await pool.request()
    .input('fec_ini', sql.VarChar(10), inicio)
    .input('fec_fin', sql.VarChar(10), fin)
    .query(`
      SELECT
        f.fac_sec,
        f.fac_nro,
        f.fac_nro_woo,
        n.nit_nom,
        f.fac_fec,
        f.fac_est_woo,
        ISNULL(t.total, 0) AS total,
        f.fac_nro_origen
      FROM dbo.factura f
      LEFT JOIN dbo.nit n ON n.nit_sec = f.nit_sec
      LEFT JOIN (
        SELECT fk.fac_sec, SUM(fk.kar_total) AS total
        FROM dbo.facturakardes fk
        INNER JOIN dbo.factura f2 ON f2.fac_sec = fk.fac_sec
        WHERE f2.fac_tip_cod = 'COT'
          AND f2.fac_fec >= @fec_ini
          AND f2.fac_fec <  @fec_fin
        GROUP BY fk.fac_sec
      ) t ON t.fac_sec = f.fac_sec
      WHERE f.fac_tip_cod = 'COT'
        AND f.fac_est_fac = 'A'
        AND f.fac_nro_woo IS NOT NULL
        AND f.fac_nro_woo <> ''
        AND f.fac_fec >= @fec_ini
        AND f.fac_fec <  @fec_fin
      ORDER BY f.fac_fec, f.fac_nro
    `);

  return result.recordset.map(r => ({
    fac_sec: Number(r.fac_sec),
    fac_nro: r.fac_nro,
    fac_nro_woo: r.fac_nro_woo,
    nit_nom: r.nit_nom,
    fac_fec: r.fac_fec,
    fac_est_woo: r.fac_est_woo,
    total: redondear2(r.total),
    // Cualquier estado fuera de la lista blanca (incluido NULL) cuenta como no confirmado.
    confirmado: ESTADOS_CONFIRMADOS.includes(r.fac_est_woo),
    // resuelto es lo que decide si el pedido bloquea el cierre; confirmado solo
    // alimenta el chip de estado de la grilla.
    resuelto: estaResuelto(r.fac_est_woo),
    facturado: r.fac_nro_origen !== null && r.fac_nro_origen !== '',
    fac_nro_origen: r.fac_nro_origen
  }));
};

/**
 * Cotizaciones del periodo pendientes de facturar.
 * Incluye las locales (sin fac_nro_woo): tambien bloquean el cierre.
 */
const obtenerCotizacionesPendientes = async (anio, mes) => {
  const { inicio, fin } = rangoMes(anio, mes);
  const pool = await poolPromise;

  const result = await pool.request()
    .input('fec_ini', sql.VarChar(10), inicio)
    .input('fec_fin', sql.VarChar(10), fin)
    .query(`
      SELECT
        f.fac_sec,
        f.fac_nro,
        f.fac_nro_woo,
        n.nit_nom,
        f.fac_fec,
        f.fac_est_woo,
        ISNULL(t.total, 0) AS total
      FROM dbo.factura f
      LEFT JOIN dbo.nit n ON n.nit_sec = f.nit_sec
      LEFT JOIN (
        SELECT fk.fac_sec, SUM(fk.kar_total) AS total
        FROM dbo.facturakardes fk
        INNER JOIN dbo.factura f2 ON f2.fac_sec = fk.fac_sec
        WHERE f2.fac_tip_cod = 'COT'
          AND f2.fac_fec >= @fec_ini
          AND f2.fac_fec <  @fec_fin
        GROUP BY fk.fac_sec
      ) t ON t.fac_sec = f.fac_sec
      WHERE f.fac_tip_cod = 'COT'
        AND f.fac_est_fac = 'A'
        AND f.fac_nro_origen IS NULL
        AND f.fac_fec >= @fec_ini
        AND f.fac_fec <  @fec_fin
      ORDER BY f.fac_fec, f.fac_nro
    `);

  return result.recordset.map(r => ({
    fac_sec: Number(r.fac_sec),
    fac_nro: r.fac_nro,
    fac_nro_woo: r.fac_nro_woo,
    nit_nom: r.nit_nom,
    fac_fec: r.fac_fec,
    fac_est_woo: r.fac_est_woo,
    total: redondear2(r.total)
  }));
};

/**
 * Facturas de venta activas del periodo, una fila por documento.
 *
 * Se arranca de dbo.factura (no de la vista) para que una VTA activa sin lineas
 * utiles igual quede registrada en el detalle del cierre y el conteo de ordenes
 * coincida con la realidad. Los importes se toman de vw_ventas_dashboard, que
 * ya excluye componentes de bundle y solo considera kar_nat='-'.
 *
 * El canal se deriva con la misma regla que usa la vista, para que los numeros
 * del cierre cuadren con los del dashboard de ventas.
 *
 * @param {sql.Request} [request] - request opcional para leer dentro de la transaccion del cierre
 */
const obtenerFacturasPeriodo = async (anio, mes, request = null) => {
  const { inicio, fin } = rangoMes(anio, mes);
  const req = request || (await poolPromise).request();

  const result = await req
    .input('anio', sql.Int, anio)
    .input('mes', sql.Int, mes)
    .input('fec_ini', sql.VarChar(10), inicio)
    .input('fec_fin', sql.VarChar(10), fin)
    .query(`
      SELECT
        f.fac_sec,
        f.fac_nro,
        CASE WHEN f.fac_nro_woo IS NOT NULL THEN 'WooCommerce' ELSE 'Local' END AS canal,
        f.fac_fec,
        ISNULL(v.total, 0)        AS total,
        ISNULL(v.rentabilidad, 0) AS rentabilidad
      FROM dbo.factura f
      LEFT JOIN (
        SELECT fac_sec,
               SUM(total_linea)    AS total,
               SUM(utilidad_linea) AS rentabilidad
        FROM dbo.vw_ventas_dashboard
        WHERE anio = @anio
          AND mes  = @mes
          AND estado_interno = 'A'
        GROUP BY fac_sec
      ) v ON v.fac_sec = f.fac_sec
      WHERE f.fac_tip_cod = 'VTA'
        AND f.fac_est_fac = 'A'
        AND f.fac_fec >= @fec_ini
        AND f.fac_fec <  @fec_fin
      ORDER BY f.fac_fec, f.fac_nro
    `);

  return result.recordset.map(r => ({
    fac_sec: Number(r.fac_sec),
    fac_nro: r.fac_nro,
    canal: r.canal,
    fac_fec: r.fac_fec,
    total: redondear2(r.total),
    rentabilidad: redondear2(r.rentabilidad)
  }));
};

/* ==========================================================================
   CALCULO DEL RESUMEN
   ========================================================================== */

/**
 * Construye el resumen por canal a partir de las facturas del periodo.
 *
 * La comision se calcula y redondea POR FACTURA y luego se suma. Calcularla
 * sobre el total del canal daria un centavo de diferencia contra la suma del
 * detalle (SUM(round(x)) != round(SUM(x))), y el cierre exige que detalle y
 * cabecera cuadren exactamente.
 *
 * @param {Array} facturas - salida de obtenerFacturasPeriodo
 * @param {{WooCommerce: number, Local: number}} porcentajes
 * @returns {{detalle: Array, canales: Array, totales: object}}
 */
const construirResumen = (facturas, porcentajes) => {
  const detalle = facturas.map(f => {
    const pct = porcentajeDeCanal(porcentajes, f.canal);
    return {
      fac_sec: f.fac_sec,
      fac_nro: f.fac_nro,
      canal: f.canal,
      fecha: f.fac_fec,
      total: f.total,
      rentabilidad: f.rentabilidad,
      comision: redondear2(f.total * pct / 100)
    };
  });

  const acumular = (canal) => {
    const filas = detalle.filter(d => d.canal === canal);
    const ordenes = filas.length;
    const ventas = redondear2(filas.reduce((s, d) => s + d.total, 0));
    const comision = redondear2(filas.reduce((s, d) => s + d.comision, 0));
    const rentabilidad = redondear2(filas.reduce((s, d) => s + d.rentabilidad, 0));
    return {
      canal,
      ordenes,
      ventas,
      ticket_promedio: ordenes > 0 ? redondear2(ventas / ordenes) : 0,
      porcentaje_comision: porcentajeDeCanal(porcentajes, canal),
      comision,
      rentabilidad
    };
  };

  // Ambos canales se reportan siempre, aunque el mes no haya tenido movimiento.
  const canales = [acumular('WooCommerce'), acumular('Local')];

  const totales = {
    ordenes: canales.reduce((s, c) => s + c.ordenes, 0),
    ventas: redondear2(canales.reduce((s, c) => s + c.ventas, 0)),
    comision: redondear2(canales.reduce((s, c) => s + c.comision, 0)),
    rentabilidad: redondear2(canales.reduce((s, c) => s + c.rentabilidad, 0))
  };

  return { detalle, canales, totales };
};


/* ==========================================================================
   CRUD DE CIERRES
   ========================================================================== */

/**
 * Listado paginado de cierres, mas recientes primero.
 */
const listarCierres = async ({ page = 1, pageSize = 20 }) => {
  const pool = await poolPromise;
  const offset = (page - 1) * pageSize;

  const result = await pool.request()
    .input('offset', sql.Int, offset)
    .input('pageSize', sql.Int, pageSize)
    .query(`
      SELECT
        cie_sec, cie_anio, cie_mes, cie_estado, cie_fec_cierre, cie_usu_cod,
        cie_total_ordenes, cie_total_ventas, cie_total_comision, cie_total_rentabilidad,
        cie_obs, cie_anu_fec, cie_anu_usu_cod
      FROM dbo.cierre_mes
      ORDER BY cie_anio DESC, cie_mes DESC, cie_sec DESC
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;

      SELECT COUNT(*) AS total FROM dbo.cierre_mes;
    `);

  return {
    data: result.recordsets[0],
    total: result.recordsets[1][0].total
  };
};

/**
 * Cabecera completa de un cierre mas su detalle.
 * @returns {Promise<object|null>} null si el cie_sec no existe
 */
const obtenerCierre = async (cie_sec) => {
  const pool = await poolPromise;

  const result = await pool.request()
    .input('cie_sec', sql.Int, cie_sec)
    .query(`
      SELECT * FROM dbo.cierre_mes WHERE cie_sec = @cie_sec;

      SELECT cid_sec, cie_sec, fac_sec, fac_nro, cid_canal, cid_fecha,
             cid_total, cid_rentabilidad, cid_comision
      FROM dbo.cierre_mes_detalle
      WHERE cie_sec = @cie_sec
      ORDER BY cid_fecha, fac_nro;
    `);

  const cabecera = result.recordsets[0][0];
  if (!cabecera) return null;

  return {
    ...cabecera,
    detalle: result.recordsets[1].map(d => ({
      ...d,
      fac_sec: Number(d.fac_sec)
    }))
  };
};

/** Numeros de error de SQL Server para violacion de indice unico. */
const ERRORES_DUPLICADO = [2601, 2627];

/**
 * Genera el cierre: cabecera + detalle en UNA sola transaccion.
 *
 * Los porcentajes llegan ya resueltos desde dbo.parametros y se congelan en la
 * cabecera: cambiarlos despues no altera un cierre ya generado.
 *
 * La lectura de las facturas se hace DENTRO de la transaccion para que lo que
 * se guarda sea exactamente lo que se conto.
 *
 * @throws {Error} con .codigo='CIERRE_EXISTENTE' si el indice unico rechaza el periodo
 */
const crearCierre = async ({ anio, mes, cie_obs, usu_cod, porcentajes }) => {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    // 1. Revalidar el duplicado dentro de la transaccion (el indice unico es
    //    la garantia final, esto solo permite dar un error mas claro).
    const existente = await buscarCierreActivo(anio, mes, new sql.Request(transaction));
    if (existente) {
      const err = new Error(`Ya existe un cierre activo para ${etiquetaPeriodo(anio, mes)}`);
      err.codigo = 'CIERRE_EXISTENTE';
      err.cierre_existente = existente;
      throw err;
    }

    // 2. Leer las facturas del periodo y calcular el resumen.
    const facturas = await obtenerFacturasPeriodo(anio, mes, new sql.Request(transaction));
    const { detalle, canales, totales } = construirResumen(facturas, porcentajes);

    const woo = canales.find(c => c.canal === 'WooCommerce');
    const loc = canales.find(c => c.canal === 'Local');

    // 3. Insertar la cabecera.
    const headerResult = await new sql.Request(transaction)
      .input('cie_anio', sql.Int, anio)
      .input('cie_mes', sql.Int, mes)
      .input('cie_usu_cod', sql.VarChar(100), usu_cod)
      .input('cie_obs', sql.VarChar(1024), cie_obs || null)
      .input('woo_ordenes', sql.Int, woo.ordenes)
      .input('woo_ventas', sql.Decimal(17, 2), woo.ventas)
      .input('woo_ticket', sql.Decimal(17, 2), woo.ticket_promedio)
      .input('woo_pct', sql.Decimal(5, 2), woo.porcentaje_comision)
      .input('woo_comision', sql.Decimal(17, 2), woo.comision)
      .input('woo_rent', sql.Decimal(17, 2), woo.rentabilidad)
      .input('loc_ordenes', sql.Int, loc.ordenes)
      .input('loc_ventas', sql.Decimal(17, 2), loc.ventas)
      .input('loc_ticket', sql.Decimal(17, 2), loc.ticket_promedio)
      .input('loc_pct', sql.Decimal(5, 2), loc.porcentaje_comision)
      .input('loc_comision', sql.Decimal(17, 2), loc.comision)
      .input('loc_rent', sql.Decimal(17, 2), loc.rentabilidad)
      .input('tot_ordenes', sql.Int, totales.ordenes)
      .input('tot_ventas', sql.Decimal(17, 2), totales.ventas)
      .input('tot_comision', sql.Decimal(17, 2), totales.comision)
      .input('tot_rent', sql.Decimal(17, 2), totales.rentabilidad)
      .query(`
        INSERT INTO dbo.cierre_mes (
          cie_anio, cie_mes, cie_estado, cie_fec_cierre, cie_usu_cod,
          cie_woo_ordenes, cie_woo_ventas, cie_woo_ticket_prom, cie_woo_pct_comision,
          cie_woo_comision, cie_woo_rentabilidad,
          cie_loc_ordenes, cie_loc_ventas, cie_loc_ticket_prom, cie_loc_pct_comision,
          cie_loc_comision, cie_loc_rentabilidad,
          cie_total_ordenes, cie_total_ventas, cie_total_comision, cie_total_rentabilidad,
          cie_obs
        )
        OUTPUT INSERTED.cie_sec, INSERTED.cie_fec_cierre
        VALUES (
          @cie_anio, @cie_mes, 'A', GETDATE(), @cie_usu_cod,
          @woo_ordenes, @woo_ventas, @woo_ticket, @woo_pct, @woo_comision, @woo_rent,
          @loc_ordenes, @loc_ventas, @loc_ticket, @loc_pct, @loc_comision, @loc_rent,
          @tot_ordenes, @tot_ventas, @tot_comision, @tot_rent,
          @cie_obs
        )
      `);

    const { cie_sec, cie_fec_cierre } = headerResult.recordset[0];

    // 4. Insertar el detalle en bloques. El limite de parametros de SQL Server
    //    es 2100; con 6 por fila, 100 filas por bloque deja amplio margen.
    const TAMANO_BLOQUE = 100;
    for (let i = 0; i < detalle.length; i += TAMANO_BLOQUE) {
      const bloque = detalle.slice(i, i + TAMANO_BLOQUE);
      const req = new sql.Request(transaction);
      req.input('cie_sec', sql.Int, cie_sec);

      const values = bloque.map((d, j) => {
        req.input(`fs${j}`, sql.Decimal(12, 0), d.fac_sec);
        req.input(`fn${j}`, sql.VarChar(15), d.fac_nro);
        req.input(`cc${j}`, sql.VarChar(20), d.canal);
        req.input(`cf${j}`, sql.DateTime, d.fecha);
        req.input(`ct${j}`, sql.Decimal(17, 2), d.total);
        req.input(`cr${j}`, sql.Decimal(17, 2), d.rentabilidad);
        req.input(`cm${j}`, sql.Decimal(17, 2), d.comision);
        return `(@cie_sec, @fs${j}, @fn${j}, @cc${j}, @cf${j}, @ct${j}, @cr${j}, @cm${j})`;
      }).join(', ');

      await req.query(`
        INSERT INTO dbo.cierre_mes_detalle
          (cie_sec, fac_sec, fac_nro, cid_canal, cid_fecha, cid_total, cid_rentabilidad, cid_comision)
        VALUES ${values}
      `);
    }

    await transaction.commit();

    return {
      cie_sec,
      cie_anio: anio,
      cie_mes: mes,
      cie_estado: 'A',
      cie_fec_cierre,
      cie_usu_cod: usu_cod,
      cie_obs: cie_obs || null,
      canales,
      totales,
      detalle_registros: detalle.length
    };

  } catch (error) {
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      console.error('[CIERRE_MES] Error en rollback:', rollbackError.message);
    }
    // El indice unico filtrado gana la carrera ante dos cierres simultaneos.
    if (ERRORES_DUPLICADO.includes(error.number)) {
      const err = new Error(`Ya existe un cierre activo para ${etiquetaPeriodo(anio, mes)}`);
      err.codigo = 'CIERRE_EXISTENTE';
      throw err;
    }
    throw error;
  }
};

/**
 * Anulacion logica de un cierre. Cabecera y detalle se conservan siempre.
 * Al quedar cie_estado='I' el indice unico filtrado libera el periodo.
 *
 * @returns {Promise<{estado: string, cierre?: object}>} estado: 'OK' | 'NO_ENCONTRADO' | 'YA_ANULADO'
 */
const anularCierre = async ({ cie_sec, cie_anu_obs, usu_cod }) => {
  const pool = await poolPromise;

  const actual = await pool.request()
    .input('cie_sec', sql.Int, cie_sec)
    .query('SELECT cie_sec, cie_estado, cie_anio, cie_mes FROM dbo.cierre_mes WHERE cie_sec = @cie_sec');

  if (actual.recordset.length === 0) return { estado: 'NO_ENCONTRADO' };
  if (actual.recordset[0].cie_estado === 'I') return { estado: 'YA_ANULADO' };

  // El WHERE incluye cie_estado='A' para que dos anulaciones simultaneas no
  // se pisen: la segunda afecta 0 filas y se reporta como ya anulado.
  const result = await pool.request()
    .input('cie_sec', sql.Int, cie_sec)
    .input('cie_anu_obs', sql.VarChar(1024), cie_anu_obs)
    .input('cie_anu_usu_cod', sql.VarChar(100), usu_cod)
    .query(`
      UPDATE dbo.cierre_mes
      SET cie_estado      = 'I',
          cie_anu_obs     = @cie_anu_obs,
          cie_anu_fec     = GETDATE(),
          cie_anu_usu_cod = @cie_anu_usu_cod
      OUTPUT INSERTED.cie_sec, INSERTED.cie_anio, INSERTED.cie_mes,
             INSERTED.cie_estado, INSERTED.cie_anu_fec, INSERTED.cie_anu_usu_cod,
             INSERTED.cie_anu_obs
      WHERE cie_sec = @cie_sec AND cie_estado = 'A'
    `);

  if (result.recordset.length === 0) return { estado: 'YA_ANULADO' };
  return { estado: 'OK', cierre: result.recordset[0] };
};

/* ==========================================================================
   OPERACIONES SOBRE COTIZACIONES / PEDIDOS
   ========================================================================== */

/**
 * Datos minimos de una COT para las operaciones masivas.
 * @returns {Promise<object|null>}
 */
const obtenerCabeceraCotizacion = async (fac_sec) => {
  const pool = await poolPromise;
  const result = await pool.request()
    .input('fac_sec', sql.Decimal(12, 0), fac_sec)
    .query(`
      SELECT fac_sec, fac_nro, fac_tip_cod, fac_est_fac, fac_nro_woo,
             fac_est_woo, fac_nro_origen, fac_fec, nit_sec, fac_descuento_general
      FROM dbo.factura
      WHERE fac_sec = @fac_sec
    `);

  const row = result.recordset[0];
  if (!row) return null;
  return { ...row, fac_sec: Number(row.fac_sec) };
};

/**
 * Actualiza fac_est_woo del pedido y, cuando se pide, anula la VTA que se
 * generó a partir de esa cotización — todo en UNA transacción.
 *
 * Por qué no se reutiliza `orderModel.anularDocumento`: esa función abre su
 * propia transacción y llama a WooCommerce después del commit, así que no puede
 * compartir transacción con el cambio de estado del pedido. Y lo que hace es
 * justamente lo que se necesita aquí: marcar la cabecera en 'I'. No escribe
 * asientos de reversa porque no hacen falta — `dbo.vwExistencias` filtra
 * `fac_est_fac = 'A'`, así que al marcar la cabecera todas las líneas del
 * documento salen del cálculo de existencias de una vez. Eso cubre también las
 * líneas de bundle (padre y componentes comparten `fac_sec`).
 *
 * El estado llega ya normalizado a guion bajo.
 *
 * @param {object} params
 * @param {number} params.fac_sec - fac_sec de la COT
 * @param {string} params.estadoNormalizado - nuevo fac_est_woo
 * @param {boolean} params.anularVenta - si además debe anularse la VTA asociada
 * @param {string} params.motivo - observación de anulación de la VTA
 * @param {string} params.usu_cod
 * @returns {Promise<{local: boolean, vta_anulada: string|null}>}
 */
const actualizarEstadoPedido = async ({ fac_sec, estadoNormalizado, anularVenta, motivo, usu_cod }) => {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const actualizado = await new sql.Request(transaction)
      .input('fac_sec', sql.Decimal(12, 0), fac_sec)
      .input('fac_est_woo', sql.VarChar(50), estadoNormalizado)
      .input('usu_cod', sql.VarChar(100), usu_cod)
      .query(`
        UPDATE dbo.factura
        SET fac_est_woo     = @fac_est_woo,
            fac_usu_cod_mod = @usu_cod,
            fac_fch_mod     = GETDATE()
        WHERE fac_sec = @fac_sec AND fac_tip_cod = 'COT'
      `);

    if (actualizado.rowsAffected[0] === 0) {
      throw new Error('No se pudo actualizar el estado del pedido');
    }

    let vta_anulada = null;

    if (anularVenta) {
      // La VTA se localiza por el fac_nro_origen que la COT tiene estampado.
      // El filtro fac_est_fac='A' hace que una VTA ya anulada no se toque y que
      // dos anulaciones concurrentes no se pisen.
      const anulacion = await new sql.Request(transaction)
        .input('fac_sec', sql.Decimal(12, 0), fac_sec)
        .input('motivo', sql.VarChar(1024), motivo)
        .input('usu_cod', sql.VarChar(100), usu_cod)
        .query(`
          UPDATE v
          SET v.fac_est_fac     = 'I',
              v.fac_obs         = @motivo,
              v.fac_anu_obs     = @motivo,
              v.fac_anu_fec     = GETDATE(),
              v.fac_usu_cod_mod = @usu_cod,
              v.fac_fch_mod     = GETDATE()
          OUTPUT INSERTED.fac_nro
          FROM dbo.factura v
          INNER JOIN dbo.factura c ON c.fac_nro_origen = v.fac_nro
          WHERE c.fac_sec = @fac_sec
            AND v.fac_tip_cod = 'VTA'
            AND v.fac_est_fac = 'A'
        `);

      vta_anulada = anulacion.recordset[0]?.fac_nro || null;
    }

    await transaction.commit();
    return { local: true, vta_anulada };

  } catch (error) {
    // Si la anulación de la VTA falla, el pedido tampoco queda cancelado: es
    // justo el estado inconsistente (pedido muerto con factura viva) que este
    // flujo existe para evitar.
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      console.error('[CIERRE_MES] Error en rollback de estado de pedido:', rollbackError.message);
    }
    throw error;
  }
};

/**
 * Anulacion logica de una cotizacion.
 *
 * Escribe fac_obs (para no romper las pantallas que ya lo leen, igual que hace
 * orderModel.anularDocumento) y ademas fac_anu_obs / fac_anu_fec, que son las
 * columnas de auditoria de anulacion que esa funcion nunca llego a poblar.
 *
 * El WHERE exige fac_est_fac='A' para que una segunda anulacion concurrente
 * afecte 0 filas en vez de sobrescribir la primera.
 *
 * @returns {Promise<boolean>} false si ya estaba anulada
 */
const anularCotizacion = async ({ fac_sec, fac_obs, usu_cod }) => {
  const pool = await poolPromise;
  const result = await pool.request()
    .input('fac_sec', sql.Decimal(12, 0), fac_sec)
    .input('fac_obs', sql.VarChar(1024), fac_obs)
    .input('usu_cod', sql.VarChar(100), usu_cod)
    .query(`
      UPDATE dbo.factura
      SET fac_est_fac     = 'I',
          fac_obs         = @fac_obs,
          fac_anu_obs     = @fac_obs,
          fac_anu_fec     = GETDATE(),
          fac_usu_cod_mod = @usu_cod,
          fac_fch_mod     = GETDATE()
      WHERE fac_sec = @fac_sec AND fac_est_fac = 'A'
    `);

  return result.rowsAffected[0] > 0;
};

module.exports = {
  ESTADOS_CONFIRMADOS,
  ESTADOS_CANCELADOS,
  estaResuelto,
  rangoMes,
  etiquetaPeriodo,
  buscarCierreActivo,
  validarPeriodo,
  obtenerPedidosPeriodo,
  obtenerCotizacionesPendientes,
  obtenerFacturasPeriodo,
  construirResumen,
  listarCierres,
  obtenerCierre,
  crearCierre,
  anularCierre,
  obtenerCabeceraCotizacion,
  actualizarEstadoPedido,
  anularCotizacion
};
