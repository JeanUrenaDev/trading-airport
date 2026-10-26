# Trading Tycoon

De pobre a magnate. Cada día que cumples tus reglas desbloquea el siguiente hito, del colchón a la mansión. El dinero no desbloquea nada: una pérdida disciplinada cuenta igual que una ganancia.

## Correrlo

```bash
npm install
npm run dev
```

Abre la dirección que imprime Vite. Sin claves, el año se guarda en este navegador.

## Supabase

1. Abre el proyecto en el panel.
2. En el editor SQL, pega y ejecuta `supabase/schema.sql`.
3. En Settings → API copia la URL del proyecto y la clave `anon`. No copies la clave `service_role`.
4. Crea `.env.local` en la raíz:

```
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-clave-anon
```

5. Reinicia `npm run dev` y entra con correo y contraseña.

Las tablas tienen RLS: cada usuario solo ve sus filas. `recompute_unlocks` vuelve a numerar los hitos desde las sesiones guardadas, así que recargar no desbloquea dos veces el mismo día. Si el registro pide confirmar el correo, el mensaje aparece en la pantalla de entrada.

En la entrada, **Ver como invitado** abre el año de jeanliral@gmail.com en solo lectura: días, reglas y cuentas. `guest_journal` vive al final de `supabase/schema.sql`. Hay que ejecutarlo en el editor SQL para que el invitado pueda leer. No escribe.

La pregunta «¿Operé pasivo en un nivel?» acepta Sí, No o No aplicaba. No aplicaba no resta. Un día marcado como «No operé» no rompe la racha y no da hito. Después del día 365 la propiedad sigue creciendo.
