/**
 * Configuración ESLint para el Servidor
 * Valida las convenciones de nomenclatura del proyecto
 */

module.exports = {
  env: {
    node: true,
    es2021: true,
    jest: true
  },
  extends: [
    'eslint:recommended'
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module'
  },
  rules: {
    // ── Convenciones de Nomenclatura ──────────────────────────────
    
    // Variables y funciones en camelCase
    'camelcase': [
      'error',
      {
        'properties': 'never', // Permitir snake_case en propiedades (modelos DB)
        'ignoreDestructuring': true,
        'ignoreImports': true,
        'ignoreGlobals': true,
        'allow': [
          // Permitir snake_case para propiedades de modelos
          '^[a-z]+(_[a-z]+)*$',
          // Permitir IDs con sufijo _id
          '^[a-z]+(_[a-z]+)*_id$',
          // Permitir constantes en UPPER_SNAKE_CASE
          '^[A-Z]+(_[A-Z]+)*$'
        ]
      }
    ],

    // Funciones deben ser camelCase
    'func-names': ['error', 'as-needed'],
    
    // ── Calidad de Código ─────────────────────────────────────────
    
    // Evitar variables no utilizadas
    'no-unused-vars': [
      'error',
      {
        'argsIgnorePattern': '^_',
        'varsIgnorePattern': '^_',
        'caughtErrorsIgnorePattern': '^_'
      }
    ],

    // Evitar console.log en producción (permitir console.error)
    'no-console': [
      'warn',
      {
        'allow': ['warn', 'error', 'info']
      }
    ],

    // Requerir punto y coma
    'semi': ['error', 'always'],

    // Comillas simples preferidas
    'quotes': ['error', 'single', { 'allowTemplateLiterals': true }],

    // Indentación de 4 espacios
    'indent': ['error', 4, { 'SwitchCase': 1 }],

    // Espacios alrededor de operadores
    'space-infix-ops': 'error',

    // Espacios en llaves de objetos
    'object-curly-spacing': ['error', 'always'],

    // Espacios en corchetes de arrays
    'array-bracket-spacing': ['error', 'never'],

    // Coma al final en objetos/arrays multilínea
    'comma-dangle': ['error', 'never'],

    // ── Mejores Prácticas ─────────────────────────────────────────
    
    // Evitar var, usar let/const
    'no-var': 'error',
    'prefer-const': 'error',

    // Evitar funciones en loops
    'no-loop-func': 'error',

    // Evitar reasignación de parámetros
    'no-param-reassign': 'error',

    // Evitar return innecesarios
    'no-useless-return': 'error',

    // Evitar else después de return
    'no-else-return': 'error',

    // Requerir await en funciones async
    'require-await': 'error',

    // Evitar promesas no manejadas
    'no-async-promise-executor': 'error',

    // ── Específico para Node.js ───────────────────────────────────
    
    // Evitar require() en callbacks
    'no-mixed-requires': 'error',

    // Evitar new require()
    'no-new-require': 'error',

    // Evitar concatenación de __dirname
    'no-path-concat': 'error',

    // ── Específico para MongoDB/Mongoose ──────────────────────────
    
    // Permitir propiedades con guiones bajos (modelos)
    'no-underscore-dangle': [
      'error',
      {
        'allow': [
          '_id',
          '__v',
          '__dirname',
          '__filename'
        ],
        'allowAfterThis': true,
        'allowAfterSuper': true
      }
    ]
  },
  
  // ── Configuraciones específicas por tipo de archivo ──────────
  overrides: [
    {
      // Archivos de configuración
      files: ['*.config.js', 'config/*.js'],
      rules: {
        'no-console': 'off'
      }
    },
    {
      // Scripts de desarrollo
      files: ['scripts/*.js'],
      rules: {
        'no-console': 'off',
        'no-process-exit': 'off'
      }
    },
    {
      // Archivos de prueba
      files: ['**/*.test.js', '**/*.spec.js', 'test-*.js'],
      env: {
        jest: true,
        mocha: true
      },
      rules: {
        'no-console': 'off',
        'no-unused-expressions': 'off'
      }
    },
    {
      // Modelos de base de datos
      files: ['models/*.js'],
      rules: {
        // Permitir snake_case en modelos
        'camelcase': [
          'error',
          {
            'properties': 'never',
            'ignoreDestructuring': true,
            'allow': [
              // Propiedades de modelos en snake_case
              '^[a-z]+(_[a-z]+)*$',
              '^[a-z]+(_[a-z]+)*_id$',
              // Métodos en camelCase
              '^[a-z][a-zA-Z]*$',
              // Constantes
              '^[A-Z]+(_[A-Z]+)*$'
            ]
          }
        ]
      }
    },
    {
      // Controladores
      files: ['controllers/*.js'],
      rules: {
        // Funciones de controlador deben seguir patrón específico
        'func-names': 'off' // Permitir funciones anónimas en exports
      }
    }
  ],
  
  // ── Ignorar archivos ──────────────────────────────────────────
  ignorePatterns: [
    'node_modules/',
    'uploads/',
    'logs/',
    'tmp/',
    '*.min.js',
    'coverage/'
  ],
  
  // ── Configuración global ──────────────────────────────────────
  globals: {
    // Variables globales de Node.js
    'process': 'readonly',
    'Buffer': 'readonly',
    'global': 'readonly',
    '__dirname': 'readonly',
    '__filename': 'readonly',
    'module': 'readonly',
    'require': 'readonly',
    'exports': 'readonly',
    'console': 'readonly'
  }
};

/**
 * COMANDOS ÚTILES:
 * 
 * # Verificar código
 * npx eslint .
 * 
 * # Corregir automáticamente
 * npx eslint . --fix
 * 
 * # Verificar archivo específico
 * npx eslint controllers/patientsController.js
 * 
 * # Verificar con formato detallado
 * npx eslint . --format=table
 * 
 * INTEGRACIÓN CON PACKAGE.JSON:
 * 
 * "scripts": {
 *   "lint": "eslint .",
 *   "lint:fix": "eslint . --fix",
 *   "lint:check": "eslint . --format=table"
 * }
 * 
 * NOTAS:
 * - Esta configuración valida las convenciones de nomenclatura
 * - Permite snake_case en propiedades de modelos (DB)
 * - Requiere camelCase en funciones y variables
 * - Permite UPPER_SNAKE_CASE en constantes
 * - Incluye reglas de calidad de código
 * - Configuraciones específicas por tipo de archivo
 */