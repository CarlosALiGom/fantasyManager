import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useApp } from '../App'
import { ErrorBox, Spinner, Stat } from '../components'
import { useAsync, money, teamName, managerName } from '../utils'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

export default function Standings() {
  const { leagueId, league, myTeamId } = useApp()
  const nav = useNavigate()
  const { loading, data, error, reload } = useAsync(() => api.ranking(leagueId), [leagueId])

  if (loading) return <Spinner />
  if (error) return <ErrorBox error={error} onRetry={reload} />

  const rows = (data || []).map((r, i) => ({
    pos: r.position ?? i + 1,
    points: r.points ?? r.team?.points ?? 0,
    team: r.team || r,
  })).sort((a, b) => a.pos - b.pos)

  const leader = rows[0]
  const totalValue = rows.reduce((s, r) => s + (r.team.teamValue || 0), 0)
  const chart = rows.map((r) => ({ name: teamName(r.team), points: r.points, mine: String(r.team.id) === String(myTeamId) }))

  return (
    <>
      <h1>Clasificación</h1>
      <p className="sub">{league?.name} · {rows.length} managers</p>
      <div className="grid g4" style={{ marginBottom: 18 }}>
        <Stat label="Líder" value={leader ? teamName(leader.team) : '—'} />
        <Stat label="Puntos del líder" value={leader?.points ?? '—'} cls="up" />
        <Stat label="Valor medio plantilla" value={money(totalValue / (rows.length || 1))} />
        <Stat label="Mi posición" value={rows.find((r) => String(r.team.id) === String(myTeamId))?.pos ?? '—'} />
      </div>
      <div className="grid g2">
        <div className="card">
          <table>
            <thead><tr><th>#</th><th>Equipo</th><th className="num">Puntos</th><th className="num">Valor</th><th className="num">Dif.</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.team.id} className="row" onClick={() => nav(`/equipos/${r.team.id}`)}
                  style={String(r.team.id) === String(myTeamId) ? { background: 'hsl(152 80% 52% / .08)' } : undefined}>
                  <td><div className={`rank r${r.pos}`}>{r.pos}</div></td>
                  <td><div className="name" style={{ fontWeight: 600 }}>{teamName(r.team)}</div><div className="meta" style={{ color: 'var(--muted)', fontSize: '.8rem' }}>{managerName(r.team)}</div></td>
                  <td className="num"><b>{r.points}</b></td>
                  <td className="num">{money(r.team.teamValue)}</td>
                  <td className="num down">{r.pos > 1 ? r.points - leader.points : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h2>Puntos por equipo</h2>
          <ResponsiveContainer width="100%" height={Math.max(280, rows.length * 34)}>
            <BarChart data={chart} layout="vertical" margin={{ left: 20 }}>
              <XAxis type="number" stroke="#8890a8" />
              <YAxis type="category" dataKey="name" width={120} stroke="#8890a8" tick={{ fontSize: 12 }} />
              <Tooltip contentStyle={{ background: '#151a2b', border: '1px solid #334', borderRadius: 10 }} />
              <Bar dataKey="points" radius={[0, 8, 8, 0]}>
                {chart.map((c, i) => <Cell key={i} fill={c.mine ? 'hsl(152 80% 52%)' : 'hsl(265 90% 66%)'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  )
}
