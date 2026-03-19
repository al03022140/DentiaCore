#!/bin/bash
# Quick Setup Script for macOS - Single Command Installation
# Ejecutar: bash <(curl -fsSL https://raw.githubusercontent.com/tu-repo/DentiaCore/main/setup-mac.sh)
# O: bash setup-mac.sh desde el directorio raíz

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}"
echo "╔════════════════════════════════════════╗"
echo "║     DentiaCore Setup para macOS        ║"
echo "╚════════════════════════════════════════╝"
echo -e "${NC}"

# Navigate to script directory
if [ -n "$BASH_SOURCE" ]; then
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
else
    SCRIPT_DIR="$(pwd)"
fi

cd "$SCRIPT_DIR" || exit 1

# Check if we need to install Homebrew
if ! command -v brew &> /dev/null; then
    echo -e "${YELLOW}[!] Homebrew no está instalado. Instalando...${NC}"
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    # Refresh PATH so brew is available immediately in this session
    if [ -f /opt/homebrew/bin/brew ]; then
        eval "$(/opt/homebrew/bin/brew shellenv)"
    elif [ -f /usr/local/bin/brew ]; then
        eval "$(/usr/local/bin/brew shellenv)"
    fi
fi

# Run the main install script
echo -e "${YELLOW}[>] Ejecutando instalación completa...${NC}"
bash install.sh

if [ $? -eq 0 ]; then
    echo -e "${GREEN}[V] ¡Instalación completada!${NC}"
    echo ""
    echo -e "${CYAN}Para iniciar DentiaCore:${NC}"
    echo -e "  • Opción 1 (recomendado): ${GREEN}open DentiaCore.app${NC}"
    echo -e "  • Opción 2: ${GREEN}./DentiaCore${NC}"
    echo -e "  • Opción 3: ${GREEN}python3 launcher.py${NC}"
else
    echo -e "${RED}[X] Hubo un error durante la instalación${NC}"
    exit 1
fi
