// Autenticación OAuth2 (Azure AD B2C) contra el login oficial de LaLiga.
// Basado en el análisis de sergioalmela/la-liga-fantasy-analyzer y Externoak/LaLigaApp:
//  - Tenant B2C:   login.laliga.es/laligadspprob2c.onmicrosoft.com
//  - Política:     B2C_1A_5ULAIP_PARAMETRIZED_SIGNIN  (la ROPC B2C_1A_ResourceOwnerv2 se retiró en oct-2026)
//  - Client ID:    af88bcff-... (cliente nativo de la app móvil)
//  - Redirect:     authredirect://com.lfp.laligafantasy  (esquema propio de la app → el navegador no puede abrirlo)
//  - Flujo:        Authorization Code + PKCE (S256), scope "openid offline_access" → id_token + refresh_token
// Nunca se guarda la contraseña: solo se usa en memoria durante el login y se descarta.
import crypto from 'node:crypto'
import fs from 'node:fs'

export const CLIENT_ID = 'af88bcff-1157-40a0-b579-030728aacf0b'
const POLICY = 'B2C_1A_5ULAIP_PARAMETRIZED_SIGNIN'
const LOGIN_ORIGIN = 'https://login.laliga.es'
const OAUTH_BASE = `${LOGIN_ORIGIN}/laligadspprob2c.onmicrosoft.com/oauth2/v2.0`
const TOKEN_URL = `${OAUTH_BASE}/token?p=${POLICY}`
const REDIRECT_URI = 'authredirect://com.lfp.laligafantasy'
const SCOPE = 'openid offline_access'
const REFRESH_MARGIN_S = 5 * 60 // renovar si quedan <5 min
const SESSION_FILE = new URL('./.session.json', import.meta.url)

// ---------- utilidades JWT / PKCE ----------
const b64url = (buf) => buf.toString('base64url')
export function decodeJwt(token) {
  try { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()) } catch { return null }
}
const secondsLeft = (token) => {
  const exp = decodeJwt(token)?.exp
  return exp ? exp - Math.floor(Date.now() / 1000) : 0
}
function newPending() {
  const verifier = b64url(crypto.randomBytes(64))
  return { state: b64url(crypto.randomBytes(16)), verifier, challenge: b64url(crypto.createHash('sha256').update(verifier).digest()) }
}
function authorizeUrl(p) {
  const u = new URL(`${OAUTH_BASE}/authorize`)
  u.search = new URLSearchParams({
    p: POLICY, client_id: CLIENT_ID, response_type: 'code', redirect_uri: REDIRECT_URI, scope: SCOPE,
    code_challenge: p.challenge, code_challenge_method: 'S256', state: p.state, nonce: p.state,
  })
  return u.toString()
}
function parseRedirect(input) {
  try {
    const url = new URL(String(input).trim().replace(/^["']|["']$/g, ''))
    if (`${url.protocol}//${url.host}` !== REDIRECT_URI) return { error: 'La URL no es una redirección authredirect://com.lfp.laligafantasy' }
    const q = new URLSearchParams(url.search || url.hash.slice(1))
    if (q.get('error')) return { error: q.get('error_description') || q.get('error') }
    return { code: q.get('code'), state: q.get('state') }
  } catch { return { error: 'URL no válida' } }
}

// ---------- sesión persistida (solo tokens, nunca contraseñas) ----------
let session = fs.existsSync(SESSION_FILE) ? JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8')) : null
function save(s) {
  session = s
  if (s) fs.writeFileSync(SESSION_FILE, JSON.stringify(s, null, 2), { mode: 0o600 })
  else if (fs.existsSync(SESSION_FILE)) fs.unlinkSync(SESSION_FILE)
}
export const logout = () => save(null)

export function status() {
  if (!session) return { loggedIn: false }
  const claims = decodeJwt(session.token) || {}
  return {
    loggedIn: true,
    method: session.method,
    expiresIn: Math.max(0, secondsLeft(session.token)),
    canRefresh: Boolean(session.refreshToken),
    user: claims.email || claims.emails?.[0] || claims.name || claims.given_name || null,
  }
}

// ---------- token endpoint ----------
async function tokenRequest(grant) {
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, scope: SCOPE, ...grant }),
    signal: AbortSignal.timeout(15000),
  })
  const body = await r.json().catch(() => ({}))
  if (!r.ok) {
    const err = new Error(body.error_description?.split('\r\n')[0] || body.error || `Token endpoint ${r.status}`)
    err.code = body.error === 'invalid_grant' ? 'invalid_grant' : r.status === 429 ? 'rate_limited' : 'unavailable'
    throw err
  }
  // B2C devuelve id_token (y access_token solo si se piden scopes de API). La API de Fantasy acepta el id_token.
  const token = [body.access_token, body.id_token].find((t) => typeof t === 'string' && secondsLeft(t) > 0)
  if (!token) throw Object.assign(new Error('Respuesta de token sin JWT válido'), { code: 'unavailable' })
  return { token, refreshToken: body.refresh_token || null }
}

