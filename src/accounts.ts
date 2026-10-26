export type Firm = "topstep" | "lucid"

export interface FundAccount {
  id: string
  firm: Firm
  name: string
  cost: number
  start: number
  maxDd: number
  objective: number
  risk: number
  balance?: number
  replicaOf?: string
}

export interface DayBalance {
  accountId: string
  balance: number
}

export interface AccountType {
  firm: Firm
  label: string
  cost: number
  start: number
  maxDd: number
  objective: number
  risk: number
}

export interface AccountBook {
  updated: string
  accounts: FundAccount[]
  types?: AccountType[]
}

export interface BalanceMark {
  date: string
  balances?: DayBalance[]
  book?: AccountBook
}

export interface AccountSnapshot {
  balance: number
  peak: number
  floor: number
  drawdown: number
  room: number
  pnl: number
  progress: number
  busted: boolean
  passed: boolean
  locked: boolean
}

export interface RiskCall {
  accountId: string
  name: string
  previous: number
  balance: number
  delta: number
  lost: number
  good: boolean
}

export interface Preset {
  firm: Firm
  label: string
  start: number
  maxDd: number
  objective: number
  risk: number
}

const KEY = "trading-pet-accounts-v1"

export const PRESETS: Preset[] = [
  { firm: "topstep", label: "50K", start: 50000, maxDd: 2000, objective: 3000, risk: 500 },
  { firm: "topstep", label: "100K", start: 100000, maxDd: 3000, objective: 6000, risk: 800 },
  { firm: "topstep", label: "150K", start: 150000, maxDd: 4500, objective: 9000, risk: 1200 },
  { firm: "lucid", label: "25K", start: 25000, maxDd: 1000, objective: 1250, risk: 250 },
  { firm: "lucid", label: "50K", start: 50000, maxDd: 2000, objective: 3000, risk: 500 },
  { firm: "lucid", label: "100K", start: 100000, maxDd: 3000, objective: 6000, risk: 800 },
  { firm: "lucid", label: "150K", start: 150000, maxDd: 4500, objective: 9000, risk: 1200 },
]

export function emptyBook(): AccountBook {
  return { updated: "", accounts: [] }
}

export function readBook(): AccountBook {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return emptyBook()
    const parsed = JSON.parse(raw) as AccountBook
    if (!parsed || !Array.isArray(parsed.accounts)) return emptyBook()
    return {
      updated: parsed.updated || "",
      accounts: parsed.accounts,
      types: Array.isArray(parsed.types) ? parsed.types : undefined,
    }
  } catch {
    return emptyBook()
  }
}

export function writeBook(book: AccountBook) {
  localStorage.setItem(KEY, JSON.stringify(book))
}

export function pickBook(marks: BalanceMark[], local: AccountBook): AccountBook {
  let best = local.accounts ? local : emptyBook()
  for (const mark of marks) {
    if (mark.book && mark.book.updated > (best.updated || "")) best = mark.book
  }
  return { updated: best.updated || "", accounts: best.accounts ?? [], types: best.types }
}

export function defaultTypes(): AccountType[] {
  return PRESETS.map((preset) => ({ ...preset, cost: 0 }))
}

export function sameType(firm: Firm, start: number, item: { firm: Firm; start: number }): boolean {
  return item.firm === firm && item.start === start
}

export function typesOf(book: AccountBook): AccountType[] {
  const saved = book.types ?? []
  return defaultTypes().map((base) => {
    const found = saved.find((item) => sameType(base.firm, base.start, item))
    if (found) return found
    const sample = book.accounts.find((account) => sameType(base.firm, base.start, account))
    if (!sample) return base
    return {
      firm: base.firm,
      label: base.label,
      cost: sample.cost,
      start: sample.start,
      maxDd: sample.maxDd,
      objective: sample.objective,
      risk: sample.risk,
    }
  })
}

export function applyType(accounts: FundAccount[], type: AccountType): FundAccount[] {
  return accounts.map((account) =>
    sameType(type.firm, type.start, account)
      ? { ...account, cost: type.cost, start: type.start, maxDd: type.maxDd, objective: type.objective, risk: type.risk }
      : account,
  )
}

