const express = require('express');
const router = express.Router();
const { google } = require('googleapis');

// Configuración del cliente OAuth2
const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

const SCOPES = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/userinfo.email',
];

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

const { oauthLimiter } = require('../middlewares/rateLimiter');

// Endpoint puente: lee el token de la cookie httpOnly y lo devuelve al cliente
// Necesario porque el OAuth callback redirige con ?google_auth=success + cookie
router.get('/auth/token', (req, res) => {
    const accessToken = req.cookies?.google_access_token;
    const refreshToken = req.cookies?.google_refresh_token;
    const expiresIn = req.cookies?.google_expires_in;
    if (!accessToken) {
        return res.status(401).json({ error: 'No hay token de Google en sesión' });
    }
    res.json({
        accessToken,
        refreshToken: refreshToken || null,
        expiresIn: Number(expiresIn) || 3600,
    });
});

// Endpoint de información del usuario autenticado con Google
router.get('/auth/userinfo', async (req, res) => {
    try {
        const authHeader = req.headers.authorization || '';
        const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
        if (!accessToken) {
            return res.status(401).json({ error: 'Se requiere access token en header Authorization' });
        }
        const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!response.ok) {
            return res.status(response.status).json({ error: 'No se pudo obtener información del usuario de Google' });
        }
        const data = await response.json();
        res.json({ email: data.email || null, picture: data.picture || null });
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener información del usuario de Google' });
    }
});

// Ruta para obtener la URL de autorización (montada bajo /api/google)
router.get('/auth/url', oauthLimiter, (req, res) => {
    try {
        // Guard: fail fast if Google credentials are not configured
        if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
            return res.status(503).json({
                error: 'Google Calendar no está configurado. Agrega GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en el archivo Server/.env para habilitar esta función.'
            });
        }

        // Detectar el origen del cliente llamante y validarlo contra la whitelist
        const chosenClientUrl = selectClientUrlFromRequest(req) || getClientUrl();
        const returnPath = sanitizeReturnPath(req.query.returnPath || '');

        // Encode client URL + optional return path in OAuth state
        const statePayload = returnPath
            ? JSON.stringify({ url: chosenClientUrl, path: returnPath })
            : chosenClientUrl;

        const url = oauth2Client.generateAuthUrl({
            access_type: 'offline', // Solicita refresh_token
            scope: SCOPES,
            include_granted_scopes: true,
            prompt: 'consent', // Siempre solicitar consentimiento para obtener refresh_token
            state: encodeURIComponent(statePayload)
        });
        res.json({ url });
    } catch (_error) {
        res.status(500).json({ error: 'Error generando URL de autenticación' });
    }
});

// Callback de OAuth (ruta absoluta bajo /api/google)
router.get('/oauth2callback', oauthLimiter, async (req, res, _next) => {
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

        // Use a per-request client for token exchange to avoid stale singleton state
        const exchangeClient = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI
        );
        const { tokens } = await exchangeClient.getToken(code);
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

        const returnPath = getReturnPathFromState(state);
        return res.redirect(`${clientUrl}${returnPath}?google_auth=success`);
    } catch (error) {
        const errMsg = error.message || String(error);
        console.error('[OAuth callback error]', errMsg);
        const clientUrl = selectClientUrlFromState(req.query.state) || getClientUrl();
        const returnPath = getReturnPathFromState(req.query.state);

        if (errMsg.includes('invalid_grant')) {
            return res.redirect(`${clientUrl}${returnPath}?error=invalid_grant&message=${encodeURIComponent(errMsg)}`);
        }
        if (errMsg.includes('redirect_uri_mismatch')) {
            return res.redirect(`${clientUrl}${returnPath}?error=redirect_uri_mismatch&message=${encodeURIComponent(errMsg)}`);
        }
        if (errMsg.includes('invalid_client')) {
            return res.redirect(`${clientUrl}${returnPath}?error=invalid_client&message=${encodeURIComponent(errMsg)}`);
        }
        return res.redirect(`${clientUrl}${returnPath}?error=auth_error&message=${encodeURIComponent(errMsg)}`);
    }
});

