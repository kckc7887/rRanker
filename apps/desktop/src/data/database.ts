import Database from '@tauri-apps/plugin-sql';
import type {
  CatalogRepository,
  CatalogSnapshot,
  ScoreSnapshot,
  SnapshotRepository,
} from '@rranker/core';

export const DEMO_ACCOUNT_ID = 'maimai:test';
const SNAPSHOT_SCHEMA_VERSION = 1;
const CATALOG_SCHEMA_VERSION = 1;
const BOOTSTRAP_KEY = 'desktop_demo_bootstrapped_v1';
const ACTIVE_ACCOUNT_KEY = 'active_account_id';

export type DesktopAccount = {
  id: string;
  gameId: 'maimai';
  providerId: 'maimai-test';
  displayName: string;
};

export type DatabaseLike = {
  select<T>(query: string, bindValues?: unknown[]): Promise<T>;
  execute(query: string, bindValues?: unknown[]): Promise<unknown>;
};

type AccountRow = {
  id: string;
  game_id: string;
  provider_id: string;
  display_name: string;
};

type MetaRow = { value: string };

let databasePromise: Promise<Database> | null = null;

export function getDatabase(): Promise<Database> {
  if (!databasePromise) databasePromise = Database.load('sqlite:rranker.db');
  return databasePromise;
}

function fromAccountRow(row: AccountRow): DesktopAccount | null {
  if (
    row.game_id !== 'maimai' ||
    row.provider_id !== 'maimai-test' ||
    row.id !== DEMO_ACCOUNT_ID
  ) {
    return null;
  }
  return {
    id: row.id,
    gameId: 'maimai',
    providerId: 'maimai-test',
    displayName: row.display_name,
  };
}

async function readMeta(db: DatabaseLike, key: string): Promise<string | null> {
  const rows = await db.select<MetaRow[]>(
    'SELECT value FROM app_meta WHERE key = $1 LIMIT 1',
    [key],
  );
  return rows[0]?.value ?? null;
}

async function writeMeta(
  db: DatabaseLike,
  key: string,
  value: string,
): Promise<void> {
  await db.execute(
    `INSERT INTO app_meta (key, value) VALUES ($1, $2)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value],
  );
}

export async function initializeDesktopState(
  providedDatabase?: DatabaseLike,
): Promise<{ accounts: DesktopAccount[]; activeAccount: DesktopAccount | null }> {
  const db = providedDatabase ?? (await getDatabase());
  await db.execute('BEGIN IMMEDIATE');
  try {
    const bootstrapped = await readMeta(db, BOOTSTRAP_KEY);
    if (!bootstrapped) {
      const now = new Date().toISOString();
      await db.execute(
        `INSERT OR IGNORE INTO accounts
         (id, game_id, provider_id, display_name, created_at, updated_at)
         VALUES ($1, 'maimai', 'maimai-test', '示例账号', $2, $2)`,
        [DEMO_ACCOUNT_ID, now],
      );
      await writeMeta(db, BOOTSTRAP_KEY, '1');
      await writeMeta(db, ACTIVE_ACCOUNT_KEY, DEMO_ACCOUNT_ID);
    }

    const rows = await db.select<AccountRow[]>(
      `SELECT id, game_id, provider_id, display_name
       FROM accounts ORDER BY created_at ASC`,
    );
    const accounts = rows.flatMap((row) => {
      const account = fromAccountRow(row);
      return account ? [account] : [];
    });
    const storedActiveId = await readMeta(db, ACTIVE_ACCOUNT_KEY);
    const activeAccount =
      accounts.find((account) => account.id === storedActiveId) ??
      accounts[0] ??
      null;
    await writeMeta(db, ACTIVE_ACCOUNT_KEY, activeAccount?.id ?? '');
    await db.execute('COMMIT');
    return { accounts, activeAccount };
  } catch (error) {
    await db.execute('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

export async function addDemoAccount(
  providedDatabase?: DatabaseLike,
): Promise<DesktopAccount> {
  const db = providedDatabase ?? (await getDatabase());
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO accounts
     (id, game_id, provider_id, display_name, created_at, updated_at)
     VALUES ($1, 'maimai', 'maimai-test', '示例账号', $2, $2)
     ON CONFLICT(id) DO UPDATE SET
       display_name = excluded.display_name,
       updated_at = excluded.updated_at`,
    [DEMO_ACCOUNT_ID, now],
  );
  await writeMeta(db, ACTIVE_ACCOUNT_KEY, DEMO_ACCOUNT_ID);
  return {
    id: DEMO_ACCOUNT_ID,
    gameId: 'maimai',
    providerId: 'maimai-test',
    displayName: '示例账号',
  };
}

