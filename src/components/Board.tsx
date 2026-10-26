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
  normalizeStake,
  orchard,
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
import { dayCalls, judgeDay, money, opDollars, pickBook, readBook, withReplicas, writeBook, type AccountBook, type FundAccount } from '../accounts'
import { AccountsPanel } from './Accounts'
import { Airport } from './Airport'
import { AppleCube } from './AppleCube'

export function Board({ store, onSignOut, banner }: { store: PetStore; onSignOut?: () => void; banner?: string }) {
  const [rules, setRules] = useState<RuleDef[]>([])
  const [sessions, setSessions] = useState<SessionRecord[]>([])
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'ano' | 'numeros' | 'reglas' | 'cuentas'>('ano')
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
    const nextBook = pickBook(nextSessions, readBook())
    writeBook(nextBook)
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
  }, [store])

  const ordered = useMemo(() => orderedDisciplined(sessions), [sessions])
  const count = ordered.length
  const fruit = useMemo(() => orchard(sessions), [sessions])
  const streak = disciplineStreak(sessions)
  const nextPiece = unlockName(count + 1)

  async function commitBook(next: AccountBook) {
    const stamped = { ...next, updated: next.updated || new Date().toISOString() }
    writeBook(stamped)
    setBook(stamped)
    const latest = [...sessions].sort((a, b) => b.date.localeCompare(a.date))[0]
    if (latest) await persist({ ...latest, book: stamped })
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
        <Curve points={resultCurve(sessions)} />
        <div className="stage cube-stage">
          <span className="window-label">Cubo</span>
          <AppleCube apples={fruit.apples} people={fruit.people} ugly={fruit.ugly} />
          <p className="map-hint">{fruit.apples} manzanas · {fruit.people} personas{fruit.ugly ? ' · feo' : ''}</p>
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
          <p className="fine">Hasta 3 operaciones por día. El aeropuerto crece solo si todas respetaron las reglas. Un día sin operar no es un fallo. La gráfica y el cubo van debajo, cada uno en su recuadro.</p>
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

      {tab === 'cuentas' && <AccountsPanel book={book} sessions={sessions} onSave={(next) => void commitBook(next)} />}

      {selected && (
        <DaySheet
          key={selected}
          dateKey={selected}
          rules={rules}
          accounts={book.accounts}
          existing={sessions.find((session) => session.date === selected)}
          piece={pieceForDate(selected, ordered)}
          history={sessions}
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
  dateKey, rules, accounts, existing, piece, history, onClose, onSave,
}: {
  dateKey: string
  rules: RuleDef[]
  accounts: FundAccount[]
  existing?: SessionRecord
  piece: number
  history: SessionRecord[]
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
  const current = ops[Math.min(active, ops.length - 1)]
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
          void save({
            date: dateKey,
            status: 'completed',
            result: ops[0].result,
            learned: ops.map((op) => op.learned).filter(Boolean).join(' · '),
            note,
            answers: ops[0].answers,
            operations: ops.map((op) => ({ ...op, risk: normalizeStake(op.risk), reward: normalizeStake(op.reward, 3) })),
            disciplined: operationsPass(ops) && breaches.length === 0,
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
        ) : (
          <>
            <div className="choice">
              <button type="button" className={mode === 'trade' ? 'on' : ''} onClick={() => setMode('trade')}>Operé</button>
              <button type="button" className={mode === 'rest' ? 'on' : ''} onClick={() => setMode('rest')}>No operé</button>
            </div>
            {mode === 'rest' ? (
              <p>Día libre. No suma hito y no cuenta como fallo.</p>
            ) : (
              <>
                <div className="choice">
                  {ops.map((op, index) => (
                    <button key={index} type="button" data-result={op.result ?? ""} className={index === active ? 'on' : ''} onClick={() => setActive(index)}>
                      Operación {index + 1}
                    </button>
                  ))}
                  {ops.length < 3 && (
                    <button type="button" onClick={() => { setOps((list) => [...list, blankTrade(rules)]); setActive(ops.length) }}>
                      Otra
                    </button>
                  )}
                  {ops.length > 1 && (
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
                      <button key={item} type="button" className={current.result === item ? 'on' : ''} onClick={() => update({ ...current, result: item })}>
                        {RESULT_LABEL[item]}
                      </button>
                    ))}
                  </div>
                </fieldset>
                {(current.result === 'win' || current.result === 'loss') && (
                  <fieldset>
                    <legend>Ratio de esta operación</legend>
                    <div className="choice ratio">
                      <label>
                        Arriesgo
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={current.risk ?? 1}
                          onChange={(event) => update({ ...current, risk: Number(event.target.value) })}
                        />
                      </label>
                      <label>
                        Si gano
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={current.reward ?? 3}
                          onChange={(event) => update({ ...current, reward: Number(event.target.value) })}
                        />
                      </label>
                    </div>
                    <p className="fine">
                      {current.result === 'win'
                        ? `Sumas ${normalizeStake(current.reward, 3)} manzanas y ${normalizeStake(current.reward, 3)} personas.`
                        : `Quitas ${normalizeStake(current.risk)} manzana y ${normalizeStake(current.risk)} persona. Si no alcanzan, el cubo se pone feo.`}
                    </p>
                  </fieldset>
                )}
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
                {pastAnalyses.length > 0 && (
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
                            update({ ...current, accounts: all ? [] : ids })
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
                            <label key={account.id}>
                              <input
                                type="checkbox"
                                checked={on}
                                disabled={follows}
                                onChange={() => {
                                  const selected = new Set(current.accounts ?? [])
                                  if (selected.has(account.id)) selected.delete(account.id)
                                  else selected.add(account.id)
                                  update({ ...current, accounts: [...selected] })
                                }}
                              />
                              {account.name}
                              {follows && source ? <span className="fine"> entra con {source.name}</span> : leader ? <span className="fine"> réplica de {leader.name}</span> : null}
                            </label>
                          )
                        })}
                      </div>
                      <p className="fine">
                        {withReplicas(current.accounts ?? [], accounts).length === 0
                          ? "Marca la cuenta. Puedes tomar la misma operación en todas. Una pérdida resta el riesgo y una ganancia lo multiplica por el ratio."
                          : (current.result === "win" || current.result === "loss")
                            ? withReplicas(current.accounts ?? [], accounts).map((id) => {
                                const account = accounts.find((item) => item.id === id)
                                if (!account) return ""
                                const move = opDollars(account, current)
                                return account.name + " " + (move > 0 ? "+" : "") + money(move)
                              }).filter(Boolean).join(" · ")
                            : "La misma operación entra en la cuenta marcada y en todo el grupo que replica."}
                      </p>
                    </>
                  )}
                </fieldset>
                {breaches.map((call) => (
                  <p key={call.accountId} className="breach" role="alert">
                    {'Violaste el riesgo de ' + call.name + '. Perdiste ' + money(call.lost) + ' y tu límite es ' + money(accounts.find((account) => account.id === call.accountId)?.risk ?? 0) + '. El día se guarda y el aeropuerto no avanza.'}
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
            <button type="submit" className="solid" disabled={busy}>{busy ? 'Guardando…' : 'Guardar día'}</button>
          </>
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
      <p className="fine">Un ratio 1-3 sube 3 al ganar y baja 1 al perder. Una tabla no se mueve. El dinero no entra.</p>
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
  rules, onAdd, onRename, onRemove,
}: {
  rules: RuleDef[]
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
      <p className="fine">Las siete primeras se quedan. Puedes cambiar el texto. La de operar pasivo acepta No aplicaba.</p>
      <div className="row add">
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
      </div>
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
                <button type="button" onClick={() => setEdit({ id: rule.id, text: rule.text })}>Editar</button>
                {rule.custom ? <button type="button" onClick={() => void onRemove(rule.id)}>Quitar</button> : null}
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
