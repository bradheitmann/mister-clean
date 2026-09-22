import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  openControlPlaneDatabase,
  type OpenControlPlaneDatabase,
} from "../src/control-plane/persistence/sqlite.js";

const expected = {
  repository: [
    "coordination_domain_events", "coordination_domains", "current_run_bindings", "directive_events", "evidence_records",
    "import_byte_vault", "import_census_entries", "import_census_snapshots", "import_known_now_history", "import_observed_history", "import_quarantine_records",
    "issue_edges", "issue_events", "issue_graphs", "issue_observation_links", "issue_roots",
    "leases", "manifest_revisions", "metric_snapshots", "observations", "operation_events",
    "plan_items", "plan_snapshots", "receipts", "repositories", "run_components", "run_events", "run_interpretations", "runs", "schema_migrations",
  ],
  global: [
    "agent_evaluation_evidence", "agent_execution_profiles", "agent_identity_lease_events", "agent_identity_observation_targets", "agent_identity_observations", "agent_run_events", "agent_tuples", "availability_observations", "capabilities",
    "capability_evaluators", "deployments", "evaluation_dispatch_subjects", "evaluation_evaluated_candidates", "evaluation_identity_receipt_verifications", "evaluation_run_invocations", "execution_routes", "execution_treatments", "harnesses", "inference_sources",
    "local_mister_clean_invocations", "local_repository_identities", "logical_project_repository_aliases", "logical_projects", "models", "price_schedules", "qualification_events", "schema_migrations", "telemetry_imports",
    "trial_evaluations", "trials",
  ],
} as const;

