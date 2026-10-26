import { describe, expect, it } from 'vitest'
import {
  answersPass,
  operationsPass,
  disciplineStreak,
  crewCount,
  formName,
  monthMatrix,
  monthStats,
  orchard,
  stakeFromPnl,
  dayMark,
  resultCurve,
  orderedDisciplined,
  parseKey,
  pieceForDate,
  toKey,
  weekdayName,
  type Answer,
  type TradeOp,
  type SessionRecord,
} from './domain'
import { UNLOCKS, unlockName } from './unlocks'

function answer(value: Answer['value'], kind: Answer['kind'] = 'yesno', text = 'Regla'): Answer {
  return { id: text, text, kind, value }
}

function blank(): Answer[] {
  return [answer('yes'), answer('na', 'tri', 'pasiva')]
}

function session(date: string, disciplined: boolean, result: SessionRecord['result'] = 'loss', status: SessionRecord['status'] = 'completed'): SessionRecord {
  return {
    date,
    status,
    result: status === 'rest' ? null : result,
    learned: '',
    note: '',
    answers: disciplined ? [answer('yes')] : [answer('no')],
    disciplined,
  }
}

describe('año', () => {
  it('tiene 365 piezas y no se salta el índice', () => {
    expect(UNLOCKS).toHaveLength(365)
    expect(unlockName(1)).toBe('Un terreno vacío con hierba y tierra.')
    expect(unlockName(30)).toContain('vuelos')
    expect(unlockName(90)).toContain('pista')
    expect(unlockName(180)).toContain('pasajeros')
    expect(unlockName(300)).toContain('pistas')
    expect(unlockName(365)).toContain('365')
    expect(new Set(UNLOCKS).size).toBeGreaterThan(300)
  })

  it('la pasiva en no aplicaba no penaliza, y un no sí', () => {
    expect(answersPass([answer('yes'), answer('na', 'tri', '¿Operé pasivo en un nivel?')])).toBe(true)
    expect(answersPass([answer('yes'), answer('no', 'tri', '¿Operé pasivo en un nivel?')])).toBe(false)
    expect(answersPass([answer(null)])).toBe(false)
  })

  it('asigna una pieza por fecha disciplinada, sin duplicar al repetir', () => {
    const sessions = [
      session('2026-10-23', true, 'loss'),
      session('2026-10-22', true, 'win'),
      session('2026-10-21', false, 'win'),
      session('2026-10-24', true, null, 'rest'),
    ]
    const ordered = orderedDisciplined(sessions)
    expect(ordered.map((item) => item.date)).toEqual(['2026-10-22', '2026-10-23'])
    expect(pieceForDate('2026-10-22', ordered)).toBe(1)
    expect(pieceForDate('2026-10-23', ordered)).toBe(2)
    expect(pieceForDate('2026-10-21', ordered)).toBe(0)
    expect(pieceForDate('2026-10-22', ordered)).toBe(pieceForDate('2026-10-22', orderedDisciplined(sessions)))
  })

  it('el descanso y el día vacío no rompen la racha', () => {
    const sessions = [
      session('2026-10-22', true),
      session('2026-10-23', true, null, 'rest'),
      session('2026-10-21', false, 'win'),
    ]
    expect(disciplineStreak(sessions, parseKey('2026-10-25'))).toBe(1)
    expect(disciplineStreak([session('2026-10-23', false, 'win')], parseKey('2026-10-23'))).toBe(0)
  })

  it('separa el dinero de la pieza y respeta el calendario real', () => {
    const stats = monthStats(
      [session('2026-10-22', true, 'loss'), session('2026-10-23', false, 'win')],
      2026,
      9,
    )
    expect(stats.disciplinedDays).toBe(1)
    expect(stats.wins).toBe(1)
    expect(stats.losses).toBe(1)
    expect(stats.matrix.find((row) => row.result === 'loss')?.disciplined).toBe(1)
    expect(stats.matrix.find((row) => row.result === 'win')?.undisciplined).toBe(1)
    expect(monthStats([], 2026, 10).rulesPercent).toBeNull()
    expect(weekdayName(parseKey('2026-10-23'))).toBe('viernes')
    expect(weekdayName(parseKey('2026-10-25'))).toBe('domingo')
    expect(monthMatrix(2024, 1).flat().map(toKey)).toContain('2024-02-29')
    expect(monthMatrix(2023, 1).flat().map(toKey)).not.toContain('2023-02-29')
  })

  it('cambia de etapa y sigue después de la mansión', () => {
    expect(crewCount(0)).toBe(0)
    expect(crewCount(1)).toBe(1)
    expect(crewCount(12)).toBe(12)
    expect(crewCount(64)).toBe(64)
    expect(crewCount(400)).toBe(64)
    expect(formName(0)).toBe('Nada')
    expect(formName(1)).toBe('Aeródromo')
    expect(formName(90)).toBe('Pista')
    expect(formName(365)).toBe('Leyenda')
    expect(formName(366)).toBe('Expansión')
    expect(unlockName(366)).toContain('pista')
    expect(unlockName(380)).toContain('380')
    const many = Array.from({ length: 366 }, (_, index) => {
      const date = new Date(2020, 0, 1 + index)
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      return session(key, true)
    })
    const orderedMany = orderedDisciplined(many)
    expect(pieceForDate(orderedMany[365].date, orderedMany)).toBe(366)
  })
})

  it('acepta de una a tres operaciones y rechaza la cuarta', () => {
    const good: TradeOp = { answers: blank(), result: 'loss', learned: '' }
    const bad: TradeOp = { answers: blank().map((answer, index) => index === 0 ? { ...answer, value: 'no' } : answer), result: 'win', learned: '' }
    expect(operationsPass([good])).toBe(true)
    expect(operationsPass([good, good, good])).toBe(true)
    expect(operationsPass([good, bad])).toBe(false)
    expect(operationsPass([good, good, good, good])).toBe(false)
    expect(operationsPass([])).toBe(false)
  })

