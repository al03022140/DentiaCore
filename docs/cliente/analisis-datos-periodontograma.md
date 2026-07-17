# Análisis Completo del Flujo de Datos del Periodontograma

## 1. Estructura General de Caras Dentales

### Clasificación por Posición
- **Dientes Superiores (11-18, 21-28):**
  - vestibularSuperior: Cara hacia los labios/mejillas en maxilar superior
  - palatinoSuperior: Cara hacia el paladar en maxilar superior

- **Dientes Inferiores (31-38, 41-48):**
  - vestibularInferior: Cara hacia los labios/mejillas en maxilar inferior
  - lingualInferior: Cara hacia la lengua en maxilar inferior

### Mapeo Backend vs Frontend
- **Backend (UniversalToothValidator):** Estructura normalizada con 2 objetos principales
  - `vestibular`: Arrays de 3 elementos [mesial, central, distal]
  - `palatino`: Arrays de 3 elementos [mesial, central, distal]

- **Frontend (PeriodontogramDesign):** Estructura de 4 caras específicas
  - `vestibularSuperior`: [mesial, central, distal]
  - `palatinoSuperior`: [mesial, central, distal]
  - `vestibularInferior`: [mesial, central, distal]
  - `lingualInferior`: [mesial, central, distal]

## 2. Campos de Datos por Diente

### Campos de Checkboxes Multi-Estado (0-3)
**Implementados con BleedingMultiStateCheckbox:**

#### 2.1 Sangrado (bleeding/sangrado)
- **Frontend:** Campo `bleeding` con estructura de 4 caras
- **Backend:** Campo `sangrado` en objetos vestibular/palatino
- **Valores:** 0=Sin sangrado, 1=Sangrado leve, 2=Sangrado moderado, 3=Sangrado severo
- **Mapeo:**
  - Dientes superiores: vestibularSuperior → vestibular, palatinoSuperior → palatino
  - Dientes inferiores: vestibularInferior → vestibular, lingualInferior → palatino

#### 2.2 Supuración (suppuration/supuracion)
- **Frontend:** Campo `suppuration` con estructura de 4 caras
- **Backend:** Campo `supuracion` en objetos vestibular/palatino
- **Valores:** 0=Sin supuración, 1=Supuración leve, 2=Supuración moderada, 3=Supuración severa
- **Mapeo:** Igual que sangrado

#### 2.3 Placa (plaque/placa)
- **Frontend:** Campo `plaque` con estructura de 4 caras
- **Backend:** Campo `placa` en objetos vestibular/palatino
- **Valores:** 0=Sin placa, 1=Placa ligera, 2=Placa moderada, 3=Placa abundante
- **Mapeo:** Igual que sangrado

### Campos de Medición Numérica

#### 2.4 Profundidad de Sondaje (probingDepth/profundidadSondaje)
- **Frontend:** Campo `probingDepth` con estructura de 4 caras
- **Backend:** Campo `profundidadSondaje` en objetos vestibular/palatino
- **Formato:** Arrays de 3 elementos numéricos [mesial, central, distal]
- **Unidad:** Milímetros
- **Rango:** 0-15mm (según MEASUREMENT_LIMITS)
- **Valor por defecto:** [2, 2, 2]

#### 2.5 Margen Gingival (gingivalMargin/margenGingival)
- **Frontend:** Campo `gingivalMargin` con estructura de 4 caras
- **Backend:** Campo `margenGingival` en objetos vestibular/palatino
- **Formato:** Arrays de 3 elementos numéricos [mesial, central, distal]
- **Unidad:** Milímetros
- **Valor por defecto:** [0, 0, 0]

#### 2.6 Anchura de Encía (gumWidth/anchuraEncia)
- **Frontend:** Campo `gumWidth` con estructura de 4 caras
- **Backend:** Campo `anchuraEncia` en objetos vestibular/palatino
- **Formato:** Arrays de 3 elementos numéricos [mesial, central, distal]
- **Unidad:** Milímetros
- **Valor por defecto:** [3, 3, 3]

### Campos Únicos por Diente

#### 2.7 Estado de Ausencia (absent/ausente)
- **Frontend:** Campo booleano `absent`
- **Backend:** Campo numérico `ausente` (0=presente, 1=ausente)
- **Transformación:** boolean → número en transformToBackend()

#### 2.8 Movilidad (mobility)
- **Tipo:** Select numérico
- **Rango:** 0-3 según MEASUREMENT_LIMITS.movilidad
- **Valores:** 0=Sin movilidad, 1=Leve, 2=Moderada, 3=Severa

