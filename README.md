**Descripción General del Proyecto**

Este repositorio contiene la aplicación DENT, una plataforma destinada a la gestión y registro de odontogramas, pacientes y datos clínicos relacionados con prácticas odontológicas. Provee herramientas para capturar, almacenar y visualizar información dental (odontogramas clínicos y radiográficos, antecedentes, tratamientos, etc.).

**Qué problema resuelve**

- Centraliza el historial dental de pacientes.
- Normaliza y preserva datos de odontogramas para su consulta y auditoría.
- Facilita el registro estructurado de daños, tratamientos y fechas.

**Para quién está diseñado**

- Clínicas y consultorios dentales.
- Equipos de desarrollo y operaciones que mantendrán la aplicación.
- Administradores y personal técnico que requieren exportar o migrar datos.

**Objetivo principal del proyecto**

Construir una aplicación fiable y mantenible que permita a profesionales dentales registrar, consultar y gestionar odontogramas y datos asociados de pacientes.

**Tipo de proyecto**

- Proyecto de software médico/administrativo con componentes web y backend.

**Tipo de aplicación**

- Fullstack web: interfaz de cliente (front-end) + servidor (back-end) + persistencia (base de datos).

**Enfoque general**

- Producto orientado a práctica clínica (no solo un prototipo). Puede tratarse como MVP si se despliega con funcionalidades core.

**Tecnologías utilizadas**

**Lenguajes de programación**

- JavaScript (Node.js) y Python (scripts auxiliares en raíz).

**Frameworks y librerías**

- Cliente: Vite + bibliotecas JavaScript modernas (ver `Client/package.json`).
- Servidor: Node.js con scripts de servidor en `Server` (ver `Server/package.json`).

**Base de datos**

- Parece usar MongoDB (archivos de base de datos en `DB/` y scripts en `scripts/`), con almacenamiento local en la carpeta `DB/` (WiredTiger). Para despliegue se recomienda una instancia gestionada de MongoDB.

**Servicios externos o APIs**

- Integraciones externas no documentadas explícitamente en este repositorio. Revisar el código en `Server/` para llamadas a APIs externas.

**Herramientas de desarrollo (build tools, linters, etc.)**

- Vite para el cliente (desarrollo rápido y empaquetado).
- nodemon o herramientas similares para desarrollo de servidor (consultar `Server/package.json`).
- Tests y configuración en `Client/jest.config.js`.

**Arquitectura y estructura del proyecto**

**Estructura de carpetas (resumen)**

- `Client/` : Código del cliente (interfaz web), configuración de Vite, pruebas y assets públicos.
- `Server/` : Código del servidor (API, controladores, modelos), configuración y scripts para ejecución en producción/desarrollo.
- `DB/` : Archivos de base de datos (WiredTiger) y datos locales.
- `scripts/` o `Server/scripts/` : Utilidades para gestionar la base de datos (ej. `start-mongo.ps1`, `mongo-utils.ps1`).
- Archivos en raíz: instaladores, scripts auxiliares (`launcher.py`, `install.ps1`, `EJECUTAR_INSTALADOR- 1.bat`, `delete-all-patients.js`).

**Responsabilidad de cada carpeta o módulo**

- `Client/` : Interacción con el usuario, formularios, renderizado de odontogramas, envío de eventos como `handleSaveOdontograma`.
- `Server/` : API REST/GraphQL (según implementación), lógica de negocio, modelos y persistencia.
- `DB/` : Persistencia local (uso principal para desarrollo o despliegues on-premise).

**Flujo general de la aplicación**

1. El usuario en la interfaz (`Client/`) interactúa con formularios o un editor de odontograma.
2. El cliente normaliza los datos (por ejemplo, asegurando que el campo `tipo` tenga un valor válido) y emite eventos o llamadas API.
3. El `Server` recibe solicitudes, valida y persiste en la base de datos (MongoDB).
4. El cliente consulta la API para obtener estados actualizados y renderiza tablas/informes.

**Tipografía y diseño (si aplica)**

**Tipografías utilizadas**

- No hay tipografías especificadas explícitamente en el repositorio. Revisar `Client/index.html` o hojas de estilo en `Client/src` para confirmación.

**Lineamientos de diseño o sistema visual**

- No hay un design system formal incluido. Recomendada la definición de variables CSS (colores, tamaños, espaciados) y componentes reutilizables para consistencia.

