import { POS, POS_CLASS, pm, img, money } from './utils'

export const Spinner = () => <div className="spinner" />

export function ErrorBox({ error, onRetry }) {
  if (!error) return null
  const unauth = error.status === 401 || error.status === 403
  return (
    <div className="card error">
      <p>{unauth ? 'Token caducado o inválido. Ve a Ajustes y pega uno nuevo.' : error.message}</p>
      {error.body && <pre className="raw" style={{ textAlign: 'left' }}>{JSON.stringify(error.body, null, 2).slice(0, 1500)}</pre>}
      {onRetry && <button className="btn" onClick={onRetry}>Reintentar</button>}
    </div>
  )
}

export function Pos({ id }) {
  return <span className={`pos ${POS_CLASS[id] || ''}`}>{POS[id] || '?'}</span>
}

export function Status({ s }) {
  if (!s || s === 'ok') return null
  const cls = s === 'injured' || s === 'out_of_league' ? 'injured' : 'doubt'
  const label = { injured: 'Lesionado', doubtful: 'Duda', suspended: 'Sancionado', out_of_league: 'Fuera' }[s] || s
  return <span className={`badge ${cls}`}>{label}</span>
}

export function PlayerCell({ p, extra }) {
  const m = pm(p)
  return (
    <div className="player">
      <img className="avatar" src={img(m)} alt="" loading="lazy" />
      <div>
        <div className="name">{m.nickname || m.name} <Status s={m.playerStatus} /></div>
        <div className="meta"><Pos id={Number(m.positionId)} /> {m.team?.name} {extra}</div>
      </div>
    </div>
  )
}

export function Stat({ label, value, cls }) {
  return <div className="card stat"><div className="label">{label}</div><div className={`value ${cls || ''}`}>{value}</div></div>
}

export function Money({ v }) { return <>{money(v)}</> }
