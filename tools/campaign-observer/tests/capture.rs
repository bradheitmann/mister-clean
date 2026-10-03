use serde_json::{json, Value};
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
