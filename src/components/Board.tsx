import { useEffect, useMemo, useState } from 'react'
import {
  MONTHS,
  RESULT_LABEL,
  WEEKDAYS_MON_FIRST,
  WEEKDAYS_SHORT,
  answersPass,
  blankAnswers,
  disciplineStreak,
  formName,
  formatLong,
  lossLine,
  monthLabel,
  monthMatrix,
  monthStats,
  cleanPnl,
  normalizeStake,
  stakeFromPnl,
  resultCurve,
  orderedDisciplined,
  parseKey,
  operationsPass,
  dayMark,
  pieceForDate,
  toKey,
  weekdayName,
  type Answer,
  type AnswerValue,
  type Result,
  type RuleDef,
  type SessionRecord,
  type TradeOp,
} from '../domain'
import { unlockName } from '../unlocks'
import type { PetStore } from '../store'
import { crateLevels, dayCalls, judgeDay, money, opDollars, pickBook, readBook, withReplicas, withinDailyRisk, writeBook, type AccountBook, type FundAccount } from '../accounts'
import { AccountsPanel } from './Accounts'
import { TradesPanel } from './Trades'
import { Airport } from './Airport'
import { FishTank } from './AppleCube'

export function Board({ store, onSignOut, banner, readOnly = false }: { store: PetStore; onSignOut?: () => void; banner?: string; readOnly?: boolean }) {
  const [rules, setRules] = useState<RuleDef[]>([])
  const [sessions, setSessions] = useState<SessionRecord[]>([])
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'ano' | 'numeros' | 'reglas' | 'cuentas' | 'trades'>('ano')
  const [cursor, setCursor] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })
  const [selected, setSelected] = useState<string | null>(null)
  const [punch, setPunch] = useState(false)
  const [burst, setBurst] = useState<string | null>(null)
  const [book, setBook] = useState<AccountBook>(() => readBook())

  async function reload() {
    const [nextRules, nextSessions] = await Promise.all([store.loadRules(), store.loadSessions()])
    const nextBook = pickBook(nextSessions, readOnly ? { updated: '', accounts: [] } : readBook())
    if (!readOnly) writeBook(nextBook)
    setRules(nextRules)
    setSessions(nextSessions)
    setBook(nextBook)
  }

  useEffect(() => {
    let alive = true
    reload()
      .catch((reason: unknown) => {
        if (alive) setError(reason instanceof Error ? reason.message : 'No pude leer tus datos.')
      })
    return () => {
      alive = false
    }
  }, [store, readOnly])

  const ordered = useMemo(() => orderedDisciplined(sessions), [sessions])
  const count = ordered.length
  const levels = useMemo(() => crateLevels(book.accounts, sessions), [book.accounts, sessions])
  const streak = disciplineStreak(sessions)
  const nextPiece = unlockName(count + 1)

  async function commitBook(next: AccountBook) {
    if (readOnly) return
    const stamped = { ...next, updated: next.updated || new Date().toISOString() }
    writeBook(stamped)
    setBook(stamped)
    const revised = sessions.map((session) => {
      const ops = session.operations ?? []
      if (session.status !== 'completed' || ops.length === 0) return session
      const disciplined = operationsPass(ops) && withinDailyRisk(stamped.accounts, ops)
      return disciplined === session.disciplined ? session : { ...session, disciplined }
    })
    const pending = new Map<string, SessionRecord>()
    revised.forEach((session, index) => {
      if (session.disciplined !== sessions[index]?.disciplined) pending.set(session.date, { ...session, book: stamped })
    })
    const latest = [...revised].sort((a, b) => b.date.localeCompare(a.date))[0]
    if (latest && !pending.has(latest.date)) pending.set(latest.date, { ...latest, book: stamped })
    if (pending.size === 0) return
    const before = ordered.length
    for (const session of pending.values()) await store.saveSession(session)
    const nextSessions = await store.loadSessions()
    setSessions(nextSessions)
    const after = orderedDisciplined(nextSessions).length
    if (after > before) {
      setBurst(unlockName(after))
      setPunch(true)
      window.setTimeout(() => setPunch(false), 700)
    } else {
      setBurst(null)
    }
  }

  async function persist(session: SessionRecord) {
    const before = pieceForDate(session.date, ordered)
    await store.saveSession(session)
    const nextSessions = await store.loadSessions()
    setSessions(nextSessions)
    const after = pieceForDate(session.date, orderedDisciplined(nextSessions))
    if (after > 0 && before === 0) {
      setBurst(unlockName(after))
      setPunch(true)
      window.setTimeout(() => setPunch(false), 700)
    } else {
      setBurst(null)
    }
  }

  return (
    <div className="shell">
      <header className="top">
        <div>
          <p className="kicker">De aeródromo a imperio</p>
          <h1>AIRPORT</h1>
        </div>
        <p className="count">
          {String(count).padStart(3, '0')}
          <span>{count > 365 ? 'exp' : '/365'}</span>
        </p>
        {onSignOut ? <button type="button" className="ghost" onClick={onSignOut}>Salir</button> : <span />}
      </header>
      {banner ? <p className="banner">{banner}</p> : null}
      {error ? <p className="alert" role="alert">{error}</p> : null}

      <section className="windows">
        <div className={punch ? "stage punch" : "stage"}>
          <span className="window-label">Aeropuerto</span>
          <Airport day={count} />
          {burst ? <p className="burst">Día {count} · {burst}</p> : null}
        </div>
        <div className="stage cube-stage">
          <span className="window-label">Pecera</span>
          <FishTank levels={levels} />
          <p className="map-hint">{levels.length === 0 ? '$0 de $3,000' : levels.map((level) => `${level.name} ${money(level.carried)}`).join(' · ')}</p>
        </div>
      </section>
        <aside className="dossier">
          <p className="kicker">{formName(count)}</p>
          <h2>{count === 0 ? 'Todavía no hay hito.' : unlockName(count)}</h2>
          <p>{count === 0 ? 'El primer día limpio abre el aeródromo. El dinero no cuenta.' : lossLine(null, true)}</p>
          <dl>
            <div><dt>Racha</dt><dd>{streak}</dd></div>
            <div><dt>Siguiente</dt><dd>{nextPiece ?? 'Año cerrado'}</dd></div>
          </dl>
          <p className="fine">Hasta 3 operaciones por día. El aeropuerto crece solo si todas respetaron las reglas. Un día sin operar no es un fallo. Hay una pecera por cuenta, y el agua de cada una sube con lo que esa cuenta lleva.</p>
          <ol className="rail">
            {[
              [30, 'Aeródromo'],
              [90, 'Terminal'],
              [150, 'Internacional'],
              [210, 'VIP'],
              [300, 'Mega'],
              [365, 'Leyenda'],
            ].map(([mark, name]) => (
              <li key={name} className={count >= Number(mark) ? 'on' : ''}>
                <strong>{mark}</strong>
                {name}
              </li>
            ))}
          </ol>
        </aside>

      <nav className="tabs">
        <button type="button" className={tab === 'ano' ? 'on' : ''} onClick={() => setTab('ano')}>Año</button>
        <button type="button" className={tab === 'numeros' ? 'on' : ''} onClick={() => setTab('numeros')}>Números</button>
        <button type="button" className={tab === 'reglas' ? 'on' : ''} onClick={() => setTab('reglas')}>Reglas</button>
        <button type="button" className={tab === 'cuentas' ? 'on' : ''} onClick={() => setTab('cuentas')}>Cuentas</button>
        <button type="button" className={tab === 'trades' ? 'on' : ''} onClick={() => setTab('trades')}>Trades</button>
      </nav>

      {tab === 'ano' && (
        <Calendar
          sessions={sessions}
          ordered={ordered}
          accounts={book.accounts}
          year={cursor.year}
          month={cursor.month}
          onMonth={(year, month) => setCursor({ year, month })}
          onPick={setSelected}
        />
      )}
      {tab === 'numeros' && <Numbers sessions={sessions} year={cursor.year} month={cursor.month} onMonth={(year, month) => setCursor({ year, month })} />}
      {tab === 'reglas' && (
        <Rules
          rules={rules}
          locked={readOnly}
          onAdd={async (text) => {
            await store.addRule(text, rules.length + 1)
            setRules(await store.loadRules())
          }}
          onRename={async (id, text) => {
            await store.renameRule(id, text)
            setRules(await store.loadRules())
          }}
          onRemove={async (id) => {
            await store.removeRule(id)
            setRules(await store.loadRules())
          }}
        />
      )}

      {tab === 'cuentas' && <AccountsPanel book={book} sessions={sessions} locked={readOnly} onSave={(next) => void commitBook(next)} />}
      {tab === 'trades' && (
        <TradesPanel
          sessions={sessions}
          accounts={book.accounts}
          locked={readOnly}
          onOpen={(date) => {
            setTab('ano')
            setSelected(date)
          }}
          onSave={async (session) => {
            await persist({ ...session, book })
          }}
        />
      )}

      {selected && (
        <DaySheet
          key={selected}
          dateKey={selected}
          rules={rules}
          accounts={book.accounts}
          existing={sessions.find((session) => session.date === selected)}
          piece={pieceForDate(selected, ordered)}
          history={sessions}
          locked={readOnly}
          onClose={() => setSelected(null)}
          onSave={async (session) => {
            await persist({ ...session, book })
            setSelected(null)
          }}
        />
      )}
    </div>
  )
}

