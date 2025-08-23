# IMPLEMENTACIÓN SISTEMA DE PRECIOS CON ARQUITECTURA SOLID
## API ACADEMIA - SQL Server

### RESUMEN EJECUTIVO
Este documento actualiza la implementación del sistema de precios y ofertas para API Academia, manteniendo SQL Server como base de datos y aplicando principios SOLID para crear un servicio global de precios escalable y mantenible.

---

## 1. ARQUITECTURA SOLID PARA SISTEMA DE PRECIOS

### 1.1 PRINCIPIOS APLICADOS

**S - Single Responsibility Principle (SRP)**
- `PrecioService`: Responsable únicamente de la lógica de cálculo de precios
- `PrecioRepository`: Responsable únicamente del acceso a datos de precios
- `OfertaService`: Responsable únicamente de la gestión de ofertas

**O - Open/Closed Principle (OCP)**
- Interfaces extensibles para diferentes tipos de cálculo de precios
- Fácil agregar nuevos tipos de descuentos sin modificar código existente

**L - Liskov Substitution Principle (LSP)**
- Implementaciones intercambiables de servicios de precios
- Repositorios que pueden ser sustituidos sin afectar la lógica de negocio

**I - Interface Segregation Principle (ISP)**
- Interfaces específicas para cada responsabilidad
- Clientes no dependen de métodos que no utilizan

**D - Dependency Inversion Principle (DIP)**
- Dependencia de abstracciones, no de implementaciones concretas
- Inyección de dependencias para facilitar testing y mantenimiento

---

## 2. IMPLEMENTACIÓN DE SERVICIOS

## 2. ESTRUCTURA DE BASE DE DATOS - ENCABEZADO DETALLE

### 2.1 TABLAS DE PROMOCIONES

```sql
-- Tabla encabezado de promociones
CREATE TABLE [dbo].[promociones](
    [pro_sec] [decimal](18, 0) IDENTITY(1,1) NOT NULL,
    [pro_codigo] [varchar](20) NOT NULL,
    [pro_descripcion] [varchar](200) NOT NULL,
    [pro_fecha_inicio] [datetime] NOT NULL,
    [pro_fecha_fin] [datetime] NOT NULL,
    [pro_activa] [char](1) DEFAULT 'S',               -- S/N
    [pro_tipo] [varchar](20) DEFAULT 'OFERTA',        -- OFERTA, DESCUENTO, etc.
    [pro_observaciones] [varchar](500) NULL,
    [pro_fecha_creacion] [datetime] DEFAULT GETDATE(),
    [pro_usuario_creacion] [varchar](50) NULL,
    [pro_fecha_modificacion] [datetime] NULL,
    [pro_usuario_modificacion] [varchar](50) NULL,
    PRIMARY KEY CLUSTERED ([pro_sec] ASC)
);

-- Tabla detalle de promociones (artículos)
CREATE TABLE [dbo].[promociones_detalle](
    [pro_det_sec] [decimal](18, 0) IDENTITY(1,1) NOT NULL,
    [pro_sec] [decimal](18, 0) NOT NULL,
    [art_sec] [varchar](30) NOT NULL,
    [pro_det_precio_oferta] [decimal](17, 2) NOT NULL,
    [pro_det_descuento_porcentaje] [decimal](5, 2) NULL,
    [pro_det_observaciones] [varchar](200) NULL,
    [pro_det_fecha_creacion] [datetime] DEFAULT GETDATE(),
    [pro_det_usuario_creacion] [varchar](50) NULL,
    PRIMARY KEY CLUSTERED ([pro_det_sec] ASC)
);

-- Índices para optimización
CREATE NONCLUSTERED INDEX IDX_Promociones_Codigo
ON dbo.promociones (pro_codigo);

CREATE NONCLUSTERED INDEX IDX_Promociones_Fechas
ON dbo.promociones (pro_fecha_inicio, pro_fecha_fin, pro_activa);

CREATE NONCLUSTERED INDEX IDX_PromocionesDetalle_ProSec
ON dbo.promociones_detalle (pro_sec);

CREATE NONCLUSTERED INDEX IDX_PromocionesDetalle_ArtSec
ON dbo.promociones_detalle (art_sec);

-- Foreign keys
ALTER TABLE [dbo].[promociones_detalle] 
ADD CONSTRAINT [FK_PromocionesDetalle_Promociones] 
FOREIGN KEY([pro_sec]) REFERENCES [dbo].[promociones] ([pro_sec]);

ALTER TABLE [dbo].[promociones_detalle] 
ADD CONSTRAINT [FK_PromocionesDetalle_Articulos] 
FOREIGN KEY([art_sec]) REFERENCES [dbo].[articulos] ([art_sec]);
```

### 2.2 FUNCIÓN ACTUALIZADA PARA CALCULAR PRECIO CON PROMOCIÓN

