import type { Pool, PoolClient } from 'pg';
import { buildSnapshot } from '../domain/menu-snapshot';
import { CatalogError } from '../domain/errors';
import type { ProductInput, AvailabilityPatch } from '../domain/input';
import type { LiveAvailability, MenuSnapshot, PublishedMenu } from '../domain/public-view';
import { assertRevision } from '../domain/revision';
import type { ScheduleSlot } from '../domain/schedule';
import {
  validateForPublish,
  type DraftCategory,
  type DraftMenu,
  type DraftProduct,
} from '../domain/publish-validation';
import { diffSnapshots, type VersionChange } from '../domain/version-diff';

export interface DraftMenuView extends DraftMenu {
  id: string;
  status: 'draft' | 'published' | 'retired';
  revision: number;
  currentVersionNumber: number | null;
}

export interface ProductRow extends DraftProduct {
  availability: 'available' | 'sold_out';
  stockQuantity: number | null;
  revision: number;
}

export interface VersionSummary {
  versionNumber: number;
  publishedBy: string;
  publishedAt: string;
  restoredFromVersion: number | null;
  changes: VersionChange[];
}

export interface PublishResult {
  versionId: string;
  versionNumber: number;
  changes: VersionChange[];
}

const notFound = (what: string): CatalogError =>
  new CatalogError('not_found', `${what} no existe.`);

type Row = Record<string, unknown>;

export class CatalogRepository {
  constructor(private readonly pool: Pool) {}

