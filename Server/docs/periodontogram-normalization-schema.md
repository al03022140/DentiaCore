# Normalización del Esquema de Periodontograma - Opción 1 Mejorada

## Estructura de Datos Propuesta

### 1. Esquema Principal del Diente (dienteSchema)

```javascript
const dienteSchema = {
  // Identificación del diente
  numero: {
    type: Number,
    required: true,
    min: 11,
    max: 85 // Incluye dientes temporales
  },
  
  // Campo arcada para determinar superior/inferior
  arcada: {
    type: String,
    enum: ['superior', 'inferior'],
    required: true
  },
  
  // Estados del diente (contrato canónico)
  ausente: {
    type: Number,
    enum: [0, 1], // 0 = presente, 1 = ausente
    default: 0
  },
  
  implante: {
    type: Number,
    enum: [0, 1], // 0 = no implante, 1 = implante
    default: 0
  },
  
  pronostico: {
    type: String,
    enum: ['Bueno', 'Regular', 'Malo', 'Dudoso'],
    default: 'Bueno'
  },
  
  movilidad: {
    type: Number,
    min: 0,
    max: 3,
    default: 0
  },

  // Anchura de encía a nivel de diente
  anchuraEncia: {
    type: Number,
    min: -99,
    max: 99,
    default: 0
  },
  
  // Furca con soporte para doble furcación (estructura usada en Front)
  furca: {
    vestibular: {
      type: Number,
      min: 0,
      max: 3,
      default: 0
    },
    lingualPalatino: {
      type: Number,
      min: 0,
      max: 3,
      default: 0
    },
    doble: {
      furca1: { type: Number, min: 0, max: 3, default: 0 },
      furca2: { type: Number, min: 0, max: 3, default: 0 }
    }
  },
  
  // Caras del diente (contrato canónico de 4 caras, arrays [M, C, D])
  vestibularSuperior: { type: caraSchema, required: true },
  palatinoSuperior: { type: caraSchema, required: true },
  vestibularInferior: { type: caraSchema, required: true },
  lingualInferior: { type: caraSchema, required: true }
};
```

### 2. Esquema de Cara (caraSchema)

```javascript
const caraSchema = {
  // Indicadores binarios/multivalor (arrays de 3: [M, C, D])
  sangrado: {
    type: [Number],
    validate: {
      validator: function(arr) {
        return arr.length === 3 && arr.every(val => [0, 1, 2].includes(val));
      },
      message: 'Sangrado debe ser array de 3 elementos con valores 0, 1, 2'
    },
    default: [0, 0, 0]
  },
  
  supuracion: {
    type: [Number],
    validate: {
      validator: function(arr) {
        return arr.length === 3 && arr.every(val => [0, 1].includes(val));
      },
      message: 'Supuración debe ser array de 3 elementos con valores 0, 1'
    },
    default: [0, 0, 0]
  },
  
  placa: {
    type: [Number],
    validate: {
      validator: function(arr) {
        return arr.length === 3 && arr.every(val => [0, 1].includes(val));
      },
      message: 'Placa debe ser array de 3 elementos con valores 0, 1'
    },
    default: [0, 0, 0]
  },
  
  // Mediciones clínicas por cara (3 valores por cara: M, C, D)
  margenGingival: {
    type: [Number],
    validate: {
      validator: function(arr) {
        return arr.length === 3 && arr.every(val => val >= -10 && val <= 10);
      },
      message: 'Margen gingival debe ser array de 3 elementos entre -10 y +10mm'
    },
    default: [0, 0, 0]
  },
  
  profundidadSondaje: {
    type: [Number],
    validate: {
      validator: function(arr) {
        return arr.length === 3 && arr.every(val => val >= 0 && val <= 15);
      },
      message: 'Profundidad sondaje debe ser array de 3 elementos entre 0-15mm'
    },
    default: [0, 0, 0]
  }
};
```

### 3. Configuración de Caras por Diente

```javascript
// Mapeo de las 3 posiciones por cara (M=0, C=1, D=2)
const FACE_POSITIONS = {
  vestibularSuperior: ['M', 'C', 'D'],
  palatinoSuperior: ['M', 'C', 'D'],
  vestibularInferior: ['M', 'C', 'D'],
  lingualInferior: ['M', 'C', 'D']
};

// Índices por posición clínica
const MEASUREMENT_STRUCTURE = {
  'M': 0,
  'C': 1,
  'D': 2
};
```

### 4. Función de Validación de Doble Furcación

