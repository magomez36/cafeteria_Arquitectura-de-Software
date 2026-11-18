import type { MigrationBuilder } from 'node-pg-migrate';

// Expand step: nullable payload column and a wider purpose list; the previous app version keeps working.
export function up(pgm: MigrationBuilder): void {
  const table = { schema: 'identity', name: 'one_time_tokens' };
  pgm.addColumn(table, { payload_enc: { type: 'text' } });
  pgm.dropConstraint(table, 'one_time_tokens_purpose_check');
  pgm.addConstraint(
    table,
    'one_time_tokens_purpose_check',
    "CHECK (purpose IN ('verify_email', 'reset_password', 'invite', 'change_email'))",
  );
}

export function down(pgm: MigrationBuilder): void {
  const table = { schema: 'identity', name: 'one_time_tokens' };
  pgm.sql("DELETE FROM identity.one_time_tokens WHERE purpose = 'change_email'");
  pgm.dropConstraint(table, 'one_time_tokens_purpose_check');
  pgm.addConstraint(
    table,
    'one_time_tokens_purpose_check',
    "CHECK (purpose IN ('verify_email', 'reset_password', 'invite'))",
  );
  pgm.dropColumn(table, 'payload_enc');
}