  private async tx<T>(work: (c: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private audit(
    c: PoolClient,
    entity: string,
    entityId: string,
    action: string,
    actorId: string,
    changes: unknown,
  ): Promise<unknown> {
    return c.query(
      'INSERT INTO catalog.audit_log (entity, entity_id, action, actor_id, changes) VALUES ($1,$2,$3,$4,$5)',
      [entity, entityId, action, actorId, JSON.stringify(changes)],
    );
  }

  // ---------- Lectura pública (solo versiones publicadas) ----------

  async listPublished(): Promise<PublishedMenu[]> {
    const { rows } = await this.pool.query(
      `SELECT m.id AS menu_id, v.id AS version_id, v.version_number, v.snapshot
         FROM catalog.menus m JOIN catalog.menu_versions v ON v.id = m.current_version_id
        WHERE m.status = 'published'
        ORDER BY m.name`,
    );
    return rows.map((r: Row) => ({
      menuId: r.menu_id as string,
      versionId: r.version_id as string,
      versionNumber: r.version_number as number,
      snapshot: r.snapshot as MenuSnapshot,
    }));
  }

  async liveAvailability(): Promise<[string, LiveAvailability][]> {
    const { rows } = await this.pool.query(
      'SELECT id, availability, stock_quantity FROM catalog.products WHERE archived_at IS NULL',
    );
    return rows.map((r: Row) => [
      r.id as string,
      {
        availability: r.availability as 'available' | 'sold_out',
        stockQuantity: r.stock_quantity as number | null,
      },
    ]);
  }

  // ---------- Borradores ----------

  private async loadDraft(
    c: Pool | PoolClient,
    menuId: string,
    lock = false,
  ): Promise<DraftMenuView> {
    const menuRes = await c.query(
      `SELECT m.id, m.name, m.status, m.revision, v.version_number
         FROM catalog.menus m LEFT JOIN catalog.menu_versions v ON v.id = m.current_version_id
        WHERE m.id = $1 ${lock ? 'FOR UPDATE OF m' : ''}`,
      [menuId],
    );
    const menu = menuRes.rows[0] as Row | undefined;
    if (!menu) throw notFound('El menú');

    const slots = await c.query(
      `SELECT day_of_week, to_char(starts_at, 'HH24:MI') AS starts_at, to_char(ends_at, 'HH24:MI') AS ends_at
         FROM catalog.menu_schedule_slots WHERE menu_id = $1 ORDER BY day_of_week, starts_at`,
      [menuId],
    );
    const items = await c.query(
      `SELECT c.id AS category_id, c.name AS category_name,
              p.id, p.name, p.description, p.price_minor, p.image_url, p.image_alt,
              p.allergens, p.allergens_declared
         FROM catalog.menu_categories c
         LEFT JOIN catalog.menu_items i ON i.category_id = c.id
         LEFT JOIN catalog.products p ON p.id = i.product_id
        WHERE c.menu_id = $1
        ORDER BY c.position, c.id, i.position`,
      [menuId],
    );

    const categories = new Map<
      string,
      { categoryId: string; name: string; products: DraftProduct[] }
    >();
    for (const r of items.rows as Row[]) {
      const key = r.category_id as string;
      if (!categories.has(key)) {
        categories.set(key, { categoryId: key, name: r.category_name as string, products: [] });
      }
      if (r.id) categories.get(key)?.products.push(this.toDraftProduct(r));
    }
    return {
      id: menu.id as string,
      name: menu.name as string,
      status: menu.status as DraftMenuView['status'],
      revision: menu.revision as number,
      currentVersionNumber: (menu.version_number as number | null) ?? null,
      schedule: (slots.rows as Row[]).map((s) => ({
        dayOfWeek: s.day_of_week as number,
        startsAt: s.starts_at as string,
        endsAt: s.ends_at as string,
      })),
      categories: [...categories.values()] as DraftCategory[],
    };
  }

  private toDraftProduct(r: Row): DraftProduct {
    return {
      productId: r.id as string,
      name: r.name as string,
      description: r.description as string,
      priceMinor: r.price_minor as number,
      imageUrl: (r.image_url as string | null) ?? null,
      imageAlt: (r.image_alt as string | null) ?? null,
      allergens: r.allergens as string[],
      allergensDeclared: r.allergens_declared as boolean,
    };
  }

  getDraft(menuId: string): Promise<DraftMenuView> {
    return this.loadDraft(this.pool, menuId);
  }

  async listMenus(): Promise<{ id: string; name: string; status: string; revision: number }[]> {
    const { rows } = await this.pool.query(
      'SELECT id, name, status, revision FROM catalog.menus ORDER BY created_at DESC LIMIT 200',
    );
    return rows;
  }

  async createMenu(name: string, actorId: string): Promise<DraftMenuView> {
    const id = await this.tx(async (c) => {
      const { rows } = await c.query(
        'INSERT INTO catalog.menus (name, created_by) VALUES ($1, $2) RETURNING id',
        [name, actorId],
      );
      const menuId = rows[0].id as string;
      await this.audit(c, 'menu', menuId, 'menu_created', actorId, { name });
      return menuId;
    });
    return this.getDraft(id);
  }

  /** Aplica `change` al borrador bajo bloqueo de fila y control optimista; incrementa `revision`. */
  private async editDraft(
    menuId: string,
    ifMatch: string | string[] | undefined,
    actorId: string,
    action: string,
    change: (c: PoolClient) => Promise<unknown>,
  ): Promise<DraftMenuView> {
    await this.tx(async (c) => {
      const current = await this.loadDraft(c, menuId, true);
      assertRevision(ifMatch, current.revision);
      const details = await change(c);
      await c.query(
        'UPDATE catalog.menus SET revision = revision + 1, updated_at = now() WHERE id = $1',
        [menuId],
      );
      await this.audit(c, 'menu', menuId, action, actorId, details ?? {});
    });
    return this.getDraft(menuId);
  }

  updateMenu(
    menuId: string,
    ifMatch: string | string[] | undefined,
    actorId: string,
    input: { name: string; schedule: ScheduleSlot[] },
  ): Promise<DraftMenuView> {
    return this.editDraft(menuId, ifMatch, actorId, 'menu_updated', async (c) => {
      await c.query('UPDATE catalog.menus SET name = $2 WHERE id = $1', [menuId, input.name]);
      await c.query('DELETE FROM catalog.menu_schedule_slots WHERE menu_id = $1', [menuId]);
      for (const s of input.schedule) {
        await c.query(
          'INSERT INTO catalog.menu_schedule_slots (menu_id, day_of_week, starts_at, ends_at) VALUES ($1,$2,$3,$4)',
          [menuId, s.dayOfWeek, s.startsAt, s.endsAt],
        );
      }
      return { name: input.name, schedule: input.schedule };
    });
  }

  addCategory(
    menuId: string,
    ifMatch: string | string[] | undefined,
    actorId: string,
    name: string,
  ): Promise<DraftMenuView> {
    return this.editDraft(menuId, ifMatch, actorId, 'category_added', async (c) => {
      await c.query(
        `INSERT INTO catalog.menu_categories (menu_id, name, position)
         VALUES ($1, $2, COALESCE((SELECT max(position) + 1 FROM catalog.menu_categories WHERE menu_id = $1), 0))`,
        [menuId, name],
      );
      return { name };
    });
  }

  removeCategory(
    menuId: string,
    ifMatch: string | string[] | undefined,
    actorId: string,
    categoryId: string,
  ): Promise<DraftMenuView> {
    return this.editDraft(menuId, ifMatch, actorId, 'category_removed', async (c) => {
      const res = await c.query(
        'DELETE FROM catalog.menu_categories WHERE id = $1 AND menu_id = $2',
        [categoryId, menuId],
      );
      if (res.rowCount === 0) throw notFound('La categoría');
      return { categoryId };
    });
  }

  setCategoryItems(
    menuId: string,
    ifMatch: string | string[] | undefined,
    actorId: string,
    categoryId: string,
    productIds: string[],
  ): Promise<DraftMenuView> {
    return this.editDraft(menuId, ifMatch, actorId, 'category_items_set', async (c) => {
      const cat = await c.query(
        'SELECT 1 FROM catalog.menu_categories WHERE id = $1 AND menu_id = $2',
        [categoryId, menuId],
      );
      if (cat.rowCount === 0) throw notFound('La categoría');
      if (productIds.length > 0) {
        const found = await c.query(
          'SELECT count(*)::int AS n FROM catalog.products WHERE id = ANY($1::uuid[]) AND archived_at IS NULL',
          [productIds],
        );
        if (found.rows[0].n !== productIds.length) {
          throw new CatalogError('validation_failed', 'Algún producto indicado no existe.');
        }
      }
      await c.query('DELETE FROM catalog.menu_items WHERE category_id = $1', [categoryId]);
      for (const [position, productId] of productIds.entries()) {
        await c.query(
          'INSERT INTO catalog.menu_items (category_id, product_id, position) VALUES ($1,$2,$3)',
          [categoryId, productId, position],
        );
      }
      return { categoryId, productIds };
    });
  }

  // ---------- Publicación y versiones ----------

  private async currentSnapshot(c: PoolClient, menuId: string): Promise<MenuSnapshot | null> {
    const { rows } = await c.query(
      `SELECT v.snapshot FROM catalog.menus m JOIN catalog.menu_versions v ON v.id = m.current_version_id
        WHERE m.id = $1`,
      [menuId],
    );
    return (rows[0]?.snapshot as MenuSnapshot | undefined) ?? null;
  }

  private async insertVersion(
    c: PoolClient,
    menuId: string,
    snapshot: MenuSnapshot,
    changes: VersionChange[],
    actorId: string,
    restoredFrom: number | null,
    action: string,
  ): Promise<PublishResult> {
    const next = await c.query(
      'SELECT COALESCE(max(version_number), 0) + 1 AS n FROM catalog.menu_versions WHERE menu_id = $1',
      [menuId],
    );
    const versionNumber = next.rows[0].n as number;
    const ins = await c.query(
      `INSERT INTO catalog.menu_versions
         (menu_id, version_number, snapshot, changes, published_by, restored_from_version)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [
        menuId,
        versionNumber,
        JSON.stringify(snapshot),
        JSON.stringify(changes),
        actorId,
        restoredFrom,
      ],
    );
    const versionId = ins.rows[0].id as string;
    await c.query(
      `UPDATE catalog.menus SET status = 'published', current_version_id = $2,
              revision = revision + 1, updated_at = now() WHERE id = $1`,
      [menuId, versionId],
    );
    await this.audit(c, 'menu', menuId, action, actorId, { versionNumber, restoredFrom, changes });
    return { versionId, versionNumber, changes };
  }

  /** Publicación atómica: valida, crea la versión inmutable y mueve el puntero en una sola transacción. */
  publish(
    menuId: string,
    ifMatch: string | string[] | undefined,
    actorId: string,
  ): Promise<PublishResult> {
    return this.tx(async (c) => {
      const draft = await this.loadDraft(c, menuId, true);
      assertRevision(ifMatch, draft.revision);
      const issues = validateForPublish(draft);
      if (issues.length > 0) {
        throw new CatalogError('publish_blocked', 'El menú no se puede publicar todavía.', issues);
      }
      const previous = draft.status === 'published' ? await this.currentSnapshot(c, menuId) : null;
      const snapshot = buildSnapshot(menuId, draft);
      const changes = diffSnapshots(previous, snapshot);
      if (previous && changes.length === 0) {
        throw new CatalogError(
          'validation_failed',
          'No hay cambios que publicar respecto a la versión vigente.',
        );
      }
      return this.insertVersion(c, menuId, snapshot, changes, actorId, null, 'menu_published');
    });
  }

  /** Restaurar = publicar de nuevo el contenido de una versión anterior como versión N+1. */
  restore(
    menuId: string,
    versionNumber: number,
    ifMatch: string | string[] | undefined,
    actorId: string,
  ): Promise<PublishResult> {
    return this.tx(async (c) => {
      const draft = await this.loadDraft(c, menuId, true);
      assertRevision(ifMatch, draft.revision);
      const target = await c.query(
        'SELECT snapshot FROM catalog.menu_versions WHERE menu_id = $1 AND version_number = $2',
        [menuId, versionNumber],
      );
      if (target.rowCount === 0) throw notFound('La versión');
      const snapshot = target.rows[0].snapshot as MenuSnapshot;
      const previous = draft.status === 'published' ? await this.currentSnapshot(c, menuId) : null;
      return this.insertVersion(
        c,
        menuId,
        snapshot,
        diffSnapshots(previous, snapshot),
        actorId,
        versionNumber,
        'menu_restored',
      );
    });
  }

  retire(menuId: string, ifMatch: string | string[] | undefined, actorId: string): Promise<void> {
    return this.tx(async (c) => {
      const draft = await this.loadDraft(c, menuId, true);
      assertRevision(ifMatch, draft.revision);
      await c.query(
        "UPDATE catalog.menus SET status = 'retired', revision = revision + 1, updated_at = now() WHERE id = $1",
        [menuId],
      );
      await this.audit(c, 'menu', menuId, 'menu_retired', actorId, {});
    });
  }

  async listVersions(menuId: string): Promise<VersionSummary[]> {
    const exists = await this.pool.query('SELECT 1 FROM catalog.menus WHERE id = $1', [menuId]);
    if (exists.rowCount === 0) throw notFound('El menú');
    const { rows } = await this.pool.query(
      `SELECT version_number, published_by, published_at, restored_from_version, changes
         FROM catalog.menu_versions WHERE menu_id = $1 ORDER BY version_number DESC`,
      [menuId],
    );
    return rows.map((r: Row) => ({
      versionNumber: r.version_number as number,
      publishedBy: r.published_by as string,
      publishedAt: (r.published_at as Date).toISOString(),
      restoredFromVersion: (r.restored_from_version as number | null) ?? null,
      changes: r.changes as VersionChange[],
    }));
  }

  // ---------- Productos ----------

  private toProductRow(r: Row): ProductRow {
    return {
      ...this.toDraftProduct(r),
      availability: r.availability as 'available' | 'sold_out',
      stockQuantity: (r.stock_quantity as number | null) ?? null,
      revision: r.revision as number,
    };
  }

  async listProducts(): Promise<ProductRow[]> {
    const { rows } = await this.pool.query(
      'SELECT * FROM catalog.products WHERE archived_at IS NULL ORDER BY name LIMIT 500',
    );
    return rows.map((r: Row) => this.toProductRow(r));
  }

  async getProduct(productId: string): Promise<ProductRow> {
    const { rows } = await this.pool.query('SELECT * FROM catalog.products WHERE id = $1', [
      productId,
    ]);
    if (!rows[0]) throw notFound('El producto');
    return this.toProductRow(rows[0] as Row);
  }

  createProduct(input: ProductInput, actorId: string): Promise<ProductRow> {
    return this.tx(async (c) => {
      const { rows } = await c.query(
        `INSERT INTO catalog.products
           (name, description, price_minor, image_url, image_alt, allergens, allergens_declared)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [
          input.name,
          input.description,
          input.priceMinor,
          input.imageUrl,
          input.imageAlt,
          input.allergens,
          input.allergensDeclared,
        ],
      );
      await this.audit(c, 'product', rows[0].id, 'product_created', actorId, { after: input });
      return this.toProductRow(rows[0] as Row);
    });
  }

