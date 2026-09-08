export type ControlPlaneStoreKind = "repository" | "global";

export interface SqliteMigration {
  readonly version: number;
  readonly description: string;
  readonly statements: readonly string[];
}

function appendOnly(table: string): readonly string[] {
  return [
    `CREATE TRIGGER ${table}_immutable_update BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT, '${table} is append-only'); END`,
    `CREATE TRIGGER ${table}_immutable_delete BEFORE DELETE ON ${table} BEGIN SELECT RAISE(ABORT, '${table} is append-only'); END`,
  ];
}

const repositoryV1Statements = [
  `CREATE TABLE repositories (
    repository_id TEXT PRIMARY KEY,
    repository_root TEXT NOT NULL,
    display_name TEXT NOT NULL,
    created_at TEXT NOT NULL
  ) STRICT`,
  `CREATE TABLE evidence_records (
    evidence_id TEXT PRIMARY KEY,
    repository_id TEXT NOT NULL REFERENCES repositories(repository_id),
    path TEXT NOT NULL,
    sha256 TEXT NOT NULL CHECK(length(sha256) = 64),
    record_type TEXT,
    recorded_at TEXT NOT NULL,
    UNIQUE(repository_id, path, sha256)
  ) STRICT`,
  `CREATE TABLE runs (
    run_id TEXT PRIMARY KEY,
    repository_id TEXT NOT NULL REFERENCES repositories(repository_id),
    mister_clean_version TEXT NOT NULL,
    detector_set_id TEXT NOT NULL,
    detector_set_sha256 TEXT NOT NULL CHECK(length(detector_set_sha256) = 64),
    observed_then_json TEXT NOT NULL CHECK(json_valid(observed_then_json)),
    created_at TEXT NOT NULL
  ) STRICT`,
  `CREATE TABLE run_events (
    event_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES runs(run_id),
    sequence INTEGER NOT NULL CHECK(sequence >= 1),
    event_kind TEXT NOT NULL,
    state TEXT NOT NULL,
    repository_object_sha256 TEXT NOT NULL CHECK(length(repository_object_sha256) = 64),
    payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
    occurred_at TEXT NOT NULL,
    UNIQUE(run_id, sequence)
  ) STRICT`,
  `CREATE TABLE run_interpretations (
    interpretation_id TEXT PRIMARY KEY,
    source_run_id TEXT NOT NULL REFERENCES runs(run_id),
    detector_set_id TEXT NOT NULL,
    detector_set_sha256 TEXT NOT NULL CHECK(length(detector_set_sha256) = 64),
    interpretation_sha256 TEXT NOT NULL CHECK(length(interpretation_sha256) = 64),
    known_now_json TEXT NOT NULL CHECK(json_valid(known_now_json)),
    interpreted_at TEXT NOT NULL,
    UNIQUE(source_run_id, detector_set_sha256, interpretation_sha256)
  ) STRICT`,
  `CREATE TABLE manifest_revisions (
    manifest_id TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK(revision >= 1),
    run_id TEXT NOT NULL REFERENCES runs(run_id),
    parent_manifest_sha256 TEXT CHECK(parent_manifest_sha256 IS NULL OR length(parent_manifest_sha256) = 64),
    manifest_sha256 TEXT NOT NULL CHECK(length(manifest_sha256) = 64),
    canonical_manifest_json TEXT NOT NULL CHECK(json_valid(canonical_manifest_json)),
    created_at TEXT NOT NULL,
    PRIMARY KEY(manifest_id, revision),
    UNIQUE(manifest_sha256)
  ) STRICT`,
  `CREATE TABLE issue_roots (
    issue_id TEXT PRIMARY KEY,
    repository_id TEXT NOT NULL REFERENCES repositories(repository_id),
    stable_cause_key TEXT NOT NULL,
    normalizer TEXT NOT NULL,
    first_detected_run_id TEXT NOT NULL REFERENCES runs(run_id),
    immutable_identity_json TEXT NOT NULL CHECK(json_valid(immutable_identity_json)),
    UNIQUE(repository_id, stable_cause_key, normalizer)
  ) STRICT`,
  `CREATE TABLE observations (
    observation_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES runs(run_id),
    detector_set_id TEXT NOT NULL,
    detector_native_fingerprint TEXT NOT NULL,
    repository_object_sha256 TEXT NOT NULL CHECK(length(repository_object_sha256) = 64),
    observation_json TEXT NOT NULL CHECK(json_valid(observation_json)),
    observed_at TEXT NOT NULL,
    UNIQUE(run_id, detector_set_id, detector_native_fingerprint)
  ) STRICT`,
  `CREATE TABLE issue_observation_links (
    issue_id TEXT NOT NULL REFERENCES issue_roots(issue_id),
    observation_id TEXT NOT NULL REFERENCES observations(observation_id),
    linked_at TEXT NOT NULL,
    evidence_sha256 TEXT NOT NULL CHECK(length(evidence_sha256) = 64),
    PRIMARY KEY(issue_id, observation_id)
  ) STRICT`,
  `CREATE TABLE issue_events (
    event_id TEXT PRIMARY KEY,
    issue_id TEXT NOT NULL REFERENCES issue_roots(issue_id),
    run_id TEXT NOT NULL REFERENCES runs(run_id),
    sequence INTEGER NOT NULL CHECK(sequence >= 1),
    event_kind TEXT NOT NULL,
    from_state TEXT,
    to_state TEXT NOT NULL,
    payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
    occurred_at TEXT NOT NULL,
    UNIQUE(issue_id, sequence)
  ) STRICT`,
  `CREATE TABLE issue_edges (
    edge_id TEXT PRIMARY KEY,
    from_issue_id TEXT NOT NULL REFERENCES issue_roots(issue_id),
    to_issue_id TEXT NOT NULL REFERENCES issue_roots(issue_id),
    edge_kind TEXT NOT NULL,
    evidence_sha256 TEXT NOT NULL CHECK(length(evidence_sha256) = 64),
    created_at TEXT NOT NULL,
    CHECK(from_issue_id <> to_issue_id),
    UNIQUE(from_issue_id, to_issue_id, edge_kind)
  ) STRICT`,
  `CREATE TABLE issue_graphs (
    issue_graph_id TEXT NOT NULL,
    version INTEGER NOT NULL CHECK(version >= 1),
    run_id TEXT NOT NULL REFERENCES runs(run_id),
    graph_sha256 TEXT NOT NULL CHECK(length(graph_sha256) = 64),
    graph_json TEXT NOT NULL CHECK(json_valid(graph_json)),
    created_at TEXT NOT NULL,
    PRIMARY KEY(issue_graph_id, version),
    UNIQUE(graph_sha256)
  ) STRICT`,
  `CREATE TABLE plan_snapshots (
    plan_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES runs(run_id),
    issue_graph_id TEXT NOT NULL,
    issue_graph_version INTEGER NOT NULL,
    optimization_json TEXT NOT NULL CHECK(json_valid(optimization_json)),
    plan_sha256 TEXT NOT NULL CHECK(length(plan_sha256) = 64),
    created_at TEXT NOT NULL,
    FOREIGN KEY(issue_graph_id, issue_graph_version) REFERENCES issue_graphs(issue_graph_id, version),
    UNIQUE(plan_sha256)
  ) STRICT`,
  `CREATE TABLE plan_items (
    plan_id TEXT NOT NULL REFERENCES plan_snapshots(plan_id),
    issue_id TEXT NOT NULL REFERENCES issue_roots(issue_id),
    planned_order INTEGER NOT NULL CHECK(planned_order >= 0),
    wave_sequence INTEGER CHECK(wave_sequence IS NULL OR wave_sequence >= 1),
    concurrency_class TEXT NOT NULL CHECK(concurrency_class IN ('Parallelizable', 'Ordered', 'Blocked')),
    classification_json TEXT NOT NULL CHECK(json_valid(classification_json)),
    PRIMARY KEY(plan_id, issue_id)
  ) STRICT`,
  `CREATE TABLE coordination_domains (
    repository_id TEXT NOT NULL REFERENCES repositories(repository_id),
    domain_key TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY(repository_id, domain_key)
  ) STRICT`,
  `CREATE TABLE coordination_domain_events (
    event_id TEXT PRIMARY KEY,
    repository_id TEXT NOT NULL,
    domain_key TEXT NOT NULL,
    version INTEGER NOT NULL CHECK(version >= 0),
    state_sha256 TEXT NOT NULL CHECK(length(state_sha256) = 64),
    event_kind TEXT NOT NULL,
    evidence_sha256 TEXT NOT NULL CHECK(length(evidence_sha256) = 64),
    occurred_at TEXT NOT NULL,
    FOREIGN KEY(repository_id, domain_key) REFERENCES coordination_domains(repository_id, domain_key),
    UNIQUE(repository_id, domain_key, version)
  ) STRICT`,
  `CREATE TABLE leases (
    lease_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES runs(run_id),
    lane_id TEXT NOT NULL,
    owner TEXT NOT NULL,
    worktree TEXT NOT NULL,
    branch TEXT NOT NULL,
    fencing_token INTEGER NOT NULL CHECK(fencing_token >= 1),
    state TEXT NOT NULL CHECK(state IN ('acquired', 'released', 'expired', 'revoked')),
    acquired_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    evidence_sha256 TEXT NOT NULL CHECK(length(evidence_sha256) = 64),
    UNIQUE(run_id, lane_id, fencing_token)
  ) STRICT`,
  `CREATE TABLE operation_events (
    operation_id TEXT NOT NULL,
    sequence INTEGER NOT NULL CHECK(sequence >= 1),
    run_id TEXT NOT NULL REFERENCES runs(run_id),
    manifest_id TEXT NOT NULL,
    manifest_revision INTEGER NOT NULL,
    parent_operation_ids_json TEXT NOT NULL CHECK(json_valid(parent_operation_ids_json)),
    event_kind TEXT NOT NULL,
    before_object_sha256 TEXT NOT NULL CHECK(length(before_object_sha256) = 64),
    after_object_sha256 TEXT CHECK(after_object_sha256 IS NULL OR length(after_object_sha256) = 64),
    payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
    occurred_at TEXT NOT NULL,
    PRIMARY KEY(operation_id, sequence),
    FOREIGN KEY(manifest_id, manifest_revision) REFERENCES manifest_revisions(manifest_id, revision)
  ) STRICT`,
  `CREATE TABLE receipts (
    receipt_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES runs(run_id),
    manifest_id TEXT NOT NULL,
    manifest_revision INTEGER NOT NULL,
    repository_object_sha256 TEXT NOT NULL CHECK(length(repository_object_sha256) = 64),
    receipt_sha256 TEXT NOT NULL CHECK(length(receipt_sha256) = 64),
    receipt_json TEXT NOT NULL CHECK(json_valid(receipt_json)),
    sealed_at TEXT NOT NULL,
    FOREIGN KEY(manifest_id, manifest_revision) REFERENCES manifest_revisions(manifest_id, revision),
    UNIQUE(receipt_sha256)
  ) STRICT`,
  `CREATE TABLE directive_events (
    directive_id TEXT NOT NULL,
    sequence INTEGER NOT NULL CHECK(sequence >= 1),
    run_id TEXT NOT NULL REFERENCES runs(run_id),
    manifest_id TEXT NOT NULL,
    manifest_revision INTEGER NOT NULL,
    from_state TEXT,
    to_state TEXT NOT NULL,
    control_surface_id TEXT,
    event_json TEXT NOT NULL CHECK(json_valid(event_json)),
    occurred_at TEXT NOT NULL,
    PRIMARY KEY(directive_id, sequence),
    FOREIGN KEY(manifest_id, manifest_revision) REFERENCES manifest_revisions(manifest_id, revision)
  ) STRICT`,
  `CREATE TABLE metric_snapshots (
    metric_snapshot_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES runs(run_id),
    repository_object_sha256 TEXT NOT NULL CHECK(length(repository_object_sha256) = 64),
    metric_kind TEXT NOT NULL,
    classifier_version TEXT NOT NULL,
    snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
    snapshot_sha256 TEXT NOT NULL CHECK(length(snapshot_sha256) = 64),
    observed_at TEXT NOT NULL,
    UNIQUE(run_id, metric_kind, classifier_version, repository_object_sha256)
  ) STRICT`,
  `CREATE INDEX issue_events_run_idx ON issue_events(run_id, occurred_at)`,
  `CREATE INDEX directive_events_run_idx ON directive_events(run_id, occurred_at)`,
  `CREATE INDEX observations_run_idx ON observations(run_id, observed_at)`,
  ...appendOnly("evidence_records"),
  ...appendOnly("runs"),
  ...appendOnly("run_events"),
  ...appendOnly("run_interpretations"),
  ...appendOnly("manifest_revisions"),
  ...appendOnly("issue_roots"),
  ...appendOnly("observations"),
  ...appendOnly("issue_observation_links"),
  ...appendOnly("issue_events"),
  ...appendOnly("issue_edges"),
  ...appendOnly("issue_graphs"),
  ...appendOnly("plan_snapshots"),
  ...appendOnly("plan_items"),
  ...appendOnly("coordination_domains"),
  ...appendOnly("coordination_domain_events"),
  ...appendOnly("leases"),
  ...appendOnly("operation_events"),
  ...appendOnly("receipts"),
  ...appendOnly("directive_events"),
  ...appendOnly("metric_snapshots"),
] as const;

