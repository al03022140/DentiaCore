const swaggerJsdoc = require('swagger-jsdoc');
const path = require('path');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'API de Clínica Dental',
      version: '1.0.0',
      description: 'API para el sistema de gestión de clínica dental',
      contact: {
        name: 'Soporte Técnico',
        email: 'soporte@clinica.com'
      }
    },
    servers: [
      {
        url: process.env.API_URL || 'http://localhost:5000',
        description: 'Servidor de desarrollo'
      }
    ],
    components: {
      schemas: {
        Patient: {
          type: 'object',
          required: ['nombre', 'apellido', 'documento'],
          properties: {
            nombre: { type: 'string' },
            apellido: { type: 'string' },
            documento: {
              type: 'object',
              properties: {
                tipo: { type: 'string', enum: ['Licencia', 'Pasaporte', 'INE', 'Otro'] },
                numero: { type: 'string' }
              }
            },
            fecha_nacimiento: { type: 'string', format: 'date' },
            contacto: {
              type: 'object',
              properties: {
                email: { type: 'string', format: 'email' },
                telefono: { type: 'string' }
              }
            }
          }
        },
        Odontograma: {
          type: 'object',
          properties: {
            imageUrl: { type: 'string' },
            datos: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  diente: { type: 'string' },
                  tipo: { type: 'string' },
                  superficie: { type: 'string' },
                  fecha: { type: 'string', format: 'date-time' }
                }
              }
            },
            history: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  fecha: { type: 'string', format: 'date-time' },
                  imageUrl: { type: 'string' },
                  datos: { type: 'array' }
                }
              }
            }
          }
        },
        Appointment: {
          type: 'object',
          required: ['paciente_id', 'fecha', 'tipo'],
          properties: {
            paciente_id: { type: 'string', format: 'uuid' },
            fecha: { type: 'string', format: 'date-time' },
            tipo: { type: 'string', enum: ['CONSULTA', 'TRATAMIENTO', 'URGENCIA'] },
            estado: { type: 'string', enum: ['PENDIENTE', 'CONFIRMADA', 'CANCELADA'] },
            notas: { type: 'string' }
          }
        }
      },
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    },
    security: [{
      bearerAuth: []
    }]
  },
  apis: [
    path.join(__dirname, '..', 'routes', '*.js'),
    path.join(__dirname, '..', 'models', '*.js')
  ]
};

const specs = swaggerJsdoc(options);

module.exports = specs;