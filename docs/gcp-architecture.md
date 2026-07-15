# Arquitectura en GCP (propuesta productiva)

Propuesta de despliegue del challenge en Google Cloud. El **transporte Pub/Sub del evento ya está implementado** en el código (seleccionable con `EVENT_TRANSPORT=pubsub`); lo no implementado es la **infraestructura de despliegue** (Cloud Run, IAM, Secret Manager, CI/CD).

> Los diagramas usan Mermaid; GitHub los renderiza de forma nativa.

## 1. Vista general

```mermaid
flowchart LR
  client([Cliente])

  subgraph gcp["Google Cloud"]
    subgraph run["Cloud Run"]
      api["API NestJS<br/>POST /users, GET /users/:id"]
      worker["Worker NestJS<br/>POST /pubsub/user-created"]
    end

    topic["Pub/Sub topic<br/>user-created"]
    dlq["Pub/Sub<br/>dead-letter topic"]
    fs[("Firestore<br/>users")]
    sm["Secret Manager"]
    obs["Cloud Logging /<br/>Monitoring + alertas"]
  end

  client -->|HTTPS| api
  api -->|"1 crea usuario"| fs
  api -->|"2 publica user.created"| topic
  topic -->|"push (at-least-once)"| worker
  worker -->|"3 relee + guard idempotencia"| fs
  worker -->|"4 updatePassword (hash bcrypt)"| fs
  topic -.->|"reintentos agotados"| dlq

  api -.->|secretos| sm
  worker -.->|secretos| sm
  api -.->|logs/metrics| obs
  worker -.->|logs/metrics| obs
  dlq -.->|alerta| obs
```

**Puntos clave**

- **Cloud Run (API)**: escala automático (incluso a cero), HTTPS gestionado, autenticación a Firestore vía service account (sin llaves en el código).
- **Pub/Sub**: entrega *at-least-once*, reintentos con backoff y *dead-letter topic* nativos. Sustituye al `EventEmitter2` del modo local.
- **Cloud Run (worker)**: recibe el push y ejecuta `AssignPasswordUseCase`, idempotente por diseño.
- **Secret Manager**: credenciales y secretos (p. ej. el token del push), nunca en el repo.
- **Observabilidad**: métricas/logs y **alerta sobre la dead-letter queue** para detectar eventos no procesados.

## 2. Secuencia del flujo `user.created`

```mermaid
sequenceDiagram
  autonumber
  actor C as Cliente
  participant A as API (Cloud Run)
  participant F as Firestore
  participant P as Pub/Sub (topic)
  participant W as Worker (Cloud Run)

  C->>A: POST /users (sin password)
  A->>F: findByEmail (verifica único)
  A->>F: create(user) sin password
  A->>P: publish user.created {userId, hadPassword:false}
  A-->>C: 201 Created (sin password)

  Note over P,W: Entrega push at-least-once
  P->>W: POST /pubsub/user-created (mensaje)
  W->>W: valida token del push
  W->>F: findById(userId)
  alt ya tiene password (idempotencia)
    W-->>P: 2xx ack (sin efectos)
  else no tiene password
    W->>W: genera password (CSPRNG) + hash bcrypt
    W->>F: updatePassword(userId, hash)
    W-->>P: 2xx ack
  end
```

El `201` se devuelve al cliente sin esperar al worker: la generación del password ocurre de forma asíncrona. El `password` **nunca** viaja en la respuesta.

## 3. Reintentos y dead-letter (Pub/Sub)

```mermaid
flowchart TD
  deliver["Pub/Sub entrega el mensaje al worker"] --> resp{"¿Worker responde 2xx?"}
  resp -->|"Sí (ack)"| done["Confirmado.<br/>Mensaje eliminado del topic"]
  resp -->|"No / timeout (nack)"| retry{"¿Quedan reintentos?<br/>(backoff exponencial)"}
  retry -->|Sí| deliver
  retry -->|"No (agotados)"| dlq["Enviado al dead-letter topic"]
  dlq --> alert["Alerta en Monitoring"]
  alert --> ops["Inspección / reproceso manual"]
```

El consumidor debe ser **idempotente** porque *at-least-once* implica posibles entregas duplicadas: reprocesar el mismo evento no debe reasignar el password. Ese guard ya existe (`AssignPasswordUseCase` no sobrescribe un password ya asignado), y es el mismo tanto en el modo local como en Pub/Sub.

## 4. Mapeo local ↔ GCP

```mermaid
flowchart LR
  subgraph local["EVENT_TRANSPORT=local"]
    lpub["LocalEventPublisher<br/>(EventEmitter2)"]
    llisten["UserCreatedListener<br/>retry + dead-letter"]
    lfs[("Firestore emulador")]
    ldlq[("dead_letter_events<br/>colección Firestore")]
  end

  subgraph prod["EVENT_TRANSPORT=pubsub"]
    ppub["PubSubEventPublisher"]
    pctrl["PubSubPushController"]
    ptopic["Pub/Sub topic"]
    pdlq["dead-letter topic"]
  end

  lpub -. mismo puerto EventPublisher .-> ppub
  llisten -. mismo AssignPasswordUseCase .-> pctrl
  ldlq -. mismo concepto DLQ .-> pdlq

  lpub --> llisten
  ppub --> ptopic --> pctrl
  llisten -.-> ldlq
  ptopic -.-> pdlq
```

Gracias a los puertos (`EventPublisher`, `DeadLetterStore`) y al guard de idempotencia compartido, cambiar de modo **no toca los casos de uso**: solo se intercambian adaptadores vía `EventsModule.forRoot()`.

## 5. CI/CD

```mermaid
flowchart LR
  dev([Push / PR]) --> ci["GitHub Actions"]
  ci --> lint["lint"]
  ci --> test["test (unit + e2e con emuladores)"]
  ci --> build["build imagen Docker"]
  build --> ar["Artifact Registry"]
  ar --> deploy["Deploy a Cloud Run<br/>(API + worker)"]
  deploy --> smoke["Smoke test / healthcheck"]
```

Pipeline con lint + pruebas + build de imagen → Artifact Registry → deploy a Cloud Run. Las pruebas e2e pueden correr en CI con `firebase emulators:exec`.

---

Para probar el transporte Pub/Sub en local (emulador), ver [pubsub-local.md](pubsub-local.md).
