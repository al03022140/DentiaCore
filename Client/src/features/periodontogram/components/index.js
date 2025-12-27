/**
 * ============================================================================
 * EXPORTACIONES DE COMPONENTES DEL PERIODONTOGRAMA
 * ============================================================================
 * 
 * Este archivo centraliza las exportaciones de los componentes
 * del periodontograma que se usan en la aplicación.
 * 
 * @author Sistema Dental
 * @version 3.0.0 - Limpieza completada
 */

// ============================================================================
// COMPONENTES ACTIVOS
// ============================================================================

/**
 * Checkbox especializado para sangrado con estados visuales
 * Estados: 0 (sin marcar), 1 (punto), 2 (rectángulo), 3 (cuadrado)
 * Usado por PeriodontogramDesign en patient-detail
 */
export { default as BleedingMultiStateCheckbox } from './bleeding-multi-state-checkbox';