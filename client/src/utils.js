import { useEffect, useState, useCallback } from 'react'

export const POS = { 1: 'POR', 2: 'DEF', 3: 'MED', 4: 'DEL', 5: 'ENT' }
export const POS_CLASS = { 1: 'pos-gk', 2: 'pos-df', 3: 'pos-md', 4: 'pos-fw', 5: 'pos-co' }

export const pm = (p) => p?.playerMaster || p || {}

export const money = (n) => {
  if (n == null || isNaN(n)) return '—'
  const v = Number(n)
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M€'
  if (Math.abs(v) >= 1e3) return Math.round(v / 1e3) + 'K€'
  return v + '€'
}

export const img = (p) => {
  const m = pm(p)
  return m.image || m.images?.transparent?.['256x256'] || m.images?.beat?.['256x256'] || m.images?.big?.['256x256'] || ''
}

export const teamName = (t) => t?.name || t?.teamName || t?.manager?.managerName || 'Equipo'
export const managerName = (t) => t?.manager?.managerName || t?.manager?.name || t?.managerName || ''

export const relTime = (d) => {
  if (!d) return ''
  const s = (new Date(d) - Date.now()) / 1000
  const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' })
  const abs = Math.abs(s)
  if (abs < 3600) return rtf.format(Math.round(s / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(s / 3600), 'hour')
  return rtf.format(Math.round(s / 86400), 'day')
}

export function useAsync(fn, deps) {
  const [state, set] = useState({ loading: true, data: null, error: null })
  const run = useCallback(() => {
    set((s) => ({ ...s, loading: true, error: null }))
    fn().then((data) => set({ loading: false, data, error: null }))
      .catch((error) => set({ loading: false, data: null, error }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  useEffect(() => { run() }, [run])
  return { ...state, reload: run }
}
