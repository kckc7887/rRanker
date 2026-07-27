use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![Migration {
        version: 1,
        description: "create_desktop_foundation",
        sql: include_str!("../migrations/0001_foundation.sql"),
        kind: MigrationKind::Up,
    }];

    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:rranker.db", migrations)
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("error while running rRanker desktop");
}
