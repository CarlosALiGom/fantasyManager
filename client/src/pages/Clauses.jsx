import { useMemo, useState } from 'react'
import { api } from '../api'
import { useApp } from '../App'
import { ErrorBox, Spinner } from '../components'
import { useAsync, money } from '../utils'

// ---------------------------------------------------------------------------
// Clausulazos: la API no marca si un traspaso entre mánagers (activityTypeId 1)
// fue un clausulazo o una venta pactada, así que lo deducimos:
//  · Con la cláusula bloqueada (<14 días desde que el vendedor lo adquirió) → pactado.
//  · Importe == valor de mercado de ese día (la cláusula sigue al valor) → clausulazo.
//  · Importe > valor y el vendedor lo había blindado (tipo 4) → clausulazo (blindado).
//  · Importe redondo distinto del valor → pactado.
//  · Resto → dudoso.
// Validado con el historial real de la liga: los clausulazos coinciden al euro con el valor del día.
// ---------------------------------------------------------------------------
const DAY = 864e5
const LOCK_DAYS = 14

async function loadAllActivity(leagueId) {
  const all = []
  for (let page = 0; page < 100; page++) {
    const r = await api.news(leagueId, page)
    if (!r.length) break
    all.push(...r)
  }
  return all.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
}

async function pool(items, n, fn) {
  const out = new Map(); let i = 0
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) { const it = items[i++]; out.set(it, await fn(it).catch(() => null)) }
  }))
  return out
}

const dayKey = (d) => new Date(d).toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' })

function classify(t) {
  if (t.lockedDays != null && t.lockedDays < LOCK_DAYS - 0.01) return { kind: 'pactado', sure: true, why: `Cláusula bloqueada (solo ${t.lockedDays.toFixed(1)} días en su equipo)` }
  if (t.mv && Math.abs(t.amount - t.mv) <= Math.max(2, t.mv * 0.001)) return { kind: 'clausulazo', sure: true, why: 'Importe idéntico al valor de mercado del día (= cláusula)' }
  if (t.mv && t.amount > t.mv && t.shields > 0) return { kind: 'clausulazo', sure: false, why: `Por encima del valor y el vendedor lo había blindado ${t.shields}×` }
  if (t.amount % 10000 === 0) return { kind: 'pactado', sure: false, why: 'Importe redondo distinto del valor de mercado' }
  return { kind: 'pactado', sure: false, why: t.mv ? `Pagó ${((t.amount / t.mv - 1) * 100).toFixed(0)}% sobre el valor sin blindaje previo` : 'Sin datos de valor' }
}

async function build(leagueId) {
  const [activity, ranking, players] = await Promise.all([loadAllActivity(leagueId), api.ranking(leagueId), api.players().catch(() => [])])
  const managers = new Map(ranking.map((r) => [String(r.team?.manager?.id), r.team?.manager?.managerName || 'Mánager']))
  const playerInfo = new Map(players.map((p) => [String(p.id), p]))

  // Reconstrucción de propiedad: quién tiene a cada jugador, desde cuándo y blindajes
  const owner = new Map()
  const transfers = []
  for (const e of activity) {
    const pid = String(e.playerMasterId)
    if (e.activityTypeId === 4) { const o = owner.get(pid); if (o) o.shields++; continue }
    if (e.activityTypeId === 33) { owner.delete(pid); continue }
    if (e.activityTypeId === 31) { owner.set(pid, { user: String(e.user1Id), at: new Date(e.createdAt), shields: 0 }); continue }
    if (e.activityTypeId !== 1) continue
    const o = owner.get(pid)
    const known = o && o.user === String(e.user2Id)
    transfers.push({
      id: e.id, pid, date: e.createdAt, amount: Number(e.amount),
      buyer: String(e.user1Id), seller: String(e.user2Id),
      lockedDays: known ? (new Date(e.createdAt) - o.at) / DAY : null,
      shields: known ? o.shields : 0,
    })
    owner.set(pid, { user: String(e.user1Id), at: new Date(e.createdAt), shields: 0 })
  }

  // Valor de mercado del día de cada traspaso
  const pids = [...new Set(transfers.map((t) => t.pid))]
  const mvs = await pool(pids, 6, (id) => api.marketValue(id))
  for (const t of transfers) {
    const hist = mvs.get(t.pid) || []
    t.mv = hist.find((h) => dayKey(h.date) === dayKey(t.date))?.marketValue ?? null
    Object.assign(t, classify(t))
    const p = playerInfo.get(t.pid)
    t.player = p?.nickname || p?.name || `#${t.pid}`
    t.positionId = p?.positionId
    t.buyerName = managers.get(t.buyer) || `#${t.buyer}`
    t.sellerName = managers.get(t.seller) || `#${t.seller}`
  }
  return { transfers: transfers.reverse(), managers }
}

