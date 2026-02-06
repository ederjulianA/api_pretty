#!/bin/bash

# ============================================================================
# Script de Prueba: Endpoints de Sincronización de Categorías
# Fecha: 2026-02-05
# ============================================================================

# Colores para output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuración
API_URL="http://localhost:3000/api"
TOKEN=""

echo "============================================"
echo "Test de Endpoints - Sincronización Categorías"
echo "============================================"
echo ""

# ============================================================================
# Función para obtener token
# ============================================================================
get_token() {
    echo -e "${YELLOW}[1/4] Obteniendo token JWT...${NC}"

    RESPONSE=$(curl -s -X POST "$API_URL/auth/login" \
        -H "Content-Type: application/json" \
        -d '{
            "usu_cod": "admin",
            "usu_pass": "admin123"
        }')

    TOKEN=$(echo $RESPONSE | jq -r '.token')

    if [ "$TOKEN" != "null" ] && [ -n "$TOKEN" ]; then
        echo -e "${GREEN}✅ Token obtenido exitosamente${NC}"
        echo ""
        return 0
    else
        echo -e "${RED}❌ Error al obtener token${NC}"
        echo "Respuesta: $RESPONSE"
        exit 1
    fi
}

# ============================================================================
# Función para sincronizar productos
# ============================================================================
sync_products() {
    echo -e "${YELLOW}[2/4] Sincronizando productos...${NC}"

    RESPONSE=$(curl -s -X POST "$API_URL/woo/sync" \
        -H "Content-Type: application/json" \
        -H "x-access-token: $TOKEN")

    SUCCESS=$(echo $RESPONSE | jq -r '.success')

    if [ "$SUCCESS" = "true" ]; then
        echo -e "${GREEN}✅ Sincronización completada${NC}"
        echo ""
        echo "Estadísticas:"
        echo $RESPONSE | jq '.stats'
        echo ""
        return 0
    else
        echo -e "${RED}❌ Error en sincronización${NC}"
        echo "Respuesta: $RESPONSE"
        exit 1
    fi
}

# ============================================================================
# Función para auditar categorías
# ============================================================================
audit_categories() {
    echo -e "${YELLOW}[3/4] Auditando categorías...${NC}"

    RESPONSE=$(curl -s "$API_URL/woo/audit-categories?onlyMismatches=true" \
        -H "x-access-token: $TOKEN")

    SUCCESS=$(echo $RESPONSE | jq -r '.success')

    if [ "$SUCCESS" = "true" ]; then
        DISCREPANCIAS=$(echo $RESPONSE | jq -r '.stats.discrepancias')
        TOTAL=$(echo $RESPONSE | jq -r '.stats.total')

        echo -e "${GREEN}✅ Auditoría completada${NC}"
        echo ""
        echo "Resultados:"
        echo $RESPONSE | jq '.stats'
        echo ""

        if [ "$DISCREPANCIAS" -gt 0 ]; then
            echo -e "${YELLOW}⚠️  Se encontraron $DISCREPANCIAS discrepancias de $TOTAL productos${NC}"
            echo ""
            echo "Primeros 3 productos con discrepancias:"
            echo $RESPONSE | jq '.data[:3]'
            echo ""
        else
            echo -e "${GREEN}✅ No hay discrepancias!${NC}"
            echo ""
        fi

        return 0
    else
        echo -e "${RED}❌ Error en auditoría${NC}"
        echo "Respuesta: $RESPONSE"
        exit 1
    fi
}

# ============================================================================
# Función para corregir categoría (opcional)
# ============================================================================
fix_category() {
    echo -e "${YELLOW}[4/4] Test de corrección de categoría...${NC}"

    # Obtener primer SKU con discrepancia
    RESPONSE=$(curl -s "$API_URL/woo/audit-categories?onlyMismatches=true" \
        -H "x-access-token: $TOKEN")

    FIRST_SKU=$(echo $RESPONSE | jq -r '.data[0].sku')

    if [ "$FIRST_SKU" = "null" ] || [ -z "$FIRST_SKU" ]; then
        echo -e "${GREEN}✅ No hay productos para corregir${NC}"
        echo ""
        return 0
    fi

    echo "Corrigiendo producto: $FIRST_SKU"
    echo ""

    # Mostrar prompt de confirmación
    read -p "¿Desea corregir este producto? (y/n): " -n 1 -r
    echo ""

    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}⚠️  Corrección cancelada por usuario${NC}"
        echo ""
        return 0
    fi

    # Corregir producto
    FIX_RESPONSE=$(curl -s -X POST "$API_URL/woo/fix-category" \
        -H "Content-Type: application/json" \
        -H "x-access-token: $TOKEN" \
        -d "{
            \"art_cod\": \"$FIRST_SKU\",
            \"action\": \"sync-to-woo\"
        }")

    FIX_SUCCESS=$(echo $FIX_RESPONSE | jq -r '.success')

    if [ "$FIX_SUCCESS" = "true" ]; then
        echo -e "${GREEN}✅ Producto corregido exitosamente${NC}"
        echo ""
        echo "Resultado:"
        echo $FIX_RESPONSE | jq
        echo ""
    else
        echo -e "${RED}❌ Error al corregir producto${NC}"
        echo "Respuesta: $FIX_RESPONSE"
    fi
}

# ============================================================================
# Función principal
# ============================================================================
main() {
    # Verificar que jq está instalado
    if ! command -v jq &> /dev/null; then
        echo -e "${RED}❌ Error: jq no está instalado${NC}"
        echo "Instalar con: brew install jq (macOS) o apt-get install jq (Linux)"
        exit 1
    fi

    # Verificar que el servidor está corriendo
    if ! curl -s "$API_URL/diagnostic" > /dev/null 2>&1; then
        echo -e "${RED}❌ Error: El servidor no está corriendo en $API_URL${NC}"
        echo "Ejecutar: npm run dev"
        exit 1
    fi

    echo -e "${GREEN}✅ Servidor detectado${NC}"
    echo ""

    # Ejecutar tests
    get_token
    sync_products
    audit_categories
    fix_category

    echo "============================================"
    echo -e "${GREEN}✅ Test completado${NC}"
    echo "============================================"
    echo ""
    echo "Próximos pasos:"
    echo "1. Revisar logs del servidor"
    echo "2. Verificar datos en SQL Server"
    echo "3. Corregir discrepancias restantes"
    echo ""
}

# Ejecutar
main