async function storeFromGrant(grant, method) {
  const t = await tokenRequest(grant)
  save({ method, token: t.token, refreshToken: t.refreshToken || session?.refreshToken || null, updatedAt: new Date().toISOString() })
  return status()
}

// Renovación con deduplicación (varias peticiones en paralelo comparten un único refresh)
let refreshing = null
export async function refresh() {
  if (!session?.refreshToken) throw Object.assign(new Error('Sin refresh token'), { code: 'no_refresh' })
  refreshing ??= storeFromGrant({ grant_type: 'refresh_token', refresh_token: session.refreshToken }, session.method)
    .catch((e) => { if (e.code === 'invalid_grant') save(null); throw e })
    .finally(() => { refreshing = null })
  return refreshing
}

/** Devuelve un token válido, renovándolo si está a punto de caducar. */
export async function getToken() {
  if (!session) return null
  if (secondsLeft(session.token) > REFRESH_MARGIN_S) return session.token
  if (session.refreshToken) {
    try { await refresh() } catch (e) { console.warn('[auth] refresh falló:', e.message) }
  }
  return session && secondsLeft(session.token) > 0 ? session.token : null
}

// ---------- Método 1: login interactivo oficial (cualquier cuenta: email, Google, Apple) ----------
const pendings = new Map() // state -> { verifier, createdAt }
export function startInteractive() {
  const p = newPending()
  pendings.set(p.state, { verifier: p.verifier, createdAt: Date.now() })
  for (const [k, v] of pendings) if (Date.now() - v.createdAt > 15 * 60_000) pendings.delete(k)
  return { url: authorizeUrl(p), state: p.state }
}
export async function completeInteractive(redirectUrl) {
  const r = parseRedirect(redirectUrl)
  if (r.error) throw Object.assign(new Error(r.error), { code: 'bad_redirect' })
  const pending = pendings.get(r.state)
  if (!pending) throw Object.assign(new Error('El login ha caducado o no se inició desde esta app. Vuelve a pulsar "Iniciar sesión".'), { code: 'bad_state' })
  pendings.delete(r.state)
  return storeFromGrant({ grant_type: 'authorization_code', code: r.code, code_verifier: pending.verifier, redirect_uri: REDIRECT_URI }, 'interactive')
}

