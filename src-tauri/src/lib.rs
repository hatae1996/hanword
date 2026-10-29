//! HanWord 데스크톱 앱 (Tauri)
//!
//! 편집·변환은 모두 웹 쪽(TypeScript)에서 하고, Rust 쪽은 파일 읽기/쓰기만 맡는다.
//! 그래서 브라우저 데모와 데스크톱 앱이 완전히 같은 저장기를 쓴다.

use tauri::ipc::{InvokeBody, Request, Response};

/// 파일을 바이트 그대로 읽어 돌려준다 (JS 에서는 ArrayBuffer 로 받음)
#[tauri::command]
fn read_file(path: String) -> Result<Response, String> {
    std::fs::read(&path)
        .map(Response::new)
        .map_err(|e| format!("파일을 읽을 수 없습니다: {e}"))
}

/// 요청 본문(바이트)을 파일로 저장한다. 경로는 `path` 헤더(URL 인코딩)로 받는다.
/// 임시 파일에 먼저 쓴 뒤 바꿔치기하므로, 저장 도중 꺼져도 원본 파일이 깨지지 않는다.
#[tauri::command]
fn write_file(request: Request<'_>) -> Result<(), String> {
    let InvokeBody::Raw(data) = request.body() else {
        return Err("잘못된 저장 요청입니다".into());
    };
    let raw = request
        .headers()
        .get("path")
        .and_then(|v| v.to_str().ok())
        .ok_or("저장 경로가 없습니다")?;
    let path = percent_encoding::percent_decode_str(raw)
        .decode_utf8()
        .map_err(|e| e.to_string())?
        .into_owned();

    let tmp = format!("{path}.hanword-tmp");
    std::fs::write(&tmp, data).map_err(|e| format!("저장할 수 없습니다: {e}"))?;
    std::fs::rename(&tmp, &path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        format!("저장할 수 없습니다 (다른 프로그램에서 열려 있으면 닫고 다시 시도하세요): {e}")
    })
}

/// 탐색기의 "연결 프로그램"으로 실행될 때 넘어온 파일 경로
#[tauri::command]
fn launch_file() -> Option<String> {
    std::env::args().skip(1).find(|a| !a.starts_with('-'))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init()) // 업데이트 후 다시 시작
        .plugin(tauri_plugin_updater::Builder::new().build()) // 자동 업데이트
        .invoke_handler(tauri::generate_handler![read_file, write_file, launch_file])
        .run(tauri::generate_context!())
        .expect("HanWord 를 시작할 수 없습니다");
}
