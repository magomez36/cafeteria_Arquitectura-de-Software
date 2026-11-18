import type { MigrationBuilder } from 'node-pg-migrate';

export function up(pgm: MigrationBuilder): void {
  pgm.createSchema('customers', { ifNotExists: true });

  // account_id references identity by value only: modules never share tables (Constitution V).
  pgm.createTable(
    { schema: 'customers', name: 'customers' },
    {
      account_id: { type: 'uuid', primaryKey: true },
      full_name_enc: { type: 'text', notNull: true },
      phone_enc: { type: 'text' },
      preferences: { type: 'jsonb', notNull: true, default: '{}' },
      anonymised_at: { type: 'timestamptz' },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
      updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    },
  );

  // Append-only history: the current state of a purpose is its latest row.
  pgm.createTable(
    { schema: 'customers', name: 'consents' },
    {
      id: { type: 'bigserial', primaryKey: true },
      account_id: { type: 'uuid', notNull: true },
      purpose: { type: 'text', notNull: true },
      granted: { type: 'boolean', notNull: true },
      changed_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    },
  );
  pgm.createIndex({ schema: 'customers', name: 'consents' }, [
    'account_id',
    'purpose',
    'changed_at',
  ]);

  pgm.createTable(
    { schema: 'customers', name: 'rights_requests' },
    {
      id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
      account_id: { type: 'uuid', notNull: true },
      type: { type: 'text', notNull: true },
      status: { type: 'text', notNull: true, default: 'pending' },
      due_at: { type: 'timestamptz', notNull: true },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
      completed_at: { type: 'timestamptz' },
    },
  );
  pgm.addConstraint(
    { schema: 'customers', name: 'rights_requests' },
    'rights_requests_type_check',
    "CHECK (type IN ('access', 'rectification', 'erasure', 'objection', 'portability'))",
  );
  pgm.addConstraint(
    { schema: 'customers', name: 'rights_requests' },
    'rights_requests_status_check',
    "CHECK (status IN ('pending', 'deferred', 'completed', 'rejected'))",
  );
  pgm.createIndex({ schema: 'customers', name: 'rights_requests' }, ['account_id', 'created_at']);

  pgm.createTable(
    { schema: 'customers', name: 'data_inventory' },
    {
      id: { type: 'serial', primaryKey: true },
      data_item: { type: 'text', notNull: true, unique: true },
      purpose: { type: 'text', notNull: true },
      retention: { type: 'text', notNull: true },
      optional: { type: 'boolean', notNull: true, default: false },
    },
  );
  pgm.sql(`INSERT INTO customers.data_inventory (data_item, purpose, retention, optional) VALUES
    ('Nombre', 'Identificar al cliente y gestionar pedidos', 'Mientras la cuenta esté activa', false),
    ('Correo electrónico', 'Acceso a la cuenta y avisos de seguridad', 'Mientras la cuenta esté activa', false),
    ('Teléfono', 'Contactar sobre un pedido', 'Mientras la cuenta esté activa', true),
    ('Preferencias', 'Personalizar la experiencia', 'Mientras la cuenta esté activa', true),
    ('Historial de pedidos', 'Contabilidad y atención al cliente', 'Anonimizado al eliminar la cuenta; conservado según la normativa tributaria', false)`);
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropSchema('customers', { cascade: true, ifExists: true });
}
