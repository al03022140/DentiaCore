const mongoose = require('mongoose');

const clinicSettingsSchema = new mongoose.Schema({
  clinicName: { type: String, default: 'Mi Clínica Dental', trim: true },
  address: { type: String, default: '', trim: true },
  phone: { type: String, default: '', trim: true },
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
  currency: { type: String, default: 'MXN', trim: true },
  serviceCatalog: [{
    nombre: { type: String, required: true, trim: true },
    precioDefault: { type: Number, required: true, min: 0 }
  }],

  // Permisos por rol (overrides)
  rolePermissionOverrides: {
    type: Map,
    of: [String],
    default: {}
  }
}, { timestamps: true });

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

module.exports = mongoose.model('ClinicSettings', clinicSettingsSchema);
