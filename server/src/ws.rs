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
                Ok(event) => {
                    let Some(text) = serialize_note_socket_event(note_id, &event) else {
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

fn serialize_note_socket_event(note_id: Uuid, event: &RealtimeEvent) -> Option<String> {
    match event {
        RealtimeEvent::NotePresence {
            note_id: event_note_id,
            ..
        }
        | RealtimeEvent::NoteCursor {
            note_id: event_note_id,
            ..
        } if *event_note_id == note_id => serde_json::to_string(event).ok(),
        _ => None,
    }
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

#[cfg(test)]
mod tests {
    use super::serialize_note_socket_event;
    use crate::models::RealtimeEvent;
    use chrono::Utc;
    use uuid::Uuid;

    #[test]
    fn serialize_note_socket_event_filters_and_serializes_cursor_events() {
        let note_id = Uuid::new_v4();
        let other_note_id = Uuid::new_v4();
        let cursor_event = RealtimeEvent::NoteCursor {
            note_id,
            user: "alice".into(),
            client_id: "client-1".into(),
            offset: Some(12),
            cursor_b64: Some("cursor".into()),
            user_id: Some(Uuid::new_v4()),
            avatar_path: Some("avatars/alice.png".into()),
            session_id: Some(Uuid::new_v4().to_string()),
            block_id: None,
            updated_at: Some(Utc::now()),
        };
        let other_note_event = RealtimeEvent::NoteCursor {
            note_id: other_note_id,
            user: "alice".into(),
            client_id: "client-1".into(),
            offset: Some(12),
            cursor_b64: Some("cursor".into()),
            user_id: Some(Uuid::new_v4()),
            avatar_path: Some("avatars/alice.png".into()),
            session_id: Some(Uuid::new_v4().to_string()),
            block_id: None,
            updated_at: Some(Utc::now()),
        };
        let document_event = RealtimeEvent::NoteDocumentUpdate {
            note_id,
            client_id: "client-1".into(),
            snapshot_b64: None,
            update_b64: "update".into(),
            version: 1,
            editor_format: "tiptap_loro".into(),
            content_markdown: "hello".into(),
            content_html: "<p>hello</p>".into(),
        };

        let serialized = serialize_note_socket_event(note_id, &cursor_event);
        assert!(serialized.is_some());
        assert!(serialized
            .as_deref()
            .is_some_and(|text| text.contains("\"type\":\"note_cursor\"")));
        assert!(serialize_note_socket_event(note_id, &other_note_event).is_none());
        assert!(serialize_note_socket_event(note_id, &document_event).is_none());
    }
}
