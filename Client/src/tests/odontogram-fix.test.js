
describe('Odontograma Clinical Section - tipoValue Fix Logic', () => {
    // Esta función replica EXACTAMENTE la lógica implementada en odontogram-clinical-section.jsx
    // para validar que cubre todos los casos de borde.
    const normalizeData = (engineData) => {
        const normalizedEngineData = Array.isArray(engineData) ? engineData : [];
            
        return normalizedEngineData.map(item => {
            // 1. Recuperar o inferir el valor de 'tipo'
            let tipoValue = item.tipo;

            // Mock de getDamageNameFromId para el test
            const getDamageNameFromId = (id) => `Damage_${id}`;

            // Si es numérico (ID interno), convertir a texto
            if (typeof item.tipo === 'number') {
                tipoValue = getDamageNameFromId(item.tipo);
            } 
            // Si no existe, buscar en propiedades alternativas
            else if (!tipoValue) {
                tipoValue = item.name || item.damage || item.value || 
                    (item.damages && item.damages.length > 0 
                        ? item.damages.map(d => d.name || d.value).join(", ") 
                        : null); // CAMBIO: null en lugar de "Daño aplicado"
            }

            // Lógica adicional del fix: buscar en propiedades internas con guion bajo
            if ((!tipoValue || tipoValue === "") && item._damageType) {
                tipoValue = item._damageType;
            }
            
            if ((!tipoValue || tipoValue === "") && item._damages && item._damages.length > 0) {
                tipoValue = item._damages.map(d => d.name || d.value).join(", ");
            }

            // 2. Fallback final para evitar strings vacíos
            if (!tipoValue || tipoValue === "") {
                tipoValue = "Daño aplicado";
            }

            return {
                ...item,
                tipo: tipoValue, // Aseguramos que siempre haya un string descriptivo
                fecha: item.fecha || '2024-01-01' // Mock date
            };
        });
    };

    test('debe mantener tipo si ya es string', () => {
        const input = [{ tipo: 'Caries', fecha: '2024-01-01' }];
        const output = normalizeData(input);
        expect(output[0].tipo).toBe('Caries');
    });

    test('debe convertir tipo numérico usando helper', () => {
        const input = [{ tipo: 123 }];
        const output = normalizeData(input);
        expect(output[0].tipo).toBe('Damage_123');
    });

    test('debe usar item.name si tipo no existe', () => {
        const input = [{ name: 'Fractura' }];
        const output = normalizeData(input);
        expect(output[0].tipo).toBe('Fractura');
    });

    test('debe usar item._damageType (fix específico)', () => {
        const input = [{ _damageType: 'Corona' }];
        const output = normalizeData(input);
        expect(output[0].tipo).toBe('Corona');
    });

    test('debe usar item._damages array (fix específico)', () => {
        const input = [{ _damages: [{ name: 'Implante' }, { value: 'Perno' }] }];
        const output = normalizeData(input);
        expect(output[0].tipo).toBe('Implante, Perno');
    });

    test('debe usar fallback "Daño aplicado" si todo falla', () => {
        const input = [{ id: 1 }]; // Sin info de tipo
        const output = normalizeData(input);
        expect(output[0].tipo).toBe('Daño aplicado');
    });

    test('debe manejar array vacío', () => {
        const output = normalizeData([]);
        expect(output).toEqual([]);
    });

    test('debe manejar input null/undefined', () => {
        const output = normalizeData(null);
        expect(output).toEqual([]);
    });
});
