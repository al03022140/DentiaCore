/**
 * Lightweight tests for periodontogram adaptors
 * Validates checkbox booleans and multistate mapping to Spanish face-centric arrays
 */

const { adaptTeethFromClientPayload } = require('../utils/periodontogramAdaptors');

function expectEqual(a, b, message) {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) {
    console.error('❌', message, '\n  expected:', JSON.stringify(b), '\n  actual  :', JSON.stringify(a));
    process.exitCode = 1;
  } else {
    console.log('✅', message);
  }
}

function run() {
  console.log('🧪 Running periodontogram adaptor tests...');

  // Case 1: booleans in plaque/bleeding/suppuration should map to 0/1 triplets
  const input1 = {
    '11': {
      plaque: {
        vestibularSuperior: [true, false, true],
        palatinoSuperior: [false, false, true]
      },
      bleeding: {
        vestibularSuperior: [0, 1, 2],
        palatinoSuperior: [3, 2, 1]
      },
      suppuration: {
        vestibularSuperior: [false, true, false],
        palatinoSuperior: [true, false, false]
      },
      gingivalMargin: {
        vestibularSuperior: [0, -1, 2],
        palatinoSuperior: [1, 0, -2]
      },
      probingDepth: {
        vestibularSuperior: [2, 3, 2],
        palatinoSuperior: [3, 3, 2]
      },
      present: true,
      implant: true,
      mobility: 1,
      gumWidth: 2,
      prognosis: 'Reservado',
      furca1: 1,
      furca2: 0
    }
  };

  const out1 = adaptTeethFromClientPayload(input1);
  const t11 = out1['11'];
  expectEqual(t11.vestibularSuperior.placa, [1, 0, 1], 'booleans -> placa [1,0,1]');
  expectEqual(t11.palatinoSuperior.placa, [0, 0, 1], 'booleans -> placa palatino [0,0,1]');
  expectEqual(t11.vestibularSuperior.sangrado, [0, 1, 2], 'multistate bleeding preserved');
  expectEqual(t11.palatinoSuperior.sangrado, [3, 2, 1], 'multistate bleeding preserved palatino');
  expectEqual(t11.vestibularSuperior.supuracion, [0, 1, 0], 'boolean suppuration -> [0,1,0]');
  expectEqual(t11.palatinoSuperior.supuracion, [1, 0, 0], 'boolean suppuration palatino -> [1,0,0]');
  expectEqual(t11.vestibularSuperior.margenGingival, [0, -1, 2], 'gingivalMargin preserved');
  expectEqual(t11.palatinoSuperior.margenGingival, [1, 0, -2], 'gingivalMargin preserved palatino');
  expectEqual(t11.vestibularSuperior.profundidadSondaje, [2, 3, 2], 'probingDepth preserved');
  expectEqual(t11.palatinoSuperior.profundidadSondaje, [3, 3, 2], 'probingDepth preserved palatino');
  expectEqual(t11.ausente, false, 'present true -> ausente false');
  expectEqual(t11.implante, true, 'implant true preserved');
  expectEqual(t11.movilidad, 1, 'mobility preserved');
  expectEqual(t11.anchuraEncia, 2, 'gumWidth preserved as anchuraEncia');
  expectEqual(t11.furca.doble.furca1, 1, 'furca1 normalized inside furca.doble');
  expectEqual(t11.furca.doble.furca2, 0, 'furca2 normalized inside furca.doble');

  // Case 2: Spanish block keys also supported
  const input2 = {
    '41': {
      placa: {
        vestibularInferior: [1, 0, 1],
        lingualInferior: [0, 1, 0]
      },
      supuracion: {
        vestibularInferior: [0, 0, 0],
        lingualInferior: [1, 0, 0]
      },
      sangrado: {
        vestibularInferior: [1, 0, 0],
        lingualInferior: [0, 1, 0]
      },
      margenGingival: {
        vestibularInferior: [-1, 0, 2],
        lingualInferior: [2, 1, 0]
      },
      profundidadSondaje: {
        vestibularInferior: [3, 2, 2],
        lingualInferior: [2, 2, 3]
      },
      absent: true,
      implant: false
    }
  };
  const out2 = adaptTeethFromClientPayload(input2);
  const t41 = out2['41'];
  expectEqual(t41.vestibularInferior.placa, [1, 0, 1], 'Spanish placa preserved');
  expectEqual(t41.lingualInferior.placa, [0, 1, 0], 'Spanish placa palatino preserved');
  expectEqual(t41.vestibularInferior.sangrado, [1, 0, 0], 'Spanish sangrado preserved');
  expectEqual(t41.lingualInferior.sangrado, [0, 1, 0], 'Spanish sangrado palatino preserved');
  expectEqual(t41.ausente, true, 'absent -> ausente true');
  expectEqual(t41.implante, false, 'implant -> implante false');

  console.log('\n🎉 Adaptors tests finished');
}

if (require.main === module) {
  run();
}

module.exports = { run };