```sql
CREATE FUNCTION dbo.fn_GetPrecioConPromocion
(
    @art_sec VARCHAR(30),
    @lis_pre_cod SMALLINT,
    @fecha_consulta DATETIME = NULL
)
RETURNS DECIMAL(17, 2)
AS
BEGIN
    DECLARE @precio_final DECIMAL(17, 2) = 0
    DECLARE @fecha DATETIME = ISNULL(@fecha_consulta, GETDATE())
    DECLARE @precio_oferta DECIMAL(17, 2) = NULL
    DECLARE @descuento_porcentaje DECIMAL(5, 2) = NULL
    
    -- Obtener promoción activa para el artículo
    SELECT TOP 1 
        @precio_oferta = pd.pro_det_precio_oferta,
        @descuento_porcentaje = pd.pro_det_descuento_porcentaje
    FROM dbo.promociones p
    INNER JOIN dbo.promociones_detalle pd ON p.pro_sec = pd.pro_sec
    WHERE pd.art_sec = @art_sec 
      AND p.pro_activa = 'S'
      AND @fecha BETWEEN p.pro_fecha_inicio AND p.pro_fecha_fin
    ORDER BY p.pro_fecha_creacion DESC
    
    -- Si hay promoción activa, calcular precio
    IF @precio_oferta IS NOT NULL AND @precio_oferta > 0
    BEGIN
        SET @precio_final = @precio_oferta
    END
    ELSE IF @descuento_porcentaje IS NOT NULL AND @descuento_porcentaje > 0
    BEGIN
        -- Obtener precio base y aplicar descuento
        SELECT @precio_final = ISNULL(art_bod_pre, 0)
        FROM dbo.articulosdetalle
        WHERE art_sec = @art_sec 
          AND lis_pre_cod = @lis_pre_cod
          AND bod_sec = '1'
        
        SET @precio_final = @precio_final * (1 - (@descuento_porcentaje / 100))
    END
    ELSE
    BEGIN
        -- Usar precio normal según el tipo
        SELECT @precio_final = ISNULL(art_bod_pre, 0)
        FROM dbo.articulosdetalle
        WHERE art_sec = @art_sec 
          AND lis_pre_cod = @lis_pre_cod
          AND bod_sec = '1'
    END
    
    RETURN @precio_final
END
```

### 2.3 FUNCIÓN PARA VALIDAR PRECIO DE PROMOCIÓN

```sql
CREATE FUNCTION dbo.fn_ValidarPrecioPromocion
(
    @art_sec VARCHAR(30),
    @precio_oferta DECIMAL(17, 2),
    @descuento_porcentaje DECIMAL(5, 2) = NULL
)
RETURNS TABLE
AS
RETURN
(
    SELECT 
        CASE 
            WHEN @precio_oferta IS NOT NULL AND @precio_oferta <= 0 THEN 'El precio de oferta debe ser mayor a 0'
            WHEN @precio_oferta IS NOT NULL AND @precio_oferta >= precio_detal THEN 'El precio de oferta debe ser menor al precio detal'
            WHEN @precio_oferta IS NOT NULL AND @precio_oferta >= precio_mayor THEN 'El precio de oferta debe ser menor al precio mayor'
            WHEN @descuento_porcentaje IS NOT NULL AND (@descuento_porcentaje <= 0 OR @descuento_porcentaje >= 100) THEN 'El descuento debe estar entre 0 y 100%'
            ELSE 'OK'
        END AS validacion,
        precio_detal,
        precio_mayor
    FROM (
        SELECT 
            ISNULL(ad1.art_bod_pre, 0) AS precio_detal,
            ISNULL(ad2.art_bod_pre, 0) AS precio_mayor
        FROM dbo.articulos a
        LEFT JOIN dbo.articulosdetalle ad1 ON a.art_sec = ad1.art_sec AND ad1.lis_pre_cod = 1 AND ad1.bod_sec = '1'
        LEFT JOIN dbo.articulosdetalle ad2 ON a.art_sec = ad2.art_sec AND ad2.lis_pre_cod = 2 AND ad2.bod_sec = '1'
        WHERE a.art_sec = @art_sec
    ) AS precios
)
```

### 2.4 INTERFACES BASE ACTUALIZADAS

```javascript
// services/interfaces/IPrecioService.js
class IPrecioService {
  async calcularPrecio(art_sec, tipoPrecio, fecha = null) {
    throw new Error('Método debe ser implementado');
  }
  
  async obtenerPreciosCompletos(art_sec, fecha = null) {
    throw new Error('Método debe ser implementado');
  }
  
  async validarPrecioPromocion(art_sec, precioOferta, descuentoPorcentaje = null) {
    throw new Error('Método debe ser implementado');
  }
}

module.exports = IPrecioService;
```

```javascript
// services/interfaces/IPrecioRepository.js
class IPrecioRepository {
  async obtenerPrecioBase(art_sec, tipoPrecio) {
    throw new Error('Método debe ser implementado');
  }
  
  async obtenerPromocionActiva(art_sec, fecha) {
    throw new Error('Método debe ser implementado');
  }
  
  async obtenerPreciosOriginales(art_sec) {
    throw new Error('Método debe ser implementado');
  }
}

module.exports = IPrecioRepository;
```

### 2.5 IMPLEMENTACIÓN DEL REPOSITORIO ACTUALIZADO

