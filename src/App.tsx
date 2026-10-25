import { useEffect, useMemo, useState } from 'react'
import type { Session as AuthSession } from '@supabase/supabase-js'
import { Board } from './components/Board'
import { supabase, supabaseReady } from './lib/supabase'
import { remoteStore, signIn, signOut, signUp } from './remote'
import { localStore } from './store'

const browserStore = localStore()

export function App() {
  const [ready, setReady] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (!supabase) {
      setReady(true)
      return
    }
    let alive = true
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return
      setUserId(data.session?.user.id ?? null)
      setReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, session: AuthSession | null) => {
      setUserId(session?.user.id ?? null)
    })
    return () => {
      alive = false
      data.subscription.unsubscribe()
    }
  }, [])

  const cloud = Boolean(supabaseReady && userId)
  const store = useMemo(() => (cloud && userId ? remoteStore(userId) : browserStore), [cloud, userId])

  if (supabaseReady && !ready) return <p className="booting">Cargando el año…</p>
  if (supabaseReady && !userId) {
    return (
      <Gate
        notice={notice}
        onSignIn={async (email, password) => {
          const error = await signIn(email, password)
          setNotice(error ?? '')
        }}
        onSignUp={async (email, password) => {
          const error = await signUp(email, password)
          setNotice(error ?? '')
        }}
      />
    )
  }
  return (
    <Board
      store={store}
      onSignOut={cloud ? () => void signOut() : undefined}
      banner={
        cloud
          ? undefined
          : 'Este año vive en este navegador. Con el proyecto de Supabase activo, la cuenta se lleva las fechas, las respuestas y los hitos.'
      }
    />
  )
}

function Gate({
  notice,
  onSignIn,
  onSignUp,
}: {
  notice: string
  onSignIn: (email: string, password: string) => Promise<void>
  onSignUp: (email: string, password: string) => Promise<void>
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const [hint, setHint] = useState('')

  async function run(action: 'in' | 'up') {
    if (!email.includes('@') || password.length < 6) {
      setHint('Pon el correo y una contraseña de al menos 6 caracteres. La primera vez pulsa Crear cuenta, no Entrar.')
      return
    }
    setHint('')
    setBusy(true)
    if (action === 'in') await onSignIn(email.trim(), password)
    else await onSignUp(email.trim(), password)
    setBusy(false)
  }

  return (
    <main className="gate">
      <p className="kicker">Un año. Un hito por día limpio.</p>
      <h1>GOKU</h1>
      <p>La primera vez pulsa Crear cuenta. Entrar sirve cuando la cuenta ya existe.</p>
      <label>
        Correo
        <input value={email} type="email" autoComplete="email" onChange={(event) => setEmail(event.target.value)} />
      </label>
      <label>
        Contraseña
        <input value={password} type="password" autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} />
      </label>
      {hint || notice ? <p className="alert" role="alert">{hint || notice}</p> : null}
      <div className="row">
        <button type="button" className="solid" disabled={busy} onClick={() => void run('in')}>Entrar</button>
        <button type="button" className="ghost" disabled={busy} onClick={() => void run('up')}>Crear cuenta</button>
      </div>
    </main>
  )
}

