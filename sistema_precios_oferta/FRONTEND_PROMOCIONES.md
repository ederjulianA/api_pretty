# Frontend - Gestión de Promociones

## 📋 Descripción General

Sistema de gestión de promociones que permite crear, editar, activar/desactivar y consultar promociones con sus respectivos artículos y descuentos. La interfaz debe ser intuitiva, responsiva y seguir las mejores prácticas de UX/UI.

## 🎯 Funcionalidades Principales

### **1. Listado de Promociones**
### **2. Crear Nueva Promoción**
### **3. Editar Promoción Existente**
### **4. Gestionar Estados de Artículos**
### **5. Consultar Detalles de Promoción**

---

## 📱 Pantalla Principal - Listado de Promociones

### **Layout**
```
┌─────────────────────────────────────────────────────────────┐
│ 🏷️  GESTIÓN DE PROMOCIONES                    [+ NUEVA]    │
├─────────────────────────────────────────────────────────────┤
│ 🔍 Buscar: [________________]  📅 Filtro: [Todas ▼] [Buscar]│
├─────────────────────────────────────────────────────────────┤
│ Código    │ Descripción        │ Fechas        │ Estado │ Acciones │
├───────────┼────────────────────┼───────────────┼────────┼──────────┤
│ OFERTA_01 │ Oferta Verano      │ 01/06 - 31/08 │ Activa │ [👁️] [✏️] │
│ OFERTA_02 │ Black Friday       │ 29/11 - 30/11 │ Activa │ [👁️] [✏️] │
│ OFERTA_03 │ Liquidación        │ 01/12 - 15/12 │ Inact. │ [👁️] [✏️] │
└─────────────────────────────────────────────────────────────┘
```

### **Componentes**

#### **Header**
- **Título**: "Gestión de Promociones"
- **Botón**: "+ Nueva Promoción" (llama a pantalla de creación)

#### **Filtros**
- **Campo de búsqueda**: Por código, descripción o artículos
- **Filtro por estado**: Todas, Activas, Inactivas
- **Filtro por fechas**: Rango de fechas
- **Botón**: "Buscar"

#### **Tabla de Promociones**
- **Columnas**:
  - Código (clickeable para ver detalles)
  - Descripción
  - Fecha Inicio - Fecha Fin
  - Estado (badge con colores)
  - Cantidad de Artículos
  - Acciones (Ver, Editar)

#### **Paginación**
- Navegación entre páginas
- Cantidad de registros por página
- Total de promociones

---

## ➕ Pantalla - Crear Nueva Promoción

### **Layout**
```
┌─────────────────────────────────────────────────────────────┐
│ ← Volver  │ 🆕 NUEVA PROMOCIÓN                              │
├─────────────────────────────────────────────────────────────┤
│ 📋 INFORMACIÓN GENERAL                                      │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Código*:        [OFERTA_2024________________]           │ │
│ │ Descripción*:   [Descuentos especiales...]              │ │ │
│ │ Tipo:           [OFERTA ▼]                              │ │ │
│ │ Fecha Inicio*:  [📅 01/06/2024]                         │ │ │
│ │ Fecha Fin*:     [📅 31/08/2024]                         │ │ │
│ │ Observaciones:  [Promoción de verano...]                │ │ │
│ └─────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ 🛍️ ARTÍCULOS EN PROMOCIÓN                                  │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ [+ Agregar Artículo]                                     │ │
│ │                                                         │ │
│ │ ┌─────────────────────────────────────────────────────┐ │ │
│ │ │ Artículo: [1855 ▼] [Buscar]                         │ │ │
│ │ │ Nombre: Camiseta Azul                               │ │ │
│ │ │ Precio Normal: $5,000                               │ │ │
│ │ │ Precio Oferta: [$3,500] [15% descuento]             │ │ │
│ │ │ Estado: [Activo ▼]                                  │ │ │
│ │ │ Observaciones: [Descuento especial...]              │ │ │
│ │ │ [❌ Eliminar]                                        │ │ │
│ │ └─────────────────────────────────────────────────────┘ │ │
│ └─────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ [Cancelar] [Guardar Promoción]                              │
└─────────────────────────────────────────────────────────────┘
```

### **Componentes**

#### **Header**
- **Botón**: "← Volver" (regresa al listado)
- **Título**: "NUEVA PROMOCIÓN"

#### **Sección: Información General**
- **Código***: Campo de texto (requerido, único)
- **Descripción***: Campo de texto largo (requerido)
- **Tipo**: Dropdown (OFERTA, DESCUENTO, BLACK_FRIDAY, etc.)
- **Fecha Inicio***: Date picker (requerido)
- **Fecha Fin***: Date picker (requerido, > fecha inicio)
- **Observaciones**: Campo de texto largo (opcional)