```javascript
/**
 * Determina si un diente (superior) admite doble furcación
 * @param {number} toothNumber - Número del diente
 * @returns {boolean} - True si admite doble furcación
 */
function needsDoubleFurca(toothNumber) {
  // Molares superiores con doble furcación
  const doubleFurcaTeeth = [18, 17, 16, 14, 24, 26, 27, 28];
  return doubleFurcaTeeth.includes(toothNumber);
}

/**
 * Valida los datos de furca según el tipo de diente
 * @param {Object} furcaData - Datos de furca {vestibular, lingualPalatino, doble: {furca1, furca2}}
 * @param {number} toothNumber - Número del diente
 * @param {boolean} isMolar - Indica si el diente es molar
 * @returns {boolean} - True si es válido
 */
function validateFurcaData(furcaData, toothNumber, isMolar) {
  // Rango básico 0..3 para todos los campos
  const inRange = v => Number.isInteger(v) && v >= 0 && v <= 3;
  if (!inRange(furcaData.vestibular) || !inRange(furcaData.lingualPalatino)) return false;
  if (!inRange(furcaData.doble.furca1) || !inRange(furcaData.doble.furca2)) return false;

  // Solo molares pueden tener valores > 0
  if (!isMolar) {
    return furcaData.vestibular === 0 && furcaData.lingualPalatino === 0 &&
           furcaData.doble.furca1 === 0 && furcaData.doble.furca2 === 0;
  }

  // Solo estos molares superiores pueden tener doble furca > 0
  if (!needsDoubleFurca(toothNumber)) {
    return furcaData.doble.furca1 === 0 && furcaData.doble.furca2 === 0;
  }

  return true;
}
```

### 5. Política de Transformación y Contrato Backend (4 Caras)

- El Backend ACEPTA y valida un payload CANÓNICO de 4 caras por diente: `vestibularSuperior`, `palatinoSuperior`, `vestibularInferior`, `lingualInferior`.
- Cada cara debe incluir exclusivamente los campos: `sangrado`, `supuracion`, `placa`, `margenGingival`, `profundidadSondaje`, cada uno como un array de 3 números (M, C, D) dentro de los rangos establecidos.
- Claves permitidas por diente: `numero`, `arcada`, `ausente`, `implante`, `pronostico`, `movilidad`, `anchuraEncia`, `furca.vestibular`, `furca.lingualPalatino`, `furca.doble.furca1`, `furca.doble.furca2`, `vestibularSuperior`, `palatinoSuperior`, `vestibularInferior`, `lingualInferior`.
- `additionalProperties` no permitidas fuera del esquema definido; el Backend rechazará claves no reconocidas.
- Doble furca: la validación/visualización (p. ej., `needsDoubleFurca`) NO modifica el payload; cuando no aplique, los campos irrelevantes deben ser 0.

Mapeo interno 4→2 (si la capa de persistencia usa 2 caras):
- Dientes superiores:
  - `vestibularSuperior` → `vestibular`
  - `palatinoSuperior` → `palatino` (alias de `lingualPalatino`)
- Dientes inferiores:
  - `vestibularInferior` → `vestibular`
  - `lingualInferior` → `lingual` (alias de `lingualPalatino`)

Nota: este mapeo es interno al Server solo si el modelo de datos persistido sigue siendo de 2 caras. El contrato de ENTRADA y RESPUESTA del Backend es 4-caras.

```javascript
// ADVERTENCIA: SOLO FRONT/MIGRACIONES — NO USAR EN SERVER PARA ENTRADA 4-CARAS
function ensureArray3(value) {
  if (Array.isArray(value) && value.length === 3) return value;
  if (typeof value === 'number') return [value, value, value];
  return [0, 0, 0];
}
```

## Correspondencia Front ↔ Backend de Caras (Explícita)

- Backend (canónico) usa 4 caras: `vestibularSuperior`, `palatinoSuperior`, `vestibularInferior`, `lingualInferior`.
- Front usa 4 caras con nombres alineados por arcada: `vestibularSuperior`, `palatino` (para arcada superior), `vestibularInferior`, `lingual` (para arcada inferior).
- Mapeo de nombres Front → Backend:
  - `palatino` (Front) → `palatinoSuperior` (Backend)
  - `lingual` (Front) → `lingualInferior` (Backend)
- Cada cara contiene arrays de 3 (M, C, D) para: `sangrado` [0,1,2], `supuracion` [0,1], `placa` [0,1], `margenGingival` -10–10, `profundidadSondaje` 0–15.
- `anchuraEncia` es a nivel de diente ([-99, 99], default 0), NO por cara.
- Furca (por diente): claves `vestibular`, `lingualPalatino`, y `doble.{furca1, furca2}` con valores 0–3; la doble furcación solo aplica a molares superiores: 18, 17, 16, 14, 24, 26, 27, 28.

