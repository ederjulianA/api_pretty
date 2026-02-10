# Diagrama de Flujo: Facturación de Bundles

## Flujo Completo de Facturación

```
┌─────────────────────────────────────────────────────────────┐
│                    INICIO: POST /api/order                   │
│                    Items: [{ art_sec, cantidad }]           │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
            ┌──────────────────────────────┐
            │  Para cada item en la orden  │
            └──────────────┬───────────────┘
                           │
                           ▼
            ┌──────────────────────────────┐
            │  Obtener datos del artículo  │
            │  SELECT FROM articulos       │
            │  WHERE art_sec = ?           │
            └──────────────┬───────────────┘
                           │
                           ▼
               ┌───────────────────────┐
               │  ¿art_bundle = 'S'?   │
               └───────┬───────┬───────┘
                   NO  │       │  SÍ
                       │       │
          ┌────────────┘       └────────────┐
          │                                 │
          ▼                                 ▼
┌─────────────────────┐      ┌──────────────────────────────┐
│  ARTÍCULO NORMAL    │      │      ES UN BUNDLE            │
└──────────┬──────────┘      └──────────────┬───────────────┘
           │                                 │
           │                                 ▼
           │                  ┌──────────────────────────────┐
           │                  │  Validar stock del bundle    │
           │                  │  vwExistencias.existencia    │
           │                  └──────────────┬───────────────┘
           │                                 │
           │                                 ▼
           │                    ┌──────────────────────────┐
           │                    │  ¿Stock suficiente?      │
           │                    └────┬──────────────┬──────┘
           │                    NO   │              │  SÍ
           │                         │              │
           │                    ┌────┘              └────┐
           │                    │                        │
           │                    ▼                        ▼
           │         ┌────────────────────┐  ┌──────────────────────┐
           │         │  Error 400:        │  │  Obtener componentes │
           │         │  Stock insuficiente│  │  FROM articulosArmado│
           │         │  del bundle        │  │  WHERE art_sec = ?   │
           │         └────────────────────┘  └──────────┬───────────┘
           │                                            │
           │                                            ▼
           │                              ┌──────────────────────────┐
           │                              │  Para cada componente:   │
           │                              │  Validar stock           │
           │                              │  cantidad_bundle ×       │
           │                              │  cantidad_componente     │
           │                              └──────────┬───────────────┘
           │                                         │
           │                                         ▼
           │                               ┌──────────────────────┐
           │                               │  ¿Stock suficiente   │
           │                               │  de TODOS los        │
           │                               │  componentes?        │
           │                               └────┬──────────┬──────┘
           │                               NO   │          │  SÍ
           │                                    │          │
           │                              ┌─────┘          └─────┐
           │                              │                      │
           │                              ▼                      ▼
           │                   ┌────────────────────┐  ┌─────────────────┐
           │                   │  Error 400:        │  │  VALIDACIÓN OK  │
           │                   │  Componente X      │  └────────┬────────┘
           │                   │  sin stock         │           │
           │                   └────────────────────┘           │
           │                                                    │
           │◄───────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────────┐
│             INSERTAR KARDEX (facturakardes)                  │
└──────────────────────────┬───────────────────────────────────┘
                           │
            ┌──────────────┴──────────────┐
            │                             │
            ▼                             ▼
  ┌──────────────────┐        ┌──────────────────────┐
  │  ARTÍCULO NORMAL │        │      ES BUNDLE       │
  └────────┬─────────┘        └──────────┬───────────┘
           │                             │
           ▼                             ▼
  ┌─────────────────────────┐  ┌────────────────────────────┐
  │  INSERT 1 línea:        │  │  INSERT 1 línea (bundle):  │
  │                         │  │                            │
  │  art_sec = item.art_sec │  │  art_sec = bundle.art_sec  │
  │  kar_can = cantidad     │  │  kar_can = cantidad        │
  │  kar_vuni = precio      │  │  kar_vuni = precio_bundle  │
  │  kar_nat = '-'          │  │  kar_nat = '-'             │
  │  kar_bundle_padre=NULL  │  │  kar_bundle_padre = NULL   │
  └─────────┬───────────────┘  └────────────┬───────────────┘
            │                               │
            │                               ▼
            │                  ┌─────────────────────────────┐
            │                  │  Para cada componente:      │
            │                  │  INSERT línea (precio $0)   │
            │                  │                             │
            │                  │  art_sec = comp.art_sec     │
            │                  │  kar_can = cantidad_bundle  │
            │                  │           × cant_componente │
            │                  │  kar_vuni = 0               │
            │                  │  kar_nat = '-'              │
            │                  │  kar_bundle_padre =         │
            │                  │    bundle.art_sec           │
            │                  └─────────────┬───────────────┘
            │                                │
            │◄───────────────────────────────┘
            │
            ▼
  ┌─────────────────────────┐
  │  Continuar con          │
  │  siguiente item         │
  └─────────────┬───────────┘
                │
                ▼
     ┌──────────────────────┐
     │  ¿Más items?         │
     └────┬──────────┬──────┘
     SÍ   │          │  NO
          │          │
    ┌─────┘          └─────┐
    │                      │
    │ (volver al inicio    │
    │  del loop)           │
    │                      ▼
    │            ┌─────────────────────┐
    │            │  Commit transaction │
    │            │  Retornar factura   │
    │            └─────────────────────┘
    │                      │
    │                      ▼
    │            ┌─────────────────────┐
    │            │    FIN: 200 OK      │
    │            └─────────────────────┘
    │
    └──────────────────────┘
```

