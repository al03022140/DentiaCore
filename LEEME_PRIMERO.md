# 👋 LEEME PRIMERO

> ¡DentiaCore ya está listo para Windows, macOS y Linux!

---

## 🚀 INSTALA EN 1 COMANDO

### 🪟 Windows
```batch
EJECUTAR_INSTALADOR-1.bat
```
Luego:
```batch
python launcher.py
```

### 🍎 macOS
```bash
bash setup-mac.sh
```
Luego:
```bash
open DentiaCore.app
```

### 🐧 Linux
```bash
bash setup-linux.sh
```
Luego:
```bash
python3 launcher.py
```

---

## 📚 DOCUMENTACIÓN RÁPIDA

| ¿Necesitas...? | Archivo |
|---|---|
| 🎯 Resumen general | **SETUP_INSTRUCTIONS.md** |
| 📋 Todas las opciones | INSTALLATION.md |
| 🍎 Solo macOS | MAC_SETUP.md |
| 🐧 Solo Linux | LINUX_SETUP.md |
| 🔧 Detalles técnicos | TECHNICAL_CHANGES.md |
| ✅ Qué se cambió | COMPLETION_SUMMARY.md |

---

## ⚡ PASOS RÁPIDOS

### Primer uso (macOS como ejemplo):

1. Abre Terminal
2. Copia/pega:
   ```bash
   bash ~/Downloads/DentiaCore/setup-mac.sh
   ```
3. Espera ~10 minutos
4. Haz doble-click en `DentiaCore.app`
5. ¡Listo! 🎉

### Después de instalar:

1. Se abrirá una ventana del launcher
2. Haz click en: `🚀 Iniciar Aplicación Completa`
3. Abre navegador en: `http://localhost:5002`
4. ¡A trabajar!

---

## ✨ ¿QUÉ CAMBIÓ?

**Ahora DentiaCore:**
- ✅ Se instala automáticamente en Windows, macOS, o Linux
- ✅ Funciona igual en las 3 plataformas
- ✅ Crea una aplicación nativa en macOS (DentiaCore.app)
- ✅ Detecta tu IP automáticamente
- ✅ Configura todo por ti

**Ya no necesitas:**
- ❌ Instalar cosas manualmente
- ❌ Editar archivos de configuración
- ❌ Memorizar comandos

---

## 🆘 PROBLEMAS?

Consulta el archivo apropiado:
- 🪟 Windows → README.md
- 🍎 macOS → MAC_SETUP.md
- 🐧 Linux → LINUX_SETUP.md
- 📋 General → INSTALLATION.md

O busca el error específico en:
**SETUP_INSTRUCTIONS.md** → Sección "Solución de Problemas"

---

## 📍 ARCHIVOS IMPORTANTES

Después de instalar encontrarás:

```
Tu carpeta DentiaCore/
├── DentiaCore.app        ← Ejecutable para macOS
├── DentiaCore           ← Ejecutable para Linux
├── launcher.py          ← O ejecutable universal
├── Server/              ← Backend
├── Client/              ← Frontend
└── DB/                  ← Base de datos
```

---

## 🌐 ACCESO A LA APLICACIÓN

Una vez iniciada, accede en:

```
http://localhost:5002
```

O (si está en LAN/RED):
```
http://[TU_IP]:5002
```

La IP se muestra en la ventana del launcher.

---

## 🎯 SIGUIENTE PASO RECOMENDADO

Después de instalar y que funcione:

1. Lee **SETUP_INSTRUCTIONS.md** completo
2. Crea usuario admin: `node create-admin.js`
3. Configura Google Auth si lo necesitas
4. Haz backup de la BD: `mongodump --db DentiaCore --out ~/backup`

---

## 💡 TIPS

### macOS
- Copia `DentiaCore.app` a `~/Applications`
- Búscalo en Spotlight: `Cmd+Espacio` → "DentiaCore"

### Linux
- Crea atajo en escritorio (ver LINUX_SETUP.md)
- O solo ejecuta: `python3 launcher.py`

### Windows
- Ya tiene acceso directo en Escritorio
- O menú Inicio

---

## 🔐 IMPORTANTE

- 🔓 Por defecto: solo tu máquina puede acceder
- 🌐 En modo LAN: otros en tu red pueden acceder
- 🔐 Para producción: usa HTTPS y contraseña fuerte

---

## 🆘 NECESITAS AYUDA?

1. Lee la documentación de tu plataforma
2. Verifica logs: `tail -f DB/logs/mongod.log`
3. Ejecuta: `node --version && npm --version && mongod --version`
4. Abre issue en GitHub con el error

---

## 📱 RESUMEN EN 1 TABLA

| Plataforma | Instalar | Ejecutar | Docs |
|:---:|:---|:---|:---|
| 🪟 Windows | `EJECUTAR_INSTALADOR-1.bat` | `python launcher.py` | README.md |
| 🍎 macOS | `bash setup-mac.sh` | `open DentiaCore.app` | MAC_SETUP.md |
| 🐧 Linux | `bash setup-linux.sh` | `python3 launcher.py` | LINUX_SETUP.md |

---

## ✅ VERIFICAR QUE FUNCIONA

Después de instalar, executa:
```bash
node --version  # Debe ser 14+
npm --version   # Debe ser 6+
mongod --version # Debe ser 4.4+
python3 launcher.py # Debe abrirse ventana
```

Si todos muestran versión → ¡Listo! ✅

---

## 🎉 ¡LISTO!

Ahora DentiaCore funciona en tu plataforma exactamente como en cualquier otra.

**Instala con un comando y úsalo igual.**

¿Dudas? Lee **SETUP_INSTRUCTIONS.md**

¿Problema específico? Consulta tu plataforma:
- 🪟 → README.md
- 🍎 → MAC_SETUP.md
- 🐧 → LINUX_SETUP.md

¡A trabajar! 🚀

---

**Última actualización:** Marzo 18, 2026
**Versión:** 2.0 Multi-Plataforma
**Status:** ✅ Listo para usar
