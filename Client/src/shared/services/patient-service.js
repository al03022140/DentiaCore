/**
 * Servicio de pacientes - Re-exporta funciones de api.js
 * Mantiene la compatibilidad con importaciones existentes
 */

import { 
  getAllPatients, 
  createPatient, 
  getPatientById, 
  updatePatient, 
  deletePatient 
} from './api.js';

// Re-exportar todas las funciones de pacientes
export {
  getAllPatients,
  createPatient,
  getPatientById,
  updatePatient,
  deletePatient
};

// Export por defecto para compatibilidad
export default {
  getAllPatients,
  createPatient,
  getPatientById,
  updatePatient,
  deletePatient
};