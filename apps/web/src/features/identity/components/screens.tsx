'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { callApi, describeError, type ApiResult } from '../lib/http';
import { Form, type SubmitResult } from './Form';

const PASSWORD_HINT = 'Mínimo 12 caracteres. Evita contraseñas comunes.';

function fail(result: ApiResult): SubmitResult {
  const { fieldErrors, message } = describeError(result);
  return { ok: false, message, fieldErrors };
}

export function RegisterScreen() {
  return (
    <>
      <Form
        title="Crear cuenta"
        intro="Regístrate para hacer tus pedidos. Te enviaremos un correo para confirmar tu cuenta."
        submitLabel="Crear cuenta"
        fields={[
          { name: 'fullName', label: 'Nombre completo', autoComplete: 'name' },
          { name: 'email', label: 'Correo electrónico', type: 'email', autoComplete: 'email' },
          {
            name: 'password',
            label: 'Contraseña',
            type: 'password',
            autoComplete: 'new-password',
            hint: PASSWORD_HINT,
          },
          { name: 'acceptedPolicy', label: 'Acepto la política de privacidad', type: 'checkbox' },
        ]}
        resetOnSuccess
        onSubmit={async (v) => {
          const result = await callApi<{ message?: string }>('POST', 'identity/register', v);
          return result.ok
            ? { ok: true, message: result.data.message ?? 'Revisa tu correo para continuar.' }
            : fail(result);
        }}
      />
      <p className="id-links">
        <Link href="/privacidad">Política de privacidad</Link>
        <Link href="/ingresar">Ya tengo cuenta</Link>
      </p>
    </>
  );
}

export function LoginScreen() {
  const router = useRouter();
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(null);

  const finish = (role: string) => router.push(role === 'admin' ? '/admin/personal' : '/perfil');

  if (challengeId) {
    return (
      <Form
        title="Verificación en dos pasos"
        intro="Escribe el código de 6 dígitos de tu aplicación de autenticación."
        submitLabel="Verificar"
        fields={[
          {
            name: 'code',
            label: 'Código de 6 dígitos',
            autoComplete: 'one-time-code',
            inputMode: 'numeric',
          },
        ]}
        onSubmit={async (v) => {
          const result = await callApi<{ user?: { role: string } }>('POST', 'identity/login/mfa', {
            challengeId,
            code: v.code,
          });
          if (!result.ok) {
            return result.status === 401
              ? {
                  ok: false,
                  message: 'El código no es correcto. Inténtalo de nuevo.',
                  fieldErrors: { code: 'El código no es correcto.' },
                }
              : fail(result);
          }
          finish(result.data.user?.role ?? 'customer');
          return { ok: true, message: 'Verificado. Redirigiendo…' };
        }}
      />
    );
  }

  return (
    <>
      <Form
        title="Iniciar sesión"
        submitLabel="Iniciar sesión"
        fields={[
          { name: 'email', label: 'Correo electrónico', type: 'email', autoComplete: 'email' },
          {
            name: 'password',
            label: 'Contraseña',
            type: 'password',
            autoComplete: 'current-password',
          },
        ]}
        onSubmit={async (v) => {
          const result = await callApi<{
            status?: string;
            challengeId?: string;
            user?: { role: string };
          }>('POST', 'identity/login', v);
          if (result.ok) {
            if (result.data.status === 'mfa_required' && result.data.challengeId) {
              setChallengeId(result.data.challengeId);
              return { ok: true };
            }
            if (result.data.status === 'mfa_enrollment_required') {
              router.push('/personal/mfa');
              return { ok: true, message: 'Debes configurar tu segundo factor. Redirigiendo…' };
            }
            finish(result.data.user?.role ?? 'customer');
            return { ok: true, message: 'Sesión iniciada. Redirigiendo…' };
          }
          if ((result.data as { code?: string }).code === 'email_not_confirmed') {
            setUnconfirmedEmail(String(v.email));
          }
          return fail(result);
        }}
      />
      {unconfirmedEmail ? (
        <Form
          headingLevel={2}
          title="¿No recibiste el correo de confirmación?"
          submitLabel="Reenviar confirmación"
          initialValues={{ email: unconfirmedEmail }}
          fields={[
            { name: 'email', label: 'Correo electrónico', type: 'email', autoComplete: 'email' },
          ]}
          onSubmit={async (v) => {
            const result = await callApi<{ message?: string }>(
              'POST',
              'identity/resend-verification',
              v,
            );
            return result.ok
              ? { ok: true, message: result.data.message ?? 'Listo.' }
              : fail(result);
          }}
        />
      ) : null}
      <p className="id-links">
        <Link href="/recuperar">Olvidé mi contraseña</Link>
        <Link href="/registro">Crear cuenta</Link>
      </p>
    </>
  );
}

