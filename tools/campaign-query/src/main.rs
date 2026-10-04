use std::env;
use std::error::Error;
use std::path::Path;

use rusqlite::{Connection, OpenFlags};

fn main() -> Result<(), Box<dyn Error>> {
    let mut args = env::args_os();
    let _program = args.next();
    let path = args
        .next()
        .ok_or("usage: mister-clean-campaign-query <global.sqlite>")?;
    if args.next().is_some() || !Path::new(&path).is_absolute() {
        return Err("expected one absolute path to the global Mister Clean SQLite store".into());
    }

    let database = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )?;
    let migration: i64 = database.query_row(
        "SELECT COALESCE(MAX(version), 0) FROM schema_migrations WHERE store_kind = 'global'",
        [],
        |row| row.get(0),
    )?;
    let invocations: i64 = database.query_row(
        "SELECT COUNT(*) FROM local_mister_clean_invocations",
        [],
        |row| row.get(0),
    )?;
    let trials: i64 = database.query_row("SELECT COUNT(*) FROM trials", [], |row| row.get(0))?;
    let credited_trials: i64 = database.query_row(
        "SELECT COUNT(*) FROM trials WHERE contributes_quality_credit = 1",
        [],
        |row| row.get(0),
    )?;

    println!("global_schema_version={migration}");
    // These tables have no campaign key. This is a global-store census, not
    // campaign attribution; campaign telemetry is queried by the observer.
    println!("scope=global_store_census_not_campaign_attribution");
    println!("observed_cli_invocations={invocations}");
    println!("trials={trials}");
    println!("credited_trials={credited_trials}");
    Ok(())
}
