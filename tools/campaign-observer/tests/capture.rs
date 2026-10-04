use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::Command;

struct Fixture(PathBuf);
static NEXT_FIXTURE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
impl Fixture {
    fn new() -> Self {
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let ordinal = NEXT_FIXTURE.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!(
            "mc-observer-fixture-{}-{nonce}-{ordinal}",
            std::process::id()
        ));
        fs::create_dir(&path).unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o700)).unwrap();
        Self(path)
    }
    fn file(&self, name: &str, bytes: &[u8]) -> PathBuf {
        let path = self.0.join(name);
        fs::write(&path, bytes).unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o600)).unwrap();
        path
    }
    fn dir(&self, name: &str) -> PathBuf {
        let path = self.0.join(name);
        fs::create_dir(&path).unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o700)).unwrap();
        path
    }
    fn run(&self, config: &Value, response: &Value) -> Value {
        let config = self.file("config.json", &serde_json::to_vec(config).unwrap());
        let gh = self.file("gh", b"#!/bin/sh\nprintf '%s\\n' \"$FIXTURE_RESPONSE\"\n");
        fs::set_permissions(&gh, fs::Permissions::from_mode(0o700)).unwrap();
        let output = Command::new(env!("CARGO_BIN_EXE_mister-clean-campaign-observer"))
            .arg("collect")
            .arg(config)
            .env(
                "PATH",
                format!("{}:{}", self.0.display(), std::env::var("PATH").unwrap()),
            )
            .env("FIXTURE_RESPONSE", response.to_string())
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        serde_json::from_slice(&output.stdout).unwrap()
    }
    fn events(state: &Path) -> Vec<Value> {
        fs::read_to_string(state.join("campaign-observations.jsonl"))
            .unwrap()
            .lines()
            .map(|s| serde_json::from_str(s).unwrap())
            .collect()
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[test]
fn foreign_receipt_rejects_capture_before_existing_journal_is_replaced() {
    let f = Fixture::new();
    let sessions = f.dir("sessions");
    let state = f.dir("campaign-test");
    fs::write(sessions.join("root.jsonl"), format!("{}\n{}\n",
        json!({"type":"session_meta","timestamp":"2026-10-03T06:00:00Z","payload":{"id":"root"}}),
        json!({"type":"event_msg","timestamp":"2026-10-03T06:01:00Z","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":2,"output_tokens":1}}}})
    )).unwrap();
    let mut config = json!({"campaign_id":"fixture","root_session_id":"root","session_dir":sessions,"state_dir":state,"cutoff":"2026-10-03T05:00:00Z","forge_prs":[]});
    f.run(&config, &Value::Null);
    let original = fs::read(state.join("campaign-observations.jsonl")).unwrap();
    config["campaign_id"] = json!("foreign");
    let path = f.file("foreign-config.json", &serde_json::to_vec(&config).unwrap());
    let output = Command::new(env!("CARGO_BIN_EXE_mister-clean-campaign-observer"))
        .arg("collect")
        .arg(path)
        .output()
        .unwrap();
    assert!(!output.status.success());
    assert!(String::from_utf8_lossy(&output.stderr).contains("different campaign"));
    assert_eq!(
        fs::read(state.join("campaign-observations.jsonl")).unwrap(),
        original
    );
}