#### 2.9 Pronóstico (prognosis)
- **Tipo:** Select string
- **Opciones:** Según FIELD_OPTIONS.prognosis

#### 2.10 Furca
- **Estructura:** Objeto con propiedades vestibular, lingual, mesial
- **Valores:** Numéricos según MEASUREMENT_LIMITS.furca

## 3. Problema Crítico Identificado

### 3.1 Inconsistencia en el Guardado de Checkboxes
**Ubicación del problema:** Línea 244-259 en updateToothData() (PeriodontogramDesign)

#### Estado actual:
```javascript
// Para bleeding, suppuration y plaque con nueva estructura de 4 caras específicas
if (['bleeding', 'suppuration', 'plaque'].includes(field) && typeof value === 'object' && value !== null) {
  // Si el valor ya es un objeto con la estructura de 4 caras, usarlo directamente
  finalValue = value;
}
```

#### Problema detectado:
- Los checkboxes emiten valores simples (0-3) desde BleedingMultiStateCheckbox
- updateToothData espera objetos con estructura de 4 caras
- No existe código que convierta valores simples a estructura de caras
- Causa: Los datos de checkboxes no se procesan correctamente antes del guardado

### 3.2 Flujo de Datos Correcto
1. **BleedingMultiStateCheckbox** emite nextValue (0-3)
2. **updateToothData** debe determinar la cara específica según:
   - Número de diente (superior/inferior)
   - Posición en la interfaz (vestibular/palatino-lingual)
   - Índice dentro del array [mesial, central, distal]
3. **transformToBackend** convierte estructura de 4 caras a vestibular/palatino

## 4. Transformación de Datos

### 4.1 Frontend → Backend (transformToBackend)
**Ubicación:** UniversalToothValidator.js líneas 244-323

```javascript
// Mapeo de campos de 4-caras del frontend a vestibular/palatino del backend
const fourFaceFields = {
  bleeding: 'sangrado',
  suppuration: 'supuracion', 
  plaque: 'placa',
  probingDepth: 'profundidadSondaje',
  gingivalMargin: 'margenGingival',
  gumWidth: 'anchuraEncia'
};

// Lógica de mapeo:
if (isUpperTooth) {
  // Dientes superiores: usar vestibularSuperior y palatinoSuperior
  backendData.vestibular[backendKey] = vestibularSuperior.slice(0, 3);
  backendData.palatino[backendKey] = palatinoSuperior.slice(0, 3);
} else {
  // Dientes inferiores: usar vestibularInferior y lingualInferior
  backendData.vestibular[backendKey] = vestibularInferior.slice(0, 3);
  backendData.palatino[backendKey] = lingualInferior.slice(0, 3);
}
```

### 4.2 Backend → Frontend (transformToFrontend)
**Ubicación:** UniversalToothValidator.js líneas 381-445

Proceso inverso que reconstruye estructura de 4 caras desde vestibular/palatino.

## 5. Esquema de Datos Unificado (UNIFIED_TOOTH_SCHEMA)

### 5.1 Estructura Backend
**Ubicación:** UniversalToothValidator.js líneas 1284-1391

```javascript
vestibular: {
  properties: {
    placa: { type: 'array', length: 3, elementType: 'number', min: 0, max: 3, default: [0, 0, 0] },
    sangrado: { type: 'array', length: 3, elementType: 'number', min: 0, max: 3, default: [0, 0, 0] },
    supuracion: { type: 'array', length: 3, elementType: 'number', min: 0, max: 3, default: [0, 0, 0] },
    anchuraEncia: { type: 'array', length: 3, elementType: 'number', min: 0, default: [3, 3, 3] },
    margenGingival: { type: 'array', length: 3, elementType: 'number', default: [0, 0, 0] },
    profundidadSondaje: { type: 'array', length: 3, elementType: 'number', min: -9, max: 15, default: [2, 2, 2] }
  }
},
palatino: {
  // Estructura idéntica a vestibular
}
```

## 6. Componentes Involucrados en el Flujo

### 6.1 PeriodontogramSection (Controlador Principal)
**Archivo:** patient-detail/components/periodontogram-section.jsx
- **handleSave()** (línea 308): Orquesta el guardado completo
- **immediateToothUpdate()** (línea 110): Callback que recibe cambios del diseño
- **transformToBackend** aplicado antes de guardar (línea 325-330)