```javascript
// services/repositories/PrecioRepository.js
const { sql, poolPromise } = require('../../db');
const IPrecioRepository = require('../interfaces/IPrecioRepository');

class PrecioRepository extends IPrecioRepository {
  async obtenerPrecioBase(art_sec, tipoPrecio) {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('art_sec', sql.VarChar(30), art_sec)
      .input('lis_pre_cod', sql.SmallInt, tipoPrecio)
      .query(`
        SELECT ISNULL(art_bod_pre, 0) as precio
        FROM dbo.articulosdetalle
        WHERE art_sec = @art_sec 
          AND lis_pre_cod = @lis_pre_cod
          AND bod_sec = '1'
      `);
    
    return result.recordset[0]?.precio || 0;
  }

  async obtenerPromocionActiva(art_sec, fecha = new Date()) {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('art_sec', sql.VarChar(30), art_sec)
      .input('fecha', sql.DateTime, fecha)
      .query(`
        SELECT TOP 1
          p.pro_sec,
          p.pro_codigo,
          p.pro_descripcion,
          p.pro_fecha_inicio,
          p.pro_fecha_fin,
          pd.pro_det_precio_oferta,
          pd.pro_det_descuento_porcentaje,
          pd.pro_det_observaciones
        FROM dbo.promociones p
        INNER JOIN dbo.promociones_detalle pd ON p.pro_sec = pd.pro_sec
        WHERE pd.art_sec = @art_sec 
          AND p.pro_activa = 'S'
          AND @fecha BETWEEN p.pro_fecha_inicio AND p.pro_fecha_fin
        ORDER BY p.pro_fecha_creacion DESC
      `);
    
    return result.recordset[0] || null;
  }

  async obtenerPreciosOriginales(art_sec) {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('art_sec', sql.VarChar(30), art_sec)
      .query(`
        SELECT 
          ISNULL(ad1.art_bod_pre, 0) AS precio_detal,
          ISNULL(ad2.art_bod_pre, 0) AS precio_mayor
        FROM dbo.articulos a
        LEFT JOIN dbo.articulosdetalle ad1 ON a.art_sec = ad1.art_sec AND ad1.lis_pre_cod = 1 AND ad1.bod_sec = '1'
        LEFT JOIN dbo.articulosdetalle ad2 ON a.art_sec = ad2.art_sec AND ad2.lis_pre_cod = 2 AND ad2.bod_sec = '1'
        WHERE a.art_sec = @art_sec
      `);
    
    return result.recordset[0] || { precio_detal: 0, precio_mayor: 0 };
  }

  async validarPrecioPromocion(art_sec, precioOferta, descuentoPorcentaje = null) {
    const precios = await this.obtenerPreciosOriginales(art_sec);
    
    if (precioOferta !== null && precioOferta <= 0) {
      return {
        valido: false,
        mensaje: 'El precio de oferta debe ser mayor a 0'
      };
    }
    
    if (precioOferta !== null && precioOferta >= precios.precio_detal) {
      return {
        valido: false,
        mensaje: 'El precio de oferta debe ser menor al precio detal'
      };
    }
    
    if (precioOferta !== null && precioOferta >= precios.precio_mayor) {
      return {
        valido: false,
        mensaje: 'El precio de oferta debe ser menor al precio mayor'
      };
    }
    
    if (descuentoPorcentaje !== null && (descuentoPorcentaje <= 0 || descuentoPorcentaje >= 100)) {
      return {
        valido: false,
        mensaje: 'El descuento debe estar entre 0 y 100%'
      };
    }
    
    return {
      valido: true,
      mensaje: 'OK',
      precios_originales: precios
    };
  }
}

module.exports = PrecioRepository;
```

### 2.6 IMPLEMENTACIÓN DEL SERVICIO DE PRECIOS ACTUALIZADO

```javascript
// services/PrecioService.js
const IPrecioService = require('./interfaces/IPrecioService');

class PrecioService extends IPrecioService {
  constructor(precioRepository) {
    super();
    this.precioRepository = precioRepository;
  }

  async calcularPrecio(art_sec, tipoPrecio, fecha = null) {
    try {
      // Obtener promoción activa
      const promocion = await this.precioRepository.obtenerPromocionActiva(art_sec, fecha);
      
      if (promocion && promocion.pro_det_precio_oferta > 0) {
        return {
          precio: promocion.pro_det_precio_oferta,
          tipo: 'promocion_precio',
          promocion_info: promocion
        };
      }
      
      if (promocion && promocion.pro_det_descuento_porcentaje > 0) {
        // Obtener precio base y aplicar descuento
        const precioBase = await this.precioRepository.obtenerPrecioBase(art_sec, tipoPrecio);
        const precioConDescuento = precioBase * (1 - (promocion.pro_det_descuento_porcentaje / 100));
        
        return {
          precio: precioConDescuento,
          tipo: 'promocion_descuento',
          promocion_info: promocion
        };
      }
      
      // Si no hay promoción, usar precio base
      const precioBase = await this.precioRepository.obtenerPrecioBase(art_sec, tipoPrecio);
      
      return {
        precio: precioBase,
        tipo: tipoPrecio === 1 ? 'detal' : 'mayor'
      };
      
    } catch (error) {
      throw new Error(`Error al calcular precio: ${error.message}`);
    }
  }

  async obtenerPreciosCompletos(art_sec, fecha = null) {
    try {
      const [precioDetal, precioMayor, promocion, preciosOriginales] = await Promise.all([
        this.calcularPrecio(art_sec, 1, fecha),
        this.calcularPrecio(art_sec, 2, fecha),
        this.precioRepository.obtenerPromocionActiva(art_sec, fecha),
        this.precioRepository.obtenerPreciosOriginales(art_sec)
      ]);

      const tienePromocion = promocion && (promocion.pro_det_precio_oferta > 0 || promocion.pro_det_descuento_porcentaje > 0);
      
      // Calcular descuentos
      const descuentoDetal = this.calcularDescuento(preciosOriginales.precio_detal, precioDetal.precio);
      const descuentoMayor = this.calcularDescuento(preciosOriginales.precio_mayor, precioMayor.precio);

      return {
        art_sec,
        precio_detal: precioDetal.precio,
        precio_mayor: precioMayor.precio,
        tiene_promocion: tienePromocion,
        promocion_info: promocion ? {
          pro_sec: promocion.pro_sec,
          pro_codigo: promocion.pro_codigo,
          pro_descripcion: promocion.pro_descripcion,
          pro_fecha_inicio: promocion.pro_fecha_inicio,
          pro_fecha_fin: promocion.pro_fecha_fin,
          precio_oferta: promocion.pro_det_precio_oferta,
          descuento_porcentaje: promocion.pro_det_descuento_porcentaje
        } : null,
        precio_detal_original: preciosOriginales.precio_detal,
        precio_mayor_original: preciosOriginales.precio_mayor,
        descuento_detal: descuentoDetal,
        descuento_mayor: descuentoMayor
      };
      
    } catch (error) {
      throw new Error(`Error al obtener precios completos: ${error.message}`);
    }
  }

  async validarPrecioPromocion(art_sec, precioOferta, descuentoPorcentaje = null) {
    return await this.precioRepository.validarPrecioPromocion(art_sec, precioOferta, descuentoPorcentaje);
  }

  calcularDescuento(precioOriginal, precioActual) {
    if (precioOriginal <= 0 || precioActual >= precioOriginal) {
      return 0;
    }
    return Math.round(((precioOriginal - precioActual) / precioOriginal) * 100 * 100) / 100;
  }
}

module.exports = PrecioService;
```

