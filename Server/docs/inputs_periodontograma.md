# Inputs del Periodontograma (Front)

Este documento define, desde la perspectiva del Front, qué datos se editan en el periodontograma, su forma y sus rangos. La intención es que sirva de “fuente de verdad” para UI y validación del lado del cliente, y como referencia para el backend.

## Modelo general por diente (Front)

- Identificación de diente: sistema FDI (permanentes 11–48; temporales 51–85).
- Caras registradas en UI: 4 caras por diente.
  - vestibularSuperior (arcada superior)
  - palatinoSuperior (arcada superior)
  - vestibularInferior (arcada inferior)
  - lingualInferior (arcada inferior)
- Cardinalidad por cara: arreglos de longitud 3 en el orden [Mesial, Central, Distal].

Nota de compatibilidad: en el estado del Front existen claves en inglés y en español para algunos campos (p. ej., absent/ausente, implant/implante, mobility/movilidad, gumWidth/anchuraEncia, prognosis/pronostico). La UI trabaja con las claves “inglesas” y se espejan a español para persistencia.

## Campos por diente (nivel diente)

- numeroDiente (FDI)
  - Tipo: number (entero)
  - Valores válidos: permanentes (11–18, 21–28, 31–38, 41–48) y temporales (51–55, 61–65, 71–75, 81–85)
  - Requerido: true

- arcada
  - Tipo: string (enum)
  - Valores: "superior", "inferior"
  - Requerido: true

- ausente (absent)
  - Tipo: boolean
  - Valores: false (presente) / true (ausente)
  - Default: false

- implante (implant)
  - Tipo: boolean
  - Valores: false / true (UI como checkbox)

- movilidad (mobility)
  - Tipo: number (entero)
  - Rango: 0..3 (default 0)

- pronostico (prognosis)
  - Tipo: string (enum)
  - Valores mostrados en UI: "bueno", "dudoso", "malo", "imposible" (se muestra con etiqueta capitalizada)
  - Nota: el backend puede normalizar/capitalizar al guardar.

- anchuraEncia (gumWidth)
  - Tipo: number (entero, a nivel de diente)
  - Rango en UI: 0..3 (default 0)
  - Descripción: Medición unificada por diente (no por cara)

- furca
  - Estructura (UI): objeto con subcampos numéricos (enteros)
    - vestibular: 0..3 (default 0)
    - lingualPalatino: 0..3 (default 0)
    - doble (solo para molares con doble furcación en maxilar superior):
      - furca1: 0..3 (default 0)
      - furca2: 0..3 (default 0)
  - Notas:
    - Solo molares pueden tener valores > 0.
    - Doble furcación únicamente en molares superiores: 16, 17, 18, 26, 27, 28.

## Campos por cara (nivel mediciones)
Cada medición por cara es un array de 3 números en el orden [Mesial, Central, Distal]. Claves usadas por la UI: bleeding, suppuration, plaque, gingivalMargin, probingDepth.

- profundidadSondaje (probingDepth)
  - Tipo: number[3]
  - Rango por elemento (UI/validador Front): -9..9 (default 0)

- margenGingival (gingivalMargin)
  - Tipo: number[3]
  - Rango por elemento (UI/validador Front): -9..9 (default 0)

- sangrado (bleeding)
  - Tipo: number[3]
  - Rango por elemento: 0..3 (multivalor; default 0)

- supuracion (suppuration)
  - Tipo: number[3]
  - Rango por elemento: 0..1 (binario; default 0)

- placa (plaque)
  - Tipo: number[3]
  - Rango por elemento: 0..1 (binario; default 0)

## Reglas y consideraciones

- Cardinalidad: todas las mediciones por cara deben tener longitud exactamente 3 ([Mesial, Central, Distal]).
- Coherencia básica:
  - No marcar un diente como ausente y, a la vez, implante.
- Furca:
  - En dientes no molares, furca debe permanecer en 0.
  - En molares sin doble furca aplicable, los campos furca.doble deben permanecer en 0.
  - Rangos de furca (simple y doble): 0..3.

## Resumen de tipos y rangos (Front)

- Diente (FDI): number (entero)
- ausente: boolean
- implante: boolean
- movilidad: number 0..3
- pronostico (UI): string en {"bueno","dudoso","malo","imposible"}
- anchuraEncia (UI): number 0..3 (nivel diente)
- furca: objeto
  - vestibular: number 0..3
  - lingualPalatino: number 0..3
  - doble.furca1: number 0..3 (si aplica)
  - doble.furca2: number 0..3 (si aplica)
- Por cara (vestibularSuperior, palatinoSuperior, vestibularInferior, lingualInferior): arreglos [Mesial, Central, Distal]
  - profundidadSondaje: number[3] con -9..9
  - margenGingival: number[3] con -9..9
  - sangrado: number[3] con 0..3
  - supuracion: number[3] con 0..1
  - placa: number[3] con 0..1

### Compatibilidad y persistencia
- La UI usa 4 caras; el backend puede consolidar a 2 caras por arcada (vestibular/palatino) para persistencia.
- Se aceptan alias en inglés/español para claves a nivel diente (absent/ausente, implant/implante, mobility/movilidad, gumWidth/anchuraEncia, prognosis/pronostico). El backend normaliza a español y capitaliza donde corresponda.


Última revisión: alineado con el comportamiento actual del Front (rango -9..9 para profundidad/margen; gumWidth 0..3; caras específicas VS/PS/VI/LI; furca doble solo en 16–18 y 26–28).
- Pronóstico individual

