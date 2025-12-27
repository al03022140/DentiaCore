Funcionamiento del Periodontograma (JSON-only)

Objetivo
- Todo el flujo guarda y consume exclusivamente datos clínicos estructurados (JSON). 
- Se eliminan dependencias de captura/almacenamiento/visualización de imágenes (no hay superior.png ni inferior.png, ni imageHistory).

Flujo funcional
1) Guardar
- El usuario pulsa "Guardar Periodontograma".
- Se construye un payload JSON con: teeth, statistics, versionName y metadatos técnicos necesarios.
- Se envía al backend para persistir.

2) Visualizar (solo lectura)
- El usuario puede alternar entre edición y visualización (sin introducir elementos de UI nuevos aquí, solo el comportamiento esperado).
- En visualización, se carga una versión específica o la última disponible y se rellenan los campos en modo readOnly.

Persistencia (estructura de carpetas)
- Base: uploads/pacientes/{patientId}/periodontograma/versiones/
- Cada versión se guarda en una carpeta con timestamp ISO compacto (p. ej. 20240604T184255Z)
- Contenido por versión:
  uploads/pacientes/{patientId}/periodontograma/versiones/{timestamp}/
    └─ periodontogram.json

Estructura general del JSON (periodontogram.json)
{
  "teeth": {
    "11": {
      "ausente": false,
      "implante": false,
      "pronostico": "Bueno",
      "movilidad": 0,
      "furca": 0,
      "vestibular": {
        "placa": 0,
        "sangrado": 0,
        "supuracion": 0,
        "anchuraEncia": 0,
        "margenGingival": 0,
        "profundidadSondaje": 0
      },
      "palatino": {
        "placa": 0,
        "sangrado": 0,
        "supuracion": 0,
        "anchuraEncia": 0,
        "margenGingival": 0,
        "profundidadSondaje": 0
      }
    }
    // ... resto de dientes
  },
  "statistics": {
    "plaquePercentage": 0,
    "bleedingPercentage": 0,
    "suppurationPercentage": 0,
    "averageProbingDepth": 0,
    "averageAttachmentLevel": 0,
    "lastCalculated": "ISODate"
  },
  "createdAt": "ISODate",
  "updatedAt": "ISODate",
  "versionName": "YYYYMMDDTHHmmssZ"
}

Notas y validaciones
- No se generan ni se guardan imágenes de la vista del periodontograma.
- Rango y presencia de campos deben validarse en frontend y backend antes de persistir.
- El nombre de archivo es siempre periodontogram.json por versión.
- La ruta y convenciones deben alinearse con Server/utils/periodontograma.js.

Requisitos de UI (resumen orientativo, sin cambios visuales aquí)
- Botón Guardar: envía JSON al backend.
- Alternar Edición/Visualización: en visualización los campos se muestran en readOnly.
- Selector de versiones: lista versiones disponibles y, al elegir una, carga el JSON correspondiente en modo readOnly.

Compatibilidad/migración
- Cualquier lógica de imágenes (captura, PNG, historial de imágenes) queda obsoleta y debe haber sido eliminada.
- Las comparaciones entre versiones se realizan a nivel de datos JSON (no imágenes).


