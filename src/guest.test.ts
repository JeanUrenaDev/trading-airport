import { describe, expect, it } from 'vitest'
import { journalFromGuest } from './remote'

describe('journalFromGuest', () => {
  it('ignores a payload that is not the journal', () => {
    expect(journalFromGuest(null)).toEqual({ rules: [], sessions: [] })
    expect(journalFromGuest({ rules: {}, sessions: 'no' })).toEqual({ rules: [], sessions: [] })
  })

  it('keeps Jean’s rules and days, including the packed operations', () => {
    const journal = journalFromGuest({
      rules: [
        { id: 'b', position: 2, text: '¿Respeté mi estrategia?', kind: 'yesno', custom: false },
        { id: 'a', position: 1, text: '¿Acepté el riesgo antes de entrar?', kind: 'yesno', custom: false },
        { id: 'bad', position: 3, text: 'fuera', kind: 'other', custom: false },
      ],
      sessions: [
        {
          session_date: '2026-10-02',
          status: 'completed',
          result: 'win',
          learned: 'esperé',
          note: '',
          disciplined: true,
          answers: {
            v: 3,
            answers: [{ id: 'a', text: '¿Acepté el riesgo antes de entrar?', kind: 'yesno', value: 'yes' }],
            operations: [{
              answers: [{ id: 'a', text: '¿Acepté el riesgo antes de entrar?', kind: 'yesno', value: 'yes' }],
              result: 'win',
              learned: 'esperé',
              analysis: 'nivel',
              accounts: ['topstep'],
            }],
            balances: [{ accountId: 'topstep', balance: 50000 }],
            book: { updated: '2026-10-02T00:00:00.000Z', accounts: [{ id: 'topstep', name: 'Jean' }] },
          },
        },
        { session_date: '2026-10-01', status: 'rest', result: null, learned: '', note: 'libre', answers: [], disciplined: false },
      ],
    })

    expect(journal.rules.map((rule) => rule.id)).toEqual(['a', 'b'])
    expect(journal.sessions.map((session) => session.date)).toEqual(['2026-10-01', '2026-10-02'])
    expect(journal.sessions[1].operations?.[0].analysis).toBe('nivel')
    expect(journal.sessions[1].book?.accounts[0].name).toBe('Jean')
    expect(journal.sessions[0].status).toBe('rest')
  })
})