#[test]
fn every_summary_aggregate_filters_a_mixed_campaign_database() {
    let f = Fixture::new();
    let path = f.0.join("global.sqlite");
    let db = rusqlite::Connection::open(&path).unwrap();
    db.execute_batch(
        "CREATE TABLE campaign_execution_observations (
        campaign_id TEXT, event_kind TEXT, activity TEXT, model_id TEXT, metrics_json TEXT,
        session_id TEXT, tool_name TEXT, project TEXT, slice TEXT, candidate_revision TEXT,
        integrated_revision TEXT, observed_at TEXT);",
    )
    .unwrap();
    for (campaign, n) in [("chosen", 7), ("foreign", 9000)] {
        for kind in [
            "token_usage",
            "tool_result",
            "tool_payload_measurement",
            "merge",
        ] {
            let metrics = json!({"delta_input_tokens":n,"delta_cached_input_tokens":n,"delta_output_tokens":n,
                "tool_envelope_latency_ms":n,"result_bytes":n,"result_text_bytes":n,"reported_exit_statuses":n,
                "reported_failed_exits":n,"unmeasured_payloads":n,"counter_resets":n});
            db.execute("INSERT INTO campaign_execution_observations VALUES (?,?, 'test',?, ?, ?, ?, ?,NULL,?,?, '2026-10-03T00:00:00Z')",
                rusqlite::params![campaign,kind,campaign,metrics.to_string(),campaign,campaign,campaign,campaign,campaign]).unwrap();
        }
    }
    drop(db);
    let before = fs::read(&path).unwrap();
    let output = Command::new(env!("CARGO_BIN_EXE_mister-clean-campaign-observer"))
        .args(["summary", path.to_str().unwrap(), "chosen"])
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let value: Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(value["campaign_id"], "chosen");
    assert_eq!(value["totals"]["observations"], 4);
    assert_eq!(value["totals"]["sessions"], 1);
    for metric in [
        "input_tokens",
        "cached_input_tokens",
        "output_tokens",
        "counter_resets",
    ] {
        assert_eq!(value["totals"][metric], 28);
    }
    assert_eq!(value["rows"].as_array().unwrap().len(), 4);
    assert!(value["rows"]
        .as_array()
        .unwrap()
        .iter()
        .all(|r| r["model"] == "chosen" && r["input_tokens"] == 7));
    assert_eq!(value["tools"].as_array().unwrap().len(), 1);
    assert_eq!(value["tools"][0]["tool_name"], "chosen");
    assert_eq!(value["tools"][0]["total_envelope_latency_ms"], 7);
    for metric in [
        "result_text_bytes",
        "reported_exit_statuses",
        "reported_failed_exits",
        "unmeasured_payloads",
    ] {
        assert_eq!(value["payload_measurements"][metric], 7);
    }
    assert_eq!(value["merges"].as_array().unwrap().len(), 1);
    assert_eq!(value["merges"][0]["project"], "chosen");
    assert_eq!(fs::read(path).unwrap(), before);
}

#[test]
fn journal_beyond_intake_ceiling_imports_as_bounded_digest_batches_and_replays() {
    let f = Fixture::new();
    let sessions = f.dir("sessions");
    let state = f.dir("campaign-large");
    let receipts = state.join("observation-receipts");
    fs::create_dir(&receipts).unwrap();
    fs::set_permissions(&receipts, fs::Permissions::from_mode(0o700)).unwrap();
    let source = f.file("source.json", b"fixture");
    const ROWS: usize = 11_000;
    for index in 0..ROWS {
        let mut event = json!({"schema_version":"1.0","campaign_id":"fixture","project":"p".repeat(1000),"slice":null,
            "activity":"test","event_kind":"token_usage","tool_name":null,"timestamp":"2026-10-03T06:01:00Z",
            "session_id":"fixture-session","model_id":null,"reasoning":null,"requested_model_id":null,"requested_reasoning":null,
            "candidate_revision":null,"integrated_revision":null,"metrics":{"delta_input_tokens":1,"fixture_index":index},
            "source":{"path":source,"line":null,"record_sha256":format!("{:x}",Sha256::digest(b"fixture"))}});
        let digest = format!("{:x}", Sha256::digest(serde_json::to_vec(&event).unwrap()));
        event["observation_id"] = json!(format!("obs:{digest}"));
        let path = receipts.join(format!("{digest}.json"));
        fs::write(&path, serde_json::to_vec(&event).unwrap()).unwrap();
        fs::set_permissions(path, fs::Permissions::from_mode(0o600)).unwrap();
    }
    let intake = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .parent()
        .unwrap();
    let config = f.file("config.json", &serde_json::to_vec(&json!({"campaign_id":"fixture","root_session_id":"none",
        "session_dir":sessions,"state_dir":state,"cutoff":"2026-10-03T05:00:00Z","forge_prs":[],"intake_worktree":intake})).unwrap());
    for expected in [
        json!({"imported":ROWS,"replayed":0}),
        json!({"imported":0,"replayed":ROWS}),
    ] {
        let output = Command::new(env!("CARGO_BIN_EXE_mister-clean-campaign-observer"))
            .arg("checkpoint")
            .arg(&config)
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        let result: Value = serde_json::from_slice(&output.stdout).unwrap();
        assert_eq!(result["import"], expected);
        assert_eq!(result["summary"]["totals"]["observations"], ROWS);
        assert_eq!(result["summary"]["totals"]["input_tokens"], ROWS);
        assert!(
            fs::metadata(state.join("campaign-observations.jsonl"))
                .unwrap()
                .len()
                > 16 * 1024 * 1024
        );
        let batches = result["collection"]["import_batches"].as_array().unwrap();
        assert!(batches.len() >= 3);
        for batch in batches {
            let path = Path::new(batch.as_str().unwrap());
            let bytes = fs::read(path).unwrap();
            assert!(bytes.len() <= 8 * 1024 * 1024);
            assert_eq!(
                path.file_name().unwrap().to_str().unwrap(),
                format!("{:x}.jsonl", Sha256::digest(&bytes))
            );
        }
    }
}

