use crate::project;
use crate::project_fs::ProjectDir;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs;
use std::io::{ErrorKind, Read};
use std::path::{Component, Path};
use std::sync::{Mutex, PoisonError};
use std::time::{SystemTime, UNIX_EPOCH};

const RUN_RECEIPT: &str = "run-status.json";
const LAUNCH_RECEIPT: &str = "launch-status.json";
const WORKSPACE_RUNNER: &str = ".research/tools/run_experiment.py";

pub fn prepare_campaign_runner(root: &Path, source: &[u8]) -> Result<(), String> {
    if fs::read(root.join(".research/tools/campaign.py")).is_ok_and(|bytes| bytes == source) {
        return Ok(());
    }
    ProjectDir::open(root)?.atomic_write(".research/tools/campaign.py", source)
}

pub fn prepare_workspace_runner(root: &Path, source: &[u8]) -> Result<(), String> {
    if let Ok(path) = project::safe_path(root, WORKSPACE_RUNNER) {
        if fs::symlink_metadata(&path)
            .is_ok_and(|metadata| metadata.is_file() && metadata.len() == source.len() as u64)
            && fs::read(path).is_ok_and(|bytes| bytes == source)
        {
            return Ok(());
        }
    }
    ProjectDir::open(root)?.atomic_write(WORKSPACE_RUNNER, source)
}

#[derive(Default)]
pub struct ExperimentIndex {
    changes: Mutex<Changes>,
    snapshot: Mutex<Option<Snapshot>>,
}

#[derive(Default)]
struct Changes {
    journal: bool,
    all_receipts: bool,
    receipts: HashSet<String>,
}

#[derive(Deserialize)]
struct Journal {
    version: u32,
    experiments: Vec<Entry>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Entry {
    id: String,
    node_id: String,
    title: String,
    total_cases: Option<u64>,
    outcome: Option<String>,
    retry_of: Option<String>,
    evaluation: Option<Evaluation>,
    #[serde(default)]
    queued: bool,
}

#[derive(Deserialize)]
struct Evaluation {
    id: String,
    direction: Direction,
    #[serde(default)]
    tolerance: f64,
}

#[derive(Clone, Copy, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
enum Direction {
    Lower,
    Higher,
}

#[derive(Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
enum ScoreOutcome {
    Improved,
    Neutral,
    Worse,
    Failed,
}

#[derive(Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
enum Status {
    Planned,
    Queued,
    Running,
    Completed,
    Failed,
    TimedOut,
    Interrupted,
    Stale,
    Unavailable,
}

impl Status {
    fn active(self) -> bool {
        matches!(self, Self::Planned | Self::Queued | Self::Running)
    }