const repositoryV2Statements = [
  `CREATE TABLE import_byte_vault (
    content_id TEXT PRIMARY KEY CHECK(length(content_id) = 64),
    byte_length INTEGER NOT NULL CHECK(byte_length >= 0),
    bytes BLOB NOT NULL CHECK(length(bytes) = byte_length),
    local_ref TEXT NOT NULL UNIQUE CHECK(local_ref = 'sqlite:import_byte_vault/' || content_id),
    stored_at TEXT NOT NULL
  ) STRICT`,
  `CREATE TABLE import_census_snapshots (
    census_sha256 TEXT PRIMARY KEY CHECK(length(census_sha256) = 64),
    repository_object_sha256 TEXT NOT NULL CHECK(length(repository_object_sha256) = 64),
    byte_content_id TEXT NOT NULL UNIQUE REFERENCES import_byte_vault(content_id),
    canonical_census_json TEXT NOT NULL CHECK(json_valid(canonical_census_json)),
    stored_at TEXT NOT NULL
  ) STRICT`,
  `CREATE TABLE import_census_entries (
    census_sha256 TEXT NOT NULL REFERENCES import_census_snapshots(census_sha256),
    repository_relative_path TEXT NOT NULL,
    tracking_state TEXT NOT NULL CHECK(tracking_state IN ('tracked', 'ignored')),
    declared_artifact_role TEXT NOT NULL CHECK(declared_artifact_role IN ('machine_contract', 'narrative_observation', 'ignored_quarantine', 'fixture_template')),
    PRIMARY KEY(census_sha256, repository_relative_path)
  ) STRICT`,
  `CREATE TABLE import_observed_history (
    record_sha256 TEXT PRIMARY KEY CHECK(length(record_sha256) = 64),
    semantic_key_sha256 TEXT NOT NULL UNIQUE CHECK(length(semantic_key_sha256) = 64),
    semantic_value_sha256 TEXT NOT NULL CHECK(length(semantic_value_sha256) = 64),
    byte_content_id TEXT NOT NULL REFERENCES import_byte_vault(content_id),
    census_sha256 TEXT NOT NULL REFERENCES import_census_snapshots(census_sha256),
    parser_identity TEXT NOT NULL,
    parser_version TEXT NOT NULL,
    schema_version TEXT NOT NULL,
    subject_repository_object_sha256 TEXT NOT NULL CHECK(length(subject_repository_object_sha256) = 64),
    source_class TEXT NOT NULL,
    disposition TEXT NOT NULL CHECK(disposition IN ('normalized', 'evidence_only')),
    canonical_record_json TEXT NOT NULL CHECK(json_valid(canonical_record_json)),
    admitted_at TEXT NOT NULL
  ) STRICT`,
  `CREATE TABLE import_known_now_history (
    record_sha256 TEXT PRIMARY KEY CHECK(length(record_sha256) = 64),
    observed_record_sha256 TEXT NOT NULL REFERENCES import_observed_history(record_sha256),
    byte_content_id TEXT NOT NULL REFERENCES import_byte_vault(content_id),
    census_sha256 TEXT NOT NULL REFERENCES import_census_snapshots(census_sha256),
    schema_version TEXT NOT NULL,
    subject_repository_object_sha256 TEXT NOT NULL CHECK(length(subject_repository_object_sha256) = 64),
    payment_state TEXT NOT NULL CHECK(payment_state IN ('paid', 'not_paid', 'false_positive', 'unknown')),
    closeout_status TEXT NOT NULL CHECK(closeout_status IN ('claims_closed', 'claims_not_closed', 'no_claim')),
    canonical_record_json TEXT NOT NULL CHECK(json_valid(canonical_record_json)),
    admitted_at TEXT NOT NULL
  ) STRICT`,
  `CREATE TABLE import_quarantine_records (
    quarantine_id TEXT PRIMARY KEY CHECK(length(quarantine_id) = 64),
    byte_content_id TEXT NOT NULL REFERENCES import_byte_vault(content_id),
    census_sha256 TEXT REFERENCES import_census_snapshots(census_sha256),
    source_class TEXT NOT NULL,
    disposition TEXT NOT NULL CHECK(disposition IN ('quarantined', 'rejected')),
    reason TEXT NOT NULL,
    canonical_record_json TEXT CHECK(canonical_record_json IS NULL OR json_valid(canonical_record_json)),
    quarantined_at TEXT NOT NULL
  ) STRICT`,
  `CREATE INDEX import_observed_subject_idx ON import_observed_history(subject_repository_object_sha256, admitted_at)`,
  `CREATE INDEX import_known_now_observed_idx ON import_known_now_history(observed_record_sha256, admitted_at)`,
  ...appendOnly("import_byte_vault"),
  ...appendOnly("import_census_snapshots"),
  ...appendOnly("import_census_entries"),
  ...appendOnly("import_observed_history"),
  ...appendOnly("import_known_now_history"),
  ...appendOnly("import_quarantine_records"),
] as const;