#### **Sección: Artículos en Promoción**
- **Botón**: "+ Agregar Artículo"
- **Tarjeta por artículo**:
  - **Artículo**: Dropdown con búsqueda
  - **Nombre**: Auto-completado del artículo
  - **Precio Normal**: Solo lectura
  - **Precio Oferta**: Campo numérico
  - **Descuento %**: Campo numérico (alternativo a precio)
  - **Estado**: Dropdown (Activo/Inactivo)
  - **Observaciones**: Campo de texto
  - **Botón**: "❌ Eliminar"

#### **Validaciones en Tiempo Real**
- Campos requeridos marcados con *
- Fecha fin > fecha inicio
- Al menos un artículo activo
- Precio oferta < precio normal
- Código único

#### **Botones de Acción**
- **Cancelar**: Regresa al listado sin guardar
- **Guardar Promoción**: Crea la promoción

---

## ✏️ Pantalla - Editar Promoción

### **Layout**
```
┌─────────────────────────────────────────────────────────────┐
│ ← Volver  │ ✏️ EDITAR PROMOCIÓN: OFERTA_2024               │
├─────────────────────────────────────────────────────────────┤
│ 📋 INFORMACIÓN GENERAL                                      │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Código*:        [OFERTA_2024________________]           │ │
│ │ Descripción*:   [Descuentos especiales...]              │ │ │
│ │ Tipo:           [OFERTA ▼]                              │ │ │
│ │ Fecha Inicio*:  [📅 01/06/2024]                         │ │ │
│ │ Fecha Fin*:     [📅 31/08/2024]                         │ │ │
│ │ Observaciones:  [Promoción de verano...]                │ │ │
│ └─────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ 🛍️ ARTÍCULOS EN PROMOCIÓN (3 artículos)                   │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ [+ Agregar Artículo]                                     │ │
│ │                                                         │ │
│ │ ┌─────────────────────────────────────────────────────┐ │ │
│ │ │ 🟢 Artículo: 1855 - Camiseta Azul                   │ │ │
│ │ │ Precio Normal: $5,000 │ Precio Oferta: [$3,500]     │ │ │
│ │ │ Estado: [Activo ▼] │ Observaciones: [Descuento...]  │ │ │
│ │ │ [❌ Eliminar]                                        │ │ │
│ │ └─────────────────────────────────────────────────────┘ │ │
│ │                                                         │ │
│ │ ┌─────────────────────────────────────────────────────┐ │ │
│ │ │ 🔴 Artículo: 1856 - Pantalón Negro                  │ │ │
│ │ │ Precio Normal: $8,000 │ Precio Oferta: [$6,000]     │ │ │
│ │ │ Estado: [Inactivo ▼] │ Observaciones: [Sin stock...]│ │ │
│ │ │ [❌ Eliminar]                                        │ │ │
│ │ └─────────────────────────────────────────────────────┘ │ │
│ └─────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ [Cancelar] [Guardar Cambios]                                │
└─────────────────────────────────────────────────────────────┘
```

### **Diferencias con Crear**
- **Título**: "EDITAR PROMOCIÓN: [CÓDIGO]"
- **Campos precargados** con datos existentes
- **Artículos existentes** mostrados con estado visual
- **Contador** de artículos en la sección
- **Validaciones** más permisivas (código no editable)

---

## 👁️ Pantalla - Ver Detalles de Promoción

### **Layout**
```
┌─────────────────────────────────────────────────────────────┐
│ ← Volver  │ 👁️ DETALLES: OFERTA_2024                      │
├─────────────────────────────────────────────────────────────┤
│ 📋 INFORMACIÓN GENERAL                                      │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Código: OFERTA_2024                                      │ │
│ │ Descripción: Descuentos especiales en productos...      │ │
│ │ Tipo: OFERTA                                             │ │
│ │ Fechas: 01/06/2024 - 31/08/2024                         │ │
│ │ Estado: 🟢 Activa                                        │ │
│ │ Observaciones: Promoción de verano...                   │ │
│ │ Creada: 15/01/2024 por admin                            │ │
│ │ Modificada: 20/01/2024 por admin                        │ │
│ └─────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ 🛍️ ARTÍCULOS (3 artículos)                                 │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 🟢 1855 - Camiseta Azul                                 │ │
│ │    Precio Normal: $5,000 │ Precio Oferta: $3,500        │ │
│ │    Descuento: 30% │ Estado: Activo                      │ │
│ │    Observaciones: Descuento especial...                 │ │
│ │                                                         │ │
│ │ 🔴 1856 - Pantalón Negro                                │ │
│ │    Precio Normal: $8,000 │ Precio Oferta: $6,000        │ │
│ │    Descuento: 25% │ Estado: Inactivo                    │ │
│ │    Observaciones: Sin stock temporalmente               │ │
│ └─────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ [✏️ Editar] [🗑️ Eliminar] [📊 Estadísticas]               │
└─────────────────────────────────────────────────────────────┘
```

