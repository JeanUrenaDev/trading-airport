import { CORE_RULES, type RuleDef, type SessionRecord } from './domain'

export interface PetStore {
  loadRules: () => Promise<RuleDef[]>
  loadSessions: () => Promise<SessionRecord[]>
  saveSession: (session: SessionRecord) => Promise<void>
  addRule: (text: string, position: number) => Promise<void>
  renameRule: (id: string, text: string) => Promise<void>
  removeRule: (id: string) => Promise<void>
}

const KEY = 'trading-pet-goku-v1'

interface LocalData {
  rules: RuleDef[]
  sessions: SessionRecord[]
}

function empty(): LocalData {
  return {
    rules: CORE_RULES.map((rule) => ({ ...rule, id: crypto.randomUUID() })),
    sessions: [],
  }
}

function read(): LocalData {
  const raw = localStorage.getItem(KEY)
  if (!raw) {
    const next = empty()
    localStorage.setItem(KEY, JSON.stringify(next))
    return next
  }
  try {
    const parsed = JSON.parse(raw) as LocalData
    if (!Array.isArray(parsed.rules) || !Array.isArray(parsed.sessions)) throw new Error('forma')
    return parsed
  } catch {
    localStorage.setItem(`${KEY}-backup`, raw)
    const next = empty()
    localStorage.setItem(KEY, JSON.stringify(next))
    return next
  }
}

function write(data: LocalData) {
  localStorage.setItem(KEY, JSON.stringify(data))
}

export function localStore(): PetStore {
  return {
    async loadRules() {
      return read().rules.sort((a, b) => a.position - b.position)
    },
    async loadSessions() {
      return read().sessions
    },
    async saveSession(session) {
      const data = read()
      const rest = data.sessions.filter((item) => item.date !== session.date)
      data.sessions = [...rest, session].sort((a, b) => a.date.localeCompare(b.date))
      write(data)
    },
    async addRule(text, position) {
      const data = read()
      data.rules.push({ id: crypto.randomUUID(), text, position, kind: 'yesno', custom: true })
      write(data)
    },
    async renameRule(id, text) {
      const data = read()
      data.rules = data.rules.map((rule) => (rule.id === id ? { ...rule, text } : rule))
      write(data)
    },
    async removeRule(id) {
      const data = read()
      data.rules = data.rules.filter((rule) => !(rule.id === id && rule.custom))
      write(data)
    },
  }
}