const repositoryV3Statements = [
  `ALTER TABLE runs ADD COLUMN observed_then_sha256 TEXT CHECK(observed_then_sha256 IS NULL OR length(observed_then_sha256) = 64)`,
  `ALTER TABLE run_interpretations ADD COLUMN known_now_sha256 TEXT CHECK(known_now_sha256 IS NULL OR length(known_now_sha256) = 64)`,
  `CREATE TABLE run_components (
    component_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES runs(run_id),
    repository_object_sha256 TEXT NOT NULL CHECK(length(repository_object_sha256) = 64),
    component_kind TEXT NOT NULL CHECK(component_kind IN ('detector_coverage', 'complexity', 'terminal_contract', 'evidence_freshness')),
    schema_version TEXT NOT NULL,
    parser_identity TEXT NOT NULL,
    parser_version TEXT NOT NULL,
    analyzer_identity TEXT,
    analyzer_version TEXT,
    component_sha256 TEXT NOT NULL CHECK(length(component_sha256) = 64),
    canonical_json TEXT NOT NULL CHECK(json_valid(canonical_json)),
    evidence_json TEXT NOT NULL CHECK(json_valid(evidence_json)),
    observed_at TEXT NOT NULL,
    UNIQUE(run_id, repository_object_sha256, component_kind, schema_version)
  ) STRICT`,
  `CREATE TABLE current_run_bindings (
    binding_id TEXT PRIMARY KEY,
    repository_id TEXT NOT NULL REFERENCES repositories(repository_id),
    run_id TEXT NOT NULL REFERENCES runs(run_id),
    repository_object_sha256 TEXT NOT NULL CHECK(length(repository_object_sha256) = 64),
    sequence INTEGER NOT NULL CHECK(sequence >= 1),
    evidence_json TEXT NOT NULL CHECK(json_valid(evidence_json)),
    bound_at TEXT NOT NULL,
    UNIQUE(repository_id, sequence)
  ) STRICT`,
  `CREATE TRIGGER current_run_bindings_monotonic_insert
   BEFORE INSERT ON current_run_bindings
   WHEN NEW.sequence <= COALESCE((SELECT MAX(sequence) FROM current_run_bindings WHERE repository_id = NEW.repository_id), 0)
   BEGIN SELECT RAISE(ABORT, 'current run binding sequence must increase'); END`,
  `CREATE TRIGGER current_run_bindings_repository_match
   BEFORE INSERT ON current_run_bindings
   WHEN NOT EXISTS (SELECT 1 FROM runs WHERE run_id = NEW.run_id AND repository_id = NEW.repository_id)
   BEGIN SELECT RAISE(ABORT, 'current run binding repository does not match run'); END`,
  `CREATE INDEX run_components_lookup_idx ON run_components(run_id, repository_object_sha256, component_kind, observed_at)`,
  `CREATE INDEX current_run_bindings_head_idx ON current_run_bindings(repository_id, sequence DESC)`,
  ...appendOnly("run_components"),
  ...appendOnly("current_run_bindings"),
] as const;

