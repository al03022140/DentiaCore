const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, 'Server/.env') });
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const connectDB = require('./Server/config/db');
const Usuario = require('./Server/models/users');

async function main() {
  try {
    await connectDB({ exitOnFail: false });
    const users = await Usuario.find({}, { email: 1, nombre: 1, rol: 1 }).lean();
    console.log('USERS_COUNT:', users.length);
    users.forEach(u => console.log(JSON.stringify(u)));
    process.exit(0);
  } catch (err) {
    console.error('ERROR', err && err.message ? err.message : err);
    process.exit(1);
  }
}

main();