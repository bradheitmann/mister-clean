import { createHash } from "node:crypto";

import {
  migrationsFor,
  type ControlPlaneStoreKind,
  type SqliteMigration,
} from "./migrations.js";

export interface SqliteStatement<Row extends object = Record<string, unknown>> {
  all(...bindings: readonly unknown[]): Row[];
  get(...bindings: readonly unknown[]): Row | null;
  run(...bindings: readonly unknown[]): unknown;
}

export interface BunSqliteDatabase {
  exec(sql: string): unknown;
  query<Row extends object = Record<string, unknown>>(sql: string): SqliteStatement<Row>;
  close(): void;
  transaction<Result>(callback: () => Result): () => Result;
}

interface BunSqliteModule {
  readonly Database: new (filename: string, options?: { readonly create?: boolean; readonly strict?: boolean }) => BunSqliteDatabase;
}

export interface OpenControlPlaneDatabase {
  readonly kind: ControlPlaneStoreKind;
  readonly path: string;
  readonly database: BunSqliteDatabase;
  close(): void;
}

const MIGRATION_TABLE = `CREATE TABLE IF NOT EXISTS schema_migrations (
  store_kind TEXT NOT NULL CHECK(store_kind IN ('repository', 'global')),
  version INTEGER NOT NULL CHECK(version >= 1),
  description TEXT NOT NULL,
  migration_sha256 TEXT NOT NULL CHECK(length(migration_sha256) = 64),
  applied_at TEXT NOT NULL,
  PRIMARY KEY(store_kind, version)
) STRICT`;

function migrationDigest(migration: SqliteMigration): string {
  return createHash("sha256")
    .update(JSON.stringify({
      version: migration.version,
      description: migration.description,
      statements: migration.statements,
    }), "utf8")
    .digest("hex");
}

function applyMigrations(
  database: BunSqliteDatabase,
  kind: ControlPlaneStoreKind,
  now: string,
): void {
  database.exec(MIGRATION_TABLE);
  const migrations = migrationsFor(kind);
  const rows = database.query<{ version: number; migration_sha256: string }>(
    "SELECT version, migration_sha256 FROM schema_migrations WHERE store_kind = ? ORDER BY version",
  ).all(kind);
  const knownVersions = new Set(migrations.map((migration) => migration.version));
  for (const row of rows) {
    if (!knownVersions.has(row.version)) {
      throw new Error(`${kind} database has unsupported migration version ${row.version}`);
    }
    const expected = migrationDigest(migrations.find((migration) => migration.version === row.version)!);
    if (row.migration_sha256 !== expected) {
      throw new Error(`${kind} migration ${row.version} digest does not match this runtime`);
    }
  }
  const applied = new Set(rows.map((row) => row.version));
  for (const migration of migrations) {
    if (applied.has(migration.version)) continue;
    database.transaction(() => {
      for (const statement of migration.statements) database.exec(statement);
      database.query(
        "INSERT INTO schema_migrations(store_kind, version, description, migration_sha256, applied_at) VALUES (?, ?, ?, ?, ?)",
      ).run(kind, migration.version, migration.description, migrationDigest(migration), now);
    })();
  }
}

export async function openControlPlaneDatabase(
  kind: ControlPlaneStoreKind,
  path: string,
  now = new Date().toISOString(),
): Promise<OpenControlPlaneDatabase> {
  const moduleName: string = "bun:sqlite";
  const sqlite = await import(moduleName) as unknown as BunSqliteModule;
  if (!sqlite.Database) throw new Error("Mister Clean control-plane storage requires the Bun runtime and bun:sqlite");
  const database = new sqlite.Database(path, { create: true, strict: true });
  try {
    database.exec("PRAGMA foreign_keys = ON");
    database.exec("PRAGMA busy_timeout = 5000");
    database.exec("PRAGMA journal_mode = WAL");
    applyMigrations(database, kind, now);
  } catch (error) {
    database.close();
    throw error;
  }
  return { kind, path, database, close: () => database.close() };
}
