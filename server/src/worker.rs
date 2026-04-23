use tokio::{fs, process::Command};
use uuid::Uuid;

use crate::state::AppState;

pub fn spawn_transcription(state: AppState, memo_id: Uuid) {
    tokio::spawn(async move {
        if state.mark_transcription_running(memo_id).await.is_err() {
            return;
        }

        if let Err(err) = run_transcription(&state, memo_id).await {
            let _ = state
                .fail_transcription(memo_id, format!("worker failed: {err}"))
                .await;
        }
    });
}

async fn run_transcription(state: &AppState, memo_id: Uuid) -> Result<(), String> {
    let memo = state
        .get_memo(memo_id)
        .await
        .map_err(|err| err.to_string())?;
    let audio_path = state.storage.resolve(&memo.audio_path);

    if let Some(command) = &state.config.whisper_command {
        let transcript_stem = state
            .config
            .storage_root
            .join("voice")
            .join(format!("{memo_id}"));
        let transcript_path = transcript_stem.with_extension("txt");

        let output = Command::new(command)
            .arg("-m")
            .arg(&state.config.transcription_model)
            .arg("-f")
            .arg(&audio_path)
            .arg("-otxt")
            .arg("-of")
            .arg(transcript_stem.to_string_lossy().to_string())
            .output()
            .await
            .map_err(|err| err.to_string())?;

        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
        }

        let text = fs::read_to_string(transcript_path)
            .await
            .unwrap_or_else(|_| "Transcription completed.".into());
        return state
            .finish_transcription(memo_id, Some(text))
            .await
            .map_err(|err| err.to_string());
    }

    Err("No transcription runtime configured on the server".into())
}
