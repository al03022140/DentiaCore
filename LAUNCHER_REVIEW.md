# Revisión de Compatibilidad: launcher.py

## Resumen de Hallazgos

El launcher tiene una arquitectura sólida con soporte multi-plataforma. Sin embargo, hay varios problemas críticos que afectan la compatibilidad en Windows y macOS:

---

## 🔴 PROBLEMAS CRÍTICOS

### 1. **Windows: Error en `_kill_port()` - Falta manejo de `npx`**
**Ubicación**: Línea ~664  
**Error**: El código usa `npx kill-port` pero no verifica si NPX está disponible.

```python
else:
    subprocess.run(
        ['npx', 'kill-port', str(port)],
        shell=True,
        capture_output=True,
        timeout=5
    )
```

**Problema**: Si `npx` no está en PATH, el comando falla silenciosamente.

**Solución**: Usar método alternativo con `taskkill` (nativo de Windows):

```python
if sys.platform == 'win32':
    try:
        subprocess.run(
            ['taskkill', '/F', '/PID', str(pid)],
            shell=True,
            capture_output=True,
            timeout=5
        )
    except Exception:
        pass
```

---

### 2. **Windows: PowerShell - Manejo incorrecto de rutas con espacios**
**Ubicación**: Línea ~1653 (`_launch_mongod_in_terminal`)  
**Error**: Las rutas con espacios no se escapan correctamente en PowerShell.

**Actual (INCORRECTO)**:
```python
ps_cmds.append(f"& '{exe}' --config '{cfg}' --dbpath '{db_dir}'")
```

**Problema**: Si `exe`, `cfg` o `db_dir` contienen espacios fuera de las comillas, pueden tener problemas.

**Solución**: Usar escape adicional o Convert-Path:
```python
ps_cmds.append(f"& '{exe}' --config \\\"{cfg}\\\" --dbpath \\\"{db_dir}\\\"")
# O mejor:
ps_cmds.append(f"$exe = '{exe}'; $cfg = '{cfg}'; $dbdir = '{db_dir}'; & $exe --config $cfg --dbpath $dbdir")
```

---

### 3. **macOS: Búsqueda de `/opt/homebrew/bin/mongod` no funciona en Intel Macs**
**Ubicación**: Línea ~1449  
**Error**: El código asume arquitectura Apple Silicon (`/opt/homebrew`).

**Actual (INCOMPLETO)**:
```python
homebrew_paths = [
    '/usr/local/bin/mongod',      # Intel Macs
    '/opt/homebrew/bin/mongod',   # Apple Silicon
    ...
]
```

**Problema**: El orden está al revés. En Intel Macs la ruta es `/usr/local` (se verifica primero OK), pero falta `/opt/local` (MacPorts).

**Solución**: Reordenar y añadir más rutas:
```python
homebrew_paths = [
    # Intel + M1/M2/M3 (orden correcto)
    '/opt/homebrew/bin/mongod',       # M1/M2/M3 Macs (Homebrew)
    '/usr/local/bin/mongod',           # Intel Macs (Homebrew)
    '/opt/local/bin/mongod',           # MacPorts
    '/usr/local/mongodb/bin/mongod',   # Instalación manual
    Path.home() / 'mongodb' / 'bin' / 'mongod',
]
```

---

### 4. **Unix/macOS: `pgrep` puede no estar en algunos sistemas**
**Ubicación**: Línea ~711  
**Error**: El código asume `pgrep` está disponible.

```python
result = subprocess.run(
    ['pgrep', '-f', 'mongod'],
    capture_output=True,
    text=True,
    timeout=5
)
return result.returncode == 0
```

**Problema**: `pgrep` no está garantizado en todos los sistemas Unix.

**Solución**: Tener fallback a `ps`:
```python
def _is_mongod_process_running(self):
    """Verifica si hay un proceso mongod ejecutándose en Unix."""
    try:
        result = subprocess.run(
            ['pgrep', '-f', 'mongod'],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            return True
    except FileNotFoundError:
        pass
    
    # Fallback a ps
    try:
        result = subprocess.run(
            ['ps', 'aux'],
            capture_output=True,
            text=True,
            timeout=5
        )
        return 'mongod' in (result.stdout or '')
    except Exception:
        return False
```

---

### 5. **Windows: Falta manejo de rutas con espacios en `_find_mongod_from_registry()`**
**Ubicación**: Línea ~1541  
**Error**: Las rutas obtenidas del registro puede tener espacios.

