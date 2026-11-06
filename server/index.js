// Proxy de solo lectura para la API de LaLiga Fantasy (temporada 26/27).
// Dominio correcto: fantasy-api.llt-services.com (api-fantasy.* ya no sirve: 502).
import express from 'express'
import * as auth from './auth.js'

const API = 'https://fantasy-api.llt-services.com'
const PORT = process.env.PORT || 3001

const app = express()
app.use(express.json({ limit: '16kb' }))

const cache = new Map()
const TTL = 60_000

const fail = (res, e) => {
  const http = { invalid_credentials: 401, rate_limited: 429, bad_state: 400, bad_redirect: 400, bad_token: 400, invalid_grant: 401, busy: 409, timeout: 408, cancelled: 400 }[e.code] || 502
  res.status(http).json({ error: e.code || 'error', message: e.message })
  console.error('[auth error]', e.code, e.message)
}

// ---------- auth ----------
app.get('/auth/status', (_req, res) => res.json(auth.status()))
app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body || {}
  if (!email || !password) return res.status(400).json({ error: 'missing', message: 'Email y contraseña requeridos' })
  try { cache.clear(); res.json(await auth.loginWithPassword(String(email), String(password))) } catch (e) { fail(res, e) }
})
app.post('/auth/interactive/start', (_req, res) => res.json(auth.startInteractive()))
app.post('/auth/browser-login', async (_req, res) => {
  try { const s = await auth.loginWithBrowser(); cache.clear(); res.json(s) } catch (e) { fail(res, e) }
})
app.post('/auth/interactive/complete', async (req, res) => {
  try { cache.clear(); res.json(await auth.completeInteractive(req.body?.redirectUrl)) } catch (e) { fail(res, e) }
})
app.post('/auth/token', (req, res) => {
  try { cache.clear(); res.json(auth.setManualToken(req.body?.token, req.body?.refreshToken)) } catch (e) { fail(res, e) }
})
app.post('/auth/refresh', async (_req, res) => { try { res.json(await auth.refresh()) } catch (e) { fail(res, e) } })
app.post('/auth/logout', (_req, res) => { auth.logout(); cache.clear(); res.json({ ok: true }) })

// ---------- proxy solo lectura ----------
async function upstream(path, token) {
  return fetch(API + path, {
    headers: { Accept: 'application/json', 'x-lang': 'es', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    signal: AbortSignal.timeout(20000),
  })
}

app.get(/^\/api\/.*/, async (req, res) => {
  const path = req.originalUrl
  const hit = cache.get(path)
  if (hit && Date.now() - hit.t < TTL) return res.json(hit.body)
  try {
    let token = await auth.getToken()
    let r = await upstream(path, token)
    // 401 con sesión: intenta renovar una vez y reintenta
    if (r.status === 401 && auth.status().canRefresh) {
      try { await auth.refresh(); token = await auth.getToken(); r = await upstream(path, token) } catch { /* sigue con el 401 */ }
    }
    const text = await r.text()
    let body
    try { body = JSON.parse(text) } catch { body = { raw: text.slice(0, 500) } }
    if (r.ok) cache.set(path, { t: Date.now(), body })
    res.status(r.status).json(body)
  } catch (e) {
    res.status(502).json({ error: 'upstream_error', message: e.message })
  }
})
// Cualquier otro método hacia /api se rechaza: la app es solo lectura.
app.all(/^\/api\/.*/, (_req, res) => res.status(405).json({ error: 'read_only', message: 'Esta app es solo lectura' }))

app.listen(PORT, () => console.log(`Proxy LaLiga Fantasy en http://localhost:${PORT} · sesión: ${auth.status().loggedIn ? 'sí' : 'no'}`))

if (process.env.BACKGROUND === '1') process.on('SIGINT', () => console.log('[server] SIGINT ignorado (modo segundo plano)'))
process.on('unhandledRejection', (e) => console.error('[server] unhandledRejection', e))
process.on('uncaughtException', (e) => console.error('[server] uncaughtException', e))
