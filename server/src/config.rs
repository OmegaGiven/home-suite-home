use std::{env, net::SocketAddr, path::PathBuf};

#[allow(dead_code)]
#[derive(Clone, Debug)]
pub struct Config {
    pub host: String,
    pub port: u16,
    pub base_url: String,
    pub web_base_url: String,
    pub database_url: String,
    pub jwt_secret: String,
    pub bootstrap_email: String,
    pub bootstrap_password: String,
    pub storage_root: PathBuf,
    pub authentik_issuer: String,
    pub authentik_client_id: String,
    pub authentik_client_secret: String,
    pub turn_urls: Vec<String>,
    pub turn_username: String,
    pub turn_credential: String,
    pub transcription_model: String,
    pub transcription_device: String,
    pub whisper_command: Option<String>,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            host: env::var("APP_HOST").unwrap_or_else(|_| "0.0.0.0".into()),
            port: env::var("APP_PORT")
                .ok()
                .and_then(|value| value.parse().ok())
                .unwrap_or(8080),
            base_url: env::var("APP_BASE_URL").unwrap_or_else(|_| "http://localhost:8080".into()),
            web_base_url: env::var("WEB_BASE_URL")
                .unwrap_or_else(|_| "http://localhost:4173".into()),
            database_url: env::var("DATABASE_URL").unwrap_or_default(),
            jwt_secret: env::var("JWT_SECRET").unwrap_or_else(|_| "change-me".into()),
            bootstrap_email: env::var("BOOTSTRAP_EMAIL")
                .unwrap_or_else(|_| "admin@example.com".into()),
            bootstrap_password: env::var("BOOTSTRAP_PASSWORD")
                .unwrap_or_else(|_| "changeme123".into()),
            storage_root: env::var("STORAGE_ROOT")
                .map(PathBuf::from)
                .unwrap_or_else(|_| PathBuf::from("./storage")),
            authentik_issuer: env::var("AUTHENTIK_ISSUER").unwrap_or_default(),
            authentik_client_id: env::var("AUTHENTIK_CLIENT_ID").unwrap_or_default(),
            authentik_client_secret: env::var("AUTHENTIK_CLIENT_SECRET").unwrap_or_default(),
            turn_urls: env::var("TURN_URLS")
                .unwrap_or_else(|_| "turn:localhost:3478?transport=udp".into())
                .split(',')
                .map(|value| value.trim().to_string())
                .collect(),
            turn_username: env::var("TURN_USERNAME").unwrap_or_else(|_| "sweet".into()),
            turn_credential: env::var("TURN_CREDENTIAL").unwrap_or_else(|_| "sweetturn".into()),
            transcription_model: env::var("TRANSCRIPTION_MODEL")
                .unwrap_or_else(|_| "tiny.en".into()),
            transcription_device: env::var("TRANSCRIPTION_DEVICE")
                .unwrap_or_else(|_| "auto".into()),
            whisper_command: env::var("WHISPER_COMMAND")
                .ok()
                .filter(|value| !value.trim().is_empty()),
        }
    }

    pub fn socket_addr(&self) -> SocketAddr {
        format!("{}:{}", self.host, self.port)
            .parse()
            .expect("valid APP_HOST/APP_PORT")
    }
}
