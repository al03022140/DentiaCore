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
    'eslint:recommended',
    // Prettier (.prettierrc) es la fuente de verdad del FORMATO. Este preset
    // (eslint-config-prettier) apaga las reglas de formato de ESLint que
    // chocarían con Prettier (indent, comillas, comas finales, etc.).
    // Debe ir al final para anular esas reglas.
    'prettier'
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module'
  },
  rules: {
    // ── Convenciones de Nomenclatura ──────────────────────────────
    
    // ESTRICTO (Fase 0 de normalización): exigir camelCase en variables,
    // funciones Y propiedades. Ya NO se permite snake_case — los campos en
    // español (p. ej. paciente_id, apellido_paterno) se migran en Fases 3-4
    // (ver docs/normalizacion/03-estrategia-migracion.md). Solo se permite
    // UPPER_SNAKE_CASE para constantes y valores de enum.
    'camelcase': [
      'error',
      {
        'properties': 'always',
        'ignoreDestructuring': false,
        'ignoreImports': true,
        'ignoreGlobals': true,
        'allow': [
          '^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$'
        ]
      }
    ],

    // Prohibir identificadores en español (lista inicial; ampliable).
    // Ver docs/normalizacion/01-estandares-tecnicos.md §13.
    'id-denylist': [
      'error',
      'fecha', 'fechaHora', 'nombre', 'apellido', 'contraseña', 'correo',
      'motivo', 'duracion', 'comentario', 'observaciones', 'estado', 'sexo',
      'usuario', 'creado', 'modificado', 'firma'
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

    // El FORMATO (indentación, comillas, comas finales) lo gobierna Prettier
    // vía eslint-config-prettier (ver `extends`). Por eso aquí ya no van
    // 'indent', 'quotes' ni 'comma-dangle': chocaban con .prettierrc
    // (p. ej. ESLint pedía indent 4 / comas "never" y Prettier pide 2 / "es5").

    // Espacios alrededor de operadores
    'space-infix-ops': 'error',

    // Espacios en llaves de objetos
    'object-curly-spacing': ['error', 'always'],

    // Espacios en corchetes de arrays
    'array-bracket-spacing': ['error', 'never'],

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
          '__filename',
          // Helpers internos y campos de documento privados del dominio
          '_evolutionNoteCounter',
          '_capturaExtemporanea'
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
      // NOTA (Fase 0): se eliminó el override que permitía snake_case en
      // models/*.js. Ahora los modelos también exigen camelCase, de modo que
      // los campos legacy en español (paciente_id, apellido_paterno, ...)
      // quedan marcados como deuda a migrar en las Fases 3-4.
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