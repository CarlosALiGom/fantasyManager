// Cliente de la API de LaLiga Fantasy (vía proxy local, solo lectura).
// Temporada 26/27: los endpoints viven bajo /api/v1/competition/1 en fantasy-api.llt-services.com
const CMP = '/api/v1/competition/1'

async function req(path, init) {
  const r = await fetch(path, init)
  const body = await r.json().catch(() => ({}))
  if (!r.ok) {
    const err = new Error(body?.message || `Error ${r.status} en ${path}`)
    err.status = r.status
    err.body = body
    throw err
  }
  return body
}
const get = (path) => req(path)
const post = (path, data) => req(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data || {}) })

export const auth = {
  status: () => get('/auth/status'),
  login: (email, password) => post('/auth/login', { email, password }),
  startInteractive: () => post('/auth/interactive/start'),
  browserLogin: () => post('/auth/browser-login'),
  completeInteractive: (redirectUrl) => post('/auth/interactive/complete', { redirectUrl }),
  setToken: (token, refreshToken) => post('/auth/token', { token, refreshToken }),
  refresh: () => post('/auth/refresh'),
  logout: () => post('/auth/logout'),
}

// Las respuestas 26/27 a veces vienen envueltas ({ elements }, { data }, { leagues } ...)
const arr = (x) => {
  if (Array.isArray(x)) return x
  for (const k of ['elements', 'data', 'items', 'leagues', 'standing', 'players']) if (Array.isArray(x?.[k])) return x[k]
  return []
}

// Mapa id de club -> datos (nombre, escudo). /v6 de jugadores ya no embebe el club.
let clubsPromise = null
const clubs = () => (clubsPromise ??= get('/api/v3/teams-master?x-lang=es')
  .then((list) => new Map(arr(list).map((t) => [String(t.id), t])))
  .catch(() => { clubsPromise = null; return new Map() }))

const withClub = (p, map) => {
  if (!p || p.team?.name) return p
  const id = p.teamId ?? p.team?.id
  const t = id != null ? map.get(String(id)) : null
  return { ...p, team: t ? { id: t.id, name: t.name, shortName: t.shortName, badgeColor: t.badgeColor } : p.team }
}
const enrich = async (p) => {
  const map = await clubs()
  if (p?.playerMaster) return { ...p, playerMaster: withClub(p.playerMaster, map) }
  return withClub(p, map)
}

// Clasificación 26/27: team.teamPoints en vez de points, sin nombre de equipo
const normStanding = (e, i) => {
  const team = e.team || {}
  return { ...e, position: e.position ?? i + 1, points: e.points ?? team.teamPoints ?? team.points ?? 0, team: { ...team, points: team.points ?? team.teamPoints } }
}

export const api = {
  currentWeek: () => get(`${CMP}/week/current?x-lang=es`),
  leagues: async () => arr(await get(`${CMP}/leagues?x-lang=es`)),
  ranking: async (leagueId) => arr(await get(`${CMP}/leagues/${leagueId}/standing?x-lang=es`)).map(normStanding),
  team: async (leagueId, teamId) => {
    const t = await get(`${CMP}/leagues/${leagueId}/teams/${teamId}?x-lang=es`)
    return { ...t, players: await Promise.all((t.players || []).map(enrich)) }
  },
  market: async (leagueId) => Promise.all(arr(await get(`${CMP}/league/${leagueId}/market?x-lang=es`)).map(enrich)),
  news: async (leagueId, page = 0) => arr(await get(`${CMP}/leagues/${leagueId}/activity/${page}?x-lang=es`)),
  players: async () => { const map = await clubs(); return arr(await get(`${CMP}/players?x-lang=es`)).map((p) => withClub(p, map)) },
  player: async (id) => enrich(await get(`${CMP}/player/${id}?x-lang=es`)),
  marketValue: async (id) => arr(await get(`${CMP}/player/${id}/market-value?x-lang=es`)),
}