#[test]
fn empty_checkpoint_then_real_authoritative_import_and_replay() {
    let f = Fixture::new();
    let sessions = f.dir("sessions");
    let state = f.dir("campaign-test");
    let intake = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .parent()
        .unwrap();
    let config = f.file(
        "config.json",
        &serde_json::to_vec(&json!({
            "campaign_id":"fixture", "root_session_id":"root", "cutoff":"2026-10-03T05:00:00Z",
            "session_dir":sessions, "state_dir":state, "forge_prs":[], "intake_worktree":intake
        }))
        .unwrap(),
    );
    let checkpoint = || {
        let output = Command::new(env!("CARGO_BIN_EXE_mister-clean-campaign-observer"))
            .arg("checkpoint")
            .arg(&config)
            .output()
            .unwrap();
        if !output.status.success() {
            let importer = Command::new("bun")
                .arg("scripts/reconcile_campaign_invocations.ts")
                .arg(&state)
                .arg("fixture")
                .current_dir(intake)
                .output()
                .unwrap();
            panic!(
                "{}\nfixture importer: {}",
                String::from_utf8_lossy(&output.stderr),
                String::from_utf8_lossy(&importer.stderr)
            );
        }
        serde_json::from_slice::<Value>(&output.stdout).unwrap()
    };
    for _ in 0..2 {
        let empty = checkpoint();
        assert_eq!(empty["import"], json!({"imported":0,"replayed":0}));
        assert_eq!(
            empty["summary"]["totals"],
            json!({"observations":0,"input_tokens":0,"cached_input_tokens":0,"output_tokens":0,"counter_resets":0,"sessions":0})
        );
        assert!(empty["summary"]["cache_percentage"].is_null());
        assert_eq!(empty["summary"]["quality_credit"], false);
    }
    let source = format!(
        "{}\n{}\n",
        json!({"type":"session_meta","timestamp":"2026-10-03T06:00:00Z","payload":{"id":"root"}}),
        json!({"type":"event_msg","timestamp":"2026-10-03T06:01:00Z","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":2,"output_tokens":1}}}})
    );
    fs::write(sessions.join("root.jsonl"), source).unwrap();
    let first = checkpoint();
    assert_eq!(first["import"], json!({"imported":1,"replayed":0}));
    assert_eq!(first["summary"]["totals"]["input_tokens"], 2);
    let replay = checkpoint();
    assert_eq!(replay["import"], json!({"imported":0,"replayed":1}));
    assert_eq!(replay["summary"]["totals"]["observations"], 1);
    let database = rusqlite::Connection::open_with_flags(
        state.join("global.sqlite"),
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
    )
    .unwrap();
    assert_eq!(
        database
            .query_row("SELECT COUNT(*) FROM trials", [], |row| row
                .get::<_, i64>(0))
            .unwrap(),
        0
    );
}

