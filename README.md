# Challenge Backend — NestJS + Firebase + Clean Architecture

API de registro de usuarios que, mediante un evento disparado al insertar el registro, genera automáticamente una contraseña segura cuando el cliente no la proporciona, y actualiza el documento en Firestore con su hash.

## Funcionalidad

- `POST /users` crea un usuario con `username`, `email` y `password` opcional.
- Al insertarse el usuario se emite el evento `user.created`.
- Si el usuario no traía password, un listener genera uno criptográficamente seguro, lo hashea con bcrypt y actualiza el registro en Firestore.
- La contraseña nunca se almacena ni se expone en texto plano: solo se persiste su hash y ningún endpoint la incluye en sus respuestas.
- Emails duplicados responden `409 Conflict`; datos inválidos, `400 Bad Request`.

## Requisitos previos

- **Node.js 18+** y **pnpm**
- **Firebase CLI**: `npm install -g firebase-tools`
- **Java 11+** — el emulador de Firestore corre sobre la JVM. En macOS:

  ```bash
  brew install openjdk@21
  ```

  Tras instalar, sigue las instrucciones ("caveats") que imprime Homebrew para enlazar Java al PATH (puedes volver a verlas con `brew info openjdk@21`). Verifica con `java -version`.

## Instalación y configuración

```bash
pnpm install
cp .env.example .env
```

Variables de entorno (`.env`):

