import { useMemo, useState } from 'react'
import { api } from '../api'
import { useApp } from '../App'
import { ErrorBox, PlayerCell, Spinner } from '../components'
import SortTable from '../SortTable'
import { useAsync, money, pm } from '../utils'

export const usePlayers = () => useAsync(() => api.players(), [])

export const mapPlayer = (p) => {
  const m = pm(p)
  return {
    id: m.id, p: m, name: m.nickname || m.name || '', pos: Number(m.positionId), club: m.team?.name || '',
    points: m.points ?? 0, avg: Number(m.averagePoints ?? 0), value: m.marketValue ?? 0,
    status: m.playerStatus, last: m.lastSeasonPoints ?? 0,
    ppm: m.marketValue ? (m.points ?? 0) / (m.marketValue / 1e6) : 0,
  }
}

export default function Players() {
  const { openPlayer } = useApp()
  const { loading, data, error, reload } = usePlayers()
  const [q, setQ] = useState('')
  const [pos, setPos] = useState('')
  const [club, setClub] = useState('')
  const [limit, setLimit] = useState(100)

  const all = useMemo(() => (data || []).map(mapPlayer), [data])
  const clubs = useMemo(() => [...new Set(all.map((p) => p.club))].filter(Boolean).sort(), [all])
  const rows = all.filter((p) =>
    (!q || p.name.toLowerCase().includes(q.toLowerCase())) && (!pos || p.pos === Number(pos)) && (!club || p.club === club))

  if (loading) return <Spinner />
  if (error) return <ErrorBox error={error} onRetry={reload} />

  return (
    <>
      <h1>Jugadores</h1>
      <p className="sub">{all.length} jugadores · puntos, media, valor y rentabilidad (puntos por millón).</p>
      <div className="toolbar">
        <input id="player-search" className="input" placeholder="Buscar jugador…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select id="pos-filter" className="input" value={pos} onChange={(e) => setPos(e.target.value)}>
          <option value="">Todas las posiciones</option>
          <option value="1">Porteros</option><option value="2">Defensas</option><option value="3">Medios</option><option value="4">Delanteros</option><option value="5">Entrenadores</option>
        </select>
        <select id="club-filter" className="input" value={club} onChange={(e) => setClub(e.target.value)}>
          <option value="">Todos los equipos</option>
          {clubs.map((c) => <option key={c}>{c}</option>)}
        </select>
        <span className="badge">{rows.length} resultados</span>
      </div>
      <div className="card">
        <SortTable
          rows={rows.slice(0, limit)}
          initial={{ key: 'points', dir: -1 }}
          onRow={(r) => openPlayer(r.id)}
          columns={[
            { key: 'name', label: 'Jugador', render: (r) => <PlayerCell p={r.p} /> },
            { key: 'points', label: 'Puntos', num: true, render: (r) => <b>{r.points}</b> },
            { key: 'avg', label: 'Media', num: true, render: (r) => r.avg.toFixed(1) },
            { key: 'value', label: 'Valor', num: true, render: (r) => money(r.value) },
            { key: 'ppm', label: 'Pts/M€', num: true, render: (r) => r.ppm.toFixed(1) },
            { key: 'last', label: 'Temp. pasada', num: true },
          ]}
        />
        {rows.length > limit && <div className="empty"><button className="btn" onClick={() => setLimit(limit + 100)}>Ver más</button></div>}
      </div>
    </>
  )
}
