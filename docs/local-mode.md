# Probar el modo local

El modo `local` (default) usa `EventEmitter2` en proceso: `CreateUserUseCase` publica `user.created` y `UserCreatedListener` lo consume en el mismo proceso, con **reintentos con backoff** y, si se agotan, **dead-letter** en la colección `dead_letter_events` de Firestore.

Solo necesitas el **emulador de Firestore** (no requiere Pub/Sub ni `@google-cloud/pubsub`).

## 1. Configura el `.env`

```bash
EVENT_TRANSPORT=local
FIREBASE_PROJECT_ID=challenge-backend-demo
FIRESTORE_EMULATOR_HOST=localhost:8080
LISTENER_MAX_RETRIES=3
LISTENER_RETRY_BASE_MS=200
```

## 2. Levanta el emulador y la app

```bash
# Terminal 1 — emulador de Firestore
firebase emulators:start --only firestore

# Terminal 2 — aplicación
pnpm start:dev
```

| Servicio | URL |
|---|---|
| API | http://localhost:3000 |
| UI del emulador | http://localhost:4000 |

## 3. Camino feliz: generación automática de password

Crea un usuario **sin** password (PowerShell):

```powershell
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/users" `
  -ContentType "application/json" `
  -Body '{"username":"ana","email":"ana@example.com"}'
```

**Qué observar:**

1. La respuesta es `201` y **no** incluye `password`.
2. En los logs de la app verás al listener asignando el password.
3. En la UI del emulador (http://localhost:4000), el documento de `ana` en la colección `users` gana un campo `password` con un hash bcrypt (empieza por `$2b$`).

Con password explícito (se hashea desde la creación, el listener no hace nada):

```powershell
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/users" `
  -ContentType "application/json" `
  -Body '{"username":"luis","email":"luis@example.com","password":"MiPassword123!"}'
```

## 4. Casos de error de la API

```powershell
# Email duplicado -> 409
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/users" `
  -ContentType "application/json" `
  -Body '{"username":"ana","email":"ana@example.com"}'

# Email inválido -> 400
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/users" `
  -ContentType "application/json" `
  -Body '{"username":"x","email":"not-an-email"}'
```

> `Invoke-RestMethod` lanza excepción ante 4xx/5xx. Para ver el código de estado, envuelve en `try/catch` y lee `$_.Exception.Response.StatusCode`, o usa `curl.exe -i`.

## 5. Reintentos y dead-letter

El listener reintenta ante fallos transitorios y, agotados los intentos, escribe en la colección `dead_letter_events`. Este camino está cubierto de forma **automatizada** por las pruebas unitarias del listener (reintento → éxito, y agotamiento → dead-letter):

```bash
pnpm test
```

**Comprobación manual "en vivo"** (opcional): con la app corriendo, detén el emulador de Firestore justo después de un `POST /users` sin password. El listener no podrá hacer `updatePassword`, agotará los reintentos y —al volver el emulador— habrá un documento en `dead_letter_events`.

**Qué observar en el dead-letter:**

- Colección `dead_letter_events` en la UI del emulador.
- Cada documento: `{ eventName: "user.created", payload: { userId, hadPassword }, error, attempts, failedAt }`.

## 6. Idempotencia

Reprocesar el mismo evento no reasigna el password. Está cubierto por unitarias (`AssignPasswordUseCase` no sobrescribe un password existente) y es la misma garantía que hace seguro el modo `pubsub`.

## Pruebas automatizadas del modo local

```bash
pnpm test        # unitarias (mocks, sin emulador)
pnpm test:cov    # unitarias con cobertura
pnpm test:e2e    # e2e (REQUIERE el emulador de Firestore)
```

Las unitarias cubren, entre otros, la utilidad de reintentos (`retry.spec.ts`) y el listener (reintento → éxito, y agotamiento → dead-letter). Las e2e validan el flujo completo contra el emulador.

---

Para el modo Pub/Sub contra su emulador, ver [pubsub-local.md](pubsub-local.md).