### **Características**
- **Solo lectura** - No permite edición
- **Información completa** de la promoción
- **Historial** de creación y modificaciones
- **Estados visuales** de artículos
- **Botones de acción** para editar/eliminar

---

## 🎛️ Componentes Específicos

### **1. Selector de Artículos**
```
┌─────────────────────────────────────────────────────────┐
│ Artículo: [1855 ▼] [🔍 Buscar]                          │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ 1855 - Camiseta Azul - $5,000                       │ │
│ │ 1856 - Pantalón Negro - $8,000                      │ │
│ │ 1857 - Zapatos Blancos - $12,000                    │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### **2. Calculadora de Descuento**
```
┌─────────────────────────────────────────────────────────┐
│ Precio Normal: $5,000                                   │
│ Precio Oferta: [$3,500] [Calcular]                      │
│ Descuento: [30%] [Calcular]                             │
│ Ahorro: $1,500 (30%)                                    │
└─────────────────────────────────────────────────────────┘
```

### **3. Indicador de Estado**
```
🟢 Activo    🔴 Inactivo    🟡 Pendiente    ⚪ Sin Estado
```

### **4. Validación en Tiempo Real**
```
┌─────────────────────────────────────────────────────────┐
│ Precio Oferta: [$6,000] ❌                              │
│ ⚠️ El precio de oferta debe ser menor al precio normal │
└─────────────────────────────────────────────────────────┘
```

---

## 🎨 Especificaciones de Diseño

### **Colores**
- **Primario**: #2563eb (Azul)
- **Secundario**: #64748b (Gris)
- **Éxito**: #10b981 (Verde)
- **Error**: #ef4444 (Rojo)
- **Advertencia**: #f59e0b (Amarillo)
- **Info**: #3b82f6 (Azul claro)

### **Tipografía**
- **Títulos**: Inter, 24px, Bold
- **Subtítulos**: Inter, 18px, SemiBold
- **Cuerpo**: Inter, 14px, Regular
- **Etiquetas**: Inter, 12px, Medium

### **Espaciado**
- **Padding**: 16px, 24px, 32px
- **Margin**: 8px, 16px, 24px
- **Border-radius**: 8px, 12px

### **Responsive**
- **Desktop**: 1200px+
- **Tablet**: 768px - 1199px
- **Mobile**: < 768px

---

## 🔧 Funcionalidades Técnicas

### **1. Validaciones**
- **Frontend**: Validación en tiempo real
- **Backend**: Validación final antes de guardar
- **Feedback**: Mensajes de error claros y específicos

### **2. Estados de Carga**
- **Loading**: Spinner durante operaciones
- **Skeleton**: Placeholder mientras carga
- **Error**: Mensajes de error con opción de reintentar

### **3. Persistencia**
- **Auto-save**: Guardar borrador automáticamente
- **Local Storage**: Cache de datos temporales
- **Session**: Mantener estado entre navegaciones

### **4. Notificaciones**
- **Toast**: Mensajes de éxito/error
- **Modal**: Confirmaciones importantes
- **Alert**: Advertencias críticas

---

## 📱 Flujo de Usuario

### **Crear Promoción**
1. Usuario hace clic en "+ Nueva Promoción"
2. Completa información general
3. Agrega artículos uno por uno
4. Valida precios y descuentos
5. Guarda la promoción
6. Recibe confirmación

### **Editar Promoción**
1. Usuario selecciona promoción del listado
2. Hace clic en "Editar"
3. Modifica información según necesite
4. Agrega/elimina/modifica artículos
5. Guarda cambios
6. Recibe confirmación

### **Gestionar Estados**
1. Usuario selecciona promoción
2. Cambia estados de artículos individuales
3. Guarda cambios
4. Sistema sincroniza con WooCommerce

---

## 🚀 Consideraciones de UX

### **1. Accesibilidad**
- **ARIA labels** en todos los elementos
- **Navegación por teclado** completa
- **Contraste** adecuado en colores
- **Tamaños de fuente** legibles

### **2. Performance**
- **Lazy loading** de listados
- **Debounce** en búsquedas
- **Optimistic updates** en UI
- **Cache** de datos frecuentes

### **3. Usabilidad**
- **Tooltips** en elementos complejos
- **Breadcrumbs** para navegación
- **Shortcuts** de teclado
- **Undo/Redo** en formularios

### **4. Feedback**
- **Progress indicators** en operaciones largas
- **Success/Error** messages claros
- **Confirmation** antes de acciones destructivas
- **Real-time** validations

---

