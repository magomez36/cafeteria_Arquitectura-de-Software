export function isPostgresStartupTransientFailure(
  status: number | null,
  signal: NodeJS.Signals | null,
  output: string,
): boolean {
  return (
    status !== 0 && signal === null && /error:\s*the database system is starting up/i.test(output)
  );
}
