/**
 * Endurecimiento del alta de paciente (auditoría add-patient):
 *  - sanitizeText ya NO entity-encodea (' " & < > se guardan tal cual; el
 *    escape XSS vive en la capa de salida — React).
 *  - validatePatientFieldRules: nombres ≤50, semanas de gestación 0-45,
 *    fechas médicas no futuras.
 *  - sanitizeAndLimitPayload conserva texto verbatim y trunca a 2000 (backstop
 *    para API cruda; el cliente valida antes con validateFormat).
 *  - Migración 0005: decodifica entidades legacy, incluidos dobles-encodes.
 *
 * Unit tests puros — sin DB.
 */

const { SANITIZERS, LIMITS } = require('../config/patientValidation');
const {
    _validatePatientFieldRules: validatePatientFieldRules,
    _sanitizeAndLimitPayload: sanitizeAndLimitPayload,
} = require('../controllers/patientsController');
const {
    _decodeEntities: decodeEntities,
    _decodeDeep: decodeDeep,
} = require('../migrations/0005-decodificar-entidades-html-pacientes');

describe('sanitizeText — sin entity-encoding', () => {
    test("conserva apóstrofes, comillas y & tal cual (sólo trim)", () => {
        expect(SANITIZERS.sanitizeText("  O'Brien  ")).toBe("O'Brien");
        expect(SANITIZERS.sanitizeText('Av. Juárez & 5 "La Presa"')).toBe('Av. Juárez & 5 "La Presa"');
        expect(SANITIZERS.sanitizeText('<script>')).toBe('<script>');
    });

    test('passthrough de no-strings y vacíos', () => {
        expect(SANITIZERS.sanitizeText(null)).toBe(null);
        expect(SANITIZERS.sanitizeText(42)).toBe(42);
        expect(SANITIZERS.sanitizeText('')).toBe('');
    });
});

describe('sanitizeAndLimitPayload — backstop de longitud', () => {
    test('texto con caracteres especiales llega intacto', () => {
        const out = sanitizeAndLimitPayload({ primer_nombre: "  D'Angelo  ", contacto: { direccion: 'Col. "El Mirador" & anexo' } });
        expect(out.primer_nombre).toBe("D'Angelo");
        expect(out.contacto.direccion).toBe('Col. "El Mirador" & anexo');
    });

    test('trunca strings > MAX_LONG_TEXT_LENGTH (el cliente valida antes; esto es backstop)', () => {
        const max = LIMITS.MAX_LONG_TEXT_LENGTH;
        const out = sanitizeAndLimitPayload({ nota: 'x'.repeat(max + 500) });
        expect(out.nota.length).toBe(max);
    });
});

describe('validatePatientFieldRules — rangos de ficha', () => {
    test('acepta un payload normal', () => {
        expect(validatePatientFieldRules({
            primer_nombre: 'Juan',
            apellido_paterno: 'Pérez',
            encuesta_medica: { embarazo: { semanas_gestacion: 12 } },
        })).toBeNull();
    });

    test('rechaza nombres de más de 50 caracteres', () => {
        expect(validatePatientFieldRules({ primer_nombre: 'a'.repeat(51) })).toMatch(/50/);
        expect(validatePatientFieldRules({ apellido_materno: 'a'.repeat(51) })).toMatch(/50/);
        expect(validatePatientFieldRules({ primer_nombre: 'a'.repeat(50) })).toBeNull();
    });

    test('semanas de gestación fuera de 0-45 o no numéricas → error', () => {
        const conSemanas = (v) => ({ encuesta_medica: { embarazo: { semanas_gestacion: v } } });
        expect(validatePatientFieldRules(conSemanas(-1))).toMatch(/gestación/);
        expect(validatePatientFieldRules(conSemanas(46))).toMatch(/gestación/);
        expect(validatePatientFieldRules(conSemanas('abc'))).toMatch(/gestación/);
        expect(validatePatientFieldRules(conSemanas(0))).toBeNull();
        expect(validatePatientFieldRules(conSemanas(45))).toBeNull();
        expect(validatePatientFieldRules(conSemanas(null))).toBeNull();
        expect(validatePatientFieldRules(conSemanas(''))).toBeNull();
    });

    test('fechas médicas futuras → error; pasadas o vacías → ok', () => {
        const future = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
        const past = '2020-01-01';
        expect(validatePatientFieldRules({
            encuesta_medica: { informacion_general: { ultimo_examen_medico: { fecha: future } } },
        })).toMatch(/examen médico/);
        expect(validatePatientFieldRules({
            habitos_higiene: { fecha_ultima_visita_odontologo: future },
        })).toMatch(/odontólogo/);
        expect(validatePatientFieldRules({
            encuesta_medica: { informacion_general: { ultimo_examen_medico: { fecha: past } } },
            habitos_higiene: { fecha_ultima_visita_odontologo: '' },
        })).toBeNull();
    });
});

describe('migración 0005 — decodificación de entidades legacy', () => {
    test('decodifica el encoding simple del sanitizador retirado', () => {
        expect(decodeEntities('O&#x27;Brien')).toBe("O'Brien");
        expect(decodeEntities('R&amp;D &lt;lab&gt; &quot;x&quot; &#39;y&#39;')).toBe('R&D <lab> "x" \'y\'');
    });

    test('desenrolla dobles-encodes del sanitizador viejo no-idempotente', () => {
        expect(decodeEntities('&amp;amp;')).toBe('&');
        expect(decodeEntities('&amp;#x27;')).toBe("'");
    });

    test('idempotente: texto limpio queda igual', () => {
        expect(decodeEntities("O'Brien & Cía <3")).toBe("O'Brien & Cía <3");
    });

    test('decodeDeep recorre objetos/arrays, preserva fechas y reporta si cambió', () => {
        const fecha = new Date('2020-01-01');
        const [out, changed] = decodeDeep({
            primer_nombre: 'D&#x27;Angelo',
            fecha_nacimiento: fecha,
            contactos_emergencia: [{ nombre: 'Ana &amp; Luis', telefono: '555' }],
            edad: 30,
        });
        expect(changed).toBe(true);
        expect(out.primer_nombre).toBe("D'Angelo");
        expect(out.fecha_nacimiento).toBe(fecha);
        expect(out.contactos_emergencia[0].nombre).toBe('Ana & Luis');
        expect(out.edad).toBe(30);

        const [same, noChange] = decodeDeep({ primer_nombre: 'Juan' });
        expect(noChange).toBe(false);
        expect(same.primer_nombre).toBe('Juan');
    });
});
