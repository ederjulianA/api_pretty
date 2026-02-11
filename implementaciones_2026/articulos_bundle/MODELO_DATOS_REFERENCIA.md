# Referencia del modelo de datos – Bundles

**Origen:** `EstructuraDatos/PS_ESTRUCTURA.sql`  
**Uso:** Validar nombres y tipos de campos al implementar bundles.  
**Nota:** Los campos `art_bundle` y `kar_bundle_padre` se agregan con la migración `01_migracion_bundles.sql` (ya ejecutada).

---

## 1. facturakardes (kardex de factura)

| Campo | Tipo (PS_ESTRUCTURA) | Notas |
|-------|----------------------|--------|
| fac_sec | decimal(12,0) NOT NULL | PK, FK a factura |
| kar_sec | int NOT NULL | PK, secuencia MAX+1 por fac_sec |
| art_sec | varchar(30) NOT NULL | FK a articulos |
| kar_bod_sec | varchar(16) NOT NULL | Bodega, en código se usa '1' |
| kar_uni | decimal(17,2) NULL | Cantidad (no kar_can) |
| kar_nat | char(1) NULL | '+' o '-' |
| kar_pre | decimal(17,2) NULL | |
| kar_pre_pub | decimal(17,2) NULL | Precio público (no kar_vuni) |
| kar_des_uno | decimal(11,5) NULL | Descuento línea % |
| kar_sub_tot | decimal(17,2) NULL | |
| kar_total | decimal(17,2) NULL | |
| kar_lis_pre_cod | smallint NULL | 1=detal, 2=mayor |
| kar_fac_sec_ori | decimal(12,0) NULL | Devoluciones |
| kar_kar_sec_ori | int NULL | Devoluciones |
| kar_sec_tip | varchar(2) NULL | |
| kar_uni_sol | decimal(17,2) NULL | |
| art_sec_papa | varchar(30) NULL | |
| kar_sec_papa | int NULL | |
| kar_woo_act | nvarchar(1) NULL | |
| kar_pre_pub_detal | decimal(17,2) NULL | Promocional |
| kar_pre_pub_mayor | decimal(17,2) NULL | Promocional |
| kar_tiene_oferta | char(1) NULL | 'S'/'N', DEFAULT 'N' |
| kar_precio_oferta | decimal(17,2) NULL | Promocional |
| kar_descuento_porcentaje | decimal(5,2) NULL | Promocional |
| kar_codigo_promocion | varchar(20) NULL | Promocional |
| kar_descripcion_promocion | varchar(200) NULL | Promocional |
| **kar_bundle_padre** | **varchar(30) NULL** | **Migración: DEFAULT NULL** |

**INSERT usado en orderModel.js:**  
fac_sec, kar_sec, art_sec, kar_bod_sec, kar_uni, kar_nat, kar_pre_pub, kar_total, kar_lis_pre_cod, kar_des_uno, kar_kar_sec_ori, kar_fac_sec_ori, kar_pre_pub_detal, kar_pre_pub_mayor, kar_tiene_oferta, kar_precio_oferta, kar_descuento_porcentaje, kar_codigo_promocion, kar_descripcion_promocion (+ kar_bundle_padre en bundles).

---

## 2. articulos

| Campo | Tipo | Notas |
|-------|------|--------|
| art_sec | varchar(30) NOT NULL | PK |
| art_cod | varchar(30) NOT NULL | |
| art_nom | varchar(100) NOT NULL | |
| inv_sub_gru_cod | smallint NOT NULL | FK |
| pre_sec | varchar(16) NOT NULL | FK |
| art_woo_id | int NULL | |
| art_sec_padre | varchar(30) NULL | Variables |
| art_variable | varchar(1) NULL | |
| ... | ... | (otros campos) |
| **art_bundle** | **char(1) NULL** | **Migración: DEFAULT 'N', 'S'=bundle** |

Constraint: `CK_articulos_art_bundle CHECK (art_bundle IN ('S', 'N'))`.

---

## 3. articulosArmado (componentes del bundle)

| Campo | Tipo | Notas |
|-------|------|--------|
| art_sec | varchar(30) NOT NULL | PK, bundle padre |
| ComArtSec | varchar(30) NOT NULL | PK, componente (FK articulos) |
| ConKarUni | int NOT NULL | Cantidad del componente |

FK: art_sec → articulos(art_sec), ComArtSec → articulos(art_sec).

---

## 4. articulosdetalle (precios por lista)

| Campo | Tipo | Notas |
|-------|------|--------|
| art_sec | varchar(30) NOT NULL | PK, FK articulos |
| bod_sec | varchar(16) NOT NULL | PK |
| lis_pre_cod | smallint NOT NULL | PK. 1=detal, 2=mayor |
| art_bod_pre | decimal(17,2) NULL | Precio |

Para bundles: insertar dos filas (lis_pre_cod 1 y 2) con precios manuales.

---

## 5. vwExistencias (vista de stock)

- Agrupa por `fk.art_sec`, suma movimientos según `kar_nat` ('+' / '-').  
- Uso: validar stock de bundle y componentes antes de facturar.

---

## 6. secuencia

- `sec_cod = 'ARTICULOS'`: usado para generar `art_sec` en articulosModel (siguiente número).  
- Para bundles: mismo patrón (siguiente secuencia, insertar en articulos con art_bundle='S').

---

## 7. factura (solo referencia)

- fac_sec decimal(12,0) PK.  
- facturakardes.fac_sec → factura.fac_sec.  
- orderModel usa Decimal(18,0) para NewFacSec; en PS_ESTRUCTURA factura.fac_sec es decimal(12,0). Verificar en BD real si es (18,0) o (12,0).

---

## Resumen para implementación

- **facturakardes:** kar_sec (int), kar_uni (decimal), kar_pre_pub (decimal), kar_bundle_padre (varchar(30) NULL). Incluir los 7 campos promocionales y kar_bundle_padre en el INSERT.  
- **articulos:** art_bundle char(1) DEFAULT 'N'.  
- **articulosArmado:** art_sec, ComArtSec, ConKarUni (nombres exactos con mayúsculas).  
- **Transacciones:** `new sql.Request(transaction)` para cada operación dentro de la transacción.  
- **orderModel.js:** ES Modules (import/export). No usar pool.request() dentro de una transacción.