// Listar calendarios del usuario (para selector de calendario destino)
router.get('/calendar/list', async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization || '';
        const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
        if (!accessToken) {
            return res.status(401).json({ error: 'Se requiere access token en header Authorization' });
        }
        const perRequestClient = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI
        );
        perRequestClient.setCredentials({ access_token: accessToken });
        const calendar = google.calendar({ version: 'v3', auth: perRequestClient });
        const response = await calendar.calendarList.list({ minAccessRole: 'writer' });
        const calendars = (response.data.items || []).map(c => ({
            id: c.id,
            summary: c.summary,
            primary: c.primary || false,
            backgroundColor: c.backgroundColor || null,
        }));
        res.json({ calendars });
    } catch (error) {
        next(error);
    }
});

// Obtener eventos del calendario (montada bajo /api/google)
router.get('/calendar/events', async (req, res, next) => {
    try {
        // Only accept token from Authorization header — never from query params (prevents URL logging)
        const authHeader = req.headers.authorization || '';
        const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
        if (!accessToken) {
            return res.status(401).json({ error: 'Se requiere access token en header Authorization' });
        }
        // Crear cliente OAuth2 por solicitud para evitar condiciones de carrera
        const perRequestClient = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI
        );
        perRequestClient.setCredentials({ access_token: accessToken });
        const calendar = google.calendar({ version: 'v3', auth: perRequestClient });

        // Accept optional query params for date range and calendar selection
        const calendarId = req.query.calendarId || 'primary';
        const listParams = {
            calendarId,
            singleEvents: true,
            orderBy: 'startTime',
        };
        if (req.query.timeMin) listParams.timeMin = req.query.timeMin;
        else listParams.timeMin = new Date().toISOString();
        if (req.query.timeMax) listParams.timeMax = req.query.timeMax;
        if (req.query.maxResults) listParams.maxResults = Math.min(Number(req.query.maxResults) || 250, 2500);

        const response = await calendar.events.list(listParams);
        res.json({ items: response.data.items || [] });
    } catch (error) {
        next(error);
    }
});

// Crear evento en Google Calendar (montada bajo /api/google)
router.post('/calendar/events', async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization || '';
        const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
        if (!accessToken) {
            return res.status(401).json({ error: 'Se requiere access token en header Authorization' });
        }
        const { summary, description, location, start, end, calendarId: bodyCalendarId } = req.body;
        if (!summary || !start || !end) {
            return res.status(400).json({ error: 'Se requiere summary, start y end' });
        }
        const perRequestClient = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI
        );
        perRequestClient.setCredentials({ access_token: accessToken });
        const calendar = google.calendar({ version: 'v3', auth: perRequestClient });
        const targetCalendarId = bodyCalendarId || 'primary';
        const response = await calendar.events.insert({
            calendarId: targetCalendarId,
            requestBody: { summary, description, location, start, end },
        });
        res.status(201).json(response.data);
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
 // Supports both legacy plain-URL format and new JSON {url, path} format
 function selectClientUrlFromState(stateParam) {
     if (!stateParam) return null;
     try {
         const decoded = decodeURIComponent(stateParam);
         const allowed = getAllowedClientUrls();
         if (decoded.startsWith('{')) {
             const parsed = JSON.parse(decoded);
             return allowed.includes(parsed.url) ? parsed.url : null;
         }
         return allowed.includes(decoded) ? decoded : null;
     } catch (_e) {
         return null;
     }
 }

 // Helper: sanitize return path to prevent open-redirect attacks
 function sanitizeReturnPath(path) {
     if (!path || typeof path !== 'string') return '';
     if (!path.startsWith('/') || path.startsWith('//')) return '';
     if (path.includes('://')) return '';
     return path;
 }

 // Helper: extract return path from OAuth state parameter
 function getReturnPathFromState(stateParam) {
     if (!stateParam) return '';
     try {
         const decoded = decodeURIComponent(stateParam);
         if (decoded.startsWith('{')) {
             return sanitizeReturnPath(JSON.parse(decoded).path || '');
         }
         return '';
     } catch { return ''; }
 }