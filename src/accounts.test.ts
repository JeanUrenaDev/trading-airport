import { describe, expect, it } from "vitest"
import { applyType, dayCalls, judgeDay, openingBalance, opDollars, runningBalance, shareBalance, snapshot, typesOf, type FundAccount } from "./accounts"

const topstep: FundAccount = {
  id: "a",
  firm: "topstep",
  name: "Topstep 50K",
  cost: 49,
  start: 50000,
  maxDd: 2000,
  objective: 3000,
  risk: 400,
}

describe("cuentas de fondeo", () => {
  it("el drawdown sube con el pico y no baja si el dia cierra peor", () => {
    const state = snapshot(topstep, [
      { date: "2026-10-01", balance: 50500 },
      { date: "2026-10-02", balance: 50000 },
    ])
    expect(state.peak).toBe(50500)
    expect(state.floor).toBe(48500)
    expect(state.drawdown).toBe(500)
    expect(state.room).toBe(1500)
    expect(state.busted).toBe(false)
  })

  it("Topstep traba el limite en el balance inicial", () => {
    const state = snapshot(topstep, [{ date: "2026-10-03", balance: 53000 }])
    expect(state.floor).toBe(50000)
    expect(state.locked).toBe(true)
    expect(state.passed).toBe(true)
  })

  it("Lucid traba el limite cien dolares sobre el inicio", () => {
    const lucid: FundAccount = { ...topstep, firm: "lucid", name: "Lucid 50K" }
    const state = snapshot(lucid, [{ date: "2026-10-03", balance: 53000 }])
    expect(state.floor).toBe(50100)
  })

  it("una perdida dentro del riesgo es buena y una mayor es violacion", () => {
    const history = [{ date: "2026-10-01", balances: [{ accountId: "a", balance: 50000 }] }]
    const good = judgeDay([topstep], history, "2026-10-02", [{ accountId: "a", balance: 49650 }])
    const bad = judgeDay([topstep], history, "2026-10-02", [{ accountId: "a", balance: 49000 }])
    expect(good[0].lost).toBe(350)
    expect(good[0].good).toBe(true)
    expect(bad[0].lost).toBe(1000)
    expect(bad[0].good).toBe(false)
  })

  it("un balance ya cargado muestra el profit o la perdida", () => {
    const up = snapshot({ ...topstep, balance: 51200 }, [])
    const down = snapshot({ ...topstep, balance: 49000 }, [])
    expect(up.balance).toBe(51200)
    expect(up.pnl).toBe(1200)
    expect(down.pnl).toBe(-1000)
    expect(down.drawdown).toBe(1000)
    expect(down.room).toBe(1000)
  })

  it("el primer dia compara contra el balance inicial", () => {
    const call = judgeDay([topstep], [], "2026-10-01", [{ accountId: "a", balance: 50300 }])
    expect(call[0].delta).toBe(300)
    expect(call[0].good).toBe(true)
  })

  it("el tipo hereda una cuenta igual y al guardarlo actualiza a las demas", () => {
    const other: FundAccount = { ...topstep, id: "b", name: "Topstep 50K 2", balance: 51000 }
    const lucid: FundAccount = { ...topstep, id: "c", firm: "lucid", name: "Lucid 50K", cost: 80 }
    const types = typesOf({ updated: "", accounts: [topstep, other, lucid] })
    expect(types.find((item) => item.firm === "topstep" && item.start === 50000)?.cost).toBe(49)
    const next = applyType([topstep, other, lucid], { firm: "topstep", label: "50K", start: 50000, cost: 87, maxDd: 2000, objective: 3000, risk: 300 })
    expect(next.map((account) => account.cost)).toEqual([87, 87, 80])
    expect(next.map((account) => account.risk)).toEqual([300, 300, 400])
  })

  it("una operacion mueve la cuenta elegida y sus replicas", () => {
    const lead: FundAccount = { ...topstep, balance: 50350, risk: 300 }
    const copy: FundAccount = { ...topstep, id: "b", name: "Copia", balance: 50350, risk: 300, replicaOf: "a" }
    const alone: FundAccount = { ...topstep, id: "c", name: "Sola", balance: 50000, risk: 300 }
    const book = [lead, copy, alone]
    const sessions = [{ date: "2026-10-25", operations: [{ result: "win" as const, reward: 3, risk: 1, accounts: ["a"] }] }]
    expect(runningBalance(lead, book, sessions).map((point) => point.balance)).toEqual([50350, 51250])
    expect(runningBalance(copy, book, sessions).map((point) => point.balance)).toEqual([50350, 51250])
    expect(runningBalance(alone, book, sessions)).toEqual([{ date: "Inicio", balance: 50000 }])
    const sibling: FundAccount = { ...topstep, id: "d", name: "Otra", balance: 50350, risk: 300, replicaOf: "a" }
    const group = [lead, copy, sibling, alone]
    const fromCopy = [{ date: "2026-10-25", operations: [{ result: "win" as const, reward: 3, risk: 1, accounts: ["b"] }] }]
    expect(runningBalance(lead, group, fromCopy).at(-1)?.balance).toBe(51250)
    expect(runningBalance(copy, group, fromCopy).at(-1)?.balance).toBe(51250)
    expect(runningBalance(sibling, group, fromCopy).at(-1)?.balance).toBe(51250)
    expect(runningBalance(alone, group, fromCopy).at(-1)?.balance).toBe(50000)
    const calls = dayCalls(book, [
      { result: "loss", risk: 1, accounts: ["a"] },
      { result: "loss", risk: 1, accounts: ["a"] },
    ])
    expect(calls.find((call) => call.accountId === "a")?.lost).toBe(600)
    expect(calls.find((call) => call.accountId === "a")?.good).toBe(false)
    expect(calls.find((call) => call.accountId === "c")).toBeUndefined()
  })

  it("la plata escrita manda sobre el ratio", () => {
    const account = { ...topstep, risk: 400 }
    expect(opDollars(account, { result: "win", pnl: 250, reward: 3, risk: 1 })).toBe(250)
    expect(opDollars(account, { result: "loss", pnl: 700 })).toBe(-700)
    expect(opDollars(account, { result: "win", reward: 3, risk: 1 })).toBe(1200)
    expect(opDollars(account, { result: "breakeven", pnl: 100 })).toBe(0)
    const sessions = [{ date: "2026-10-25", operations: [{ result: "loss" as const, pnl: 700, accounts: ["a"] }] }]
    expect(runningBalance({ ...account, balance: 50000 }, [account], sessions).at(-1)?.balance).toBe(49300)
    const calls = dayCalls([account], [{ result: "loss", pnl: 700, accounts: ["a"] }])
    expect(calls[0].lost).toBe(700)
    expect(calls[0].good).toBe(false)
  })

  it("cada cuenta tiene su plata y la copia usa la de su origen", () => {
    const lead: FundAccount = { ...topstep, risk: 400, balance: 50000 }
    const copy: FundAccount = { ...topstep, id: "b", name: "Copia", risk: 800, balance: 50000, replicaOf: "a" }
    const alone: FundAccount = { ...topstep, id: "c", name: "Sola", risk: 300, balance: 50000 }
    const book = [lead, copy, alone]
    const op = { result: "loss" as const, accounts: ["a", "c"], amounts: { a: -500, c: -200 } }
    expect(opDollars(lead, op, book)).toBe(-500)
    expect(opDollars(copy, op, book)).toBe(-500)
    expect(opDollars(alone, op, book)).toBe(-200)
    const sessions = [{ date: "2026-10-25", operations: [op] }]
    expect(runningBalance(lead, book, sessions).at(-1)?.balance).toBe(49500)
    expect(runningBalance(copy, book, sessions).at(-1)?.balance).toBe(49500)
    expect(runningBalance(alone, book, sessions).at(-1)?.balance).toBe(49800)
    const calls = dayCalls(book, [op])
    expect(calls.find((call) => call.accountId === "a")?.good).toBe(false)
    expect(calls.find((call) => call.accountId === "b")?.lost).toBe(500)
    expect(calls.find((call) => call.accountId === "b")?.good).toBe(true)
    expect(calls.find((call) => call.accountId === "c")?.lost).toBe(200)
    const mixed = { result: "win" as const, accounts: ["a", "c"], amounts: { a: 900, c: -500 } }
    expect(opDollars(lead, mixed, book)).toBe(900)
    expect(opDollars(copy, mixed, book)).toBe(900)
    expect(opDollars(alone, mixed, book)).toBe(-500)
  })

  it("el balance solo se copia a las cuentas que marcas", () => {
    const lead: FundAccount = { ...topstep, balance: 50000 }
    const copy: FundAccount = { ...topstep, id: "b", name: "Copia", balance: 50000, replicaOf: "a" }
    const sibling: FundAccount = { ...topstep, id: "d", name: "Otra", balance: 50100, replicaOf: "a" }
    const alone: FundAccount = { ...topstep, id: "c", name: "Sola", balance: 49000 }
    const next = shareBalance([lead, copy, sibling, alone], ["b"], 49550)
    expect(next.find((account) => account.id === "a")?.balance).toBe(50000)
    expect(next.find((account) => account.id === "b")?.balance).toBe(49550)
    expect(next.find((account) => account.id === "d")?.balance).toBe(50100)
    expect(next.find((account) => account.id === "c")?.balance).toBe(49000)
    const marked = shareBalance([lead, copy, sibling, alone], ["a", "b"], 50650)
    expect(marked.find((account) => account.id === "a")?.balance).toBe(50650)
    expect(marked.find((account) => account.id === "b")?.balance).toBe(50650)
    expect(marked.find((account) => account.id === "d")?.balance).toBe(50100)
    expect(marked.find((account) => account.id === "b")?.name).toBe("Copia")
  })

  it("un balance chico es la ganancia y entra en la escala de la cuenta", () => {
    const small: FundAccount = { ...topstep, balance: 450 }
    const full: FundAccount = { ...topstep, balance: 49550 }
    expect(openingBalance(small)).toBe(50450)
    expect(openingBalance(full)).toBe(49550)
    expect(runningBalance(small, [small], []).map((point) => point.balance)).toEqual([50450])
  })
})
