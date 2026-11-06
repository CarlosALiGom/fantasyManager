// Analiza traspasos entre mánagers (activityTypeId 1) para distinguir clausulazos de ventas pactadas.
const B = 'http://localhost:3001/api/v1/competition/1'
const L = '018056879'
const get = async (p) => (await fetch(B + p)).json()
const all = []
for (let i = 0; i < 60; i++) { const r = await get(`/leagues/${L}/activity/${i}?x-lang=es`); if (!Array.isArray(r) || !r.length) break; all.push(...r) }
all.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
const DAY = 864e5
const owner = new Map() // player -> { user, at, amount, shieldedAfter }
const out = []
for (const e of all) {
  const pid = e.playerMasterId
  if (e.activityTypeId === 4) { const o = owner.get(pid); if (o) o.shields = (o.shields || 0) + 1; continue }
  if (e.activityTypeId === 33) { owner.delete(pid); continue }
  if (e.activityTypeId === 31) { owner.set(pid, { user: e.user1Id, at: new Date(e.createdAt), amount: e.amount }); continue }
  if (e.activityTypeId === 1) {
    const o = owner.get(pid)
    const known = o && o.user === e.user2Id
    const days = known ? (new Date(e.createdAt) - o.at) / DAY : null
    out.push({ date: e.createdAt.slice(0, 10), pid, amount: e.amount, prev: known ? o.amount : null, ratio: known ? +(e.amount / o.amount).toFixed(3) : null, days: days && +days.toFixed(1), shields: known ? o.shields || 0 : null })
    owner.set(pid, { user: e.user1Id, at: new Date(e.createdAt), amount: e.amount })
  }
}
console.table(out.slice(-60))
const k = out.filter((x) => x.prev)
console.log('total', out.length, 'con origen conocido', k.length, 'ratio==1', k.filter((x) => Math.abs(x.ratio - 1) < 0.005).length, '<14d', k.filter((x) => x.days < 14).length)
