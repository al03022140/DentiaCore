const mongoose = require('mongoose');
const { PERIODONTOGRAM_CONFIG } = require('../config/periodontogram-config');
const { UniversalToothValidator } = require('../utils/UniversalToothValidator');

const FACE_KEYS = ['vestibularSuperior', 'palatinoSuperior', 'vestibularInferior', 'lingualInferior'];

function mapToPlainTeeth(teeth) {
  if (!teeth) return {};
  if (teeth instanceof Map) {
    return Object.fromEntries(teeth);
  }
  if (typeof teeth.toObject === 'function') {
    return teeth.toObject();
  }
  return teeth;
}

function computeCurrentStatistics(teeth) {
  const plainTeeth = mapToPlainTeeth(teeth) || {};
  const stats = UniversalToothValidator.calculateStatistics({ teeth: plainTeeth });

  let supuracionTotal = 0;
  let gingivalSum = 0;
  let gingivalCount = 0;

  Object.values(plainTeeth).forEach((tooth) => {
    if (!tooth || tooth.ausente || tooth.absent) {
      return;
    }

    FACE_KEYS.forEach((faceKey) => {
      const faceData = tooth[faceKey];
      if (!faceData || typeof faceData !== 'object') return;

      const supArr = faceData.supuracion || faceData.suppuration;
      if (Array.isArray(supArr)) {
        supArr.forEach((value) => {
          const numeric = Number(value);
          if (Number.isFinite(numeric) && numeric > 0) {
            supuracionTotal += 1;
          }
        });
      }

      const marginArr = faceData.margenGingival || faceData.gingivalMargin;
      if (Array.isArray(marginArr)) {
        marginArr.forEach((value) => {
          const numeric = Number(value);
          if (Number.isFinite(numeric)) {
            gingivalSum += numeric;
            gingivalCount += 1;
          }
        });
      }
    });
  });

  const averageGingivalMargin = gingivalCount > 0 ? gingivalSum / gingivalCount : 0;

  return {
    placaTotal: stats?.plaqueCount ?? 0,
    sangradoTotal: stats?.bleedingCount ?? 0,
    supuracionTotal,
    totalTeeth: stats?.totalTeeth ?? 32,
    presentTeeth: stats?.presentTeeth ?? 0,
    bleedingPercentage: stats?.bleedingPercentage ?? 0,
    plaquePercentage: stats?.plaquePercentage ?? 0,
    averageProbingDepth: stats?.averageProbingDepth ?? 0,
    averageGingivalMargin: Number.isFinite(averageGingivalMargin) ? averageGingivalMargin : 0
  };
}

// Esquema para datos clínicos por cara (formato 4-caras con arrays [M, C, D])
const caraSchema = new mongoose.Schema({
  sangrado: {
    type: [Number],
    validate: {
      validator: function(arr) {
        return arr.length === 3 && arr.every(val => [0, 1, 2, 3].includes(val));
      },
      message: 'Sangrado debe ser array de 3 elementos con valores 0, 1, 2, 3'
    },
    default: [0, 0, 0]
  },
  supuracion: {
    type: [Number],
    validate: {
      validator: function(arr) {
        return arr.length === 3 && arr.every(val => val === 0 || val === 1);
      },
      message: 'Supuración debe ser array de 3 elementos con valores 0 o 1'
    },
    default: [0, 0, 0]
  },
  placa: {
    type: [Number],
    validate: {
      validator: function(arr) {
        return arr.length === 3 && arr.every(val => val === 0 || val === 1);
      },
      message: 'Placa debe ser array de 3 elementos con valores 0 o 1'
    },
    default: [0, 0, 0]
  },
  margenGingival: {
    type: [Number],
    validate: {
      validator: function(arr) {
        return arr.length === 3 && arr.every(val => val >= -9 && val <= 9);
      },
      message: 'Margen gingival debe ser array de 3 elementos entre -9 y +9mm'
    },
    default: [0, 0, 0]
  },
  profundidadSondaje: {
    type: [Number],
    validate: {
      validator: function(arr) {
        return arr.length === 3 && arr.every(val => val >= -9 && val <= 9);
      },
      message: 'Profundidad sondaje debe ser array de 3 elementos entre -9 y +9mm'
    },
    default: [0, 0, 0]
  }
}, { _id: false, toJSON: { virtuals: true }, toObject: { virtuals: true } });



