import type { AccountBook, DayBalance } from './accounts'
export const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
] as const

export const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'] as const
export const WEEKDAYS_SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'] as const
export const WEEKDAYS_MON_FIRST = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'] as const

export type Result = 'win' | 'loss' | 'breakeven'
export type AnswerValue = 'yes' | 'no' | 'na'
export type RuleKind = 'yesno' | 'tri'
export type SessionStatus = 'rest' | 'completed'

export const RESULT_LABEL: Record<Result, string> = {
  win: 'Ganancia',
  loss: 'Pérdida',
  breakeven: 'Tablas',
}

export interface RuleDef {
  id: string
  text: string
  kind: RuleKind
  custom: boolean
  position: number
}

export interface Answer {
  id: string
  text: string
  kind: RuleKind
  value: AnswerValue | null
}

export interface TradeOp {
  answers: Answer[]
  result: Result | null
  learned: string
  analysis?: string
  risk?: number
  reward?: number
  pnl?: number
  amounts?: Record<string, number>
  accounts?: string[]
}

export interface SessionRecord {
  date: string
  status: SessionStatus
  result: Result | null
  learned: string
  note: string
  answers: Answer[]
  operations?: TradeOp[]
  balances?: DayBalance[]
  book?: AccountBook
  disciplined: boolean
}

export const CORE_RULES: Array<Omit<RuleDef, 'id'>> = [
  { position: 1, text: '¿Acepté el riesgo antes de entrar?', kind: 'yesno', custom: false },
  { position: 2, text: '¿Respeté mi estrategia?', kind: 'yesno', custom: false },
  { position: 3, text: '¿Operé pasivo en un nivel?', kind: 'tri', custom: false },
  { position: 4, text: '¿Respeté mi stop loss?', kind: 'yesno', custom: false },
  { position: 5, text: '¿Evité operar por venganza o por FOMO?', kind: 'yesno', custom: false },
  { position: 6, text: '¿Respeté mi límite diario?', kind: 'yesno', custom: false },
  { position: 7, text: '¿Acepté el resultado sin intentar recuperar?', kind: 'yesno', custom: false },
]

