//! Retrospective and live campaign observations, never evaluation credit.
use rusqlite::{Connection, OpenFlags};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::fs::{self, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::os::fd::{AsRawFd, FromRawFd};
use std::os::unix::ffi::OsStrExt;
use std::os::unix::fs::{MetadataExt, OpenOptionsExt, PermissionsExt};
use std::path::{Path, PathBuf};
use std::process::Command;

type Result<T> = std::result::Result<T, Box<dyn std::error::Error>>;
fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn text<'a>(v: &'a Value, key: &str) -> &'a str {
    v[key].as_str().unwrap_or("")
}
fn millis(s: &str) -> Option<i64> {
    chrono::DateTime::parse_from_rfc3339(s)
        .ok()
        .map(|v| v.timestamp_millis())
}
fn instant(s: &str) -> Option<chrono::DateTime<chrono::FixedOffset>> {
    chrono::DateTime::parse_from_rfc3339(s).ok()
}
fn utc_timestamp(s: &str) -> String {
    // Preserve existing canonical Z representations so replay identity stays
    // stable; convert offset representations at the strict intake boundary.
    if s.ends_with('Z') {
        return s.to_owned();
    }
    chrono::DateTime::parse_from_rfc3339(s)
        .map(|v| {
            v.to_utc()
                .to_rfc3339_opts(chrono::SecondsFormat::AutoSi, true)
        })
        .unwrap_or_else(|_| s.to_owned())
}
fn token_delta(current: u64, previous: u64) -> (u64, bool) {
    if current >= previous {
        (current - previous, false)
    } else {
        (current, true)
    }
}
fn reviewed_revision(body: &str) -> Value {
    body.lines()
        .find(|line| line.to_ascii_lowercase().contains("head reviewed:"))
        .and_then(|line| {
            line.split_whitespace().find(|part| {
                let s = part.trim_matches('`');
                s.len() >= 8 && s.len() <= 40 && s.chars().all(|c| c.is_ascii_hexdigit())
            })
        })
        .map(|s| json!(s.trim_matches('`')))
        .unwrap_or(Value::Null)
}
fn payload_metrics(output: &Value) -> Value {
    let texts: Vec<&str> = if let Some(s) = output.as_str() {
        vec![s]
    } else if let Some(items) = output.as_array() {
        items.iter().filter_map(|v| v["text"].as_str()).collect()
    } else {
        Vec::new()
    };
    if texts.is_empty() {
        return json!({"unmeasured_payloads":1});
    }
    let mut metrics = json!({"result_text_bytes":texts.iter().map(|s|s.len() as u64).sum::<u64>()});
    let mut exits = 0;
    let mut failed = 0;
    let mut errors = 0;
    for s in texts {
        if let Ok(v) = serde_json::from_str::<Value>(s) {
            if let Some(code) = v["exit_code"].as_i64() {
                exits += 1;
                failed += u64::from(code != 0);
            }
            errors += u64::from(v["isError"].as_bool() == Some(true));
        }
    }
    if exits > 0 {
        metrics["reported_exit_statuses"] = json!(exits);
        metrics["reported_failed_exits"] = json!(failed);
    }
    if errors > 0 {
        metrics["reported_tool_errors"] = json!(errors);
    }
    metrics
}
fn discover(dir: &Path, files: &mut Vec<PathBuf>) -> Result<()> {
    let metadata = fs::symlink_metadata(dir)?;
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return Err("session directory must not be a symlink".into());
    }
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let kind = entry.file_type()?;
        if kind.is_dir() {
            discover(&entry.path(), files)?;
        } else if kind.is_file() && entry.path().extension().is_some_and(|v| v == "jsonl") {
            files.push(entry.path());
        }
    }
    Ok(())
}
fn open_session(root: &Path, path: &Path) -> Result<fs::File> {
    // Resolve every component beneath the configured root through held directory
    // descriptors. Neither a leaf swap nor a replaced intermediate directory may
    // redirect evidence outside the operator-selected tree.
    let mut directory = OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_NOFOLLOW | libc::O_DIRECTORY | libc::O_NONBLOCK)
        .open(root)?;
    let components: Vec<_> = path.strip_prefix(root)?.components().collect();
    if components.is_empty() {
        return Err("session source must be beneath the session directory".into());
    }
    for (index, component) in components.iter().enumerate() {
        let std::path::Component::Normal(name) = component else {
            return Err("invalid session source component".into());
        };
        let name = std::ffi::CString::new(name.as_bytes())?;
        let final_component = index + 1 == components.len();
        let flags = libc::O_RDONLY
            | libc::O_NOFOLLOW
            | libc::O_NONBLOCK
            | libc::O_CLOEXEC
            | if final_component {
                0
            } else {
                libc::O_DIRECTORY
            };
        // SAFETY: directory owns a valid fd; name is NUL-terminated; success
        // transfers the newly returned descriptor into exactly one File owner.
        let descriptor = unsafe { libc::openat(directory.as_raw_fd(), name.as_ptr(), flags) };
        if descriptor < 0 {
            return Err(std::io::Error::last_os_error().into());
        }
        // SAFETY: openat returned a new, valid, uniquely owned descriptor.
        let opened = unsafe { fs::File::from_raw_fd(descriptor) };
        if final_component {
            let metadata = opened.metadata()?;
            // SAFETY: geteuid has no arguments or pointer preconditions.
            let uid = unsafe { libc::geteuid() };
            if !metadata.is_file()
                || metadata.nlink() != 1
                || metadata.uid() != uid
                || metadata.mode() & 0o022 != 0
            {
                return Err(
                    "session source must be an owned regular file not writable by others".into(),
                );
            }
            return Ok(opened);
        }
        directory = opened;
    }
    Err("session source is missing".into())
}
fn private_dir(path: &Path) -> Result<()> {
    if !path.exists() {
        fs::create_dir(path)?;
        fs::set_permissions(path, fs::Permissions::from_mode(0o700))?;
    }
    let m = fs::symlink_metadata(path)?;
    let uid: u32 = String::from_utf8(Command::new("id").arg("-u").output()?.stdout)?
        .trim()
        .parse()?;
    if !m.is_dir() || m.file_type().is_symlink() || m.uid() != uid || m.mode() & 0o077 != 0 {
        return Err("state must be owned, private and not a symlink".into());
    }
    Ok(())
}
fn retain(path: &Path, bytes: &[u8]) -> Result<()> {
    if path.exists() {
        let m = fs::symlink_metadata(path)?;
        if !m.is_file()
            || m.file_type().is_symlink()
            || m.nlink() != 1
            || m.mode() & 0o077 != 0
            || fs::read(path)? != bytes
        {
            return Err("immutable receipt collision or unsafe receipt".into());
        }
        return Ok(());
    }
    let tmp = path.with_extension(format!("tmp-{}", std::process::id()));
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .open(&tmp)?;
    file.write_all(bytes)?;
    file.sync_all()?;
    fs::rename(tmp, path)?;
    Ok(())
}
struct Ledger {
    state: PathBuf,
    campaign: String,
    records: BTreeMap<String, Value>,
}
impl Ledger {
    fn add(&mut self, mut event: Value) -> Result<()> {
        let id = format!("obs:{}", hash(&serde_json::to_vec(&event)?));
        event["observation_id"] = json!(id);
        retain(
            &self
                .state
                .join("observation-receipts")
                .join(format!("{}.json", &id[4..])),
            &serde_json::to_vec(&event)?,
        )?;
        self.records.insert(id, event);
        Ok(())
    }
    // Keep versioned admission fields explicit at this schema boundary.
    #[allow(clippy::too_many_arguments)]
    fn event(
        &self,
        project: &str,
        slice: Option<&str>,
        activity: &str,
        kind: &str,
        timestamp: &str,
        session: Option<&str>,
        model: Option<&str>,
        reasoning: Option<&str>,
        metrics: Value,
        source: Value,
    ) -> Value {
        let timestamp = utc_timestamp(timestamp);
        json!({"schema_version":"1.0","campaign_id":self.campaign,"project":project,"slice":slice,"activity":activity,"event_kind":kind,"timestamp":timestamp,"session_id":session,"model_id":model,"reasoning":reasoning,"tool_name":null,"requested_model_id":null,"requested_reasoning":null,"candidate_revision":null,"integrated_revision":null,"metrics":metrics,"source":source})
    }
    fn export(&self) -> Result<()> {
        let mut events: Vec<&Value> = self.records.values().collect();
        events.sort_by_key(|v| (text(v, "timestamp"), text(v, "observation_id")));
        let tmp = self
            .state
            .join(format!("campaign-observations.tmp-{}", std::process::id()));
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(0o600)
            .open(&tmp)?;
        for event in events {
            serde_json::to_writer(&mut file, event)?;
            file.write_all(b"\n")?;
        }
        file.sync_all()?;
        fs::rename(tmp, self.state.join("campaign-observations.jsonl"))?;
        Ok(())
    }
}
fn forge_role(kind: &str) -> &str {
    if kind.starts_with("qa_") {
        "review"
    } else if kind.starts_with("guard_") {
        "guard"
    } else if kind == "forge_comment" {
        "unclassified"
    } else {
        "integration"
    }
}
fn role(path: &str) -> &str {
    if path.contains("session_report_") {
        "reporting"
    } else if path.contains("guard") {
        "guard"
    } else if path.contains("exec") {
        "integration"
    } else if path.contains("qa") {
        "review"
    } else if path.ends_with("/pm") {
        "planning"
    } else if path.contains("dev") || path.contains("repair") {
        "implementation"
    } else {
        "executive"
    }
}
fn capture(config: &Value) -> Result<Value> {
    let cutoff = text(config, "cutoff");
    let cutoff_time = instant(cutoff)
        .filter(|_| cutoff.ends_with('Z') || cutoff.ends_with("+00:00"))
        .ok_or("an explicit valid UTC cutoff is required")?;
    let state = PathBuf::from(text(config, "state_dir"));
    if !state.is_absolute()
        || !state
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .starts_with("campaign-")
    {
        return Err("use an absolute campaign leaf".into());
    }
    private_dir(&state)?;
    // Kernel-held file locks release on process exit, including interruption.
    // The persistent inode is not a stale ownership claim.
    let lock_path = state.join("observer.lock");
    let lease = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .mode(0o600)
        .custom_flags(libc::O_NOFOLLOW)
        .open(&lock_path)?;
    let opened = lease.metadata()?;
    let named = fs::symlink_metadata(&lock_path)?;
    if !opened.is_file()
        || opened.nlink() != 1
        || opened.mode() & 0o077 != 0
        || opened.ino() != named.ino()
        || named.file_type().is_symlink()
    {
        return Err("unsafe observer lock".into());
    }
    lease.try_lock()?;
    let _lease = lease;
    private_dir(&state.join("observation-receipts"))?;
    private_dir(&state.join("source-receipts"))?;
    let mut ledger = Ledger {
        state: state.clone(),
        campaign: text(config, "campaign_id").to_owned(),
        records: BTreeMap::new(),
    };
    for entry in fs::read_dir(state.join("observation-receipts"))? {
        let entry = entry?;
        if entry.path().extension().is_some_and(|v| v == "json") {
            let event: Value = serde_json::from_slice(&fs::read(entry.path())?)?;
            ledger
                .records
                .insert(text(&event, "observation_id").to_owned(), event);
        }
    }
    let mut files = Vec::new();
    let session_root = Path::new(text(config, "session_dir"));
    discover(session_root, &mut files)?;
    let mut sessions = Vec::new();
    for path in files {
        let mut first = String::new();
        BufReader::new(open_session(session_root, &path)?).read_line(&mut first)?;
        if let Ok(meta) = serde_json::from_str::<Value>(&first) {
            if text(&meta, "type") == "session_meta" {
                sessions.push((path, meta));
            }
        }
    }
    let mut selected = BTreeSet::from([text(config, "root_session_id").to_owned()]);
    loop {
        let before = selected.len();
        for (_, meta) in &sessions {
            if meta["payload"]["source"]["subagent"]["thread_spawn"]["parent_thread_id"]
                .as_str()
                .is_some_and(|v| selected.contains(v))
            {
                selected.insert(text(&meta["payload"], "id").to_owned());
            }
        }
        if before == selected.len() {
            break;
        }
    }
    let mut observed_sessions = 0;
    for (path, meta) in sessions {
        let id = text(&meta["payload"], "id");
        if !selected.contains(id) {
            continue;
        }
        let created = text(&meta, "timestamp");
        let created_time =
            instant(created).ok_or("selected session creation timestamp is invalid")?;
        let actor = meta["payload"]["source"]["subagent"]["thread_spawn"]["agent_path"]
            .as_str()
            .unwrap_or("/root");
        let activity = role(actor);
        let mut model: Option<String> = None;
        let mut reasoning: Option<String> = None;
        let mut previous = BTreeMap::<String, u64>::new();
        let mut calls = BTreeMap::<String, (String, String)>::new();
        let mut seen = false;
        for (index, line) in BufReader::new(open_session(session_root, &path)?)
            .split(b'\n')
            .enumerate()
        {
            let line = line?;
            // Hash original bytes excluding LF only, matching authoritative
            // intake. BufRead::lines strips CR too and corrupts CRLF provenance.
            let v: Value = match serde_json::from_slice(&line) {
                Ok(v) => v,
                Err(_) => continue,
            };
            let timestamp = text(&v, "timestamp");
            let kind = text(&v, "type");
            let p = &v["payload"];
            if kind == "turn_context" {
                model = p["model"].as_str().map(str::to_owned);
                reasoning = p["effort"].as_str().map(str::to_owned);
            }
            let in_scope =
                instant(timestamp).is_some_and(|t| t >= cutoff_time && t >= created_time);
            if kind == "event_msg" && text(p, "type") == "token_count" {
                let totals = &p["info"]["total_token_usage"];
                if !totals.is_object() {
                    continue;
                }
                let mut metrics = serde_json::Map::new();
                let mut changed = false;
                let mut reset = false;
                for key in [
                    "input_tokens",
                    "cached_input_tokens",
                    "cache_write_input_tokens",
                    "output_tokens",
                    "reasoning_output_tokens",
                ] {
                    if let Some(current) = totals[key].as_u64() {
                        let prior = *previous.get(key).unwrap_or(&0);
                        let (delta, did_reset) = token_delta(current, prior);
                        reset |= did_reset;
                        changed |= delta > 0;
                        metrics.insert(format!("delta_{key}"), json!(delta));
                        previous.insert(key.to_owned(), current);
                    }
                }
                if in_scope && changed {
                    metrics.insert("counter_resets".into(), json!(u64::from(reset)));
                    let mut event = ledger.event(
                        "multi-project",
                        None,
                        activity,
                        "token_usage",
                        timestamp,
                        Some(id),
                        model.as_deref(),
                        reasoning.as_deref(),
                        Value::Object(metrics),
                        json!({"path":path,"line":index+1,"record_sha256":hash(&line)}),
                    );
                    if let Some(assignment) = config["requested_assignments"].get(actor) {
                        event["requested_model_id"] = assignment["model"].clone();
                        event["requested_reasoning"] = assignment["reasoning"].clone();
                    }
                    ledger.add(event)?;
                    seen = true;
                }
            }
            if !in_scope || kind != "response_item" {
                continue;
            }
            let item = text(p, "type");
            if id == text(config, "root_session_id")
                && item == "message"
                && text(p, "role") == "user"
            {
                ledger.add(ledger.event(
                    "multi-project",
                    None,
                    "coordination",
                    "human_message",
                    timestamp,
                    Some(id),
                    None,
                    None,
                    json!({"human_messages":1}),
                    json!({"path":path,"line":index+1,"record_sha256":hash(&line)}),
                ))?;
                seen = true;
            }
            if item == "function_call" || item == "custom_tool_call" {
                calls.insert(
                    text(p, "call_id").to_owned(),
                    (timestamp.to_owned(), text(p, "name").to_owned()),
                );
                let mut event = ledger.event(
                    "multi-project",
                    None,
                    activity,
                    "tool_call",
                    timestamp,
                    Some(id),
                    model.as_deref(),
                    reasoning.as_deref(),
                    json!({"tool_envelope_calls":1}),
                    json!({"path":path,"line":index+1,"record_sha256":hash(&line)}),
                );
                event["tool_name"] = json!(text(p, "name"));
                ledger.add(event)?;
                seen = true;
            } else if item == "function_call_output" || item == "custom_tool_call_output" {
                let mut metrics = json!({"tool_envelope_results":1,"result_bytes":p["output"].as_str().map(str::len).unwrap_or(0)});
                let mut tool_name = None;
                if let Some((started, name)) = calls.remove(text(p, "call_id")) {
                    tool_name = Some(name);
                    if let (Some(a), Some(b)) = (millis(&started), millis(timestamp)) {
                        if b >= a {
                            metrics["tool_envelope_latency_ms"] = json!(b - a);
                        }
                    }
                }
                let mut event = ledger.event(
                    "multi-project",
                    None,
                    activity,
                    "tool_result",
                    timestamp,
                    Some(id),
                    model.as_deref(),
                    reasoning.as_deref(),
                    metrics,
                    json!({"path":path,"line":index+1,"record_sha256":hash(&line)}),
                );
                event["tool_name"] = json!(tool_name);
                ledger.add(event)?;
                let mut measurement = ledger.event(
                    "multi-project",
                    None,
                    activity,
                    "tool_payload_measurement",
                    timestamp,
                    Some(id),
                    model.as_deref(),
                    reasoning.as_deref(),
                    payload_metrics(&p["output"]),
                    json!({"path":path,"line":index+1,"record_sha256":hash(&line)}),
                );
                measurement["tool_name"] = json!(tool_name);
                ledger.add(measurement)?;
                seen = true;
            }
        }
        if seen {
            observed_sessions += 1;
        }
    }
    let bindings_path = state.join("forge-bindings.json");
    if !bindings_path.exists() {
        retain(&bindings_path, &serde_json::to_vec(&config["forge_prs"])?)?;
    }
    let original_bindings: Value = serde_json::from_slice(&fs::read(&bindings_path)?)?;
    for pr in config["forge_prs"].as_array().unwrap_or(&Vec::new()) {
        let repo = text(pr, "repo");
        let number = pr["number"].as_u64().ok_or("missing PR number")?;
        let output = Command::new("gh")
            .args([
                "pr",
                "view",
                &number.to_string(),
                "--repo",
                repo,
                "--json",
                "createdAt,mergedAt,headRefOid,mergeCommit,commits,comments,files",
            ])
            .output()?;
        if !output.status.success() {
            return Err(format!("forge read failed: {repo}#{number}").into());
        }
        let receipt: Value = serde_json::from_slice(&output.stdout)?;
        let project = text(pr, "project");
        let slice = pr["slice"].as_str();
        let safe_snapshot = json!({"createdAt":receipt["createdAt"],"mergedAt":receipt["mergedAt"],"headRefOid":receipt["headRefOid"],"mergeCommit":receipt["mergeCommit"],"files":receipt["files"],"response_sha256":hash(&output.stdout)});
        let mut items = vec![(
            "pr_snapshot",
            text(&receipt, "createdAt").to_owned(),
            safe_snapshot,
        )];
        for comment in receipt["comments"].as_array().unwrap_or(&Vec::new()) {
            let body = text(comment, "body");
            let kind = if body.starts_with("VERDICT: PASS") {
                "qa_pass"
            } else if body.starts_with("VERDICT: FAIL") {
                "qa_fail"
            } else if body.contains("GUARD: MERGE") {
                "guard_merge"
            } else if body.contains("GUARD: HOLD") {
                "guard_hold"
            } else {
                "forge_comment"
            };
            let reviewed = reviewed_revision(body);
            let safe_comment = json!({"id":comment["id"],"createdAt":comment["createdAt"],"author":comment["author"]["login"],"body_sha256":hash(body.as_bytes()),"reviewed_revision":reviewed});
            items.push((kind, text(comment, "createdAt").to_owned(), safe_comment));
        }
        if !receipt["mergedAt"].is_null() {
            items.push(("merge",text(&receipt,"mergedAt").to_owned(),json!({"mergedAt":receipt["mergedAt"],"headRefOid":receipt["headRefOid"],"mergeCommit":receipt["mergeCommit"]})));
        }
        for (kind, timestamp, item) in items {
            // Backfill records are immutable. A sanitized source amendment must
            // not count the same historical forge event a second time.
            let prior_event = ledger.records.values().any(|v| {
                if text(v, "project") != project
                    || v["slice"].as_str() != slice
                    || text(v, "event_kind") != kind
                    || text(v, "timestamp") != timestamp
                {
                    return false;
                }
                let previous_source = v["source"]["path"]
                    .as_str()
                    .and_then(|p| fs::read(p).ok())
                    .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok());
                let Some(previous_source) = previous_source else {
                    return false;
                };
                let bound = if !previous_source["forge_repo"].is_null() {
                    text(&previous_source, "forge_repo") == repo
                        && previous_source["forge_pr_number"].as_u64() == Some(number)
                } else {
                    let matching: Vec<_> = original_bindings
                        .as_array()
                        .map(Vec::as_slice)
                        .unwrap_or(&[])
                        .iter()
                        .filter(|p| text(p, "project") == project && p["slice"].as_str() == slice)
                        .collect();
                    matching.len() == 1
                        && text(matching[0], "repo") == repo
                        && matching[0]["number"].as_u64() == Some(number)
                };
                if !bound {
                    return false;
                }
                if kind == "merge" || kind == "pr_snapshot" {
                    return v["candidate_revision"] == receipt["headRefOid"];
                }
                !item["id"].is_null() && item["id"] == previous_source["id"]
            });
            if prior_event {
                continue;
            }
            let mut item = item;
            item["forge_repo"] = json!(repo);
            item["forge_pr_number"] = json!(number);
            let bytes = serde_json::to_vec(&item)?;
            let digest = hash(&bytes);
            let source_path = state.join("source-receipts").join(format!("{digest}.json"));
            retain(&source_path, &bytes)?;
            let mut metrics = json!({"forge_events":1});
            if kind == "merge" {
                let opened = millis(text(&receipt, "createdAt"));
                let merged = millis(text(&receipt, "mergedAt"));
                if let (Some(a), Some(b)) = (opened, merged) {
                    if b >= a {
                        metrics["pr_lead_time_ms"] = json!(b - a);
                    }
                }
                metrics["accepted_additions"] = json!(receipt["files"]
                    .as_array()
                    .unwrap_or(&Vec::new())
                    .iter()
                    .filter_map(|v| v["additions"].as_u64())
                    .sum::<u64>());
                metrics["accepted_deletions"] = json!(receipt["files"]
                    .as_array()
                    .unwrap_or(&Vec::new())
                    .iter()
                    .filter_map(|v| v["deletions"].as_u64())
                    .sum::<u64>());
            }
            let mut event = ledger.event(
                project,
                slice,
                forge_role(kind),
                kind,
                &timestamp,
                None,
                None,
                None,
                metrics,
                json!({"path":source_path,"line":null,"record_sha256":digest}),
            );
            event["candidate_revision"] = if kind == "pr_snapshot" || kind == "merge" {
                receipt["headRefOid"].clone()
            } else {
                item["reviewed_revision"].clone()
            };
            if kind == "merge" {
                event["integrated_revision"] = receipt["mergeCommit"]["oid"].clone();
            }
            ledger.add(event)?;
        }
    }
    ledger.export()?;
    Ok(
        json!({"observations":ledger.records.len(),"observed_sessions":observed_sessions,"journal":state.join("campaign-observations.jsonl"),"quality_credit":false}),
    )
}
fn summary(path: &Path) -> Result<Value> {
    let db = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    let mut query=db.prepare("SELECT event_kind,CASE WHEN event_kind LIKE 'guard_%' THEN 'guard' WHEN event_kind='forge_comment' THEN 'unclassified' ELSE activity END AS normalized_activity,model_id,COUNT(*),SUM(COALESCE(json_extract(metrics_json,'$.delta_input_tokens'),0)),SUM(COALESCE(json_extract(metrics_json,'$.delta_cached_input_tokens'),0)),SUM(COALESCE(json_extract(metrics_json,'$.delta_output_tokens'),0)) FROM campaign_execution_observations GROUP BY event_kind,normalized_activity,model_id ORDER BY event_kind,normalized_activity,model_id")?;
    let rows=query.query_map([],|r|Ok(json!({"event_kind":r.get::<_,String>(0)?,"activity":r.get::<_,String>(1)?,"model":r.get::<_,Option<String>>(2)?,"events":r.get::<_,i64>(3)?,"input_tokens":r.get::<_,i64>(4)?,"cached_input_tokens":r.get::<_,i64>(5)?,"output_tokens":r.get::<_,i64>(6)?})))?.collect::<std::result::Result<Vec<_>,_>>()?;
    let totals:Value=db.query_row("SELECT COUNT(*),COALESCE(SUM(COALESCE(json_extract(metrics_json,'$.delta_input_tokens'),0)),0),COALESCE(SUM(COALESCE(json_extract(metrics_json,'$.delta_cached_input_tokens'),0)),0),COALESCE(SUM(COALESCE(json_extract(metrics_json,'$.delta_output_tokens'),0)),0),COALESCE(SUM(COALESCE(json_extract(metrics_json,'$.counter_resets'),0)),0),COUNT(DISTINCT session_id) FROM campaign_execution_observations",[],|r|Ok(json!({"observations":r.get::<_,i64>(0)?,"input_tokens":r.get::<_,i64>(1)?,"cached_input_tokens":r.get::<_,i64>(2)?,"output_tokens":r.get::<_,i64>(3)?,"counter_resets":r.get::<_,i64>(4)?,"sessions":r.get::<_,i64>(5)?})))?;
    let input = totals["input_tokens"].as_f64().unwrap_or(0.0);
    let cache = totals["cached_input_tokens"].as_f64().unwrap_or(0.0);
    let mut tool_query=db.prepare("SELECT tool_name,COUNT(*),SUM(COALESCE(json_extract(metrics_json,'$.tool_envelope_latency_ms'),0)),SUM(COALESCE(json_extract(metrics_json,'$.result_bytes'),0)),COUNT(json_extract(metrics_json,'$.tool_envelope_latency_ms')) FROM campaign_execution_observations WHERE event_kind='tool_result' GROUP BY tool_name ORDER BY COUNT(*) DESC")?;
    let tools=tool_query.query_map([],|r|Ok(json!({"tool_name":r.get::<_,Option<String>>(0)?,"results":r.get::<_,i64>(1)?,"total_envelope_latency_ms":r.get::<_,i64>(2)?,"legacy_result_bytes_incomplete":r.get::<_,i64>(3)?,"latency_observations":r.get::<_,i64>(4)?})))?.collect::<std::result::Result<Vec<_>,_>>()?;
    let payloads:Value=db.query_row("SELECT SUM(COALESCE(json_extract(metrics_json,'$.result_text_bytes'),0)),SUM(COALESCE(json_extract(metrics_json,'$.reported_exit_statuses'),0)),SUM(COALESCE(json_extract(metrics_json,'$.reported_failed_exits'),0)),SUM(COALESCE(json_extract(metrics_json,'$.unmeasured_payloads'),0)) FROM campaign_execution_observations WHERE event_kind='tool_payload_measurement'",[],|r|Ok(json!({"result_text_bytes":r.get::<_,Option<i64>>(0)?,"reported_exit_statuses":r.get::<_,Option<i64>>(1)?,"reported_failed_exits":r.get::<_,Option<i64>>(2)?,"unmeasured_payloads":r.get::<_,Option<i64>>(3)?})))?;
    let mut merge_query=db.prepare("SELECT project,slice,candidate_revision,integrated_revision,metrics_json FROM campaign_execution_observations WHERE event_kind='merge' ORDER BY observed_at")?;
    let merges=merge_query.query_map([],|r|Ok(json!({"project":r.get::<_,String>(0)?,"slice":r.get::<_,Option<String>>(1)?,"candidate":r.get::<_,Option<String>>(2)?,"integrated":r.get::<_,Option<String>>(3)?,"metrics":serde_json::from_str::<Value>(&r.get::<_,String>(4)?).unwrap_or(Value::Null)})))?.collect::<std::result::Result<Vec<_>,_>>()?;
    Ok(
        json!({"schema":"mister-clean.campaign-observation-summary/1","rows":rows,"totals":totals,"cache_percentage":if input>0.0 {Some(100.0*cache/input)} else {None},"tools":tools,"payload_measurements":payloads,"merges":merges,"unavailable":["actual_billing","priced_usage","ttft","generation_tokens_per_second","nested_tool_invocations","exact_skill_mcp_context_overhead","controlled_model_ranking"],"quality_credit":false}),
    )
}
fn checkpoint(config: &Value) -> Result<Value> {
    let started = std::time::Instant::now();
    let collection = capture(config)?;
    let output = Command::new("bun")
        .arg("scripts/reconcile_campaign_invocations.ts")
        .arg(text(config, "state_dir"))
        .current_dir(text(config, "intake_worktree"))
        .output()?;
    if !output.status.success() {
        // Retain bounded diagnostics privately, never in observations or console
        // output. The receipt lets operators inspect the actual rejection without
        // rerunning an importer or exposing its stderr (which may contain paths).
        let failure = serde_json::to_vec(&json!({
            "schema":"mister-clean.campaign-import-failure/1",
            "status":output.status.code(),
            "stderr_sha256":hash(&output.stderr),
            "stderr":String::from_utf8_lossy(&output.stderr[..output.stderr.len().min(65536)]),
            "stderr_truncated":output.stderr.len()>65536,
            "quality_credit":false
        }))?;
        let receipt_path = PathBuf::from(text(config, "state_dir"))
            .join("source-receipts")
            .join(format!("import-failure-{}.json", hash(&failure)));
        retain(&receipt_path, &failure)?;
        return Err(format!(
            "authoritative importer failed (status {:?}); original journal preserved; private diagnostic receipt: {}",
            output.status.code(), receipt_path.display()
        )
        .into());
    }
    let imported: Value = serde_json::from_slice(&output.stdout)?;
    let summary = summary(&PathBuf::from(text(config, "state_dir")).join("global.sqlite"))?;
    let result = json!({"collection":collection,"import":imported["campaign_observations"],"summary":summary,"collector_elapsed_ms":started.elapsed().as_millis()});
    let receipt = serde_json::to_vec(&result)?;
    let digest = hash(&receipt);
    retain(
        &PathBuf::from(text(config, "state_dir"))
            .join("source-receipts")
            .join(format!("checkpoint-{digest}.json")),
        &receipt,
    )?;
    Ok(result)
}
fn main() {
    let args: Vec<_> = std::env::args().collect();
    let result = (|| -> Result<Value> {
        if args.len() != 3 {
            return Err(
                "usage: campaign-observer collect|checkpoint|watch CONFIG | summary GLOBAL.sqlite"
                    .into(),
            );
        }
        match args[1].as_str() {
            "collect" => capture(&serde_json::from_slice(&fs::read(&args[2])?)?),
            "checkpoint" => checkpoint(&serde_json::from_slice(&fs::read(&args[2])?)?),
            "watch" => {
                let config: Value = serde_json::from_slice(&fs::read(&args[2])?)?;
                let cycles = config["max_cycles"].as_u64().unwrap_or(60).clamp(1, 240);
                let interval = config["interval_seconds"]
                    .as_u64()
                    .unwrap_or(60)
                    .clamp(10, 60);
                let stop = PathBuf::from(text(&config, "state_dir")).join("observer.stop");
                for cycle in 0..cycles {
                    if stop.exists() {
                        return Ok(json!({"stopped":true,"completed_cycles":cycle}));
                    }
                    let started = std::time::Instant::now();
                    let value = checkpoint(&config)?;
                    println!(
                        "{}",
                        json!({"checkpoint":cycle+1,"collector_elapsed_ms":started.elapsed().as_millis(),"data":value})
                    );
                    if cycle + 1 < cycles {
                        for _ in 0..interval {
                            if stop.exists() {
                                break;
                            }
                            std::thread::sleep(std::time::Duration::from_secs(1));
                        }
                    }
                }
                Ok(json!({"completed_cycles":cycles,"stopped":false}))
            }
            "summary" => summary(Path::new(&args[2])),
            _ => Err("unknown command".into()),
        }
    })();
    match result {
        Ok(v) => println!("{v}"),
        Err(e) => {
            eprintln!("campaign-observer: {e}");
            std::process::exit(1);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn forge_guard_and_unclassified_comments_are_not_integration() {
        assert_eq!(forge_role("guard_merge"), "guard");
        assert_eq!(forge_role("forge_comment"), "unclassified");
        assert_eq!(forge_role("qa_pass"), "review");
    }
    #[test]
    fn structured_results_count_utf8_bytes_and_only_explicit_exit_statuses() {
        let m = payload_metrics(
            &json!([{"type":"input_text","text":"é"},{"type":"input_text","text":"{\"exit_code\":1}"}]),
        );
        assert_eq!(m["result_text_bytes"], 17);
        assert_eq!(m["reported_exit_statuses"], 1);
        assert_eq!(m["reported_failed_exits"], 1);
        assert_eq!(payload_metrics(&Value::Null)["unmeasured_payloads"], 1);
    }
    #[test]
    fn reviewed_revision_ignores_unbound_current_head() {
        assert_eq!(
            reviewed_revision("Head reviewed: `fb81554db860347f3316c898fd7c6531f4671af0`"),
            json!("fb81554db860347f3316c898fd7c6531f4671af0")
        );
        assert!(reviewed_revision("PASS without revision").is_null());
    }
    #[test]
    fn utc_normalization_preserves_canonical_identity() {
        for timestamp in [
            "2026-10-03T06:01:00Z",
            "2026-10-03T06:01:00.10Z",
            "2026-10-03T06:01:00.123456Z",
        ] {
            assert_eq!(utc_timestamp(timestamp), timestamp);
        }
        assert_eq!(
            utc_timestamp("2026-10-03T08:01:00+02:00"),
            "2026-10-03T06:01:00Z"
        );
        assert_eq!(utc_timestamp("invalid"), "invalid");
    }
    #[test]
    fn duplicate_cumulative_snapshots_do_not_double_count() {
        let totals = [100, 100, 140, 140, 205];
        let mut previous = 0;
        let mut sum = 0;
        for current in totals {
            let (delta, reset) = token_delta(current, previous);
            assert!(!reset);
            sum += delta;
            previous = current;
        }
        assert_eq!(sum, 205);
    }
    #[test]
    fn counter_reset_is_explicit_not_unsigned_underflow() {
        assert_eq!(token_delta(30, 205), (30, true));
    }
    #[test]
    fn cache_is_subset_of_input_not_extra_input() {
        let (input, _) = token_delta(1000, 600);
        let (cache, _) = token_delta(900, 500);
        assert_eq!(input, 400);
        assert_eq!(cache, 400);
        assert_eq!(input - cache, 0);
    }
    #[test]
    fn canonical_json_orders_nested_keys() {
        let a: Value = serde_json::from_str(r#"{"z":{"b":2,"a":1},"a":0}"#).unwrap();
        let b = json!({"a":0,"z":{"a":1,"b":2}});
        assert_eq!(
            hash(&serde_json::to_vec(&a).unwrap()),
            hash(&serde_json::to_vec(&b).unwrap())
        );
    }
    #[test]
    fn observed_roles_are_separate() {
        assert_eq!(role("/root/pm"), "planning");
        assert_eq!(role("/root/qa"), "review");
        assert_eq!(role("/root/pm/peerid_dev"), "implementation");
        assert_eq!(role("/root/pm/caff_guard"), "guard");
        assert_eq!(role("/root/pm/caff_merge_exec"), "integration");
    }
}
