const path = require('path');

function loadDotenv() {
  try {
    return require('dotenv');
  } catch (_) {
    return require(path.resolve(__dirname, 'Server/node_modules/dotenv'));
  }
}

const dotenv = loadDotenv();
dotenv.config({ path: path.resolve(__dirname, 'Server/.env') });
dotenv.config({ path: path.resolve(__dirname, '.env') });

const connectDB = require('./Server/config/db');
const InventoryItem = require('./Server/models/inventoryItem');

const dias = (n) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

// Cubre los estados que pinta InventoryPage: OK, stock bajo, sin stock,
// caducado y por caducar — y varía longitud de nombre/categoría/unidad
// para probar la tipografía con contenido real.
const ITEMS = [
  {
    nombre: 'Anestesia Lidocaína 2% c/epinefrina caja x50 cartuchos',
    categoria: 'Anestesia', unidad: 'caja', stockMinimo: 3,
    lote: { cantidad: 12, caducidad: dias(200) }
  },
  {
    nombre: 'Resina compuesta fotocurable A2',
    categoria: 'Restauración', unidad: 'jeringa', stockMinimo: 5,
    lote: { cantidad: 2, caducidad: dias(300) } // stock bajo
  },
  {
    nombre: 'Guantes de nitrilo talla M',
    categoria: 'Desechables', unidad: 'caja', stockMinimo: 10
    // sin lote → sin stock
  },
  {
    nombre: 'Ácido grabador 37%',
    categoria: 'Restauración', unidad: 'jeringa', stockMinimo: 2,
    lote: { cantidad: 6, caducidad: dias(-5) } // caducado
  },
  {
    nombre: 'Hipoclorito de sodio 5.25%',
    categoria: 'Endodoncia', unidad: 'frasco', stockMinimo: 3,
    lote: { cantidad: 8, caducidad: dias(10) } // por caducar
  },
  {
    nombre: 'Fresas de diamante alta velocidad set x10',
    categoria: 'Instrumental', unidad: 'set', stockMinimo: 1,
    lote: { cantidad: 4, caducidad: null } // no caduca
  },
  {
    nombre: 'Hilo de sutura seda 3-0',
    categoria: 'Cirugía', unidad: 'caja', stockMinimo: 2,
    lote: { cantidad: 5, caducidad: dias(400) }
  },
  {
    nombre: 'Alcohol antiséptico 70%',
    categoria: 'Limpieza y desinfección', unidad: 'litro', stockMinimo: 4,
    lote: { cantidad: 1, caducidad: dias(60) } // stock bajo
  }
];

async function main() {
  await connectDB({ exitOnFail: false });

  let creados = 0;
  let saltados = 0;

  for (const spec of ITEMS) {
    const nombreNormalizado = spec.nombre.trim().toLowerCase();
    const existente = await InventoryItem.findOne({ nombreNormalizado, deletedAt: null });
    if (existente) {
      console.log(`↷ Ya existe, se omite: "${spec.nombre}"`);
      saltados++;
      continue;
    }

    const item = new InventoryItem({
      nombre: spec.nombre,
      categoria: spec.categoria,
      unidad: spec.unidad,
      stockMinimo: spec.stockMinimo
    });

    if (spec.lote) {
      item.lotes.push({
        cantidadInicial: spec.lote.cantidad,
        cantidadActual: spec.lote.cantidad,
        caducidad: spec.lote.caducidad
      });
    }

    await item.save();
    console.log(`✅ Creado: "${item.nombre}" (stock ${item.stockTotal} ${item.unidad})`);
    creados++;
  }

  console.log(`\n${creados} ítems creados, ${saltados} omitidos (ya existían).`);
  process.exit(0);
}

main().catch(err => {
  console.error('Error al sembrar inventario de prueba:', err);
  process.exit(1);
});
