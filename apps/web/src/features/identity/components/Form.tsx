'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { firstInvalidField } from '../lib/http';

export interface FieldSpec {
  readonly name: string;
  readonly label: string;
  readonly type?: 'text' | 'email' | 'password' | 'tel' | 'checkbox';
  readonly autoComplete?: string;
  readonly hint?: string;
  readonly required?: boolean;
  readonly inputMode?: 'numeric' | 'text';
}

export type SubmitResult =
  | { readonly ok: true; readonly message?: string }
  | { readonly ok: false; readonly message: string; readonly fieldErrors?: Record<string, string> };

interface FormProps {
  readonly title: string;
  readonly intro?: string;
  readonly fields: readonly FieldSpec[];
  readonly submitLabel: string;
  readonly initialValues?: Record<string, string | boolean>;
  readonly onSubmit: (values: Record<string, string | boolean>) => Promise<SubmitResult>;
  readonly resetOnSuccess?: boolean;
  readonly headingLevel?: 1 | 2;
}

/** Accessible form: labelled fields, linked errors, error summary and focus on the first error. */
export function Form({
  title,
  intro,
  fields,
  submitLabel,
  initialValues = {},
  onSubmit,
  resetOnSuccess = false,
  headingLevel = 1,
}: FormProps) {
  const baseId = useId();
  const [values, setValues] = useState<Record<string, string | boolean>>(() =>
    Object.fromEntries(
      fields.map((f) => [f.name, initialValues[f.name] ?? (f.type === 'checkbox' ? false : '')]),
    ),
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);
  const successRef = useRef<HTMLParagraphElement>(null);
  const pendingFocus = useRef<string | null>(null);
  const fieldOrder = fields.map((f) => f.name);
  const Heading = headingLevel === 1 ? 'h1' : 'h2';

  useEffect(() => {
    const target = pendingFocus.current;
    if (target) {
      pendingFocus.current = null;
      document.getElementById(`${baseId}-${target}`)?.focus();
    } else if (formError) {
      summaryRef.current?.focus();
    }
  }, [fieldErrors, formError, baseId]);

  useEffect(() => {
    if (success) successRef.current?.focus();
  }, [success]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setSuccess(null);
    const clientErrors: Record<string, string> = {};
    for (const field of fields) {
      const value = values[field.name];
      if (field.required !== false && (value === '' || value === false)) {
        clientErrors[field.name] =
          field.type === 'checkbox'
            ? `Debes marcar: ${field.label}.`
            : `Completa este campo: ${field.label}.`;
      }
    }
    if (Object.keys(clientErrors).length > 0) {
      pendingFocus.current = firstInvalidField(fieldOrder, clientErrors);
      setFieldErrors(clientErrors);
      setFormError('Revisa los campos marcados y corrígelos.');
      setBusy(false);
      return;
    }
    const result = await onSubmit(values);
    setBusy(false);
    if (result.ok) {
      setFieldErrors({});
      setFormError(null);
      setSuccess(result.message ?? 'Listo.');
      if (resetOnSuccess)
        setValues(
          Object.fromEntries(fields.map((f) => [f.name, f.type === 'checkbox' ? false : ''])),
        );
      return;
    }
    const errors = result.fieldErrors ?? {};
    pendingFocus.current = firstInvalidField(fieldOrder, errors);
    setFieldErrors(errors);
    setFormError(result.message);
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-labelledby={`${baseId}-title`}
      className="id-form"
    >
      <Heading id={`${baseId}-title`}>{title}</Heading>
      {intro ? <p>{intro}</p> : null}
      {formError ? (
        <div ref={summaryRef} role="alert" tabIndex={-1} className="id-alert">
          <p>{formError}</p>
          {Object.keys(fieldErrors).length > 0 ? (
            <ul>
              {fieldOrder
                .filter((name) => fieldErrors[name])
                .map((name) => (
                  <li key={name}>
                    <a href={`#${baseId}-${name}`}>{fieldErrors[name]}</a>
                  </li>
                ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {success ? (
        <p ref={successRef} role="status" tabIndex={-1} className="id-success">
          {success}
        </p>
      ) : null}
      {fields.map((field) => {
        const id = `${baseId}-${field.name}`;
        const error = fieldErrors[field.name];
        const describedBy = [field.hint ? `${id}-hint` : null, error ? `${id}-error` : null]
          .filter(Boolean)
          .join(' ');
        const isCheckbox = field.type === 'checkbox';
        return (
          <div key={field.name} className={isCheckbox ? 'id-field id-field-check' : 'id-field'}>
            {isCheckbox ? null : <label htmlFor={id}>{field.label}</label>}
            <input
              id={id}
              name={field.name}
              type={field.type ?? 'text'}
              autoComplete={field.autoComplete}
              inputMode={field.inputMode}
              aria-invalid={error ? true : undefined}
              aria-describedby={describedBy || undefined}
              aria-required={field.required === false ? undefined : true}
              {...(isCheckbox
                ? {
                    checked: values[field.name] === true,
                    onChange: (e) => setValues({ ...values, [field.name]: e.target.checked }),
                  }
                : {
                    value: String(values[field.name] ?? ''),
                    onChange: (e) => setValues({ ...values, [field.name]: e.target.value }),
                  })}
            />
            {isCheckbox ? <label htmlFor={id}>{field.label}</label> : null}
            {field.hint ? (
              <p id={`${id}-hint`} className="id-hint">
                {field.hint}
              </p>
            ) : null}
            {error ? (
              <p id={`${id}-error`} className="id-error">
                {error}
              </p>
            ) : null}
          </div>
        );
      })}
      <button type="submit" disabled={busy} aria-disabled={busy}>
        {busy ? 'Enviando…' : submitLabel}
      </button>
    </form>
  );
}
