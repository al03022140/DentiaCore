module.exports = {
    headers() {
      return [
        {
          source: '/(.*)', // Aplica a todas las rutas de tu app
          headers: [
            {
              key: 'Content-Security-Policy',
              value: `
                default-src 'self';
                script-src 'self' 'unsafe-inline' 'unsafe-eval' https://accounts.google.com https://www.gstatic.com https://apis.google.com blob: data:;
                connect-src 'self' http://localhost:5000 http://localhost:5002 https://accounts.google.com https://www.googleapis.com https://www.gstatic.com;
                frame-src 'self' https://accounts.google.com;
                img-src 'self' data: https://www.gstatic.com;
                style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
                font-src 'self' https://fonts.gstatic.com;
              `.replace(/\n/g, ''), // Compacta la cadena eliminando saltos de línea
            },
          ],
        },
      ];
    },
  };
  