  updateProduct(
    productId: string,
    ifMatch: string | string[] | undefined,
    actorId: string,
    input: ProductInput,
  ): Promise<ProductRow> {
    return this.tx(async (c) => {
      const cur = await c.query('SELECT * FROM catalog.products WHERE id = $1 FOR UPDATE', [
        productId,
      ]);
      if (!cur.rows[0]) throw notFound('El producto');
      const before = this.toProductRow(cur.rows[0] as Row);
      assertRevision(ifMatch, before.revision);
      const { rows } = await c.query(
        `UPDATE catalog.products SET name=$2, description=$3, price_minor=$4, image_url=$5, image_alt=$6,
                allergens=$7, allergens_declared=$8, revision = revision + 1, updated_at = now()
          WHERE id = $1 RETURNING *`,
        [
          productId,
          input.name,
          input.description,
          input.priceMinor,
          input.imageUrl,
          input.imageAlt,
          input.allergens,
          input.allergensDeclared,
        ],
      );
      const changed: Record<string, { from: unknown; to: unknown }> = {};
      const compare: [string, unknown, unknown][] = [
        ['name', before.name, input.name],
        ['description', before.description, input.description],
        ['priceMinor', before.priceMinor, input.priceMinor],
        ['imageUrl', before.imageUrl, input.imageUrl],
        ['imageAlt', before.imageAlt, input.imageAlt],
        [
          'allergens',
          [...before.allergens].sort().join(','),
          [...input.allergens].sort().join(','),
        ],
        ['allergensDeclared', before.allergensDeclared, input.allergensDeclared],
      ];
      for (const [field, from, to] of compare) if (from !== to) changed[field] = { from, to };
      await this.audit(c, 'product', productId, 'product_updated', actorId, changed);
      return this.toProductRow(rows[0] as Row);
    });
  }

