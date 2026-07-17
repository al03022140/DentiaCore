module.exports = {
  apps: [
    {
      name: 'dentiacore-api',
      script: 'scripts/dent.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        TZ: 'America/Mexico_City'
      },
      env_development: {
        NODE_ENV: 'development',
        TZ: 'America/Mexico_City'
      }
    }
  ]
};
