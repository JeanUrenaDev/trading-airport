import { useState } from 'react'
import type { FormEvent } from 'react'
import { RESULT_LABEL, formatLong, parseKey, type SessionRecord, type TradeOp } from '../domain'
import { opDollars, patchOpAmounts, withReplicas, type FundAccount, type TakenOp } from '../accounts'

function cashText(value: number): string {
  if (!Number.isFinite(value)) return ''
  return String(Math.round(value * 100) / 100)
}

function readDraft(raw: string): number | null {
  const text = raw.trim()
  if (!/^-?\d+(\.\d{1,2})?$/.test(text)) return null
  const value = Math.round(Number(text) * 100) / 100
  return Number.isFinite(value) ? value : null
}

export function TradesPanel({
  sessions, accounts, locked = false, onOpen, onSave,
}: {
  sessions: SessionRecord[]
  accounts: FundAccount[]
  locked?: boolean
  onOpen: (date: string) => void
  onSave: (session: SessionRecord) => Promise<void>
}) {
  const rows = sessions
    .filter((session) => (session.operations?.length ?? 0) > 0)
    .flatMap((session) => (session.operations ?? []).map((op, index) => ({ session, op, index })))
    .sort((a, b) => b.session.date.localeCompare(a.session.date) || a.index - b.index)

  return (
    <section className="panel">
      <p className="kicker">Operaciones</p>
      <h2>{rows.length === 0 ? 'Todavía no hay trades.' : rows.length === 1 ? '1 trade' : rows.length + ' trades'}</h2>
      <p className="fine">Todas las operaciones, de la más nueva a la más vieja. Cambia la plata de cada cuenta y guarda. Una ganancia va en positivo y una pérdida en negativo, por ejemplo -450. Ese número es el que mueve el balance.</p>
      {rows.length > 0 && (
        <div className="trade-list">
          {rows.map((row) => (
            <TradeCard
              key={row.session.date + '-' + row.index}
              session={row.session}
              op={row.op}
              index={row.index}
              accounts={accounts}
              locked={locked}
              onOpen={onOpen}
              onSave={onSave}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function TradeCard({
  session, op, index, accounts, locked, onOpen, onSave,
}: {
  session: SessionRecord
  op: TradeOp
  index: number
  accounts: FundAccount[]
  locked: boolean
  onOpen: (date: string) => void
  onSave: (session: SessionRecord) => Promise<void>
}) {
  const touched = accounts.filter((account) => withReplicas(op.accounts ?? [], accounts).includes(account.id))
  const movable = op.result === 'win' || op.result === 'loss'
  const [draft, setDraft] = useState<Record<string, string>>(() => {
    const next: Record<string, string> = {}
    for (const account of touched) next[account.id] = cashText(opDollars(account, op, accounts))
    return next
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  async function save(event: FormEvent) {
    event.preventDefault()
    if (locked || !movable) return
    const amounts: Record<string, number> = {}
    const follows: string[] = []
    for (const account of touched) {
      const value = readDraft(draft[account.id] ?? '')
      if (value == null) {
        setSaved(false)
        setError('Escribe la plata de ' + account.name + '. Una pérdida va con menos, como -450.')
        return
      }
      const own = op.amounts?.[account.id]
      const explicit = (op.accounts ?? []).includes(account.id)
      const stillShared = (draft[account.id] ?? '') === cashText(opDollars(account, op, accounts))
      if (own == null && !explicit && stillShared) {
        follows.push(account.id)
        continue
      }
      amounts[account.id] = value
    }
    const patched = patchOpAmounts(op, amounts)
    const operations = (session.operations ?? []).map((item, itemIndex) => (
      itemIndex === index ? patched : item
    ))
    setBusy(true)
    setError('')
    try {
      await onSave({ ...session, operations })
      setDraft((prev) => {
        const next = { ...prev }
        for (const id of follows) {
          const account = accounts.find((item) => item.id === id)
          if (account) next[id] = cashText(opDollars(account, patched, accounts))
        }
        return next
      })
      setSaved(true)
    } catch (reason) {
      setSaved(false)
      setError(reason instanceof Error ? reason.message : 'No se pudo guardar.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="trade-card" onSubmit={(event) => void save(event)}>
      <header>
        <div>
          <strong>{formatLong(parseKey(session.date))}</strong>
          <p className="fine">Operación {index + 1}{op.result ? ' · ' + RESULT_LABEL[op.result] : ''}</p>
        </div>
        <button type="button" onClick={() => onOpen(session.date)}>Abrir día</button>
      </header>
      {touched.length === 0 ? (
        <p className="fine">Esta operación no tiene cuenta. Ábrela en el día para asignarla.</p>
      ) : !movable ? (
        <p className="fine">Tablas. Esta operación no mueve el balance.</p>
      ) : (
        <div className="trade-lines">
          {touched.map((account) => {
            const leader = accounts.find((item) => item.id === account.replicaOf)
            const own = (op as TakenOp).amounts?.[account.id]
            const shared = own == null && leader && (draft[account.id] ?? '') === cashText(opDollars(account, op, accounts))
            return (
              <label key={account.id} className="trade-line">
                <span>
                  {account.name}
                  {shared ? <em> misma plata</em> : leader ? <em> réplica</em> : null}
                </span>
                <input
                  className="cash"
                  type="text"
                  inputMode="decimal"
                  aria-label={'Plata de ' + account.name + ' el ' + session.date}
                  disabled={locked}
                  value={draft[account.id] ?? ''}
                  onChange={(event) => {
                    const raw = event.target.value.replace(/[^\d.-]/g, '')
                    if (raw !== '' && !/^-?\d*\.?\d{0,2}$/.test(raw)) return
                    setSaved(false)
                    setDraft((prev) => ({ ...prev, [account.id]: raw }))
                  }}
                />
              </label>
            )
          })}
        </div>
      )}
      {error ? <p className="alert" role="alert">{error}</p> : null}
      {movable && touched.length > 0 && !locked && (
        <div className="row">
          <button type="submit" className="solid" disabled={busy}>{busy ? 'Guardando…' : saved ? 'Guardado' : 'Guardar'}</button>
          {saved ? <p className="fine">El balance ya usa esta plata.</p> : null}
        </div>
      )}
    </form>
  )
}
