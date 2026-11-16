use lattice_core::experiment_tracker::ExperimentIndex;
use std::{path::Path, time::Instant};
fn main() {
    let root = std::env::args().nth(1).unwrap();
    let root = Path::new(&root);
    let index = ExperimentIndex::default();
    let query = || serde_json::from_value(serde_json::json!({"view":"all","sort":"score","search":"","offset":0,"limit":50})).unwrap();
    let start = Instant::now();
    let first = index.query(root, query()).unwrap();
    let cold = start.elapsed().as_secs_f64() * 1000.0;
    let start = Instant::now();
    for _ in 0..100 { index.query(root, query()).unwrap(); }
    let warm = start.elapsed().as_secs_f64() * 10.0;
    let start = Instant::now();
    let chart = index.chart_progress(root).unwrap();
    println!("{}", serde_json::json!({"total":first["total"],"best":first["rows"][0],"coldQueryMs":cold,"warmMeanMs":warm,"chartQueryMs":start.elapsed().as_secs_f64()*1000.0,"chartRows":chart.as_array().unwrap().len()}));
}
