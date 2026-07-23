const config = require('../config/env');
/**
 * O-1 (docs/PLAN_CIERRE_V1.md): canal de alerta mínimo — POST de un mensaje
 * a ALERT_WEBHOOK_URL (compatible con Slack/Discord/ntfy.sh/cualquier
 * webhook que acepte {text}). Sin dependencias nuevas (fetch nativo).
 *
 * No-op silencioso si no hay URL configurada, y NUNCA lanza: un fallo al
 * alertar no debe tumbar ni bloquear lo que está siendo monitoreado
 * (uncaughtException, el chequeo de salud programado, etc.).
 */

async function sendAlert(title, detail = {}) {
  const url = config.ops.alertWebhookUrl;
  if (!url) return false;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `🚨 DentiaCore: ${title}`, // clave que Slack/Discord/ntfy renderizan por default
        title,
        detail,
        timestamp: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

module.exports = { sendAlert };
