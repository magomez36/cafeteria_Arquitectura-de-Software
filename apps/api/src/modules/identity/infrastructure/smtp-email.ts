import net from 'node:net';
import type { EmailMessage, EmailPort } from '../domain/ports';

export interface SmtpConfig {
  readonly host: string;
  readonly port: number;
  readonly from: string;
}

/** Minimal SMTP client for local Mailpit (no TLS, no auth). Replace with nodemailer once approved. */
export class SmtpEmail implements EmailPort {
  constructor(private readonly config: SmtpConfig) {}

  async send(message: EmailMessage): Promise<void> {
    try {
      await this.sendOnce(message);
    } catch {
      await this.sendOnce(message);
    }
  }

  private sendOnce(message: EmailMessage): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: this.config.host, port: this.config.port });
      socket.setTimeout(8000, () => fail(new Error('SMTP timeout')));
      let buffer = '';
      let step = 0;
      let done = false;
      const body = [
        `From: ${this.config.from}`,
        `To: ${message.to}`,
        `Subject: =?UTF-8?B?${Buffer.from(message.subject).toString('base64')}?=`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=utf-8',
        'Content-Transfer-Encoding: base64',
        '',
        Buffer.from(message.text)
          .toString('base64')
          .replace(/(.{76})/g, '$1\r\n'),
      ].join('\r\n');
      const commands = [
        `EHLO cafeteria.local`,
        `MAIL FROM:<${this.config.from}>`,
        `RCPT TO:<${message.to}>`,
        'DATA',
        `${body}\r\n.`,
        'QUIT',
      ];
      const expected = [250, 250, 250, 354, 250, 221];

      const fail = (error: Error): void => {
        if (done) return;
        done = true;
        socket.destroy();
        reject(error);
      };
      socket.on('error', fail);
      socket.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf8');
        let index: number;
        while ((index = buffer.indexOf('\r\n')) >= 0) {
          const line = buffer.slice(0, index);
          buffer = buffer.slice(index + 2);
          if (/^\d{3}-/.test(line)) continue; // multi-line reply continues
          const code = Number(line.slice(0, 3));
          if (step === 0) {
            if (code !== 220) return fail(new Error(`SMTP greeting ${code}`));
          } else if (code !== expected[step - 1]) {
            return fail(new Error(`SMTP step ${step} replied ${code}`));
          }
          const next = commands[step];
          step += 1;
          if (next === undefined) continue;
          socket.write(`${next}\r\n`);
          if (step === commands.length) {
            socket.once('close', () => {
              if (!done) {
                done = true;
                resolve();
              }
            });
          }
        }
      });
    });
  }
}
