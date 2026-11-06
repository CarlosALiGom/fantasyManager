import { api } from '../api'
import { useApp } from '../App'
import { ErrorBox, PlayerCell, Spinner } from '../components'
import { useAsync, money, pm, relTime, teamName } from '../utils'

export default function Market() {
  const { leagueId, openPlayer } = useApp()
  const { loading, data, error, reload } = useAsync(() => api.market(leagueId), [leagueId])
  if (loading) return <Spinner />
  if (error) return <ErrorBox error={error} onRetry={reload} />

  const items = (data || []).map((it) => {
    const m = pm(it)
    const price = it.salePrice ?? m.marketValue
    return { it, m, price, diff: price - (m.marketValue ?? price), seller: it.sellerTeam, bids: it.numberOfBids ?? it.bids?.length ?? 0, myBid: it.bid?.money ?? it.myBid?.money, exp: it.expirationDate }
  }).sort((a, b) => (b.m.points ?? 0) - (a.m.points ?? 0))

  const total = items.reduce((s, i) => s + (i.price || 0), 0)

  return (
    <>
      <h1>Mercado</h1>
      <p className="sub">{items.length} jugadores a la venta · {money(total)} en total</p>
      {!items.length && <div className="card empty">El mercado está vacío.</div>}
      <div className="grid g3">
        {items.map(({ it, m, price, diff, seller, bids, myBid, exp }, i) => (
          <div key={it.id ?? i} className="card pcard" style={{ animationDelay: `${i * 25}ms` }} onClick={() => openPlayer(m.id)}>
            <PlayerCell p={m} />
            <div className="row2"><span>Precio</span><b>{money(price)}</b></div>
            <div className="row2"><span>Valor</span><b>{money(m.marketValue)} {diff ? <span className={diff > 0 ? 'down' : 'up'}>({diff > 0 ? '+' : ''}{money(diff)})</span> : null}</b></div>
            <div className="row2"><span>Puntos / Media</span><b>{m.points ?? 0} · {Number(m.averagePoints ?? 0).toFixed(1)}</b></div>
            <div className="row2"><span>Vendedor</span><b>{seller ? teamName(seller) : 'LaLiga'}</b></div>
            <div className="row2">
              <span>{bids} puja{bids === 1 ? '' : 's'}{myBid ? <> · <span className="up">tu puja {money(myBid)}</span></> : ''}</span>
              <span>{exp ? `cierra ${relTime(exp)}` : ''}</span>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