#[test]
fn offset_timestamps_and_crlf_checkpoint_match_authoritative_intake() {
    let intake = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .parent()
        .unwrap();
    for (timestamp, ending) in [
        ("2026-10-03T06:01:00+00:00", "\n"),
        ("2026-10-03T06:01:00Z", "\r\n"),
        ("2026-10-03T08:01:00.123+02:00", "\r\n"),
        ("2026-10-03T06:01:00.10Z", "\n"),
        ("2026-10-03T06:01:00.123456789Z", "\r\n"),
    ] {
        let f = Fixture::new();
        let sessions = f.dir("sessions");
        let state = f.dir("campaign-test");
        let config = f.file(
            "config.json",
            &serde_json::to_vec(&json!({
                "campaign_id":"fixture", "root_session_id":"root", "cutoff":"2026-10-03T05:00:00Z",
                "session_dir":sessions, "state_dir":state, "forge_prs":[], "intake_worktree":intake
            }))
            .unwrap(),
        );
        let token = json!({"type":"event_msg","timestamp":timestamp,"payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":19,"output_tokens":1}}}});
        let source = format!(
            "{}{ending}{token}{ending}",
            json!({"type":"session_meta","timestamp":"2026-10-03T06:00:00Z","payload":{"id":"root"}})
        );
        fs::write(sessions.join("root.jsonl"), &source).unwrap();
        for expected in [
            json!({"imported":1,"replayed":0}),
            json!({"imported":0,"replayed":1}),
        ] {
            let output = Command::new(env!("CARGO_BIN_EXE_mister-clean-campaign-observer"))
                .arg("checkpoint")
                .arg(&config)
                .output()
                .unwrap();
            assert!(
                output.status.success(),
                "{}",
                String::from_utf8_lossy(&output.stderr)
            );
            let result: Value = serde_json::from_slice(&output.stdout).unwrap();
            assert_eq!(result["import"], expected);
            assert_eq!(result["summary"]["totals"]["input_tokens"], 19);
        }
        let events = Fixture::events(&state);
        assert_eq!(events.len(), 1);
        assert!(events[0]["timestamp"].as_str().unwrap().ends_with('Z'));
        use sha2::{Digest, Sha256};
        let original_line = source.split('\n').nth(1).unwrap();
        assert_eq!(
            events[0]["source"]["record_sha256"],
            format!("{:x}", Sha256::digest(original_line.as_bytes()))
        );
        let database = rusqlite::Connection::open_with_flags(
            state.join("global.sqlite"),
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
        )
        .unwrap();
        assert_eq!(
            database
                .query_row("SELECT COUNT(*) FROM trials", [], |row| row
                    .get::<_, i64>(0))
                .unwrap(),
            0
        );
    }
}

#[test]
fn cutoff_and_session_creation_compare_full_timestamp_precision() {
    let boundary = "2026-10-03T05:00:00.123999999Z";
    let earlier = "2026-10-03T05:00:00Z";
    for (cutoff, created) in [(boundary, earlier), (earlier, boundary)] {
        let f = Fixture::new();
        let sessions = f.dir("sessions");
        let state = f.dir("campaign-test");
        let token = |timestamp: &str, count: u64| json!({"type":"event_msg","timestamp":timestamp,"payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":count,"output_tokens":0}}}});
        let records = [
            json!({"type":"session_meta","timestamp":created,"payload":{"id":"root"}}),
            token("2026-10-03T05:00:00.123999998Z", 100),
            token(boundary, 101),
            token("2026-10-03T05:00:00.124000000Z", 102),
        ]
        .iter()
        .map(|record| format!("{record}\n"))
        .collect::<String>();
        fs::write(sessions.join("root.jsonl"), records).unwrap();
        let config = json!({"campaign_id":"fixture","root_session_id":"root","cutoff":cutoff,"session_dir":sessions,"state_dir":state,"forge_prs":[]});
        assert_eq!(f.run(&config, &json!({}))["observations"], 2);
        assert_eq!(f.run(&config, &json!({}))["observations"], 2);
        let events = Fixture::events(&state);
        assert_eq!(
            events
                .iter()
                .map(|event| event["metrics"]["delta_input_tokens"].as_u64().unwrap())
                .sum::<u64>(),
            2
        );
        assert!(events
            .iter()
            .all(|event| event["timestamp"] != "2026-10-03T05:00:00.123999998Z"));
    }
}

