import { createContext, useContext, useEffect, useState } from 'react'
import { BrowserRouter, NavLink, Route, Routes, Navigate } from 'react-router-dom'
import { api, auth } from './api'
import { Spinner } from './components'
import PlayerModal from './pages/PlayerModal'
import Settings from './pages/Settings'
import Standings from './pages/Standings'
import Teams from './pages/Teams'
import Players from './pages/Players'
import Market from './pages/Market'
import Activity from './pages/Activity'
import Lineup from './pages/Lineup'
import Compare from './pages/Compare'
import Clauses from './pages/Clauses'

const Ctx = createContext(null)
export const useApp = () => useContext(Ctx)

export default function App() {
  const [session, setSession] = useState(null)
  const [week, setWeek] = useState(null)
  const [leagues, setLeagues] = useState([])
  const [leagueId, setLeagueId] = useState(localStorage.getItem('leagueId') || '')
  const [playerId, openPlayer] = useState(null)
  const [leagueErr, setLeagueErr] = useState(null)

  const refreshAuth = async () => {
    const s = await auth.status().catch(() => ({ loggedIn: false }))
    setSession(s)
    if (!s.loggedIn) { setLeagues([]); return }
    {
      try {
        const ls = await api.leagues()
        setLeagues(ls); setLeagueErr(null)
        if (ls.length && !ls.some((l) => String(l.id) === leagueId)) selectLeague(String(ls[0].id))
      } catch (e) { setLeagueErr(e) }
    }
  }
  const selectLeague = (id) => { setLeagueId(id); localStorage.setItem('leagueId', id) }
  useEffect(() => {
    api.currentWeek().then(setWeek).catch(() => {})
    let wasIn = false
    const poll = () => auth.status().then((s) => {
      if (s.loggedIn && !wasIn) refreshAuth(); else setSession(s)
      wasIn = s.loggedIn
    }).catch(() => {})
    poll()
    const t = setInterval(poll, 5_000)
    window.addEventListener('focus', poll)
    return () => { clearInterval(t); window.removeEventListener('focus', poll) }
  }, []) // eslint-disable-line
  const hasToken = session?.loggedIn

  const league = leagues.find((l) => String(l.id) === leagueId)
  const myTeamId = league?.team?.id || league?.teamId || league?.myTeam?.id
  const ready = hasToken && leagueId

  if (session === null) return <Spinner />

  return (
    <Ctx.Provider value={{ leagueId, league, leagues, myTeamId, openPlayer, refreshAuth, hasToken, session, week, leagueErr }}>
      <BrowserRouter>
        <div className="layout">
          <aside className="sidebar">
            <div className="brand">⚽ Liga<span>Manager</span></div>
            {week && <div className="badge" style={{ margin: '-12px 8px 14px', alignSelf: 'flex-start' }}>Temporada 26/27 · Jornada {week.weekNumber}{week.isLive ? ' · EN VIVO' : ''}</div>}
            {leagues.length > 0 && (
              <select id="league-select" className="input" style={{ marginBottom: 14 }} value={leagueId} onChange={(e) => selectLeague(e.target.value)}>
                {leagues.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            )}
            <nav className="nav">
              <NavLink to="/clasificacion">🏆 Clasificación</NavLink>
              <NavLink to="/equipos">👥 Plantillas</NavLink>
              <NavLink to="/jugadores">📊 Jugadores</NavLink>
              <NavLink to="/mercado">💰 Mercado</NavLink>
              <NavLink to="/actividad">📰 Actividad</NavLink>
              <NavLink to="/clausulazos">🔓 Clausulazos</NavLink>
              <NavLink to="/alineacion">🧠 Mi once ideal</NavLink>
              <NavLink to="/comparador">⚖️ Comparador</NavLink>
            </nav>
            <div className="spacer" />
            <nav className="nav"><NavLink to="/ajustes">{hasToken ? '👤 Cuenta' : '🔑 Iniciar sesión'}</NavLink></nav>
          </aside>
          <main className="main">
            <Routes>
              <Route path="/ajustes" element={<Settings />} />
              <Route path="/jugadores" element={<Players />} />
              <Route path="/comparador" element={<Compare />} />
              {ready ? (
                <>
                  <Route path="/clasificacion" element={<Standings />} />
                  <Route path="/equipos" element={<Teams />} />
                  <Route path="/equipos/:teamId" element={<Teams />} />
                  <Route path="/mercado" element={<Market />} />
                  <Route path="/actividad" element={<Activity />} />
                  <Route path="/clausulazos" element={<Clauses />} />
                  <Route path="/alineacion" element={<Lineup />} />
                  <Route path="*" element={<Navigate to="/clasificacion" />} />
                </>
              ) : (
                <Route path="*" element={<Navigate to="/ajustes" />} />
              )}
            </Routes>
          </main>
        </div>
        {playerId && <PlayerModal id={playerId} onClose={() => openPlayer(null)} />}
      </BrowserRouter>
    </Ctx.Provider>
  )
}
