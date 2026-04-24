use std::path::{Path, PathBuf};

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
    let whisper_command = state.config.whisper_command.as_ref().ok_or_else(|| {
        "Transcription runtime is not configured on this server. Set WHISPER_COMMAND to a working Whisper CLI binary.".to_string()
    })?;
    let ffmpeg_command = state.config.ffmpeg_command.as_ref().ok_or_else(|| {
        "Audio conversion runtime is not configured on this server. Set FFMPEG_COMMAND to a working ffmpeg binary.".to_string()
    })?;
    let model_path = resolve_model_path(state)
        .ok_or_else(|| "No Whisper model file configured. Set TRANSCRIPTION_MODEL_PATH or provide a known model name with an installed model file.".to_string())?;

    let transcription_dir = state.config.storage_root.join("voice");
    let wav_path = transcription_dir.join(format!("{memo_id}.wav"));
    let transcript_stem = transcription_dir.join(format!("{memo_id}.transcript"));
    let transcript_path = transcript_stem.with_extension("txt");

    convert_audio_to_wav(ffmpeg_command, &audio_path, &wav_path).await?;
    let transcript_result = run_whisper_cli(
        whisper_command,
        &model_path,
        &wav_path,
        &transcript_stem,
    )
    .await;
    let _ = fs::remove_file(&wav_path).await;

    transcript_result?;

    let text = fs::read_to_string(&transcript_path)
        .await
        .map_err(|err| format!("transcript output missing: {err}"))?;
    let _ = fs::remove_file(&transcript_path).await;
    state
        .finish_transcription(memo_id, Some(text))
        .await
        .map_err(|err| err.to_string())
}

fn resolve_model_path(state: &AppState) -> Option<PathBuf> {
    if let Some(path) = &state.config.transcription_model_path {
        return Some(path.clone());
    }

    let configured = state.config.transcription_model.trim();
    if configured.is_empty() {
        return None;
    }

    let explicit = PathBuf::from(configured);
    if explicit.components().count() > 1 || explicit.extension().is_some() {
        return Some(explicit);
    }

    Some(PathBuf::from(format!(
        "/opt/whisper/models/ggml-{configured}.bin"
    )))
}

async fn convert_audio_to_wav(
    ffmpeg_command: &str,
    source_path: &Path,
    wav_path: &Path,
) -> Result<(), String> {
    let output = Command::new(ffmpeg_command)
        .arg("-y")
        .arg("-i")
        .arg(source_path)
        .arg("-ar")
        .arg("16000")
        .arg("-ac")
        .arg("1")
        .arg("-c:a")
        .arg("pcm_s16le")
        .arg(wav_path)
        .output()
        .await
        .map_err(|err| format!("ffmpeg launch failed: {err}"))?;

    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Err(if !stderr.is_empty() {
        format!("ffmpeg failed: {stderr}")
    } else if !stdout.is_empty() {
        format!("ffmpeg failed: {stdout}")
    } else {
        format!("ffmpeg failed with status {}", output.status)
    })
}

async fn run_whisper_cli(
    whisper_command: &str,
    model_path: &Path,
    wav_path: &Path,
    transcript_stem: &Path,
) -> Result<(), String> {
    let output = Command::new(whisper_command)
        .arg("-m")
        .arg(model_path)
        .arg("-f")
        .arg(wav_path)
        .arg("-otxt")
        .arg("-of")
        .arg(transcript_stem)
        .output()
        .await
        .map_err(|err| format!("whisper launch failed: {err}"))?;

    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Err(if !stderr.is_empty() {
        stderr
    } else if !stdout.is_empty() {
        stdout
    } else {
        format!("whisper failed with status {}", output.status)
    })
}
