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
    });

    describe('normalizeEntriesForEngine', () => {
        test('drops entries without tooth or with unmappable damage', () => {
            const out = normalizeEntriesForEngine([
                { tooth: '17', damage: 'Macrodoncia' },
                { tooth: '', damage: '17' },
                { damage: '17' },
                { tooth: '16', damage: 'no existe' },
                { tooth: '16', damage: '' },
            ]);
            expect(out).toEqual([
                { tooth: '17', damage: '17', surface: '0', note: '' },
            ]);
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