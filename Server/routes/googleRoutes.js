const express = require('express');
const router = express.Router();
const { google } = require('googleapis');
// Logger removido

console.log('🔍 DEBUG: Cargando googleRoutes.js');
console.log('🔍 DEBUG: Registrando rutas de Google...');

// Configuración del cliente OAuth2
const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];

// Guardado temporal de códigos procesados para evitar uso doble y 'invalid_grant'
const processedAuthCodes = new Map(); // code -> timestamp (ms)
const AUTH_CODE_TTL_MS = 5 * 60 * 1000; // 5 minutos

function hasRecentProcessedCode(code) {
    const ts = processedAuthCodes.get(code);
    if (!ts) return false;
    return Date.now() - ts < AUTH_CODE_TTL_MS;
}
function rememberProcessedCode(code) {
    processedAuthCodes.set(code, Date.now());
}
function cleanupProcessedCodes() {
    const now = Date.now();
    for (const [code, ts] of processedAuthCodes.entries()) {
        if (now - ts >= AUTH_CODE_TTL_MS) {
            processedAuthCodes.delete(code);
        }
    }
}

// Ruta para obtener la URL de autorización (montada bajo /api/google)
router.get('/auth/url', (req, res) => {
    console.log('🔍 DEBUG: Ruta /auth/url llamada');
    console.log('🔍 DEBUG: Variables de entorno:');
    console.log('  - GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID ? 'Configurado' : 'NO configurado');
    console.log('  - GOOGLE_CLIENT_SECRET:', process.env.GOOGLE_CLIENT_SECRET ? 'Configurado' : 'NO configurado');
    console.log('  - GOOGLE_REDIRECT_URI:', process.env.GOOGLE_REDIRECT_URI);
    
    try {
        // Detectar el origen del cliente llamante y validarlo contra la whitelist
        const chosenClientUrl = selectClientUrlFromRequest(req) || getClientUrl();

        const url = oauth2Client.generateAuthUrl({
            access_type: 'offline', // Solicita refresh_token
            scope: SCOPES,
            include_granted_scopes: true,
            prompt: 'consent', // Siempre solicitar consentimiento para obtener refresh_token
            // Guardar a qué cliente debemos regresar
            state: encodeURIComponent(chosenClientUrl)
        });
        console.log('✅ DEBUG: URL generada para', chosenClientUrl, ':', url);
        res.json({ url });
    } catch (error) {
        console.error('❌ ERROR generando URL:', error);
        res.status(500).json({ error: 'Error generando URL de autenticación', details: error.message });
    }
});

// Callback de OAuth (ruta absoluta bajo /api/google)
router.get('/oauth2callback', async (req, res, next) => {
    try {
        const { code, error: oauthError, state } = req.query;
        // Determinar URL de cliente objetivo desde el state (si es válido) o fallback
        const clientUrl = selectClientUrlFromState(state) || getClientUrl();
        
        // Verificar si hay errores de OAuth
        if (oauthError) {
            console.error('❌ Error de OAuth recibido:', oauthError);
            return res.redirect(`${clientUrl}?error=oauth_error&message=${encodeURIComponent(oauthError)}`);
        }
        
        // Validar que el código esté presente
        if (!code) {
            console.error('❌ No se recibió código de autorización');
            return res.redirect(`${clientUrl}?error=no_code&message=${encodeURIComponent('Código de autorización no recibido')}`);
        }
        
        // Evitar procesar el mismo código dos veces
        cleanupProcessedCodes();
        if (hasRecentProcessedCode(code)) {
            console.warn('⚠️ Código de autorización YA procesado. Evitando intercambio duplicado.');
            return res.redirect(`${clientUrl}`);
        }

        console.log('🔍 DEBUG: Intercambiando código por tokens...');
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);
        rememberProcessedCode(code);
        console.log("✅ Access Token obtenido:", tokens.access_token);
        console.log("✅ Refresh Token obtenido:", tokens.refresh_token ? "SÍ (se puede renovar automáticamente)" : "NO");
        
        // Redirigir al frontend con el accessToken y refreshToken en la URL
        let redirectUrl = `${clientUrl}?accessToken=${tokens.access_token}`;
        if (tokens.refresh_token) {
            redirectUrl += `&refreshToken=${tokens.refresh_token}`;
        }
        if (tokens && tokens.expiry_date) {
            const expiresInSec = Math.max(0, Math.floor((tokens.expiry_date - Date.now()) / 1000));
            redirectUrl += `&expiresIn=${expiresInSec}`;
        }
        return res.redirect(redirectUrl);
    } catch (error) {
        console.error("❌ Error en callback de OAuth:", error);
        
        // Manejo específico del error invalid_grant
        if (error.message && error.message.includes('invalid_grant')) {
            console.error('❌ Error invalid_grant: El código de autorización ha expirado o ya fue usado');
            const clientUrl = selectClientUrlFromState(req.query.state) || getClientUrl();
            return res.redirect(`${clientUrl}?error=invalid_grant&message=${encodeURIComponent('Código de autorización expirado. Por favor, intenta nuevamente.')}`);
        }
        
        // Otros errores
        const clientUrl = selectClientUrlFromState(req.query.state) || getClientUrl();
        return res.redirect(`${clientUrl}?error=auth_error&message=${encodeURIComponent('Error en la autenticación. Por favor, intenta nuevamente.')}`);
    }
});

