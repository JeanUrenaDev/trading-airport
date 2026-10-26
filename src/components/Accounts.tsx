import { useEffect, useState, type FormEvent } from "react"
import {
  PRESETS,
  applyType,
  firmName,
  money,
  openingBalance,
  runningBalance,
  shareBalance,
  snapshot,
  typesOf,
  type AccountBook,
  type AccountType,
  type BalanceMark,
  type Firm,
  type FundAccount,
  type TakenOp,
} from "../accounts"

type TradeSession = BalanceMark & { operations?: TakenOp[] }

export function AccountsPanel({
  book,
  sessions,
  locked = false,
  onSave,
}: {
  book: AccountBook
  sessions: TradeSession[]
  locked?: boolean
  onSave: (book: AccountBook) => void
}) {
  useEffect(() => {
    if (locked) return
    const accounts = book.accounts.map((account) => {
      const opening = openingBalance(account)
      if (opening == null || opening === account.balance) return account
      return { ...account, balance: opening }
    })
    if (accounts.some((account, index) => account.balance !== book.accounts[index]?.balance)) {
      onSave({ ...book, updated: new Date().toISOString(), accounts })
    }
  }, [book, onSave, locked])
  const known = typesOf(book)
  const opening = known.find((item) => item.firm === "topstep" && item.start === 50000) ?? known[0]
  const [firm, setFirm] = useState<Firm>(opening.firm)
  const [size, setSize] = useState(opening.start)
  const [cost, setCost] = useState(String(opening.cost))
  const [maxDd, setMaxDd] = useState(String(opening.maxDd))
  const [objective, setObjective] = useState(String(opening.objective))
  const [risk, setRisk] = useState(String(opening.risk))
  const [name, setName] = useState("")
  const [live, setLive] = useState("")
  const [replicas, setReplicas] = useState<string[]>([])
  const [editing, setEditing] = useState<string | null>(null)
  const [error, setError] = useState("")
  const selected = known.find((item) => item.firm === firm && item.start === size) ?? opening
  const ofThisType = book.accounts.filter((account) => account.firm === firm && account.start === size).length

  function showType(nextFirm: Firm, nextSize: number) {
    const type = typesOf(book).find((item) => item.firm === nextFirm && item.start === nextSize)
    if (!type) return
    setFirm(nextFirm)
    setSize(nextSize)
    setCost(String(type.cost))
    setMaxDd(String(type.maxDd))
    setObjective(String(type.objective))
    setRisk(String(type.risk))
    setError("")
  }

  function draftType(): AccountType | null {
    const label = PRESETS.find((item) => item.firm === firm && item.start === size)?.label ?? selected.label
    const type = { firm, label, start: size, cost: Number(cost), maxDd: Number(maxDd), objective: Number(objective), risk: Number(risk) }
    if ([type.cost, type.maxDd, type.objective, type.risk].some((value) => !Number.isFinite(value) || value < 0) || type.maxDd <= 0 || type.objective <= 0 || type.risk <= 0) return null
    return type
  }

  function publish(type: AccountType, accounts: FundAccount[]) {
    const types = typesOf(book).map((item) => (item.firm === type.firm && item.start === type.start ? type : item))
    onSave({ updated: new Date().toISOString(), accounts: applyType(accounts, type), types })
  }

  function saveType(event: FormEvent) {
    event.preventDefault()
    const type = draftType()
    if (!type) {
      setError("El tipo necesita costo, DD, objetivo y un riesgo mayor que cero.")
      return
    }
    publish(type, book.accounts)
    setError("")
  }

  function resetAccount() {
    setEditing(null)
    setName("")
    setLive("")
    setReplicas([])
    setError("")
  }

  function edit(account: FundAccount) {
    showType(account.firm, account.start)
    setEditing(account.id)
    setName(account.name)
    setLive(account.balance == null ? "" : String(account.balance))
    setReplicas(book.accounts.filter((item) => item.replicaOf === account.id).map((item) => item.id))
  }

  function saveAccount(event: FormEvent) {
    event.preventDefault()
    const type = draftType()
    const typed = live.trim()
    const raw = typed === "" ? undefined : Number(typed)
    const balance = raw == null ? undefined : raw < 0 ? size + raw : raw
    if (!type || !name.trim() || (raw != null && !Number.isFinite(raw)) || (balance != null && balance < 0)) {
      setError(raw != null && raw < 0 ? "Esa pérdida es más grande que el balance inicial." : "Pon el nombre. El balance completo se escribe 50350. Una pérdida de 450 se escribe -450.")
      return
    }
    const previous = book.accounts.find((item) => item.id === editing)
    const account: FundAccount = {
      id: editing ?? crypto.randomUUID(),
      firm: previous?.firm ?? type.firm,
      name: name.trim(),
      cost: previous?.cost ?? type.cost,
      start: previous?.start ?? type.start,
      maxDd: previous?.maxDd ?? type.maxDd,
      objective: previous?.objective ?? type.objective,
      risk: previous?.risk ?? type.risk,
      balance,
      replicaOf: replicas.length > 0 ? undefined : previous?.replicaOf,
    }
    const base = editing ? book.accounts : [...book.accounts, account]
    const linked = base.map((item) => {
      if (item.id === account.id) return account
      if (replicas.includes(item.id)) return { ...item, replicaOf: account.id }
      if (item.replicaOf === account.id) return { ...item, replicaOf: undefined }
      return item
    })
    onSave({
      updated: new Date().toISOString(),
      accounts: shareBalance(linked, [account.id, ...replicas], balance),
      types: typesOf(book),
    })
    resetAccount()
  }

  return (
    <section className="panel funds">
      <p className="kicker">Cuentas de fondeo</p>
      <h2>{book.accounts.length === 0 ? "Todavía no hay cuentas." : book.accounts.length === 1 ? "1 cuenta" : book.accounts.length + " cuentas"}</h2>
      <p className="fine">El balance se pone una vez, el número completo. Después lo mueve la plata de cada trade. El riesgo del día está en cada ficha: si Topstep aguanta más, súbelo y guarda. Si la pérdida del día cabe ahí, el aeropuerto suma.</p>

      {book.accounts.length > 0 && <FundChart accounts={book.accounts} sessions={sessions} />}

      <div className="fund-grid">
        {book.accounts.map((account) => {
          const path = runningBalance(account, book.accounts, sessions)
          const state = snapshot({ ...account, balance: path[0]?.balance ?? account.balance }, path.filter((point) => point.date !== "Inicio"))
          const logged = path.length > 0
          const leader = book.accounts.find((item) => item.id === account.replicaOf)
          return (
            <article key={account.id} className={state.busted ? "fund-card busted" : state.passed ? "fund-card passed" : "fund-card"}>
              <header>
                <FirmBadge firm={account.firm} />
                <div>
                  <strong>{account.name}</strong>
                  <p className="fine">Costo {money(account.cost)}{leader ? " · Réplica de " + leader.name : ""}</p>
                </div>
              </header>
              <DayRisk
                account={account}
                locked={locked}
                onSave={(risk) => {
                  if (account.firm === firm && account.start === size) setRisk(String(risk))
                  onSave({
                    updated: new Date().toISOString(),
                    accounts: book.accounts.map((item) => item.id === account.id ? { ...item, risk } : item),
                    types: typesOf(book).map((item) => item.firm === account.firm && item.start === account.start ? { ...item, risk } : item),
                  })
                }}
              />
              <p className="fund-balance">{logged ? money(state.balance) : "Sin balance"}</p>
              <p>{logged ? (state.pnl >= 0 ? "Vas ganando " + money(state.pnl) : "Vas abajo " + money(Math.abs(state.pnl))) : "Pon el balance inicial y esta ficha se llena."}</p>
              <Meter label={"DD " + money(state.drawdown) + " de " + money(account.maxDd)} value={account.maxDd > 0 ? state.drawdown / account.maxDd : 0} tone={state.room < account.risk ? "bad" : "good"} />
              <p className="fine">{state.busted ? "El límite de pérdida ya se tocó." : "Quedan " + money(state.room) + " antes del límite" + (state.locked ? ". El límite ya se trabó." : ".")}</p>
              <Meter label={"Objetivo " + money(Math.max(0, state.pnl)) + " de " + money(account.objective)} value={Math.max(0, state.progress)} tone="good" />
              {!locked && (
                <div className="row">
                  <button type="button" onClick={() => edit(account)}>Editar</button>
                  <button type="button" onClick={() => onSave({ updated: new Date().toISOString(), accounts: book.accounts.filter((item) => item.id !== account.id).map((item) => item.replicaOf === account.id ? { ...item, replicaOf: undefined } : item), types: typesOf(book) })}>Quitar</button>
                </div>
              )}
            </article>
          )
        })}
      </div>

      {!locked && <form className="fund-form" onSubmit={saveType}>
        <h3>Tipo {firmName(firm)} {selected.label}</h3>
        <div className="choice firm-pick">
          <button type="button" className={firm === "topstep" ? "on" : ""} onClick={() => showType("topstep", PRESETS.some((item) => item.firm === "topstep" && item.start === size) ? size : 50000)}><FirmBadge firm="topstep" /></button>
          <button type="button" className={firm === "lucid" ? "on" : ""} onClick={() => showType("lucid", PRESETS.some((item) => item.firm === "lucid" && item.start === size) ? size : 25000)}><FirmBadge firm="lucid" /></button>
        </div>
        <div className="choice">
          {PRESETS.filter((preset) => preset.firm === firm).map((preset) => (
            <button key={preset.label} type="button" className={preset.start === size ? "on" : ""} onClick={() => showType(preset.firm, preset.start)}>{preset.label}</button>
          ))}
        </div>
        <p className="fine">El costo, el DD, el objetivo y el riesgo se definen una vez. {ofThisType === 0 ? "Todavía no hay cuentas de este tipo." : ofThisType === 1 ? "1 cuenta usa estos números." : ofThisType + " cuentas usan estos números."}</p>
        <div className="fund-fields">
          <label>Costo<input type="number" min="0" step="1" value={cost} onChange={(event) => setCost(event.target.value)} /></label>
          <label>DD máximo<input type="number" min="1" step="1" value={maxDd} onChange={(event) => setMaxDd(event.target.value)} /></label>
          <label>Objetivo<input type="number" min="1" step="1" value={objective} onChange={(event) => setObjective(event.target.value)} /></label>
          <label>Riesgo del día<input type="number" min="1" step="1" value={risk} onChange={(event) => setRisk(event.target.value)} /></label>
        </div>
        <button type="submit">Guardar tipo</button>
      </form>}

      {!locked && <form className="fund-form" onSubmit={saveAccount}>
        <h3>{editing ? "Editar cuenta" : "Nueva cuenta " + firmName(firm) + " " + selected.label}</h3>
        <p className="fine">Aquí cambias el nombre y el balance. El riesgo del día se edita en la ficha de la cuenta.</p>
        <div className="fund-fields">
          <label>Nombre<input value={name} onChange={(event) => setName(event.target.value)} placeholder={firmName(firm) + " " + selected.label} /></label>
          <label>Balance inicial<input type="number" step="0.01" value={live} onChange={(event) => setLive(event.target.value)} placeholder={String(size + 350)} /></label>
        </div>
        <p className="fine">El número completo, por ejemplo {money(size + 350)}. Si vas perdiendo $450, escribe -450. El balance solo cambia en esta cuenta y en las réplicas que dejes marcadas.</p>
        {balanceHint(size, live)}
        {book.accounts.some((account) => account.id !== editing) && (
          <fieldset>
            <legend>Réplicas</legend>
            <p className="fine">Solo estas, si las dejas marcadas, reciben el balance. Si no marcas ninguna, cambia únicamente esta cuenta. Una operación en esta cuenta igual las mueve.</p>
            <div className="fund-picks">
              {book.accounts.filter((account) => account.id !== editing).map((account) => (
                <label key={account.id}>
                  <input
                    type="checkbox"
                    checked={replicas.includes(account.id)}
                    onChange={() => setReplicas((list) => list.includes(account.id) ? list.filter((id) => id !== account.id) : [...list, account.id])}
                  />
                  {account.name}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {error ? <p className="breach" role="alert">{error}</p> : null}
        <div className="row">
          <button type="submit" className="solid">{editing ? "Guardar cambios" : "Agregar cuenta"}</button>
          {editing ? <button type="button" onClick={resetAccount}>Cancelar</button> : null}
        </div>
      </form>}
    </section>
  )
}

function DayRisk({ account, locked, onSave }: { account: FundAccount; locked: boolean; onSave: (risk: number) => void }) {
  const [value, setValue] = useState(String(account.risk))
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    setValue(String(account.risk))
    setSaved(false)
  }, [account.risk])
  if (locked) return <p className="fine">Riesgo del día {money(account.risk)}</p>
  return (
    <div className="card-risk">
      <label>
        Riesgo del día
        <input
          type="number"
          min="1"
          step="1"
          aria-label={'Riesgo del día de ' + account.name}
          value={value}
          onChange={(event) => {
            setSaved(false)
            setValue(event.target.value)
          }}
        />
      </label>
      <button
        type="button"
        onClick={() => {
          const next = Number(value)
          if (!Number.isFinite(next) || next <= 0) return
          onSave(next)
          setSaved(true)
        }}
      >{saved ? "Listo" : "Guardar"}</button>
    </div>
  )
}

const LINE_COLORS = ["#ff4d1c", "#2458c9", "#1f8a4c", "#7a3cff", "#0e7c86", "#c1121f", "#e07a00", "#b5179e", "#5c6b2f", "#12100e"]

function dayLabel(date: string): string {
  if (date === "Inicio" || date === "Ahora") return date
  const [, month, day] = date.split("-")
  if (!day || !month) return date
  return Number(day) + "/" + Number(month)
}

function FundChart({ accounts, sessions }: { accounts: FundAccount[]; sessions: TradeSession[] }) {
  const paths = accounts.map((account) => ({ account, path: runningBalance(account, accounts, sessions) }))
  const days = [...new Set(paths.flatMap((item) => item.path.map((point) => point.date).filter((date) => date !== "Inicio")))].sort()
  const dates = paths.some((item) => item.path.length > 0) ? ["Inicio", ...(days.length > 0 ? days : ["Ahora"])] : []
  const lines = paths.map((item) => {
    let carried: number | null = null
    const values = dates.map((date) => {
      if (item.path.length === 0) return null
      if (date === "Inicio") {
        carried = item.path[0].balance
        return carried
      }
      const hit = item.path.find((point) => point.date === date)
      if (hit) carried = hit.balance
      if (date === "Ahora") return item.path[item.path.length - 1].balance
      return carried
    })
    const logged = dates.map((date) => date === "Inicio" || date === "Ahora" || item.path.some((point) => point.date === date))
    return { id: item.account.id, name: item.account.name, firm: item.account.firm, values, logged }
  })
  const width = 760
  const height = 300
  const padL = 92
  const padR = 16
  const padT = 22
  const padB = 48
  const floors = accounts.map((account) => account.start - account.maxDd)
  const goals = [...new Map(accounts.map((account) => [account.start + account.objective, account.objective])).entries()]
  const goalTop = Math.max(...goals.map((goal) => goal[0]))
  const above = lines.flatMap((line) => line.values.filter((value): value is number => value != null && value > goalTop))
  const plotMin = Math.min(...floors)
  const plotMax = Math.max(goalTop, ...above)
  const span = Math.max(1, plotMax - plotMin)
  const ticks = [...new Set([...floors, ...accounts.map((account) => account.start), ...goals.map((goal) => goal[0])])].filter((value) => value >= plotMin - 0.001 && value <= plotMax + 0.001).sort((a, b) => a - b)
  const xAt = (index: number) => padL + (dates.length <= 1 ? 0 : (index / (dates.length - 1)) * (width - padL - padR))
  const yAt = (value: number) => padT + ((plotMax - value) / span) * (height - padT - padB)
  const labelStep = Math.max(1, Math.ceil(dates.length / 7))
  const seen = new Set<string>()
  const rawTags = lines.flatMap((line) => {
    let point = -1
    let amount: number | null = null
    line.values.forEach((item, index) => {
      if (item != null && item >= plotMin && item <= plotMax) {
        point = index
        amount = item
      }
    })
    if (point < 0 || amount == null) return []
    const key = line.firm + ":" + Math.round(amount)
    if (seen.has(key)) return []
    seen.add(key)
    return [{ key, firm: line.firm, balance: amount, x: xAt(point), y: yAt(amount) }]
  })
  const tags: { key: string; firm: Firm; balance: number; x: number; y: number }[] = []
  for (const tag of [...rawTags].sort((a, b) => a.y - b.y)) {
    const previous = tags[tags.length - 1]
    const y = previous && tag.y - previous.y < 34 ? previous.y + 34 : tag.y
    tags.push({ ...tag, y })
  }

  return (
    <div className="fund-chart">
      <h3>Dashboard</h3>
      <p className="fine">El eje X es el día. El eje Y va del límite de pérdida a la meta. La bandera marca el objetivo. Cada cuenta tiene su color.</p>
      {dates.length === 0 ? <p>Las líneas aparecen cuando pones el balance inicial.</p> : (
        <div className="fund-plot">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Dashboard de balances por cuenta">
          {ticks.map((tick) => (
            <g key={tick}>
              <line className="grid" x1={padL} x2={width - padR} y1={yAt(tick)} y2={yAt(tick)} />
              <text className="tick" x={padL - 8} y={yAt(tick) + 4} textAnchor="end">{money(tick)}</text>
            </g>
          ))}
          {goals.map(([at, objective]) => (
            <g key={at}>
              <line x1={padL} x2={width - padR} y1={yAt(at)} y2={yAt(at)} stroke="#f5c451" strokeWidth="2" strokeDasharray="5 4" />
              <g transform={`translate(${padL + 8} ${yAt(at)})`}>
                <line x1="0" y1="0" x2="0" y2="16" stroke="#12100e" strokeWidth="2" />
                <polygon points="0,0 30,5 0,10" fill="#ff4d1c" stroke="#12100e" strokeWidth="1.5" />
                <text className="tick" x="34" y="9">Meta {money(objective)}</text>
              </g>
            </g>
          ))}
          <line className="axis" x1={padL} x2={padL} y1={padT} y2={height - padB} />
          <line className="axis" x1={padL} x2={width - padR} y1={height - padB} y2={height - padB} />
          <text className="axis-name" transform={`translate(14 ${height / 2}) rotate(-90)`} textAnchor="middle">Balance</text>
          <text className="axis-name" x={(padL + width - padR) / 2} y={height - 6} textAnchor="middle">Día</text>
          {lines.map((line, index) => {
            const color = LINE_COLORS[index % LINE_COLORS.length]
            let started = false
            const d = line.values.map((value, point) => {
              if (value == null || value < plotMin || value > plotMax) return ""
              const command = started ? "L" : "M"
              started = true
              return command + xAt(point).toFixed(1) + "," + yAt(value).toFixed(1)
            }).join(" ")
            if (!started) return null
            return (
              <g key={line.id}>
                <path d={d} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
                {line.values.map((value, point) => value == null || !line.logged[point] || value < plotMin || value > plotMax ? null : (
                  <circle key={dates[point]} cx={xAt(point)} cy={yAt(value)} r="4.5" fill={color} stroke="#12100e" strokeWidth="2">
                    <title>{line.name + " · " + dayLabel(dates[point] ?? "") + " · " + money(value)}</title>
                  </circle>
                ))}
              </g>
            )
          })}
          {dates.map((date, index) => (index % labelStep === 0 || index === dates.length - 1) ? (
            <text key={date + index} className="tick" x={xAt(index)} y={height - padB + 18} textAnchor="middle">{dayLabel(date)}</text>
          ) : null)}
        </svg>
        {tags.map((tag) => (
          <span key={tag.key} className="fund-tag" style={{ left: (tag.x / width) * 100 + "%", top: (tag.y / height) * 100 + "%" }}>
            <FirmBadge firm={tag.firm} />
            <strong>{money(tag.balance)}</strong>
          </span>
        ))}
        </div>
      )}
      <div className="fund-legend">
        {lines.map((line, index) => {
          const last = [...line.values].reverse().find((value) => value != null)
          return (
            <span key={line.id}>
              <i style={{ background: LINE_COLORS[index % LINE_COLORS.length] }} />
              {line.name}
              <strong>{last == null ? "Sin balance" : money(last) + (last < plotMin || last > plotMax ? " · fuera de la escala" : "")}</strong>
            </span>
          )
        })}
      </div>
    </div>
  )
}

function balanceHint(start: number, raw: string) {
  const value = Number(raw)
  if (raw.trim() === "" || !Number.isFinite(value)) return null
  if (value < 0) {
    return <p className="fine">Pérdida de {money(Math.abs(value))}. El balance queda en {money(start + value)}. Se copia solo a las réplicas marcadas.</p>
  }
  const pnl = value - start
  if (value < start * 0.5) {
    return <p className="breach">{money(value)} queda como saldo de la cuenta. Si vas ganando {money(value)}, escribe {money(start + value)}. Si vas perdiendo, escribe -{value}.</p>
  }
  return <p className="fine">{pnl >= 0 ? "Vas ganando " : "Vas abajo "}{money(Math.abs(pnl))} frente al inicial de {money(start)}. Se copia solo a las réplicas marcadas.</p>
}

function Meter({ label, value, tone }: { label: string; value: number; tone: "good" | "bad" }) {
  const width = Math.max(0, Math.min(100, value * 100))
  return (
    <div className="meter-block">
      <span>{label}</span>
      <div className={"meter " + tone}><span style={{ width: width + "%" }} /></div>
    </div>
  )
}

export function FirmBadge({ firm }: { firm: Firm }) {
  if (firm === "topstep") {
    return (
      <span className="badge topstep" aria-label="Topstep">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 16 L12 4 L20 16 H15 L12 10 L9 16 Z" /></svg>
        TOPSTEP
      </span>
    )
  }
  return (
    <span className="badge lucid" aria-label="Lucid">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="3" /></svg>
      LUCID
    </span>
  )
}
