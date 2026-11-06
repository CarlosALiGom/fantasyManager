import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import { useApp } from '../App'
import { ErrorBox, PlayerCell, Spinner, Stat } from '../components'
import SortTable from '../SortTable'
import { useAsync, money, pm, teamName, managerName } from '../utils'

export default function Teams() {
  const { leagueId, myTeamId, openPlayer } = useApp()
  const { teamId: paramId } = useParams()
  const nav = useNavigate()
  const ranking = useAsync(() => api.ranking(leagueId), [leagueId])
  const teams = (ranking.data || []).map((r) => r.team || r)
  const teamId = paramId || myTeamId || teams[0]?.id
  const team = useAsync(() => (teamId ? api.team(leagueId, teamId) : Promise.resolve(null)), [leagueId, teamId])

  if (ranking.loading) return <Spinner />
  if (ranking.error) return <ErrorBox error={ranking.error} onRetry={ranking.reload} />

  const t = team.data || {}
  const players = (t.players || []).map((p) => {
    const m = pm(p)
    return {
      id: m.id, p, name: m.nickname || m.name, pos: Number(m.positionId),
      points: m.points ?? 0, avg: m.averagePoints ?? 0, value: m.marketValue ?? 0,
      clause: p.buyoutClause, clauseLock: p.buyoutClauseLockedEndTime,
    }
  })
  const value = players.reduce((s, p) => s + p.value, 0)

  return (
    <>
      <h1>Plantillas</h1>
      <p className="sub">Consulta los jugadores de cada manager de la liga.</p>
      <div className="tabs">
        {teams.map((tm) => (
          <button key={tm.id} className={String(tm.id) === String(teamId) ? 'on' : ''} onClick={() => nav(`/equipos/${tm.id}`)}>
            {String(tm.id) === String(myTeamId) ? '⭐ ' : ''}{teamName(tm)}
          </button>
        ))}
      </div>
      {team.loading ? <Spinner /> : team.error ? <ErrorBox error={team.error} onRetry={team.reload} /> : (
        <>
          <div className="grid g4" style={{ marginBottom: 18 }}>
            <Stat label="Manager" value={managerName(t) || teamName(teams.find((x) => String(x.id) === String(teamId)))} />
            <Stat label="Jugadores" value={players.length} />
            <Stat label="Valor plantilla" value={money(t.teamValue ?? value)} cls="up" />
            <Stat label="Saldo" value={t.teamMoney != null ? money(t.teamMoney) : 'Oculto'} />
          </div>
          <div className="card">
            <SortTable
              rows={players}
              initial={{ key: 'pos', dir: 1 }}
              onRow={(r) => openPlayer(r.id)}
              columns={[
                { key: 'name', label: 'Jugador', render: (r) => <PlayerCell p={r.p} /> },
                { key: 'pos', label: 'Pos', num: true, render: (r) => ['', 'POR', 'DEF', 'MED', 'DEL', 'ENT'][r.pos] },
                { key: 'points', label: 'Puntos', num: true, render: (r) => <b>{r.points}</b> },
                { key: 'avg', label: 'Media', num: true, render: (r) => Number(r.avg).toFixed(1) },
                { key: 'value', label: 'Valor', num: true, render: (r) => money(r.value) },
                { key: 'clause', label: 'Cláusula', num: true, render: (r) => <>{money(r.clause)}{r.clauseLock && new Date(r.clauseLock) > new Date() ? ' 🔒' : ''}</> },
              ]}
            />
          </div>
        </>
      )}
    </>
  )
}