    fn needs_attention(self) -> bool {
        matches!(
            self,
            Self::Failed | Self::TimedOut | Self::Interrupted | Self::Stale | Self::Unavailable
        )
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Receipt {
    status: Status,
    updated_at: f64,
    completed_cases: u64,
    metric: Option<Metric>,
    git_commit: Option<String>,
    #[serde(default)]
    validation: Option<String>,
}

#[derive(Deserialize, Serialize)]
pub struct Metric {
    name: String,
    value: f64,
    baseline: f64,
    unit: Option<String>,
}

struct IndexedEntry {
    record: Entry,
    search: String,
    family: usize,
    receipt: Option<Receipt>,
}

impl IndexedEntry {
    fn status(&self, now: f64) -> Status {
        match &self.receipt {
            Some(receipt) if receipt.status == Status::Running && now > receipt.updated_at + 8.0 => Status::Stale,
            Some(receipt) => receipt.status,
            None if self.record.queued => Status::Queued,
            None => Status::Planned,
        }
    }

    fn scored(&self) -> Option<(&Evaluation, &Metric)> {
        let evaluation =
            self.record.evaluation.as_ref().filter(|value| !value.id.trim().is_empty())?;
        let receipt = self.receipt.as_ref().filter(|value| value.status == Status::Completed)?;
        Some((evaluation, receipt.metric.as_ref()?))
    }

    fn score_outcome(&self, status: Status) -> Option<ScoreOutcome> {
        if matches!(status, Status::Failed | Status::TimedOut | Status::Interrupted) {
            return Some(ScoreOutcome::Failed);
        }
        let (evaluation, metric) = self.scored()?;
        Some(if (metric.value - metric.baseline).abs() <= evaluation.tolerance {
            ScoreOutcome::Neutral
        } else if (metric.value < metric.baseline) == (evaluation.direction == Direction::Lower) {
            ScoreOutcome::Improved
        } else {
            ScoreOutcome::Worse
        })
    }

    fn compare_score(&self, other: &Self) -> std::cmp::Ordering {
        match (self.scored(), other.scored()) {
            (Some((left, a)), Some((right, b))) => (&left.id, &a.name, &a.unit, left.direction)
                .cmp(&(&right.id, &b.name, &b.unit, right.direction))
                .then_with(|| match left.direction {
                    Direction::Lower => a.value.total_cmp(&b.value),
                    Direction::Higher => b.value.total_cmp(&a.value),
                }),
            (Some(_), None) => std::cmp::Ordering::Less,
            (None, Some(_)) => std::cmp::Ordering::Greater,
            (None, None) => std::cmp::Ordering::Equal,
        }
    }
}

struct Snapshot {
    entries: Vec<IndexedEntry>,
    positions: HashMap<String, usize>,
}

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum View {
    Active,
    All,
    Attention,
}

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Sort {
    Updated,
    Experiment,
    Score,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Query {
    view: View,
    sort: Sort,
    search: String,
    git_commit: Option<String>,
    node_id: Option<String>,
    descendant_node_ids: Option<HashSet<String>>,
    related_to: Option<String>,
    score_outcome: Option<ScoreOutcome>,
    offset: usize,
    limit: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Row<'a> {
    id: &'a str,
    title: &'a str,
    node_id: &'a str,
    retry_of: Option<&'a str>,
    status: Status,
    total_cases: Option<u64>,
    completed_cases: Option<u64>,
    updated_at: Option<f64>,
    metric: Option<&'a Metric>,
    outcome: Option<&'a str>,
    score_outcome: Option<ScoreOutcome>,
    evaluation: Option<&'a str>,
    git_commit: Option<&'a str>,
    validation: Option<&'a str>,
}

#[derive(Default, Serialize)]
struct Counts {
    all: usize,
    active: usize,
    attention: usize,
}

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
struct BranchRun<'a> {
    id: &'a str,
    status: Status,
    completed_cases: Option<u64>,
    total_cases: Option<u64>,
    #[serde(skip)]
    updated_at: f64,
}

impl BranchRun<'_> {
    fn priority(self) -> u8 {
        match self.status {
            Status::Running => 2,
            Status::Queued => 1,
            _ => 0,
        }
    }
}

#[derive(Clone, Copy, Serialize)]
struct BranchScore<'a> {
    id: &'a str,
    metric: &'a Metric,
    outcome: Option<ScoreOutcome>,
    #[serde(skip)]
    updated_at: f64,
    #[serde(skip)]
    direction: Direction,
    #[serde(skip)]
    evaluation: &'a str,
}

#[derive(Default, Clone, Copy, Serialize)]
struct BranchSummary<'a> {
    total: usize,
    run: Option<BranchRun<'a>>,
    score: Option<BranchScore<'a>>,
    best: Option<BranchScore<'a>>,
}

impl<'a> BranchSummary<'a> {
    fn merge(&mut self, other: Self) {
        self.total += other.total;
        if let Some(run) = other.run {
            if self.run.is_none_or(|old| {
                run.priority().cmp(&old.priority())
                    .then_with(|| run.updated_at.total_cmp(&old.updated_at)).is_gt()
            }) {
                self.run = Some(run);
            }
        }
        if let Some(candidate) = other.best {
            if self.best.is_none_or(|old| candidate.evaluation == old.evaluation
                && ((candidate.metric.value < old.metric.value) == (candidate.direction == Direction::Lower))
                && candidate.metric.value != old.metric.value) {
                self.best = Some(candidate);
            }
        }
        if let Some(score) = other.score {
            if self.score.is_none_or(|old| score.updated_at.total_cmp(&old.updated_at).is_gt()) {
                self.score = Some(score);
            }
        }
    }
}

fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 128
        && id.bytes().all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
}

fn read_small_json<T: DeserializeOwned>(path: &Path) -> std::io::Result<(T, fs::Metadata)> {
    let metadata = fs::symlink_metadata(path)?;
    if !metadata.is_file() || metadata.len() > 256 * 1024 {
        return Err(ErrorKind::InvalidData.into());
    }
    let mut bytes = Vec::new();
    fs::File::open(path)?.take(256 * 1024).read_to_end(&mut bytes)?;
    let value = serde_json::from_slice(&bytes).map_err(std::io::Error::other)?;
    Ok((value, metadata))
}

#[derive(Deserialize)]
struct LaunchFailure {
    status: Status,
    reason: String,
}

