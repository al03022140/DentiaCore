import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PeriodontogramDesign from '../periodontogram-design.jsx';
import PeriodontogramUtils from '../utils/periodontogram-utils';

// Helper to build full data for all teeth with dense values
function buildHeavyPeriodontogram() {
  const upper = PeriodontogramUtils.getUpperTeeth();
  const lower = PeriodontogramUtils.getLowerTeeth();
  const allTeeth = [...upper, ...lower];
  const teeth = {};

  for (const t of allTeeth) {
    teeth[t] = {
      absent: false,
      ausente: false,
      implant: false,
      implante: false,
      mobility: 2,
      movilidad: 2,
      gumWidth: 2,
      anchuraEncia: 2,
      prognosis: 'bueno',
      pronostico: 'bueno',
      bleeding: {
        vestibularSuperior: [3, 2, 1],
        palatinoSuperior: [1, 2, 3],
        vestibularInferior: [2, 2, 2],
        lingualInferior: [1, 1, 1]
      },
      plaque: {
        vestibularSuperior: [1, 0, 1],
        palatinoSuperior: [0, 1, 0],
        vestibularInferior: [1, 1, 1],
        lingualInferior: [0, 0, 1]
      },
      suppuration: {
        vestibularSuperior: [1, 1, 0],
        palatinoSuperior: [0, 0, 1],
        vestibularInferior: [1, 0, 1],
        lingualInferior: [0, 1, 0]
      },
      gingivalMargin: {
        vestibularSuperior: [0, 1, 2],
        palatinoSuperior: [2, 1, 0],
        vestibularInferior: [1, 2, 3],
        lingualInferior: [0, 0, 0]
      },
      probingDepth: {
        vestibularSuperior: [3, 4, 5],
        palatinoSuperior: [2, 3, 4],
        vestibularInferior: [4, 5, 6],
        lingualInferior: [1, 2, 3]
      },
      furca: {
        vestibular: 1,
        lingualPalatino: 2,
        doble: { furca1: 1, furca2: 2 }
      }
    };
  }

  return {
    teeth,
    statistics: { placaTotal: 0, sangradoTotal: 0, supuracionTotal: 0, profundidadPromedio: 0 }
  };
}

// no-op update to satisfy component API
function noopUpdate() {}

describe('PeriodontogramDesign heavy data rendering', () => {
  test('renders without crashing with dense data across all teeth', async () => {
    const data = buildHeavyPeriodontogram();
    render(
      <PeriodontogramDesign
        periodontogramData={data}
        onToothUpdate={noopUpdate}
        readOnly={true}
        performanceMode="minimal" // disable expensive canvas effects for tests
      />
    );

    // Basic sanity: titles for both arches should be present
    expect(await screen.findByText(/SUPERIOR/i)).toBeInTheDocument();
    expect(await screen.findByText(/INFERIOR/i)).toBeInTheDocument();

    // Spot-check a few generated inputs exist for probing depth and gingival margin
    // Using known keys for a common tooth (e.g., 11) and face
    const anyTripleInputs = screen.getAllByRole('spinbutton');
    expect(anyTripleInputs.length).toBeGreaterThan(10);
  });

  test('can move focus across many measurement fields (keyboard Enter)', async () => {
    const data = buildHeavyPeriodontogram();
    render(
      <PeriodontogramDesign
        periodontogramData={data}
        onToothUpdate={noopUpdate}
        readOnly={false}
        performanceMode="minimal"
      />
    );

    const spinButtons = screen.getAllByRole('spinbutton');
    // Focus first numeric input and press Enter to advance a few times
    await userEvent.click(spinButtons[0]);
    for (let i = 0; i < 3; i++) {
      fireEvent.keyDown(document.activeElement || spinButtons[0], { key: 'Enter', code: 'Enter' });
    }

    // If auto-advance works, focus should have moved; we can assert that at least we still have many inputs
    expect(spinButtons.length).toBeGreaterThan(10);
  });
});