const globalV1Statements = [
  `CREATE TABLE models (
    model_id TEXT PRIMARY KEY,
    family TEXT NOT NULL,
    display_name TEXT NOT NULL,
    context_limit_tokens INTEGER CHECK(context_limit_tokens IS NULL OR context_limit_tokens > 0),
    metadata_json TEXT NOT NULL CHECK(json_valid(metadata_json)),
    observed_at TEXT NOT NULL
  ) STRICT`,
  `CREATE TABLE harnesses (
    harness_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    version TEXT,
    supports_headless INTEGER CHECK(supports_headless IS NULL OR supports_headless IN (0, 1)),
    metadata_json TEXT NOT NULL CHECK(json_valid(metadata_json)),
    observed_at TEXT NOT NULL
  ) STRICT`,
  `CREATE TABLE agent_tuples (
    agent_tuple_id TEXT PRIMARY KEY,
    model_id TEXT NOT NULL REFERENCES models(model_id),
    harness_id TEXT NOT NULL REFERENCES harnesses(harness_id),
    reasoning_level TEXT NOT NULL,
    first_observed_at TEXT NOT NULL,
    UNIQUE(model_id, harness_id, reasoning_level)
  ) STRICT`,
  `CREATE TABLE inference_sources (
    inference_source_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    source_kind TEXT NOT NULL,
    machine_identity TEXT,
    endpoint TEXT,
    secret_ref TEXT,
    metadata_json TEXT NOT NULL CHECK(json_valid(metadata_json)),
    observed_at TEXT NOT NULL
  ) STRICT`,
  `CREATE TABLE deployments (
    deployment_id TEXT PRIMARY KEY,
    model_id TEXT NOT NULL REFERENCES models(model_id),
    inference_source_id TEXT NOT NULL REFERENCES inference_sources(inference_source_id),
    provider_model_id TEXT NOT NULL,
    context_limit_tokens INTEGER CHECK(context_limit_tokens IS NULL OR context_limit_tokens > 0),
    max_concurrency INTEGER CHECK(max_concurrency IS NULL OR max_concurrency > 0),
    metadata_json TEXT NOT NULL CHECK(json_valid(metadata_json)),
    observed_at TEXT NOT NULL,
    UNIQUE(model_id, inference_source_id, provider_model_id)
  ) STRICT`,
  `CREATE TABLE execution_routes (
    execution_route_id TEXT PRIMARY KEY,
    agent_tuple_id TEXT NOT NULL REFERENCES agent_tuples(agent_tuple_id),
    deployment_id TEXT NOT NULL REFERENCES deployments(deployment_id),
    invocation_kind TEXT NOT NULL CHECK(invocation_kind IN ('direct', 'harness', 'local')),
    invocation_adapter TEXT NOT NULL,
    headless_supported INTEGER CHECK(headless_supported IS NULL OR headless_supported IN (0, 1)),
    secret_ref TEXT,
    route_json TEXT NOT NULL CHECK(json_valid(route_json)),
    observed_at TEXT NOT NULL,
    UNIQUE(agent_tuple_id, deployment_id, invocation_adapter)
  ) STRICT`,
  `CREATE TABLE capabilities (
    capability_id TEXT PRIMARY KEY,
    family TEXT NOT NULL,
    label TEXT NOT NULL,
    description TEXT NOT NULL,
    taxonomy_version TEXT NOT NULL
  ) STRICT`,
  `CREATE TABLE capability_evaluators (
    evaluator_id TEXT PRIMARY KEY,
    capability_id TEXT NOT NULL REFERENCES capabilities(capability_id),
    question TEXT NOT NULL,
    evaluator_version TEXT NOT NULL,
    active INTEGER NOT NULL CHECK(active IN (0, 1)),
    UNIQUE(capability_id, evaluator_version, question)
  ) STRICT`,
  `CREATE TABLE agent_identity_observations (
    observation_id TEXT PRIMARY KEY,
    identity_lease_id TEXT NOT NULL,
    phase TEXT NOT NULL CHECK(phase IN ('pre_dispatch', 'pre_evaluation')),
    requested_agent_tuple_id TEXT NOT NULL REFERENCES agent_tuples(agent_tuple_id),
    execution_route_id TEXT NOT NULL REFERENCES execution_routes(execution_route_id),
    observed_model_id TEXT NOT NULL REFERENCES models(model_id),
    observed_harness_id TEXT NOT NULL REFERENCES harnesses(harness_id),
    observed_reasoning_level TEXT NOT NULL,
    evidence_kind TEXT NOT NULL CHECK(evidence_kind IN ('structured_harness_readback', 'trusted_runtime_receipt', 'external_visual_readback')),
    evidence_sha256 TEXT NOT NULL CHECK(length(evidence_sha256) = 64),
    observer_actor_id TEXT NOT NULL,
    control_surface_token TEXT,
    harness_session_token TEXT NOT NULL,
    process_instance_token TEXT NOT NULL,
    intended_surface_label TEXT,
    worker_self_report TEXT,
    observed_at TEXT NOT NULL,
    UNIQUE(identity_lease_id, phase)
  ) STRICT`,
  `CREATE TABLE agent_identity_lease_events (
    event_id TEXT PRIMARY KEY,
    identity_lease_id TEXT NOT NULL,
    requested_agent_tuple_id TEXT NOT NULL REFERENCES agent_tuples(agent_tuple_id),
    execution_route_id TEXT NOT NULL REFERENCES execution_routes(execution_route_id),
    observation_id TEXT REFERENCES agent_identity_observations(observation_id),
    event_kind TEXT NOT NULL CHECK(event_kind IN ('issued', 'pre_dispatch_bound', 'pre_evaluation_bound', 'mismatch', 'invalidated')),
    reason TEXT,
    occurred_at TEXT NOT NULL,
    CHECK(
      (event_kind IN ('pre_dispatch_bound', 'pre_evaluation_bound', 'mismatch') AND observation_id IS NOT NULL)
      OR (event_kind IN ('issued', 'invalidated') AND observation_id IS NULL)
    )
  ) STRICT`,
  `CREATE TABLE agent_run_events (
    run_event_id TEXT PRIMARY KEY,
    source_run_token TEXT NOT NULL,
    repository_cohort_token TEXT NOT NULL,
    agent_tuple_id TEXT NOT NULL REFERENCES agent_tuples(agent_tuple_id),
    execution_route_id TEXT NOT NULL REFERENCES execution_routes(execution_route_id),
    identity_lease_id TEXT NOT NULL,
    capability_id TEXT NOT NULL REFERENCES capabilities(capability_id),
    qualification_at_dispatch TEXT NOT NULL,
    post_clearance_run_ordinal INTEGER CHECK(post_clearance_run_ordinal IS NULL OR post_clearance_run_ordinal >= 1),
    evaluation_required INTEGER NOT NULL CHECK(evaluation_required IN (0, 1)),
    evaluation_reason TEXT NOT NULL,
    operational_telemetry_json TEXT NOT NULL CHECK(json_valid(operational_telemetry_json)),
    occurred_at TEXT NOT NULL,
    UNIQUE(agent_tuple_id, capability_id, source_run_token)
  ) STRICT`,
  `CREATE TABLE trials (
    trial_id TEXT PRIMARY KEY,
    run_event_id TEXT NOT NULL UNIQUE REFERENCES agent_run_events(run_event_id),
    agent_tuple_id TEXT NOT NULL REFERENCES agent_tuples(agent_tuple_id),
    capability_id TEXT NOT NULL REFERENCES capabilities(capability_id),
    repository_cohort_token TEXT NOT NULL,
    verified_success INTEGER NOT NULL CHECK(verified_success IN (0, 1)),
    independent_evaluation INTEGER NOT NULL CHECK(independent_evaluation IN (0, 1)),
    no_harm_violation INTEGER NOT NULL CHECK(no_harm_violation IN (0, 1)),
    authority_violation INTEGER NOT NULL CHECK(authority_violation IN (0, 1)),
    identity_disposition TEXT NOT NULL CHECK(identity_disposition IN ('IDENTITY_UNBOUND', 'MISMATCH', 'INVALIDATED', 'BOUND_FOR_EVALUATION')),
    contributes_quality_credit INTEGER NOT NULL CHECK(contributes_quality_credit IN (0, 1)),
    evaluation_json TEXT NOT NULL CHECK(json_valid(evaluation_json)),
    evidence_sha256 TEXT NOT NULL CHECK(length(evidence_sha256) = 64),
    completed_at TEXT NOT NULL,
    CHECK(contributes_quality_credit = 0 OR identity_disposition = 'BOUND_FOR_EVALUATION')
  ) STRICT`,
  `CREATE TABLE trial_evaluations (
    trial_id TEXT NOT NULL REFERENCES trials(trial_id),
    evaluator_id TEXT NOT NULL REFERENCES capability_evaluators(evaluator_id),
    result INTEGER CHECK(result IS NULL OR result IN (0, 1)),
    evidence_sha256 TEXT NOT NULL CHECK(length(evidence_sha256) = 64),
    PRIMARY KEY(trial_id, evaluator_id)
  ) STRICT`,
  `CREATE TABLE qualification_events (
    event_id TEXT PRIMARY KEY,
    agent_tuple_id TEXT NOT NULL REFERENCES agent_tuples(agent_tuple_id),
    capability_id TEXT NOT NULL REFERENCES capabilities(capability_id),
    event_kind TEXT NOT NULL CHECK(event_kind IN ('no_harm_violation', 'authority_violation', 'violation_resolved', 'explicit_disqualification', 'disqualification_lifted')),
    related_event_id TEXT REFERENCES qualification_events(event_id),
    payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
    occurred_at TEXT NOT NULL,
    CHECK(
      (event_kind IN ('violation_resolved', 'disqualification_lifted') AND related_event_id IS NOT NULL)
      OR (event_kind NOT IN ('violation_resolved', 'disqualification_lifted') AND related_event_id IS NULL)
    )
  ) STRICT`,
  `CREATE TABLE price_schedules (
    price_schedule_id TEXT PRIMARY KEY,
    deployment_id TEXT NOT NULL REFERENCES deployments(deployment_id),
    source_kind TEXT NOT NULL CHECK(source_kind IN ('custom', 'contract', 'local_amortized', 'models_dev')),
    currency TEXT NOT NULL,
    input_per_million REAL,
    output_per_million REAL,
    cache_read_per_million REAL,
    cache_write_per_million REAL,
    reasoning_per_million REAL,
    effective_from TEXT NOT NULL,
    effective_to TEXT,
    evidence_sha256 TEXT CHECK(evidence_sha256 IS NULL OR length(evidence_sha256) = 64)
  ) STRICT`,
  `CREATE TABLE availability_observations (
    observation_id TEXT PRIMARY KEY,
    agent_tuple_id TEXT NOT NULL REFERENCES agent_tuples(agent_tuple_id),
    execution_route_id TEXT NOT NULL REFERENCES execution_routes(execution_route_id),
    availability TEXT NOT NULL,
    control_surface_token TEXT,
    observed_at TEXT NOT NULL
  ) STRICT`,
  `CREATE TABLE telemetry_imports (
    import_id TEXT PRIMARY KEY,
    source_kind TEXT NOT NULL,
    payload_sha256 TEXT NOT NULL CHECK(length(payload_sha256) = 64),
    schema_version TEXT NOT NULL,
    accepted_rows INTEGER NOT NULL CHECK(accepted_rows >= 0),
    rejected_rows INTEGER NOT NULL CHECK(rejected_rows >= 0),
    imported_at TEXT NOT NULL,
    UNIQUE(payload_sha256)
  ) STRICT`,
  `CREATE INDEX agent_run_tuple_capability_idx ON agent_run_events(agent_tuple_id, capability_id, occurred_at)`,
  `CREATE INDEX trials_tuple_capability_idx ON trials(agent_tuple_id, capability_id, completed_at)`,
  `CREATE INDEX identity_lease_events_idx ON agent_identity_lease_events(identity_lease_id, occurred_at)`,
  ...appendOnly("agent_identity_observations"),
  ...appendOnly("agent_identity_lease_events"),
  ...appendOnly("agent_run_events"),
  ...appendOnly("trials"),
  ...appendOnly("trial_evaluations"),
  ...appendOnly("qualification_events"),
  ...appendOnly("price_schedules"),
  ...appendOnly("availability_observations"),
  ...appendOnly("telemetry_imports"),
] as const;

