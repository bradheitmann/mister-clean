use std::fs;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::Connection;

fn query(args: &[&str]) -> std::process::Output {
    Command::new(env!("CARGO_BIN_EXE_mister-clean-campaign-query"))
        .args(args)
        .output()
        .expect("campaign query binary starts")
}

#[test]
fn reads_existing_store_without_changing_it() {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock after epoch")
        .as_nanos();
    let directory =
        std::env::temp_dir().join(format!("campaign-query-{}-{nonce}", std::process::id()));
    fs::create_dir(&directory).expect("private test directory");
    let path = directory.join("global.sqlite");
    {
        let database = Connection::open(&path).expect("create fixture");
        database
            .execute_batch(
                "CREATE TABLE schema_migrations(version INTEGER, store_kind TEXT);
                 CREATE TABLE local_mister_clean_invocations(invocation_id TEXT);
                 CREATE TABLE trials(contributes_quality_credit INTEGER);
                 INSERT INTO schema_migrations VALUES (10, 'global');
                 INSERT INTO local_mister_clean_invocations VALUES ('a'), ('b');
                 INSERT INTO trials VALUES (1), (0);",
            )
            .expect("fixture schema and rows");
    }
    let before = fs::read(&path).expect("fixture bytes");
    let output = query(&[path.to_str().expect("UTF-8 temp path")]);
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert_eq!(
        String::from_utf8(output.stdout).expect("UTF-8 output"),
        "global_schema_version=10\nscope=global_store_census_not_campaign_attribution\nobserved_cli_invocations=2\ntrials=2\ncredited_trials=1\n"
    );
    assert_eq!(fs::read(&path).expect("post-query bytes"), before);
    assert_eq!(
        fs::read_dir(&directory).expect("fixture directory").count(),
        1
    );
    fs::remove_file(path).expect("remove owned fixture");
    fs::remove_dir(directory).expect("remove owned test directory");
}

#[test]
fn rejects_missing_relative_and_extra_arguments() {
    assert!(!query(&[]).status.success());
    assert!(!query(&["relative.sqlite"]).status.success());
    assert!(!query(&["/nonexistent/campaign-query.sqlite", "extra"])
        .status
        .success());
    assert!(!query(&["/nonexistent/campaign-query.sqlite"])
        .status
        .success());
}
