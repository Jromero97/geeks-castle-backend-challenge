// Crea (si no existen) el topic y una suscripción PULL contra el emulador.
// Re-ejecutable: no falla si ya existen.
//
// Uso (PowerShell):
//   $env:PUBSUB_EMULATOR_HOST = "localhost:8085"
//   node scripts/setup-pubsub.js
//
// Lee la configuración de las mismas env vars que la app (.env).
require('dotenv').config();

// Default del emulador para no depender de setear la env var a mano.
process.env.PUBSUB_EMULATOR_HOST ??= 'localhost:8085';

const { PubSub } = require('@google-cloud/pubsub');

const projectId = process.env.GOOGLE_CLOUD_PROJECT || 'challenge-backend-demo';
const topicName = process.env.PUBSUB_TOPIC_USER_CREATED || 'user-created';
const subName = process.env.PUBSUB_SUBSCRIPTION || 'user-created-pull';

async function ensureTopic(ps) {
  const topic = ps.topic(topicName);
  const [exists] = await topic.exists();
  if (!exists) {
    await topic.create();
    console.log(`topic creado: ${topicName}`);
  } else {
    console.log(`topic ya existe: ${topicName}`);
  }
  return topic;
}

async function ensureSubscription(topic) {
  const sub = topic.subscription(subName);
  const [exists] = await sub.exists();
  if (!exists) {
    await sub.create(); // PULL: sin pushConfig (el emulador rechaza push a localhost)
    console.log(`suscripción PULL creada: ${subName}`);
  } else {
    console.log(`suscripción ya existe: ${subName}`);
  }
}

(async () => {
  console.log(`emulador: ${process.env.PUBSUB_EMULATOR_HOST}`);

  const ps = new PubSub({ projectId });
  const topic = await ensureTopic(ps);
  await ensureSubscription(topic);

  console.log(
    `listo (project=${projectId}, topic=${topicName}, sub=${subName})`,
  );
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
