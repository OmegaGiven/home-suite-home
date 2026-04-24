type CallParticipant = {
  id: string
  label: string
}

type Props = {
  recording: boolean
  recorderOpen: boolean
  voiceInputLevel: number
  callJoined: boolean
  callOverlayOpen: boolean
  callRoomName: string | null
  callMode: 'audio' | 'video' | null
  screenSharing: boolean
  callParticipants: CallParticipant[]
  onCloseRecorder: () => void
  onStopRecording: () => void
  onCloseCall: () => void
  onOpenCallRoom: () => void
  onToggleScreenShare: () => void
  onLeaveCall: () => void
}

export function FloatingActivityPanels({
  recording,
  recorderOpen,
  voiceInputLevel,
  callJoined,
  callOverlayOpen,
  callRoomName,
  callMode,
  screenSharing,
  callParticipants,
  onCloseRecorder,
  onStopRecording,
  onCloseCall,
  onOpenCallRoom,
  onToggleScreenShare,
  onLeaveCall,
}: Props) {
  if (!recording && !callJoined && !recorderOpen && !callOverlayOpen) {
    return null
  }

  return (
    <div className="floating-activity-stack" aria-live="polite">
      {recorderOpen || recording ? (
        <section className="floating-activity-card">
          <div className="floating-activity-header">
            <div>
              <strong>{recording ? 'Recording memo' : 'Recorder ready'}</strong>
              <div className="muted">
                {recording ? 'Microphone input is live.' : 'Recorder is open.'}
              </div>
            </div>
            {!recording ? (
              <button className="button-secondary modal-close-button" type="button" onClick={onCloseRecorder} aria-label="Close recorder">
                ×
              </button>
            ) : null}
          </div>
          <div className={`voice-record-hero ${recording ? 'recording' : ''}`}>
            <div className="voice-record-hero-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" className="voice-record-mic-svg voice-record-mic-svg-large" aria-hidden="true">
                <path
                  d="M12 15.2a3.8 3.8 0 0 1-3.8-3.8V6.9a3.8 3.8 0 1 1 7.6 0v4.5a3.8 3.8 0 0 1-3.8 3.8Z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinejoin="round"
                />
                <path
                  d="M6.7 10.9v.6a5.3 5.3 0 0 0 10.6 0v-.6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                />
                <path
                  d="M12 16.8v3.1"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                />
                <path
                  d="M9 19.9h6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <div className="voice-record-level voice-record-level-large" aria-hidden="true">
              {[0, 1, 2, 3, 4].map((bar) => {
                const base = 0.18 + bar * 0.1
                const scale = recording ? Math.max(0.14, Math.min(1, base + voiceInputLevel * (0.95 - bar * 0.08))) : 0.14
                return (
                  <span
                    key={bar}
                    className="voice-record-level-bar"
                    style={{ transform: `scaleY(${scale})`, opacity: recording ? 0.42 + scale * 0.58 : 0.24 }}
                  />
                )
              })}
            </div>
          </div>
          <div className="voice-record-modal-actions">
            {recording ? (
              <button className="button" type="button" onClick={onStopRecording}>
                Stop recording
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {callJoined || callOverlayOpen ? (
        <section className="floating-activity-card">
          <div className="floating-activity-header">
            <div>
              <strong>{callRoomName || 'Call in progress'}</strong>
              <div className="muted">
                {screenSharing ? 'Screen sharing live' : callMode === 'video' ? 'Video call live' : 'Voice call live'}
              </div>
            </div>
            {!callJoined ? (
              <button className="button-secondary modal-close-button" type="button" onClick={onCloseCall} aria-label="Close call panel">
                ×
              </button>
            ) : null}
          </div>
          <div className="floating-call-participants">
            {callParticipants.map((participant) => (
              <span className="presence-chip" key={participant.id}>
                {participant.label}
              </span>
            ))}
          </div>
          <div className="floating-call-actions">
            <button className="button-secondary" type="button" onClick={onOpenCallRoom}>
              Open thread
            </button>
            <button className="button-secondary" type="button" onClick={onToggleScreenShare}>
              {screenSharing ? 'Stop share' : 'Share screen'}
            </button>
            <button className="button" type="button" onClick={onLeaveCall}>
              Leave call
            </button>
          </div>
        </section>
      ) : null}
    </div>
  )
}
