import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { Client } from 'pg';
import { createClient } from 'redis';
import amqp from 'amqplib';

describe('local platform dependencies using real containers', () => {
  let postgres: StartedTestContainer;
  let redis: StartedTestContainer;
  let rabbit: StartedTestContainer;

  beforeAll(async () => {
    [postgres, redis, rabbit] = await Promise.all([
      new GenericContainer('postgres:17-alpine')
        .withEnvironment({
          POSTGRES_USER: 'cafeteria',
          POSTGRES_PASSWORD: 'test-only',
          POSTGRES_DB: 'cafeteria_test',
        })
        .withExposedPorts(5432)
        .start(),
      new GenericContainer('redis:7-alpine').withExposedPorts(6379).start(),
      new GenericContainer('rabbitmq:4-alpine')
        .withEnvironment({ RABBITMQ_DEFAULT_USER: 'cafeteria', RABBITMQ_DEFAULT_PASS: 'test-only' })
        .withExposedPorts(5672)
        .start(),
    ]);
  }, 120000);

  afterAll(async () => {
    await Promise.all([postgres?.stop(), redis?.stop(), rabbit?.stop()]);
  });

  it('connects to PostgreSQL, Redis and RabbitMQ', async () => {
    const pgClient = new Client({
      host: postgres.getHost(),
      port: postgres.getMappedPort(5432),
      user: 'cafeteria',
      password: 'test-only',
      database: 'cafeteria_test',
    });
    await pgClient.connect();
    expect((await pgClient.query('select 1 as connected')).rows[0].connected).toBe(1);
    await pgClient.end();

    const redisClient = createClient({
      url: `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`,
    });
    await redisClient.connect();
    expect(await redisClient.ping()).toBe('PONG');
    await redisClient.quit();

    const rabbitConnection = await amqp.connect(
      `amqp://cafeteria:test-only@${rabbit.getHost()}:${rabbit.getMappedPort(5672)}`,
    );
    const channel = await rabbitConnection.createChannel();
    expect((await channel.assertQueue('', { exclusive: true })).queue).toBeTruthy();
    await channel.close();
    await rabbitConnection.close();
  }, 60000);
});
