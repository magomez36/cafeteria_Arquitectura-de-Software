import type { MigrationBuilder } from 'node-pg-migrate';

export function up(pgm: MigrationBuilder): void {
  pgm.createSchema('identity', { ifNotExists: true });

  pgm.createTable(
    { schema: 'identity', name: 'accounts' },
    {
      id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
      email_blind: { type: 'text', notNull: true, unique: true },
      email_enc: { type: 'text', notNull: true },
      password_hash: { type: 'text', notNull: true },
      role: { type: 'text', notNull: true, default: 'customer' },
      status: { type: 'text', notNull: true, default: 'pending' },
      mfa_secret_enc: { type: 'text' },
      mfa_enabled: { type: 'boolean', notNull: true, default: false },
      policy_accepted_at: { type: 'timestamptz' },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
      updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    },
  );
  pgm.addConstraint(
    { schema: 'identity', name: 'accounts' },
    'accounts_role_check',
    "CHECK (role IN ('customer', 'staff', 'admin'))",
  );
  pgm.addConstraint(
    { schema: 'identity', name: 'accounts' },
    'accounts_status_check',
    "CHECK (status IN ('pending', 'active', 'disabled'))",
  );

  pgm.createTable(
    { schema: 'identity', name: 'one_time_tokens' },
    {
      token_hash: { type: 'text', primaryKey: true },
      account_id: {
        type: 'uuid',
        notNull: true,
        references: { schema: 'identity', name: 'accounts' },
        onDelete: 'CASCADE',
      },
      purpose: { type: 'text', notNull: true },
      expires_at: { type: 'timestamptz', notNull: true },
      used_at: { type: 'timestamptz' },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    },
  );
  pgm.addConstraint(
    { schema: 'identity', name: 'one_time_tokens' },
    'one_time_tokens_purpose_check',
    "CHECK (purpose IN ('verify_email', 'reset_password', 'invite'))",
  );
  pgm.createIndex({ schema: 'identity', name: 'one_time_tokens' }, 'account_id');

  // No FK on account_id: security events must outlive account deletion (anonymised on erasure).
  pgm.createTable(
    { schema: 'identity', name: 'security_events' },
    {
      id: { type: 'bigserial', primaryKey: true },
      type: { type: 'text', notNull: true },
      account_id: { type: 'uuid' },
      ip_hash: { type: 'text' },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    },
  );
  pgm.createIndex({ schema: 'identity', name: 'security_events' }, ['account_id', 'created_at']);
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropSchema('identity', { cascade: true, ifExists: true });
}
