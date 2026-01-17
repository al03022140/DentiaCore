const http = require('http');

const HOST = process.env.HOST || 'localhost';
const PORT = process.env.PORT || 5002;
const PATH = '/api/patients/batch';

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const maleNames = ['Carlos','Juan','Luis','Miguel','Jorge','Andrés','Diego','Fernando','Roberto','Raúl'];
const femaleNames = ['María','Laura','Ana','Sofía','Lucía','Carolina','Isabel','Patricia','Marta','Verónica'];
const lastNames = ['González','Rodríguez','López','Martínez','Pérez','Hernández','Gómez','Sánchez','Ramírez','Torres'];

function randomDateBetweenYears(minAge, maxAge) {
  const now = new Date();
  const maxYear = now.getFullYear() - minAge;
  const minYear = now.getFullYear() - maxAge;
  const year = randomInt(minYear, maxYear);
  const month = randomInt(0,11);
  const day = randomInt(1,28);
  return new Date(year, month, day).toISOString();
}

function generatePatient(index) {
  const isMale = Math.random() < 0.5;
  const primer_nombre = isMale ? maleNames[randomInt(0,maleNames.length-1)] : femaleNames[randomInt(0,femaleNames.length-1)];
  const apellido_paterno = lastNames[randomInt(0,lastNames.length-1)];
  const apellido_materno = lastNames[randomInt(0,lastNames.length-1)];
  const sexo = isMale ? 'Masculino' : 'Femenino';
  const fecha_nacimiento = randomDateBetweenYears(18, 70); // ISO string

  const documento_tipo = ['Licencia','Pasaporte','INE','Otro'][randomInt(0,3)];
  const documento_numero = `TEST-${Date.now().toString().slice(-5)}-${index}`;

  return {
    primer_nombre,
    apellido_paterno,
    apellido_materno,
    sexo,
    fecha_nacimiento,
    documento: {
      tipo: documento_tipo,
      numero: documento_numero
    },
    email: `${primer_nombre.toLowerCase()}.${apellido_paterno.toLowerCase()}${index}@example.com`,
    contacto: {
      telefono: `55${randomInt(10000000,99999999)}`
    }
  };
}

const patients = Array.from({length:25}, (_,i) => generatePatient(i+1));
const payload = JSON.stringify(patients);

const options = {
  hostname: HOST,
  port: PORT,
  path: PATH,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }
};

console.log(`Enviando ${patients.length} pacientes a http://${HOST}:${PORT}${PATH} ...`);

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Estado:', res.statusCode);
    try {
      const parsed = JSON.parse(data);
      console.log('Respuesta:', JSON.stringify(parsed, null, 2));
    } catch (e) {
      console.log('Respuesta (raw):', data);
    }
  });
});

req.on('error', (e) => {
  console.error('Error en la petición:', e.message);
});

req.write(payload);
req.end();
