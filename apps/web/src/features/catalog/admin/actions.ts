'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { parseAvailabilityForm, parseProductForm, parseScheduleForm } from './forms';
import { formError, toState, type ActionState } from './outcome';
import { adminClient } from './session';

const BASE = '/admin/catalogo';
const str = (fd: FormData, name: string): string => {
  const v = fd.get(name);
  return typeof v === 'string' ? v : '';
};

/** Tras cualquier intento (incluso un conflicto 409) se vuelve a leer el menú para ver lo vigente. */
function refresh(menuId?: string): void {
  revalidatePath(BASE);
  if (menuId) revalidatePath(`${BASE}/${menuId}`);
}

export async function createMenuAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const name = str(fd, 'nombre').trim();
  if (!name) return formError('Escriba el nombre del menú.');
  const result = await (await adminClient()).createMenu(name);
  if (!result.ok) return toState(result, '');
  redirect(`${BASE}/${result.data.id}`);
}

export async function saveMenuAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const menuId = str(fd, 'menu');
  const name = str(fd, 'nombre').trim();
  if (!name) return formError('El menú necesita un nombre.');
  const schedule = parseScheduleForm(fd);
  if (!schedule.ok) return formError(schedule.message);
  const result = await (
    await adminClient()
  ).updateMenu(menuId, str(fd, 'etag'), {
    name,
    schedule: schedule.value,
  });
  refresh(menuId);
  return toState(result, 'Borrador guardado. Todavía no es visible para los clientes.');
}

export async function addCategoryAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const menuId = str(fd, 'menu');
  const name = str(fd, 'nombre').trim();
  if (!name) return formError('Escriba el nombre de la categoría.');
  const result = await (await adminClient()).addCategory(menuId, str(fd, 'etag'), name);
  refresh(menuId);
  return toState(result, 'Categoría añadida al borrador.');
}

export async function removeCategoryAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const menuId = str(fd, 'menu');
  const result = await (
    await adminClient()
  ).removeCategory(menuId, str(fd, 'etag'), str(fd, 'categoria'));
  refresh(menuId);
  return toState(result, 'Categoría quitada del borrador.');
}

export async function saveItemsAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const menuId = str(fd, 'menu');
  const ids = fd.getAll('productos').filter((v): v is string => typeof v === 'string');
  const result = await (
    await adminClient()
  ).setItems(menuId, str(fd, 'etag'), str(fd, 'categoria'), ids);
  refresh(menuId);
  return toState(result, 'Productos de la categoría guardados en el borrador.');
}

export async function publishAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const menuId = str(fd, 'menu');
  const result = await (await adminClient()).publish(menuId, str(fd, 'etag'));
  refresh(menuId);
  return toState(
    result,
    result.ok
      ? `Versión ${result.data.versionNumber} publicada: los clientes la ven en pocos segundos.`
      : '',
  );
}

export async function retireAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const menuId = str(fd, 'menu');
  const result = await (await adminClient()).retire(menuId, str(fd, 'etag'));
  refresh(menuId);
  return toState(result, 'Menú retirado de la tienda. Sus versiones se conservan.');
}

export async function restoreAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const menuId = str(fd, 'menu');
  const version = Number(str(fd, 'version'));
  if (!Number.isInteger(version) || version < 1) return formError('Versión no válida.');
  const result = await (await adminClient()).restore(menuId, str(fd, 'etag'), version);
  refresh(menuId);
  return toState(
    result,
    result.ok
      ? `Versión ${version} restaurada como versión ${result.data.versionNumber}. ` +
          (result.data.warning ?? '')
      : '',
  );
}

export async function createProductAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseProductForm(fd);
  if (!parsed.ok) return formError(parsed.message);
  const result = await (await adminClient()).createProduct(parsed.value);
  revalidatePath(`${BASE}/productos`);
  return toState(result, 'Producto creado.');
}

export async function updateProductAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseProductForm(fd);
  if (!parsed.ok) return formError(parsed.message);
  const result = await (
    await adminClient()
  ).updateProduct(str(fd, 'producto'), str(fd, 'etag'), parsed.value);
  revalidatePath(`${BASE}/productos`);
  return toState(result, 'Producto actualizado en el borrador. Publique el menú para que se vea.');
}

export async function availabilityAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseAvailabilityForm(fd);
  if (!parsed.ok) return formError(parsed.message);
  const result = await (await adminClient()).setAvailability(str(fd, 'producto'), parsed.value);
  revalidatePath(`${BASE}/productos`);
  return toState(result, 'Disponibilidad actualizada; los clientes la ven de inmediato.');
}
