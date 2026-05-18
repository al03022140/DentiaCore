#!/bin/bash
# -*- coding: utf-8 -*-
# DentiaCore Installation Script for macOS and Linux
# Instalador para DentiaCore en macOS y Linux

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Functions
print_header() {
    echo -e "\n${CYAN}=== $1 ===${NC}"
}

print_step() {
    echo -e " ${YELLOW}[>] $1${NC}"
}

print_ok() {
    echo -e " ${GREEN}[V] $1${NC}"
}

print_err() {
    echo -e " ${RED}[X] $1${NC}"
}

print_warn() {
    echo -e " ${YELLOW}[!] $1${NC}"
}

# Detect OS
if [[ "$OSTYPE" == "darwin"* ]]; then
    OS_TYPE="mac"
    PACKAGE_MANAGER="brew"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS_TYPE="linux"
    if command -v apt-get &> /dev/null; then
        PACKAGE_MANAGER="apt"
    elif command -v yum &> /dev/null; then
        PACKAGE_MANAGER="yum"
    else
        PACKAGE_MANAGER="unknown"
    fi
else
    print_err "Sistema operativo no soportado: $OSTYPE"
    exit 1
fi

print_header "INSTALACIÓN DE INFRAESTRUCTURA DENTIACORE"
echo "Sistema detectado: $OS_TYPE"
echo "Gestor de paquetes: $PACKAGE_MANAGER"

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$SCRIPT_DIR"
SERVER_DIR="$REPO_ROOT/Server"
CLIENT_DIR="$REPO_ROOT/Client"
DB_DIR="$REPO_ROOT/DB"

print_header "1. VERIFICACIÓN DE DEPENDENCIAS SISTEMA"

# Check and install Node.js
if ! command -v node &> /dev/null; then
    print_step "Instalando Node.js..."
    if [ "$OS_TYPE" = "mac" ]; then
        # Check if Homebrew is installed
        if ! command -v brew &> /dev/null; then
            print_step "Instalando Homebrew..."
            /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
            # Refresh PATH so brew is available in this session (Apple Silicon vs Intel)
            if [ -f /opt/homebrew/bin/brew ]; then
                eval "$(/opt/homebrew/bin/brew shellenv)"
            elif [ -f /usr/local/bin/brew ]; then
                eval "$(/usr/local/bin/brew shellenv)"
            fi
        fi
        brew install node
    elif [ "$OS_TYPE" = "linux" ]; then
        if [ "$PACKAGE_MANAGER" = "apt" ]; then
            sudo apt-get update
            sudo apt-get install -y nodejs npm
        elif [ "$PACKAGE_MANAGER" = "yum" ]; then
            sudo yum install -y nodejs npm
        fi
    fi
    print_ok "Node.js instalado"
fi

# Validate Node.js version (Vite 6 + dependencias requieren >= 18)
NODE_VERSION=$(node -v 2>/dev/null || echo "")
NODE_MAJOR=$(echo "$NODE_VERSION" | sed 's/^v//' | cut -d. -f1)
if [ -z "$NODE_MAJOR" ] || ! [ "$NODE_MAJOR" -ge 18 ] 2>/dev/null; then
    print_err "Node.js v18 o superior es requerido (detectado: ${NODE_VERSION:-ninguno})"
    if [ "$OS_TYPE" = "mac" ]; then
        print_err "Actualiza con: brew upgrade node  (o brew install node@20)"
    else
        print_err "Sigue: https://nodejs.org/en/download/package-manager"
    fi
    exit 1
fi
print_ok "Node.js validado: $NODE_VERSION"

# Check npm
if ! command -v npm &> /dev/null; then
    print_err "npm no encontrado. Instala Node.js con npm incluido."
    exit 1
fi

print_header "2. CONFIGURACIÓN DE MONGODB"

# MongoDB setup
if ! command -v mongod &> /dev/null; then
    print_step "Instalando MongoDB..."
    if [ "$OS_TYPE" = "mac" ]; then
        if ! command -v brew &> /dev/null; then
            print_warn "Homebrew no está instalado. Por favor instala Homebrew primero."
            exit 1
        fi
        # For Mac, add tap and install MongoDB community edition
        print_step "Agregando MongoDB tap a Homebrew..."
        brew tap mongodb/brew > /dev/null 2>&1 || true
        print_step "Instalando mongodb-community..."
        if brew install mongodb-community; then
            print_ok "MongoDB instalado exitosamente"
        else
            print_err "Error instalando MongoDB. Intenta: brew install mongodb-community"
            exit 1
        fi
    elif [ "$OS_TYPE" = "linux" ]; then
        if [ "$PACKAGE_MANAGER" = "apt" ]; then
            sudo apt-get install -y mongodb
        elif [ "$PACKAGE_MANAGER" = "yum" ]; then
            sudo yum install -y mongodb-server
        fi
    fi
    print_ok "MongoDB instalado"