const globalV2Statements = [
  `ALTER TABLE capability_evaluators ADD COLUMN evaluation_dimension TEXT NOT NULL DEFAULT 'verified_success'
    CHECK(evaluation_dimension IN ('verified_success', 'independent_evaluation', 'no_harm', 'authority'))`,
  `ALTER TABLE capability_evaluators ADD COLUMN independent_evaluator INTEGER NOT NULL DEFAULT 0
    CHECK(independent_evaluator IN (0, 1))`,
  `CREATE INDEX agent_run_identity_lease_idx ON agent_run_events(identity_lease_id)`,
  `CREATE TRIGGER trials_credit_admission BEFORE INSERT ON trials
    WHEN NEW.contributes_quality_credit = 1
    BEGIN
      SELECT CASE WHEN NEW.identity_disposition <> 'BOUND_FOR_EVALUATION'
        THEN RAISE(ABORT, 'credited trial requires BOUND_FOR_EVALUATION identity') END;
      SELECT CASE WHEN EXISTS (
        SELECT 1
        FROM agent_run_events run
        JOIN agent_identity_lease_events event ON event.identity_lease_id = run.identity_lease_id
        WHERE run.run_event_id = NEW.run_event_id
          AND event.event_kind IN ('mismatch', 'invalidated')
      ) THEN RAISE(ABORT, 'mismatched or invalidated identity lease cannot receive quality credit') END;
      SELECT CASE WHEN EXISTS (
        SELECT 1
        FROM trials prior
        JOIN agent_run_events prior_run ON prior_run.run_event_id = prior.run_event_id
        JOIN agent_run_events current_run ON current_run.run_event_id = NEW.run_event_id
        WHERE prior.contributes_quality_credit = 1
          AND prior_run.identity_lease_id = current_run.identity_lease_id
      ) THEN RAISE(ABORT, 'identity lease observations cannot be replayed into multiple credited trials') END;
    END`,
] as const;