export function money(value: number): string {
  const sign = value < 0 ? "-" : ""
  const abs = Math.abs(value)
  const digits = Number.isInteger(abs) ? 0 : 2
  return sign + "$" + abs.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export function firmName(firm: Firm): string {
  return firm === "topstep" ? "Topstep" : "Lucid"
}

function lockAt(account: FundAccount): number {
  return account.firm === "lucid" ? account.start + 100 : account.start
}

export function snapshot(account: FundAccount, marks: { date: string; balance: number }[]): AccountSnapshot {
  let peak = account.start
  let floor = account.start - account.maxDd
  const ordered = [...marks].sort((a, b) => a.date.localeCompare(b.date))
  const series = account.balance != null && Number.isFinite(account.balance)
    ? [{ date: "", balance: account.balance }, ...ordered]
    : ordered
  for (const mark of series) {
    peak = Math.max(peak, mark.balance)
    floor = Math.max(floor, Math.min(lockAt(account), peak - account.maxDd))
  }
  const balance = series.length > 0 ? series[series.length - 1].balance : account.start
  const pnl = balance - account.start
  return {
    balance,
    peak,
    floor,
    drawdown: Math.max(0, peak - balance),
    room: balance - floor,
    pnl,
    progress: account.objective > 0 ? pnl / account.objective : 0,
    busted: balance <= floor,
    passed: account.objective > 0 && pnl >= account.objective,
    locked: floor >= lockAt(account) - 0.001,
  }
}

export interface TakenOp {
  result: "win" | "loss" | "breakeven" | null
  risk?: number
  reward?: number
  pnl?: number
  amounts?: Record<string, number>
  accounts?: string[]
}

export interface BalancePoint {
  date: string
  balance: number
}

function stake(value: number | undefined, fallback: number): number {
  if (value == null || !Number.isFinite(value)) return fallback
  return Math.min(20, Math.max(1, Math.round(value)))
}

function readCash(value: number | undefined): number | undefined {
  if (value == null || !Number.isFinite(value)) return undefined
  return Math.round(value * 100) / 100
}

export function opDollars(account: FundAccount, op: TakenOp, book: FundAccount[] = []): number {
  if (op.result !== "win" && op.result !== "loss") return 0
  if (op.amounts) {
    const own = readCash(op.amounts[account.id])
    const shared = own ?? replicaGroup(account.id, book.length > 0 ? book : [account])
      .map((id) => readCash(op.amounts?.[id]))
      .find((value) => value != null)
    if (shared == null) return 0
    return shared
  }
  if (op.pnl != null && Number.isFinite(op.pnl) && op.pnl >= 0) {
    const amount = Math.round(op.pnl * 100) / 100
    return op.result === "win" ? amount : -amount
  }
  if (op.result === "win") return account.risk * stake(op.reward, 3)
  return -(account.risk * stake(op.risk, 1))
}

export function replicaGroup(id: string, accounts: FundAccount[]): string[] {
  const ids = new Set<string>([id])
  let guard = 0
  let grew = true
  while (grew && guard <= accounts.length) {
    grew = false
    guard += 1
    for (const account of accounts) {
      if (ids.has(account.id) && account.replicaOf && !ids.has(account.replicaOf)) {
        ids.add(account.replicaOf)
        grew = true
      }
      if (account.replicaOf && ids.has(account.replicaOf) && !ids.has(account.id)) {
        ids.add(account.id)
        grew = true
      }
    }
  }
  return accounts.map((account) => account.id).filter((item) => ids.has(item))
}

export function shareBalance(accounts: FundAccount[], ids: string[], balance: number | undefined): FundAccount[] {
  const group = new Set(ids)
  return accounts.map((account) => (group.has(account.id) ? { ...account, balance } : account))
}

export function withReplicas(selected: string[], accounts: FundAccount[]): string[] {
  const ids = new Set<string>()
  for (const id of selected) {
    for (const member of replicaGroup(id, accounts)) ids.add(member)
  }
  return accounts.map((account) => account.id).filter((id) => ids.has(id))
}

export function openingBalance(account: FundAccount): number | undefined {
  if (account.balance == null || !Number.isFinite(account.balance)) return undefined
  if (account.balance < account.start * 0.5) return account.start + account.balance
  return account.balance
}

export function runningBalance(account: FundAccount, accounts: FundAccount[], sessions: { date: string; operations?: TakenOp[] }[]): BalancePoint[] {
  const opening = openingBalance(account)
  if (opening == null) return []
  let balance = opening
  const points: BalancePoint[] = [{ date: "Inicio", balance }]
  const days = [...sessions].filter((day) => day.date).sort((a, b) => a.date.localeCompare(b.date))
  for (const day of days) {
    let moved = false
    for (const op of day.operations ?? []) {
      if (!op.result || op.result === "breakeven") continue
      if (!withReplicas(op.accounts ?? [], accounts).includes(account.id)) continue
      balance += opDollars(account, op, accounts)
      moved = true
    }
    if (moved) points.push({ date: day.date, balance })
  }
  return points
}

export function dayCalls(accounts: FundAccount[], ops: TakenOp[]): RiskCall[] {
  const calls: RiskCall[] = []
  for (const account of accounts) {
    let delta = 0
    let lost = 0
    let touched = false
    for (const op of ops) {
      if (!op.result || op.result === "breakeven") continue
      if (!withReplicas(op.accounts ?? [], accounts).includes(account.id)) continue
      touched = true
      const move = opDollars(account, op, accounts)
      delta += move
      if (move < 0) lost += -move
    }
    if (!touched) continue
    const previous = openingBalance(account) ?? account.start
    calls.push({
      accountId: account.id,
      name: account.name,
      previous,
      balance: previous + delta,
      delta,
      lost,
      good: lost <= account.risk + 0.001,
    })
  }
  return calls
}

export function marksFor(accountId: string, history: BalanceMark[]): { date: string; balance: number }[] {
  const marks: { date: string; balance: number }[] = []
  for (const day of history) {
    const hit = day.balances?.find((item) => item.accountId === accountId)
    if (hit) marks.push({ date: day.date, balance: hit.balance })
  }
  return marks.sort((a, b) => a.date.localeCompare(b.date))
}

export function previousBalance(account: FundAccount, history: BalanceMark[], date: string): number {
  const prior = marksFor(account.id, history).filter((mark) => mark.date < date)
  return prior.length > 0 ? prior[prior.length - 1].balance : (account.balance ?? account.start)
}

export function judgeDay(accounts: FundAccount[], history: BalanceMark[], date: string, today: DayBalance[]): RiskCall[] {
  const calls: RiskCall[] = []
  for (const account of accounts) {
    const hit = today.find((item) => item.accountId === account.id)
    if (!hit || !Number.isFinite(hit.balance)) continue
    const previous = previousBalance(account, history, date)
    const delta = hit.balance - previous
    const lost = Math.max(0, -delta)
    calls.push({
      accountId: account.id,
      name: account.name,
      previous,
      balance: hit.balance,
      delta,
      lost,
      good: lost <= account.risk + 0.001,
    })
  }
  return calls
}
