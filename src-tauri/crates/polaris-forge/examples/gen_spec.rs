//! 开发自检:spec.json → .pptx(绕开 polaris-cli 的音频依赖,只走 polaris-forge 库)。
//! 用法: cargo run -p polaris-forge --example gen_spec -- <spec.json> <out.pptx>
fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 3 {
        eprintln!("用法: gen_spec <spec.json> <out.pptx>");
        std::process::exit(2);
    }
    let spec = std::fs::read_to_string(&args[1]).expect("读 spec 失败");
    match polaris_forge::forge::pptx_native::build_pptx_from_spec(&spec, &args[2]) {
        Ok(v) => println!("{v}"),
        Err(e) => {
            eprintln!("失败: {e}");
            std::process::exit(1);
        }
    }
}