### 2.7 SERVICIO DE PROMOCIONES

```javascript
// services/PromocionService.js
const { sql, poolPromise } = require('../db');

class PromocionService {
  constructor(precioService) {
    this.precioService = precioService;
  }

  async crearPromocion(promocionData) {
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
        // Validar que el artículo existe
        const articuloExists = await request
          .input('art_sec', sql.VarChar(30), detalle.art_sec)
          .query('SELECT COUNT(*) as count FROM dbo.articulos WHERE art_sec = @art_sec');
        
        if (articuloExists.recordset[0].count === 0) {
          throw new Error(`Artículo ${detalle.art_sec} no encontrado`);
        }
        
        // Validar precio o descuento usando el servicio
        const validacion = await this.precioService.validarPrecioPromocion(
          detalle.art_sec, 
          detalle.precio_oferta || null,
          detalle.descuento_porcentaje || null
        );
        
        if (!validacion.valido) {
          throw new Error(`Artículo ${detalle.art_sec}: ${validacion.mensaje}`);
        }
        
        // Crear detalle de promoción
        await request
          .input('pro_sec', sql.Decimal(18, 0), proSec)
          .input('art_sec', sql.VarChar(30), detalle.art_sec)
          .input('precio_oferta', sql.Decimal(17, 2), detalle.precio_oferta || null)
          .input('descuento_porcentaje', sql.Decimal(5, 2), detalle.descuento_porcentaje || null)
          .input('observaciones', sql.VarChar(200), detalle.observaciones || null)
          .input('usuario', sql.VarChar(50), promocionData.usuario || 'SISTEMA')
          .query(`
            INSERT INTO dbo.promociones_detalle 
            (pro_sec, art_sec, pro_det_precio_oferta, pro_det_descuento_porcentaje, pro_det_observaciones, pro_det_usuario_creacion)
            VALUES (@pro_sec, @art_sec, @precio_oferta, @descuento_porcentaje, @observaciones, @usuario)
          `);
      }
      
      await transaction.commit();
      
      return {
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
      
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async obtenerPromocionesActivas() {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT 
        p.pro_sec,
        p.pro_codigo,
        p.pro_descripcion,
        p.pro_fecha_inicio,
        p.pro_fecha_fin,
        p.pro_tipo,
        p.pro_observaciones,
        DATEDIFF(day, GETDATE(), p.pro_fecha_fin) as dias_restantes,
        COUNT(pd.art_sec) as total_articulos,
        SUM(CASE WHEN pd.pro_det_precio_oferta > 0 THEN 1 ELSE 0 END) as articulos_precio_oferta,
        SUM(CASE WHEN pd.pro_det_descuento_porcentaje > 0 THEN 1 ELSE 0 END) as articulos_descuento
      FROM dbo.promociones p
      LEFT JOIN dbo.promociones_detalle pd ON p.pro_sec = pd.pro_sec
      WHERE p.pro_activa = 'S'
        AND GETDATE() BETWEEN p.pro_fecha_inicio AND p.pro_fecha_fin
      GROUP BY p.pro_sec, p.pro_codigo, p.pro_descripcion, p.pro_fecha_inicio, p.pro_fecha_fin, p.pro_tipo, p.pro_observaciones
      ORDER BY p.pro_fecha_fin ASC
    `);
    
    return result.recordset;
  }

  async obtenerPromocionPorId(proSec) {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('pro_sec', sql.Decimal(18, 0), proSec)
      .query(`
        SELECT 
          p.*,
          pd.pro_det_sec,
          pd.art_sec,
          pd.pro_det_precio_oferta,
          pd.pro_det_descuento_porcentaje,
          pd.pro_det_observaciones,
          a.art_cod,
          a.art_nom,
          ISNULL(ad1.art_bod_pre, 0) AS precio_detal_original,
          ISNULL(ad2.art_bod_pre, 0) AS precio_mayor_original
        FROM dbo.promociones p
        LEFT JOIN dbo.promociones_detalle pd ON p.pro_sec = pd.pro_sec
        LEFT JOIN dbo.articulos a ON pd.art_sec = a.art_sec
        LEFT JOIN dbo.articulosdetalle ad1 ON a.art_sec = ad1.art_sec AND ad1.lis_pre_cod = 1 AND ad1.bod_sec = '1'
        LEFT JOIN dbo.articulosdetalle ad2 ON a.art_sec = ad2.art_sec AND ad2.lis_pre_cod = 2 AND ad2.bod_sec = '1'
        WHERE p.pro_sec = @pro_sec
        ORDER BY a.art_nom
      `);
    
    if (result.recordset.length === 0) {
      return null;
    }
    
    // Estructurar resultado
    const promocion = {
      pro_sec: result.recordset[0].pro_sec,
      pro_codigo: result.recordset[0].pro_codigo,
      pro_descripcion: result.recordset[0].pro_descripcion,
      pro_fecha_inicio: result.recordset[0].pro_fecha_inicio,
      pro_fecha_fin: result.recordset[0].pro_fecha_fin,
      pro_tipo: result.recordset[0].pro_tipo,
      pro_observaciones: result.recordset[0].pro_observaciones,
      pro_activa: result.recordset[0].pro_activa,
      articulos: []
    };
    
    result.recordset.forEach(row => {
      if (row.art_sec) {
        promocion.articulos.push({
          pro_det_sec: row.pro_det_sec,
          art_sec: row.art_sec,
          art_cod: row.art_cod,
          art_nom: row.art_nom,
          precio_oferta: row.pro_det_precio_oferta,
          descuento_porcentaje: row.pro_det_descuento_porcentaje,
          observaciones: row.pro_det_observaciones,
          precio_detal_original: row.precio_detal_original,
          precio_mayor_original: row.precio_mayor_original
        });
      }
    });
    
    return promocion;
  }

  async cancelarPromocion(proSec, usuario = 'SISTEMA') {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('pro_sec', sql.Decimal(18, 0), proSec)
      .input('usuario', sql.VarChar(50), usuario)
      .query(`
        UPDATE dbo.promociones
        SET pro_activa = 'N',
            pro_fecha_modificacion = GETDATE(),
            pro_usuario_modificacion = @usuario
        WHERE pro_sec = @pro_sec
      `);
      
    return {
      success: true,
      message: 'Promoción cancelada exitosamente',
      registros_afectados: result.rowsAffected[0]
    };
  }

  async obtenerPromocionesPorArticulo(artSec) {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('art_sec', sql.VarChar(30), artSec)
      .query(`
        SELECT 
          p.pro_sec,
          p.pro_codigo,
          p.pro_descripcion,
          p.pro_fecha_inicio,
          p.pro_fecha_fin,
          p.pro_tipo,
          pd.pro_det_precio_oferta,
          pd.pro_det_descuento_porcentaje,
          pd.pro_det_observaciones,
          DATEDIFF(day, GETDATE(), p.pro_fecha_fin) as dias_restantes
        FROM dbo.promociones p
        INNER JOIN dbo.promociones_detalle pd ON p.pro_sec = pd.pro_sec
        WHERE pd.art_sec = @art_sec
          AND p.pro_activa = 'S'
          AND GETDATE() BETWEEN p.pro_fecha_inicio AND p.pro_fecha_fin
        ORDER BY p.pro_fecha_fin ASC
      `);
    
    return result.recordset;
  }
}

