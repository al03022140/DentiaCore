# 🧪 Guía de Testing - Launcher Fixes

## Antes de Empezar

```bash
# Verifica que estés en el directorio correcto
cd /Users/arleyramirezzz/Downloads/DentiaCore

# Asegúrate de tener Python 3.9+ con Tkinter
python3 --version
python3 -c "import tkinter; print('Tkinter OK')"
```

---

## 🪟 Testing en WINDOWS

### Test 1: Limpieza de Puertos sin NPX ⚠️
**Objetivo**: Verificar que `_kill_port()` funciona sin `npx`

**Pasos**:
1. Abre PowerShell como administrador
2. `npx --version` (verifica qué tienes)
3. Opcionalmente, desinstala: `npm uninstall -g kill-port`
4. Abre otra ventana: `netstat -ano | findstr :5002` (para ver si hay algo)
5. Ejecuta el launcher: `python launcher.py`
6. Haz clic en "🚀 Iniciar Aplicación Completa"
7. Si hay procesos en puerto 5002, deberían ser eliminados automáticamente

**Esperado**: ✅ Puerto limpiado sin errores, aplicación inicia

---

### Test 2: Rutas con Espacios en PowerShell 👀
**Objetivo**: Verificar que MongoDB inicia correctamente desde rutas con espacios

**Pasos**:
1. Verifica que `/opt/homebrew` o `C:\Program Files\MongoDB\Server\X.X` exista (Intel Mac)
2. En launcher, haz clic en "🚀 Iniciar Aplicación Completa"
3. Observa la consola para que MongoDB inicie en una ventana de terminal
4. Verifica que MongoDB está en escucha (debería ver mensaje después de 2-3 segundos)

**Esperado**: ✅ MongoDB inicia en nueva terminal sin errores de espacios

---

### Test 3: Detección de MongoDB (Multiples Métodos) 🔎
**Objetivo**: Verificar que encuentra MongoDB instalado de diferentes formas

**Caso A - MongoDB como servicio**:
```powershell
# En PowerShell (admin)
net start MongoDB
# Luego ejecuta launcher
python launcher.py
```

**Caso B - mongod.exe manual en carpeta DB**:
```powershell
# Coloca mongod.exe en tools/mongo/bin/ (si existe)
# O descárgalo desde MongoDB.com y coloca en carpeta del proyecto
# Luego ejecuta launcher
python launcher.py
```

**Esperado**: ✅ Detector menciona qué método encontró

---

### Test 4: CREATE_NEW_CONSOLE Fallback 🪟
**Objetivo**: Verificar que funciona incluso si CREATE_NEW_CONSOLE falla

**Pasos**:
1. Ejecuta launcher: `python launcher.py`
2. Abre Task Manager (Ctrl+Shift+Esc) y vé a "Procesos"
3. Busca `mongod.exe`, `node`, `npm`
4. Haz clic en "⏹ Detener Todo"
5. Verifica que todos se cierran

**Esperado**: ✅ Todos los procesos se terminan, sin excepciones

---

## 🍎 Testing en macOS

### Test 1: Detección Intel vs Apple Silicon 🔧
**Objetivo**: Verificar que la búsqueda de MongoDB es correcta para tu Mac

**Pasos**:
```bash
# Verifica tu arquitectura
uname -m
# M1/M2/M3 = arm64  |  Intel = x86_64

# Verifica dónde está mongod
which mongod
# O
find /opt/homebrew /usr/local -name mongod -type f 2>/dev/null

# Ejecuta launcher
python3 launcher.py
```

**Esperado**: 
- Si `uname -m` = `arm64`: Debería encontrar en `/opt/homebrew`
- Si `uname -m` = `x86_64`: Debería encontrar en `/usr/local`

---

### Test 2: MongoDB via Homebrew Services 🏠
**Objetivo**: Verificar que "brew services" funciona si está disponible

**Pasos**:
```bash
# Instala MongoDB si no lo tienes
brew install mongodb-community

# Asegúrate de que no esté corriendo
brew services stop mongodb-community

# Ejecuta launcher
python3 launcher.py

# Haz clic en "🚀 Iniciar Aplicación Completa"
```

**Esperado**: ✅ MongoDB inicia automáticamente via "brew services"

---

### Test 3: MongoDB Manual via mongod directo 🖤
**Objetivo**: Verificar fallback si brew services no está disponible

**Pasos**:
```bash
# En otra ventana, mata MongoDB si está corriendo
pkill mongod

# Quita permisos de brew services (simula que no está disponible)
brew services stop mongodb-community

# En launcher, haz clic en "🚀 Iniciar Aplicación Completa"
```

**Esperado**: ✅ MongoDB inicia directamente con `mongod --dbpath ./DB`

---

### Test 4: Sin pgrep (Fallback a ps) 🔍
**Objetivo**: Verificar que la detección de proceso funciona sin pgrep

