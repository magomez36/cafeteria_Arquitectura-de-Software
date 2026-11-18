import { existsSync } from 'node:fs';

/**
 * @param {NodeJS.Platform} platform
 * @param {(file: string) => boolean} isAvailable
 */
export function gitExecutable(platform = process.platform, isAvailable = existsSync) {
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
