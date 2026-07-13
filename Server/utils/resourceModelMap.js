/**
 * Mapa canónico resourceType → nombre de modelo Mongoose.
 *
 * Fuente única para los consumidores que necesitan resolver un resourceType
 * a su modelo (auditoría, firma electrónica). Antes vivía duplicado como un
 * objeto literal independiente en cada consumidor.
 */
const RESOURCE_MODEL_MAP = {
  patient:         'Patient',
  examen:          'Examen',
  receta:          'Receta',
  tratamiento:     'Tratamiento',
  periodontograma: 'Periodontogram',
  odontograma:     'Odontograma',
  cita:            'Appointment',
};

module.exports = { RESOURCE_MODEL_MAP };
