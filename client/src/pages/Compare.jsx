import { useMemo, useState } from 'react'
import { api } from '../api'
import { ErrorBox, PlayerCell, Spinner } from '../components'
import { useAsync, money } from '../utils'
import { usePlayers, mapPlayer } from './Players'
import { weekSeries } from './PlayerModal'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'

const COLORS = ['hsl(152 80% 52%)', 'hsl(265 90% 66%)']

function Picker({ all, value, onChange, id }) {
  const [q, setQ] = useState('')
  const opts = q.length > 1 ? all.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())).slice(0, 8) : []
  const sel = all.find((p) => p.id === value)
  return (
    <div className="card">
      {sel ? <div style={{ display: 'flex', justifyContent: 'space-between' }}><PlayerCell p={sel.p} /><button className="btn" onClick={() => onChange(null)}>Cambiar</button></div> : (
        <>
          <input id={id} className="input" placeholder="Buscar jugador…" value={q} onChange={(e) => setQ(e.target.value)} />
          {opts.map((p) => <div key={p.id} style={{ padding: '8px 0', cursor: 'pointer' }} onClick={() => { onChange(p.id); setQ('') }}><PlayerCell p={p.p} /></div>)}
        </>
      )}
    </div>
  )
}

export default function Compare() {
  const { loading, data, error, reload } = usePlayers()
  const all = useMemo(() => (data || []).map(mapPlayer), [data])
  const [a, setA] = useState(null)
  const [b, setB] = useState(null)
  const da = useAsync(() => (a ? api.player(a) : Promise.resolve(null)), [a])
  const db = useAsync(() => (b ? api.player(b) : Promise.resolve(null)), [b])

  if (loading) return <Spinner />
  if (error) return <ErrorBox error={error} onRetry={reload} />

  const pa = all.find((p) => p.id === a), pb = all.find((p) => p.id === b)
  const wa = weekSeries(da.data), wb = weekSeries(db.data)
  const weeks = [...new Set([...wa, ...wb].map((w) => w.week))].sort((x, y) => +x.slice(1) - +y.slice(1))
  const chart = weeks.map((w) => ({ week: w, A: wa.find((x) => x.week === w)?.pts, B: wb.find((x) => x.week === w)?.pts }))

  const rows = [
    ['Puntos', (p) => p.points],
    ['Media', (p) => p.avg, (v) => v.toFixed(2)],
    ['Valor', (p) => p.value, money],
    ['Pts por M€', (p) => p.ppm, (v) => v.toFixed(1)],
    ['Temp. pasada', (p) => p.last],
  ]

  return (
    <>
      <h1>Comparador</h1>
      <p className="sub">Enfrenta a dos jugadores cara a cara.</p>
      <div className="grid g2" style={{ marginBottom: 18 }}>
        <Picker id="compare-a" all={all} value={a} onChange={setA} />
        <Picker id="compare-b" all={all} value={b} onChange={setB} />
      </div>
      {pa && pb && (
        <div className="grid g2">
          <div className="card">
            <table>
              <thead><tr><th>Métrica</th><th className="num">{pa.name}</th><th className="num">{pb.name}</th></tr></thead>
              <tbody>
                {rows.map(([label, get, fmt = (v) => v]) => {
                  const x = get(pa), y = get(pb)
                  return (
                    <tr key={label}><td>{label}</td>
                      <td className={`num ${x > y ? 'up' : ''}`}><b>{fmt(x)}</b></td>
                      <td className={`num ${y > x ? 'up' : ''}`}><b>{fmt(y)}</b></td></tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="card">
            <h2>Puntos por jornada</h2>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={chart}>
                <CartesianGrid stroke="#ffffff10" />
                <XAxis dataKey="week" stroke="#8890a8" />
                <YAxis stroke="#8890a8" />
                <Tooltip contentStyle={{ background: '#151a2b', border: '1px solid #334', borderRadius: 10 }} />
                <Legend />
                <Line dataKey="A" name={pa.name} stroke={COLORS[0]} strokeWidth={2} />
                <Line dataKey="B" name={pb.name} stroke={COLORS[1]} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </>
  )
}