module.exports = PromocionService;
```

---

## 3. FACTORY PARA INYECCIÓN DE DEPENDENCIAS

```javascript
// services/factories/PrecioServiceFactory.js
const PrecioRepository = require('../repositories/PrecioRepository');
const PrecioService = require('../PrecioService');
const PromocionService = require('../PromocionService');

class PrecioServiceFactory {
  static createPrecioService() {
    const precioRepository = new PrecioRepository();
    return new PrecioService(precioRepository);
  }

  static createPromocionService() {
    const precioService = this.createPrecioService();
    return new PromocionService(precioService);
  }
}

module.exports = PrecioServiceFactory;
```

---

## 4. MIDDLEWARE PARA INYECCIÓN DE DEPENDENCIAS

```javascript
// middlewares/precioMiddleware.js
const PrecioServiceFactory = require('../services/factories/PrecioServiceFactory');

const injectPrecioService = (req, res, next) => {
  req.precioService = PrecioServiceFactory.createPrecioService();
  req.promocionService = PrecioServiceFactory.createPromocionService();
  next();
};

module.exports = { injectPrecioService };
```

---

## 5. CONTROLADORES ACTUALIZADOS

### 5.1 CONTROLADOR DE PRECIOS

```javascript
// controllers/precioController.js
const getPreciosArticulo = async (req, res) => {
  try {
    const { art_sec } = req.params;
    const { fecha } = req.query;
    
    if (!art_sec) {
      return res.status(400).json({
        success: false,
        error: 'art_sec es requerido'
      });
    }
    
    const precios = await req.precioService.obtenerPreciosCompletos(art_sec, fecha);
    
    res.json({
      success: true,
      precios
    });
    
  } catch (error) {
    console.error('Error al obtener precios:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

const calcularPrecio = async (req, res) => {
  try {
    const { art_sec, tipo_precio, fecha } = req.body;
    
    if (!art_sec || !tipo_precio) {
      return res.status(400).json({
        success: false,
        error: 'art_sec y tipo_precio son requeridos'
      });
    }
    
    const precio = await req.precioService.calcularPrecio(art_sec, tipo_precio, fecha);
    
    res.json({
      success: true,
      precio
    });
    
  } catch (error) {
    console.error('Error al calcular precio:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

module.exports = {
  getPreciosArticulo,
  calcularPrecio
};
```

### 5.2 CONTROLADOR DE PROMOCIONES

```javascript
// controllers/promocionController.js
const crearPromocion = async (req, res) => {
  try {
    const {
      codigo,
      descripcion,
      fecha_inicio,
      fecha_fin,
      tipo,
      observaciones,
      articulos
    } = req.body;
    
    if (!codigo || !descripcion || !fecha_inicio || !fecha_fin || !articulos || articulos.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'codigo, descripcion, fecha_inicio, fecha_fin y articulos son requeridos'
      });
    }
    
    const result = await req.promocionService.crearPromocion({
      codigo,
      descripcion,
      fecha_inicio,
      fecha_fin,
      tipo,
      observaciones,
      articulos,
      usuario: req.user?.username || 'SISTEMA'
    });
    
    res.json(result);
    
  } catch (error) {
    console.error('Error al crear promoción:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

const getPromocionesActivas = async (req, res) => {
  try {
    const promociones = await req.promocionService.obtenerPromocionesActivas();
    res.json({
      success: true,
      promociones,
      total: promociones.length
    });
  } catch (error) {
    console.error('Error al obtener promociones:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

const getPromocionPorId = async (req, res) => {
  try {
    const { pro_sec } = req.params;
    
    if (!pro_sec) {
      return res.status(400).json({
        success: false,
        error: 'pro_sec es requerido'
      });
    }
    
    const promocion = await req.promocionService.obtenerPromocionPorId(pro_sec);
    
    if (!promocion) {
      return res.status(404).json({
        success: false,
        error: 'Promoción no encontrada'
      });
    }
    
    res.json({
      success: true,
      promocion
    });
    
  } catch (error) {
    console.error('Error al obtener promoción:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

const cancelarPromocion = async (req, res) => {
  try {
    const { pro_sec } = req.params;
    
    if (!pro_sec) {
      return res.status(400).json({
        success: false,
        error: 'pro_sec es requerido'
      });
    }
    
    const result = await req.promocionService.cancelarPromocion(pro_sec, req.user?.username || 'SISTEMA');
    res.json(result);
    
  } catch (error) {
    console.error('Error al cancelar promoción:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

const getPromocionesPorArticulo = async (req, res) => {
  try {
    const { art_sec } = req.params;
    
    if (!art_sec) {
      return res.status(400).json({
        success: false,
        error: 'art_sec es requerido'
      });
    }
    
    const promociones = await req.promocionService.obtenerPromocionesPorArticulo(art_sec);
    res.json({
      success: true,
      promociones,
      total: promociones.length
    });
    
  } catch (error) {
    console.error('Error al obtener promociones del artículo:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

module.exports = {
  crearPromocion,
  getPromocionesActivas,
  getPromocionPorId,
  cancelarPromocion,
  getPromocionesPorArticulo
};
```

---

## 6. RUTAS ACTUALIZADAS

```javascript
// routes/precioRoutes.js
const express = require('express');
const router = express.Router();
const precioController = require('../controllers/precioController');
const { injectPrecioService } = require('../middlewares/precioMiddleware');
const authMiddleware = require('../middlewares/auth');

router.use(authMiddleware);
router.use(injectPrecioService);

// Obtener precios completos de un artículo
router.get('/articulo/:art_sec', precioController.getPreciosArticulo);

// Calcular precio específico
router.post('/calcular', precioController.calcularPrecio);

module.exports = router;
```

```javascript
// routes/promocionRoutes.js
const express = require('express');
const router = express.Router();
const promocionController = require('../controllers/promocionController');
const { injectPrecioService } = require('../middlewares/precioMiddleware');
const authMiddleware = require('../middlewares/auth');

router.use(authMiddleware);
router.use(injectPrecioService);

// Crear nueva promoción
router.post('/crear', promocionController.crearPromocion);

// Obtener promociones activas
router.get('/activas', promocionController.getPromocionesActivas);

// Obtener promoción por ID
router.get('/:pro_sec', promocionController.getPromocionPorId);

// Obtener promociones por artículo
router.get('/articulo/:art_sec', promocionController.getPromocionesPorArticulo);

// Cancelar promoción
router.delete('/cancelar/:pro_sec', promocionController.cancelarPromocion);

module.exports = router;
```

---

## 7. ACTUALIZACIÓN DEL MODELO DE ARTÍCULOS

```javascript
// models/articulosModel.js - Método actualizado
const getArticulos = async ({ codigo, nombre, inv_gru_cod, inv_sub_gru_cod, tieneExistencia, PageNumber, PageSize }) => {
  try {
    const pool = await poolPromise;

    const query = `
      SELECT
        a.art_sec,
        a.art_cod,
        a.art_woo_id,
        a.art_nom,
        a.art_url_img_servi,
        ig.inv_gru_cod,
        ig.inv_gru_nom AS categoria,
        isg.inv_sub_gru_cod,
        isg.inv_sub_gru_nom AS sub_categoria,
        -- Usar función SQL Server para precio con oferta
        dbo.fn_GetPrecioConOferta(a.art_sec, 1) AS precio_detal,
        dbo.fn_GetPrecioConOferta(a.art_sec, 2) AS precio_mayor,
        -- Indicador de oferta
        CASE 
          WHEN ao.ofe_sec IS NOT NULL 
               AND ao.ofe_activa = 'S'
               AND GETDATE() BETWEEN ao.ofe_fecha_inicio AND ao.ofe_fecha_fin
          THEN 'S'
          ELSE 'N'
        END AS tiene_oferta,
        -- Información de oferta
        ao.ofe_precio AS precio_oferta,
        ao.ofe_fecha_inicio AS oferta_fecha_inicio,
        ao.ofe_fecha_fin AS oferta_fecha_fin,
        -- Precios originales
        ISNULL(ad1.art_bod_pre, 0) AS precio_detal_original,
        ISNULL(ad2.art_bod_pre, 0) AS precio_mayor_original,
        -- Porcentajes de descuento
        CASE 
          WHEN ISNULL(ad1.art_bod_pre, 0) > 0 AND ao.ofe_precio IS NOT NULL
          THEN ROUND(((ad1.art_bod_pre - ao.ofe_precio) / ad1.art_bod_pre) * 100, 2)
          ELSE 0 
        END AS descuento_detal,
        CASE 
          WHEN ISNULL(ad2.art_bod_pre, 0) > 0 AND ao.ofe_precio IS NOT NULL
          THEN ROUND(((ad2.art_bod_pre - ao.ofe_precio) / ad2.art_bod_pre) * 100, 2)
          ELSE 0 
        END AS descuento_mayor,
        ISNULL(e.existencia, 0) AS existencia,
        a.art_woo_sync_status,
        a.art_woo_sync_message
      FROM dbo.articulos a
        INNER JOIN dbo.inventario_subgrupo isg ON a.inv_sub_gru_cod = isg.inv_sub_gru_cod
        INNER JOIN dbo.inventario_grupo ig ON isg.inv_gru_cod = ig.inv_gru_cod
        LEFT JOIN dbo.articulosdetalle ad1 ON a.art_sec = ad1.art_sec AND ad1.lis_pre_cod = 1 AND ad1.bod_sec = '1'
        LEFT JOIN dbo.articulosdetalle ad2 ON a.art_sec = ad2.art_sec AND ad2.lis_pre_cod = 2 AND ad2.bod_sec = '1'
        LEFT JOIN dbo.articulos_ofertas ao ON a.art_sec = ao.art_sec AND ao.ofe_activa = 'S'
        LEFT JOIN dbo.vwExistencias e ON a.art_sec = e.art_sec
      WHERE 1 = 1
        AND (@codigo IS NULL OR a.art_cod LIKE @codigo+'%')
        AND (@nombre IS NULL OR a.art_nom LIKE '%' + @nombre + '%')
        AND (@inv_gru_cod IS NULL OR ig.inv_gru_cod = @inv_gru_cod)
        AND (@inv_sub_gru_cod IS NULL OR isg.inv_sub_gru_cod = @inv_sub_gru_cod)
        AND (
               @tieneExistencia IS NULL 
               OR (@tieneExistencia = 1 AND ISNULL(e.existencia, 0) > 0)
               OR (@tieneExistencia = 0 AND ISNULL(e.existencia, 0) = 0)
            )
      ORDER BY a.art_nom
      OFFSET (@PageNumber - 1) * @PageSize ROWS
      FETCH NEXT @PageSize ROWS ONLY
      OPTION (RECOMPILE);
    `;

    // ... resto del código igual
  } catch (error) {
    throw error;
  }
};
```

---

## 8. ENDPOINTS DE LA API

### 8.1 PRECIOS
```
GET /api/precios/articulo/:art_sec?fecha=2024-01-15
POST /api/precios/calcular
{
  "art_sec": "12345",
  "tipo_precio": 1,
  "fecha": "2024-01-15T00:00:00.000Z"
}
```

### 8.2 PROMOCIONES
```
POST /api/promociones/crear
{
  "codigo": "PROMO001",
  "descripcion": "Promoción de fin de mes",
  "fecha_inicio": "2024-01-15T00:00:00.000Z",
  "fecha_fin": "2024-01-31T23:59:59.000Z",
  "tipo": "OFERTA",
  "observaciones": "Promoción especial de fin de mes",
  "articulos": [
    {
      "art_sec": "12345",
      "precio_oferta": 12000,
      "descuento_porcentaje": null,
      "observaciones": "Precio especial"
    },
    {
      "art_sec": "67890",
      "precio_oferta": null,
      "descuento_porcentaje": 15.5,
      "observaciones": "15% de descuento"
    }
  ]
}

GET /api/promociones/activas
GET /api/promociones/:pro_sec
GET /api/promociones/articulo/:art_sec
DELETE /api/promociones/cancelar/:pro_sec
```

---

## 9. SCRIPT SQL COMPLETO PARA IMPLEMENTACIÓN

```sql
-- 1. Crear tabla encabezado de promociones
CREATE TABLE [dbo].[promociones](
    [pro_sec] [decimal](18, 0) IDENTITY(1,1) NOT NULL,
    [pro_codigo] [varchar](20) NOT NULL,
    [pro_descripcion] [varchar](200) NOT NULL,
    [pro_fecha_inicio] [datetime] NOT NULL,
    [pro_fecha_fin] [datetime] NOT NULL,
    [pro_activa] [char](1) DEFAULT 'S',
    [pro_tipo] [varchar](20) DEFAULT 'OFERTA',
    [pro_observaciones] [varchar](500) NULL,
    [pro_fecha_creacion] [datetime] DEFAULT GETDATE(),
    [pro_usuario_creacion] [varchar](50) NULL,
    [pro_fecha_modificacion] [datetime] NULL,
    [pro_usuario_modificacion] [varchar](50) NULL,
    PRIMARY KEY CLUSTERED ([pro_sec] ASC)
);

-- 2. Crear tabla detalle de promociones
CREATE TABLE [dbo].[promociones_detalle](
    [pro_det_sec] [decimal](18, 0) IDENTITY(1,1) NOT NULL,
    [pro_sec] [decimal](18, 0) NOT NULL,
    [art_sec] [varchar](30) NOT NULL,
    [pro_det_precio_oferta] [decimal](17, 2) NULL,
    [pro_det_descuento_porcentaje] [decimal](5, 2) NULL,
    [pro_det_observaciones] [varchar](200) NULL,
    [pro_det_fecha_creacion] [datetime] DEFAULT GETDATE(),
    [pro_det_usuario_creacion] [varchar](50) NULL,
    PRIMARY KEY CLUSTERED ([pro_det_sec] ASC)
);

-- 3. Crear índices para optimización
CREATE NONCLUSTERED INDEX IDX_Promociones_Codigo
ON dbo.promociones (pro_codigo);

CREATE NONCLUSTERED INDEX IDX_Promociones_Fechas
ON dbo.promociones (pro_fecha_inicio, pro_fecha_fin, pro_activa);

CREATE NONCLUSTERED INDEX IDX_PromocionesDetalle_ProSec
ON dbo.promociones_detalle (pro_sec);

CREATE NONCLUSTERED INDEX IDX_PromocionesDetalle_ArtSec
ON dbo.promociones_detalle (art_sec);

-- 4. Crear foreign keys
ALTER TABLE [dbo].[promociones_detalle] 
ADD CONSTRAINT [FK_PromocionesDetalle_Promociones] 
FOREIGN KEY([pro_sec]) REFERENCES [dbo].[promociones] ([pro_sec]);

ALTER TABLE [dbo].[promociones_detalle] 
ADD CONSTRAINT [FK_PromocionesDetalle_Articulos] 
FOREIGN KEY([art_sec]) REFERENCES [dbo].[articulos] ([art_sec]);

-- 5. Crear función de validación de promoción
CREATE FUNCTION dbo.fn_ValidarPrecioPromocion
(
    @art_sec VARCHAR(30),
    @precio_oferta DECIMAL(17, 2),
    @descuento_porcentaje DECIMAL(5, 2) = NULL
)
RETURNS TABLE
AS
RETURN
(
    SELECT 
        CASE 
            WHEN @precio_oferta IS NOT NULL AND @precio_oferta <= 0 THEN 'El precio de oferta debe ser mayor a 0'
            WHEN @precio_oferta IS NOT NULL AND @precio_oferta >= precio_detal THEN 'El precio de oferta debe ser menor al precio detal'
            WHEN @precio_oferta IS NOT NULL AND @precio_oferta >= precio_mayor THEN 'El precio de oferta debe ser menor al precio mayor'
            WHEN @descuento_porcentaje IS NOT NULL AND (@descuento_porcentaje <= 0 OR @descuento_porcentaje >= 100) THEN 'El descuento debe estar entre 0 y 100%'
            ELSE 'OK'
        END AS validacion,
        precio_detal,
        precio_mayor
    FROM (
        SELECT 
            ISNULL(ad1.art_bod_pre, 0) AS precio_detal,
            ISNULL(ad2.art_bod_pre, 0) AS precio_mayor
        FROM dbo.articulos a
        LEFT JOIN dbo.articulosdetalle ad1 ON a.art_sec = ad1.art_sec AND ad1.lis_pre_cod = 1 AND ad1.bod_sec = '1'
        LEFT JOIN dbo.articulosdetalle ad2 ON a.art_sec = ad2.art_sec AND ad2.lis_pre_cod = 2 AND ad2.bod_sec = '1'
        WHERE a.art_sec = @art_sec
    ) AS precios
);

-- 6. Crear función de precio con promoción
CREATE FUNCTION dbo.fn_GetPrecioConPromocion
(
    @art_sec VARCHAR(30),
    @lis_pre_cod SMALLINT,
    @fecha_consulta DATETIME = NULL
)
RETURNS DECIMAL(17, 2)
AS
BEGIN
    DECLARE @precio_final DECIMAL(17, 2) = 0
    DECLARE @fecha DATETIME = ISNULL(@fecha_consulta, GETDATE())
    DECLARE @precio_oferta DECIMAL(17, 2) = NULL
    DECLARE @descuento_porcentaje DECIMAL(5, 2) = NULL
    
    -- Obtener promoción activa para el artículo
    SELECT TOP 1 
        @precio_oferta = pd.pro_det_precio_oferta,
        @descuento_porcentaje = pd.pro_det_descuento_porcentaje
    FROM dbo.promociones p
    INNER JOIN dbo.promociones_detalle pd ON p.pro_sec = pd.pro_sec
    WHERE pd.art_sec = @art_sec 
      AND p.pro_activa = 'S'
      AND @fecha BETWEEN p.pro_fecha_inicio AND p.pro_fecha_fin
    ORDER BY p.pro_fecha_creacion DESC
    
    -- Si hay promoción activa, calcular precio
    IF @precio_oferta IS NOT NULL AND @precio_oferta > 0
    BEGIN
        SET @precio_final = @precio_oferta
    END
    ELSE IF @descuento_porcentaje IS NOT NULL AND @descuento_porcentaje > 0
    BEGIN
        -- Obtener precio base y aplicar descuento
        SELECT @precio_final = ISNULL(art_bod_pre, 0)
        FROM dbo.articulosdetalle
        WHERE art_sec = @art_sec 
          AND lis_pre_cod = @lis_pre_cod
          AND bod_sec = '1'
        
        SET @precio_final = @precio_final * (1 - (@descuento_porcentaje / 100))
    END
    ELSE
    BEGIN
        -- Usar precio normal según el tipo
        SELECT @precio_final = ISNULL(art_bod_pre, 0)
        FROM dbo.articulosdetalle
        WHERE art_sec = @art_sec 
          AND lis_pre_cod = @lis_pre_cod
          AND bod_sec = '1'
    END
    
    RETURN @precio_final
END
GO
```

---

## 10. PLAN DE IMPLEMENTACIÓN GRADUAL

### Fase 1: Implementación Base (Semana 1)
1. ✅ Crear tabla `articulos_ofertas`
2. ✅ Implementar funciones SQL Server
3. ✅ Crear servicios base (PrecioService, OfertaService)
4. ✅ Implementar controladores básicos

### Fase 2: Integración (Semana 2)
1. ✅ Actualizar modelo de artículos
2. ✅ Integrar middleware de inyección
3. ✅ Crear rutas de precios y ofertas
4. ✅ Testing básico

### Fase 3: Optimización (Semana 3)
1. ✅ Optimizar consultas SQL
2. ✅ Implementar caché si es necesario
3. ✅ Documentación completa
4. ✅ Testing exhaustivo

### Fase 4: Despliegue (Semana 4)
1. ✅ Despliegue en ambiente de desarrollo
2. ✅ Testing de integración
3. ✅ Despliegue en producción
4. ✅ Monitoreo y ajustes

---

## 11. BENEFICIOS DE LA ARQUITECTURA SOLID

### 11.1 MANTENIBILIDAD
- ✅ Código modular y fácil de entender
- ✅ Responsabilidades claramente separadas
- ✅ Fácil localización y corrección de errores

### 11.2 ESCALABILIDAD
- ✅ Fácil agregar nuevos tipos de descuentos
- ✅ Servicios reutilizables en diferentes contextos
- ✅ Arquitectura preparada para crecimiento

### 11.3 TESTABILIDAD
- ✅ Servicios aislados y testeables
- ✅ Inyección de dependencias facilita mocking
- ✅ Testing unitario y de integración

### 11.4 FLEXIBILIDAD
- ✅ Fácil cambiar implementaciones
- ✅ Configuración centralizada
- ✅ Adaptable a nuevos requerimientos

---

## 12. CONSIDERACIONES TÉCNICAS

### 12.1 RENDIMIENTO
- ✅ Funciones SQL Server optimizadas
- ✅ Índices apropiados en la base de datos
- ✅ Consultas eficientes con JOINs optimizados

### 12.2 SEGURIDAD
- ✅ Validación de datos en múltiples capas
- ✅ Autenticación requerida en todos los endpoints
- ✅ Transacciones para operaciones críticas

### 12.3 MONITOREO
- ✅ Logging de operaciones importantes
- ✅ Manejo de errores consistente
- ✅ Métricas de rendimiento

---

## 13. PRÓXIMOS PASOS

1. **Implementar el sistema base** siguiendo la Fase 1
2. **Crear tests unitarios** para los servicios
3. **Documentar API** con Swagger/OpenAPI
4. **Implementar dashboard** para gestión de ofertas
5. **Integrar con WooCommerce** para sincronización de precios

---

*Este documento proporciona una implementación completa y robusta del sistema de precios y ofertas para API Academia, manteniendo SQL Server como base de datos y aplicando principios SOLID para una arquitectura escalable y mantenible.* 