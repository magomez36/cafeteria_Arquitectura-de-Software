import dotenv from 'dotenv';
import amqp from 'amqplib';
dotenv.config({ path: '../../.env' });

async function startWorker(): Promise<void> {
  const url = process.env.AMQP_URL;
  const connection = url ? await amqp.connect(url) : undefined;
  console.info(connection ? 'Worker connected to RabbitMQ; no domain consumers are registered yet.' : 'Worker idle: AMQP_URL is not configured.');
  const heartbeat = setInterval(() => undefined, 60_000);
  const shutdown = async (): Promise<void> => { clearInterval(heartbeat); if (connection) await connection.close(); process.exit(0); };
  process.once('SIGINT', () => { void shutdown(); });
  process.once('SIGTERM', () => { void shutdown(); });
}

void startWorker().catch((error: unknown) => { console.error('Worker startup failed', error); process.exitCode = 1; });