else
    MONGO_VERSION=$(mongod --version 2>/dev/null | head -1 || echo "versión desconocida")
    print_ok "MongoDB detectado: $MONGO_VERSION"
fi

# Validate MongoDB es realmente invocable después de la instalación
if ! command -v mongod &> /dev/null; then
    print_err "mongod no quedó disponible en PATH tras la instalación."
    if [ "$OS_TYPE" = "mac" ]; then
        print_err "Intenta: brew link mongodb-community  — o reinicia tu terminal y vuelve a correr el instalador."
    else
        print_err "Instala manualmente desde https://www.mongodb.com/docs/manual/installation/"
    fi
    exit 1
fi
if ! mongod --version > /dev/null 2>&1; then
    print_err "mongod existe pero no responde a 'mongod --version'. Revisa la instalación."
    exit 1
fi
print_ok "MongoDB validado correctamente"

# Create DB directories
print_step "Creando directorios de base de datos..."
mkdir -p "$DB_DIR"
mkdir -p "$DB_DIR/logs"

# Ensure write permissions
chmod 755 "$DB_DIR" 2>/dev/null || true
chmod 755 "$DB_DIR/logs" 2>/dev/null || true

# Verify MongoDB can write to DB directory
if ! touch "$DB_DIR/.write-test" 2>/dev/null; then
    print_warn "⚠️  Directorio DB podría tener problemas de permisos"
    print_step "Intentando corregir permisos..."
    chmod 777 "$DB_DIR" 2>/dev/null || print_warn "No se pueden cambiar permisos automáticamente"
fi
rm -f "$DB_DIR/.write-test" 2>/dev/null || true

print_ok "Directorios creados"

print_header "3. INSTALACIÓN DE DEPENDENCIAS NPM"

# Root npm install
if [ -f "$REPO_ROOT/package.json" ]; then
    print_step "Instalando dependencias root..."
    cd "$REPO_ROOT"
    npm install --no-audit --no-fund
    print_ok "Dependencias root instaladas"
fi

# Server npm install
if [ -f "$SERVER_DIR/package.json" ]; then
    print_step "Instalando dependencias del servidor..."
    cd "$SERVER_DIR"
    npm install --no-audit --no-fund
    # macOS/Linux: npm may not preserve +x bits on .bin scripts when extracted
    # from zips or git-cloned without proper umask. Fix them explicitly.
    chmod -R +x node_modules/.bin/ 2>/dev/null || true
    print_ok "Dependencias del servidor instaladas"
fi

# Client npm install
if [ -f "$CLIENT_DIR/package.json" ]; then
    print_step "Instalando dependencias del cliente..."
    cd "$CLIENT_DIR"
    npm install --no-audit --no-fund
    print_ok "Dependencias del cliente instaladas"
fi

print_header "4. CONFIGURAR VARIABLES DE ENTORNO"