interface TriggerDefinition {
  readonly name: string;
  readonly table_name: string;
  readonly sql: string;
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

function triggerDefinitions(database: OpenControlPlaneDatabase): readonly TriggerDefinition[] {
  return database.database.query<TriggerDefinition>(
    "SELECT name, tbl_name AS table_name, sql FROM sqlite_schema WHERE type = 'trigger' ORDER BY name",
  ).all().map((trigger) => ({ ...trigger, sql: normalizeSql(trigger.sql) }));
}

function assertExactTriggerInventory(
  candidate: OpenControlPlaneDatabase,
  canonical: OpenControlPlaneDatabase,
  label: string,
): void {
  const observed = triggerDefinitions(candidate);
  const expectedTriggers = triggerDefinitions(canonical);
  if (JSON.stringify(observed) !== JSON.stringify(expectedTriggers)) {
    throw new Error(`${label} trigger inventory or definition differs from the canonical schema`);
  }
}

async function expectTamperedTriggerRejection(
  path: string,
  canonical: OpenControlPlaneDatabase,
  mutate: (database: OpenControlPlaneDatabase) => void,
  label: string,
): Promise<void> {
  const tampered = await openControlPlaneDatabase("global", path, "2026-08-26T00:00:00.000Z");
  try {
    mutate(tampered);
    try {
      assertExactTriggerInventory(tampered, canonical, label);
    } catch {
      return;
    }
    throw new Error(`${label} was accepted by trigger equivalence verification`);
  } finally {
    tampered.close();
  }
}

const root = mkdtempSync(join(tmpdir(), "mister-clean-control-plane-"));
try {
  for (const kind of ["repository", "global"] as const) {
    const path = join(root, `${kind}.sqlite`);
    const canonical = await openControlPlaneDatabase(kind, join(root, `${kind}.canonical.sqlite`), "2026-08-26T00:00:00.000Z");
    const opened = await openControlPlaneDatabase(kind, path, "2026-08-26T00:00:00.000Z");
    try {
      const tables = opened.database.query<{ name: string }>(
        "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      ).all().map((row) => row.name);
      if (JSON.stringify(tables) !== JSON.stringify(expected[kind])) {
        throw new Error(`${kind} schema mismatch: ${JSON.stringify(tables)}`);
      }
      const foreignKeys = opened.database.query<{ foreign_keys: number }>("PRAGMA foreign_keys").get();
      if (foreignKeys?.foreign_keys !== 1) throw new Error(`${kind} database did not enable foreign keys`);
      const journal = opened.database.query<{ journal_mode: string }>("PRAGMA journal_mode").get();
      if (journal?.journal_mode.toLowerCase() !== "wal") throw new Error(`${kind} database did not enable WAL mode`);
      const integrity = opened.database.query<{ integrity_check: string }>("PRAGMA integrity_check").get();
      if (integrity?.integrity_check !== "ok") throw new Error(`${kind} integrity check failed`);
      const migrations = opened.database.query<{ version: number }>(
        "SELECT version FROM schema_migrations WHERE store_kind = ? ORDER BY version",
      ).all(kind).map((migration) => migration.version);
      const expectedMigrations = kind === "repository" ? [1, 2, 3] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      if (JSON.stringify(migrations) !== JSON.stringify(expectedMigrations)) {
        throw new Error(`${kind} migrations were not recorded exactly once and in order`);
      }
      assertExactTriggerInventory(opened, canonical, `${kind} schema`);

      if (kind === "repository") {
        opened.database.query(
          "INSERT INTO repositories(repository_id, repository_root, display_name, created_at) VALUES (?, ?, ?, ?)",
        ).run("repo", "/private/repository", "fixture", "2026-08-26T00:00:00.000Z");
        opened.database.query(
          "INSERT INTO evidence_records(evidence_id, repository_id, path, sha256, recorded_at) VALUES (?, ?, ?, ?, ?)",
        ).run("evidence", "repo", "receipt.json", "a".repeat(64), "2026-08-26T00:00:00.000Z");
        try {
          opened.database.exec("UPDATE evidence_records SET path = 'changed.json' WHERE evidence_id = 'evidence'");
          throw new Error("repository append-only evidence accepted an update");
        } catch (error) {
          if (!String(error).includes("evidence_records is append-only")) throw error;
        }
      } else {
        const evaluatorColumns = opened.database.query<{ name: string }>(
          "SELECT name FROM pragma_table_info('capability_evaluators') ORDER BY cid",
        ).all().map((column) => column.name);
        const expectedEvaluatorColumns = [
          "evaluator_id", "capability_id", "question", "evaluator_version", "active",
          "evaluation_dimension", "independent_evaluator",
        ];
        if (JSON.stringify(evaluatorColumns) !== JSON.stringify(expectedEvaluatorColumns)) {
          throw new Error(`global capability_evaluators shape mismatch: ${JSON.stringify(evaluatorColumns)}`);
        }
        const creditAdmission = opened.database.query<{ name: string }>(
          "SELECT name FROM sqlite_schema WHERE type = 'trigger' AND name = 'trials_credit_admission'",
        ).get();
        if (creditAdmission?.name !== "trials_credit_admission") {
          throw new Error("global migration 2 is missing the credited-trial admission trigger");
        }
        const actorColumns = opened.database.query<{ table_name: string; column_name: string }>(
          `SELECT 'trials' AS table_name, name AS column_name FROM pragma_table_info('trials') WHERE name IN ('worker_actor_id', 'author_actor_id')
           UNION ALL
           SELECT 'trial_evaluations', name FROM pragma_table_info('trial_evaluations') WHERE name = 'evaluator_actor_id'
           ORDER BY table_name, column_name`,
        ).all();
        if (JSON.stringify(actorColumns) !== JSON.stringify([
          { table_name: "trial_evaluations", column_name: "evaluator_actor_id" },
          { table_name: "trials", column_name: "author_actor_id" },
          { table_name: "trials", column_name: "worker_actor_id" },
        ])) throw new Error(`global actor binding columns are incomplete: ${JSON.stringify(actorColumns)}`);
        const repositoryIdentityColumns = opened.database.query<{ table_name: string; column_name: string }>(
          `SELECT m.name AS table_name, p.name AS column_name
           FROM sqlite_schema AS m, pragma_table_info(m.name) AS p
           WHERE m.type = 'table' AND p.name IN ('repository_id', 'repository_root', 'repository_path')
           ORDER BY table_name, column_name`,
        ).all();
        const allowedMachineLocalIdentityColumns = [
          { table_name: "agent_run_events", column_name: "repository_id" },
          { table_name: "local_repository_identities", column_name: "repository_id" },
          { table_name: "logical_project_repository_aliases", column_name: "repository_id" },
          { table_name: "trials", column_name: "repository_id" },
        ];
        if (JSON.stringify(repositoryIdentityColumns) !== JSON.stringify(allowedMachineLocalIdentityColumns)) {
          throw new Error(`global schema repository identity boundary mismatch: ${JSON.stringify(repositoryIdentityColumns)}`);
        }
        opened.database.query(
          "INSERT INTO telemetry_imports(import_id, source_kind, payload_sha256, schema_version, accepted_rows, rejected_rows, imported_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        ).run("import", "repository_export", "b".repeat(64), "1", 1, 0, "2026-08-26T00:00:00.000Z");
        try {
          opened.database.exec("DELETE FROM telemetry_imports WHERE import_id = 'import'");
          throw new Error("global append-only telemetry accepted a delete");
        } catch (error) {
          if (!String(error).includes("telemetry_imports is append-only")) throw error;
        }

        await expectTamperedTriggerRejection(
          join(root, "global-extra-trigger.sqlite"),
          canonical,
          (database) => database.database.exec("CREATE TRIGGER verifier_extra BEFORE INSERT ON trials BEGIN SELECT 1; END"),
          "extra global trigger",
        );
        await expectTamperedTriggerRejection(
          join(root, "global-noop-trigger.sqlite"),
          canonical,
          (database) => database.database.exec(`DROP TRIGGER trials_credit_admission;
            CREATE TRIGGER trials_credit_admission BEFORE INSERT ON trials BEGIN SELECT 1; END`),
          "rewritten global trigger",
        );
      }
    } finally {
      opened.close();
      canonical.close();
    }
    const reopened = await openControlPlaneDatabase(kind, path, "2026-08-26T00:00:01.000Z");
    reopened.close();
  }
  process.stdout.write("control-plane SQLite schemas verified\n");
} finally {
  rmSync(root, { recursive: true, force: true });
}