---

## Ejemplo Concreto

### Input (POST /api/order)
```json
{
  "nit_cod": "12345",
  "items": [
    { "art_sec": "BUNDLE001", "cantidad": 2 },
    { "art_sec": "ART999", "cantidad": 1 }
  ]
}
```

### Datos en BD

**Bundle:**
```
articulos:
  art_sec: BUNDLE001
  art_cod: COMBO-AMOR
  art_nom: Combo Amor y Amistad
  art_bundle: 'S'

articulosArmado:
  BUNDLE001 → ART001 (cantidad: 1)  // Labial
  BUNDLE001 → ART002 (cantidad: 1)  // Máscara
  BUNDLE001 → ART003 (cantidad: 1)  // Rubor

articulosdetalle:
  BUNDLE001, bod_sec='1', lis_pre_cod=1 → precio_detal: 50000
```

**Artículo normal:**
```
articulos:
  art_sec: ART999
  art_cod: ESMALTE-001
  art_nom: Esmalte Rojo
  art_bundle: 'N'

articulosdetalle:
  ART999, bod_sec='1', lis_pre_cod=1 → precio_detal: 12000
```

### Validaciones

1. **Stock del bundle:**
   ```sql
   SELECT existencia FROM vwExistencias WHERE art_sec = 'BUNDLE001'
   -- Resultado: 5 unidades
   -- ✓ Necesita 2, tiene 5 → OK
   ```

2. **Stock de componentes del bundle:**
   ```sql
   -- Labial (ART001): necesita 2×1=2
   SELECT existencia FROM vwExistencias WHERE art_sec = 'ART001'
   -- Resultado: 10 unidades → ✓ OK

   -- Máscara (ART002): necesita 2×1=2
   SELECT existencia FROM vwExistencias WHERE art_sec = 'ART002'
   -- Resultado: 5 unidades → ✓ OK

   -- Rubor (ART003): necesita 2×1=2
   SELECT existencia FROM vwExistencias WHERE art_sec = 'ART003'
   -- Resultado: 8 unidades → ✓ OK
   ```

3. **Stock del artículo normal:**
   ```sql
   SELECT existencia FROM vwExistencias WHERE art_sec = 'ART999'
   -- Resultado: 20 unidades
   -- ✓ Necesita 1, tiene 20 → OK
   ```

### Output (facturakardes)