const globalV3Statements = [
  `CREATE TRIGGER agent_identity_observations_sha256_admission BEFORE INSERT ON agent_identity_observations
    WHEN length(NEW.evidence_sha256) <> 64 OR NEW.evidence_sha256 GLOB '*[^0-9a-f]*'
    BEGIN
      SELECT RAISE(ABORT, 'identity observation evidence_sha256 must be canonical lowercase SHA-256');
    END`,
  `CREATE TRIGGER trial_evaluations_sha256_admission BEFORE INSERT ON trial_evaluations
    WHEN length(NEW.evidence_sha256) <> 64 OR NEW.evidence_sha256 GLOB '*[^0-9a-f]*'
    BEGIN
      SELECT RAISE(ABORT, 'trial evaluation evidence_sha256 must be canonical lowercase SHA-256');
    END`,
] as const;

const globalV4Statements = [
  `ALTER TABLE trials ADD COLUMN worker_actor_id TEXT`,
  `ALTER TABLE trials ADD COLUMN author_actor_id TEXT`,
  `ALTER TABLE trial_evaluations ADD COLUMN evaluator_actor_id TEXT`,
  `CREATE TABLE agent_evaluation_evidence (
    evidence_sha256 TEXT PRIMARY KEY CHECK(length(evidence_sha256) = 64 AND evidence_sha256 NOT GLOB '*[^0-9a-f]*'),
    media_type TEXT NOT NULL,
    evidence_bytes BLOB NOT NULL,
    byte_length INTEGER NOT NULL CHECK(byte_length >= 0 AND byte_length = length(evidence_bytes)),
    retained_at TEXT NOT NULL
  ) STRICT`,
  ...appendOnly("agent_evaluation_evidence"),
  `CREATE TRIGGER trials_actor_admission BEFORE INSERT ON trials
    WHEN NEW.worker_actor_id IS NOT NULL OR NEW.author_actor_id IS NOT NULL
    BEGIN
      SELECT CASE WHEN NEW.worker_actor_id IS NULL OR length(trim(NEW.worker_actor_id)) = 0
        THEN RAISE(ABORT, 'trial worker_actor_id must be a non-empty actor identity') END;
      SELECT CASE WHEN NEW.author_actor_id IS NULL OR length(trim(NEW.author_actor_id)) = 0
        THEN RAISE(ABORT, 'trial author_actor_id must be a non-empty actor identity') END;
    END`,
  `CREATE TRIGGER trial_evaluations_actor_admission BEFORE INSERT ON trial_evaluations
    WHEN NEW.evaluator_actor_id IS NOT NULL AND length(trim(NEW.evaluator_actor_id)) = 0
    BEGIN
      SELECT RAISE(ABORT, 'trial evaluator_actor_id must be a non-empty actor identity');
    END`,
] as const;

const globalV5Statements = [
  `CREATE TABLE agent_execution_profiles (
    profile_id TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK(revision >= 1),
    agent_tuple_id TEXT NOT NULL REFERENCES agent_tuples(agent_tuple_id),
    profile_sha256 TEXT NOT NULL CHECK(length(profile_sha256) = 64 AND profile_sha256 NOT GLOB '*[^0-9a-f]*'),
    canonical_profile_json TEXT NOT NULL CHECK(json_valid(canonical_profile_json)),
    captured_at TEXT NOT NULL,
    PRIMARY KEY(profile_id, revision),
    UNIQUE(profile_sha256)
  ) STRICT`,
  `CREATE TABLE execution_treatments (
    treatment_id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    profile_revision INTEGER NOT NULL,
    run_event_id TEXT NOT NULL UNIQUE REFERENCES agent_run_events(run_event_id),
    repository_cohort_token TEXT NOT NULL,
    capability_id TEXT NOT NULL REFERENCES capabilities(capability_id),
    treatment_sha256 TEXT NOT NULL CHECK(length(treatment_sha256) = 64 AND treatment_sha256 NOT GLOB '*[^0-9a-f]*'),
    canonical_treatment_json TEXT NOT NULL CHECK(json_valid(canonical_treatment_json)),
    started_at TEXT NOT NULL,
    completed_at TEXT,
    FOREIGN KEY(profile_id, profile_revision) REFERENCES agent_execution_profiles(profile_id, revision),
    UNIQUE(treatment_sha256)
  ) STRICT`,
  `CREATE INDEX execution_treatments_profile_idx ON execution_treatments(profile_id, profile_revision, started_at)`,
  ...appendOnly("agent_execution_profiles"),
  ...appendOnly("execution_treatments"),
] as const;

/**
 * A cohort token is a scheduling label, not evidence that two trials came
 * from different repositories.  Keep legacy rows readable but require this
 * additive physical checkout binding before a new trial can count. Distinct
 * logical-project qualification remains deliberately unresolved until an
 * evidence-backed local registration/alias policy is added.
 */