function Calendar({
  sessions, ordered, accounts, year, month, onMonth, onPick,
}: {
  sessions: SessionRecord[]
  ordered: SessionRecord[]
  accounts: FundAccount[]
  year: number
  month: number
  onMonth: (year: number, month: number) => void
  onPick: (date: string) => void
}) {
  const byDate = new Map(sessions.map((session) => [session.date, session]))
  const today = toKey(new Date())
  const weeks = monthMatrix(year, month)
  const years = new Set<number>()
  const now = new Date().getFullYear()
  for (let value = now - 2; value <= now + 1; value += 1) years.add(value)
  years.add(year)

  function shift(delta: number) {
    const next = new Date(year, month + delta, 1)
    onMonth(next.getFullYear(), next.getMonth())
  }

  return (
    <section className="panel">
      <div className="cal-head">
        <h2>{monthLabel(year, month)}</h2>
        <div className="row">
          <button type="button" onClick={() => shift(-1)}>Anterior</button>
          <select aria-label="Mes" value={String(month)} onChange={(event) => onMonth(year, Number(event.target.value))}>
            {MONTHS.map((name, index) => <option key={name} value={index}>{name}</option>)}
          </select>
          <select aria-label="Año" value={String(year)} onChange={(event) => onMonth(Number(event.target.value), month)}>
            {[...years].sort().map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <button type="button" onClick={() => shift(1)}>Siguiente</button>
        </div>
      </div>
      <div className="dow">
        {WEEKDAYS_MON_FIRST.map((day) => <span key={day}>{day.slice(0, 3)}</span>)}
      </div>
      <div className="weeks">
        {weeks.map((week) => (
          <div className="week" key={toKey(week[0])}>
            {week.map((date) => {
              const key = toKey(date)
              const outside = date.getMonth() !== month
              const session = byDate.get(key)
              const piece = pieceForDate(key, ordered)
              const mark = session ? dayMark(session) : null
              const label = session?.status === 'rest' ? 'Descanso' : 'Libre'
              const taken = (session?.operations ?? []).some((op) => (op.accounts?.length ?? 0) > 0)
              const calls = taken ? dayCalls(accounts, session?.operations ?? []) : session?.balances ? judgeDay(accounts, sessions, key, session.balances) : []
              const brokeRisk = calls.some((call) => !call.good)
              const title = mark
                ? (piece > 0 ? 'Hito ' + piece + '. ' : '') + (mark.net > 0 ? 'Ganancia ' : mark.net < 0 ? 'Pérdida ' : 'En cero ') + mark.net + '. ' + (mark.letter === 'c' ? 'Cumplió las reglas.' : 'No cumplió las reglas.') + (brokeRisk ? ' Violaste el riesgo.' : '')
                : label
              return (
                <button
                  key={key}
                  type="button"
                  disabled={outside}
                  className={[
                    'cell',
                    outside ? 'out' : '',
                    key === today ? 'today' : '',
                    mark && mark.net > 0 ? 'gain' : '',
                    mark && mark.net < 0 ? 'loss' : '',
                    session?.status === 'rest' ? 'rest' : '',
                  ].filter(Boolean).join(' ')}
                  title={outside ? undefined : title}
                  onClick={() => onPick(key)}
                >
                  <span>{WEEKDAYS_SHORT[date.getDay()]}</span>
                  <strong>{date.getDate()}</strong>
                  {!outside && mark && <em className="mark">{mark.net} {mark.letter}</em>}
                  {!outside && !mark && <em>{label}</em>}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </section>
  )
}

function blankTrade(rules: RuleDef[]): TradeOp {
  return { answers: blankAnswers(rules), result: null, learned: '', analysis: '', risk: 1, reward: 3 }
}

function sameAccounts(left?: string[], right?: string[]): boolean {
  return [...(left ?? [])].sort().join() === [...(right ?? [])].sort().join()
}

function keptLegacy(op: TradeOp, saved?: TradeOp): boolean {
  if (!saved || saved.result !== op.result) return false
  if (saved.pnl != null || saved.amounts) return false
  if (op.pnl != null || (op.amounts && Object.keys(op.amounts).length > 0)) return false
  return sameAccounts(saved.accounts, op.accounts)
}

function missingPnl(op: TradeOp, saved?: TradeOp): boolean {
  if (op.result !== 'win' && op.result !== 'loss') return false
  const ids = op.accounts ?? []
  if (ids.length === 0 || keptLegacy(op, saved)) return false
  if ((!op.amounts || Object.keys(op.amounts).length === 0) && cleanPnl(op.pnl) != null) return false
  return ids.some((id) => cleanPnl(op.amounts?.[id]) == null)
}

function withAmounts(op: TradeOp, book: FundAccount[], saved?: TradeOp, previous?: Result | null): TradeOp {
  if (op.result !== 'win' && op.result !== 'loss') return op
  if (keptLegacy(op, saved)) return op
  const next: Record<string, number> = {}
  for (const id of op.accounts ?? []) {
    const account = book.find((item) => item.id === id)
    if (!account) continue
    const current = op.amounts?.[id]
    const previousPlan = previous === 'win' ? account.risk * 3 : previous === 'loss' ? -account.risk : undefined
    const planned = op.result === 'win' ? account.risk * 3 : -account.risk
    if (current != null && Number.isFinite(current) && current !== previousPlan) next[id] = current
    else if (account.risk > 0) next[id] = planned
    else if (current != null && Number.isFinite(current)) next[id] = current
  }
  return { ...op, amounts: next, pnl: undefined }
}

function settleOp(op: TradeOp, book: FundAccount[]): TradeOp {
  const amounts: Record<string, number> = {}
  for (const id of op.accounts ?? []) {
    const value = cleanPnl(op.amounts?.[id])
    if (value != null) amounts[id] = value
  }
  const hasAmounts = Object.keys(amounts).length > 0
  const pnl = hasAmounts || (op.result !== 'win' && op.result !== 'loss') ? undefined : cleanPnl(op.pnl)
  const first = book.find((item) => amounts[item.id] != null && item.risk > 0)
    ?? book.find((item) => (op.accounts ?? []).includes(item.id) && item.risk > 0)
  const cash = first ? (amounts[first.id] ?? pnl) : pnl
  const units = cash != null && first ? stakeFromPnl(Math.abs(cash), first.risk) : undefined
  return {
    ...op,
    amounts: hasAmounts ? amounts : undefined,
    pnl,
    risk: op.result === 'loss' && units != null ? units : normalizeStake(op.risk),
    reward: op.result === 'win' && units != null ? units : normalizeStake(op.reward, 3),
  }
}

function sourceCash(account: FundAccount, op: TradeOp, book: FundAccount[]): number {
  const members = book.filter((item) =>
    item.id !== account.id
    && (op.accounts ?? []).includes(item.id)
    && withReplicas([item.id], book).includes(account.id),
  )
  const source = members.find((item) => !members.some((other) => other.id === item.replicaOf)) ?? members[0]
  if (!source) return opDollars(account, { ...op, amounts: undefined }, book)
  const own = op.amounts?.[source.id]
  if (own != null && Number.isFinite(own)) return own
  return opDollars(source, { ...op, amounts: undefined }, book)
}

function cashTextFor(account: FundAccount, op: TradeOp, book: FundAccount[], explicit: boolean, follows: boolean, draft?: string): string {
  if (draft != null) return draft
  const own = op.amounts?.[account.id]
  if (own != null && Number.isFinite(own)) return String(own)
  if (!explicit && !follows) return ''
  if (op.result !== 'win' && op.result !== 'loss') return ''
  const dollars = follows ? sourceCash(account, op, book) : opDollars(account, { ...op, amounts: undefined }, book)
  if (!Number.isFinite(dollars) || dollars === 0) return ''
  return String(Math.round(dollars * 100) / 100)
}

function fillShownCash(op: TradeOp, book: FundAccount[]): TradeOp {
  if (op.result !== 'win' && op.result !== 'loss') return op
  const amounts: Record<string, number> = { ...(op.amounts ?? {}) }
  let changed = false
  for (const id of op.accounts ?? []) {
    if (amounts[id] != null && Number.isFinite(amounts[id])) continue
    const account = book.find((item) => item.id === id)
    if (!account) continue
    const text = cashTextFor(account, op, book, true, false)
    if (text === '' || text === '-') continue
    const value = Number(text)
    if (!Number.isFinite(value)) continue
    amounts[id] = value
    changed = true
  }
  if (!changed) return op
  return { ...op, amounts, pnl: undefined }
}

function pnlLine(op: TradeOp, book: FundAccount[]): string {
  if (op.result !== 'win' && op.result !== 'loss') return 'No mueve el agua.'
  const touched = book.filter((account) => withReplicas(op.accounts ?? [], book).includes(account.id))
  let delta = 0
  for (const account of touched) delta += opDollars(account, op, book)
  if (!Number.isFinite(delta) || delta === 0) return 'No mueve el agua.'
  return delta > 0 ? `El agua sube ${money(delta)}.` : `El agua baja ${money(Math.abs(delta))}.`
}

function initialOps(existing: SessionRecord | undefined, rules: RuleDef[]): TradeOp[] {
  if (existing?.operations && existing.operations.length > 0) {
    return existing.operations.slice(0, 3).map((op) => ({ ...op, risk: op.risk ?? 1, reward: op.reward ?? 1 }))
  }
  if (existing?.status === 'completed') {
    return [{
      answers: existing.answers.length ? existing.answers : blankAnswers(rules),
      result: existing.result,
      learned: existing.learned,
      risk: 1,
      reward: 1,
    }]
  }
  return [blankTrade(rules)]
}

function DaySheet({
  dateKey, rules, accounts, existing, piece, history, locked = false, onClose, onSave,
}: {
  dateKey: string
  rules: RuleDef[]
  accounts: FundAccount[]
  existing?: SessionRecord
  piece: number
  history: SessionRecord[]
  locked?: boolean
  onClose: () => void
  onSave: (session: SessionRecord) => Promise<void>
}) {
  const date = parseKey(dateKey)
  const future = dateKey > toKey(new Date())
  const [mode, setMode] = useState<'trade' | 'rest'>(existing?.status === 'rest' ? 'rest' : 'trade')
  const [ops, setOps] = useState<TradeOp[]>(() => initialOps(existing, rules))
  const [active, setActive] = useState(0)
  const [note, setNote] = useState(existing?.note ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [cashDraft, setCashDraft] = useState<Record<string, string>>({})
  const current = ops[Math.min(active, ops.length - 1)]
  const shown: TradeOp = (() => {
    const amounts = { ...(current.amounts ?? {}) }
    for (const [key, raw] of Object.entries(cashDraft)) {
      if (!key.startsWith(active + ':')) continue
      const id = key.slice(String(active).length + 1)
      const value = Number(raw)
      if (raw === '' || raw === '-' || !Number.isFinite(value)) continue
      amounts[id] = value
    }
    return Object.keys(amounts).length > 0 ? { ...current, amounts } : current
  })()
  const clean = operationsPass(ops)
  const leaders = accounts.filter((account) => !account.replicaOf || !accounts.some((item) => item.id === account.replicaOf))
  const calls = dayCalls(accounts, ops)
  const breaches = calls.filter((call) => !call.good)
  const pastAnalyses = history.flatMap((session) =>
    (session.operations ?? []).map((op, index) => ({
      key: session.date + "-" + index,
      label: session.date + " · " + (op.analysis ?? "").trim().replace(/\s+/g, " ").slice(0, 48),
      text: (op.analysis ?? "").trim(),
    })).filter((item) => item.text),
  )

  function update(next: TradeOp) {
    setOps((list) => list.map((op, index) => (index === active ? next : op)))
  }

  async function save(next: SessionRecord) {
    setBusy(true)
    setError('')
    try {
      await onSave(next)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo guardar.')
      setBusy(false)
    }
  }

  return (
    <div className="sheet-back" onMouseDown={onClose}>
      <form
        className="sheet"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault()
          if (locked) return
          if (mode === 'rest') {
            void save({ date: dateKey, status: 'rest', result: null, learned: '', note, answers: [], operations: [], disciplined: false })
            return
          }
          if (ops.length > 3) {
            setError('Máximo 3 operaciones por día.')
            return
          }
          if (ops.some((op) => op.answers.some((answer) => answer.value === null))) {
            setError('Responde todas las preguntas de cada operación. En la pasiva también vale No aplicaba.')
            return
          }
          if (ops.some((op) => !op.result)) {
            setError('Cada operación necesita ganancia, pérdida o tablas.')
            return
          }
          const ready = ops.map((op) => fillShownCash(op, accounts))
          if (ready.some((op, index) => missingPnl(op, existing?.operations?.[index]))) {
            setError('Escribe cuánto ganaste o perdiste en cada operación.')
            return
          }
          void save({
            date: dateKey,
            status: 'completed',
            result: ready[0].result,
            learned: ready.map((op) => op.learned).filter(Boolean).join(' · '),
            note,
            answers: ready[0].answers,
            operations: ready.map((op) => settleOp(op, accounts)),
            disciplined: operationsPass(ready) && breaches.length === 0,
          })
        }}
      >
        <div className="sheet-top">
          <div>
            <p className="kicker">{weekdayName(date)}</p>
            <h2>{formatLong(date)}</h2>
          </div>
          <button type="button" onClick={onClose}>Cerrar</button>
        </div>
        {future ? (
          <p>Este día todavía no llega. Los registros viejos siguen guardados.</p>
        ) : locked && !existing ? (
          <p>Este día no tiene registro.</p>
        ) : (
          <div className={locked ? 'locked-view' : undefined}>
            <div className="choice">
              <button type="button" className={mode === 'trade' ? 'on' : ''} onClick={() => setMode('trade')}>Operé</button>
              <button type="button" className={mode === 'rest' ? 'on' : ''} onClick={() => setMode('rest')}>No operé</button>
            </div>
            {mode === 'rest' ? (
              <p>Día libre. No suma hito y no cuenta como fallo.</p>
            ) : (
              <>
                <div className="choice op-tabs">
                  {ops.map((op, index) => (
                    <button key={index} type="button" data-result={op.result ?? ""} className={index === active ? 'on' : ''} onClick={() => setActive(index)}>
                      Operación {index + 1}
                    </button>
                  ))}
                  {!locked && ops.length < 3 && (
                    <button type="button" onClick={() => { setOps((list) => [...list, blankTrade(rules)]); setActive(ops.length) }}>
                      Otra
                    </button>
                  )}
                  {!locked && ops.length > 1 && (
                    <button type="button" onClick={() => { setOps((list) => list.filter((_, index) => index !== active)); setActive(0) }}>
                      Quitar
                    </button>
                  )}
                </div>
                {current.answers.map((answer) => (
                  <fieldset key={answer.id}>
                    <legend>{answer.text}</legend>
                    <div className="choice">
                      <button type="button" className={answer.value === 'yes' ? 'on' : ''} onClick={() => update({ ...current, answers: mark(current.answers, answer.id, 'yes') })}>Sí</button>
                      <button type="button" className={answer.value === 'no' ? 'on no' : ''} onClick={() => update({ ...current, answers: mark(current.answers, answer.id, 'no') })}>No</button>
                      {answer.kind === 'tri' && (
                        <button type="button" className={answer.value === 'na' ? 'on' : ''} onClick={() => update({ ...current, answers: mark(current.answers, answer.id, 'na') })}>No aplicaba</button>
                      )}
                    </div>
                  </fieldset>
                ))}
                <fieldset>
                  <legend>Resultado de esta operación</legend>
                  <div className="choice">
                    {(['win', 'loss', 'breakeven'] as Result[]).map((item) => (
                      <button key={item} type="button" className={current.result === item ? 'on' : ''} onClick={() => { setCashDraft({}); update(withAmounts({ ...current, result: item }, accounts, existing?.operations?.[active], current.result)) }}>
                        {RESULT_LABEL[item]}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <label>
                  ¿Qué aprendí en esta operación?
                  <textarea value={current.learned} rows={3} maxLength={500} onChange={(event) => update({ ...current, learned: event.target.value })} />
                </label>
                <label>
                  Análisis realizado
                  <textarea
                    value={current.analysis ?? ""}
                    rows={4}
                    maxLength={2000}
                    onChange={(event) => {
                      setCopied(false)
                      update({ ...current, analysis: event.target.value })
                    }}
                  />
                </label>
                <div className="row">
                  <button
                    type="button"
                    onClick={() => {
                      const text = (current.analysis ?? "").trim()
                      if (!text) return
                      void navigator.clipboard.writeText(text).then(() => setCopied(true)).catch(() => setError("No se pudo copiar. Selecciona el texto del análisis."))
                    }}
                  >{copied ? "Copiado" : "Copiar análisis"}</button>
                </div>
                {!locked && pastAnalyses.length > 0 && (
                  <label>
                    Traer un análisis anterior
                    <select
                      value=""
                      onChange={(event) => {
                        const found = pastAnalyses.find((item) => item.key === event.target.value)
                        if (!found) return
                        setCopied(false)
                        update({ ...current, analysis: found.text })
                      }}
                    >
                      <option value="">Elegir uno</option>
                      {pastAnalyses.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                    </select>
                  </label>
                )}
                <fieldset>
                  <legend>Cuenta de fondeo</legend>
                  {accounts.length === 0 ? <p className="fine">Cuando abras una cuenta, aquí eliges en cuál tomaste la operación.</p> : (
                    <>
                      <div className="choice">
                        <button
                          type="button"
                          className={leaders.length > 0 && leaders.every((account) => (current.accounts ?? []).includes(account.id)) ? "on" : ""}
                          onClick={() => {
                            const ids = leaders.map((account) => account.id)
                            const all = ids.every((id) => (current.accounts ?? []).includes(id))
                            setCashDraft({})
                            update(withAmounts({ ...current, accounts: all ? [] : ids }, accounts, existing?.operations?.[active]))
                          }}
                        >Todas</button>
                      </div>
                      <div className="fund-picks">
                        {accounts.map((account) => {
                          const leader = accounts.find((item) => item.id === account.replicaOf)
                          const explicit = (current.accounts ?? []).includes(account.id)
                          const on = withReplicas(current.accounts ?? [], accounts).includes(account.id)
                          const follows = on && !explicit
                          const source = accounts.find((item) => item.id !== account.id && (current.accounts ?? []).includes(item.id) && withReplicas([item.id], accounts).includes(account.id))
                          return (
                            <div key={account.id} className={follows ? 'fund-row follows' : 'fund-row'}>
                              <label>
                                <input
                                  type="checkbox"
                                  checked={on}
                                  disabled={follows}
                                  onChange={() => {
                                    const selected = new Set(current.accounts ?? [])
                                    if (selected.has(account.id)) selected.delete(account.id)
                                    else selected.add(account.id)
                                    setCashDraft({})
                                    update(withAmounts({ ...current, accounts: [...selected] }, accounts, existing?.operations?.[active]))
                                  }}
                                />
                                <span>
                                  {account.name}
                                  {follows && source ? <em> misma plata</em> : leader ? <em> réplica</em> : null}
                                </span>
                              </label>
                              {(explicit || follows) && (current.result === 'win' || current.result === 'loss') ? (
                                <input
                                  className="cash"
                                  type="text"
                                  inputMode="decimal"
                                  aria-label={'Plata de ' + account.name}
                                  placeholder="monto"
                                  value={cashTextFor(account, current, accounts, explicit, follows, cashDraft[active + ':' + account.id])}
                                  onChange={(event) => {
                                    const raw = event.target.value.replace(/[^\d.-]/g, '')
                                    if (raw !== '' && !/^-?\d*\.?\d*$/.test(raw)) return
                                    const key = active + ':' + account.id
                                    setCashDraft((prev) => ({ ...prev, [key]: raw }))
                                    const amounts = { ...(current.amounts ?? {}) }
                                    const selected = new Set(current.accounts ?? [])
                                    const next = Number(raw)
                                    if (raw === '' || raw === '-' || !Number.isFinite(next)) {
                                      delete amounts[account.id]
                                      if (raw === '') selected.delete(account.id)
                                    } else {
                                      amounts[account.id] = next
                                      selected.add(account.id)
                                    }
                                    update({ ...current, accounts: [...selected], amounts, pnl: undefined })
                                  }}
                                />
                              ) : null}
                            </div>
                          )
                        })}
                      </div>
                      <p className="fine">
                        {withReplicas(current.accounts ?? [], accounts).length === 0
                          ? "Escribe la plata en el recuadro de cada cuenta. Una copia repite ese número hasta que le cambies el suyo."
                          : (current.result === "win" || current.result === "loss")
                            ? pnlLine(shown, accounts)
                            : "La copia entra con la cuenta que marques."}
                      </p>
                    </>
                  )}
                </fieldset>
                {breaches.map((call) => (
                  <p key={call.accountId} className="breach" role="alert">
                    {'Violaste el riesgo de ' + call.name + '. Perdiste ' + money(call.lost) + ' y tu límite es ' + money(accounts.find((account) => account.id === call.accountId)?.risk ?? 0) + '. Si esa cuenta aguanta más, sube el riesgo del día en Cuentas. Si no, el día se guarda y el aeropuerto no avanza.'}
                  </p>
                ))}
                <p className={clean && breaches.length === 0 ? 'ok-line' : 'fine'}>
                  {breaches.length > 0
                    ? 'Una cuenta se pasó de tu riesgo. El día se guarda y no suma hito.'
                    : clean
                      ? 'Las reglas salieron y el riesgo se respetó. El día construye el aeropuerto.'
                      : 'Si una operación rompe las reglas, el día se guarda y no se pierde nada, pero no suma hito.'}
                  {piece > 0 ? ' Esta fecha ya era el día ' + piece + '.' : ''}
                </p>
                <p>{current.result ? lossLine(current.result, answersPass(current.answers)) : 'Puedes cerrar en pérdida y aun así construir.'}</p>
              </>
            )}
            {mode === 'rest' && (
              <label>
                Nota
                <textarea value={note} rows={3} maxLength={500} onChange={(event) => setNote(event.target.value)} />
              </label>
            )}
            {error ? <p className="alert" role="alert">{error}</p> : null}
            {locked ? <p className="fine">Consulta de solo lectura.</p> : (
              <button type="submit" className="solid" disabled={busy}>{busy ? 'Guardando…' : 'Guardar día'}</button>
            )}
          </div>
        )}
      </form>
    </div>
  )
}

function mark(answers: Answer[], id: string, value: AnswerValue): Answer[] {
  return answers.map((answer) => (answer.id === id ? { ...answer, value } : answer))
}


function Curve({ points }: { points: ReturnType<typeof resultCurve> }) {
  const width = 640
  const height = 210
  const padX = 28
  const padTop = 18
  const padBottom = 28
  if (points.length === 0) {
    return (
      <div className="curve">
        <h3>La gráfica</h3>
        <p>Aparece con la primera ganancia o pérdida.</p>
      </div>
    )
  }
  const values = [0, ...points.map((point) => point.cumulative)]
  const min = Math.min(...values, 0)
  const max = Math.max(...values, 0)
  const span = Math.max(1, max - min)
  const xAt = (index: number) => padX + (index / points.length) * (width - padX * 2)
  const yAt = (value: number) => padTop + ((max - value) / span) * (height - padTop - padBottom)
  const line = values.map((value, index) => `${index === 0 ? 'M' : 'L'}${xAt(index).toFixed(1)},${yAt(value).toFixed(1)}`).join(' ')
  const last = points[points.length - 1]
  const now = `${last.cumulative > 0 ? '+' : ''}${last.cumulative}`
  return (
    <div className="curve">
      <div className="curve-top">
        <h3>La gráfica</h3>
        <strong>{now}</strong>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Curva de ganancias y pérdidas. Ahora ${now}.`}>
        <line className="zero" x1={padX} x2={width - padX} y1={yAt(0)} y2={yAt(0)} />
        <path d={line} />
        {points.map((point, index) => {
          const label = `${point.date.slice(8)}/${point.date.slice(5, 7)}`
          const showLabel = index === 0 || point.date !== points[index - 1]?.date
          return (
            <g key={`${point.date}-${index}`}>
              <circle className={point.result} cx={xAt(index + 1)} cy={yAt(point.cumulative)} r="5.5">
                <title>{`${label} · ${RESULT_LABEL[point.result]} · ${point.cumulative > 0 ? '+' : ''}${point.cumulative}`}</title>
              </circle>
              {showLabel ? <text className="tick" x={xAt(index + 1)} y={height - 8} textAnchor="middle">{label}</text> : null}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function Numbers({
  sessions, year, month, onMonth,
}: {
  sessions: SessionRecord[]
  year: number
  month: number
  onMonth: (year: number, month: number) => void
}) {
  const stats = monthStats(sessions, year, month)
  function shift(delta: number) {
    const next = new Date(year, month + delta, 1)
    onMonth(next.getFullYear(), next.getMonth())
  }
  const empty = stats.completedSessions === 0
  const curve = resultCurve(sessions)
  return (
    <section className="panel">
      <div className="cal-head">
        <h2>{monthLabel(year, month)}</h2>
        <div className="row">
          <button type="button" onClick={() => shift(-1)}>Anterior</button>
          <button type="button" onClick={() => shift(1)}>Siguiente</button>
        </div>
      </div>
      <div className="stats">
        <article><span>Reglas en sí</span><strong>{stats.rulesPercent === null ? '—' : `${stats.rulesPercent}%`}</strong></article>
        <article><span>Días con hito</span><strong>{empty ? '—' : stats.disciplinedDays}</strong></article>
        <article><span>Cierres</span><strong>{stats.completedSessions}</strong></article>
        <article><span>Ganancias</span><strong>{empty ? '—' : stats.wins}</strong></article>
        <article><span>Pérdidas</span><strong>{empty ? '—' : stats.losses}</strong></article>
        <article><span>Tablas</span><strong>{empty ? '—' : stats.breakevens}</strong></article>
      </div>
      <p className="fine">La racha no promete el siguiente resultado. Un mes vacío no trae cifras de relleno.</p>
      <Curve points={curve} />
      {empty ? (
        <p>Sin cierres en este mes.</p>
      ) : (
        <>
          <h3>Lo que más se cae</h3>
          {stats.mostBroken.length === 0 ? <p>Ningún no en este mes.</p> : (
            <ul>{stats.mostBroken.map((item) => <li key={item.text}>{item.text} · {item.count}</li>)}</ul>
          )}
          <table>
            <caption>Dinero a un lado. Ejecución al otro.</caption>
            <thead>
              <tr><th>Resultado</th><th>Con hito</th><th>Sin hito</th></tr>
            </thead>
            <tbody>
              {stats.matrix.map((row) => (
                <tr key={row.result}>
                  <th>{RESULT_LABEL[row.result]}</th>
                  <td>{row.disciplined}</td>
                  <td>{row.undisciplined}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  )
}

function Rules({
  rules, locked = false, onAdd, onRename, onRemove,
}: {
  rules: RuleDef[]
  locked?: boolean
  onAdd: (text: string) => Promise<void>
  onRename: (id: string, text: string) => Promise<void>
  onRemove: (id: string) => Promise<void>
}) {
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [edit, setEdit] = useState<{ id: string; text: string } | null>(null)

  return (
    <section className="panel">
      <h2>Reglas</h2>
      <p className="fine">{locked ? 'Reglas publicadas. Solo lectura.' : 'Las siete primeras se quedan. Puedes cambiar el texto. La de operar pasivo acepta No aplicaba.'}</p>
      {!locked && <div className="row add">
        <input value={text} maxLength={140} placeholder="Regla nueva" onChange={(event) => setText(event.target.value)} />
        <button
          type="button"
          className="solid"
          onClick={() => {
            const next = text.trim()
            if (!next) {
              setError('Escribe la regla.')
              return
            }
            setError('')
            setText('')
            void onAdd(next).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'No se pudo añadir.'))
          }}
        >
          Añadir
        </button>
      </div>}
      {error ? <p className="alert">{error}</p> : null}
      <ul className="rule-list">
        {rules.map((rule, index) => (
          <li key={rule.id}>
            <span>{index + 1}</span>
            {edit?.id === rule.id ? (
              <>
                <input value={edit.text} maxLength={140} onChange={(event) => setEdit({ id: rule.id, text: event.target.value })} />
                <button type="button" onClick={() => { void onRename(rule.id, edit.text.trim()); setEdit(null) }}>Guardar</button>
              </>
            ) : (
              <>
                <p>{rule.text}{rule.kind === 'tri' ? ' · sí / no / no aplicaba' : ''}</p>
                {!locked && <button type="button" onClick={() => setEdit({ id: rule.id, text: rule.text })}>Editar</button>}
                {!locked && rule.custom ? <button type="button" onClick={() => void onRemove(rule.id)}>Quitar</button> : null}
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