#[test]
fn importer_failure_preserves_private_diagnostics_without_console_leak() {
    let f = Fixture::new();
    let sessions = f.dir("sessions");
    let state = f.dir("campaign-test");
    let intake = f.dir("intake");
    let scripts = intake.join("scripts");
    fs::create_dir(&scripts).unwrap();
    let diagnostic = "SYNTHETIC_IMPORTER_DIAGNOSTIC_SENTINEL";
    fs::write(
        scripts.join("reconcile_campaign_invocations.ts"),
        format!("process.stderr.write('{diagnostic}'); process.exit(7);\n"),
    )
    .unwrap();
    let config = f.file(
        "config.json",
        &serde_json::to_vec(&json!({
            "campaign_id":"fixture", "root_session_id":"root", "cutoff":"2026-10-03T05:00:00Z",
            "session_dir":sessions, "state_dir":state, "forge_prs":[], "intake_worktree":intake
        }))
        .unwrap(),
    );
    let output = Command::new(env!("CARGO_BIN_EXE_mister-clean-campaign-observer"))
        .arg("checkpoint")
        .arg(&config)
        .output()
        .unwrap();
    assert!(!output.status.success());
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(stderr.contains("private diagnostic receipt"));
    assert!(!stderr.contains(diagnostic));
    let receipts: Vec<_> = fs::read_dir(state.join("source-receipts"))
        .unwrap()
        .map(|entry| entry.unwrap().path())
        .filter(|path| {
            path.file_name()
                .unwrap()
                .to_string_lossy()
                .starts_with("import-failure-")
        })
        .collect();
    assert_eq!(receipts.len(), 1);
    let receipt: Value = serde_json::from_slice(&fs::read(&receipts[0]).unwrap()).unwrap();
    assert_eq!(receipt["status"], 7);
    assert_eq!(receipt["stderr"], diagnostic);
    assert_eq!(receipt["quality_credit"], false);
    assert_eq!(
        fs::metadata(&receipts[0]).unwrap().permissions().mode() & 0o777,
        0o600
    );
    assert!(
        fs::read_to_string(state.join("campaign-observations.jsonl"))
            .unwrap()
            .is_empty()
    );
}

#[test]
fn absent_malformed_or_non_utc_cutoff_fails_closed() {
    let f = Fixture::new();
    let sessions = f.dir("sessions");
    let state = f.dir("campaign-test");
    for cutoff in [
        Value::Null,
        json!("invalid"),
        json!("2026-10-03T05:00:00+02:00"),
    ] {
        let config=f.file("config.json",&serde_json::to_vec(&json!({"campaign_id":"fixture","root_session_id":"root","session_dir":sessions,"state_dir":state,"cutoff":cutoff,"forge_prs":[]})).unwrap());
        let output = Command::new(env!("CARGO_BIN_EXE_mister-clean-campaign-observer"))
            .arg("collect")
            .arg(config)
            .output()
            .unwrap();
        assert!(!output.status.success());
        assert!(String::from_utf8_lossy(&output.stderr).contains("valid UTC cutoff"));
    }
}

#[test]
fn symlinked_session_files_and_directories_cannot_supply_evidence() {
    let f = Fixture::new();
    let sessions = f.dir("sessions");
    let state = f.dir("campaign-test");
    let outside = f.dir("outside");
    let records = format!(
        "{}\n{}\n",
        json!({"type":"session_meta","timestamp":"2026-10-03T06:00:00Z","payload":{"id":"root"}}),
        json!({"type":"event_msg","timestamp":"2026-10-03T06:01:00Z","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":77,"output_tokens":9}}}})
    );
    fs::write(outside.join("outside.jsonl"), records).unwrap();
    std::os::unix::fs::symlink(outside.join("outside.jsonl"), sessions.join("linked.jsonl"))
        .unwrap();
    std::os::unix::fs::symlink(&outside, sessions.join("linked-dir")).unwrap();
    std::os::unix::fs::symlink(outside.join("missing"), sessions.join("dangling.jsonl")).unwrap();
    let config = json!({"campaign_id":"fixture","root_session_id":"root","cutoff":"2026-10-03T05:00:00Z","session_dir":sessions,"state_dir":state,"forge_prs":[]});
    assert_eq!(f.run(&config, &json!({}))["observations"], 0);
    assert!(Fixture::events(&state).is_empty());

    let mut linked_config = config;
    linked_config["session_dir"] = json!(sessions.join("linked-dir"));
    let config = f.file("config.json", &serde_json::to_vec(&linked_config).unwrap());
    let output = Command::new(env!("CARGO_BIN_EXE_mister-clean-campaign-observer"))
        .arg("collect")
        .arg(config)
        .output()
        .unwrap();
    assert!(!output.status.success());
    assert!(
        String::from_utf8_lossy(&output.stderr).contains("session directory must not be a symlink")
    );
}

