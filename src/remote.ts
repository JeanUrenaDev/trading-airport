import {
  CORE_RULES,
  type Answer,
  type Result,
  type RuleDef,
  type RuleKind,
  type SessionRecord,
  type TradeOp,
  type SessionStatus,
} from './domain'
import { supabase } from './lib/supabase'
import type { PetStore } from './store'

function client() {
  if (!supabase) throw new Error('Supabase no está configurado.')
  return supabase
}

export async function currentUserId(): Promise<string | null> {
  const { data } = await client().auth.getSession()
  return data.session?.user.id ?? null
}

function human(message: string): string {
  if (/invalid login/i.test(message)) return 'Correo o contraseña incorrectos.'
  if (/already registered/i.test(message)) return 'Ese correo ya tiene cuenta. Entra con la contraseña.'
  if (/rate limit/i.test(message)) return 'Supabase frenó el correo un momento. Espera y pulsa Crear cuenta otra vez.'
  if (/password/i.test(message)) return 'La contraseña debe tener al menos 6 caracteres.'
  if (/not confirmed/i.test(message)) return 'Falta confirmar el correo. Ábrelo y luego entra.'
  if (/email/i.test(message) && /invalid/i.test(message)) return 'Supabase no pudo enviar el correo de confirmación.'
  return message
}

export async function signIn(email: string, password: string): Promise<string | null> {
  const { error } = await client().auth.signInWithPassword({ email, password })
  return error ? human(error.message) : null
}

export async function signUp(email: string, password: string): Promise<string | null> {
  const { data, error } = await client().auth.signUp({ email, password })
  if (error) return human(error.message)
  if (!data.session) return 'Revisa el correo para confirmar la cuenta y luego entra.'
  return null
}

export async function signOut(): Promise<void> {
  await client().auth.signOut()
}

interface RuleRow {
  id: string
  position: number
  text: string
  kind: RuleKind
  custom: boolean
}

interface SessionRow {
  session_date: string
  status: SessionStatus
  result: Result | null
  learned: string
  note: string
  answers: unknown
  disciplined: boolean
}

export async function loadRules(userId: string): Promise<RuleDef[]> {
  const db = client()
  const { data, error } = await db.from('rules').select('id, position, text, kind, custom').eq('user_id', userId).order('position')
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as RuleRow[]
  if (rows.length > 0) return rows
  const seed = CORE_RULES.map((rule) => ({ ...rule, user_id: userId }))
  const inserted = await db.from('rules').insert(seed).select('id, position, text, kind, custom')
  if (inserted.error) throw new Error(inserted.error.message)
  return (inserted.data ?? []) as RuleDef[]
}

export async function loadSessions(userId: string): Promise<SessionRecord[]> {
  const { data, error } = await client()
    .from('sessions')
    .select('session_date, status, result, learned, note, answers, disciplined')
    .eq('user_id', userId)
    .order('session_date')
  if (error) throw new Error(error.message)
  return ((data ?? []) as SessionRow[]).map((row) => ({
    date: row.session_date,
    status: row.status,
    result: row.result,
    learned: row.learned ?? '',
    note: row.note ?? '',
    ...unpackAnswers(row.answers),
    disciplined: row.disciplined === true,
  }))
}

export async function saveSession(userId: string, session: SessionRecord): Promise<void> {
  const db = client()
  const { error } = await db.from('sessions').upsert(
    {
      user_id: userId,
      session_date: session.date,
      status: session.status,
      result: session.result,
      learned: session.learned,
      note: session.note,
      answers: packAnswers(session),
      disciplined: session.disciplined,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,session_date' },
  )
  if (error) throw new Error(error.message)
  const recomputed = await db.rpc('recompute_unlocks')
  if (recomputed.error) throw new Error(recomputed.error.message)
}

export async function addRule(userId: string, text: string, position: number): Promise<void> {
  const { error } = await client().from('rules').insert({
    user_id: userId,
    text,
    position,
    kind: 'yesno',
    custom: true,
  })
  if (error) throw new Error(error.message)
}

export async function renameRule(id: string, text: string): Promise<void> {
  const { error } = await client().from('rules').update({ text }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function removeRule(id: string): Promise<void> {
  const { error } = await client().from('rules').delete().eq('id', id).eq('custom', true)
  if (error) throw new Error(error.message)
}


function packAnswers(session: SessionRecord): unknown {
  if (session.operations && session.operations.length > 0) {
    return { v: 2, answers: session.answers, operations: session.operations }
  }
  return session.answers
}

function unpackAnswers(raw: unknown): { answers: Answer[]; operations?: TradeOp[] } {
  if (Array.isArray(raw)) return { answers: raw as Answer[] }
  if (raw && typeof raw === "object" && Array.isArray((raw as { operations?: unknown }).operations)) {
    const packed = raw as { answers?: unknown; operations: TradeOp[] }
    return {
      answers: Array.isArray(packed.answers) ? (packed.answers as Answer[]) : [],
      operations: packed.operations.slice(0, 3),
    }
  }
  return { answers: [] }
}

export function remoteStore(userId: string): PetStore {
  return {
    loadRules: () => loadRules(userId),
    loadSessions: () => loadSessions(userId),
    saveSession: (session) => saveSession(userId, session),
    addRule: (text, position) => addRule(userId, text, position),
    renameRule,
    removeRule,
  }
}
