import { FAILURE_COPY, type Failure } from '../client';
import type { ActionState } from '../outcome';

/** Resultado de una acción: errores con role="alert", éxito con role="status". Nunca solo color. */
export function StateNotice({ state }: Readonly<{ state: ActionState }>) {
  if (state.status === 'idle') return null;
  if (state.status === 'success') {
    return (
      <p role="status" className="cat-notice cat-notice--ok">
        <strong>Hecho.</strong> {state.message}
      </p>
    );
  }
  return (
    <div role="alert" className="cat-notice cat-notice--error">
      <p>
        <strong>{state.title}.</strong> {state.message}
      </p>
      {state.details.length > 0 ? (
        <ul>
          {state.details.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Fallo al cargar una página completa (acceso denegado, sin sesión, servicio caído...). */
export function LoadFailure({ failure }: Readonly<{ failure: Failure }>) {
  const copy = FAILURE_COPY[failure.kind];
  return (
    <div role="alert" className="cat-notice cat-notice--error" data-kind={failure.kind}>
      <h2>{copy.title}</h2>
      <p>{copy.help}</p>
    </div>
  );
}

export function EmptyState({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <p role="status" className="cat-notice">
      {children}
    </p>
  );
}