export function toKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function parseKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function isValidDateKey(key: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false
  return toKey(parseKey(key)) === key
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

export function weekdayName(date: Date): string {
  return WEEKDAYS[date.getDay()]
}

export function monthLabel(year: number, month: number): string {
  const name = MONTHS[month]
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`
}

export function formatLong(date: Date): string {
  return `${weekdayName(date)} ${date.getDate()} de ${MONTHS[date.getMonth()]} de ${date.getFullYear()}`
}

export function monthMatrix(year: number, month: number): Date[][] {
  const first = new Date(year, month, 1)
  const offset = (first.getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: Date[] = []
  for (let i = 0; i < offset; i += 1) cells.push(new Date(year, month, 1 - (offset - i)))
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(new Date(year, month, day))
  while (cells.length % 7 !== 0) cells.push(addDays(cells[cells.length - 1], 1))
  const weeks: Date[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

export function answersPass(answers: Answer[]): boolean {
  if (answers.length === 0) return false
  return answers.every((answer) => {
    if (answer.kind === 'tri') return answer.value === 'yes' || answer.value === 'na'
    return answer.value === 'yes'
  })
}

export function operationsPass(ops: TradeOp[]): boolean {
  if (ops.length < 1 || ops.length > 3) return false
  return ops.every((op) => answersPass(op.answers))
}

export function blankAnswers(rules: RuleDef[]): Answer[] {
  return [...rules]
    .sort((a, b) => a.position - b.position)
    .map((rule) => ({ id: rule.id, text: rule.text, kind: rule.kind, value: null }))
}

export function orderedDisciplined(sessions: SessionRecord[]): SessionRecord[] {
  return sessions
    .filter((session) => session.status === 'completed' && session.disciplined)
    .sort((a, b) => a.date.localeCompare(b.date))
}

export function pieceForDate(date: string, ordered: SessionRecord[]): number {
  const index = ordered.findIndex((session) => session.date === date)
  if (index < 0) return 0
  return index + 1
}

export function disciplineStreak(sessions: SessionRecord[], today = new Date()): number {
  const byDate = new Map(sessions.map((session) => [session.date, session]))
  let cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  let count = 0
  for (let guard = 0; guard < 4000; guard += 1) {
    const session = byDate.get(toKey(cursor))
    if (!session || session.status === 'rest') {
      cursor = addDays(cursor, -1)
      continue
    }
    if (session.status === 'completed' && session.disciplined) {
      count += 1
      cursor = addDays(cursor, -1)
      continue
    }
    break
  }
  return count
}

export interface MonthStats {
  rulesPercent: number | null
  disciplinedDays: number
  completedSessions: number
  restDays: number
  wins: number
  losses: number
  breakevens: number
  mostBroken: { text: string; count: number }[]
  matrix: { result: Result; disciplined: number; undisciplined: number }[]
}

export function monthStats(sessions: SessionRecord[], year: number, month: number): MonthStats {
  const inMonth = sessions.filter((session) => {
    if (!isValidDateKey(session.date)) return false
    const date = parseKey(session.date)
    return date.getFullYear() === year && date.getMonth() === month
  })
  const completed = inMonth.filter((session) => session.status === 'completed')
  let followed = 0
  let total = 0
  const broken = new Map<string, number>()
  const matrix: MonthStats['matrix'] = [
    { result: 'win', disciplined: 0, undisciplined: 0 },
    { result: 'loss', disciplined: 0, undisciplined: 0 },
    { result: 'breakeven', disciplined: 0, undisciplined: 0 },
  ]
  let wins = 0
  let losses = 0
  let breakevens = 0
  let disciplinedDays = 0
  for (const session of completed) {
    if (session.disciplined) disciplinedDays += 1
    for (const answer of session.answers) {
      if (answer.kind === 'tri' && answer.value === 'na') continue
      if (answer.value === null) continue
      total += 1
      if (answer.value === 'yes') followed += 1
      if (answer.value === 'no') broken.set(answer.text, (broken.get(answer.text) ?? 0) + 1)
    }
    if (session.result === 'win') wins += 1
    if (session.result === 'loss') losses += 1
    if (session.result === 'breakeven') breakevens += 1
    if (session.result) {
      const row = matrix.find((item) => item.result === session.result)
      if (row) {
        if (session.disciplined) row.disciplined += 1
        else row.undisciplined += 1
      }
    }
  }
  let top = 0
  for (const count of broken.values()) top = Math.max(top, count)
  return {
    rulesPercent: total === 0 ? null : Math.round((followed / total) * 1000) / 10,
    disciplinedDays,
    completedSessions: completed.length,
    restDays: inMonth.filter((session) => session.status === 'rest').length,
    wins,
    losses,
    breakevens,
    mostBroken: top === 0 ? [] : [...broken.entries()].filter(([, count]) => count === top).map(([text, count]) => ({ text, count })),
    matrix,
  }
}

export function formName(day: number): string {
  if (day > 365) return 'Expansión'
  if (day >= 365) return 'Leyenda'
  if (day >= 331) return 'Insignia'
  if (day >= 301) return 'Flota'
  if (day >= 271) return 'Mega'
  if (day >= 241) return 'Ruta larga'
  if (day >= 211) return 'Jets'
  if (day >= 181) return 'VIP'
  if (day >= 151) return 'Moderno'
  if (day >= 121) return 'Internacional'
  if (day >= 91) return 'Comercial'
  if (day >= 61) return 'Pista'
  if (day >= 31) return 'Regional'
  if (day >= 1) return 'Aeródromo'
  return 'Nada'
}

export function lossLine(result: Result | null, disciplined: boolean): string {
  if (disciplined && result === 'loss') return 'Una pérdida no define tu capacidad.'
  if (disciplined) return 'El proceso se cumplió. El dinero no decide el hito.'
  if (result === 'win') return 'Una victoria no cambia tus reglas.'
  if (result === 'loss') return 'No necesitas recuperar nada.'
  return 'Puedes cerrar el día sin forzar otra operación.'
}

export interface CurvePoint {
  date: string
  result: Result
  step: number
  cumulative: number
  disciplined: boolean
  risk: number
  reward: number
}

export function normalizeStake(value: number | undefined, fallback = 1) {
  if (value == null || !Number.isFinite(value)) return fallback
  return Math.min(20, Math.max(0, Math.round(value)))
}

export function cleanPnl(value: number | undefined): number | undefined {
  if (value == null || !Number.isFinite(value) || value < 0) return undefined
  return Math.round(value * 100) / 100
}

export function stakeFromPnl(pnl: number, accountRisk: number): number {
  if (!Number.isFinite(pnl) || pnl <= 0 || !Number.isFinite(accountRisk) || accountRisk <= 0) return 0
  return normalizeStake(Math.max(1, Math.round(pnl / accountRisk)))
}

export function resultCurve(sessions: SessionRecord[]): CurvePoint[] {
  const ordered = sessions
    .filter((session) => session.status === 'completed' && isValidDateKey(session.date))
    .sort((a, b) => a.date.localeCompare(b.date))
  const points: CurvePoint[] = []
  let cumulative = 0
  for (const session of ordered) {
    const fromOps = (session.operations ?? []).filter((op) => op.result !== null)
    const stakes: Array<{ result: Result | null; risk?: number; reward?: number }> = fromOps.length > 0 ? fromOps : session.result ? [{ result: session.result }] : []
    for (const stake of stakes) {
      const result = stake.result
      if (!result) continue
      const risk = normalizeStake(stake.risk)
      const reward = normalizeStake(stake.reward)
      const step = result === 'win' ? reward : result === 'loss' ? -risk || 0 : 0
      cumulative += step
      points.push({ date: session.date, result, step, cumulative, disciplined: session.disciplined, risk, reward })
    }
  }
  return points
}

export function dayMark(session: SessionRecord): { net: number; letter: 'c' | 'n' } | null {
  if (session.status !== 'completed') return null
  const fromOps = (session.operations ?? []).filter((op) => op.result !== null)
  const stakes: Array<{ result: Result | null; risk?: number; reward?: number }> = fromOps.length > 0 ? fromOps : session.result ? [{ result: session.result }] : []
  if (stakes.length === 0) return null
  let net = 0
  for (const stake of stakes) {
    const result = stake.result
    if (!result) continue
    const risk = normalizeStake(stake.risk)
    const reward = normalizeStake(stake.reward)
    net += result === 'win' ? reward : result === 'loss' ? -risk || 0 : 0
  }
  return { net, letter: session.disciplined ? 'c' : 'n' }
}

export interface Orchard {
  apples: number
  people: number
  ugly: boolean
}

export function orchard(sessions: SessionRecord[]): Orchard {
  let apples = 0
  let people = 0
  let ugly = false
  for (const point of resultCurve(sessions)) {
    if (point.result === 'win') {
      apples += point.reward
      people += point.reward
      ugly = false
      continue
    }
    if (point.result === 'loss') {
      if (apples < point.risk) ugly = true
      apples = Math.max(0, apples - point.risk)
      people = Math.max(0, people - point.risk)
    }
  }
  return { apples, people, ugly }
}

