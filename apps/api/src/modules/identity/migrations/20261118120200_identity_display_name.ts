import type { MigrationBuilder } from 'node-pg-migrate';

// Expand step: nullable column, compatible with the previous application version.
export function up(pgm: MigrationBuilder): void {
  pgm.addColumn({ schema: 'identity', name: 'accounts' }, { display_name_enc: { type: 'text' } });
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropColumn({ schema: 'identity', name: 'accounts' }, 'display_name_enc');
}
