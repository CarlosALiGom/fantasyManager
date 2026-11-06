import { api } from '../api'
import { ErrorBox, PlayerCell, Spinner, Stat } from '../components'
import { useAsync, money } from '../utils'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

const tip = { contentStyle: { background: '#151a2b', border: '1px solid #334', borderRadius: 10 } }

export const valueSeries = (mv) => (mv || []).map((v) => ({
  date: new Date(v.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
  value: v.marketValue,
}))

export const weekSeries = (player) => {
  const stats = player?.playerStats?.length
    ? player.playerStats.map((s) => ({ n: s.weekNumber, pts: s.totalPoints ?? 0 }))
    : (player?.weekPoints || []).map((w) => ({ n: w.weekNumber, pts: w.points ?? 0 }))
  return stats.sort((a, b) => a.n - b.n).map((s) => ({ week: `J${s.n}`, pts: s.pts }))
}

export default function PlayerModal({ id, onClose }) {
  const player = useAsync(() => api.player(id), [id])
  const mv = useAsync(() => api.marketValue(id), [id])
  const p = player.data
  const values = valueSeries(mv.data)
  const weeks = weekSeries(p)
  const first = values[0]?.value, lastV = values.at(-1)?.value
  const prev = values.at(-2)?.value
  const d1 = lastV != null && prev != null ? lastV - prev : null

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="card modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          {p ? <PlayerCell p={p} /> : <span />}
          <button className="btn" onClick={onClose}>✕</button>
        </div>
        {player.loading ? <Spinner /> : player.error ? <ErrorBox error={player.error} /> : (
          <>
            <div className="grid g4" style={{ marginBottom: 18 }}>
              <Stat label="Puntos" value={p.points ?? 0} cls="up" />
              <Stat label="Media" value={Number(p.averagePoints ?? 0).toFixed(2)} />
              <Stat label="Valor" value={money(p.marketValue ?? lastV)} />
              <Stat label="Último día" value={d1 == null ? '—' : `${d1 >= 0 ? '+' : ''}${money(d1)}`} cls={d1 >= 0 ? 'up' : 'down'} />
            </div>
            <h2>Evolución del valor {first && lastV ? <span className={lastV >= first ? 'up' : 'down'}>({lastV >= first ? '+' : ''}{(((lastV - first) / first) * 100).toFixed(1)}%)</span> : null}</h2>
            {mv.loading ? <Spinner /> : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={values}>
                  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="hsl(152 80% 52%)" stopOpacity={.5} /><stop offset="1" stopColor="hsl(152 80% 52%)" stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid stroke="#ffffff10" />
                  <XAxis dataKey="date" stroke="#8890a8" tick={{ fontSize: 11 }} minTickGap={30} />
                  <YAxis stroke="#8890a8" tickFormatter={money} width={70} domain={['auto', 'auto']} />
                  <Tooltip {...tip} formatter={(v) => money(v)} />
                  <Area dataKey="value" stroke="hsl(152 80% 52%)" fill="url(#g)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
            <h2 style={{ marginTop: 18 }}>Puntos por jornada</h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={weeks}>
                <CartesianGrid stroke="#ffffff10" />
                <XAxis dataKey="week" stroke="#8890a8" tick={{ fontSize: 11 }} />
                <YAxis stroke="#8890a8" />
                <Tooltip {...tip} />
                <Bar dataKey="pts" fill="hsl(265 90% 66%)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </>
        )}
      </div>
    </div>
  )
}