#[test]
fn same_timestamp_forge_events_retain_pr_and_comment_identity_without_secrets() {
    let f = Fixture::new();
    let sessions = f.dir("sessions");
    let state = f.dir("campaign-test");
    let config = json!({"campaign_id":"fixture","root_session_id":"none","cutoff":"2026-10-03T05:00:00Z","session_dir":sessions,"state_dir":state,"forge_prs":[{"repo":"fixture/repo","number":101,"project":"p","slice":"s"},{"repo":"fixture/repo","number":102,"project":"p","slice":"s"}]});
    let response = json!({"createdAt":"2026-10-03T06:00:00Z","mergedAt":null,"headRefOid":"1111111111111111111111111111111111111111","files":[],"comments":[{"id":"comment1","createdAt":"2026-10-03T06:01:00Z","body":"VERDICT: PASS\nSYNTHETIC_SECRET_SENTINEL_NOT_REAL","author":{"login":"fixture"}},{"id":"comment2","createdAt":"2026-10-03T06:01:00Z","body":"VERDICT: PASS","author":{"login":"fixture"}}]});
    assert_eq!(f.run(&config, &response)["observations"], 6);
    assert_eq!(f.run(&config, &response)["observations"], 6);
    let events = Fixture::events(&state);
    assert_eq!(
        events
            .iter()
            .filter(|v| v["event_kind"] == "pr_snapshot")
            .count(),
        2
    );
    for entry in fs::read_dir(state.join("source-receipts")).unwrap() {
        assert!(!fs::read_to_string(entry.unwrap().path())
            .unwrap()
            .contains("SYNTHETIC_SECRET_SENTINEL_NOT_REAL"));
    }
}

// The opt-in binary override is exclusively a regression harness: it lets an
// independent reviewer run these assertions against the unchanged baseline.
fn regression_forge_command(
    f: &Fixture,
    config: &Value,
    mode: &str,
    command: &str,
) -> std::process::Output {
    let config = f.file("config.json", &serde_json::to_vec(config).unwrap());
    let gh = f.file("gh", br#"#!/bin/sh
if [ "$3" = 101 ]; then
  case "$FIXTURE_MODE" in
    fail) printf '%s\n' 'SYNTHETIC_PRIVATE_PROVIDER_SENTINEL' >&2; exit 7;;
    json) printf '%s\n' 'SYNTHETIC_PRIVATE_PROVIDER_SENTINEL'; exit 0;;
    shape) printf '%s\n' '{"createdAt":"bad","private":"SYNTHETIC_PRIVATE_PROVIDER_SENTINEL"}'; exit 0;;
    missing_merge) printf '%s\n' '{"createdAt":"2026-10-03T06:00:00Z","headRefOid":"1111111111111111111111111111111111111111","files":[],"comments":[]}'; exit 0;;
    missing_comment_id) printf '%s\n' '{"createdAt":"2026-10-03T06:00:00Z","mergedAt":null,"headRefOid":"1111111111111111111111111111111111111111","files":[],"comments":[{"createdAt":"2026-10-03T06:01:00Z","body":"VERDICT: PASS"}]}'; exit 0;;
  esac
fi
printf '%s\n' "$FIXTURE_RESPONSE"
"#);
    fs::set_permissions(&gh, fs::Permissions::from_mode(0o700)).unwrap();
    let binary = std::env::var_os("MC_REGRESSION_OBSERVER_BIN")
        .unwrap_or_else(|| env!("CARGO_BIN_EXE_mister-clean-campaign-observer").into());
    Command::new(binary).arg(command).arg(config)
        .env("PATH", format!("{}:{}", f.0.display(), std::env::var("PATH").unwrap()))
        .env("FIXTURE_MODE", mode)
        .env("FIXTURE_RESPONSE", json!({"createdAt":"2026-10-03T06:00:00Z","mergedAt":null,"headRefOid":"1111111111111111111111111111111111111111","files":[],"comments":[]}).to_string())
        .output().unwrap()
}

fn regression_forge_config(f: &Fixture) -> (Value, PathBuf) {
    let sessions = f.dir("sessions");
    let state = f.dir("campaign-test");
    let source = format!(
        "{}\n{}\n",
        json!({"type":"session_meta","timestamp":"2026-10-03T06:00:00Z","payload":{"id":"root"}}),
        json!({"type":"event_msg","timestamp":"2026-10-03T06:01:00Z","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":22,"output_tokens":3}}}})
    );
    f.file("sessions/root.jsonl", source.as_bytes());
    let config = json!({"campaign_id":"fixture","root_session_id":"root","cutoff":"2026-10-03T05:00:00Z","session_dir":sessions,"state_dir":state,
        "forge_prs":[{"repo":"fixture/repo","number":101,"project":"p","slice":"s"},{"repo":"fixture/repo","number":102,"project":"p","slice":"s"}]});
    (config, state)
}

