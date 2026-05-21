const mongoose = require('mongoose');

const SUPPORTED_CURRENCIES = ['MXN', 'USD', 'EUR', 'COP', 'ARS', 'CLP', 'PEN'];
const MAX_SERVICE_PRICE = 100_000_000;

const clinicSettingsSchema = new mongoose.Schema({
  clinicName: { type: String, default: 'Mi Clínica Dental', trim: true, maxlength: 120 },
  address: { type: String, default: '', trim: true, maxlength: 300 },
  phone: { type: String, default: '', trim: true, maxlength: 40 },
  logoUrl: { type: String, default: null },

  // Seguridad
  inactivityTimeout: { type: Number, default: 15, min: 1, max: 120 },
  maxLoginAttempts: { type: Number, default: 5, min: 1, max: 20 },
  lockDuration: { type: Number, default: 15, min: 1, max: 1440 },

  // Citas
  defaultAppointmentDuration: { type: Number, default: 30, enum: [15, 20, 30, 45, 60] },
  businessHours: {
    start: { type: String, default: '08:00' },
    end: { type: String, default: '18:00' }
  },
  workDays: { type: [Number], default: [1, 2, 3, 4, 5] },

  // Caja
  cashCategories: { type: [String], default: ['Consulta', 'Tratamiento', 'Otro'] },
  currency: {
    type: String,
    default: 'MXN',
    trim: true,
    uppercase: true,
    enum: SUPPORTED_CURRENCIES
  },
  serviceCatalog: [{
    nombre: { type: String, required: true, trim: true, maxlength: 80 },
    precioDefault: { type: Number, required: true, min: 0, max: MAX_SERVICE_PRICE }
  }],

  // Permisos por rol (overrides)
  rolePermissionOverrides: {
    type: Map,
    of: [String],
    default: {}
  }
}, { timestamps: true });

// Normaliza y deduplica catálogo / categorías antes de persistir.
// Las comparaciones para detectar duplicados son case-insensitive y
// whitespace-tolerant; el valor guardado conserva el primero introducido
// (trim aplicado por el schema field) — evita pares "Limpieza" / "limpieza".
clinicSettingsSchema.pre('save', function (next) {
  if (Array.isArray(this.cashCategories)) {
    const seen = new Set();
    const cleaned = [];
    for (const raw of this.cashCategories) {
      if (typeof raw !== 'string') continue;
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      cleaned.push(trimmed);
    }
    this.cashCategories = cleaned;
  }

  if (Array.isArray(this.serviceCatalog)) {
    const seen = new Set();
    const cleaned = [];
    for (const svc of this.serviceCatalog) {
      if (!svc || typeof svc.nombre !== 'string') continue;
      const nombre = svc.nombre.trim();
      if (!nombre) continue;
      const key = nombre.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const precio = Number(svc.precioDefault);
      if (!Number.isFinite(precio) || precio < 0) continue;
      cleaned.push({
        nombre,
        precioDefault: Math.round(precio * 100) / 100
      });
    }
    this.serviceCatalog = cleaned;
  }

  next();
});

// Singleton: siempre un solo documento
clinicSettingsSchema.statics.getSettings = async function () {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({});
  }
  return settings;
};

clinicSettingsSchema.statics.updateSettings = async function (data) {
  const settings = await this.getSettings();
  Object.assign(settings, data);
  return settings.save();
};

const ClinicSettings = mongoose.model('ClinicSettings', clinicSettingsSchema);

ClinicSettings.SUPPORTED_CURRENCIES = SUPPORTED_CURRENCIES;
ClinicSettings.MAX_SERVICE_PRICE = MAX_SERVICE_PRICE;

module.exports = ClinicSettings;