// Esquema para datos clínicos por diente según normalización 4-caras
const dienteSchema = new mongoose.Schema({
  numeroDiente: {
    type: Number,
    required: true
  },
  arcada: {
    type: String,
    enum: ['superior', 'inferior'],
    required: true
  },
  // Estado del diente: ausente (booleano). Alias 'absent' para compatibilidad.
  ausente: {
    type: Boolean,
    required: true,
    default: false,
    alias: 'absent'
  },
  // anchuraEncia por diente (rango -99 a 99 según especificación actualizada)
  anchuraEncia: {
    type: Number,
    min: -99,
    max: 99,
    default: 0
  },
  implante: {
    type: Boolean,
    default: false
  },
  movilidad: {
    type: Number,
    enum: [0, 1, 2, 3],
    default: 0
  },
  pronostico: {
    type: String,
    enum: ['Bueno', 'Regular', 'Malo', 'Dudoso'],
    default: 'Bueno'
  },
  // Furca: se mantiene estructura con soporte para doble furcación cuando aplique
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
      furca1: {
        type: Number,
        min: 0,
        max: 3,
        default: 0
      },
      furca2: {
        type: Number,
        min: 0,
        max: 3,
        default: 0
      }
    }
  },
  // Caras del diente en formato 4-caras (contrato canónico)
  vestibularSuperior: { type: caraSchema, required: true },
  palatinoSuperior: { type: caraSchema, required: true },
  vestibularInferior: { type: caraSchema, required: true },
  lingualInferior: { type: caraSchema, required: true }
}, { _id: false });

// Middleware de validación y normalización
dienteSchema.pre('validate', function(next) {
  try {
    const faceKeys = FACE_KEYS;

    if (this.ausente === true) {
      faceKeys.forEach((face) => {
        if (!this[face]) {
          this[face] = {};
        }
        this[face].sangrado = [0, 0, 0];
        this[face].supuracion = [0, 0, 0];
        this[face].placa = [0, 0, 0];
        this[face].margenGingival = [0, 0, 0];
        this[face].profundidadSondaje = [0, 0, 0];
      });
      this.implante = false;
      this.movilidad = 0;
      this.furca = {
        vestibular: 0,
        lingualPalatino: 0,
        doble: { furca1: 0, furca2: 0 }
      };
    }

    const toothNumber = Number(this.numeroDiente);
    const canHaveFurca = PERIODONTOGRAM_CONFIG.canHaveFurca(toothNumber);
    const needsDouble = PERIODONTOGRAM_CONFIG.needsDoubleFurca(toothNumber);

    if (!canHaveFurca) {
      this.furca = {
        vestibular: 0,
        lingualPalatino: 0,
        doble: { furca1: 0, furca2: 0 }
      };
    } else if (!needsDouble && this.furca && this.furca.doble) {
      this.furca.doble.furca1 = 0;
      this.furca.doble.furca2 = 0;
    }

    next();
  } catch (error) {
    next(error);
  }
});


// Esquema principal del periodontograma
const PeriodontogramSchema = new mongoose.Schema({
  // Referencia al paciente
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true,
    index: true,
    unique: true // Un periodontograma por paciente
  },
  // Cita en la que se generó/modificó el periodontograma (opcional, auditoría)
  appointmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Appointment',
    default: null,
    index: true
  },

  // Datos iniciales del periodontograma
  initial: {
    // Metadatos de la sesión
    metadata: {
      version: {
        type: String,
        default: '1.0.0'
      },
      createdAt: {
        type: Date,
        default: Date.now
      },
      createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Usuario'
      },
      lastModified: {
        type: Date,
        default: Date.now
      },
      modifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Usuario'
      }
    },
    
    // Datos clínicos por diente según análisis
    teeth: {
      type: Map,
      of: dienteSchema,
      default: () => new Map()
    },
    
    // Estadísticas globales calculadas
    statistics: {
      totalTeeth: {
        type: Number,
        default: 32
      },
      presentTeeth: {
        type: Number,
        default: 32
      },
      placaTotal: {
        type: Number,
        default: 0
      },
      sangradoTotal: {
        type: Number,
        default: 0
      },
      supuracionTotal: {
        type: Number,
        default: 0
      },
      bleedingPercentage: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
      },
      plaquePercentage: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
      },
      averageProbingDepth: {
        type: Number,
        default: 0
      },
      averageGingivalMargin: {
        type: Number,
        default: 0
      }
    }
  },
  
  // Estado del periodontograma
  status: {
    type: String,
    enum: ['draft', 'completed', 'reviewed', 'archived'],
    default: 'draft'
  },
  
  // Datos actuales del periodontograma según análisis
  current: {
    teeth: {
      type: Map,
      of: dienteSchema,
      required: true,
      default: () => new Map()
    },
    statistics: {
      placaTotal: {
        type: Number,
        default: 0
      },
      sangradoTotal: {
        type: Number,
        default: 0
      },
      supuracionTotal: {
        type: Number,
        default: 0
      },
      totalTeeth: {
        type: Number,
        default: 32
      },
      presentTeeth: {
        type: Number,
        default: 32
      },
      bleedingPercentage: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
      },
      plaquePercentage: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
      },
      averageProbingDepth: {
        type: Number,
        default: 0
      },
      averageGingivalMargin: {
        type: Number,
        default: 0
      }
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    updatedAt: {
      type: Date,
      default: Date.now
    },
    versionName: {
      type: String,
      required: true,
      default: 'Inicial'
    },
    needsStatisticsRecalc: {
      type: Boolean,
      default: false
    }
  },
  

  
  // Configuración de visualización
  displaySettings: {
    showStatistics: {
      type: Boolean,
      default: true
    },
    showBackground: {
      type: Boolean,
      default: true
    },
    zoomLevel: {
      type: Number,
      default: 1.0,
      min: 0.5,
      max: 2.0
    }
  },

  // ── Campos de auditoría y estado documental (roles.MD §5) ──────────
  estadoRegistro: {
    type: String,
    enum: ['BORRADOR', 'OFICIAL', 'ARCHIVADO'],
    default: 'OFICIAL'
  },
  creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
  modificadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
  modificadoEn: { type: Date, default: null },
  firmadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
  firmadoEn: { type: Date, default: null },
  contentHash: { type: String, default: null },
  firmaDesactualizada: { type: Boolean, default: false },
  integrityHash: { type: String, default: null },
  autorizadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
  deletedAt: { type: Date, default: null },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
  deleteReason: { type: String, default: null },
  capturaExtemporanea: {
    esExtemporanea: { type: Boolean, default: false },
    motivo: { type: String, default: null },
    fechaNota: { type: Date, default: null },
    fechaCaptura: { type: Date, default: null }
  }
}, {
  timestamps: true,
  collection: 'periodontograms',
  // Optimizaciones de rendimiento
  autoIndex: process.env.NODE_ENV !== 'production',
  bufferCommands: false,
  bufferMaxEntries: 0
});

