'use client';

import { useActionState } from 'react';
import { IDLE, type ActionState } from '../outcome';
import { StateNotice } from './feedback';

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * Formulario HTML nativo con acción de servidor: funciona sin JavaScript y, con él, muestra el
 * resultado (éxito, 409, 403, 422...) en una región anunciada a lectores de pantalla.
 */
export function ActionForm({
  action,
  submitLabel,
  secondary = false,
  confirmText,
  children,
}: Readonly<{
  action: Action;
  submitLabel: string;
  secondary?: boolean;
  confirmText?: string;
  children?: React.ReactNode;
}>) {
  const [state, formAction, pending] = useActionState(action, IDLE);
  return (
    <form
      action={formAction}
      className="cat-form"
      onSubmit={(event) => {
        if (confirmText && !window.confirm(confirmText)) event.preventDefault();
      }}
    >
      {children}
      <button
        type="submit"
        className={secondary ? 'cat-button cat-button--secondary' : 'cat-button'}
        aria-disabled={pending}
      >
        {pending ? 'Guardando…' : submitLabel}
      </button>
      <StateNotice state={state} />
    </form>
  );
}
