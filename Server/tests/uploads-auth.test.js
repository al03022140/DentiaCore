/**
 * Tests de la lógica pura de uploadsAuth (C-1: autorización de /uploads).
 * No requieren BD: clasificación de ruta y decisión de acceso clínico por permisos.
 */
const uploadsAuth = require('../middlewares/uploadsAuth');
const { classifyUploadPath, canAccessClinical } = uploadsAuth;

describe('uploadsAuth — clasificación de ruta', () => {
  test('foto de perfil → basic', () => {
    expect(classifyUploadPath('/pacientes/6a0e/profile-pic/x.jpg')).toBe('basic');
  });
  test('odontograma → clinical', () => {
    expect(classifyUploadPath('/pacientes/6a0e/odontograma-inicial/x.png')).toBe('clinical');
  });
  test('adjuntos → clinical', () => {
    expect(classifyUploadPath('/pacientes/6a0e/adjuntos/x.pdf')).toBe('clinical');
  });
  test('firmas de notas → clinical', () => {
    expect(classifyUploadPath('/pacientes/6a0e/firmas-notas/x.png')).toBe('clinical');
  });
  test('subcarpeta desconocida → clinical (estricto por defecto)', () => {
    expect(classifyUploadPath('/pacientes/6a0e/loquesea/x')).toBe('clinical');
  });
  test('logos → non-patient', () => {
    expect(classifyUploadPath('/logos/logo.png')).toBe('non-patient');
  });
  // SEC-03: la firma digital del doctor (raíz /firmas) es recurso clínico —
  // exige acceso al expediente, no basta una sesión cualquiera (recepción).
  test('firmas a nivel raíz → clinical', () => {
    expect(classifyUploadPath('/firmas/x.png')).toBe('clinical');
  });
});

describe('uploadsAuth — acceso clínico por permisos', () => {
  const role = 'test_norole'; // ni admin ni clínico → aísla la lógica de permisos

  test('patients.read → permite', () => {
    expect(canAccessClinical({ role, permissions: ['patients.read'] })).toBe(true);
  });
  test('comodín patients.* → permite', () => {
    expect(canAccessClinical({ role, permissions: ['patients.*'] })).toBe(true);
  });
  test('comodín * → permite', () => {
    expect(canAccessClinical({ role, permissions: ['*'] })).toBe(true);
  });
  test('solo patients.read.basic → NIEGA (no cubre el expediente clínico)', () => {
    expect(canAccessClinical({ role, permissions: ['patients.read.basic'] })).toBe(false);
  });
  test('permiso no relacionado (cash.read) → niega', () => {
    expect(canAccessClinical({ role, permissions: ['cash.read'] })).toBe(false);
  });
  test('sin actor → niega', () => {
    expect(canAccessClinical(null)).toBe(false);
  });
});
