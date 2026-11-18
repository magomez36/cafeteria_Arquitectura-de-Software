import { FAILURE_COPY, type Failure, type Result } from './client';

/** Estado que devuelven las acciones de servidor y que pintan los formularios. */
export type ActionState =
  | { status: 'idle' }
  | { status: 'success'; message: string }
  | {
      status: 'error';
      kind: Failure['kind'] | 'form';
      title: string;
      message: string;
      details: string[];
    };

export const IDLE: ActionState = { status: 'idle' };

export function toState<T>(result: Result<T>, successMessage: string): ActionState {
  if (result.ok) return { status: 'success', message: successMessage };
  const copy = FAILURE_COPY[result.kind];
  return {
    status: 'error',
    kind: result.kind,
    title: copy.title,
    message: copy.help,
    details: result.details.map((d) => d.message ?? d.path ?? '').filter(Boolean),
  };
}

export function formError(message: string): ActionState {
  return { status: 'error', kind: 'form', title: 'Revise los datos', message, details: [] };
}