Ejemplo ACEPTADO (resumen 4-caras):
```json
{
  "numero": 16,
  "arcada": "superior",
  "ausente": 0,
  "implante": 0,
  "pronostico": "Bueno",
  "movilidad": 0,
  "anchuraEncia": 3,
  "furca": { "vestibular": 1, "lingualPalatino": 0, "doble": { "furca1": 2, "furca2": 0 } },
  "vestibularSuperior": { "sangrado": [0,0,0], "placa": [0,0,0], "supuracion": [0,0,0], "margenGingival": [0,0,0], "profundidadSondaje": [2,3,2] },
  "palatinoSuperior": { "sangrado": [0,0,0], "placa": [0,0,0], "supuracion": [0,0,0], "margenGingival": [0,0,0], "profundidadSondaje": [2,2,3] },
  "vestibularInferior": { "sangrado": [0,0,0], "placa": [0,0,0], "supuracion": [0,0,0], "margenGingival": [0,0,0], "profundidadSondaje": [1,2,2] },
  "lingualInferior": { "sangrado": [0,0,0], "placa": [0,0,0], "supuracion": [0,0,0], "margenGingival": [0,0,0], "profundidadSondaje": [2,2,1] }
}
```

Ejemplo RECHAZADO (claves no definidas o longitudes inválidas):
```json
{
  "numero": 16,
  "arcada": "superior",
  "furca": { "vestibular": 1, "lingualPalatino": 0, "doble": { "furca1": 0, "furca2": 0 } },
  "vestibularSuperior": { "sangrado": [0,0,0,0] }
}
```

## Ventajas de esta Normalización

### 1. Simplicidad y Claridad
- Contrato único de 4 caras compartido por Front y Back (con mapeo nominal Front→Back en dos caras)
- Estructura consistente para todas las mediciones
- Validaciones claras y específicas

### 2. Eficiencia de Almacenamiento
- No hay campos redundantes vacíos
- Estructura compacta pero completa
- Fácil indexación en MongoDB

### 3. Compatibilidad
- Mantiene compatibilidad con sistemas existentes mediante mapeo interno 4→2 (si aplica)
- Permite migración gradual
- Soporte completo para doble furcación

### 4. Escalabilidad
- Fácil agregar nuevos tipos de mediciones
- Estructura extensible para futuras funcionalidades
- Validaciones modulares y reutilizables

## Implementación Requerida

### Archivos a Modificar
- 1. `Server/models/periodontogram.js` - Actualizar esquema principal a 4 caras.
- 2. `Server/utils/periodontogramUtils.js` - Agregar/ajustar `needsDoubleFurca` y validadores auxiliares estrictamente necesarios.
- 3. `Server/validators/periodontogramValidator.js` - Validaciones del payload 4-caras (rechazo de additionalProperties y longitudes/rangos).

### Notas
- Si la base de datos o el modelo actual persisten 2 caras, implementar el mapeo interno 4→2 indicado en este documento dentro de la capa del Server (sin requerir cambios en el Front).
- Evitar utilidades de transformación duplicadas; centralizar validaciones en un único módulo de servidor.

## Soluciones a incongruencias (alineadas a PeriodontogramSection del Frontend)

1) Caras del diente y nomenclatura
- Solución: Contrato canónico Back: `vestibularSuperior`, `palatinoSuperior`, `vestibularInferior`, `lingualInferior`. Front usa: `vestibularSuperior`, `palatino` (superior), `vestibularInferior`, `lingual` (inferior). Mapeo explícito incluido.

2) Estructura y tipos por cara (mediciones M, C, D)
- Solución: Arrays de longitud 3 [M, C, D]. Campos por cara y rangos: sangrado [0,1,2], supuracion [0,1], placa [0,1], margenGingival -10–10, profundidadSondaje 0–15. `anchuraEncia` se define a nivel de diente ([-99, 99], default 0).

3) Estados del diente y metadatos
- Solución: Nombres y tipos canónicos: ausente (0/1), implante (0/1), pronostico ('Bueno' | 'Regular' | 'Malo' | 'Dudoso'), movilidad (0–3). Rechazar claves no definidas.

4) Furcación (simple y doble)
- Solución: Estructura `{ vestibular, lingualPalatino, doble: { furca1, furca2 } }` con valores 0–3. Doble furcación solo para molares superiores: 18, 17, 16, 14, 24, 26, 27, 28. En dientes sin aplicabilidad, los campos irrelevantes deben ser 0.

5) Identificación del diente y arcada
- Solución: Requerir numero (11–85) y arcada ('superior' | 'inferior') en todos los dientes. Evitar claves alternativas en el contrato.

6) Contrato Back/Front y transformación legacy
- Solución: El Backend acepta y devuelve siempre 4-caras. Si la base persiste 2-caras, el Server aplica mapeo interno 4↔2. Para datos antiguos: normalizar a 4-caras en lectura y validar 4-caras en escritura.

7) Defaults, validación y rechazo de additionalProperties
- Solución: Defaults explícitos (0 o [0,0,0]) y rechazo de propiedades fuera del esquema. Validar longitudes/rangos por campo y por cara. Centralizar validaciones para evitar duplicación.