import type { SQLiteDatabase } from 'expo-sqlite';
import type { RuntimeLogCapacity, RuntimeLogEntry, RuntimeLogSession, RuntimeLogStatus } from '@/domain/runtime-log';

export const RUNTIME_LOG_SCHEMA = `
CREATE TABLE IF NOT EXISTS log_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  startedAt TEXT NOT NULL,
  lastAt TEXT NOT NULL,
  status TEXT NOT NULL,
  capacity INTEGER NOT NULL CHECK(capacity IN (1000, 2000, 5000)),
  context TEXT NOT NULL,
  sequence INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS log_entries (
  sessionId INTEGER NOT NULL,
  sequence INTEGER NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY (sessionId, sequence)
);
`;

export class RuntimeLogRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  recover(): void {
    this.db.runSync("UPDATE log_sessions SET status = 'interrupted' WHERE status = 'recording'");
  }

  list(): RuntimeLogSession[] {
    return this.db.getAllSync<RuntimeLogSession>(`
      SELECT id, startedAt, lastAt, status, capacity,
        (SELECT COUNT(*) FROM log_entries WHERE sessionId = log_sessions.id) AS count
      FROM log_sessions ORDER BY id DESC LIMIT 2
    `);
  }

  start(capacity: RuntimeLogCapacity, at: string, entry: RuntimeLogEntry): number {
    let id = 0;
    this.db.withTransactionSync(() => {
      this.db.runSync("UPDATE log_sessions SET status = 'interrupted' WHERE status = 'recording'");
      id = this.db.runSync(
        "INSERT INTO log_sessions(startedAt, lastAt, status, capacity, context) VALUES (?, ?, 'recording', ?, ?)",
        at, at, capacity, JSON.stringify(entry.fields),
      ).lastInsertRowId;
      this.insert(id, entry);
      this.db.execSync(`
        DELETE FROM log_entries WHERE sessionId NOT IN (SELECT id FROM log_sessions ORDER BY id DESC LIMIT 2);
        DELETE FROM log_sessions WHERE id NOT IN (SELECT id FROM log_sessions ORDER BY id DESC LIMIT 2);
      `);
    });
    return id;
  }

  private insert(id: number, entry: RuntimeLogEntry): void {
    const updated = this.db.runSync(
      "UPDATE log_sessions SET sequence = sequence + 1, lastAt = ? WHERE id = ? AND status = 'recording'",
      entry.at, id,
    );
    if (updated.changes !== 1) throw new Error('inactive log session');
    this.db.runSync('INSERT INTO log_entries SELECT id, sequence, ? FROM log_sessions WHERE id = ?', JSON.stringify(entry), id);
    this.db.runSync(`DELETE FROM log_entries WHERE sessionId = ? AND sequence <=
      (SELECT sequence - capacity FROM log_sessions WHERE id = ?)`, id, id);
  }

  append(id: number, entry: RuntimeLogEntry): void {
    this.db.withTransactionSync(() => this.insert(id, entry));
  }

  finish(id: number, status: RuntimeLogStatus, entry?: RuntimeLogEntry): void {
    this.db.withTransactionSync(() => {
      if (entry) this.insert(id, entry);
      this.db.runSync('UPDATE log_sessions SET status = ? WHERE id = ?', status, id);
    });
  }

  snapshot(id: number): { session: RuntimeLogSession; context: RuntimeLogEntry['fields']; entries: RuntimeLogEntry[] } {
    const session = this.list().find((item) => item.id === id);
    if (!session) throw new Error('log session unavailable');
    const entries = this.db.getAllSync<{ payload: string }>(
      'SELECT payload FROM log_entries WHERE sessionId = ? ORDER BY sequence', id,
    ).map((row) => JSON.parse(row.payload) as RuntimeLogEntry);
    const row = this.db.getFirstSync<{ context: string }>('SELECT context FROM log_sessions WHERE id = ?', id);
    return { session, context: JSON.parse(row!.context) as RuntimeLogEntry['fields'], entries };
  }
}
