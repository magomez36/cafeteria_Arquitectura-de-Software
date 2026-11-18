import { createClient } from 'redis';
import { FeatureFlagsService } from './feature-flags.service';

jest.mock('redis', () => ({ createClient: jest.fn() }));

type MockRedisClient = ReturnType<typeof createClient> & {
  isOpen: boolean;
  isReady: boolean;
  connect: jest.Mock<Promise<void>>;
  get: jest.Mock<Promise<string | null>>;
  quit: jest.Mock<Promise<string>>;
  on: jest.Mock;
};

describe('FeatureFlagsService', () => {
  let client: MockRedisClient;

  beforeEach(() => {
    jest.clearAllMocks();
    client = {
      isOpen: false,
      isReady: false,
      connect: jest.fn(async () => {
        client.isOpen = true;
        client.isReady = true;
      }),
      get: jest.fn(async () => 'true'),
      quit: jest.fn(async () => 'OK'),
      on: jest.fn(),
    } as unknown as MockRedisClient;
    jest.mocked(createClient).mockReturnValue(client);
  });

  it('connects lazily, reads the flag and closes an open Redis connection', async () => {
    const service = new FeatureFlagsService();

    await expect(service.isEnabled('catalog.new-menu')).resolves.toBe(true);
    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(client.get).toHaveBeenCalledWith('feature-flag:catalog.new-menu');
    await service.onModuleDestroy();
    expect(client.quit).toHaveBeenCalledTimes(1);
  });

  it('uses an already-ready client without reconnecting', async () => {
    client.isOpen = true;
    client.isReady = true;
    client.get.mockResolvedValueOnce('false');

    await expect(new FeatureFlagsService().isEnabled('catalog.new-menu')).resolves.toBe(false);
    expect(client.connect).not.toHaveBeenCalled();
  });

  it('fails closed when Redis connect fails or remains unready', async () => {
    client.connect.mockRejectedValueOnce(new Error('Redis unavailable'));
    await expect(new FeatureFlagsService().isEnabled('catalog.new-menu')).resolves.toBe(false);

    client.isOpen = true;
    client.isReady = false;
    await expect(new FeatureFlagsService().isEnabled('catalog.new-menu')).resolves.toBe(false);
  });

  it('does not close a Redis client that is not open', async () => {
    await new FeatureFlagsService().onModuleDestroy();
    expect(client.quit).not.toHaveBeenCalled();
  });
});