export function VerifyEmailScreen({ token }: { token: string }) {
  const [state, setState] = useState<'working' | 'ok' | 'error'>('working');
  const [message, setMessage] = useState('Confirmando tu correo…');
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = token ? await callApi('POST', 'identity/verify-email', { token }) : null;
      if (cancelled) return;
      if (result?.ok) {
        setState('ok');
        setMessage('Tu correo quedó confirmado. Ya puedes iniciar sesión.');
      } else {
        setState('error');
        setMessage(result ? describeError(result).message : 'Falta el enlace de confirmación.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);
  return (
    <>
      <h1>Confirmar correo</h1>
      <p role={state === 'error' ? 'alert' : 'status'}>{message}</p>
      <p className="id-links">
        {state === 'ok' ? <Link href="/ingresar">Iniciar sesión</Link> : null}
        {state === 'error' ? (
          <Link href="/ingresar">Pedir un nuevo enlace desde el inicio de sesión</Link>
        ) : null}
      </p>
    </>
  );
}

export function ForgotScreen() {
  return (
    <>
      <Form
        title="Recuperar contraseña"
        intro="Escribe tu correo. Si está registrado, te enviaremos un enlace que caduca en 30 minutos."
        submitLabel="Enviar enlace"
        fields={[
          { name: 'email', label: 'Correo electrónico', type: 'email', autoComplete: 'email' },
        ]}
        resetOnSuccess
        onSubmit={async (v) => {
          const result = await callApi<{ message?: string }>('POST', 'identity/password/forgot', v);
          return result.ok
            ? { ok: true, message: result.data.message ?? 'Revisa tu correo.' }
            : fail(result);
        }}
      />
      <p className="id-links">
        <Link href="/ingresar">Volver a iniciar sesión</Link>
      </p>
    </>
  );
}

export function ResetScreen({ token }: { token: string }) {
  const [done, setDone] = useState(false);
  return (
    <>
      <Form
        title="Elegir una nueva contraseña"
        submitLabel="Guardar contraseña"
        fields={[
          {
            name: 'newPassword',
            label: 'Nueva contraseña',
            type: 'password',
            autoComplete: 'new-password',
            hint: PASSWORD_HINT,
          },
        ]}
        onSubmit={async (v) => {
          const result = await callApi('POST', 'identity/password/reset', {
            token,
            newPassword: v.newPassword,
          });
          if (result.ok) {
            setDone(true);
            return { ok: true, message: 'Tu contraseña se cambió. Ya puedes iniciar sesión.' };
          }
          return fail(result);
        }}
      />
      <p className="id-links">
        {done ? (
          <Link href="/ingresar">Iniciar sesión</Link>
        ) : (
          <Link href="/recuperar">Pedir un nuevo enlace</Link>
        )}
      </p>
    </>
  );
}

export function InviteScreen({ token }: { token: string }) {
  return (
    <Form
      title="Bienvenido al equipo"
      intro="Elige tu contraseña. En tu primer acceso deberás configurar un segundo factor."
      submitLabel="Guardar contraseña"
      fields={[
        {
          name: 'newPassword',
          label: 'Contraseña',
          type: 'password',
          autoComplete: 'new-password',
          hint: PASSWORD_HINT,
        },
      ]}
      onSubmit={async (v) => {
        const result = await callApi('POST', 'identity/staff/invitation/accept', {
          token,
          newPassword: v.newPassword,
        });
        return result.ok
          ? {
              ok: true,
              message:
                'Contraseña guardada. Ahora puedes iniciar sesión en el acceso del personal.',
            }
          : fail(result);
      }}
    />
  );
}

export function MfaEnrollScreen() {
  const router = useRouter();
  const [setup, setSetup] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void (async () => {
      const result = await callApi<{ secret: string; otpauthUri: string }>(
        'POST',
        'identity/mfa/enroll',
      );
      if (result.ok) setSetup(result.data);
      else
        setError(
          result.status === 401
            ? 'Inicia sesión para configurar tu segundo factor.'
            : describeError(result).message,
        );
    })();
  }, []);
  if (error) {
    return (
      <>
        <h1>Segundo factor</h1>
        <p role="alert">{error}</p>
        <p className="id-links">
          <Link href="/ingresar">Iniciar sesión</Link>
        </p>
      </>
    );
  }
  if (!setup) return <p role="status">Preparando tu segundo factor…</p>;
  return (
    <>
      <h1>Configura tu segundo factor</h1>
      <ol>
        <li>
          Abre tu aplicación de autenticación (por ejemplo Google Authenticator, Authy o 1Password).
        </li>
        <li>
          Agrega una cuenta nueva con esta clave:{' '}
          <code aria-label="Clave secreta">{setup.secret}</code>
        </li>
        <li>Escribe aquí el código de 6 dígitos que aparece.</li>
      </ol>
      <p>
        Si tu aplicación acepta enlaces: <a href={setup.otpauthUri}>abrir en la aplicación</a>
      </p>
      <Form
        headingLevel={2}
        title="Confirmar código"
        submitLabel="Activar segundo factor"
        fields={[
          {
            name: 'code',
            label: 'Código de 6 dígitos',
            autoComplete: 'one-time-code',
            inputMode: 'numeric',
          },
        ]}
        onSubmit={async (v) => {
          const result = await callApi('POST', 'identity/mfa/confirm', { code: v.code });
          if (result.ok) {
            router.push('/admin/personal');
            return { ok: true, message: 'Segundo factor activado.' };
          }
          return result.status === 401
            ? {
                ok: false,
                message: 'El código no es correcto.',
                fieldErrors: { code: 'El código no es correcto.' },
              }
            : fail(result);
        }}
      />
    </>
  );
}

