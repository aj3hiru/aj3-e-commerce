use tauri::webview::NewWindowResponse;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;

/// Our own sites (admin, login, store) stay inside the app; anything else opens in the browser.
fn is_ours(url: &tauri::Url) -> bool {
    match url.scheme() {
        "tauri" | "about" | "data" | "blob" => true,
        "http" | "https" => url.host_str().is_some_and(|h| {
            h == "sriandaltraders.co.in" || h.ends_with(".sriandaltraders.co.in") || h == "tauri.localhost" || h == "localhost"
        }),
        _ => false,
    }
}

pub fn run() {
    tauri::Builder::default()
        // A second launch just brings the open window to the front.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let handle = app.handle().clone();
            let popup_handle = app.handle().clone();
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("Sri Andal Admin")
                .inner_size(1440.0, 900.0)
                .min_inner_size(1024.0, 700.0)
                .center()
                .visible(true)
                .on_navigation(move |url| {
                    if is_ours(url) {
                        return true;
                    }
                    let _ = handle.opener().open_url(url.as_str(), None::<&str>);
                    false
                })
                // Pop-ups (invoice / receipt print, "Open all"): ours open in an app window, others in the browser.
                .on_new_window(move |url, _features| {
                    if is_ours(&url) {
                        return NewWindowResponse::Allow;
                    }
                    let _ = popup_handle.opener().open_url(url.as_str(), None::<&str>);
                    NewWindowResponse::Deny
                })
                // The taskbar shows the page you are on ("Orders | Patanjali Chikitsalay").
                .on_document_title_changed(|window, title| {
                    let t = title.trim();
                    let _ = window.set_title(if t.is_empty() || t.starts_with("http") { "Sri Andal Admin" } else { t });
                })
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Sri Andal Admin");
}