fn read_receipt(root: &Path, id: &str) -> Option<Receipt> {
    let relative = format!("experiments/{id}/{RUN_RECEIPT}");
    let unavailable = || Receipt {
        status: Status::Unavailable,
        updated_at: 0.0,
        completed_cases: 0,
        metric: None,
        git_commit: None,
        validation: None,
    };
    let path = match project::safe_path(root, &relative) {
        Ok(path) => path,
        Err(error) if error == project::PROJECT_FILE_NOT_FOUND => return None,
        Err(_) => return Some(unavailable()),
    };
    match read_small_json::<Receipt>(&path) {
        Ok((mut receipt, _)) => {
            receipt.git_commit = receipt.git_commit.take().filter(|hash| {
                matches!(hash.len(), 40 | 64) && hash.bytes().all(|byte| byte.is_ascii_hexdigit())
            });
            // Scores are provisional until a separately recorded verification passes.
            let validation = path.with_file_name("validation.json");
            let validation_data = read_small_json::<serde_json::Value>(&validation).ok();
            receipt.validation = validation_data.as_ref().and_then(|(value, _)| value["status"].as_str().map(str::to_owned));
            let identities_match = validation_data.as_ref().is_none_or(|(value, _)| {
                [("artifacts", path.parent().unwrap()), ("evaluator", root)].iter().all(|(field, base)| {
                    value[*field].as_object().is_none_or(|files| files.iter().all(|(name, expected)| {
                        project::safe_path(base, name).ok().and_then(|file| fs::read(file).ok())
                            .is_some_and(|bytes| format!("{:x}", Sha256::digest(bytes)) == expected.as_str().unwrap_or(""))
                    }))
                })
            });
            if !identities_match {
                receipt.validation = Some("error".into());
            }
            receipt.metric = validation_data.filter(|(value, _)| identities_match && value["status"] == "passed" && value["attemptId"] == id)
                .and_then(|(value, _)| serde_json::from_value(value["metric"].clone()).ok());
            return Some(receipt);
        }
        Err(error) if error.kind() == ErrorKind::NotFound => {}
        Err(_) => return Some(unavailable()),
    }
    match read_small_json::<LaunchFailure>(&path.with_file_name(LAUNCH_RECEIPT)) {
        Ok((failure, metadata))
            if failure.status == Status::Failed && !failure.reason.trim().is_empty() =>
        {
            Some(Receipt {
                status: Status::Failed,
                updated_at: metadata
                    .modified()
                    .ok()
                    .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
                    .map_or(0.0, |time| time.as_secs_f64()),
                completed_cases: 0,
                metric: None,
                git_commit: None,
        validation: None,
            })
        }
        Err(error) if error.kind() == ErrorKind::NotFound => None,
        _ => Some(unavailable()),
    }
}

impl Snapshot {
    fn load(root: &Path, previous: Option<Self>, changes: Changes) -> Result<Self, String> {
        let mut snapshot = if changes.journal || previous.is_none() {
            let source = project::read_file(root, "experiments.json")?;
            let journal: Journal =
                serde_json::from_str(&source).map_err(|error| error.to_string())?;
            if journal.version != 1 {
                return Err("Unsupported experiment journal version.".into());
            }
            let mut positions = HashMap::new();
            let mut entries = Vec::with_capacity(journal.experiments.len());
            for record in journal.experiments {
                if !valid_id(&record.id)
                    || positions.insert(record.id.clone(), entries.len()).is_some()
                {
                    return Err("Invalid or duplicate experiment ID.".into());
                }
                let search = format!("{} {}", record.id, record.title).to_lowercase();
                entries.push(IndexedEntry { record, search, family: entries.len(), receipt: None });
            }
            // Connect attempts with a retry link, including chains and imported journals.
            for index in 0..entries.len() {
                if let Some(&parent) =
                    entries[index].record.retry_of.as_ref().and_then(|id| positions.get(id))
                {
                    let left = family(&mut entries, index);
                    let right = family(&mut entries, parent);
                    entries[left.max(right)].family = left.min(right);
                }
            }
            for index in 0..entries.len() {
                entries[index].family = family(&mut entries, index);
            }
            let mut old = previous
                .map(|snapshot| {
                    snapshot
                        .entries
                        .into_iter()
                        .map(|entry| (entry.record.id, entry.receipt))
                        .collect::<HashMap<_, _>>()
                })
                .unwrap_or_default();
            for entry in &mut entries {
                entry.receipt = match old.remove(&entry.record.id) {
                    Some(receipt) if !changes.all_receipts => receipt,
                    _ => read_receipt(root, &entry.record.id),
                };
            }
            Self { entries, positions }
        } else {
            let mut snapshot = previous.expect("existing experiment snapshot");
            if changes.all_receipts {
                for entry in &mut snapshot.entries {
                    entry.receipt = read_receipt(root, &entry.record.id);
                }
            }
            snapshot
        };
        if !changes.all_receipts {
            for id in changes.receipts {
                if let Some(&index) = snapshot.positions.get(&id) {
                    snapshot.entries[index].receipt = read_receipt(root, &id);
                }
            }
        }
        Ok(snapshot)
    }

