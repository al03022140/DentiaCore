import { prepareDataSource } from '../utils/odontogram-utils';

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
});