export async function deleteDemoAccount(
  providedDatabase?: DatabaseLike,
): Promise<void> {
  const db = providedDatabase ?? (await getDatabase());
  await db.execute('DELETE FROM accounts WHERE id = $1', [DEMO_ACCOUNT_ID]);
  await writeMeta(db, ACTIVE_ACCOUNT_KEY, '');
}

type SnapshotRow = { schema_version: number; payload: string };

export class DesktopSnapshotRepository
  implements SnapshotRepository, CatalogRepository
{
  constructor(private readonly providedDatabase?: DatabaseLike) {}

  private async database(): Promise<DatabaseLike> {
    return this.providedDatabase ?? (await getDatabase());
  }

  async initialize(): Promise<void> {
    await this.database();
  }

  async getLatest(accountId: string): Promise<ScoreSnapshot | null> {
    const db = await this.database();
    const rows = await db.select<SnapshotRow[]>(
      `SELECT schema_version, payload
       FROM account_score_snapshots WHERE account_id = $1 LIMIT 1`,
      [accountId],
    );
    const row = rows[0];
    if (!row) return null;
    if (row.schema_version !== SNAPSHOT_SCHEMA_VERSION) {
      await db.execute(
        'DELETE FROM account_score_snapshots WHERE account_id = $1',
        [accountId],
      );
      return null;
    }
    try {
      return JSON.parse(row.payload) as ScoreSnapshot;
    } catch {
      await db.execute(
        'DELETE FROM account_score_snapshots WHERE account_id = $1',
        [accountId],
      );
      return null;
    }
  }

  async save(accountId: string, snapshot: ScoreSnapshot): Promise<void> {
    const db = await this.database();
    await db.execute(
      `INSERT INTO account_score_snapshots
       (account_id, schema_version, updated_at, payload)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT(account_id) DO UPDATE SET
         schema_version = excluded.schema_version,
         updated_at = excluded.updated_at,
         payload = excluded.payload`,
      [
        accountId,
        SNAPSHOT_SCHEMA_VERSION,
        snapshot.source.updatedAt,
        JSON.stringify(snapshot),
      ],
    );
  }

  async clear(accountId?: string): Promise<void> {
    const db = await this.database();
    if (accountId) {
      await db.execute(
        'DELETE FROM account_score_snapshots WHERE account_id = $1',
        [accountId],
      );
      return;
    }
    await db.execute('DELETE FROM account_score_snapshots');
  }

  async getLatestCatalog(): Promise<CatalogSnapshot | null> {
    const db = await this.database();
    const rows = await db.select<SnapshotRow[]>(
      'SELECT schema_version, payload FROM catalog_snapshots WHERE id = 1 LIMIT 1',
    );
    const row = rows[0];
    if (!row) return null;
    if (row.schema_version !== CATALOG_SCHEMA_VERSION) {
      await db.execute('DELETE FROM catalog_snapshots WHERE id = 1');
      return null;
    }
    try {
      return JSON.parse(row.payload) as CatalogSnapshot;
    } catch {
      await db.execute('DELETE FROM catalog_snapshots WHERE id = 1');
      return null;
    }
  }

  async saveCatalog(catalog: CatalogSnapshot): Promise<void> {
    const db = await this.database();
    await db.execute(
      `INSERT INTO catalog_snapshots
       (id, schema_version, updated_at, payload)
       VALUES (1, $1, $2, $3)
       ON CONFLICT(id) DO UPDATE SET
         schema_version = excluded.schema_version,
         updated_at = excluded.updated_at,
         payload = excluded.payload`,
      [
        CATALOG_SCHEMA_VERSION,
        catalog.source.updatedAt,
        JSON.stringify(catalog),
      ],
    );
  }
}

export function asCachedSnapshot(snapshot: ScoreSnapshot): ScoreSnapshot {
  return {
    ...snapshot,
    source: {
      ...snapshot.source,
      kind: 'cache',
      label: `最近有效成绩快照（原：${snapshot.source.label}）`,
      isStale: true,
    },
    catalogSource: {
      ...snapshot.catalogSource,
      kind: 'cache',
      label: `曲库缓存（原：${snapshot.catalogSource.label}）`,
      isStale: true,
    },
  };
}
