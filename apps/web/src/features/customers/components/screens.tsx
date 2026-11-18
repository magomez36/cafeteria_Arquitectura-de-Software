'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Form, type SubmitResult } from '../../identity/components/Form';
import { callApi, describeError, type ApiResult } from '../../identity/lib/http';

function fail(result: ApiResult): SubmitResult {
  const { fieldErrors, message } = describeError(result);
  return { ok: false, message, fieldErrors };
}

interface Profile {
  fullName: string;
  phone: string | null;
}
interface ConsentState {
  purpose: string;
  granted: boolean;
  changedAt: string | null;
}
interface OrdersView {
  available: boolean;
  orders: {
    orderId: string;
    placedAt: string;
    total: { amountMinor: number; currency: string };
    status: string;
  }[];
}
interface InventoryItem {
  dataItem: string;
  purpose: string;
  retention: string;
  optional: boolean;
}

const CONSENT_LABELS: Record<string, string> = {
  marketing_email: 'Recibir promociones por correo',
  analytics: 'Ayudarnos a mejorar con estadísticas de uso',
};

export function ProfileScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState('');
  const [consents, setConsents] = useState<ConsentState[] | null>(null);
  const [orders, setOrders] = useState<OrdersView | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [me, account, consent, ord] = await Promise.all([
        callApi<Profile>('GET', 'customers/me'),
        callApi<{ email: string }>('GET', 'identity/account'),
        callApi<ConsentState[]>('GET', 'customers/me/consents'),
        callApi<OrdersView>('GET', 'customers/me/orders'),
      ]);
      if (!me.ok) {
        setBlocked(
          me.status === 401 ? 'Inicia sesión para ver tu perfil.' : describeError(me).message,
        );
        return;
      }
      setProfile(me.data);
      if (account.ok) setEmail(account.data.email);
      if (consent.ok) setConsents(consent.data);
      if (ord.ok) setOrders(ord.data);
    })();
  }, []);

  if (blocked) {
    return (
      <>
        <h1>Mi perfil</h1>
        <p role="alert">{blocked}</p>
        <p className="id-links">
          <Link href="/ingresar">Iniciar sesión</Link>
        </p>
      </>
    );
  }
  if (!profile) return <p role="status">Cargando tu perfil…</p>;

  async function download(): Promise<SubmitResult> {
    const [mine, account] = await Promise.all([
      callApi<Record<string, unknown>>('POST', 'customers/me/export'),
      callApi<Record<string, unknown>>('GET', 'identity/account'),
    ]);
    if (!mine.ok) return fail(mine);
    const combined = {
      ...mine.data,
      account: account.ok
        ? { email: account.data.email, displayName: account.data.displayName }
        : null,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(combined, null, 2)], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'mis-datos-cafeteria.json';
    link.click();
    URL.revokeObjectURL(url);
    return { ok: true, message: 'Descargamos una copia de tus datos en formato JSON.' };
  }

  return (
    <>
      <h1>Mi perfil</h1>
      <p>
        Correo de la cuenta: <strong>{email}</strong>
      </p>

      <Form
        headingLevel={2}
        title="Mis datos"
        submitLabel="Guardar cambios"
        initialValues={{ fullName: profile.fullName, phone: profile.phone ?? '' }}
        fields={[
          { name: 'fullName', label: 'Nombre completo', autoComplete: 'name' },
          {
            name: 'phone',
            label: 'Teléfono (opcional)',
            type: 'tel',
            autoComplete: 'tel',
            required: false,
          },
        ]}
        onSubmit={async (v) => {
          const result = await callApi('PATCH', 'customers/me', {
            fullName: v.fullName,
            phone: v.phone,
          });
          return result.ok ? { ok: true, message: 'Tus datos se guardaron.' } : fail(result);
        }}
      />

      <Form
        headingLevel={2}
        title="Cambiar contraseña"
        submitLabel="Cambiar contraseña"
        resetOnSuccess
        fields={[
          {
            name: 'currentPassword',
            label: 'Contraseña actual',
            type: 'password',
            autoComplete: 'current-password',
          },
          {
            name: 'newPassword',
            label: 'Nueva contraseña',
            type: 'password',
            autoComplete: 'new-password',
            hint: 'Mínimo 12 caracteres.',
          },
        ]}
        onSubmit={async (v) => {
          const result = await callApi('POST', 'identity/account/password', v);
          if (result.ok) return { ok: true, message: 'Tu contraseña se cambió.' };
          return result.status === 401
            ? {
                ok: false,
                message: 'La contraseña actual no es correcta.',
                fieldErrors: { currentPassword: 'La contraseña actual no es correcta.' },
              }
            : fail(result);
        }}
      />

      <Form
        headingLevel={2}
        title="Cambiar correo"
        intro="Te enviaremos un enlace al nuevo correo y avisaremos al actual."
        submitLabel="Cambiar correo"
        resetOnSuccess
        fields={[
          { name: 'newEmail', label: 'Nuevo correo', type: 'email', autoComplete: 'email' },
          {
            name: 'password',
            label: 'Tu contraseña',
            type: 'password',
            autoComplete: 'current-password',
          },
        ]}
        onSubmit={async (v) => {
          const result = await callApi<{ message?: string }>(
            'POST',
            'identity/account/email-change',
            v,
          );
          if (result.ok)
            return { ok: true, message: result.data.message ?? 'Revisa tu nuevo correo.' };
          return result.status === 401
            ? {
                ok: false,
                message: 'La contraseña no es correcta.',
                fieldErrors: { password: 'La contraseña no es correcta.' },
              }
            : fail(result);
        }}
      />

      <section aria-labelledby="orders-title">
        <h2 id="orders-title">Mis pedidos</h2>
        {!orders?.available ? (
          <p>El historial de pedidos estará disponible cuando se active el módulo de pedidos.</p>
        ) : orders.orders.length === 0 ? (
          <p>Todavía no tienes pedidos.</p>
        ) : (
          <table className="id-table">
            <caption>Pedidos, del más reciente al más antiguo</caption>
            <thead>
              <tr>
                <th scope="col">Fecha</th>
                <th scope="col">Total</th>
                <th scope="col">Estado</th>
              </tr>
            </thead>
            <tbody>
              {orders.orders.map((o) => (
                <tr key={o.orderId}>
                  <td>{new Date(o.placedAt).toLocaleString('es-EC')}</td>
                  <td>
                    {(o.total.amountMinor / 100).toFixed(2)} {o.total.currency}
                  </td>
                  <td>{o.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {consents ? (
        <Form
          headingLevel={2}
          title="Mis consentimientos"
          intro="Puedes darlos o retirarlos cuando quieras. Cada cambio queda registrado con su fecha."
          submitLabel="Guardar consentimientos"
          initialValues={Object.fromEntries(consents.map((c) => [c.purpose, c.granted]))}
          fields={consents.map((c) => ({
            name: c.purpose,
            label: CONSENT_LABELS[c.purpose] ?? c.purpose,
            type: 'checkbox' as const,
            required: false,
            hint: c.changedAt
              ? `Último cambio: ${new Date(c.changedAt).toLocaleString('es-EC')}`
              : 'Sin cambios todavía.',
          }))}
          onSubmit={async (v) => {
            const result = await callApi<ConsentState[]>(
              'PUT',
              'customers/me/consents',
              Object.fromEntries(consents.map((c) => [c.purpose, v[c.purpose] === true])),
            );
            return result.ok
              ? { ok: true, message: 'Tus consentimientos se guardaron.' }
              : fail(result);
          }}
        />
      ) : null}

      <section aria-labelledby="export-title">
        <Form
          headingLevel={2}
          title="Descargar mis datos"
          intro="Recibirás un archivo JSON con tus datos personales."
          submitLabel="Descargar mis datos"
          fields={[]}
          onSubmit={download}
        />
        <h2 id="export-title" className="sr-only">
          Descarga de datos
        </h2>
      </section>

      <Form
        headingLevel={2}
        title="Eliminar mi cuenta"
        intro="Eliminaremos tus datos personales y anonimizaremos tus pedidos. Esta acción no se puede deshacer. Si tienes un pedido en curso, la eliminación se completará cuando termine."
        submitLabel="Eliminar mi cuenta"
        fields={[
          {
            name: 'password',
            label: 'Confirma tu contraseña',
            type: 'password',
            autoComplete: 'current-password',
          },
        ]}
        onSubmit={async (v) => {
          const reauth = await callApi('POST', 'identity/account/reauth', { password: v.password });
          if (!reauth.ok) {
            return reauth.status === 401
              ? {
                  ok: false,
                  message: 'La contraseña no es correcta.',
                  fieldErrors: { password: 'La contraseña no es correcta.' },
                }
              : fail(reauth);
          }
          const result = await callApi<{ status: string; reason?: string }>(
            'POST',
            'customers/me/deletion',
          );
          if (!result.ok) return fail(result);
          if (result.data.status === 'deferred')
            return {
              ok: true,
              message: result.data.reason ?? 'La eliminación se completará al terminar tu pedido.',
            };
          router.push('/');
          return { ok: true, message: 'Tu cuenta fue eliminada.' };
        }}
      />

      <p className="id-links">
        <button
          type="button"
          className="id-button"
          onClick={async () => {
            await callApi('POST', 'identity/logout');
            router.push('/ingresar');
          }}
        >
          Cerrar sesión
        </button>
        <Link href="/privacidad">Política de privacidad</Link>
      </p>
    </>
  );
}

export function PrivacyScreen() {
  const [items, setItems] = useState<InventoryItem[] | null>(null);
  useEffect(() => {
    void (async () => {
      const result = await callApi<InventoryItem[]>('GET', 'customers/data-inventory');
      setItems(result.ok ? result.data : []);
    })();
  }, []);
  return (
    <>
      <h1>Política de privacidad</h1>
      <p>
        Guardamos solo los datos necesarios para atender tus pedidos. Puedes ver, corregir,
        descargar o eliminar tus datos desde <Link href="/perfil">tu perfil</Link>, y retirar los
        consentimientos opcionales cuando quieras.
      </p>
      <h2>Qué datos guardamos y para qué</h2>
      {items === null ? (
        <p role="status">Cargando…</p>
      ) : items.length === 0 ? (
        <p>Inicia sesión para ver el detalle de tus datos.</p>
      ) : (
        <table className="id-table">
          <caption>Datos personales, finalidad y plazo de conservación</caption>
          <thead>
            <tr>
              <th scope="col">Dato</th>
              <th scope="col">Finalidad</th>
              <th scope="col">Conservación</th>
              <th scope="col">Opcional</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.dataItem}>
                <th scope="row">{i.dataItem}</th>
                <td>{i.purpose}</td>
                <td>{i.retention}</td>
                <td>{i.optional ? 'Sí' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