**Pasos**:
```bash
# Verifica si tienes pgrep
which pgrep  # Si no existe, saltamos al paso 3

# Si existe, simula que no estándisponible
cd /usr/local/bin
sudo mv pgrep pgrep.bak  # (requiere contraseña)

# Ejecuta launcher
python3 launcher.py

# Intenta iniciar MongoDB
# Luego restaura pgrep
sudo mv pgrep.bak pgrep
```

**Esperado**: ✅ Sigue detectando MongoDB via `ps aux`

---

### Test 5: Tcl/Tk 8.6 Check ⚠️
**Objetivo**: Verificar que el check de versión de Tcl/Tk funciona

**Pasos**:
```bash
# Verifica tu versión actual
python3 -c "import tkinter; print(f'Tcl/Tk {tkinter.TkVersion}')"

# Si es < 8.6:
brew install python-tk@3.13
/opt/homebrew/bin/python3.13 launcher.py

# Si es >= 8.6:
python3 launcher.py  # Debería iniciar sin problemas
```

**Esperado**: ✅ Mensajes claros si Tcl/Tk es insuficiente, con instrucciones

---

## 🔄 Testing Cross-Platform

### Test 1: Stop + Start Rápido ⚡
**Objetivo**: Verificar que los puertos se limpian correctamente en reinicio

**Pasos**:
1. Ejecuta launcher: `python launcher.py`
2. Haz clic en "🚀 Iniciar Aplicación Completa" (espera 15-30 segundos)
3. Haz clic en "⏹ Detener Todo" (espera 5 segundos)
4. Espera 2-3 segundos
5. Haz clic nuevamente en "🚀 Iniciar Aplicación Completa"

**Esperado**: ✅ Segunda ejecución inicia sin errores de puertos ocupados

---

### Test 2: Cierre de Ventana Durante Startup 🪟
**Objetivo**: Verificar que los procesos se limpian si cierras durante startup

**Pasos**:
1. Ejecuta launcher: `python launcher.py`
2. Haz clic en "🚀 Iniciar Aplicación Completa"
3. Espera 5-10 segundos (durante startup)
4. Cierra la ventana del launcher (Cmd+W / Alt+F4)
5. Verifica en Task Manager / Activity Monitor que no hay procesos huérfanos

**Esperado**: ✅ Todos los procesos (mongod, node, npm) se detienen

---

### Test 3: MongoDB No Disponible 🚫
**Objetivo**: Verificar mensajes de error útiles cuando MongoDB falla

**Pasos**:
1. Detén MongoDB si está corriendo: `pkill mongod`
2. Ejecuta launcher
3. Haz clic en "🚀 Iniciar Aplicación Completa"
4. Espera a que falle

**Esperado**: ✅ Mensaje claro: "MongoDB no disponible", con sugerencias para arreglarlo

---

### Test 4: Limpiar Pacientes 🗑
**Objetivo**: Verificar que el botón de limpieza funciona

**Pasos**:
1. Ejecuta launcher
2. Haz clic en "🚀 Iniciar Aplicación Completa" (espera a que esté listo)
3. Haz clic en "🗑️ Limpiar Pacientes"
4. Responde "Sí" al cuadro de confirmación
5. Espera 10 segundos

**Esperado**: ✅ Mensaje "Pacientes eliminados correctamente"

---

## 📊 Checklist de Testing Final

**Windows**:
- [ ] `_kill_port()` funciona sin npx
- [ ] PowerShell maneja rutas con espacios
- [ ] MongoDB se detiene correctamente
- [ ] Cierre de ventana limpia procesos

**macOS**:
- [ ] Detecta MongoDB en arquitectura correcta (Intel vs Apple Silicon)
- [ ] "brew services" inicia MongoDB
- [ ] Fallback a mongod directo funciona
- [ ] `ps` funciona si no hay pgrep
- [ ] Tcl/Tk check muestra versión

**Cross-Platform**:
- [ ] Reinicio rápido sin errores de puerto
- [ ] Cierre durante startup limpia procesos
- [ ] Mensajes de error son útiles
- [ ] Botones Iniciar/Detener son confiables

---

## 🐛 Si Encuentra Problemas

**Registra en un archivo**:
```
Sistema Operativo: Windows 11 / macOS 14.2 / Ubuntu 22.04
Arquitectura: x86_64 / arm64
Python: python3 --version
MongoDB: which mongod  /  mongod --version
Error exacto (copy-paste de consola):
[Descripción del error]
```

**Archivos de diagnóstico útiles**:
- `Server/logs/dent-*.log` - Logs del servidor
- `DB/logs/mongod.log` - Logs de MongoDB (si existe)
- Salida de consola del launcher (copia-pega todo)

---

**¡Gracias por probar! Tus reportes de testing ayudan a mejorar DentiaCore.**