    fn query(&self, query: Query, now: f64) -> Result<serde_json::Value, String> {
        let mut counts = Counts::default();
        let search = query.search.trim().to_lowercase();
        let related = query.related_to.as_ref().and_then(|id| self.positions.get(id));
        let mut matching = Vec::new();
        for (index, entry) in self.entries.iter().enumerate() {
            let record = &entry.record;
            if query.git_commit.as_ref().is_some_and(|hash| {
                entry
                    .receipt
                    .as_ref()
                    .and_then(|receipt| receipt.git_commit.as_deref())
                    .is_none_or(|recorded| !recorded.eq_ignore_ascii_case(hash))
            }) || query.node_id.as_ref().is_some_and(|node| {
                node != &record.node_id
                    && !query.descendant_node_ids.as_ref().is_some_and(|ids| ids.contains(&record.node_id))
            })
                || (!entry.search.contains(&search)
                    && !entry
                        .receipt
                        .as_ref()
                        .and_then(|value| value.git_commit.as_deref())
                        .is_some_and(|hash| hash.contains(&search)))
                || (query.related_to.is_some()
                    && !related.is_some_and(|other| self.entries[*other].family == entry.family))
            {
                continue;
            }
            let status = entry.status(now);
            counts.all += 1;
            counts.active += usize::from(status.active());
            counts.attention += usize::from(status.needs_attention());
            let score_outcome = entry.score_outcome(status);
            if query.score_outcome.is_some() && query.score_outcome != score_outcome {
                continue;
            }
            if matches!(query.view, View::All)
                || matches!(query.view, View::Active) && status.active()
                || matches!(query.view, View::Attention) && status.needs_attention()
            {
                matching.push((index, status, score_outcome));
            }
        }
        matching.sort_unstable_by(|(left, _, _), (right, _, _)| {
            let left_entry = &self.entries[*left];
            let right_entry = &self.entries[*right];
            match query.sort {
                Sort::Updated => {
                    let time = |entry: &IndexedEntry| {
                        entry.receipt.as_ref().map_or(0.0, |receipt| receipt.updated_at)
                    };
                    time(right_entry).total_cmp(&time(left_entry))
                }
                Sort::Score => left_entry.compare_score(right_entry),
                Sort::Experiment => left_entry.search.cmp(&right_entry.search),
            }
            .then_with(|| left.cmp(right))
        });
        let total = matching.len();
        let limit = query.limit.clamp(1, 100);
        let offset = query.offset.min(total.saturating_sub(1) / limit * limit);
        let rows = matching
            .into_iter()
            .skip(offset)
            .take(limit)
            .map(|(index, status, score_outcome)| {
                let IndexedEntry { record, receipt, .. } = &self.entries[index];
                let receipt =
                    receipt.as_ref().filter(|receipt| receipt.status != Status::Unavailable);
                Row {
                    id: &record.id,
                    title: &record.title,
                    node_id: &record.node_id,
                    retry_of: record.retry_of.as_deref(),
                    status,
                    total_cases: record.total_cases,
                    completed_cases: receipt.map(|receipt| receipt.completed_cases),
                    updated_at: receipt.map(|receipt| receipt.updated_at),
                    outcome: record.outcome.as_deref(),
                    metric: receipt
                        .filter(|value| value.status == Status::Completed)
                        .and_then(|receipt| receipt.metric.as_ref()),
                    score_outcome,
                    evaluation: record.evaluation.as_ref().map(|evaluation| evaluation.id.as_str()),
                    git_commit: receipt.and_then(|value| value.git_commit.as_deref()),
                    validation: receipt.and_then(|value| value.validation.as_deref()),
                }
            })
            .collect::<Vec<_>>();
        serde_json::to_value(Page { counts, total, offset, rows })
            .map_err(|error| error.to_string())
    }

