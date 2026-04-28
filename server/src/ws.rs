use axum::{
    extract::{
        Path, State,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    response::IntoResponse,
};
use futures::{SinkExt, StreamExt};
use uuid::Uuid;

use crate::{models::RealtimeEvent, state::AppState};

pub async fn note_socket(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    Path(note_id): Path<Uuid>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_note_socket(socket, state, note_id))
}

pub async fn realtime_socket(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_realtime_socket(socket, state))
}

async fn handle_note_socket(socket: WebSocket, state: AppState, note_id: Uuid) {
    let (mut sender, mut receiver) = socket.split();
    let mut rx = state.realtime.subscribe();

    let send_task = tokio::spawn(async move {
        loop {
            match rx.recv().await {
                Ok(
                    event @ RealtimeEvent::NotePatch {
                        note_id: event_note_id,
                        ..
                    },
                ) if event_note_id == note_id => {
                    let Ok(text) = serde_json::to_string(&event) else {
                        continue;
                    };
                    if sender.send(Message::Text(text.into())).await.is_err() {
                        break;
                    }
                }
                Ok(
                    event @ RealtimeEvent::NoteDraft {
                        note_id: event_note_id,
                        ..
                    },
                ) if event_note_id == note_id => {
                    let Ok(text) = serde_json::to_string(&event) else {
                        continue;
                    };
                    if sender.send(Message::Text(text.into())).await.is_err() {
                        break;
                    }
                }
                Ok(
                    event @ RealtimeEvent::NoteOperations {
                        note_id: event_note_id,
                        ..
                    },
                ) if event_note_id == note_id => {
                    let Ok(text) = serde_json::to_string(&event) else {
                        continue;
                    };
                    if sender.send(Message::Text(text.into())).await.is_err() {
                        break;
                    }
                }
                Ok(
                    event @ RealtimeEvent::NotePresence {
                        note_id: event_note_id,
                        ..
                    },
                ) if event_note_id == note_id => {
                    let Ok(text) = serde_json::to_string(&event) else {
                        continue;
                    };
                    if sender.send(Message::Text(text.into())).await.is_err() {
                        break;
                    }
                }
                Ok(
                    event @ RealtimeEvent::NoteCursor {
                        note_id: event_note_id,
                        ..
                    },
                ) if event_note_id == note_id => {
                    let Ok(text) = serde_json::to_string(&event) else {
                        continue;
                    };
                    if sender.send(Message::Text(text.into())).await.is_err() {
                        break;
                    }
                }
                Ok(_) => {}
                Err(_) => break,
            }
        }
    });

    while let Some(Ok(Message::Text(text))) = receiver.next().await {
        if let Ok(event) = serde_json::from_str::<RealtimeEvent>(&text) {
            let _ = state.realtime.send(event);
        }
    }

    send_task.abort();
}

async fn handle_realtime_socket(socket: WebSocket, state: AppState) {
    let (mut sender, mut receiver) = socket.split();
    let mut rx = state.realtime.subscribe();

    let send_task = tokio::spawn(async move {
        loop {
            match rx.recv().await {
                Ok(event) => {
                    let Ok(text) = serde_json::to_string(&event) else {
                        continue;
                    };
                    if sender.send(Message::Text(text.into())).await.is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
    });

    while let Some(Ok(Message::Text(text))) = receiver.next().await {
        if let Ok(event) = serde_json::from_str::<RealtimeEvent>(&text) {
            let _ = state.realtime.send(event);
        }
    }

    send_task.abort();
}
