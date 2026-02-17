# Guía Frontend: Endpoints Correctos para Carga de Costo Inicial

**Fecha:** 2026-02-17
**Estado:** 📋 Documentación de Endpoints Existentes

---

## ⚠️ Problema Detectado

El frontend está intentando usar endpoints que **NO EXISTEN** en el backend:

```javascript
// ❌ INCORRECTO - Estos endpoints NO EXISTEN:
POST /api/compras/costo-inicial
POST /api/compras/articulos/:art_sec/costo-inicial
POST /api/compras/registrar-costo-inicial
```

**Error 404 esperado:** `Request URL: http://localhost:5174/api/compras/registrar-costo-inicial`

---

## ✅ Solución: Endpoints Correctos

El backend tiene un sistema completo de **carga inicial de costos** en:

```
Base URL: /api/carga-costos
```

### Endpoints Disponibles:

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/carga-costos/exportar` | Exportar plantilla Excel |
| POST | `/api/carga-costos/importar` | Importar costos desde Excel |
| POST | `/api/carga-costos/calcular-automatico` | Calcular costos con fórmula |
| GET | `/api/carga-costos/resumen` | Obtener resumen de carga |
| GET | `/api/carga-costos/alertas` | Productos con alertas |
| POST | `/api/carga-costos/aplicar` | Aplicar costos validados |

---

## 🎯 Opciones de Implementación en Frontend

### Opción 1: Usar Sistema de Carga Masiva Existente (RECOMENDADO)

El backend está optimizado para **carga masiva**, no para registro individual de costos.

#### Para asignar costo a UN solo artículo:

**Flujo sugerido:**

1. **Calcular costo usando la API de cálculo automático** (solo para ese artículo)
2. **Aplicar el costo**

```javascript
// Paso 1: Preparar datos del artículo individual
const asignarCostoInicial = async (articulo, costoInicial, observaciones) => {
  try {
    const token = localStorage.getItem('token');

    // OPCIÓN A: Usar endpoint de calcular automático con margen personalizado
    // Calcular el margen reverso necesario para ese costo
    const precioMayor = articulo.precio_mayor || articulo.precio_venta_mayor;

    if (!precioMayor || precioMayor <= 0) {
      throw new Error('El artículo no tiene precio mayor definido');
    }

    // Calcular margen implícito: margen = ((precio - costo) / costo) * 100
    const margenCalculado = ((precioMayor - costoInicial) / costoInicial) * 100;

    // Paso 1: Insertar manualmente en tabla temporal
    // (Requiere nuevo endpoint en backend - ver Opción 2)

    // OPCIÓN B (TEMPORAL): Crear un Excel con 1 sola fila y usar importar
    // Esta es la forma de trabajar con el sistema actual sin cambios en backend

  } catch (error) {
    console.error('Error asignando costo inicial:', error);
    throw error;
  }
};
```

**Limitación:** El sistema actual NO tiene endpoint para registrar UN solo artículo.

---

### Opción 2: Solicitar Nuevo Endpoint al Backend (RECOMENDADO)

**Endpoint sugerido para agregar al backend:**

```http
POST /api/carga-costos/registrar-individual
```

**Body:**
```json
{
  "art_sec": "12345",
  "art_cod": "9165",
  "costo_inicial": 9833,
  "cantidad": 1,
  "metodo": "MANUAL",
  "observaciones": "Costo asignado desde dashboard de costos"
}
```

**Respuesta:**
```json
{
  "success": true,
  "message": "Costo registrado en tabla temporal. Use /api/carga-costos/aplicar para confirmar.",
  "data": {
    "art_cod": "9165",
    "art_nom": "Producto XYZ",
    "costo_propuesto": 9833,
    "precio_venta": 20000,
    "margen": 50.84,
    "estado": "VALIDADO"
  }
}
```

Este endpoint:
1. Inserta/actualiza en `carga_inicial_costos` (tabla temporal)
2. Ejecuta validación automática
3. Devuelve el estado (VALIDADO, VALIDADO_CON_ALERTAS, RECHAZADO)
4. El usuario debe usar `/api/carga-costos/aplicar` para confirmar

---

### Opción 3: Usar Sistema de Compras (ALTERNATIVA)

Si el objetivo es registrar el costo inicial como una "compra inicial":

```http
POST /api/compras
```

**Body:**
```json
{
  "fac_nro_proveedor": "COSTO-INICIAL-001",
  "nit_sec": 1,
  "fac_fec": "2026-02-17",
  "fac_obs": "Carga de costo inicial para inventario",
  "detalle": [
    {
      "art_sec": "12345",
      "cantidad": 1,
      "costo_unitario": 9833,
      "observaciones": "Costo inicial asignado"
    }
  ]
}
```

**⚠️ Importante:**
- Esto crea una COMPRA real en el sistema
- Incrementa el stock del artículo
- Registra en kardex
- Puede no ser lo ideal si solo quieres asignar el costo sin afectar inventario

---

## 📝 Implementación Sugerida para el Frontend

### Archivo: `AsignarCostoInicialModal.jsx`

```javascript
const handleSubmit = async (e) => {
  e.preventDefault();

  // Validaciones...

  setIsSubmitting(true);

  try {
    const payload = {
      art_sec: articulo.art_sec,
      art_cod: articulo.art_cod,
      costo_inicial: parseFloat(costoInicial),
      cantidad: parseFloat(cantidad),
      metodo: 'MANUAL',
      observaciones: observaciones.trim() || 'Costo inicial asignado desde dashboard'
    };

    // Usar el nuevo endpoint cuando esté disponible
    const response = await axiosInstance.post(
      '/carga-costos/registrar-individual',
      payload
    );

    if (response.data.success) {
      // Mostrar estado de validación
      const { estado, margen } = response.data.data;

      let mensaje = `Costo de ${formatCurrency(parseFloat(costoInicial))} registrado.`;

      if (estado === 'VALIDADO_CON_ALERTAS') {
        mensaje += `\n⚠️ Margen bajo: ${margen.toFixed(2)}%`;
      } else if (estado === 'RECHAZADO') {
        mensaje += `\n❌ Costo rechazado: ${response.data.data.observaciones}`;
      }

      mensaje += '\n\nUsa el botón "Aplicar Costos" para confirmar.';

      Swal.fire({
        icon: estado === 'RECHAZADO' ? 'warning' : 'success',
        title: 'Costo Registrado',
        text: mensaje,
        confirmButtonColor: '#f58ea3'
      }).then(() => {
        onSuccess();
        onClose();
      });
    }
  } catch (error) {
    if (error.response?.status === 404) {
      // El endpoint aún no existe en el backend
      Swal.fire({
        icon: 'error',
        title: 'Endpoint no disponible',
        text: 'El backend aún no tiene el endpoint /api/carga-costos/registrar-individual. Por favor, solicita su implementación.',
        confirmButtonColor: '#f58ea3'
      });
    } else {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.response?.data?.message || 'Error al asignar costo inicial',
        confirmButtonColor: '#f58ea3'
      });
    }
  } finally {
    setIsSubmitting(false);
  }
};
```

---

## 🔧 Solución Temporal (Sin cambios en Backend)

Si necesitas implementar **YA** sin esperar cambios en el backend:

### Usar el Endpoint de Compras:

```javascript
const handleSubmit = async (e) => {
  e.preventDefault();

  setIsSubmitting(true);

  try {
    // Crear una "compra" de costo inicial
    const payload = {
      fac_nro_proveedor: `COSTO-INICIAL-${articulo.art_cod}-${Date.now()}`,
      nit_sec: 1, // NIT genérico o proveedor "Costo Inicial"
      fac_fec: new Date().toISOString().split('T')[0],
      fac_obs: `Carga de costo inicial: ${observaciones || 'Asignación manual de costo'}`,
      detalle: [
        {
          art_sec: articulo.art_sec,
          cantidad: parseFloat(cantidad),
          costo_unitario: parseFloat(costoInicial),
          observaciones: 'Costo inicial asignado desde dashboard'
        }
      ]
    };

    const response = await axiosInstance.post('/compras', payload);

    if (response.data.success) {
      Swal.fire({
        icon: 'success',
        title: 'Costo Asignado',
        text: `Se registró costo inicial de ${formatCurrency(parseFloat(costoInicial))} como compra.`,
        confirmButtonColor: '#f58ea3'
      }).then(() => {
        onSuccess();
        onClose();
      });
    }
  } catch (error) {
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: error.response?.data?.message || 'Error al asignar costo inicial',
      confirmButtonColor: '#f58ea3'
    });
  } finally {
    setIsSubmitting(false);
  }
};
```

**⚠️ Importante:**
- Esto **incrementa el stock** del artículo
- Se registra como una **compra real** en el sistema
- Aparecerá en reportes de compras
- Si solo quieres asignar costo SIN afectar inventario, necesitas el nuevo endpoint

---

## 📋 Resumen de Recomendaciones

### Para el Frontend:

1. **Corto plazo (HOY):**
   - Usar endpoint de compras: `POST /api/compras`
   - Aceptar que incrementará el stock
   - O esperar a que backend implemente endpoint individual

2. **Mediano plazo (RECOMENDADO):**
   - Solicitar al backend: `POST /api/carga-costos/registrar-individual`
   - Este endpoint solo actualiza la tabla temporal
   - Requiere `POST /api/carga-costos/aplicar` para confirmar

3. **Largo plazo (IDEAL):**
   - Implementar UI de carga masiva con Excel
   - Aprovechar todo el sistema de validación y alertas existente

### Para el Backend:

**Endpoint sugerido para agregar:**

```javascript
// routes/cargaCostosRoutes.js
router.post('/registrar-individual', auth, registrarCostoIndividual);