**Actual**:
```python
candidate = Path(install_path) / subdir / 'mongod.exe'
if candidate.exists():
    return str(candidate)
```

**Problema**: El path puede contener espacios pero el código no verifica si existe el path primero.

---

### 6. **Windows: `creationflags=subprocess.CREATE_NEW_CONSOLE` no siempre funciona**
**Ubicación**: Múltiples lugares (~455, ~481, ~1127, etc.)  
**Error**: En sistemas virtualizados o integrados, CREATE_NEW_CONSOLE puede fallar.

**Solución**: Manejar la excepción:
```python
try:
    self.mongo_process = subprocess.Popen(
        cmd,
        cwd=str(self.project_dir),
        shell=shell_flag,
        creationflags=subprocess.CREATE_NEW_CONSOLE if sys.platform == 'win32' else 0
    )
except (OSError, WindowsError):
    # Fallback sin nueva consola
    self.mongo_process = subprocess.Popen(
        cmd,
        cwd=str(self.project_dir),
        shell=shell_flag
    )
```

---

## ⚠️ PROBLEMAS MODERADOS

### 7. **macOS: No se verifica Tcl/Tk hasta que Tkinter se importa**
**Ubicación**: Final del archivo en `main()`  
**Mejora**: El chequeo de Tcl/Tk 8.6 es correcto pero ocurre muy tarde.

---

### 8. **No hay limpieza de procesos si el usuario interrupte durante `_start_all_thread`**
**Ubicación**: Línea ~410  
**Problema**: Si el usuario cierra la app durante el startup, los procesos quedan en background.

**Solución**: Mejorar el manejo con atexit:
```python
import atexit

def __init__(self):
    ...
    atexit.register(self._cleanup_processes)
```

---

### 9. **Windows: `net start MongoDB` puede pedir permisos de administrador**
**Ubicación**: Línea ~1337  
**Problema**: El comando falla silenciosamente sin mostrar al usuario que necesita permisos elevados.

---

## ✅ LO QUE FUNCIONA BIEN

1. ✓ Detección multi-plataforma con `sys.platform`
2. ✓ Búsqueda exhaustiva de MongoDB con múltiples fallbacks
3. ✓ Validación de puertos antes de iniciar
4. ✓ Espera activa con reintentos exponenciales
5. ✓ Configuración de variables de entorno por modo (local/LAN)
6. ✓ Interfaz Tkinter nativa (sin dependencias externas complicadas)
7. ✓ Logs amigables con diagnósticos útiles

---

## 📋 TAREAS RECOMENDADAS

| # | Tarea | Prioridad | Dificultad |
|---|-------|-----------|-----------|
| 1 | Corregir `_kill_port()` para Windows sin `npx` | CRÍTICA | 🟡 Baja |
| 2 | Mejorar escaping de PowerShell en `_launch_mongod_in_terminal()` | ALTA | 🟠 Media |
| 3 | Expandir búsqueda de MongoDB en macOS (Intel/Apple Silicon) | ALTA | 🟡 Baja |
| 4 | Agregar fallback a `ps` si `pgrep` no disponible | MEDIA | 🟡 Baja |
| 5 | Manejar excepción en `creationflags=CREATE_NEW_CONSOLE` | MEDIA | 🟡 Baja |
| 6 | Mejorar detección de permisos en Windows | MEDIA | 🟠 Media |

---

## 🧪 TESTING RECOMENDADO

### Windows:
- [ ] Probar con `npx` no instalado
- [ ] Probar con rutas que contienen espacios
- [ ] Probar startup de MongoDB con y sin servicio instalado
- [ ] Probar con puertos ocupados
- [ ] Probar modo LAN con firewall

### macOS:
- [ ] Probar en Intel Mac (con `/usr/local/bin/mongod`)
- [ ] Probar en Apple Silicon Mac (con `/opt/homebrew/bin/mongod`)
- [ ] Probar sin Homebrew instalado
- [ ] Probar con MongoDB instalado vía otros métodos
- [ ] Verificar Tcl/Tk 8.6+ requerida

### Cross-platform:
- [ ] Probar con Node.js no en PATH
- [ ] Probar con puerto 5002 ocupado
- [ ] Probar con MongoDB no disponible
- [ ] Probar cierre de ventana durante startup

