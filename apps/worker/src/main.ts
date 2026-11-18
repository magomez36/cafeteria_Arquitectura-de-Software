import dotenv from 'dotenv';
import amqp from 'amqplib';

dotenv.config({ path: '../../.env' });

interface WorkerConnection {
  close(): Promise<unknown>;
}

interface WorkerRuntime {
  amqpUrl?: string | undefined;
  connect(url: string): Promise<WorkerConnection>;
  log(message: string): void;
  reportStartupError(error: unknown): void;
  startHeartbeat(): NodeJS.Timeout;
  stopHeartbeat(heartbeat: NodeJS.Timeout): void;
  onShutdown(signal: NodeJS.Signals, handler: () => void): void;
  exit(code: number): void;
}

export function createWorkerRuntime(
  amqpUrl: string | undefined = process.env.AMQP_URL,
): WorkerRuntime {
  return {
    amqpUrl,
    connect: (url) => amqp.connect(url),
    log: (message) => console.info(message),
    reportStartupError: (error) => console.error('Worker startup failed', error),
    startHeartbeat: () => setInterval(() => undefined, 60_000),
    stopHeartbeat: (heartbeat) => clearInterval(heartbeat),
    onShutdown: (signal, handler) => process.once(signal, handler),
    exit: (code) => process.exit(code),
  };
}

const runtime = createWorkerRuntime();

export async function startWorker(dependencies: WorkerRuntime = runtime): Promise<void> {
  const connection = dependencies.amqpUrl
    ? await dependencies.connect(dependencies.amqpUrl)
    : undefined;
  dependencies.log(
    connection
      ? 'Worker connected to RabbitMQ; no domain consumers are registered yet.'
      : 'Worker idle: AMQP_URL is not configured.',
  );
  const heartbeat = dependencies.startHeartbeat();
  const shutdown = async (): Promise<void> => {
    dependencies.stopHeartbeat(heartbeat);
    if (connection) await connection.close();
    dependencies.exit(0);
  };
  dependencies.onShutdown('SIGINT', () => void shutdown());
  dependencies.onShutdown('SIGTERM', () => void shutdown());
}

export async function runWorker(dependencies: WorkerRuntime = runtime): Promise<void> {
  try {
    await startWorker(dependencies);
  } catch (error: unknown) {
    dependencies.reportStartupError(error);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void runWorker();
}
