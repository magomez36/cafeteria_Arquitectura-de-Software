import amqp from 'amqplib';
import { createWorkerRuntime, runWorker, startWorker } from '../src/main';

jest.mock('amqplib', () => ({ __esModule: true, default: { connect: jest.fn() } }));

describe('worker foundation', () => {
  const heartbeat = setInterval(() => undefined, 60_000);
  const connection = { close: jest.fn(async () => undefined) };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => clearInterval(heartbeat));

  function createRuntime(amqpUrl?: string) {
    const handlers = new Map<NodeJS.Signals, () => void>();
    return {
      handlers,
      dependencies: {
        amqpUrl,
        connect: jest.fn(async () => connection),
        log: jest.fn(),
        reportStartupError: jest.fn(),
        startHeartbeat: jest.fn(() => heartbeat),
        stopHeartbeat: jest.fn(),
        onShutdown: jest.fn((signal: NodeJS.Signals, handler: () => void) => {
          handlers.set(signal, handler);
        }),
        exit: jest.fn(),
      },
    };
  }

  it('starts in idle mode and stops the heartbeat on shutdown', async () => {
    const { dependencies, handlers } = createRuntime();

    await startWorker(dependencies);

    expect(dependencies.connect).not.toHaveBeenCalled();
    expect(dependencies.log).toHaveBeenCalledWith('Worker idle: AMQP_URL is not configured.');
    expect(handlers.has('SIGINT')).toBe(true);
    expect(handlers.has('SIGTERM')).toBe(true);

    handlers.get('SIGTERM')?.();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(dependencies.stopHeartbeat).toHaveBeenCalledWith(heartbeat);
    expect(dependencies.exit).toHaveBeenCalledWith(0);
  });

  it('connects to RabbitMQ and closes the connection on shutdown', async () => {
    const { dependencies, handlers } = createRuntime('amqp://localhost');

    await startWorker(dependencies);

    expect(dependencies.connect).toHaveBeenCalledWith('amqp://localhost');
    expect(dependencies.log).toHaveBeenCalledWith(
      'Worker connected to RabbitMQ; no domain consumers are registered yet.',
    );

    handlers.get('SIGINT')?.();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(connection.close).toHaveBeenCalledTimes(1);
    expect(dependencies.exit).toHaveBeenCalledWith(0);
  });

  it('propagates startup connection failures and does not register shutdown hooks', async () => {
    const { dependencies, handlers } = createRuntime('amqp://localhost');
    dependencies.connect.mockRejectedValueOnce(new Error('broker unavailable'));

    await expect(startWorker(dependencies)).rejects.toThrow('broker unavailable');
    expect(dependencies.startHeartbeat).not.toHaveBeenCalled();
    expect(handlers.size).toBe(0);
  });

  it('exercises the Node and AMQP adapters in the default runtime', async () => {
    jest.mocked(amqp.connect).mockResolvedValue(connection as never);
    const info = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const once = jest
      .spyOn(process, 'once')
      .mockImplementation((() => process) as typeof process.once);
    const exit = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const dependencies = createWorkerRuntime('amqp://localhost');

    await expect(dependencies.connect('amqp://localhost')).resolves.toBe(connection);
    dependencies.log('worker message');
    dependencies.reportStartupError(new Error('startup error'));
    const timer = dependencies.startHeartbeat();
    dependencies.stopHeartbeat(timer);
    dependencies.onShutdown('SIGTERM', () => undefined);
    dependencies.exit(0);

    expect(amqp.connect).toHaveBeenCalledWith('amqp://localhost');
    expect(info).toHaveBeenCalledWith('worker message');
    expect(error).toHaveBeenCalledWith('Worker startup failed', expect.any(Error));
    expect(once).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
    expect(exit).toHaveBeenCalledWith(0);
    info.mockRestore();
    error.mockRestore();
    once.mockRestore();
    exit.mockRestore();
  });

  it('records startup failures through the entrypoint handler', async () => {
    const { dependencies } = createRuntime('amqp://localhost');
    const originalExitCode = process.exitCode;
    dependencies.connect.mockRejectedValueOnce(new Error('broker unavailable'));

    await runWorker(dependencies);

    expect(dependencies.reportStartupError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'broker unavailable' }),
    );
    expect(process.exitCode).toBe(1);
    process.exitCode = originalExitCode;
  });
});