**Principios de UI/UX considerados**

- Claridad y consistencia en la visualización de odontogramas.
- Mostrar valores por defecto legibles (p. ej. `"Daño aplicado"` cuando un tipo falta).
- Minimizar la pérdida de datos al normalizar formatos de entrada.

**Estado actual del proyecto**

**Funcionalidades implementadas (observadas en el repositorio)**

- Estructura cliente/servidor presente.
- Scripts de base de datos y archivos de datos en `DB/`.
- Manejadores en el cliente para guardar odontogramas (ejemplo en `tipoValueFix.txt`).

**Partes en desarrollo**

- Integración final entre correcciones locales (como el fragmento en `tipoValueFix.txt`) y el código fuente principal.

**Pendiente o planeado a futuro**

- Formalizar despliegue en entorno cloud (MongoDB Atlas, hosting del servidor).
- Añadir pruebas end-to-end y CI/CD.
- Definir y aplicar un design system y guías de accesibilidad.

**Cómo se está trabajando actualmente**

**Metodología**

- No hay un `README` previo con metodología; se recomienda adoptar Agile (sprints cortos) o Kanban para iteraciones.

**Flujo de trabajo**

- Desarrollo local en ramas feature/bugfix → PR → revisión → merge a main.

**Convenciones de código**

- Seguir ESLint / Prettier si están configurados. Si no existen, recomendar añadirlos y un `pre-commit` hook.

**Cómo se hacen los cambios o despliegues**

- Cambios: crear ramas y PRs con descripción clara de cambios y revisiones.
- Despliegues: revisar `Server/ecosystem.config.cjs` para configuración de PM2 o despliegue; adaptar a su proveedor.

**Instrucciones básicas para correr el proyecto**

**Requisitos previos**

- Node.js (v16+ recomendado).
- npm o yarn.
- MongoDB (local) o acceso a una instancia remota (ej. MongoDB Atlas).

**Pasos para instalación (local)**

1. Clonar el repositorio.
2. Abrir una terminal y en la raíz:

```powershell
cd "d:\DENT -1.1"
npm install
```

3. Instalar dependencias del cliente:

```powershell
cd Client
npm install
```

4. Instalar dependencias del servidor:

```powershell
cd ..\Server
npm install
```

5. Levantar una instancia de MongoDB local o configurar `MONGO_URI` hacia su instancia.

**Comandos principales (ejemplos)**

- En desarrollo (cliente):

```powershell
cd Client
npm run dev
```

- En desarrollo (servidor):

```powershell
cd Server
npm run dev          # o npm start según scripts disponibles
```

- Comando raíz (si existe):

```powershell
npm run start        # revisar package.json en la raíz
```

**Notas adicionales**

- Antes de ejecutar, revisar `Client/package.json` y `Server/package.json` para conocer scripts exactos (`dev`, `start`, `build`).
- Los instaladores en la raíz (`install.ps1`, `EJECUTAR_INSTALADOR- 1.bat`, `launcher.py`) son utilitarios — revisar su contenido antes de ejecutar.

**Decisiones importantes de arquitectura**

- Uso de MongoDB con almacenamiento local (WiredTiger) sugiere diseño pensado para datos no relacionales y flexibilidad de esquemas.
- Separación cliente/servidor facilita despliegue independiente y escalado.

**Limitaciones conocidas**

- Datos de `DB/` en el repositorio no son aptos para producción; constituyen un snapshot local.
- Falta de documentación central previa; este `README.md` actúa como primer artefacto.

**Ideas futuras o mejoras planeadas**

- Implementar CI/CD (GitHub Actions) con pruebas automáticas.
- Externalizar base de datos (MongoDB Atlas) y añadir backups automatizados.
- Añadir panel administrativo, roles y permisos.
- Mejora del sistema de normalización de daños y mapeos (`mapDamageIdToName`).

---

Si quieres, puedo:

- Integrar el fragmento de corrección (`tipoValueFix.txt`) directamente en el archivo fuente correspondiente dentro de `Client/src`.
- Buscar todas las referencias a `handleSaveOdontograma` y proponer un parche.
- Añadir scripts `npm` útiles al `package.json` raíz para facilitar arranque de todo el stack.

Indica cuál de estas acciones prefieres y la realizo a continuación.
