# Probar el modo Pub/Sub en local

El transporte de eventos es conmutable con la variable `EVENT_TRANSPORT` (`local` | `pubsub`). El modo `local` es el probado por defecto (unitarias + e2e). Esta guía explica cómo ejercitar el modo **`pubsub`** contra el **emulador de Pub/Sub**, sin GCP real.

> **Por qué se simula el push:** el emulador de Pub/Sub valida el `pushEndpoint` de forma estricta y suele rechazar `localhost` y/o query strings, por lo que su soporte de suscripciones *push* es poco fiable. La estrategia aquí divide la verificación en dos mitades fiables: se confirma la **publicación** con una suscripción *pull* y se ejercita el **consumo** simulando el push directamente contra el controlador. En producción, el push real solo cambia *quién* llama al endpoint; la lógica del consumidor (`AssignPasswordUseCase`, idempotente) es la misma.

## Requisitos

- Todo lo de la guía principal (Node, pnpm, Firebase CLI, Java).
- `@google-cloud/pubsub` instalado (solo se usa en modo `pubsub`):
  ```bash
  pnpm add @google-cloud/pubsub
  ```

## 1. Configura el `.env`

```bash
EVENT_TRANSPORT=pubsub
GOOGLE_CLOUD_PROJECT=challenge-backend-demo   # el mismo en app, setup y pull
PUBSUB_TOPIC_USER_CREATED=user-created
PUBSUB_PUSH_TOKEN=local-secret
PUBSUB_EMULATOR_HOST=localhost:8085           # el SDK se conecta al emulador
```

> El `projectId` debe ser **el mismo** en la app, en `pnpm pubsub:setup` y en `pnpm pubsub:pull`. Si no coinciden, verás topics distintos y el pull dirá "sin mensajes" aunque todo funcione.

## 2. Añade el emulador de Pub/Sub a `firebase.json`

```json
{
  "emulators": {
    "firestore": { "port": 8080 },
    "pubsub": { "port": 8085 },
    "ui": { "enabled": true }
  }
}
```

## 3. Levanta los emuladores

```bash
firebase emulators:start --only firestore,pubsub
```

## 4. Crea el topic y la suscripción PULL

Script re-ejecutable (crea-si-no-existe). Lee la configuración del `.env`:

```bash
pnpm pubsub:setup
```

## 5. Arranca la app en modo pubsub

```bash
pnpm start:dev
```

## 6. Verifica cada mitad

### a) Publicación

Crea un usuario y confirma que el evento llegó al topic (PowerShell):

```powershell
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/users" `
  -ContentType "application/json" `
  -Body '{"username":"luis","email":"luis@example.com"}'

pnpm pubsub:pull
```

Salida esperada:

```
data: {"userId":"<uuid>","hadPassword":false}
attributes: {"name":"user.created"}
```

> `pnpm pubsub:pull` hace `ack` del mensaje (lo consume). Guarda el `userId` que imprime para el siguiente paso. Si quieres conservar el mensaje, comenta la línea `msg.ack()` en `scripts/pull-once.js`.

### b) Consumo (simular el push)

Con el `userId` del paso anterior (PowerShell):

```powershell
$id = "<uuid-del-usuario>"
$payload = "{`"userId`":`"$id`",`"hadPassword`":false}"
$data = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($payload))
$body = @{ message = @{ data = $data } } | ConvertTo-Json -Depth 5

Invoke-RestMethod -Method Post `
  -Uri "http://localhost:3000/pubsub/user-created?token=local-secret" `
  -ContentType "application/json" -Body $body
```

Resultado esperado: `204` y, en la UI del emulador de Firestore (http://localhost:4000), el documento de `luis` gana su campo `password` con un hash bcrypt (`$2b$...`).

## Comportamientos a comprobar

- **Idempotencia**: repetir el push del paso (b) con el mismo `userId` responde `204` sin cambiar nada (el guard detecta que ya hay password).
- **Token inválido**: cambiar el `?token=` a un valor incorrecto responde `403`.

## Scripts de apoyo

| Comando | Script | Qué hace |
|---|---|---|
| `pnpm pubsub:setup` | `scripts/setup-pubsub.js` | Crea (si no existen) el topic y una suscripción PULL. |
| `pnpm pubsub:pull` | `scripts/pull-once.js` | Lee un mensaje del topic, lo imprime y hace `ack`. |

Ambos cargan `.env` (vía `dotenv`) y usan `localhost:8085` como emulador por defecto. Son utilidades de desarrollo; la app no los importa.
