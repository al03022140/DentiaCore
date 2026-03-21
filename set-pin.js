// Script para actualizar el PIN de un usuario existente
// Uso: node set-pin.js <email> <pin>

const mongoose = require('mongoose');
const connectDB = require('./Server/config/db');
const Usuario = require('./Server/models/users');

async function main() {
  const email = process.argv[2];
  const pin = process.argv[3];
  if (!email || !pin) {
    console.error('Uso: node set-pin.js <email> <pin-4-digitos>');
    process.exit(1);
  }
  if (!/^\d{4}$/.test(pin)) {
    console.error('El PIN debe ser exactamente 4 dígitos numéricos');
    process.exit(1);
  }
  await connectDB({ exitOnFail: false });
  const user = await Usuario.findOne({ email: email.toLowerCase().trim() });
  if (!user) {
    console.error('Usuario no encontrado:', email);
    process.exit(1);
  }
  await user.setPin(pin);
  await user.save();
  console.log('✅ PIN actualizado correctamente para', email);
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