const globalV6Statements = [
  `CREATE TABLE local_repository_identities (
    repository_id TEXT PRIMARY KEY,
    canonical_git_common_directory TEXT NOT NULL UNIQUE,
    identity_evidence_sha256 TEXT NOT NULL REFERENCES agent_evaluation_evidence(evidence_sha256),
    first_observed_at TEXT NOT NULL
  ) STRICT`,
  `ALTER TABLE agent_run_events ADD COLUMN repository_id TEXT REFERENCES local_repository_identities(repository_id)`,
  `ALTER TABLE agent_run_events ADD COLUMN repository_identity_evidence_sha256 TEXT REFERENCES agent_evaluation_evidence(evidence_sha256)`,
  `ALTER TABLE trials ADD COLUMN repository_id TEXT REFERENCES local_repository_identities(repository_id)`,
  `CREATE INDEX agent_run_repository_identity_idx ON agent_run_events(repository_id)`,
  `CREATE INDEX trials_repository_identity_idx ON trials(repository_id)`,
] as const;

const globalV7Statements = [
  `CREATE TABLE logical_projects (
    logical_project_id TEXT PRIMARY KEY,
    operator_actor_id TEXT NOT NULL,
    registration_evidence_sha256 TEXT NOT NULL REFERENCES agent_evaluation_evidence(evidence_sha256),
    registered_at TEXT NOT NULL
  ) STRICT`,
  `CREATE TABLE logical_project_repository_aliases (
    repository_id TEXT PRIMARY KEY REFERENCES local_repository_identities(repository_id),
    logical_project_id TEXT NOT NULL REFERENCES logical_projects(logical_project_id),
    operator_actor_id TEXT NOT NULL,
    attestation_evidence_sha256 TEXT NOT NULL REFERENCES agent_evaluation_evidence(evidence_sha256),
    attested_at TEXT NOT NULL
  ) STRICT`,
  `CREATE INDEX logical_project_alias_project_idx ON logical_project_repository_aliases(logical_project_id)`,
  ...appendOnly("logical_projects"),
  ...appendOnly("logical_project_repository_aliases"),
] as const;

/** Actual CLI invocations are imported without a profile, tuple, route, or
 * outcome. A later evaluator may bind one-or-more imported invocations to one
 * trial, but a journal receipt can never be reused for a second trial. */
const globalV8Statements = [
  `CREATE TABLE local_mister_clean_invocations (
    invocation_id TEXT PRIMARY KEY,
    command TEXT NOT NULL,
    argv_sha256 TEXT NOT NULL CHECK(length(argv_sha256) = 64 AND argv_sha256 NOT GLOB '*[^0-9a-f]*'),
    observed_at TEXT NOT NULL,
    identity_provenance TEXT NOT NULL CHECK(identity_provenance = 'UNOBSERVED'),
    receipt_sha256 TEXT NOT NULL CHECK(length(receipt_sha256) = 64 AND receipt_sha256 NOT GLOB '*[^0-9a-f]*'),
    journal_path_sha256 TEXT NOT NULL CHECK(length(journal_path_sha256) = 64 AND journal_path_sha256 NOT GLOB '*[^0-9a-f]*'),
    imported_at TEXT NOT NULL
  ) STRICT`,
  `CREATE TABLE evaluation_run_invocations (
    invocation_id TEXT PRIMARY KEY REFERENCES local_mister_clean_invocations(invocation_id),
    run_event_id TEXT NOT NULL REFERENCES agent_run_events(run_event_id),
    linked_at TEXT NOT NULL,
    UNIQUE(run_event_id, invocation_id)
  ) STRICT`,
  `CREATE INDEX evaluation_run_invocations_run_idx ON evaluation_run_invocations(run_event_id)`,
  ...appendOnly("local_mister_clean_invocations"),
  ...appendOnly("evaluation_run_invocations"),
  `ALTER TABLE agent_run_events ADD COLUMN identity_receipt_trusted INTEGER NOT NULL DEFAULT 0
    CHECK(identity_receipt_trusted IN (0, 1))`,
  `CREATE TRIGGER trials_trusted_identity_receipt_admission BEFORE INSERT ON trials
    WHEN NEW.contributes_quality_credit = 1
    BEGIN
      SELECT CASE WHEN (SELECT identity_receipt_trusted FROM agent_run_events WHERE run_event_id = NEW.run_event_id) <> 1
        THEN RAISE(ABORT, 'credited trial requires runtime-verified identity receipt custody') END;
    END`,
  `CREATE TABLE evaluation_identity_receipt_verifications (
    run_event_id TEXT NOT NULL REFERENCES agent_run_events(run_event_id),
    phase TEXT NOT NULL CHECK(phase IN ('pre_dispatch', 'pre_evaluation')),
    receipt_sha256 TEXT NOT NULL CHECK(length(receipt_sha256) = 64 AND receipt_sha256 NOT GLOB '*[^0-9a-f]*'),
    observer_actor_id TEXT NOT NULL,
    verified_at TEXT NOT NULL,
    PRIMARY KEY(run_event_id, phase)
  ) STRICT`,
  ...appendOnly("evaluation_identity_receipt_verifications"),
  `CREATE TRIGGER trials_public_receipt_pair_admission BEFORE INSERT ON trials
    WHEN NEW.contributes_quality_credit = 1
    BEGIN
      SELECT CASE WHEN (SELECT COUNT(*) FROM evaluation_identity_receipt_verifications WHERE run_event_id = NEW.run_event_id) <> 2
        THEN RAISE(ABORT, 'credited public trial requires pre-dispatch and pre-evaluation verified receipt custody') END;
    END`,
] as const;

/** Route-specific targets and task evidence are appended separately so the
 * original identity observation remains immutable. Existing custody rows are
 * conservatively classified as requested-only and cannot receive new credit. */
