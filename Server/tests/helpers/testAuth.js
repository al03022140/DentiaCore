/**
 * Bootstrap compartido para tests de integración con supertest + Mongo en
 * memoria. Antes vivía duplicado (mongo connect/disconnect, makeToken,
 * createUser) entre patient-evolution-note.test.js y
 * evolution-note-signing.test.js.
 */
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const jwt = require('jsonwebtoken');

const Usuario = require('../../models/users');
const { getEffectivePermissions } = require('../../utils/permissions');
const { getJwtSecret } = require('../../utils/crypto');

const JWT_SECRET = getJwtSecret();

function makeToken(user) {
  const permissions = getEffectivePermissions(user);
  return jwt.sign(
    { sub: user._id.toString(), role: user.rol, permissions },
    JWT_SECRET,
    { expiresIn: '1h', issuer: 'dentia-core' }
  );
}

async function createUser(overrides = {}) {
  const base = {
    nombre: 'Test User',
    email: `test-user-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`,
    contraseña: 'Password123!',
    rol: 'doctor',
    ...overrides,
  };
  if (['doctor', 'doctor_admin'].includes(base.rol) && !base.cedulaProfesional) {
    base.cedulaProfesional = `CED-${Math.random().toString(36).slice(2, 10)}`;
  }
  const user = await Usuario.create(base);
  return { user, token: makeToken(user) };
}

/**
 * Ciclo de vida de un MongoMemoryServer para usar dentro del beforeAll/afterAll
 * de cada suite. Preserva el orden exacto que ya usaban ambos archivos de test
 * (desconectar cualquier conexión previa antes de reconectar).
 */
function withMongoMemoryServer() {
  let mongoServer;
  return {
    async start() {
      mongoServer = await MongoMemoryServer.create();
      const uri = mongoServer.getUri();
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 5000,
        connectTimeoutMS: 5000,
      });
    },
    async stop() {
      await mongoose.disconnect();
      if (mongoServer) await mongoServer.stop();
    },
  };
}

module.exports = { makeToken, createUser, withMongoMemoryServer };