#[test]
fn failed_and_invalid_forge_reads_preserve_local_and_other_forge_evidence() {
    for (mode, reason) in [
        ("fail", "command_failed"),
        ("json", "invalid_json"),
        ("shape", "invalid_snapshot"),
        ("missing_merge", "invalid_snapshot"),
        ("missing_comment_id", "invalid_snapshot"),
    ] {
        let f = Fixture::new();
        let (config, state) = regression_forge_config(&f);
        for _ in 0..2 {
            let output = regression_forge_command(&f, &config, mode, "collect");
            assert!(
                output.status.success(),
                "{}",
                String::from_utf8_lossy(&output.stderr)
            );
            let result: Value = serde_json::from_slice(&output.stdout).unwrap();
            assert_eq!(result["forge_status"], "degraded");
            assert_eq!(result["forge_failures"].as_array().unwrap().len(), 1);
            assert_eq!(result["forge_failures"][0]["reason"], reason);
            assert_eq!(result["forge_failures"][0]["number"], 101);
            assert!(!String::from_utf8_lossy(&output.stdout)
                .contains("SYNTHETIC_PRIVATE_PROVIDER_SENTINEL"));
            assert!(!String::from_utf8_lossy(&output.stderr)
                .contains("SYNTHETIC_PRIVATE_PROVIDER_SENTINEL"));
        }
        let events = Fixture::events(&state);
        assert_eq!(
            events
                .iter()
                .filter(|v| v["event_kind"] == "token_usage")
                .count(),
            1
        );
        assert_eq!(
            events
                .iter()
                .filter(|v| v["event_kind"] == "pr_snapshot")
                .count(),
            1
        );
        assert_eq!(
            events
                .iter()
                .filter(|v| v["event_kind"] == "forge_collection_failure")
                .count(),
            2
        );
        for entry in fs::read_dir(state.join("source-receipts")).unwrap() {
            let path = entry.unwrap().path();
            assert!(!fs::read_to_string(&path)
                .unwrap()
                .contains("SYNTHETIC_PRIVATE_PROVIDER_SENTINEL"));
            assert_eq!(
                fs::metadata(path).unwrap().permissions().mode() & 0o777,
                0o600
            );
        }
        let output = regression_forge_command(&f, &config, "success", "collect");
        assert!(output.status.success());
        let result: Value = serde_json::from_slice(&output.stdout).unwrap();
        assert_eq!(result["forge_status"], "complete");
        assert_eq!(
            Fixture::events(&state)
                .iter()
                .filter(|v| v["event_kind"] == "pr_snapshot")
                .count(),
            2
        );
    }
}