// Índices para optimización de consultas
PeriodontogramSchema.index({ patient: 1, 'initial.metadata.createdAt': -1 });
PeriodontogramSchema.index({ status: 1 });
PeriodontogramSchema.index({ 'initial.metadata.createdBy': 1 });

// Middleware pre-save simplificado - solo actualiza metadatos
PeriodontogramSchema.pre('save', function(next) {
  try {
    // Actualizar lastModified
    if (this.initial && this.initial.metadata) {
      this.initial.metadata.lastModified = new Date();
    }
    if (this.current) {
      const now = new Date();
      this.current.updatedAt = now;

      if (this.current.teeth && !(this.current.teeth instanceof Map)) {
        const plain = mapToPlainTeeth(this.current.teeth);
        this.current.teeth = new Map(Object.entries(plain));
        this.markModified('current.teeth');
      }

      if (this.current.needsStatisticsRecalc) {
        const stats = computeCurrentStatistics(this.current.teeth);
        this.current.statistics = {
          ...this.current.statistics,
          ...stats
        };
        this.current.needsStatisticsRecalc = false;
        this.markModified('current.statistics');
      }
    }
    next();
  } catch (err) {
    next(err);
  }
});

// Fábrica simplificada para crear periodontograma inicial
PeriodontogramSchema.statics.createInitial = function(patientId, userId) {
  const _emptyData = UniversalToothValidator ? UniversalToothValidator.getDefaultToothData() : {};
  const emptyStatistics = computeCurrentStatistics(new Map());
  return this.create({
    patient: patientId,
    initial: {
      metadata: {
        version: '1.0.0',
        createdAt: new Date(),
        createdBy: userId,
        lastModified: new Date(),
        modifiedBy: userId
      },
      teeth: new Map(),
      statistics: {
        totalTeeth: emptyStatistics.totalTeeth,
        presentTeeth: emptyStatistics.presentTeeth,
        placaTotal: emptyStatistics.placaTotal,
        sangradoTotal: emptyStatistics.sangradoTotal,
        supuracionTotal: emptyStatistics.supuracionTotal,
        bleedingPercentage: emptyStatistics.bleedingPercentage,
        plaquePercentage: emptyStatistics.plaquePercentage,
        averageProbingDepth: emptyStatistics.averageProbingDepth,
        averageGingivalMargin: emptyStatistics.averageGingivalMargin
      }
    },
    status: 'draft',
    current: {
      teeth: new Map(),
      statistics: {
        placaTotal: emptyStatistics.placaTotal,
        sangradoTotal: emptyStatistics.sangradoTotal,
        supuracionTotal: emptyStatistics.supuracionTotal,
        totalTeeth: emptyStatistics.totalTeeth,
        presentTeeth: emptyStatistics.presentTeeth,
        bleedingPercentage: emptyStatistics.bleedingPercentage,
        plaquePercentage: emptyStatistics.plaquePercentage,
        averageProbingDepth: emptyStatistics.averageProbingDepth,
        averageGingivalMargin: emptyStatistics.averageGingivalMargin
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      versionName: 'v1',
      needsStatisticsRecalc: false
    }
  });
};

// Stats helpers
PeriodontogramSchema.statics.getCacheStats = function() {
  if (UniversalToothValidator && UniversalToothValidator.getCacheStats) {
    return UniversalToothValidator.getCacheStats();
  }
  return {};
};

PeriodontogramSchema.statics.clearCache = function() {
  if (UniversalToothValidator && UniversalToothValidator.invalidateCache) {
    UniversalToothValidator.invalidateCache();
  }
};

module.exports = mongoose.model('Periodontogram', PeriodontogramSchema);
