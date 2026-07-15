// Lee UN mensaje de la suscripción PULL, lo imprime y lo hace ack.
// Sirve para confirmar que PubsubEventPublisher publicó el evento.
//
// Uso (PowerShell):
//   node scripts/pull-once.js
require('dotenv').config();

process.env.PUBSUB_EMULATOR_HOST ??= 'localhost:8085';

const { PubSub } = require('@google-cloud/pubsub');

const projectId = process.env.GOOGLE_CLOUD_PROJECT || 'challenge-backend-demo';
const subName = process.env.PUBSUB_SUBSCRIPTION || 'user-created-pull';
const timeoutMs = Number(process.env.PULL_TIMEOUT_MS || 5000);

const ps = new PubSub({ projectId });
const sub = ps.subscription(subName);

const timer = setTimeout(() => {
  console.log(`sin mensajes en ${timeoutMs}ms (sub=${subName})`);
  sub.removeAllListeners();
  process.exit(0);
}, timeoutMs);

sub.on('message', (msg) => {
  clearTimeout(timer);
  console.log('--- mensaje recibido ---');
  console.log('data:', msg.data.toString('utf8'));
  console.log('attributes:', JSON.stringify(msg.attributes));
  msg.ack();
  // Pequeña espera para que el ack se envíe antes de salir.
  setTimeout(() => {
    sub.removeAllListeners();
    process.exit(0);
  }, 300);
});

sub.on('error', (err) => {
  clearTimeout(timer);
  console.error(err.message);
  process.exit(1);
});
