import { existsSync } from 'node:fs';

export function gitExecutable(
  platform: NodeJS.Platform = process.platform,
  isAvailable: (file: string) => boolean = existsSync,
): string {
  const candidates =
    platform === 'win32'
      ? ['C:\\Program Files\\Git\\cmd\\git.exe', 'C:\\Program Files (x86)\\Git\\cmd\\git.exe']
      : ['/usr/bin/git'];
  const executable = candidates.find(isAvailable);
  if (!executable) {
    throw new Error(
      `Git executable was not found in a supported fixed location: ${candidates.join(', ')}`,
    );
  }
  return executable;
}
