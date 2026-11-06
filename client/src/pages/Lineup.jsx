import { useState } from 'react'
import { api } from '../api'
import { useApp } from '../App'
import { ErrorBox, PlayerCell, Spinner } from '../components'
import { useAsync, img, pm } from '../utils'

const FORMATIONS = ['4-4-2', '4-3-3', '3-4-3', '3-5-2', '4-5-1', '5-3-2', '5-4-1']
const METRICS = { avg: 'Media de puntos', points: 'Puntos totales', form: 'Forma (media + estado)' }

function score(m, metric) {
  const avg = Number(m.averagePoints ?? 0)
  if (metric === 'points') return m.points ?? 0
  if (metric === 'form') return m.playerStatus && m.playerStatus !== 'ok' ? avg * 0.2 : avg
  return avg
}

function best(players, metric) {
  const by = (pos) => players.filter((p) => Number(p.positionId) === pos).sort((a, b) => score(b, metric) - score(a, metric))
  const gk = by(1), df = by(2), md = by(3), fw = by(4)
  let top = null
  for (const f of FORMATIONS) {
    const [d, m, a] = f.split('-').map(Number)
    if (!gk.length || df.length < d || md.length < m || fw.length < a) continue
    const lines = [gk.slice(0, 1), df.slice(0, d), md.slice(0, m), fw.slice(0, a)]
    const total = lines.flat().reduce((s, p) => s + score(p, metric), 0)
    if (!top || total > top.total) top = { f, lines, total }
  }
  return top
}

export default function Lineup() {
  const { leagueId, myTeamId, openPlayer } = useApp()
  const [metric, setMetric] = useState('form')
  const { loading, data, error, reload } = useAsync(() => (myTeamId ? api.team(leagueId, myTeamId) : Promise.reject(new Error('No se encontró tu equipo en esta liga'))), [leagueId, myTeamId])

  if (loading) return <Spinner />
  if (error) return <ErrorBox error={error} onRetry={reload} />

  const players = (data?.players || []).map(pm)
  const top = best(players, metric)
  const inXI = new Set(top?.lines.flat().map((p) => p.id))
  const bench = players.filter((p) => !inXI.has(p.id) && Number(p.positionId) !== 5)

  return (
    <>
      <h1>Mi once ideal</h1>
      <p className="sub">Recomendación automática con tu plantilla, probando todas las formaciones.</p>
      <div className="toolbar">
        {Object.entries(METRICS).map(([k, v]) => (
          <button key={k} className={`btn ${metric === k ? 'primary' : ''}`} onClick={() => setMetric(k)}>{v}</button>
        ))}
      </div>
      {!top ? <div className="card empty">No hay jugadores suficientes para formar un once.</div> : (
        <div className="grid g2">
          <div className="card">
            <h2>Formación {top.f} · {top.total.toFixed(1)} pts estimados</h2>
            <div className="pitch">
              {top.lines.map((line, i) => (
                <div key={i} className="line">
                  {line.map((p) => (
                    <div key={p.id} className="slot" onClick={() => openPlayer(p.id)} style={{ cursor: 'pointer' }}>
                      <img src={img(p)} alt="" />
                      <div style={{ fontWeight: 600 }}>{p.nickname}</div>
                      <div className="pts">{score(p, metric).toFixed(1)}</div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <h2>Banquillo</h2>
            {bench.map((p) => (
              <div key={p.id} style={{ padding: '8px 0', cursor: 'pointer' }} onClick={() => openPlayer(p.id)}>
                <PlayerCell p={p} extra={`· ${score(p, metric).toFixed(1)}`} />
              </div>
            ))}
            {!bench.length && <div className="empty">Sin suplentes.</div>}
          </div>
        </div>
      )}
    </>
  )
}