### 6.2 PeriodontogramDesign (Interfaz de Usuario)
**Archivo:** periodontogram/periodontogram-design.jsx
- **updateToothData()** (línea 162): Maneja actualizaciones de campos
- **Renderiza BleedingMultiStateCheckbox** para campos de checkbox

### 6.3 BleedingMultiStateCheckbox (Componente de Checkbox)
**Archivo:** periodontogram/components/bleeding-multi-state-checkbox.jsx
- **Estados:** 0, 1, 2, 3 (cuatro estados visuales)
- **onChange:** Emite nextValue cuando se hace clic

## 7. Recomendaciones para Solución

### 7.1 Corrección Inmediata Requerida
**En updateToothData (PeriodontogramDesign.jsx línea ~250):**

```javascript
// AGREGAR LÓGICA FALTANTE para checkboxes simples
else if (['bleeding', 'suppuration', 'plaque'].includes(field) && typeof value === 'number') {
  // Determinar cara específica según posición del diente y contexto UI
  const isUpperTooth = parseInt(toothNumber) >= 11 && parseInt(toothNumber) <= 28;
  const faceKey = determineFaceKey(toothNumber, side, isUpperTooth);
  
  // Crear estructura de 4 caras con el valor en la posición correcta
  const fieldData = currentData[field] || {};
  const updatedField = { ...fieldData };
  if (!updatedField[faceKey]) updatedField[faceKey] = [0, 0, 0];
  updatedField[faceKey][index] = value;
  finalValue = updatedField;
}
```

### 7.2 Validación del Flujo Completo
1. Verificar que BleedingMultiStateCheckbox pase correctamente `side` e `index`
2. Asegurar que updateToothData reciba todos los parámetros necesarios
3. Confirmar que transformToBackend funciona con la estructura corregida
4. Probar guardado y carga de datos desde el backend

## 8. Conclusión

El problema principal radica en que los checkboxes multi-estado no están mapeando correctamente sus valores a la estructura de 4 caras requerida por el sistema. La implementación actual asume que llegan objetos completos cuando en realidad llegan valores simples que deben ser procesados y posicionados en la estructura correcta según el diente y la cara específica.





// Primer intento 
Qué hice y por qué

En el componente de diseño, añadí una rama de compatibilidad en la función de actualización de diente que convierte valores simples (0‑3 o booleanos) de bleeding/suppuration/plaque en la estructura de 4 caras antes de propagar el cambio. Esto resuelve el desajuste detectado: algunos orígenes de eventos envían valores simples, pero el flujo de guardado espera un objeto con las 4 caras y arrays de 3 elementos por cara.
La cara se determina por diente superior/inferior y el parámetro side, y se actualiza el índice correcto [mesial, central, distal] respetando la convención vestibularInferior: [mesial, central, distal] que indicaste.
Normalizo los valores así: bleeding acepta 0‑3; suppuration/plaque se normalizan a 0/1. No dupliqué lógica: si ya llega el objeto de 4 caras, lo uso directamente; si llega array o valores antiguos para otras mediciones, se sigue el flujo existente.
Referencias de código

Archivo modificado: periodontogram-design.jsx
Función ajustada: updateToothData
Impacto y seguridad del cambio

No hay cambios visuales ni de UI.
No rompe flujos existentes: solo actúa cuando bleeding/suppuration/plaque llegan como valor simple junto con side e index. Si llega la estructura completa de 4 caras (como ya hace BleedingMultiStateCheckbox y el manejo de suppuration/plaque en el render actual), se usa sin tocar.
Se mantiene alineado con transformToBackend/transformToFrontend y con la convención de 3 elementos por cara.
Siguientes pasos sugeridos (sin ejecutar aún)

Probar manualmente un diente superior e inferior, cambiando:
bleeding con el componente existente (debe seguir funcionando al enviar el objeto con 4 caras).
suppuration y plaque en ambas caras para verificar que persisten correctamente con la nueva rama de compatibilidad cuando se envíen valores simples.
Verificar que el payload que llega a la capa de guardado, previo a transformToBackend, tiene para cada campo multi‑estado un objeto con:
superior: vestibularSuperior/palatinoSuperior
inferior: vestibularInferior/lingualInferior
y arrays [mesial, central, distal] en cada cara.
Confirmar que la validación de rangos sigue pasando para gingivalMargin/probingDepth (no modifiqué ese flujo).
¿Quieres que ejecute pruebas rápidas en los campos bleeding/suppuration/plaque para un par de dientes (uno superior, uno inferior) y te reporte el estado del objeto previo al guardado?