    fn branch_summaries(&self, topics: &[(String, usize)], now: f64) -> Result<serde_json::Value, String> {
        if topics.len() > 4096 {
            return Err("Too many research topics.".into());
        }
        let mut positions = HashMap::with_capacity(topics.len());
        let mut ancestors = Vec::new();
        let mut parents = Vec::with_capacity(topics.len());
        for (index, (id, depth)) in topics.iter().enumerate() {
            if *depth > 32 || *depth > ancestors.len() || positions.insert(id.as_str(), index).is_some() {
                return Err("Invalid research topic hierarchy.".into());
            }
            ancestors.truncate(*depth);
            parents.push(ancestors.last().copied());
            ancestors.push(index);
        }

        let mut summaries = vec![BranchSummary::default(); topics.len()];
        for entry in &self.entries {
            let Some(&index) = positions.get(entry.record.node_id.as_str()) else { continue };
            let status = entry.status(now);
            let receipt = entry.receipt.as_ref().filter(|_| status != Status::Unavailable);
            let id = entry.record.id.as_str();
            let score = receipt.filter(|_| status == Status::Completed).and_then(|receipt| {
                Some(BranchScore {
                    id,
                    metric: receipt.metric.as_ref()?,
                    outcome: entry.score_outcome(status),
                    updated_at: receipt.updated_at,
                    direction: entry.record.evaluation.as_ref()?.direction,
                    evaluation: &entry.record.evaluation.as_ref()?.id,
                })
            });
            summaries[index].merge(BranchSummary {
                total: 1,
                run: Some(BranchRun {
                    id, status,
                    completed_cases: receipt.map(|receipt| receipt.completed_cases),
                    total_cases: entry.record.total_cases,
                    updated_at: receipt.map_or(0.0, |receipt| receipt.updated_at),
                }),
                score,
                best: score,
            });
        }
        for (index, parent) in parents.into_iter().enumerate().rev() {
            if let Some(parent) = parent {
                let child = summaries[index];
                summaries[parent].merge(child);
            }
        }
        let summarized: BTreeMap<_, _> = topics.iter().zip(summaries)
            .filter(|(_, summary)| summary.total > 0)
            .map(|((id, _), summary)| (id, summary)).collect();
        serde_json::to_value(summarized).map_err(|error| error.to_string())
    }
}

fn family(entries: &mut [IndexedEntry], mut index: usize) -> usize {
    while entries[index].family != index {
        entries[index].family = entries[entries[index].family].family;
        index = entries[index].family;
    }
    index
}

#[derive(Serialize)]
struct Page<'a> {
    counts: Counts,
    total: usize,
    offset: usize,
    rows: Vec<Row<'a>>,
}

impl ExperimentIndex {
    pub fn note_changes(&self, root: &Path, paths: &[std::path::PathBuf], reconcile: bool) {
        let mut changes = self.changes.lock().unwrap_or_else(PoisonError::into_inner);
        changes.journal |= reconcile;
        changes.all_receipts |= reconcile;
        for path in paths {
            let Ok(relative) = path.strip_prefix(root) else { continue };
            if relative == Path::new("experiments.json") {
                changes.journal = true;
            } else if relative == Path::new("experiments") || !relative.starts_with("experiments") {
                changes.all_receipts = true;
            }
            let mut components = relative.components();
            if components.next() != Some(Component::Normal("experiments".as_ref())) {
                continue;
            }
            let Some(Component::Normal(id)) = components.next() else { continue };
            if let Some(id) = id.to_str().filter(|id| valid_id(id)) {
                match (components.next(), components.next()) {
                    (None, None) => {
                        changes.receipts.insert(id.to_owned());
                    }
                    (Some(Component::Normal(file)), None)
                        if file == RUN_RECEIPT || file == LAUNCH_RECEIPT || file == "validation.json" =>
                    {
                        changes.receipts.insert(id.to_owned());
                    }
                    _ => { changes.receipts.insert(id.to_owned()); }
                }
            }
        }
    }

    pub fn query(&self, root: &Path, query: Query) -> Result<serde_json::Value, String> {
        if query.git_commit.is_some()
            && fs::symlink_metadata(root.join("experiments.json"))
                .is_err_and(|error| error.kind() == ErrorKind::NotFound)
        {
            return Ok(serde_json::json!({
                "counts": Counts::default(), "total": 0, "offset": 0, "rows": [],
            }));
        }
        self.with_snapshot(root, |snapshot, now| snapshot.query(query, now))
    }

    pub fn chart_progress(&self, root: &Path) -> Result<serde_json::Value, String> {
        self.with_snapshot(root, |snapshot, now| {
            let rows: Vec<_> = snapshot.entries.iter().map(|entry| {
                let status = entry.status(now);
                let receipt = entry.receipt.as_ref();
                serde_json::json!({
                    "id": entry.record.id, "title": entry.record.title,
                    "nodeId": entry.record.node_id, "status": status,
                    "evaluation": entry.record.evaluation.as_ref().map(|e| &e.id),
                    "direction": entry.record.evaluation.as_ref().map(|e| if e.direction == Direction::Lower { "lower" } else { "higher" }),
                    "updatedAt": receipt.map(|r| r.updated_at),
                    "validation": receipt.and_then(|r| r.validation.as_deref()),
                    "metric": receipt.filter(|r| r.status == Status::Completed).and_then(|r| r.metric.as_ref()),
                    "scoreOutcome": entry.score_outcome(status)
                })
            }).collect();
            Ok(serde_json::json!(rows))
        })
    }

