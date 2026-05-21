import { prepareDataSource, damageToCode, normalizeEntriesForEngine } from '../utils/odontogram-utils';

describe('Odontogram Utilities', () => {
    describe('prepareDataSource', () => {
        test('should handle undefined input by returning empty array', () => {
            const result = prepareDataSource(undefined);
            expect(result).toEqual([]);
        });

        test('should handle null input by returning empty array', () => {
            const result = prepareDataSource(null);
            expect(result).toEqual([]);
        });

        test('should handle empty array by returning empty array', () => {
            const result = prepareDataSource([]);
            expect(result).toEqual([]);
        });

        test('should add keys to array of objects', () => {
            const input = [
                { diente: '11', tipo: 'Caries', superficie: 'V' },
                { diente: '12', tipo: 'Fractura', superficie: 'D' }
            ];
            const result = prepareDataSource(input);
            
            // Verificamos que haya dos elementos
            expect(result.length).toBe(2);
            
            // Verificamos que cada uno tenga una clave
            expect(result[0].key).toBeDefined();
            expect(result[1].key).toBeDefined();
            
            // Verificamos que las claves sean diferentes
            expect(result[0].key).not.toEqual(result[1].key);
            
            // Verificamos que se mantienen los datos originales
            expect(result[0].diente).toBe('11');
            expect(result[0].tipo).toBe('Caries');
            expect(result[1].diente).toBe('12');
            expect(result[1].tipo).toBe('Fractura');
        });

        test('should handle objects with missing or undefined properties', () => {
            const input = [
                { diente: undefined, tipo: 'Caries', superficie: null },
                { tipo: 'Fractura' }
            ];
            const result = prepareDataSource(input);
            
            // Verificamos que haya dos elementos
            expect(result.length).toBe(2);
            
            // Verificamos que cada uno tenga una clave, incluso con props faltantes
            expect(result[0].key).toBeDefined();
            expect(result[1].key).toBeDefined();
            
            // Las claves deben seguir siendo diferentes
            expect(result[0].key).not.toEqual(result[1].key);
        });

        test('should handle non-array input by returning empty array', () => {
            const inputs = [
                'string',
                123,
                { notAnArray: true },
                true,
                false,
                () => {}
            ];

            inputs.forEach(input => {
                const result = prepareDataSource(input);
                expect(Array.isArray(result)).toBe(true);
                expect(result.length).toBe(0);
            });
        });
    });

    describe('damageToCode', () => {
        test('accepts numeric code as string or number', () => {
            expect(damageToCode('17')).toBe(17);
            expect(damageToCode(17)).toBe(17);
            expect(damageToCode('  30  ')).toBe(30);
        });

        test('resolves localized names (with/without accents) to numeric codes', () => {
            expect(damageToCode('Macrodoncia')).toBe(17);
            expect(damageToCode('Poste')).toBe(30);
            expect(damageToCode('Intrusión')).toBe(20);
            expect(damageToCode('Intrusion')).toBe(20);
            expect(damageToCode('Remanente radicular')).toBe(16);
            expect(damageToCode('Prótesis fija')).toBe(34);
            expect(damageToCode('Prótesis Fija (Centro)')).toBe(35);
            expect(damageToCode('Prótesis Fija (Derecha)')).toBe(36);
        });

        test('returns null for unknown or empty values', () => {
            expect(damageToCode('')).toBeNull();
            expect(damageToCode(null)).toBeNull();
            expect(damageToCode(undefined)).toBeNull();
            expect(damageToCode('Daño inexistente')).toBeNull();
        });

        test('resolves legacy menu labels used by the engine', () => {
            // El menú del engine (createMenuButton en public/js/engine.js).
            expect(damageToCode('Caries')).toBe(1);
            expect(damageToCode('Corona')).toBe(2);
            expect(damageToCode('Corona (Temp)')).toBe(3);
            expect(damageToCode('Ausente')).toBe(4);
            expect(damageToCode('Fractura')).toBe(5);
            expect(damageToCode('Implante')).toBe(6);
            expect(damageToCode('Diastema')).toBe(8);
            expect(damageToCode('Extrusión')).toBe(9);
            expect(damageToCode('Empaste')).toBe(11);
            expect(damageToCode('Prótesis Rem')).toBe(12);
            expect(damageToCode('Migración')).toBe(13);
            expect(damageToCode('Rotación')).toBe(14);
            expect(damageToCode('Fusión')).toBe(15);
            expect(damageToCode('Remanente R')).toBe(16);
            expect(damageToCode('Macrodoncia')).toBe(17);
            expect(damageToCode('Microdoncia')).toBe(18);
            expect(damageToCode('Impactado')).toBe(19);
            expect(damageToCode('Intrusión')).toBe(20);
            expect(damageToCode('Ectópico')).toBe(21);
            expect(damageToCode('Discrómico')).toBe(22);
            expect(damageToCode('Endodoncia')).toBe(23);
            expect(damageToCode('No Erupcionado')).toBe(24);
            expect(damageToCode('Transposición')).toBe(25);
            expect(damageToCode('Supernumerario')).toBe(27);
            expect(damageToCode('Daño Pulpar')).toBe(28);
            expect(damageToCode('Carilla')).toBe(29);
            expect(damageToCode('Poste')).toBe(30);
            expect(damageToCode('Edéntulismo')).toBe(31);
            expect(damageToCode('Orto Fijo')).toBe(32);
            expect(damageToCode('Prótesis Fija')).toBe(34);
            expect(damageToCode('Desgastado')).toBe(37);
            expect(damageToCode('Semi-Impactado')).toBe(38);
        });

        test('resolves long localized names from getDamageNameByCode', () => {
            // Nombres "largos" que devuelve getDamageNameByCode cuando
            // window.Constants existe. La sección clínica los pudo haber
            // persistido como string en datos legacy.
            expect(damageToCode('Corona Definitiva')).toBe(2);
            expect(damageToCode('Corona Temporal')).toBe(3);
            expect(damageToCode('Diente Ausente')).toBe(4);
            expect(damageToCode('Diente Extruido')).toBe(9);
            expect(damageToCode('Curación')).toBe(11);
            expect(damageToCode('Curacion')).toBe(11);
            expect(damageToCode('Prótesis Removible')).toBe(12);
            expect(damageToCode('Giroversión')).toBe(14);
            expect(damageToCode('Remanente Radicular')).toBe(16);
            expect(damageToCode('Impactación')).toBe(19);
            expect(damageToCode('Diente Intruido')).toBe(20);
            expect(damageToCode('Diente Ectópico')).toBe(21);
            expect(damageToCode('Diente Discrómico')).toBe(22);
            expect(damageToCode('Diente en Erupción')).toBe(24);
            expect(damageToCode('Transposición Izquierda')).toBe(25);
            expect(damageToCode('Transposición Derecha')).toBe(26);
            expect(damageToCode('Pulpar')).toBe(28);
            expect(damageToCode('Perno Muñón')).toBe(30);
            expect(damageToCode('Edéntulo Total')).toBe(31);
            expect(damageToCode('Ortodóntico Fijo (Extremo)')).toBe(32);
            expect(damageToCode('Ortodóntico Fijo (Centro)')).toBe(33);
            expect(damageToCode('Prótesis Fija (Izquierda)')).toBe(34);
            expect(damageToCode('Prótesis Fija (Centro)')).toBe(35);
            expect(damageToCode('Prótesis Fija (Derecha)')).toBe(36);
            expect(damageToCode('Superficie Desgastada')).toBe(37);
            expect(damageToCode('Semi-Impactación')).toBe(38);
        });

        test('resolves auto-formatted constant names (with preserved typos)', () => {
            // odontogram-clinical-section.jsx genera nombres aplicando
            // replace(/_/g,' ').toLowerCase()... sobre claves de Constants.
            // Algunos nombres internos llevan typos (EDENTULOA_TOTAL,
            // DIENTE_DISCR0MICO, SEMI_IMPACTACI0N) que se conservan en el
            // string resultante. Si esos nombres acabaron en BD, los
            // queremos resolver.
            expect(damageToCode('Edentuloa Total')).toBe(31);
            expect(damageToCode('Diente Discr0Mico')).toBe(22);
            expect(damageToCode('Discr0mico')).toBe(22);
            expect(damageToCode('Semi Impactaci0n')).toBe(38);
            expect(damageToCode('Transposicion Left')).toBe(25);
            expect(damageToCode('Transposicion Right')).toBe(26);
            expect(damageToCode('Ortodontico Fijo End')).toBe(32);
            expect(damageToCode('Ortodontico Fijo Center')).toBe(33);
            expect(damageToCode('Protesis Fija Left')).toBe(34);
            expect(damageToCode('Protesis Fija Center')).toBe(35);
            expect(damageToCode('Protesis Fija Right')).toBe(36);
            expect(damageToCode('Super Numerario')).toBe(27);
            expect(damageToCode('Dano Pulpar')).toBe(28);
            expect(damageToCode('Diente En Erupcion')).toBe(24);
        });

        test('resolves short variants without dot or accent', () => {
            // Mezclas comunes: forma corta sin punto, sin tilde, etc.
            expect(damageToCode('Corona Def')).toBe(2);
            expect(damageToCode('Corona Temp')).toBe(3);
            expect(damageToCode('Extruido')).toBe(9);
            expect(damageToCode('Intruido')).toBe(20);
            expect(damageToCode('Ortodontico Fijo')).toBe(32);
            expect(damageToCode('Prótesis Rem.')).toBe(12);
            expect(damageToCode('Remanente R.')).toBe(16);
        });
    });

    describe('normalizeEntriesForEngine', () => {
        test('drops entries without target (tooth/space) or with nothing to apply', () => {
            const out = normalizeEntriesForEngine([
                { tooth: '17', damage: 'Macrodoncia' },
                { tooth: '', damage: '17' },              // sin objetivo → drop
                { damage: '17' },                          // sin objetivo → drop
                { tooth: '16', damage: 'no existe' },      // sin daño válido NI nota → drop
                { tooth: '16', damage: '' },               // sin daño NI nota → drop
            ]);
            expect(out).toEqual([
                { tooth: '17', damage: '17', surface: '0', note: '' },
            ]);
        });

        test('keeps note-only entries (damage empty but note set)', () => {
            const out = normalizeEntriesForEngine([
                { tooth: '21', damage: '', note: 'Sensibilidad al frío' },
                { tooth: '22', damage: 'no existe', note: 'Pendiente revisar' },
            ]);
            expect(out).toEqual([
                { tooth: '21', damage: '', surface: '0', note: 'Sensibilidad al frío' },
                { tooth: '22', damage: '', surface: '0', note: 'Pendiente revisar' },
            ]);
        });

        test('passes through space entries for inter-dental damages', () => {
            const out = normalizeEntriesForEngine([
                { space: '1817', damage: 'Diastema' },
                { space: '2122', damage: '8' },
            ]);
            expect(out).toHaveLength(2);
            expect(out[0]).toEqual({ space: '1817', damage: '8', surface: '0', note: '' });
            expect(out[1]).toEqual({ space: '2122', damage: '8', surface: '0', note: '' });
        });

        test('keeps entries without fecha (engine fills it at load)', () => {
            const out = normalizeEntriesForEngine([
                { tooth: '17', damage: 'Macrodoncia' },
                { tooth: '16', damage: 'Poste', superficie: 'O' },
            ]);
            expect(out).toHaveLength(2);
            expect(out[0]).not.toHaveProperty('fecha');
            expect(out[1]).not.toHaveProperty('fecha');
        });

        test('preserves fecha when provided', () => {
            const out = normalizeEntriesForEngine([
                { tooth: '17', damage: '17', fecha: '2026-05-20' },
            ]);
            expect(out[0].fecha).toBe('2026-05-20');
        });

        test('dedupes by tooth + damage code + surface', () => {
            const out = normalizeEntriesForEngine([
                { tooth: '17', damage: 'Macrodoncia', surface: '0' },
                { tooth: '17', damage: '17', surface: '0' },          // duplicado por código
                { tooth: '17', damage: 'macrodoncia', surface: '0' }, // duplicado case-insensitive
                { tooth: '17', damage: 'Macrodoncia', surface: 'O' }, // distinto: distinta superficie
            ]);
            expect(out).toHaveLength(2);
            expect(out.map(e => e.surface).sort()).toEqual(['0', 'O']);
        });

        test('does not dedupe different damages on the same tooth', () => {
            const out = normalizeEntriesForEngine([
                { tooth: '13', damage: 'Intrusión', surface: '0' },
                { tooth: '13', damage: 'Remanente radicular', surface: '0' },
            ]);
            expect(out).toHaveLength(2);
            expect(out.map(e => e.damage).sort()).toEqual(['16', '20']);
        });

        test('handles full table input from the user scenario', () => {
            const input = [
                { tooth: '17', damage: 'Macrodoncia',          surface: '0', fecha: '2026-05-20' },
                { tooth: '16', damage: 'Macrodoncia',          surface: '0', fecha: '2026-05-20' },
                { tooth: '16', damage: 'Poste',                surface: '0', fecha: '2026-05-20' },
                { tooth: '15', damage: 'Poste',                surface: '0', fecha: '2026-05-20' },
                { tooth: '14', damage: 'Intrusión',            surface: '0', fecha: '2026-05-20' },
                { tooth: '13', damage: 'Intrusión',            surface: '0', fecha: '2026-05-20' },
                { tooth: '13', damage: 'Remanente radicular',  surface: '0', fecha: '2026-05-20' },
                { tooth: '22', damage: 'Prótesis Fija (Derecha)', surface: '0' }, // sin fecha
                { tooth: '22', damage: 'Remanente radicular',  surface: '0' },
                { tooth: '23', damage: 'Prótesis Fija (Centro)', surface: '0' },
                { tooth: '22', damage: 'Prótesis Fija (Derecha)', surface: '0' }, // duplicado
            ];
            const out = normalizeEntriesForEngine(input);
            // 10 únicos (último es duplicado del 8º)
            expect(out).toHaveLength(10);
            // El que no traía fecha sigue sin fecha (el engine la pondrá)
            const proteFijaDer = out.find(e => e.tooth === '22' && e.damage === '36');
            expect(proteFijaDer.fecha).toBeUndefined();
            // Códigos correctos
            expect(out.find(e => e.tooth === '13' && e.damage === '20')).toBeDefined();
            expect(out.find(e => e.tooth === '13' && e.damage === '16')).toBeDefined();
            expect(out.find(e => e.tooth === '23' && e.damage === '35')).toBeDefined();
        });

        test('returns empty array for invalid inputs', () => {
            expect(normalizeEntriesForEngine(null)).toEqual([]);
            expect(normalizeEntriesForEngine(undefined)).toEqual([]);
            expect(normalizeEntriesForEngine('not an array')).toEqual([]);
            expect(normalizeEntriesForEngine([])).toEqual([]);
            expect(normalizeEntriesForEngine([null, undefined, 'x'])).toEqual([]);
        });
    });
});