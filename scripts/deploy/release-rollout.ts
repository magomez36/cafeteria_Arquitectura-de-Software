const order = ['api', 'worker', 'web'] as const;
type Component = (typeof order)[number];

export interface ImmutableRelease {
  readonly sha: string;
  readonly api: string;
  readonly worker: string;
  readonly web: string;
}

export interface ReleaseDriver {
  readActive(): Promise<ImmutableRelease>;
  predeploy(apiImage: string): Promise<void>;
  activate(component: Component, artifact: string): Promise<void>;
  smoke(release: ImmutableRelease): Promise<void>;
}

function validateRelease(release: ImmutableRelease, repository: string): void {
  if (!/^[0-9a-f]{40}$/.test(release.sha)) throw new Error('Release SHA must be immutable.');
  if (!/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/.test(repository))
    throw new Error('Invalid GitHub repository.');
  for (const component of ['api', 'worker'] as const) {
    const prefix = `ghcr.io/${repository}/${component}@sha256:`;
    const image = release[component];
    if (!image.startsWith(prefix) || !/^[0-9a-f]{64}$/.test(image.slice(prefix.length))) {
      throw new Error(`Release ${component} must reference a digest in the repository registry.`);
    }
  }
  if (!/^dpl_[a-zA-Z0-9]+$/.test(release.web)) {
    throw new Error('Release web must reference an immutable Vercel deployment ID.');
  }
}

export async function rollOutRelease(
  next: ImmutableRelease,
  repository: string,
  driver: ReleaseDriver,
): Promise<void> {
  validateRelease(next, repository);
  const previous = await driver.readActive();
  validateRelease(previous, repository);
  await driver.smoke(previous);
  if (next.api !== previous.api) await driver.predeploy(next.api);

  const attempted: Component[] = [];
  try {
    for (const component of order) {
      if (next[component] === previous[component]) continue;
      attempted.push(component);
      await driver.activate(component, next[component]);
    }
    await driver.smoke(next);
  } catch (error) {
    const recoveryErrors: unknown[] = [];
    // A provider may switch traffic and lose the response. Restore attempted components too.
    for (const component of attempted.reverse()) {
      try {
        await driver.activate(component, previous[component]);
      } catch (recoveryError) {
        recoveryErrors.push(recoveryError);
      }
    }
    try {
      await driver.smoke(previous);
    } catch (recoveryError) {
      recoveryErrors.push(recoveryError);
    }
    if (recoveryErrors.length) {
      throw new AggregateError(
        [error, ...recoveryErrors],
        'Rollout failed and recovery could not be verified.',
      );
    }
    throw new Error('Rollout failed; the previous release passed smoke checks after recovery.', {
      cause: error,
    });
  }
}
