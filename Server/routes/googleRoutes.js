const express = require('express');
const router = express.Router();
const { google } = require('googleapis');

// Configuración del cliente OAuth2
const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

const SCOPES = ['https://www.googleapis.com/auth/calendar.events'];

// Guardado temporal de códigos procesados para evitar uso doble y 'invalid_grant'
const processedAuthCodes = new Map(); // code -> timestamp (ms)
const AUTH_CODE_TTL_MS = 5 * 60 * 1000; // 5 minutos
const MAX_PROCESSED_CODES = 1000; // Límite para evitar crecimiento sin control

function hasRecentProcessedCode(code) {
    const ts = processedAuthCodes.get(code);
    if (!ts) return false;
    return Date.now() - ts < AUTH_CODE_TTL_MS;
}
function rememberProcessedCode(code) {
    // Evitar crecimiento sin control del Map
    if (processedAuthCodes.size >= MAX_PROCESSED_CODES) {
        cleanupProcessedCodes();
        // Si sigue lleno después de cleanup, eliminar la entrada más antigua
        if (processedAuthCodes.size >= MAX_PROCESSED_CODES) {
            const oldestKey = processedAuthCodes.keys().next().value;
            processedAuthCodes.delete(oldestKey);
        }
    }
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
        res.json({ url });
    } catch (_error) {
        res.status(500).json({ error: 'Error generando URL de autenticación' });
    }
});

// Callback de OAuth (ruta absoluta bajo /api/google)
router.get('/oauth2callback', async (req, res, _next) => {
    try {
        const { code, error: oauthError, state } = req.query;
        // Determinar URL de cliente objetivo desde el state (si es válido) o fallback
        const clientUrl = selectClientUrlFromState(state) || getClientUrl();
        
        // Verificar si hay errores de OAuth
        if (oauthError) {
            return res.redirect(`${clientUrl}?error=oauth_error&message=${encodeURIComponent(oauthError)}`);
        }
        
        // Validar que el código esté presente
        if (!code) {
            return res.redirect(`${clientUrl}?error=no_code&message=${encodeURIComponent('Código de autorización no recibido')}`);
        }
        
        // Evitar procesar el mismo código dos veces
        cleanupProcessedCodes();
        if (hasRecentProcessedCode(code)) {
            return res.redirect(`${clientUrl}`);
        }

        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);
        rememberProcessedCode(code);
        
        // Redirigir al frontend con tokens en cookies httpOnly en lugar de URL params
        const isProduction = process.env.NODE_ENV === 'production';
        const cookieOptions = {
          httpOnly: true,
          secure: isProduction,
          sameSite: isProduction ? 'strict' : 'lax',
          maxAge: tokens.expiry_date ? (tokens.expiry_date - Date.now()) : 3600000,
          path: '/'
        };

        res.cookie('google_access_token', tokens.access_token, cookieOptions);
        if (tokens.refresh_token) {
          res.cookie('google_refresh_token', tokens.refresh_token, {
            ...cookieOptions,
            maxAge: 30 * 24 * 60 * 60 * 1000 // 30 días para refresh token
          });
        }
        if (tokens.expiry_date) {
          const expiresInSec = Math.max(0, Math.floor((tokens.expiry_date - Date.now()) / 1000));
          res.cookie('google_expires_in', String(expiresInSec), cookieOptions);
        }

        return res.redirect(`${clientUrl}?google_auth=success`);
    } catch (error) {
        // Manejo específico del error invalid_grant
        if (error.message && error.message.includes('invalid_grant')) {
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
        const accessToken = req.headers.authorization?.replace('Bearer ', '') || req.query.accessToken;
        if (!accessToken) {
            return res.status(401).json({ error: 'Se requiere access token' });
        }
        // Crear cliente OAuth2 por solicitud para evitar condiciones de carrera
        const perRequestClient = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI
        );
        perRequestClient.setCredentials({ access_token: accessToken });
        const calendar = google.calendar({ version: 'v3', auth: perRequestClient });
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
        
        // Crear cliente OAuth2 por solicitud para evitar condiciones de carrera
        const perRequestClient = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI
        );
        perRequestClient.setCredentials({ refresh_token: refreshToken });
        
        // Obtener nuevos tokens
        const { credentials } = await perRequestClient.getAccessToken();
        
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
    } catch (_error) {
        res.status(500).json({ 
            error: 'Error renovando token'
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
     } catch (_e) {
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
     } catch (_e) {
         return null;
     }
 }