    pub fn branch_summaries(&self, root: &Path, topics: &[(String, usize)]) -> Result<serde_json::Value, String> {
        if fs::symlink_metadata(root.join("experiments.json"))
            .is_err_and(|error| error.kind() == ErrorKind::NotFound)
        {
            return Ok(serde_json::json!({}));
        }
        self.with_snapshot(root, |snapshot, now| snapshot.branch_summaries(topics, now))
    }

    fn with_snapshot(&self, root: &Path, operation: impl FnOnce(&Snapshot, f64) -> Result<serde_json::Value, String>) -> Result<serde_json::Value, String> {
        let mut snapshot = self.snapshot.lock().unwrap_or_else(PoisonError::into_inner);
        let changes =
            std::mem::take(&mut *self.changes.lock().unwrap_or_else(PoisonError::into_inner));
        if snapshot.is_none()
            || changes.journal
            || changes.all_receipts
            || !changes.receipts.is_empty()
        {
            *snapshot = Some(Snapshot::load(root, snapshot.take(), changes)?);
        }
        let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs_f64();
        operation(snapshot.as_ref().expect("loaded experiment snapshot"), now)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::TempDir;

    #[test]
    fn legacy_unverified_metric_is_not_ranked() {
        let temp = TempDir::new("unverified-score");
        let root = temp.as_ref();
        fs::create_dir_all(root.join("experiments/legacy")).unwrap();
        fs::write(root.join("experiments/legacy/run-status.json"),
            r#"{"status":"completed","updatedAt":1,"completedCases":1,"metric":{"name":"score","value":0,"baseline":10}}"#).unwrap();
        let receipt = read_receipt(root, "legacy").unwrap();
        assert!(receipt.metric.is_none());
        assert!(receipt.validation.is_none());
    }

    #[test]
    fn modified_artifact_invalidates_saved_score() {
        let temp = TempDir::new("modified-artifact");
        let root = temp.as_ref();
        let folder = root.join("experiments/run");
        fs::create_dir_all(&folder).unwrap();
        fs::write(folder.join("run-status.json"), r#"{"status":"completed","updatedAt":1,"completedCases":1}"#).unwrap();
        fs::write(folder.join("result.json"), "changed").unwrap();
        fs::write(folder.join("validation.json"), serde_json::json!({"status":"passed","attemptId":"run","artifacts":{"result.json":"wrong-hash"},"metric":{"name":"score","value":0,"baseline":10}}).to_string()).unwrap();
        let receipt = read_receipt(root, "run").unwrap();
        assert!(receipt.metric.is_none());
        assert_eq!(receipt.validation.as_deref(), Some("error"));
    }

    #[test]
    fn branch_summaries_roll_up_real_status_and_latest_completed_score() {
        let temp = TempDir::new("branch-summary");
        let root = temp.as_ref();
        fs::write(root.join("experiments.json"), r#"{"version":1,"experiments":[
          {"id":"older","title":"Older","nodeId":"trial"},
          {"id":"done","title":"Done","nodeId":"trial","evaluation":{"id":"side","direction":"lower"}},
          {"id":"live","title":"Live","nodeId":"trial","totalCases":7},
          {"id":"unrelated","title":"Unrelated","nodeId":"control"}
        ]}"#).unwrap();
        for (id, receipt) in [
            ("older", r#"{"status":"completed","updatedAt":35,"completedCases":7,"metric":{"name":"Side","value":4.5,"baseline":4.6}}"#),
            ("done", r#"{"status":"completed","updatedAt":48,"completedCases":7,"metric":{"name":"Side","value":4.7,"baseline":4.6}}"#),
            ("live", r#"{"status":"running","updatedAt":45,"completedCases":3}"#),
        ] {
            let path = root.join("experiments").join(id);
            fs::create_dir_all(&path).unwrap();
            fs::write(path.join(RUN_RECEIPT), receipt).unwrap();
            let parsed: serde_json::Value = serde_json::from_str(receipt).unwrap();
            fs::write(path.join("validation.json"), serde_json::json!({"status":"passed","attemptId":id,"metric":parsed["metric"]}).to_string()).unwrap();
        }
        let snapshot = Snapshot::load(root, None, Changes::default()).unwrap();
        let topics = [("root".into(), 0), ("branch".into(), 1), ("trial".into(), 2),
            ("control".into(), 1), ("empty".into(), 1)];
        let summaries = snapshot.branch_summaries(&topics, 50.0).unwrap();
        assert_eq!(summaries["root"]["total"], 4);
        assert_eq!(summaries["branch"]["total"], 3);
        assert_eq!(summaries["branch"]["run"]["status"], "running");
        assert_eq!(summaries["branch"]["run"]["completedCases"], 3);
        assert_eq!(summaries["branch"]["score"]["id"], "done");
        assert_eq!(summaries["branch"]["score"]["metric"]["value"], 4.7);
        assert_eq!(summaries["branch"]["score"]["outcome"], "worse");
        assert_eq!(summaries["control"]["run"]["status"], "planned");
        assert!(summaries["control"]["score"].is_null());
        assert!(summaries.get("empty").is_none());
        let stale = snapshot.branch_summaries(&topics, 60.0).unwrap();
        assert_eq!(stale["branch"]["run"]["status"], "completed");
    }

    #[test]
    fn filters_outcomes_and_ranks_only_compatible_completed_scores() {
        let hash = "a".repeat(40);
        let rows = [
            ("best", "packing-17", "lower", "completed", 4.0, 5.0),
            ("neutral", "packing-17", "lower", "completed", 5.0, 5.0),
            ("worse", "packing-17", "lower", "completed", 6.0, 5.0),
            ("failed", "packing-17", "lower", "failed", 1.0, 5.0),
            ("other", "packing-18", "lower", "completed", 1.0, 5.0),
            ("higher", "success-rate", "higher", "completed", 6.0, 5.0),
        ];
        let temp = TempDir::new("scored-experiments");
        let root = temp.as_ref();
        let records: Vec<_> = rows
            .iter()
            .map(|(id, evaluation, direction, status, value, baseline)| {
                let folder = root.join("experiments").join(id);
                fs::create_dir_all(&folder).unwrap();
                fs::write(
                    folder.join(RUN_RECEIPT),
                    serde_json::json!({
                        "status": status, "completedCases": 1, "updatedAt": 1,
                        "gitCommit": if *id == "best" { Some(&hash) } else { None },
                        "metric": { "name": "score", "value": value, "baseline": baseline },
                    })
                    .to_string(),
                )
                .unwrap();
                fs::write(folder.join("validation.json"), serde_json::json!({"status":"passed","attemptId":id,
                    "metric":{"name":"score","value":value,"baseline":baseline}}).to_string()).unwrap();
                serde_json::json!({
                    "id": id, "title": id, "nodeId": "packing",
                    "evaluation": {"id": evaluation, "direction": direction},
                })
            })
            .collect();
        fs::write(
            root.join("experiments.json"),
            serde_json::json!({
                "version": 1, "experiments": records,
            })
            .to_string(),
        )
        .unwrap();
        let index = ExperimentIndex::default();
        let query = || Query {
            view: View::All,
            sort: Sort::Score,
            search: String::new(),
            git_commit: None,
            node_id: None,
            descendant_node_ids: None,
            related_to: None,
            score_outcome: None,
            offset: 0,
            limit: 50,
        };
        let result = index.query(root, query()).unwrap();
        let result = result["rows"].as_array().unwrap();
        assert_eq!(
            result.iter().map(|row| row["id"].as_str().unwrap()).collect::<Vec<_>>(),
            ["best", "neutral", "worse", "other", "higher", "failed"]
        );
        assert_eq!(result[4]["scoreOutcome"], "improved");
        assert!(result[5]["metric"].is_null());
        for (outcome, expected) in [
            (ScoreOutcome::Improved, 3),
            (ScoreOutcome::Neutral, 1),
            (ScoreOutcome::Worse, 1),
            (ScoreOutcome::Failed, 1),
        ] {
            let report =
                index.query(root, Query { score_outcome: Some(outcome), ..query() }).unwrap();
            assert_eq!(report["total"], expected);
        }
        let report = index.query(root, Query { search: hash[..8].into(), ..query() }).unwrap();
        assert_eq!(report["total"], 1);
        assert_eq!(report["rows"][0]["gitCommit"], hash);
        let report =
            index.query(root, Query { git_commit: Some(hash.clone()), ..query() }).unwrap();
        assert_eq!(report["total"], 1);
        let report =
            index.query(root, Query { git_commit: Some(hash[..8].into()), ..query() }).unwrap();
        assert_eq!(report["total"], 0);
    }

    #[test]
    fn pages_ten_thousand_records_and_refreshes_only_changed_receipts() {
        let temp = TempDir::new("large-experiment-index");
        let root = temp.as_ref();
        let records: Vec<_> = (0..10_000)
            .map(|index| {
                serde_json::json!({
                    "id": format!("E-{index:05}"), "title": format!("Test {index}"),
                    "nodeId": if index % 2 == 0 { "packing" } else if index % 4 == 1 { "dilation" } else { "controls" },
                    "retryOf": if index == 9999 { Some("E-00000") } else { None },
                })
            })
            .collect();
        fs::write(
            root.join("experiments.json"),
            serde_json::to_vec(&serde_json::json!({
                "version": 1, "experiments": records,
            }))
            .unwrap(),
        )
        .unwrap();
        let index = ExperimentIndex::default();
        let query = || Query {
            view: View::All,
            sort: Sort::Experiment,
            search: String::new(),
            git_commit: None,
            node_id: None,
            descendant_node_ids: None,
            related_to: None,
            score_outcome: None,
            offset: 9950,
            limit: 50,
        };
        let report = index.query(root, query()).unwrap();
        assert_eq!(report["total"], 10_000);
        assert_eq!(index.chart_progress(root).unwrap().as_array().unwrap().len(), 10_000);
        assert_eq!(report["rows"].as_array().unwrap().len(), 50);
        assert_eq!(report["rows"][49]["id"], "E-09999");

        let receipt = root.join("experiments/E-09999/run-status.json");
        fs::create_dir_all(receipt.parent().unwrap()).unwrap();
        fs::write(&receipt, r#"{"status":"running","updatedAt":1,"completedCases":3}"#).unwrap();
        index.note_changes(root, &[receipt.clone()], false);
        let report = index.query(root, Query { view: View::Attention, ..query() }).unwrap();
        assert_eq!(report["total"], 1);
        assert_eq!(report["offset"], 0);
        assert_eq!(report["rows"][0]["status"], "stale");
        assert_eq!(report["rows"][0]["completedCases"], 3);

        let report =
            index.query(root, Query { related_to: Some("E-09999".into()), ..query() }).unwrap();
        assert_eq!(report["total"], 2);
        let report =
            index.query(root, Query { node_id: Some("packing".into()), ..query() }).unwrap();
        assert_eq!(report["total"], 5000);
        let branch = index.query(root, Query {
            node_id: Some("packing".into()),
            descendant_node_ids: Some(HashSet::from(["dilation".into()])),
            offset: 0,
            ..query()
        }).unwrap();
        assert_eq!(branch["total"], 7500);
        assert_eq!(branch["rows"][0]["nodeId"], "packing");
        assert_eq!(branch["rows"][1]["nodeId"], "dilation");
        assert_eq!(branch["rows"][3]["id"], "E-00004");
        let report = index.query(root, Query { search: "E-01234".into(), ..query() }).unwrap();
        assert_eq!(report["total"], 1);

        fs::write(&receipt, "invalid JSON").unwrap();
        index.note_changes(root, &[receipt.clone()], false);
        let report = index.query(root, Query { view: View::Attention, ..query() }).unwrap();
        assert_eq!(report["rows"][0]["status"], "unavailable");
        fs::write(&receipt, r#"{"status":"completed","updatedAt":1,"completedCases":7}"#).unwrap();
        index.note_changes(root, &[receipt], false);
        let report = index.query(root, Query { view: View::Attention, ..query() }).unwrap();
        assert_eq!(report["total"], 0);
        assert_eq!(report["counts"]["all"], 10_000);
    }

    #[test]
    fn updates_the_index_when_launch_fails_before_the_runner_starts() {
        let temp = TempDir::new("launch-status");
        let root = temp.as_ref();
        let attempt = root.join("experiments/E-001");
        fs::create_dir_all(&attempt).unwrap();
        fs::write(root.join("experiments.json"), r#"{"version":1,"experiments":[{"id":"E-001","nodeId":"square","title":"Check the layout"}]}"#).unwrap();
        let index = ExperimentIndex::default();
        let page = || Query {
            view: View::All,
            sort: Sort::Updated,
            search: String::new(),
            git_commit: None,
            node_id: None,
            descendant_node_ids: None,
            related_to: None,
            score_outcome: None,
            offset: 0,
            limit: 50,
        };
        assert_eq!(index.query(root, page()).unwrap()["rows"][0]["status"], "planned");

        let launch = attempt.join(LAUNCH_RECEIPT);
        fs::write(&launch, r#"{"status":"failed","reason":"Interpreter startup timed out."}"#)
            .unwrap();
        index.note_changes(root, &[launch], false);
        let report = index.query(root, page()).unwrap();
        assert_eq!(report["counts"]["attention"], 1);
        assert_eq!(report["rows"][0]["status"], "failed");
        assert_eq!(report["rows"][0]["completedCases"], 0);

        let run = attempt.join(RUN_RECEIPT);
        fs::write(&run, r#"{"status":"completed","updatedAt":1,"completedCases":7}"#).unwrap();
        index.note_changes(root, &[run], false);
        assert_eq!(index.query(root, page()).unwrap()["rows"][0]["status"], "completed");
    }
}
