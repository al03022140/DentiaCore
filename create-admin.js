const path = require('path');
const mongoose = require('mongoose');

// Cargar .env del servidor si existe
require('dotenv').config({ path: path.resolve(__dirname, 'Server/.env') });
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const connectDB = require('./Server/config/db');
const Usuario = require('./Server/models/users');

async function main() {
  try {
    await connectDB({ exitOnFail: false });

    const email = process.argv[2] || 'admin@local.test';
    const password = process.argv[3] || 'Dentia123!';
    const nombre = process.argv[4] || 'Administrador Local';

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

    await user.save();

    console.log('✅ Usuario administrador creado:');
    console.log(`   email: ${email}`);
    console.log(`   contraseña: ${password}`);
    console.log('\nRecomendación: cambia la contraseña al iniciar sesión y configura variables de entorno JWT en Server/.env.');
    process.exit(0);
  } catch (err) {
    console.error('Error creando usuario administrador:', err);
    process.exit(1);
  }
}

main();
