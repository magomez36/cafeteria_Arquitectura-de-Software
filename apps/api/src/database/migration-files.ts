export interface MigrationFile {
  readonly name: string;
  readonly prefix: string;
}

export function validateMigrationOrder(
  names: readonly string[],
  extension: 'ts' | 'js' = 'ts',
): MigrationFile[] {
  const naming = new RegExp(`^(\\d{14})_[a-z0-9][a-z0-9_-]*\\.${extension}$`, 'i');
  const migrations = names
    .map((name) => {
      const match = naming.exec(name);
      if (!match)
        throw new Error(
          `Migration ${name} must use YYYYMMDDHHMMSS_description.${extension} naming.`,
        );
      const prefix = match[1];
      if (!prefix) throw new Error(`Migration ${name} has no timestamp prefix.`);
      return { name, prefix };
    })
    .sort((a, b) => a.prefix.localeCompare(b.prefix));
  const prefixes = new Set<string>();
  for (const migration of migrations) {
    if (prefixes.has(migration.prefix))
      throw new Error(`Duplicate migration prefix: ${migration.prefix}`);
    prefixes.add(migration.prefix);
  }
  return migrations;
}
