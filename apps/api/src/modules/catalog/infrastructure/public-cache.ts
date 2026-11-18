import { createClient } from 'redis';

type RedisClient = ReturnType<typeof createClient>;

export const PUBLIC_CACHE_TTL_SECONDS = 5;
const EPOCH_KEY = 'catalog:epoch';

/**
 * Caché de lectura pública. Clave por «epoch»: publicar/restaurar/retirar o cambiar la
 * disponibilidad incrementa el epoch, así que los clientes ven el cambio de inmediato; el TTL de 5 s
 * es la red de seguridad si la invalidación falla. Si Redis no responde se lee de Postgres.
 */
export class PublicCache {
  private client: RedisClient | null = null;
  private connecting: Promise<RedisClient | null> | null = null;

  constructor(private readonly url: string | undefined = process.env.REDIS_URL) {}

  private connect(): Promise<RedisClient | null> {
    const url = this.url;
    if (!url) return Promise.resolve(null);
    this.connecting ??= (async () => {
      try {
        const client = createClient({
          url,
          socket: { reconnectStrategy: false, connectTimeout: 500 },
        });
        client.on('error', () => undefined);
        await client.connect();
        client.on('end', () => {
          this.client = null;
          this.connecting = null;
        });
        this.client = client;
        return client;
      } catch {
        this.connecting = null;
        return null;
      }
    })();
    return this.connecting;
  }

  async read<T>(loader: () => Promise<T>): Promise<T> {
    const redis = await this.connect();
    if (!redis) return loader();
    try {
      const epoch = (await redis.get(EPOCH_KEY)) ?? '0';
      const key = `catalog:public:${epoch}`;
      const hit = await redis.get(key);
      if (hit) return JSON.parse(hit) as T;
      const value = await loader();
      await redis.set(key, JSON.stringify(value), { EX: PUBLIC_CACHE_TTL_SECONDS });
      return value;
    } catch {
      return loader();
    }
  }

  /** Invalidación tras un cambio confirmado en Postgres. Nunca lanza. */
  async invalidate(): Promise<void> {
    try {
      const redis = await this.connect();
      await redis?.incr(EPOCH_KEY);
    } catch {
      // El TTL de 5 s acota la obsolescencia aunque falle.
    }
  }

  async close(): Promise<void> {
    try {
      if (this.client?.isOpen) await this.client.quit();
    } catch {
      // nada que limpiar
    }
  }
}
