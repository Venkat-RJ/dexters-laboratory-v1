fn main() {
    println!("cargo:rerun-if-changed=src/process_inspector.c");
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        cc::Build::new()
            .file("src/process_inspector.c")
            .warnings(true)
            .compile("lattice_process_inspector");
    }
}