interface StaffRow {
  id: string;
  displayName: string;
  email: string;
  role: string;
  status: string;
  mfaEnabled: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendiente',
  active: 'Activa',
  disabled: 'Desactivada',
};

export function StaffAdminScreen() {
  const [rows, setRows] = useState<StaffRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const load = useCallback(async () => {
    const result = await callApi<StaffRow[]>('GET', 'identity/staff');
    if (result.ok) {
      setRows(result.data);
      setError(null);
    } else {
      setError(
        result.status === 401
          ? 'Inicia sesión como administrador para ver esta página.'
          : result.status === 403
            ? 'No tienes permiso para ver esta página.'
            : describeError(result).message,
      );
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function act(
    row: StaffRow,
    action: 'deactivate' | 'reactivate' | 'mfa-reset',
    done: string,
  ) {
    const result = await callApi('POST', `identity/staff/${row.id}/${action}`);
    setAnnouncement(result.ok ? `${done}: ${row.displayName}.` : describeError(result).message);
    if (result.ok) await load();
  }

  if (error) {
    return (
      <>
        <h1>Personal</h1>
        <p role="alert">{error}</p>
      </>
    );
  }
  return (
    <>
      <h1>Personal y administradores</h1>
      <p role="status" aria-live="polite">
        {announcement}
      </p>
      {rows === null ? (
        <p role="status">Cargando…</p>
      ) : (
        <table className="id-table">
          <caption>Cuentas del equipo</caption>
          <thead>
            <tr>
              <th scope="col">Nombre</th>
              <th scope="col">Correo</th>
              <th scope="col">Rol</th>
              <th scope="col">Estado</th>
              <th scope="col">Segundo factor</th>
              <th scope="col">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <th scope="row">{row.displayName}</th>
                <td>{row.email}</td>
                <td>{row.role === 'admin' ? 'Administrador' : 'Personal'}</td>
                <td>{STATUS_LABEL[row.status] ?? row.status}</td>
                <td>{row.mfaEnabled ? 'Activo' : 'Sin configurar'}</td>
                <td>
                  {row.role === 'staff' ? (
                    <>
                      {row.status === 'disabled' ? (
                        <button
                          className="id-button"
                          type="button"
                          onClick={() => void act(row, 'reactivate', 'Cuenta reactivada')}
                        >
                          Reactivar<span className="sr-only"> a {row.displayName}</span>
                        </button>
                      ) : (
                        <button
                          className="id-button"
                          type="button"
                          onClick={() => void act(row, 'deactivate', 'Cuenta desactivada')}
                        >
                          Desactivar<span className="sr-only"> a {row.displayName}</span>
                        </button>
                      )}{' '}
                      <button
                        className="id-button"
                        type="button"
                        onClick={() => void act(row, 'mfa-reset', 'Segundo factor restablecido')}
                      >
                        Restablecer segundo factor
                        <span className="sr-only"> de {row.displayName}</span>
                      </button>
                    </>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Form
        headingLevel={2}
        title="Invitar a una persona del personal"
        submitLabel="Enviar invitación"
        resetOnSuccess
        fields={[
          { name: 'fullName', label: 'Nombre completo', autoComplete: 'off' },
          { name: 'email', label: 'Correo electrónico', type: 'email', autoComplete: 'off' },
        ]}
        onSubmit={async (v) => {
          const result = await callApi('POST', 'identity/staff', v);
          if (result.ok) {
            await load();
            return { ok: true, message: 'Invitación enviada.' };
          }
          return fail(result);
        }}
      />
    </>
  );
}