// controllers/cargaCostosController.js
const registrarCostoIndividual = async (req, res) => {
  try {
    const { art_sec, art_cod, costo_inicial, cantidad, metodo, observaciones } = req.body;
    const usu_cod = req.usuario?.usu_cod || 'sistema';

    // 1. Validar que el artículo existe
    // 2. Insertar/actualizar en carga_inicial_costos
    // 3. Ejecutar validación automática
    // 4. Devolver estado de validación

    res.json({
      success: true,
      message: 'Costo registrado en tabla temporal',
      data: {
        art_cod,
        art_nom,
        costo_propuesto,
        precio_venta,
        margen,
        estado // VALIDADO, VALIDADO_CON_ALERTAS, RECHAZADO
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al registrar costo individual',
      error: error.message
    });
  }
};
```

---

## 📞 Siguiente Paso

**Decisión requerida del equipo:**

1. ¿Usar endpoint de compras temporalmente? (incrementa stock)
2. ¿Esperar a que backend implemente endpoint individual?
3. ¿Cambiar UI para usar carga masiva con Excel?

**Recomendación:** Implementar `POST /api/carga-costos/registrar-individual` en backend (30 minutos de trabajo) para tener la solución ideal.

---

**Documentado por:** Claude Code
**Fecha:** 2026-02-17
