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

/// 인쇄: Windows 기본 인쇄 대화상자 (설치된 모든 프린터·프린터 속성이 나온다).
/// 웹 보기(WebView2)의 기본 window.print() 는 브라우저식 미리 보기라 일부 프린터가 안 보이고
/// 날짜·주소 머리글이 붙을 수 있어서, 한글·Word 와 같은 시스템 대화상자를 연다.
/// 오래된 WebView2 등으로 실패하면 Err → 웹 쪽에서 window.print() 로 대신한다.
/// (async: 주 스레드가 아닌 곳에서 돌아야 with_webview 결과를 기다려도 멈추지 않는다)
#[tauri::command(async)]
fn print_system(webview: tauri::Webview) -> Result<(), String> {
    #[cfg(windows)]
    {
        let (tx, rx) = std::sync::mpsc::channel::<Result<(), String>>();
        webview
            .with_webview(move |pw| {
                use webview2_com::Microsoft::Web::WebView2::Win32::{
                    ICoreWebView2_16, COREWEBVIEW2_PRINT_DIALOG_KIND_SYSTEM,
                };
                use windows_core::Interface;
                let r = unsafe {
                    pw.controller()
                        .CoreWebView2()
                        .and_then(|w| w.cast::<ICoreWebView2_16>())
                        .and_then(|w| w.ShowPrintUI(COREWEBVIEW2_PRINT_DIALOG_KIND_SYSTEM))
                };
                let _ = tx.send(r.map_err(|e| e.to_string()));
            })
            .map_err(|e| e.to_string())?;
        rx.recv_timeout(std::time::Duration::from_secs(10))
            .map_err(|e| e.to_string())?
    }
    #[cfg(not(windows))]
    {
        let _ = webview;
        Err("system print dialog is Windows only".into())
    }
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
        .invoke_handler(tauri::generate_handler![read_file, write_file, launch_file, print_system])
        .run(tauri::generate_context!())
        .expect("HanWord 를 시작할 수 없습니다");
}