const globalV9Statements = [
  `ALTER TABLE evaluation_identity_receipt_verifications ADD COLUMN identity_assurance TEXT NOT NULL DEFAULT 'requested_configuration'
    CHECK(identity_assurance IN ('requested_configuration', 'active_harness_selection', 'provider_execution_attested'))`,
  `CREATE TABLE agent_identity_observation_targets (
    observation_id TEXT PRIMARY KEY REFERENCES agent_identity_observations(observation_id),
    target_kind TEXT NOT NULL CHECK(target_kind IN ('cmux', 'desktop', 'headless')),
    target_sha256 TEXT NOT NULL CHECK(length(target_sha256) = 64 AND target_sha256 NOT GLOB '*[^0-9a-f]*'),
    canonical_target_json TEXT NOT NULL CHECK(json_valid(canonical_target_json)),
    recorded_at TEXT NOT NULL
  ) STRICT`,
  `CREATE TABLE evaluation_dispatch_subjects (
    run_event_id TEXT PRIMARY KEY REFERENCES agent_run_events(run_event_id),
    dispatch_scope_evidence_sha256 TEXT NOT NULL REFERENCES agent_evaluation_evidence(evidence_sha256),
    subject_repository_object_sha256 TEXT NOT NULL CHECK(length(subject_repository_object_sha256) = 64 AND subject_repository_object_sha256 NOT GLOB '*[^0-9a-f]*'),
    recorded_at TEXT NOT NULL
  ) STRICT`,
  `CREATE TABLE evaluation_evaluated_candidates (
    run_event_id TEXT PRIMARY KEY REFERENCES agent_run_events(run_event_id),
    transition_scope_evidence_sha256 TEXT NOT NULL REFERENCES agent_evaluation_evidence(evidence_sha256),
    evaluated_repository_object_sha256 TEXT NOT NULL CHECK(length(evaluated_repository_object_sha256) = 64 AND evaluated_repository_object_sha256 NOT GLOB '*[^0-9a-f]*'),
    recorded_at TEXT NOT NULL
  ) STRICT`,
  ...appendOnly("agent_identity_observation_targets"),
  ...appendOnly("evaluation_dispatch_subjects"),
  ...appendOnly("evaluation_evaluated_candidates"),
  `CREATE TRIGGER trials_active_identity_assurance_admission BEFORE INSERT ON trials
    WHEN NEW.contributes_quality_credit = 1
    BEGIN
      SELECT CASE WHEN (SELECT COUNT(*) FROM evaluation_identity_receipt_verifications
        WHERE run_event_id = NEW.run_event_id
          AND identity_assurance IN ('active_harness_selection', 'provider_execution_attested')) <> 2
        THEN RAISE(ABORT, 'credited trial requires active-or-provider identity assurance at both phases') END;
      SELECT CASE WHEN (SELECT COUNT(*) FROM agent_identity_observation_targets target
        JOIN agent_identity_observations observation ON observation.observation_id = target.observation_id
        JOIN agent_run_events run ON run.identity_lease_id = observation.identity_lease_id
        WHERE run.run_event_id = NEW.run_event_id) <> 2
        THEN RAISE(ABORT, 'credited trial requires two route-specific identity targets') END;
      SELECT CASE WHEN (SELECT COUNT(*) FROM evaluation_dispatch_subjects WHERE run_event_id = NEW.run_event_id) <> 1
        OR (SELECT COUNT(*) FROM evaluation_evaluated_candidates WHERE run_event_id = NEW.run_event_id) <> 1
        THEN RAISE(ABORT, 'credited trial requires dispatch subject and evaluated candidate evidence') END;
    END`,
] as const;

/** A route-declared tool target is separate from the harness launch CWD. When
 * one is observed, bind its Git top-level to the run's exact authorized
 * checkout, not merely to a shared linked-worktree common directory. */
const globalV10Statements = [
  `ALTER TABLE agent_identity_observation_targets ADD COLUMN local_target_binding TEXT NOT NULL DEFAULT 'not_declared'
    CHECK(local_target_binding IN ('not_declared', 'bound_authorized_checkout'))`,
  `ALTER TABLE agent_identity_observation_targets ADD COLUMN target_git_evidence_sha256 TEXT REFERENCES agent_evaluation_evidence(evidence_sha256)`,
  `ALTER TABLE agent_identity_observation_targets ADD COLUMN canonical_tool_target_root TEXT`,
  `ALTER TABLE agent_identity_observation_targets ADD COLUMN canonical_command_cwd TEXT`,
  `ALTER TABLE agent_identity_observation_targets ADD COLUMN canonical_git_top_level TEXT`,
  `ALTER TABLE agent_identity_observation_targets ADD COLUMN canonical_git_common_directory TEXT`,
  `CREATE TRIGGER trials_local_target_checkout_admission BEFORE INSERT ON trials
    WHEN NEW.contributes_quality_credit = 1
    BEGIN
      SELECT CASE WHEN (
        SELECT COUNT(*)
        FROM agent_identity_observation_targets target
        JOIN agent_identity_observations observation ON observation.observation_id = target.observation_id
        JOIN agent_run_events run ON run.identity_lease_id = observation.identity_lease_id
        JOIN agent_evaluation_evidence repository_evidence ON repository_evidence.evidence_sha256 = run.repository_identity_evidence_sha256
        WHERE run.run_event_id = NEW.run_event_id
          AND target.local_target_binding = 'bound_authorized_checkout'
          AND target.target_git_evidence_sha256 IS NOT NULL
          AND target.canonical_git_top_level = json_extract(CAST(repository_evidence.evidence_bytes AS TEXT), '$.canonical_local_repository_root')
          AND target.canonical_git_common_directory = json_extract(CAST(repository_evidence.evidence_bytes AS TEXT), '$.canonical_git_common_directory')
      ) <> 2
        THEN RAISE(ABORT, 'credited trial requires each declared tool target to bind the authorized local Git checkout') END;
    END`,
] as const;

export const REPOSITORY_MIGRATIONS: readonly SqliteMigration[] = Object.freeze([{
  version: 1,
  description: "immutable repository runs, issues, plans, manifests, directives, receipts, and metrics",
  statements: repositoryV1Statements,
}, {
  version: 2,
  description: "content-addressed import bytes, verified census snapshots, authoritative history, and quarantine",
  statements: repositoryV2Statements,
}, {
  version: 3,
  description: "typed run evidence components and append-only current run bindings",
  statements: repositoryV3Statements,
}]);

export const GLOBAL_MIGRATIONS: readonly SqliteMigration[] = Object.freeze([{
  version: 1,
  description: "machine-local agent inventory, routes, evaluations, sampling, pricing, and telemetry",
  statements: globalV1Statements,
}, {
  version: 2,
  description: "evidence-derived evaluator credit and non-replayable identity leases",
  statements: globalV2Statements,
}, {
  version: 3,
  description: "canonical lowercase SHA-256 admission for identity and evaluator evidence",
  statements: globalV3Statements,
}, {
  version: 4,
  description: "actor-separated qualification and retained content-addressed evaluation evidence",
  statements: globalV4Statements,
}, {
  version: 5,
  description: "portable agent execution profiles and immutable evaluated treatments",
  statements: globalV5Statements,
}, {
  version: 6,
  description: "machine-local repository identity provenance for distinct-repository qualification",
  statements: globalV6Statements,
}, {
  version: 7,
  description: "immutable operator-attested logical-project aliases for physical local checkouts",
  statements: globalV7Statements,
}, {
  version: 8,
  description: "canonical invocation import, one-trial binding, and runtime-configured identity receipt custody credit gate",
  statements: globalV8Statements,
}, {
  version: 9,
  description: "route-aware identity targets, authority-assigned assurance, and separate task-subject/evaluated-candidate custody",
  statements: globalV9Statements,
}, {
  version: 10,
  description: "route-declared target Git checkout binding for credited identity receipts",
  statements: globalV10Statements,
}]);

export function migrationsFor(kind: ControlPlaneStoreKind): readonly SqliteMigration[] {
  return kind === "repository" ? REPOSITORY_MIGRATIONS : GLOBAL_MIGRATIONS;
}
