import type { RefObject } from 'react'
import type { RtcConfig, Room, SessionResponse } from '../lib/types'

type RemoteParticipant = {
  id: string
  label: string
  stream: MediaStream
}

type Props = {
  callJoined: boolean
  selectedRoom: Room | null
  session: SessionResponse | null
  rtcConfig: RtcConfig | null
  callLog: string[]
  remoteParticipants: RemoteParticipant[]
  clientId: string
  localVideoRef: RefObject<HTMLVideoElement | null>
  onToggleCallJoin: () => void
}

export function CallsPage({
  callJoined,
  selectedRoom,
  session,
  rtcConfig,
  callLog,
  remoteParticipants,
  clientId,
  localVideoRef,
  onToggleCallJoin,
}: Props) {
  return (
    <section className="panel">
      <div className="call-grid">
        <div className="call-card">
          <h3>Local + remote media</h3>
          <div className="button-row" style={{ marginBottom: 12 }}>
            <button className="button" onClick={onToggleCallJoin}>
              {callJoined ? 'Leave call' : 'Join call'}
            </button>
          </div>
          <div className="video-grid">
            <video ref={localVideoRef} autoPlay playsInline muted className="media-tile" />
            {remoteParticipants.map((participant) => (
              <video
                key={participant.id}
                autoPlay
                playsInline
                className="media-tile"
                ref={(node) => {
                  if (node && node.srcObject !== participant.stream) {
                    node.srcObject = participant.stream
                  }
                }}
              />
            ))}
          </div>
        </div>
        <div className="call-card">
          <h3>Signals + config</h3>
          <div className="code-block" style={{ marginBottom: 12 }}>
            {JSON.stringify(
              {
                room: selectedRoom?.name,
                client: clientId,
                user: session?.user.email,
                turn: rtcConfig?.turn_urls,
                peers: remoteParticipants.map((participant) => participant.label),
              },
              null,
              2,
            )}
          </div>
          <div className="code-block">{callLog.join('\n') || 'No signaling events yet.'}</div>
        </div>
      </div>
    </section>
  )
}
