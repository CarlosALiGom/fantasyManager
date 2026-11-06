import { useState } from 'react'
import { auth } from '../api'
import { useApp } from '../App'
import { ErrorBox } from '../components'

const fmtLeft = (s) => (s > 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : `${Math.floor(s / 60)} min`)

export default function Settings() {
  const { session, refreshAuth, leagues, leagueErr } = useApp()
  const [tab, setTab] = useState('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [redirect, setRedirect] = useState('')
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const run = async (fn, ok) => {
    setBusy(true); setMsg(null)
    try { await fn(); setMsg({ ok: true, text: ok }); await refreshAuth() }
    catch (e) { setMsg({ ok: false, text: e.message }) }
    finally { setBusy(false) }
  }

  const loginPassword = (e) => {
    e.preventDefault()
    run(async () => { await auth.login(email, password); setPassword('') }, 'Sesión iniciada ✔')
  }
  const openOfficial = async () => {
    const { url } = await auth.startInteractive()
    window.open(url, '_blank', 'noopener')
  }

  return (
    <>
      <h1>Cuenta</h1>
      <p className="sub">Conecta con tu cuenta de LaLiga Fantasy mediante el login oficial (Azure B2C de LaLiga). Acceso solo lectura.</p>

      {session?.loggedIn && (
        <div className="card" style={{ marginBottom: 18, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="badge" style={{ color: 'var(--accent)' }}>● Conectado</span>
          {session.user && <b>{session.user}</b>}
          <span className="sub" style={{ margin: 0 }}>Token válido {fmtLeft(session.expiresIn)} · {session.canRefresh ? 'renovación automática activa' : 'sin renovación automática'}</span>
          <div style={{ flex: 1 }} />
          {session.canRefresh && <button className="btn" disabled={busy} onClick={() => run(auth.refresh, 'Token renovado ✔')}>Renovar ahora</button>}
          <button id="logout" className="btn" onClick={() => run(auth.logout, 'Sesión cerrada')}>Cerrar sesión</button>
        </div>
      )}
      {session?.loggedIn && leagues.length > 0 && <p className="sub">Ligas: {leagues.map((l) => l.name).join(', ')}</p>}
      <ErrorBox error={leagueErr} />

      <div className="card" style={{ maxWidth: 720 }}>
        <div className="tabs">
          <button className={tab === 'password' ? 'on' : ''} onClick={() => setTab('password')}>Email y contraseña</button>
          <button className={tab === 'official' ? 'on' : ''} onClick={() => setTab('official')}>Google / Apple / web oficial</button>
          <button className={tab === 'token' ? 'on' : ''} onClick={() => setTab('token')}>Token manual</button>
        </div>

        {tab === 'password' && (
          <form onSubmit={loginPassword} className="grid" style={{ gap: 12 }}>
            <input id="login-email" className="input" type="email" autoComplete="username" placeholder="Email de tu cuenta LaLiga" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <input id="login-password" className="input" type="password" autoComplete="current-password" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <button id="login-submit" className="btn primary" disabled={busy}>{busy ? 'Conectando…' : 'Iniciar sesión'}</button>
            <p className="sub" style={{ margin: 0, fontSize: '.85rem' }}>
              Tu servidor local envía las credenciales directamente a <code>login.laliga.es</code> (la misma página oficial de la app) y solo guarda los tokens resultantes. La contraseña <b>no se almacena</b> en ningún sitio.
            </p>
          </form>
        )}

        {tab === 'official' && (
          <div className="grid" style={{ gap: 12 }}>
            <button id="browser-login" className="btn primary" disabled={busy} onClick={() => run(auth.browserLogin, 'Sesión iniciada ✔')}>
              {busy ? 'Esperando a que inicies sesión en la ventana…' : 'Iniciar sesión con LaLiga / Google (automático)'}
            </button>
            <p className="sub" style={{ margin: 0, fontSize: '.85rem' }}>
              Se abre una ventana de Edge/Chrome con el login oficial. Inicia sesión y se cerrará sola al terminar. La app no ve tu contraseña.
            </p>
            <details>
              <summary className="sub" style={{ cursor: 'pointer' }}>Método manual (si el automático falla)</summary>
            <ol style={{ color: 'var(--muted)', lineHeight: 1.7, paddingLeft: 18, margin: 0 }}>
              <li>Pulsa el botón: se abre el login oficial de LaLiga en otra pestaña.</li>
              <li>Inicia sesión (email, Google o Apple).</li>
              <li>Al terminar, el navegador intentará abrir <code>authredirect://com.lfp.laligafantasy?code=…</code> y fallará (es el esquema de la app móvil). Abre DevTools (F12) → Red/Consola, o la barra de direcciones, y copia esa URL completa.</li>
              <li>Pégala aquí abajo.</li>
            </ol>
            <button id="open-official" className="btn primary" onClick={openOfficial}>Abrir login oficial de LaLiga</button>
            <input id="redirect-url" className="input" placeholder="authredirect://com.lfp.laligafantasy?state=…&code=…" value={redirect} onChange={(e) => setRedirect(e.target.value)} />
            <button className="btn" disabled={busy || !redirect.trim()} onClick={() => run(async () => { await auth.completeInteractive(redirect); setRedirect('') }, 'Sesión iniciada ✔')}>Completar login</button>
            </details>
          </div>
        )}

        {tab === 'token' && (
          <div className="grid" style={{ gap: 12 }}>
            <textarea id="token-input" className="input" placeholder="eyJhbGciOi… (Bearer token)" value={token} onChange={(e) => setToken(e.target.value)} />
            <button className="btn" disabled={busy || !token.trim()} onClick={() => run(async () => { await auth.setToken(token); setToken('') }, 'Token guardado ✔')}>Guardar token</button>
            <p className="sub" style={{ margin: 0, fontSize: '.85rem' }}>Respaldo: sin refresh token, caduca y habrá que repetirlo.</p>
          </div>
        )}

        {msg && <p className={msg.ok ? 'up' : 'down'} style={{ marginBottom: 0 }}>{msg.text}</p>}
      </div>
    </>
  )
}