  /** Disponibilidad/existencias: operación del personal; nunca toca precio ni contenido. */
  setAvailability(
    productId: string,
    actorId: string,
    patch: AvailabilityPatch,
  ): Promise<ProductRow> {
    return this.tx(async (c) => {
      const cur = await c.query('SELECT * FROM catalog.products WHERE id = $1 FOR UPDATE', [
        productId,
      ]);
      if (!cur.rows[0]) throw notFound('El producto');
      const before = this.toProductRow(cur.rows[0] as Row);
      const stock = patch.stockQuantity === undefined ? before.stockQuantity : patch.stockQuantity;
      if (patch.availability === 'available' && stock === 0) {
        throw new CatalogError(
          'validation_failed',
          'No puede marcar disponible un producto sin existencias.',
        );
      }
      // Existencias en cero ⇒ agotado automáticamente.
      const availability = stock === 0 ? 'sold_out' : (patch.availability ?? before.availability);
      const { rows } = await c.query(
        `UPDATE catalog.products SET availability = $2, stock_quantity = $3, updated_at = now()
          WHERE id = $1 RETURNING *`,
        [productId, availability, stock],
      );
      await this.audit(c, 'product', productId, 'availability_changed', actorId, {
        availability: { from: before.availability, to: availability },
        stockQuantity: { from: before.stockQuantity, to: stock },
      });
      return this.toProductRow(rows[0] as Row);
    });
  }
}