// Obtener eventos del calendario (montada bajo /api/google)
router.get('/calendar/events', async (req, res, next) => {
    try {
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
        const response = await calendar.events.list({
            calendarId: 'primary',
            timeMin: new Date().toISOString(),
            maxResults: 10,
            singleEvents: true,
            orderBy: 'startTime'
        });
        res.json(response.data.items);
    } catch (error) {
        next(error);
    }
});

// Renovar access token usando refresh token (montada bajo /api/google)
router.post('/refresh-token', async (req, res) => {
    try {
        const { refreshToken } = req.body;
        
        if (!refreshToken) {
            return res.status(400).json({ error: 'Se requiere refresh_token' });
        }
        
        console.log('🔍 DEBUG: Renovando access token...');
        
        // Configurar el refresh token
        oauth2Client.setCredentials({ refresh_token: refreshToken });
        
        // Obtener nuevos tokens
        const { credentials } = await oauth2Client.refreshAccessToken();
        
        console.log('✅ Access token renovado exitosamente');
        
        // Calcular tiempo de expiración en segundos
        const expiresInSec = credentials.expiry_date 
            ? Math.max(0, Math.floor((credentials.expiry_date - Date.now()) / 1000))
            : 3600; // Default 1 hora
        
        res.json({
            accessToken: credentials.access_token,
            expiresIn: expiresInSec,
            // Incluir el nuevo refresh_token si Google lo proporciona
            refreshToken: credentials.refresh_token || refreshToken
        });
    } catch (error) {
        console.error('❌ Error renovando token:', error);
        res.status(500).json({ 
            error: 'Error renovando token', 
            details: error.message 
        });
    }
});

module.exports = router;
 
 
 // Helper para obtener una sola URL de cliente válida (toma la primera si hay múltiples)
 function getClientUrl() {
     const env = process.env.CLIENT_URL || 'http://localhost:5173';
     if (env.includes(',')) {
         const first = env.split(',').map(u => u.trim()).filter(Boolean)[0];
         return first || 'http://localhost:5173';
     }
     return env.trim();
 }
 
 // Helper: obtener lista de orígenes de cliente permitidos desde env
 function getAllowedClientUrls() {
     const env = process.env.CLIENT_URL || 'http://localhost:5173';
     return env.split(',').map(u => u.trim()).filter(Boolean);
 }
 
 // Helper: seleccionar URL de cliente a partir del request (Origin/Referer) validada
 function selectClientUrlFromRequest(req) {
     try {
         const origin = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : null);
         if (!origin) return null;
         const allowed = getAllowedClientUrls();
         return allowed.includes(origin) ? origin : null;
     } catch (e) {
         return null;
     }
 }
 
 // Helper: seleccionar URL de cliente a partir del parámetro state validado
 function selectClientUrlFromState(stateParam) {
     if (!stateParam) return null;
     try {
         const decoded = decodeURIComponent(stateParam);
         const allowed = getAllowedClientUrls();
         return allowed.includes(decoded) ? decoded : null;
     } catch (e) {
         return null;
     }
 }