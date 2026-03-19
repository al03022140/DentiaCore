#!/bin/bash
# Quick Setup Script for Linux - Single Command Installation
# Run: bash setup-linux.sh

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}"
echo "╔════════════════════════════════════════╗"
echo "║    DentiaCore Setup para Linux         ║"
echo "╚════════════════════════════════════════╝"
echo -e "${NC}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR" || exit 1

# Detectar gestor de paquetes
if command -v apt-get &> /dev/null; then
    echo -e "${YELLOW}[>] Sistemas basados en Debian/Ubuntu detectado${NC}"
    echo -e "${YELLOW}[!] Se requerirán permisos de sudo${NC}"
    PACKAGE_MANAGER="apt"
elif command -v yum &> /dev/null; then
    echo -e "${YELLOW}[>] Sistema basado en Red Hat/CentOS detectado${NC}"
    echo -e "${YELLOW}[!] Se requerirán permisos de sudo${NC}"
    PACKAGE_MANAGER="yum"
else
    echo -e "${RED}[X] Gestor de paquetes no soportado${NC}"
    exit 1
fi

# Run the main install script
echo -e "${YELLOW}[>] Ejecutando instalación completa...${NC}"
bash install.sh

if [ $? -eq 0 ]; then
    echo -e "${GREEN}[V] ¡Instalación completada!${NC}"
    echo ""
    echo -e "${CYAN}Para iniciar DentiaCore:${NC}"
    echo -e "  • Opción 1: ${GREEN}./DentiaCore${NC}"
    echo -e "  • Opción 2: ${GREEN}python3 launcher.py${NC}"
else
    echo -e "${RED}[X] Hubo un error durante la instalación${NC}"
    exit 1
fi
