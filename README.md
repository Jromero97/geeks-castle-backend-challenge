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

Las pruebas unitarias cubren las funcionalidades principales: generación segura de contraseñas (longitud, diversidad de caracteres, unicidad, hash verificable), el caso de uso de creación (con y sin password, email duplicado), la asignación idempotente de contraseñas y la resiliencia del listener. Las pruebas e2e validan el flujo completo contra el emulador: creación → evento → hash bcrypt persistido, conflicto por email duplicado (409) y validación de entrada (400).

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
│   ├── events/             #   UserCreatedEvent
│   └── errors/             #   EmailAlreadyExistsError
├── application/            # Orquestación de casos de uso
│   ├── use-cases/          #   CreateUser, AssignPassword, GetUser
│   └── listeners/          #   UserCreatedListener
├── infraestructure/        # Adaptadores concretos
│   ├── firebase/           #   FirebaseModule + repositorio Firestore
│   └── security/           #   CryptoPasswordGenerator (crypto + bcrypt)
└── presentation/           # Capa HTTP
    ├── controllers/        #   UserController
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
- **Resiliencia**: el listener envuelve su ejecución en try/catch con logging. Una excepción en un listener asíncrono de `@nestjs/event-emitter` tumbaría el proceso si no se captura.

## Decisiones técnicas

- **Generación vs. hashing**: bcrypt no genera contraseñas, las hashea. La contraseña se genera con `crypto.randomInt` (CSPRNG de Node, a diferencia de `Math.random`), garantizando al menos una mayúscula, una minúscula, un dígito y un símbolo, y excluyendo caracteres ambiguos (`O/0`, `l/1`). Lo que se persiste es únicamente el hash bcrypt.
- **El password nunca sale de la API**: ni la respuesta del `POST` ni la del `GET` lo incluyen. En un sistema real, la contraseña generada se entregaría al usuario por un canal seguro (p. ej. flujo de restablecimiento por email).
- **Verificación de email duplicado**: se realiza con check-then-insert, suficiente para este alcance. Tiene una condición de carrera teórica ante dos requests simultáneos; la solución completa sería una transacción de Firestore o derivar la clave del documento a partir del email.
- **Emulador**: todo el desarrollo y las pruebas corren contra el emulador local de Firestore. No se requieren credenciales de Google Cloud ni proyecto real.

## Despliegue en GCP (propuesta productiva)

*No implementado; descripción solicitada por el challenge.*

### Arquitectura propuesta

```
Cliente → Cloud Run (API NestJS) → Firestore
               │
               └─ publica UserCreated → Pub/Sub → Cloud Run worker / Cloud Function
                                                      └─ genera password → actualiza Firestore
```

**Cloud Run — API principal.** La aplicación se containeriza (Dockerfile multi-stage) y se despliega en Cloud Run: escalado automático (incluso a cero), HTTPS gestionado y sin administración de servidores. La autenticación con Firestore es automática a través de la service account del servicio, sin llaves en el código; la configuración va en variables de entorno y los secretos en Secret Manager.

**Pub/Sub — el evento en producción.** El `EventEmitter` in-process de esta solución funciona en una sola instancia, pero en producción tiene dos limitaciones: si la instancia muere después del insert y antes de procesar el evento, este se pierde; y con escalado horizontal no hay garantías de entrega. En producción, `CreateUserUseCase` publicaría el evento en un topic de Pub/Sub, que ofrece entrega *at-least-once*, reintentos con backoff y *dead-letter queue* para eventos que agotan reintentos. Gracias a Clean Architecture el cambio es acotado: se define un puerto `EventPublisher` en el dominio y se implementa un adaptador Pub/Sub en infraestructura, sin modificar los casos de uso.

**Cloud Run worker (o Cloud Function) — el consumidor.** Una suscripción push de Pub/Sub entrega el evento a un endpoint del worker, que ejecuta `AssignPasswordUseCase`. Como Pub/Sub garantiza *at-least-once* (no *exactly-once*), el consumidor debe ser idempotente — exactamente el guard ya implementado en esta solución: si el usuario ya tiene password, el evento se confirma (ack) sin efectos secundarios.

**Alternativa considerada — trigger nativo de Firestore.** Una Cloud Function con `onDocumentCreated` también dispararía el flujo al insertar. Se descartó la variante `onWrite` porque el update del password re-dispararía el trigger (ciclo). Se prefirió emitir el evento desde la capa de aplicación para mantener la lógica de negocio fuera de la infraestructura y plenamente testeable.

**CI/CD y operación.** Pipeline (GitHub Actions o Cloud Build) con lint + pruebas + build de imagen → Artifact Registry → deploy a Cloud Run. Observabilidad con Cloud Logging/Monitoring (incluidos en Cloud Run) y alertas sobre la dead-letter queue de Pub/Sub.

## Mejoras futuras

- Transacción de Firestore para eliminar la condición de carrera del email único.
- Header `Idempotency-Key` en el `POST /users` para que reintentos del cliente no generen intentos duplicados.
- Reintentos con backoff / dead-letter para el listener local (resuelto de forma nativa por Pub/Sub en la propuesta de GCP).
- Ejecución de las pruebas e2e en CI usando `firebase emulators:exec`.