// ---------- Método 1b: ventana real de navegador (Edge/Chrome) que captura la redirección sola ----------
// Abre el login oficial en un perfil persistente propio (.browser-profile) y detecta la redirección
// a authredirect:// (cabecera Location 3xx, petición o navegación). La app nunca ve tu contraseña.
let browserLogin = null
export async function loginWithBrowser({ timeoutMs = 5 * 60_000 } = {}) {
  if (browserLogin) throw Object.assign(new Error('Ya hay una ventana de login abierta.'), { code: 'busy' })
  const { chromium } = await import('playwright-core')
  const { spawn } = await import('node:child_process')
  const p = newPending()
  const profileDir = decodeURIComponent(new URL('./.browser-profile', import.meta.url).pathname).replace(/^\/(\w:)/, '$1')
  const pf = process.env['ProgramFiles'], pf86 = process.env['ProgramFiles(x86)'], local = process.env.LOCALAPPDATA
  const exe = [
    `${pf86}\\Microsoft\\Edge\\Application\\msedge.exe`, `${pf}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${pf}\\Google\\Chrome\\Application\\chrome.exe`, `${pf86}\\Google\\Chrome\\Application\\chrome.exe`, `${local}\\Google\\Chrome\\Application\\chrome.exe`,
  ].find((f) => fs.existsSync(f))
  if (!exe) throw Object.assign(new Error('No se encontró Edge ni Chrome instalado.'), { code: 'unavailable' })

  // `start` abre la ventana en modo normal aunque el servidor corra en una consola oculta
  const port = 9300 + Math.floor(Math.random() * 500)
  spawn('cmd.exe', ['/c', 'start', '""', `"${exe}"`, `--remote-debugging-port=${port}`, `"--user-data-dir=${profileDir}"`,
    '--no-first-run', '--no-default-browser-check', '--window-size=520,760', '--new-window', 'about:blank'],
  { windowsVerbatimArguments: true, detached: true, stdio: 'ignore' }).unref()

  let browser, lastErr
  for (let i = 0; i < 30 && !browser; i++) {
    await new Promise((r) => setTimeout(r, 500))
    try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`) } catch (e) { lastErr = e }
  }
  if (!browser) throw Object.assign(new Error('No se pudo conectar con el navegador: ' + (lastErr?.message || '').split('\n')[0]), { code: 'unavailable' })
  const ctx = browser.contexts()[0]

  browserLogin = new Promise((resolve, reject) => {
    let done = false
    const finish = (err, url) => {
      if (done) return; done = true
      clearTimeout(timer)
      Promise.all(ctx.pages().map((pg) => pg.close().catch(() => {}))).finally(() => browser.close().catch(() => {}))
      err ? reject(err) : resolve(url)
    }
    const check = (u) => { if (typeof u === 'string' && u.startsWith(REDIRECT_URI)) finish(null, u) }
    const timer = setTimeout(() => finish(Object.assign(new Error('Tiempo de login agotado.'), { code: 'timeout' })), timeoutMs)
    ctx.on('response', (r) => { if (r.status() >= 300 && r.status() < 400) check(r.headers().location) })
    ctx.on('request', (r) => check(r.url()))
    ctx.on('requestfailed', (r) => check(r.url()))
    ctx.on('page', (pg) => pg.on('framenavigated', (f) => check(f.url())))
    browser.on('disconnected', () => finish(Object.assign(new Error('Ventana de login cerrada antes de terminar.'), { code: 'cancelled' })))
    const page = ctx.pages()[0] || null
    Promise.resolve(page || ctx.newPage()).then((pg) => {
      pg.on('framenavigated', (f) => check(f.url()))
      return pg.goto(authorizeUrl(p)).catch(() => {})
    }).catch((e) => finish(Object.assign(new Error('No se pudo abrir la página de login: ' + e.message), { code: 'unavailable' })))
  })
  try {
    const url = await browserLogin
    const r = parseRedirect(url)
    if (r.error || r.state !== p.state) throw Object.assign(new Error(r.error || 'Estado OAuth no coincide.'), { code: 'bad_redirect' })
    return await storeFromGrant({ grant_type: 'authorization_code', code: r.code, code_verifier: p.verifier, redirect_uri: REDIRECT_URI }, 'browser')
  } finally { browserLogin = null }
}

// ---------- Método 2: email + contraseña reproduciendo la página oficial de B2C ----------
// (solo cuentas LaLiga con email; Google/Apple requieren el método 1)
function readJsVar(html, name) {
  const m = html.match(new RegExp(`var ${name} = (\\{[\\s\\S]*?\\});\\s*\\n`))
  try { return m ? JSON.parse(m[1]) : null } catch { return null }
}
export async function loginWithPassword(email, password) {
  const p = newPending()
  const jar = new Map()
  const keep = (res) => {
    for (const h of res.headers.getSetCookie()) {
      const [pair] = h.split(';'); const i = pair.indexOf('=')
      if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim())
    }
  }
  const opts = (init = {}) => ({
    ...init, redirect: 'manual', signal: AbortSignal.timeout(15000),
    headers: { ...(init.headers || {}), Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') },
  })

  const page = await fetch(authorizeUrl(p), opts()); keep(page)
  const html = await page.text()
  const settings = readJsVar(html, 'SETTINGS')
  const fields = readJsVar(html, 'SA_FIELDS')?.AttributeFields || []
  const userField = fields.find((f) => f.USER_INPUT_TYPE !== 'Password')?.ID
  const passField = fields.find((f) => f.USER_INPUT_TYPE === 'Password')?.ID
  if (!settings?.csrf || !userField || !passField) throw Object.assign(new Error('La página de login de LaLiga ha cambiado; usa el login interactivo.'), { code: 'unavailable' })

  const base = `${LOGIN_ORIGIN}${settings.hosts.tenant}`
  const tx = new URLSearchParams({ tx: settings.transId, p: settings.hosts.policy })
  const sub = await fetch(`${base}/SelfAsserted?${tx}`, opts({
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-CSRF-TOKEN': settings.csrf, 'X-Requested-With': 'XMLHttpRequest' },
    body: new URLSearchParams({ request_type: 'RESPONSE', [userField]: email, [passField]: password }),
  })); keep(sub)
  const verdict = await sub.json().catch(() => ({}))
  if (sub.status === 429) throw Object.assign(new Error('Demasiados intentos, espera unos minutos.'), { code: 'rate_limited' })
  if (verdict.status === '400' && String(verdict.errorCode || '').startsWith('AADB2C')) throw Object.assign(new Error('Email o contraseña incorrectos.'), { code: 'invalid_credentials' })
  if (verdict.status !== '200') throw Object.assign(new Error(verdict.message || 'Login no disponible.'), { code: 'unavailable' })

  const conf = await fetch(`${base}/api/${settings.api}/confirmed?${new URLSearchParams({ rememberMe: 'false', csrf_token: settings.csrf, ...Object.fromEntries(tx) })}`, opts())
  const r = parseRedirect(conf.headers.get('location') || '')
  if (r.error || r.state !== p.state) throw Object.assign(new Error(r.error || 'No se recibió el código de autorización.'), { code: 'unavailable' })
  return storeFromGrant({ grant_type: 'authorization_code', code: r.code, code_verifier: p.verifier, redirect_uri: REDIRECT_URI }, 'password')
}

// ---------- Método 3 (respaldo): pegar un token manualmente ----------
export function setManualToken(token, refreshToken) {
  const t = String(token || '').replace(/^Bearer\s+/i, '').trim()
  if (secondsLeft(t) <= 0) throw Object.assign(new Error('Token inválido o caducado'), { code: 'bad_token' })
  save({ method: 'manual', token: t, refreshToken: refreshToken || null, updatedAt: new Date().toISOString() })
  return status()
}
