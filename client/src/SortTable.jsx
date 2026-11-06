import { useState } from 'react'

// Tabla ordenable genérica. columns: [{ key, label, render?, value?, num? }]
export default function SortTable({ columns, rows, onRow, initial, rowKey = (r, i) => r.id ?? i }) {
  const [sort, setSort] = useState(initial || { key: null, dir: -1 })
  const col = columns.find((c) => c.key === sort.key)
  const val = (r) => (col?.value ? col.value(r) : r[sort.key])
  const sorted = col ? [...rows].sort((a, b) => {
    const x = val(a), y = val(b)
    if (typeof x === 'string' || typeof y === 'string') return String(x ?? '').localeCompare(String(y ?? '')) * sort.dir
    return ((x ?? -Infinity) - (y ?? -Infinity)) * sort.dir
  }) : rows

  return (
    <table>
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.key} className={c.num ? 'num' : ''} onClick={() => setSort({ key: c.key, dir: sort.key === c.key ? -sort.dir : -1 })}>
              {c.label}{sort.key === c.key ? (sort.dir === -1 ? ' ▼' : ' ▲') : ''}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sorted.map((r, i) => (
          <tr key={rowKey(r, i)} className="row" onClick={() => onRow?.(r)}>
            {columns.map((c) => <td key={c.key} className={c.num ? 'num' : ''}>{c.render ? c.render(r) : r[c.key]}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