```sql
-- Línea 1: Bundle padre
INSERT INTO facturakardes (
  fac_nro, kar_sec_item, art_sec, kar_can, kar_vuni, kar_nat, kar_bundle_padre
) VALUES (
  'FAC12345', 1, 'BUNDLE001', 2, 50000, '-', NULL
);

-- Línea 2: Componente Labial
INSERT INTO facturakardes (
  fac_nro, kar_sec_item, art_sec, kar_can, kar_vuni, kar_nat, kar_bundle_padre
) VALUES (
  'FAC12345', 2, 'ART001', 2, 0, '-', 'BUNDLE001'
);

-- Línea 3: Componente Máscara
INSERT INTO facturakardes (
  fac_nro, kar_sec_item, art_sec, kar_can, kar_vuni, kar_nat, kar_bundle_padre
) VALUES (
  'FAC12345', 3, 'ART002', 2, 0, '-', 'BUNDLE001'
);

-- Línea 4: Componente Rubor
INSERT INTO facturakardes (
  fac_nro, kar_sec_item, art_sec, kar_can, kar_vuni, kar_nat, kar_bundle_padre
) VALUES (
  'FAC12345', 4, 'ART003', 2, 0, '-', 'BUNDLE001'
);

-- Línea 5: Artículo normal
INSERT INTO facturakardes (
  fac_nro, kar_sec_item, art_sec, kar_can, kar_vuni, kar_nat, kar_bundle_padre
) VALUES (
  'FAC12345', 5, 'ART999', 1, 12000, '-', NULL
);
```

### Factura Visual

```
┌─────────────────────────────────────────────────────┐
│ FACTURA FAC-12345                  FECHA: 2026-02-10│
│ CLIENTE: Juan Pérez                NIT: 12345       │
├─────────────────────────────────────────────────────┤
│ Cant  Descripción             P.Unit    Subtotal    │
├─────────────────────────────────────────────────────┤
│  2    Combo Amor y Amistad    $50.000   $100.000    │
│    ├─ 2x Labial Rojo           $0         $0        │
│    ├─ 2x Máscara Negra         $0         $0        │
│    └─ 2x Rubor Rosa            $0         $0        │
│                                                     │
│  1    Esmalte Rojo            $12.000    $12.000    │
│                                                     │
├─────────────────────────────────────────────────────┤
│                               SUBTOTAL:   $112.000  │
│                               IVA (0%):        $0   │
│                               TOTAL:      $112.000  │
└─────────────────────────────────────────────────────┘
```

### Kardex Final

```sql
SELECT
  fk.kar_sec_item,
  a.art_cod,
  a.art_nom,
  fk.kar_can,
  fk.kar_vuni,
  fk.kar_can * fk.kar_vuni as total,
  CASE
    WHEN fk.kar_bundle_padre IS NULL THEN 'Normal'
    ELSE 'Comp. de ' + bp.art_cod
  END as tipo
FROM facturakardes fk
INNER JOIN articulos a ON a.art_sec = fk.art_sec
LEFT JOIN articulos bp ON bp.art_sec = fk.kar_bundle_padre
WHERE fk.fac_nro = 'FAC12345'
ORDER BY fk.kar_sec_item;
```

**Resultado:**

| # | Código | Nombre | Cant | P.Unit | Total | Tipo |
|---|--------|--------|------|--------|-------|------|
| 1 | COMBO-AMOR | Combo Amor y Amistad | 2 | $50.000 | $100.000 | Normal |
| 2 | LABIAL-001 | Labial Rojo | 2 | $0 | $0 | Comp. de COMBO-AMOR |
| 3 | MASCARA-001 | Máscara Negra | 2 | $0 | $0 | Comp. de COMBO-AMOR |
| 4 | RUBOR-001 | Rubor Rosa | 2 | $0 | $0 | Comp. de COMBO-AMOR |
| 5 | ESMALTE-001 | Esmalte Rojo | 1 | $12.000 | $12.000 | Normal |

**Total factura:** $112.000

---

## Notas Importantes

1. **Los componentes tienen precio $0** para no duplicar el valor en el total
2. **Todos los items afectan kardex** (bundle + componentes)
3. **El campo `kar_bundle_padre`** identifica qué items son componentes de un bundle
4. **La validación de stock es crítica** antes de crear la factura
5. **La transacción debe ser atómica** - todo o nada

---

## Casos de Error

### Error 1: Stock insuficiente del bundle
```json
{
  "success": false,
  "message": "Stock insuficiente del bundle Combo Amor y Amistad",
  "error": "Solicitado: 10, Disponible: 5"
}
```

### Error 2: Componente sin stock
```json
{
  "success": false,
  "message": "Componentes insuficientes para el bundle",
  "error": "Labial Rojo (faltan 3), Máscara Negra (faltan 1)",
  "detalles": [
    {
      "art_nom": "Labial Rojo",
      "necesita": 10,
      "tiene": 7,
      "falta": 3
    },
    {
      "art_nom": "Máscara Negra",
      "necesita": 10,
      "tiene": 9,
      "falta": 1
    }
  ]
}
```