function Tag({ t }) {
  const isC = t.kind === 'clausulazo'
  const color = isC ? 'var(--warn)' : 'var(--muted)'
  return (
    <span className="badge" title={t.why} style={{ color, borderColor: color, whiteSpace: 'nowrap' }}>
      {isC ? '🔓 Clausulazo' : '🤝 Pactado'}{t.sure ? '' : ' (probable)'}
    </span>
  )
}

export default function Clauses() {
  const { leagueId, openPlayer } = useApp()
  const { loading, data, error, reload } = useAsync(() => build(leagueId), [leagueId])
  const [filter, setFilter] = useState('clausulazo')
  const [who, setWho] = useState('')

  const stats = useMemo(() => {
    if (!data) return null
    const c = data.transfers.filter((t) => t.kind === 'clausulazo')
    const per = new Map()
    const row = (id, name) => per.get(id) || per.set(id, { id, name, made: 0, spent: 0, suffered: 0, earned: 0, victims: new Map() }).get(id)
    for (const t of c) {
      const b = row(t.buyer, t.buyerName); b.made++; b.spent += t.amount
      b.victims.set(t.sellerName, (b.victims.get(t.sellerName) || 0) + 1)
      const s = row(t.seller, t.sellerName); s.suffered++; s.earned += t.amount
    }
    const names = [...new Set(c.flatMap((t) => [t.buyerName, t.sellerName]))].sort()
    const matrix = new Map(c.map((t) => [`${t.buyerName}→${t.sellerName}`, 0]))
    for (const t of c) matrix.set(`${t.buyerName}→${t.sellerName}`, matrix.get(`${t.buyerName}→${t.sellerName}`) + 1)
    const max = Math.max(1, ...matrix.values())
    const top = [...c].sort((a, b) => b.amount - a.amount)[0]
    return { c, per: [...per.values()].sort((a, b) => b.made - a.made || b.spent - a.spent), names, matrix, max, top }
  }, [data])

  const list = useMemo(() => (data?.transfers || [])
    .filter((t) => filter === 'all' || t.kind === filter)
    .filter((t) => !who || t.buyerName === who || t.sellerName === who), [data, filter, who])

  if (loading) return <><h1>Clausulazos</h1><p className="sub">Analizando todo el historial de la liga y el valor de mercado de cada jugador…</p><Spinner /></>
  if (error) return <ErrorBox error={error} onRetry={reload} />

  return (
    <>
      <h1>Clausulazos</h1>
      <p className="sub">
        Quién ha clausulado a quién esta temporada. La API no lo indica, así que se deduce de cada traspaso entre mánagers:
        si el importe coincide al euro con el valor de mercado del día es un clausulazo; si la cláusula estaba bloqueada es una venta pactada.
        Pasa el ratón por la etiqueta para ver el motivo.
      </p>

      <div className="grid g4" style={{ marginBottom: 18 }}>
        <div className="card stat"><div className="sub" style={{ margin: 0 }}>Clausulazos</div><b style={{ fontSize: '1.8rem' }}>{stats.c.length}</b><div className="sub" style={{ margin: 0 }}>de {data.transfers.length} traspasos</div></div>
        <div className="card stat"><div className="sub" style={{ margin: 0 }}>Dinero movido</div><b style={{ fontSize: '1.8rem' }}>{money(stats.c.reduce((s, t) => s + t.amount, 0))}</b></div>
        <div className="card stat"><div className="sub" style={{ margin: 0 }}>Más clausulero</div><b style={{ fontSize: '1.2rem' }}>{stats.per[0]?.name || '—'}</b><div className="sub" style={{ margin: 0 }}>{stats.per[0]?.made || 0} clausulazos</div></div>
        <div className="card stat"><div className="sub" style={{ margin: 0 }}>Clausulazo récord</div><b style={{ fontSize: '1.2rem' }}>{stats.top ? money(stats.top.amount) : '—'}</b><div className="sub" style={{ margin: 0 }}>{stats.top ? `${stats.top.player} · ${stats.top.buyerName}` : ''}</div></div>
      </div>

      <div className="grid g2" style={{ marginBottom: 18, alignItems: 'start' }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Por mánager</h3>
          <table style={{ width: '100%' }}>
            <thead><tr><th style={{ textAlign: 'left' }}>Mánager</th><th>Hechos</th><th>Gastado</th><th>Sufridos</th><th>Ingresado</th><th style={{ textAlign: 'left' }}>Víctima favorita</th></tr></thead>
            <tbody>
              {stats.per.map((m) => {
                const fav = [...m.victims].sort((a, b) => b[1] - a[1])[0]
                return (
                  <tr key={m.id} style={{ cursor: 'pointer' }} onClick={() => setWho(who === m.name ? '' : m.name)}>
                    <td><b style={{ color: who === m.name ? 'var(--accent)' : undefined }}>{m.name}</b></td>
                    <td className="num" style={{ textAlign: 'center', color: 'var(--warn)' }}>{m.made}</td>
                    <td className="num" style={{ textAlign: 'center' }}>{money(m.spent)}</td>
                    <td className="num" style={{ textAlign: 'center', color: 'var(--danger)' }}>{m.suffered}</td>
                    <td className="num" style={{ textAlign: 'center' }}>{money(m.earned)}</td>
                    <td className="sub" style={{ margin: 0 }}>{fav ? `${fav[0]} (${fav[1]})` : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="card" style={{ overflowX: 'auto' }}>
          <h3 style={{ marginTop: 0 }}>Quién clausula a quién</h3>
          <p className="sub" style={{ marginTop: 0, fontSize: '.8rem' }}>Fila = quien paga la cláusula · Columna = a quien se la quitan</p>
          <table style={{ borderCollapse: 'separate', borderSpacing: 3 }}>
            <thead>
              <tr><th />{stats.names.map((n) => <th key={n} style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: '.75rem', fontWeight: 500, color: 'var(--muted)' }}>{n}</th>)}</tr>
            </thead>
            <tbody>
              {stats.names.map((r) => (
                <tr key={r}>
                  <th style={{ textAlign: 'right', fontSize: '.8rem', fontWeight: 500, whiteSpace: 'nowrap', paddingRight: 6 }}>{r}</th>
                  {stats.names.map((c) => {
                    const v = stats.matrix.get(`${r}→${c}`) || 0
                    return (
                      <td key={c} title={v ? `${r} clausuló ${v}× a ${c}` : ''} style={{
                        width: 30, height: 30, textAlign: 'center', borderRadius: 6, fontSize: '.8rem', fontWeight: 700,
                        background: r === c ? 'transparent' : v ? `hsl(40 95% 58% / ${0.15 + 0.75 * v / stats.max})` : 'hsl(230 30% 30% / .15)',
                        color: v / stats.max > 0.5 ? 'hsl(230 30% 7%)' : 'var(--text)',
                      }}>{v || ''}</td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="toolbar">
        <div className="tabs" style={{ margin: 0 }}>
          <button className={filter === 'clausulazo' ? 'on' : ''} onClick={() => setFilter('clausulazo')}>Clausulazos</button>
          <button className={filter === 'pactado' ? 'on' : ''} onClick={() => setFilter('pactado')}>Pactados</button>
          <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>Todos</button>
        </div>
        <select className="input" style={{ maxWidth: 240 }} value={who} onChange={(e) => setWho(e.target.value)}>
          <option value="">Todos los mánagers</option>
          {[...new Set(data.transfers.flatMap((t) => [t.buyerName, t.sellerName]))].sort().map((n) => <option key={n}>{n}</option>)}
        </select>
        <span className="badge">{list.length} operaciones</span>
      </div>

      <div className="card">
        {!list.length && <div className="empty">Nada que mostrar.</div>}
        <table style={{ width: '100%' }}>
          <thead><tr><th style={{ textAlign: 'left' }}>Fecha</th><th style={{ textAlign: 'left' }}>Jugador</th><th style={{ textAlign: 'left' }}>Comprador</th><th style={{ textAlign: 'left' }}>Vendedor</th><th>Importe</th><th>Valor ese día</th><th>Tipo</th></tr></thead>
          <tbody>
            {list.map((t) => (
              <tr key={t.id}>
                <td className="sub" style={{ margin: 0 }}>{new Date(t.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}</td>
                <td><a style={{ cursor: 'pointer', color: 'var(--accent)' }} onClick={() => openPlayer(t.pid)}>{t.player}</a></td>
                <td><b>{t.buyerName}</b></td>
                <td>{t.sellerName}</td>
                <td className="num" style={{ textAlign: 'center' }}>{money(t.amount)}</td>
                <td className="num sub" style={{ textAlign: 'center', margin: 0 }}>{money(t.mv)}</td>
                <td style={{ textAlign: 'center' }}><Tag t={t} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
