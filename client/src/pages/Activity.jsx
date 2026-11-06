import { useState } from 'react'
import { api } from '../api'
import { useApp } from '../App'
import { ErrorBox, Spinner } from '../components'
import { useAsync, money, relTime } from '../utils'

// Las noticias de la liga vienen con formatos variados; intentamos extraer un texto legible.
function describe(n) {
  if (n.title || n.msg || n.text) return [n.title, n.msg || n.text].filter(Boolean).join(' — ')
  const parts = []
  const who = n.userName || n.teamName || n.manager?.managerName || n.team?.name
  const player = n.playerMaster?.nickname || n.player?.nickname || n.playerName
  if (who) parts.push(who)
  if (n.type || n.newsType || n.discr) parts.push(`(${n.type || n.newsType || n.discr})`)
  if (player) parts.push(player)
  if (n.money || n.amount) parts.push(money(n.money || n.amount))
  return parts.join(' ') || JSON.stringify(n).slice(0, 200)
}

export default function Activity() {
  const { leagueId } = useApp()
  const [page, setPage] = useState(0)
  const { loading, data, error, reload } = useAsync(() => api.news(leagueId, page), [leagueId, page])

  return (
    <>
      <h1>Actividad de la liga</h1>
      <p className="sub">Fichajes, cláusulas, ventas y movimientos recientes.</p>
      <div className="toolbar">
        <button className="btn" disabled={page === 0} onClick={() => setPage(page - 1)}>← Más recientes</button>
        <span className="badge">Página {page + 1}</span>
        <button className="btn" onClick={() => setPage(page + 1)}>Más antiguas →</button>
      </div>
      {loading ? <Spinner /> : error ? <ErrorBox error={error} onRetry={reload} /> : (
        <div className="card">
          {!data?.length && <div className="empty">Sin actividad.</div>}
          {data?.map((n, i) => (
            <div key={n.id ?? i} className="news-item">
              <div className="dot" />
              <div style={{ flex: 1 }}>
                <div>{describe(n)}</div>
                <div className="sub" style={{ margin: 0, fontSize: '.8rem' }}>{relTime(n.publicationDate || n.date || n.createdAt)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