# Get local IP - Improved for macOS
if [ "$OS_TYPE" = "mac" ]; then
    # Try en0 (typical WiFi), en1 (Ethernet), en2, etc.
    for interface in en0 en1 en2 en3 en4; do
        LOCAL_IP=$(ipconfig getifaddr $interface 2>/dev/null)
        if [ -n "$LOCAL_IP" ]; then
            break
        fi
    done

    # Fallback to ifconfig for VMs and complex networks
    if [ -z "$LOCAL_IP" ]; then
        LOCAL_IP=$(ifconfig 2>/dev/null | grep -E "^\s+inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -1)
    fi
elif [ "$OS_TYPE" = "linux" ]; then
    LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
fi

if [ -z "$LOCAL_IP" ]; then
    LOCAL_IP="127.0.0.1"
fi

print_ok "IP detectada: $LOCAL_IP"

# Create or update .env file
ENV_FILE="$SERVER_DIR/.env"
print_step "Actualizando archivo .env..."

# Preserve existing .env if it exists
if [ -f "$ENV_FILE" ]; then
    # Create backup
    cp "$ENV_FILE" "$ENV_FILE.backup"
    # Copy existing values except network config
    grep -v "^PORT=\|^HOST=\|^MONGODB_URI=\|^CLIENT_URL=\|^PUBLIC_URL=" "$ENV_FILE" > "$ENV_FILE.tmp" || true
else
    echo "NODE_ENV=production" > "$ENV_FILE.tmp"
fi

# Add/update network configuration
cat >> "$ENV_FILE.tmp" << EOF
PORT=5002
HOST=0.0.0.0
MONGODB_URI=mongodb://127.0.0.1:27017/DentiaCore
CLIENT_URL=http://$LOCAL_IP:5002
PUBLIC_URL=http://$LOCAL_IP:5002
EOF

mv "$ENV_FILE.tmp" "$ENV_FILE"
print_ok ".env actualizado (IP: $LOCAL_IP)"

print_header "5. BUILD DEL FRONTEND"

print_step "Compilando frontend para LAN..."
cd "$CLIENT_DIR"

# Execute build and capture exit code
if VITE_API_URL="http://$LOCAL_IP:5002" npm run build > "$REPO_ROOT/vite-build.log" 2>&1; then
    print_ok "Frontend compilado exitosamente"
else
    print_err "❌ Error compilando frontend"
    print_err "Mostrando últimas líneas del log de compilación:"
    echo "---"
    tail -20 "$REPO_ROOT/vite-build.log"
    echo "---"
    print_err "Posibles soluciones:"
    print_err "  1. reinstala dependencias: cd Client && rm -rf node_modules && npm install"
    print_err "  2. Verifica Node.js: node --version (requiere v14+)"
    print_err "  3. Revisa errores: cat \"$REPO_ROOT/vite-build.log\""
    exit 1
fi

print_header "6. CREAR LAUNCHER PARA APLICACIÓN"

# Check Python3 availability
if ! command -v python3 &> /dev/null; then
    print_err "❌ Python3 no está instalado"
    if [ "$OS_TYPE" = "mac" ]; then
        print_step "Intentando instalar Python3 via Homebrew..."
        if ! command -v brew &> /dev/null; then
            print_err "Homebrew no está instalado. Instala Python3 manualmente."
            exit 1
        fi
        if brew install python3; then
            print_ok "Python3 instalado"
        else
            print_err "No se pudo instalar Python3"
            exit 1
        fi
    else
        print_err "Por favor instala Python3 (python3): apt-get install python3 && apt-get install python3-tk"
        exit 1
    fi
fi

# Get Python3 path for .app bundle
# On macOS prefer Homebrew Python3 which includes modern Tcl/Tk (system Python3
# ships Tcl/Tk 8.5 which crashes on macOS 13+).
# The check must verify Tcl/Tk >= 8.6, NOT just "import tkinter" which succeeds
# even with the broken 8.5 version.

_tk_ok() {
    # Returns 0 if the given python has tkinter with Tcl/Tk >= 8.6
    "$1" -c "import tkinter; assert float(tkinter.TkVersion) >= 8.6" 2>/dev/null
}

PYTHON_PATH=""
if [ "$OS_TYPE" = "mac" ]; then
    # Search versioned Homebrew Pythons first (3.13, 3.12, 3.11 …), then unversioned
    for brew_python in /opt/homebrew/bin/python3.13 /opt/homebrew/bin/python3.12 \
                       /opt/homebrew/bin/python3.11 /opt/homebrew/bin/python3 \
                       /usr/local/bin/python3; do
        if [ -x "$brew_python" ] && _tk_ok "$brew_python"; then
            PYTHON_PATH="$brew_python"
            print_ok "Python3 con Tcl/Tk moderno encontrado en: $PYTHON_PATH"
            break
        fi
    done
fi

if [ -z "$PYTHON_PATH" ]; then
    PYTHON_PATH=$(command -v python3)
    if ! _tk_ok "$PYTHON_PATH"; then
        print_warn "⚠️  Python3 en $PYTHON_PATH tiene Tcl/Tk < 8.6 (incompatible con macOS moderno)"
        if [ "$OS_TYPE" = "mac" ]; then
            print_step "Instalando Python3 con Tcl/Tk moderno via Homebrew..."
            brew install python-tk@3.13 || brew install python3
            for brew_python in /opt/homebrew/bin/python3.13 /opt/homebrew/bin/python3.12 \
                               /opt/homebrew/bin/python3.11 /opt/homebrew/bin/python3 \
                               /usr/local/bin/python3; do
                if [ -x "$brew_python" ] && _tk_ok "$brew_python"; then
                    PYTHON_PATH="$brew_python"
                    break
                fi
            done
            if _tk_ok "$PYTHON_PATH"; then
                print_ok "Python3 con Tcl/Tk moderno instalado en: $PYTHON_PATH"
            else
                print_err "No se pudo obtener Python3 con Tcl/Tk >= 8.6. Instala manualmente: brew install python-tk@3.13"
                exit 1
            fi
        else
            print_err "Instala python3-tk: sudo apt-get install python3-tk"
            exit 1
        fi
    else
        print_ok "Python3 encontrado en: $PYTHON_PATH"
    fi
fi

# Create a shell script launcher
LAUNCHER_SCRIPT="$REPO_ROOT/DentiaCore"
cat > "$LAUNCHER_SCRIPT" << 'LAUNCHER_EOF'
#!/bin/bash
# DentiaCore Launcher Script for macOS/Linux
cd "$(dirname "$0")"
# Find best Python3 — prefer Homebrew (has modern Tcl/Tk) over system Python
PYTHON=""
for py in /opt/homebrew/bin/python3.13 /opt/homebrew/bin/python3.12 /opt/homebrew/bin/python3.11 /opt/homebrew/bin/python3 /usr/local/bin/python3 /usr/bin/python3; do
    if [ -x "$py" ]; then
        PYTHON="$py"
        break
    fi
done
"${PYTHON:-python3}" launcher.py "$@"
LAUNCHER_EOF

chmod +x "$LAUNCHER_SCRIPT"
print_ok "Launcher creado: $LAUNCHER_SCRIPT"

# For macOS, create an .app bundle
if [ "$OS_TYPE" = "mac" ]; then
    print_header "7. CREAR APLICACIÓN macOS (.app)"

    APP_BUNDLE="$REPO_ROOT/DentiaCore.app"
    CONTENTS_DIR="$APP_BUNDLE/Contents"
    MACOS_DIR="$CONTENTS_DIR/MacOS"
    RESOURCES_DIR="$CONTENTS_DIR/Resources"

    # Remove existing app if present
    if [ -d "$APP_BUNDLE" ]; then
        rm -rf "$APP_BUNDLE"
    fi

    # Create directory structure
    mkdir -p "$MACOS_DIR"
    mkdir -p "$RESOURCES_DIR"

    # Create Python-script executable launcher.
    # Using Python (a Mach-O binary via shebang) instead of bash avoids the
    # -10669 Launch Services error on macOS Sonoma 14+ / Tahoe 26+ which
    # requires CFBundleExecutable to be a Mach-O binary, not a shell script.
    cat > "$MACOS_DIR/DentiaCore" << MACOS_LAUNCHER_EOF
#!${PYTHON_PATH}
# -*- coding: utf-8 -*-
# DentiaCore macOS App Launcher
# CFBundleExecutable: Python (Mach-O binary) invokes this script directly.
import sys, os, runpy

_here = os.path.dirname(os.path.abspath(__file__))
_root = os.path.dirname(os.path.dirname(os.path.dirname(_here)))

os.chdir(_root)
sys.path.insert(0, _root)

_brew = '/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/local/sbin'
if '/opt/homebrew/bin' not in os.environ.get('PATH', ''):
    os.environ['PATH'] = _brew + ':' + os.environ.get('PATH', '')

sys.argv[0] = os.path.join(_root, 'launcher.py')
runpy.run_path(sys.argv[0], run_name='__main__')
MACOS_LAUNCHER_EOF

    chmod +x "$MACOS_DIR/DentiaCore"

    # Create Info.plist
    cat > "$CONTENTS_DIR/Info.plist" << 'PLIST_EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>en</string>
    <key>CFBundleExecutable</key>
    <string>DentiaCore</string>
    <key>CFBundleIdentifier</key>
    <string>com.dentiacore.app</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundleName</key>
    <string>DentiaCore</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>NSPrincipalClass</key>
    <string>NSApplication</string>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>NSHumanReadableCopyright</key>
    <string>DentiaCore © 2026. All rights reserved.</string>
    <key>LSMinimumSystemVersion</key>
    <string>10.12</string>
    <key>NSRequiresIPhoneOS</key>
    <false/>
</dict>
</plist>
PLIST_EOF

    # Copy favicon as icon if available
    if [ -f "$CLIENT_DIR/public/favicon.ico" ]; then
        cp "$CLIENT_DIR/public/favicon.ico" "$RESOURCES_DIR/AppIcon.ico"
    fi

    print_ok "Aplicación macOS creada: $APP_BUNDLE"

    # Eliminar atributo de quarantine para evitar bloqueos de Gatekeeper
    xattr -cr "$APP_BUNDLE" 2>/dev/null || true

    echo ""
    echo "Para ejecutar la aplicación:"
    echo "  - Doble-click en $APP_BUNDLE"
    echo "  - O desde terminal: open $APP_BUNDLE"
    echo "  - O: $REPO_ROOT/DentiaCore"
fi

print_header "✅ INSTALACIÓN COMPLETADA"
echo ""
echo "Para iniciar DentiaCore:"
if [ "$OS_TYPE" = "mac" ]; then
    echo "  1. Opción A (recomendado): open $APP_BUNDLE"
    echo "  2. Opción B (terminal): $LAUNCHER_SCRIPT"
    echo "  3. Opción C (desde Finder): Busca DentiaCore.app en la carpeta del proyecto"
else
    echo "  Ejecuta: $LAUNCHER_SCRIPT"
    echo "  O: python3 launcher.py"
fi

echo ""
echo "IP del servidor: $LOCAL_IP"
echo "URL: http://$LOCAL_IP:5002"
echo ""
echo "NOTA: Si usas Google Auth, agrega http://$LOCAL_IP:5002 en Google Cloud Console."
echo ""
