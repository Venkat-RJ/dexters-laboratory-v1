//! Project-scoped bridge to the bundled campaign coordinator.
use crate::app_state::AppState;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Mutex, OnceLock};
use tauri::{State, Window};

static SERVICES: OnceLock<Mutex<HashMap<PathBuf, Child>>> = OnceLock::new();
const SOURCE: &[u8] =
    include_bytes!("embedded_skills/research-experiment-execution/scripts/campaign.py");

fn python(root: &Path) -> PathBuf {
    let local = root.join(".venv/bin/python");
    if local.is_file() {
        return local;
    }
    for candidate in ["/opt/homebrew/bin/python3", "/usr/local/bin/python3", "/usr/bin/python3"] {
        if Path::new(candidate).is_file() {
            return PathBuf::from(candidate);
        }
    }
    PathBuf::from("python3")
}

fn prepare(root: &Path) -> Result<PathBuf, String> {
    let relative = ".research/tools/campaign.py";
    lattice_core::experiment_tracker::prepare_campaign_runner(root, SOURCE)?;
    Ok(root.join(relative))
}

pub fn shutdown() {
    let Some(services) = SERVICES.get() else { return };
    for (root, mut child) in services.lock().unwrap_or_else(|e| e.into_inner()).drain() {
        if let Ok(script) = prepare(&root) {
            if let Ok(mut operation) = Command::new(python(&root))
                .arg(script)
                .arg("--root")
                .arg(&root)
                .stdin(Stdio::piped())
                .stdout(Stdio::null())
                .spawn()
            {
                if let Some(mut input) = operation.stdin.take() {
                    let _ = input
                        .write_all(br#"{"action":"stop","operationId":"application-shutdown"}"#);
                }
                let _ = operation.wait();
            }
        }
        let _ = child.kill();
        let _ = child.wait();
    }
}

#[tauri::command]
pub async fn research_campaign(
    state: State<'_, AppState>, window: Window, project_root: String, request: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let root = crate::ipc::pinned_root(&state, &window, &project_root, "research campaign")?;
    crate::ipc::run_blocking("Research campaign", move || {
        let script = prepare(&root)?;
        let mut services =
            SERVICES.get_or_init(Default::default).lock().unwrap_or_else(|e| e.into_inner());
        let running =
            services.get_mut(&root).is_some_and(|child| matches!(child.try_wait(), Ok(None)));
        if !running {
            let child = Command::new(python(&root))
                .arg(&script)
                .arg("--root")
                .arg(&root)
                .arg("--serve")
                .arg("--owner")
                .arg(std::process::id().to_string())
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .map_err(|error| error.to_string())?;
            let child_id = child.id();
            services.insert(root.clone(), child);
            for _ in 0..100 {
                let ready = std::fs::read(root.join(".research/campaign/service.json"))
                    .ok()
                    .and_then(|bytes| serde_json::from_slice::<serde_json::Value>(&bytes).ok())
                    .is_some_and(|value| value["pid"].as_u64() == Some(u64::from(child_id)));
                if ready {
                    break;
                }
                std::thread::sleep(std::time::Duration::from_millis(20));
            }
        }
        drop(services);
        let mut child = Command::new(python(&root))
            .arg(script)
            .arg("--root")
            .arg(&root)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| error.to_string())?;
        child
            .stdin
            .take()
            .ok_or("Could not open coordinator input")?
            .write_all(request.to_string().as_bytes())
            .map_err(|error| error.to_string())?;
        let mut stdout = child.stdout.take().ok_or("Could not open coordinator output")?;
        let mut stderr = child.stderr.take().ok_or("Could not open coordinator output")?;
        let output_reader = std::thread::spawn(move || {
            let mut bytes = Vec::new();
            let _ = stdout.read_to_end(&mut bytes);
            bytes
        });
        let error_reader = std::thread::spawn(move || {
            let mut bytes = Vec::new();
            let _ = stderr.read_to_end(&mut bytes);
            bytes
        });
        let started = std::time::Instant::now();
        while child.try_wait().map_err(|error| error.to_string())?.is_none() {
            if started.elapsed() > std::time::Duration::from_secs(10) {
                let _ = child.kill();
                let _ = child.wait();
                return Err("Campaign coordinator did not respond within 10 seconds".into());
            }
            std::thread::sleep(std::time::Duration::from_millis(20));
        }
        let output = output_reader.join().map_err(|_| "Coordinator output reader failed")?;
        let errors = error_reader.join().map_err(|_| "Coordinator output reader failed")?;
        serde_json::from_slice(&output).map_err(|_| String::from_utf8_lossy(&errors).into_owned())
    })
    .await
}