#[test]
fn degraded_forge_checkpoint_still_admits_local_usage_and_replays_idempotently() {
    let f = Fixture::new();
    let (mut config, state) = regression_forge_config(&f);
    config["intake_worktree"] = json!(Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .parent()
        .unwrap());
    for _ in 0..2 {
        let output = regression_forge_command(&f, &config, "fail", "checkpoint");
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        let result: Value = serde_json::from_slice(&output.stdout).unwrap();
        assert_eq!(result["collection"]["forge_status"], "degraded");
        assert_eq!(result["summary"]["totals"]["input_tokens"], 22);
        assert_eq!(result["summary"]["totals"]["output_tokens"], 3);
    }
    let db = rusqlite::Connection::open_with_flags(
        state.join("global.sqlite"),
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
    )
    .unwrap();
    assert_eq!(
        db.query_row(
            "SELECT COUNT(*) FROM campaign_execution_observations WHERE event_kind='token_usage'",
            [],
            |r| r.get::<_, i64>(0)
        )
        .unwrap(),
        1
    );
    assert_eq!(db.query_row("SELECT COUNT(*) FROM campaign_execution_observations WHERE event_kind='forge_collection_failure'",[],|r|r.get::<_,i64>(0)).unwrap(),2);
    assert_eq!(
        db.query_row("SELECT COUNT(*) FROM trials", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        0
    );
}

#[test]
fn finite_watch_completes_with_degraded_forge_and_imported_local_usage() {
    let f = Fixture::new();
    let (mut config, state) = regression_forge_config(&f);
    config["intake_worktree"] = json!(Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .parent()
        .unwrap());
    config["max_cycles"] = json!(1);
    let output = regression_forge_command(&f, &config, "fail", "watch");
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let text = String::from_utf8(output.stdout).unwrap();
    let lines: Vec<Value> = text
        .lines()
        .map(|line| serde_json::from_str(line).unwrap())
        .collect();
    assert_eq!(lines.len(), 2);
    assert_eq!(lines[0]["data"]["collection"]["forge_status"], "degraded");
    assert_eq!(lines[0]["data"]["summary"]["totals"]["input_tokens"], 22);
    assert_eq!(lines[1], json!({"completed_cycles":1,"stopped":false}));
    assert_eq!(
        Fixture::events(&state)
            .iter()
            .filter(|v| v["event_kind"] == "token_usage")
            .count(),
        1
    );
}

#[test]
fn unavailable_forge_command_is_degraded_not_lost_local_evidence() {
    let f = Fixture::new();
    let (config, state) = regression_forge_config(&f);
    let config = f.file("config.json", &serde_json::to_vec(&config).unwrap());
    let id = f.file("id", b"#!/bin/sh\nexec /usr/bin/id \"$@\"\n");
    fs::set_permissions(id, fs::Permissions::from_mode(0o700)).unwrap();
    let binary = std::env::var_os("MC_REGRESSION_OBSERVER_BIN")
        .unwrap_or_else(|| env!("CARGO_BIN_EXE_mister-clean-campaign-observer").into());
    let output = Command::new(binary)
        .arg("collect")
        .arg(config)
        .env("PATH", &f.0)
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let result: Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(result["forge_status"], "degraded");
    assert_eq!(result["forge_failures"].as_array().unwrap().len(), 2);
    assert!(result["forge_failures"]
        .as_array()
        .unwrap()
        .iter()
        .all(|v| v["reason"] == "command_unavailable"));
    assert_eq!(
        Fixture::events(&state)
            .iter()
            .filter(|v| v["event_kind"] == "token_usage")
            .count(),
        1
    );
}

#[test]
fn cumulative_replay_and_inherited_prefork_usage_are_not_new_campaign_tokens() {
    let f = Fixture::new();
    let sessions = f.dir("sessions");
    let state = f.dir("campaign-test");
    let root =
        json!({"type":"session_meta","timestamp":"2026-10-03T04:00:00Z","payload":{"id":"root"}});
    let child = json!({"type":"session_meta","timestamp":"2026-10-03T06:00:00Z","payload":{"id":"child","source":{"subagent":{"thread_spawn":{"parent_thread_id":"root","agent_path":"/root/pm/dev"}}}}});
    let token = |timestamp: &str, count: u64| json!({"type":"event_msg","timestamp":timestamp,"payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":count,"cached_input_tokens":0,"output_tokens":0}}}});
    let encode = |events: Vec<Value>| events.iter().map(|v| format!("{v}\n")).collect::<String>();
    fs::write(
        sessions.join("root.jsonl"),
        encode(vec![
            root,
            token("2026-10-03T04:01:00Z", 100),
            token("2026-10-03T05:01:00Z", 150),
            token("2026-10-03T05:02:00Z", 150),
        ]),
    )
    .unwrap();
    fs::write(
        sessions.join("child.jsonl"),
        encode(vec![
            child,
            token("2026-10-03T04:01:00Z", 10),
            token("2026-10-03T06:01:00Z", 40),
        ]),
    )
    .unwrap();
    let config = json!({"campaign_id":"fixture","root_session_id":"root","cutoff":"2026-10-03T05:00:00Z","session_dir":sessions,"state_dir":state,"forge_prs":[]});
    assert_eq!(f.run(&config, &json!({}))["observations"], 2);
    assert_eq!(f.run(&config, &json!({}))["observations"], 2);
    let events = Fixture::events(&state);
    assert_eq!(
        events
            .iter()
            .map(|v| v["metrics"]["delta_input_tokens"].as_u64().unwrap())
            .sum::<u64>(),
        80
    );
}
