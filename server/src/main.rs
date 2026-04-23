mod config;
mod error;
mod models;
mod persistence;
mod routes;
mod state;
mod storage;
mod worker;
mod ws;

use axum::Router;
use tower_http::{
    cors::{Any, CorsLayer},
    trace::TraceLayer,
};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use crate::{
    config::Config, error::AppResult, routes::router, state::AppState, storage::BlobStorage,
};

#[tokio::main]
async fn main() -> AppResult<()> {
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "server=info,tower_http=info".into()),
        ))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = Config::from_env();
    let storage = BlobStorage::new(config.storage_root.clone()).await?;
    let state = AppState::new(config.clone(), storage).await?;

    let app: Router = router(state)
        .layer(
            CorsLayer::new()
                .allow_methods(Any)
                .allow_headers(Any)
                .allow_origin(Any),
        )
        .layer(TraceLayer::new_for_http());

    let listener = tokio::net::TcpListener::bind(config.socket_addr())
        .await
        .expect("bind listener");
    tracing::info!("server listening on {}", config.socket_addr());
    axum::serve(listener, app).await.expect("serve app");
    Ok(())
}