describe('curva', () => {
  it('sube con la ganancia, baja con la pérdida y se queda en la tabla', () => {
    const points = resultCurve([
      session('2026-10-25', true, 'loss'),
      session('2026-10-23', false, 'win'),
      session('2026-10-24', true, null, 'rest'),
      { ...session('2026-10-26', true, 'breakeven'), operations: [
        { answers: blank(), result: 'win', learned: '' },
        { answers: blank(), result: 'loss', learned: '' },
        { answers: blank(), result: 'breakeven', learned: '' },
      ] },
    ])
    expect(points.map((point) => point.cumulative)).toEqual([1, 0, 1, 0, 0])
    expect(points.map((point) => point.date)).toEqual([
      '2026-10-23',
      '2026-10-25',
      '2026-10-26',
      '2026-10-26',
      '2026-10-26',
    ])
    expect(resultCurve([])).toEqual([])
  })
})

describe('cubo', () => {
  it('un ratio 1-3 suma tres y una perdida quita uno', () => {
    const win = { answers: blank(), result: 'win' as const, learned: '', risk: 1, reward: 3 }
    const loss = { answers: blank(), result: 'loss' as const, learned: '', risk: 1, reward: 3 }
    const sessions = [
      { ...session('2026-10-20', true, 'win'), operations: [win] },
      { ...session('2026-10-21', true, 'loss'), operations: [loss] },
    ]
    expect(resultCurve(sessions).map((point) => point.cumulative)).toEqual([3, 2])
    expect(orchard(sessions)).toEqual({ apples: 2, people: 2, ugly: false })
  })

  it('parte la plata por el riesgo de la cuenta', () => {
    expect(stakeFromPnl(1200, 400)).toBe(3)
    expect(stakeFromPnl(600, 400)).toBe(2)
    expect(stakeFromPnl(50, 400)).toBe(1)
    expect(stakeFromPnl(0, 400)).toBe(0)
    expect(stakeFromPnl(100000, 400)).toBe(20)
  })

  it('una perdida de cero no mueve el cubo', () => {
    const loss = { answers: blank(), result: 'loss' as const, learned: '', risk: 0, reward: 0 }
    const sessions = [{ ...session('2026-10-20', true, 'loss'), operations: [loss] }]
    expect(resultCurve(sessions).map((point) => point.step)).toEqual([0])
    expect(orchard(sessions)).toEqual({ apples: 0, people: 0, ugly: false })
  })

  it('perder sin manzanas pone el cubo feo y no baja de cero', () => {
    const loss = { answers: blank(), result: 'loss' as const, learned: '', risk: 1, reward: 3 }
    const sessions = [{ ...session('2026-10-20', false, 'loss'), operations: [loss] }]
    expect(resultCurve(sessions).map((point) => point.cumulative)).toEqual([-1])
    expect(orchard(sessions)).toEqual({ apples: 0, people: 0, ugly: true })
  })
})

describe('calendario', () => {
  it('muestra el neto del dia y si cumplio las reglas', () => {
    const win = { answers: blank(), result: 'win' as const, learned: '', risk: 1, reward: 3 }
    const loss = { answers: blank(), result: 'loss' as const, learned: '', risk: 1, reward: 3 }
    const good = { ...session('2026-10-20', true, 'win'), operations: [win] }
    const bad = { ...session('2026-10-21', false, 'loss'), operations: [loss] }
    const mix = { ...session('2026-10-22', true, 'win'), operations: [win, loss] }
    expect(dayMark(good)).toEqual({ net: 3, letter: 'c' })
    expect(dayMark(bad)).toEqual({ net: -1, letter: 'n' })
    expect(dayMark(mix)).toEqual({ net: 2, letter: 'c' })
    expect(dayMark(session('2026-10-23', true, null, 'rest'))).toBeNull()
  })
})

