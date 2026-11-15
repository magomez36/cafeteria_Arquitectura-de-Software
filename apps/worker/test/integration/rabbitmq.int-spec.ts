import amqp from 'amqplib';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';

describe('worker broker dependency using a real RabbitMQ container', () => {
  let rabbit: StartedTestContainer;

  beforeAll(async () => {
    rabbit = await new GenericContainer('rabbitmq:4-alpine')
      .withEnvironment({ RABBITMQ_DEFAULT_USER: 'cafeteria', RABBITMQ_DEFAULT_PASS: 'test-only' })
      .withExposedPorts(5672)
      .start();
  }, 120000);

  afterAll(async () => {
    await rabbit?.stop();
  });

  it('opens a channel and declares a disposable queue', async () => {
    const connection = await amqp.connect(
      `amqp://cafeteria:test-only@${rabbit.getHost()}:${rabbit.getMappedPort(5672)}`,
    );
    const channel = await connection.createChannel();
    const result = await channel.assertQueue('', { exclusive: true, autoDelete: true });
    expect(result.queue).toBeTruthy();
    await channel.deleteQueue(result.queue);
    await channel.close();
    await connection.close();
  }, 60000);
});