| Variable | Descripción | Valor para desarrollo |
|---|---|---|
| `FIREBASE_PROJECT_ID` | ID del proyecto Firebase. Con el emulador puede ser cualquier string. | `challenge-backend-demo` |
| `FIRESTORE_EMULATOR_HOST` | Host del emulador. Si está definida, el Admin SDK se conecta al emulador sin credenciales de Google Cloud. | `localhost:8080` |
| `EVENT_TRANSPORT` | Feature flag del transporte de eventos: `local` o `pubsub`. Ver [Transporte de eventos](#transporte-de-eventos-feature-flag). | `local` |
| `LISTENER_MAX_RETRIES` | (modo local) Reintentos del listener ante fallo transitorio antes de ir a dead-letter. | `3` |
| `LISTENER_RETRY_BASE_MS` | (modo local) Base del backoff exponencial entre reintentos, en ms. | `200` |
| `GOOGLE_CLOUD_PROJECT` | (modo pubsub) Proyecto de GCP / del emulador de Pub/Sub. | `challenge-backend-demo` |
| `PUBSUB_TOPIC_USER_CREATED` | (modo pubsub) Topic donde se publica `user.created`. | `user-created` |
| `PUBSUB_PUSH_TOKEN` | (modo pubsub) Secreto compartido que valida el push entrante al controlador. | `local-secret` |

## Ejecución

Se necesitan dos terminales:

```bash
# Terminal 1 — emulador de Firestore
firebase emulators:start --only firestore

# Terminal 2 — aplicación
pnpm start:dev
```

| Servicio | URL |
|---|---|
| API | http://localhost:3000 |
| Documentación Swagger | http://localhost:3000/api |
| UI del emulador de Firestore | http://localhost:4000 |

### Prueba rápida con curl

```bash
# Sin password → el evento genera uno automáticamente
curl -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{"username": "ana", "email": "ana@example.com"}'

# Con password → se persiste hasheado desde la creación
curl -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{"username": "luis", "email": "luis@example.com", "password": "MiPassword123!"}'

# Consultar un usuario (el password nunca se incluye)
curl http://localhost:3000/users/<id>
```

Para verificar la generación automática: abre la UI del emulador y comprueba que el documento del primer usuario tiene un campo `password` con un hash bcrypt (comienza con `$2b$`).

## Pruebas

```bash
pnpm test        # unitarias (con mocks, no requieren emulador)
pnpm test:cov    # unitarias con reporte de cobertura
pnpm test:e2e    # end-to-end (REQUIEREN el emulador corriendo)
```

Las pruebas unitarias cubren las funcionalidades principales: generación segura de contraseñas (longitud, diversidad de caracteres, unicidad, hash verificable), el caso de uso de creación (con y sin password, email duplicado, publicación del evento), la asignación idempotente de contraseñas, la utilidad de reintentos (backoff) y el listener (reintento → éxito, y agotamiento → dead-letter). Las pruebas e2e validan el flujo completo contra el emulador: creación → evento → hash bcrypt persistido, conflicto por email duplicado (409) y validación de entrada (400).

Guías paso a paso para ejercitar cada transporte manualmente: [docs/local-mode.md](docs/local-mode.md) (modo `local`, incluye reintentos y dead-letter) y [docs/pubsub-local.md](docs/pubsub-local.md) (modo `pubsub` contra el emulador de Pub/Sub).

## Arquitectura

El proyecto implementa **Clean Architecture** en cuatro capas. Las dependencias apuntan siempre hacia el dominio:

```
presentation ──► application ──► domain ◄── infraestructure
(HTTP, DTOs,     (casos de uso,  (entidades,  (Firestore,
 filters)         listeners)      puertos,     crypto/bcrypt)
                                  eventos)
```

```
src/
├── domain/                 # Reglas de negocio puras. Sin NestJS, sin Firebase.
│   ├── entities/           #   User
│   ├── repositories/       #   UserRepository (puerto)
│   ├── services/           #   PasswordGenerator (puerto)
│   ├── events/             #   UserCreatedEvent, EventPublisher, DeadLetterStore (puertos)
│   └── errors/             #   EmailAlreadyExistsError
├── application/            # Orquestación de casos de uso
│   ├── use-cases/          #   CreateUser, AssignPassword, GetUser
│   ├── listeners/          #   UserCreatedListener (retry + dead-letter)
│   └── common/             #   retry (backoff exponencial + jitter)
├── infraestructure/        # Adaptadores concretos
│   ├── firebase/           #   FirebaseModule + repositorio Firestore
│   ├── security/           #   CryptoPasswordGenerator (crypto + bcrypt)
│   ├── messaging/          #   EventsModule (flag) + publishers local/pubsub + dead-letter
│   └── shared.module.ts    #   Bindings globales (UserRepository, PasswordGenerator)
└── presentation/           # Capa HTTP
    ├── controllers/        #   UserController, PubSubPushController
    ├── dtos/               #   CreateUserDto (class-validator + Swagger)
    └── filters/            #   DomainExceptionFilter (dominio → HTTP)
```

- El **dominio** define interfaces (puertos) y no conoce frameworks ni librerías externas.
- La **infraestructura** implementa esos puertos (adaptadores). Cambiar Firestore por otra base de datos solo requiere un nuevo adaptador.
- La inyección de dependencias usa **tokens `Symbol`** porque las interfaces de TypeScript no existen en runtime y NestJS necesita un token concreto para resolver.
- Los errores de negocio se definen en el dominio (`EmailAlreadyExistsError`) y la capa de presentación los traduce a HTTP (`409`) mediante un exception filter registrado vía `APP_FILTER`, de modo que aplica igual en producción y en las pruebas e2e.

## Flujo del evento

```
POST /users (sin password)
  → CreateUserUseCase verifica email único e inserta en Firestore
  → emite user.created (EventEmitter2, listener asíncrono)
  → UserCreatedListener recibe el evento
  → AssignPasswordUseCase:
      1. Relee el usuario de Firestore
      2. Guard de idempotencia: si ya tiene password, termina sin efectos
      3. Genera password con crypto.randomInt (CSPRNG)
      4. Hashea con bcrypt
      5. Actualiza el documento
```

### Prevención de duplicados, re-ejecuciones y ciclos

- **Idempotencia**: el guard del paso 2 usa el estado persistido (no memoria del proceso) como fuente de verdad. Procesar el mismo evento N veces produce el mismo resultado que procesarlo una vez: un password ya asignado jamás se sobrescribe. Está cubierto por pruebas unitarias.
- **Sin ciclos**: el evento se emite una única vez, en la capa de aplicación y solo en la creación. La actualización del password (`updatePassword`) no emite ningún evento, por lo que no puede re-disparar el flujo. Si en su lugar se usara un trigger de infraestructura sobre escrituras (p. ej. `onWrite` de Firestore), el propio update re-dispararía el trigger; incluso en ese escenario, el guard de idempotencia rompería el ciclo. Emitir desde la capa de aplicación fue una decisión deliberada: mantiene la lógica en código testeable y evita el problema por diseño.
- **Resiliencia (modo local)**: el listener reintenta con backoff exponencial + jitter ante fallos transitorios; si los agota, persiste el evento fallido en la colección `dead_letter_events` de Firestore para inspección/reproceso. Todo dentro de un try/catch: una excepción sin capturar en un listener asíncrono de `@nestjs/event-emitter` tumbaría el proceso.

## Transporte de eventos (feature flag)

El transporte del evento `user.created` es conmutable mediante la variable `EVENT_TRANSPORT`, **sin tocar los casos de uso**. `CreateUserUseCase` depende de un puerto `EventPublisher` (dominio) y cada modo aporta su adaptador (infraestructura):

| Modo | Publicación | Consumo | Reintentos | Dead-letter |
|---|---|---|---|---|
| `local` (default) | `EventEmitter2` en proceso | `UserCreatedListener` (`@OnEvent`) | backoff exponencial + jitter en el listener | colección `dead_letter_events` (Firestore) |
| `pubsub` | topic de Pub/Sub (`@google-cloud/pubsub`) | suscripción push → `PubSubPushController` | nativos de Pub/Sub | dead-letter topic de Pub/Sub |

`EventsModule.forRoot()` (dynamic module) es la **única fuente de verdad** del flag: según `EVENT_TRANSPORT` registra el publisher, el consumidor y —en local— el almacén de dead-letter. `AssignPasswordUseCase` es el mismo caso de uso en ambos caminos; su guard de idempotencia hace seguro tanto el reintento local como la entrega *at-least-once* de Pub/Sub.

> **Nota (dual-write)**: el evento se publica después de escribir en Firestore. Si la escritura tiene éxito pero la publicación falla, el evento se pierde (problema clásico de *dual write*). La mitigación aquí es la idempotencia + *at-least-once*; la solución completa sería un *transactional outbox* (ver [Mejoras futuras](#mejoras-futuras)).

Para ejercitar el modo `pubsub` contra el emulador de Pub/Sub en local, ver [docs/pubsub-local.md](docs/pubsub-local.md).

## Decisiones técnicas

- **Generación vs. hashing**: bcrypt no genera contraseñas, las hashea. La contraseña se genera con `crypto.randomInt` (CSPRNG de Node, a diferencia de `Math.random`), garantizando al menos una mayúscula, una minúscula, un dígito y un símbolo, y excluyendo caracteres ambiguos (`O/0`, `l/1`). Lo que se persiste es únicamente el hash bcrypt.
- **El password nunca sale de la API**: ni la respuesta del `POST` ni la del `GET` lo incluyen. En un sistema real, la contraseña generada se entregaría al usuario por un canal seguro (p. ej. flujo de restablecimiento por email).
- **Verificación de email duplicado**: se realiza con check-then-insert, suficiente para este alcance. Tiene una condición de carrera teórica ante dos requests simultáneos; la solución completa sería una transacción de Firestore o derivar la clave del documento a partir del email.
- **Emulador**: todo el desarrollo y las pruebas corren contra el emulador local de Firestore. No se requieren credenciales de Google Cloud ni proyecto real.

## Despliegue en GCP (propuesta productiva)

*El despliegue (Cloud Run, service accounts, Secret Manager) no está implementado. El **transporte Pub/Sub del evento sí**: es seleccionable con `EVENT_TRANSPORT=pubsub` y se prueba en local contra el emulador (ver [Transporte de eventos](#transporte-de-eventos-feature-flag)).*

> Diagramas de la arquitectura, la secuencia del evento, el flujo de reintentos/dead-letter y el CI/CD en [docs/gcp-architecture.md](docs/gcp-architecture.md).

### Arquitectura recomendada

```
Cliente → Cloud Run (API NestJS) → Firestore
               │
               └─ publica UserCreated → Pub/Sub → Cloud Run worker
                                                      └─ genera password → actualiza Firestore
```

**Cloud Run — API principal.** La aplicación se containeriza y se despliega en Cloud Run: escalado automático (incluso a cero), HTTPS gestionado y sin administración de servidores. La autenticación con Firestore es automática a través de la service account del servicio, sin llaves en el código; los secretos se guardan en Secret Manager.

**Pub/Sub — el evento en producción.** `CreateUserUseCase` publica el evento `user.created` en un topic de Pub/Sub, que ofrece entrega *at-least-once*, reintentos con backoff y *dead-letter queue*. Gracias a Clean Architecture el cambio fue acotado y ya está implementado: el puerto `EventPublisher` vive en el dominio y el adaptador `PubSubEventPublisher` en infraestructura, sin tocar los casos de uso.

**Cloud Run worker — el consumidor.** Una suscripción push de Pub/Sub entrega el evento a un endpoint del worker, que ejecuta `AssignPasswordUseCase`. Como Pub/Sub garantiza *at-least-once*, el consumidor debe ser idempotente — exactamente el guard ya implementado: si el usuario ya tiene password, el evento se confirma (ack) sin efectos secundarios.

**CI/CD y operación.** Pipeline (GitHub Actions o Cloud Build) con lint + pruebas + build de imagen → Artifact Registry → deploy a Cloud Run. Observabilidad con Cloud Logging/Monitoring y alertas sobre la dead-letter queue de Pub/Sub.

## Mejoras futuras

- Transacción de Firestore para eliminar la condición de carrera del email único.
- Header `Idempotency-Key` en el `POST /users` para que reintentos del cliente no generen intentos duplicados.
- *Transactional outbox* para eliminar el problema de *dual write* al publicar el evento (hoy mitigado con idempotencia + at-least-once).
- Endpoint/worker de reproceso que relea la colección `dead_letter_events` y reemita los eventos fallidos.
- Ejecución de las pruebas e2e en CI usando `firebase emulators:exec`.