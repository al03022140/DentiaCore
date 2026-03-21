const path = require('path');

function loadDotenv() {
  try {
    return require('dotenv');
  } catch (_) {
    return require(path.resolve(__dirname, 'Server/node_modules/dotenv'));
  }
}

// Cargar .env del servidor si existe
const dotenv = loadDotenv();
dotenv.config({ path: path.resolve(__dirname, 'Server/.env') });
dotenv.config({ path: path.resolve(__dirname, '.env') });

const connectDB = require('./Server/config/db');
const Usuario = require('./Server/models/users');

async function main() {
  try {
    await connectDB({ exitOnFail: false });

    const email = process.argv[2];
    const password = process.argv[3];
    const pin = process.argv[4];
    const nombre = process.argv[5] || 'Administrador Local';

    if (!email || !password || !pin || !/^\d{4}$/.test(pin)) {
      console.error('Uso: node create-admin.js <email> <contraseña> <pin-4-digitos> [nombre]');
      console.error('Ejemplo: node create-admin.js admin@local.test MiClave$egura1 1234 "Administrador Local"');
      console.error('\\nTodos los campos (email, contraseña, pin) son obligatorios.');
      process.exit(1);
    }

    if (password.length < 8) {
      console.error('Error: La contraseña debe tener al menos 8 caracteres.');
      process.exit(1);
    }

    const existing = await Usuario.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      console.log(`Usuario ya existe: ${existing.email}`);
      console.log('Si quieres actualizar la contraseña, usa el endpoint de usuarios o borra el usuario e intenta de nuevo.');
      process.exit(0);
    }

    const user = new Usuario({
      nombre,
      email,
      contraseña: password,
      rol: 'administrador',
      permissions: ['*'],
      active: true
    });

    await user.setPin(pin);

    await user.save();

    console.log('✅ Usuario administrador creado:');
    console.log(`   email: ${email}`);
    console.log('   contraseña: ********');
    console.log(`   pin: ${pin}`);
    console.log('\nRecomendación: cambia la contraseña al iniciar sesión y configura variables de entorno JWT en Server/.env.');
    process.exit(0);
  } catch (err) {
    console.error('Error creando usuario administrador:', err);
    process.exit(1);
  }
}

main();
