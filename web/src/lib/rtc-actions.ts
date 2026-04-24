import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react'
import type { RealtimeEvent, RtcConfig } from './types'

export type SignalPayload =
  | { kind: 'join'; label: string; tracks: string[] }
  | { kind: 'offer'; label: string; sdp: RTCSessionDescriptionInit }
  | { kind: 'answer'; label: string; sdp: RTCSessionDescriptionInit }
  | { kind: 'ice'; candidate: RTCIceCandidateInit }
  | { kind: 'leave' }

type RemoteParticipant = {
  id: string
  label: string
  stream: MediaStream
}

type CreateRtcActionsContext = {
  selectedRoomId: string | null
  callJoined: boolean
  callMediaMode: 'audio' | 'video' | null
  clientLabel: string
  localVideoRef: RefObject<HTMLVideoElement | null>
  localStreamRef: MutableRefObject<MediaStream | null>
  screenStreamRef: MutableRefObject<MediaStream | null>
  socketRef: MutableRefObject<WebSocket | null>
  activeCallRoomIdRef: MutableRefObject<string | null>
  callJoinedRef: MutableRefObject<boolean>
  rtcConfigRef: MutableRefObject<RtcConfig | null>
  clientIdRef: MutableRefObject<string>
  peerConnectionsRef: MutableRefObject<Map<string, RTCPeerConnection>>
  setRemoteParticipants: Dispatch<SetStateAction<RemoteParticipant[]>>
  setActiveCallRoomId: Dispatch<SetStateAction<string | null>>
  setCallMediaMode: Dispatch<SetStateAction<'audio' | 'video' | null>>
  setScreenSharing: Dispatch<SetStateAction<boolean>>
  setCallJoined: Dispatch<SetStateAction<boolean>>
  pushCallLog: (entry: string) => void
}

export function createRtcActions(context: CreateRtcActionsContext) {
  function buildIceServers() {
    const config = context.rtcConfigRef.current
    if (!config) return [{ urls: 'stun:stun.l.google.com:19302' }]
    return [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: config.turn_urls, username: config.username, credential: config.credential },
    ]
  }

  function sendSignal(payload: SignalPayload, targetRoomId = context.activeCallRoomIdRef.current) {
    if (!targetRoomId || !context.socketRef.current || context.socketRef.current.readyState !== WebSocket.OPEN) return
    const event: RealtimeEvent = {
      type: 'signal',
      room_id: targetRoomId,
      from: context.clientIdRef.current,
      payload,
    }
    context.socketRef.current.send(JSON.stringify(event))
  }

  function cleanupPeer(remoteId: string) {
    context.peerConnectionsRef.current.get(remoteId)?.close()
    context.peerConnectionsRef.current.delete(remoteId)
    context.setRemoteParticipants((current) => current.filter((participant) => participant.id !== remoteId))
  }

  function ensurePeerConnection(remoteId: string, remoteLabel: string) {
    const existing = context.peerConnectionsRef.current.get(remoteId)
    if (existing) return existing

    const connection = new RTCPeerConnection({ iceServers: buildIceServers() })
    connection.onicecandidate = (event) => {
      if (event.candidate) sendSignal({ kind: 'ice', candidate: event.candidate.toJSON() })
    }
    connection.ontrack = (event) => {
      const [stream] = event.streams
      if (!stream) return
      context.setRemoteParticipants((current) => {
        const filtered = current.filter((participant) => participant.id !== remoteId)
        return [...filtered, { id: remoteId, label: remoteLabel, stream }]
      })
    }
    connection.onconnectionstatechange = () => {
      if (['failed', 'closed', 'disconnected'].includes(connection.connectionState)) {
        cleanupPeer(remoteId)
      }
    }
    context.localStreamRef.current?.getTracks().forEach((track) => {
      connection.addTrack(track, context.localStreamRef.current as MediaStream)
    })
    context.screenStreamRef.current?.getTracks().forEach((track) => {
      connection.addTrack(track, context.screenStreamRef.current as MediaStream)
    })
    context.peerConnectionsRef.current.set(remoteId, connection)
    return connection
  }

  async function renegotiatePeerConnection(connection: RTCPeerConnection) {
    const offer = await connection.createOffer()
    await connection.setLocalDescription(offer)
    sendSignal({ kind: 'offer', label: context.clientLabel, sdp: offer })
  }

  function cleanupCallState() {
    context.peerConnectionsRef.current.forEach((connection) => connection.close())
    context.peerConnectionsRef.current.clear()
    context.setRemoteParticipants([])
    context.screenStreamRef.current?.getTracks().forEach((track) => track.stop())
    context.screenStreamRef.current = null
    context.localStreamRef.current?.getTracks().forEach((track) => track.stop())
    context.localStreamRef.current = null
    if (context.localVideoRef.current) context.localVideoRef.current.srcObject = null
    context.setActiveCallRoomId(null)
    context.setCallMediaMode(null)
    context.setScreenSharing(false)
    context.setCallJoined(false)
  }

  async function handleSignal(from: string, payload: SignalPayload) {
    if (from === context.clientIdRef.current) return
    if (payload.kind === 'leave') {
      cleanupPeer(from)
      context.pushCallLog(`${from.slice(0, 6)} left the room call`)
      return
    }
    if (!context.callJoinedRef.current) return

    if (payload.kind === 'join') {
      context.pushCallLog(`${payload.label} joined thread signaling`)
      const connection = ensurePeerConnection(from, payload.label)
      const offer = await connection.createOffer()
      await connection.setLocalDescription(offer)
      sendSignal({ kind: 'offer', label: context.clientLabel, sdp: offer })
      return
    }

    if (payload.kind === 'offer') {
      const connection = ensurePeerConnection(from, payload.label)
      await connection.setRemoteDescription(new RTCSessionDescription(payload.sdp))
      const answer = await connection.createAnswer()
      await connection.setLocalDescription(answer)
      sendSignal({ kind: 'answer', label: context.clientLabel, sdp: answer })
      context.pushCallLog(`answered ${payload.label}`)
      return
    }

    if (payload.kind === 'answer') {
      const connection = ensurePeerConnection(from, payload.label)
      await connection.setRemoteDescription(new RTCSessionDescription(payload.sdp))
      context.pushCallLog(`connected answer from ${payload.label}`)
      return
    }

    if (payload.kind === 'ice') {
      const connection = context.peerConnectionsRef.current.get(from)
      if (connection) await connection.addIceCandidate(new RTCIceCandidate(payload.candidate))
    }
  }

  async function joinCall(mode: 'audio' | 'video') {
    if (!context.selectedRoomId) {
      context.pushCallLog('select a thread before joining a call')
      return
    }
    if (context.callJoined) {
      sendSignal({ kind: 'leave' })
      cleanupCallState()
      context.pushCallLog('left call')
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: mode === 'video' })
    context.localStreamRef.current = stream
    if (context.localVideoRef.current) {
      if (mode === 'video') {
        context.localVideoRef.current.srcObject = stream
        context.localVideoRef.current.muted = true
        await context.localVideoRef.current.play().catch(() => undefined)
      } else {
        context.localVideoRef.current.srcObject = null
      }
    }
    context.setActiveCallRoomId(context.selectedRoomId)
    context.setCallMediaMode(mode)
    context.setCallJoined(true)
    sendSignal(
      { kind: 'join', label: context.clientLabel, tracks: stream.getTracks().map((track) => track.kind) },
      context.selectedRoomId,
    )
    context.pushCallLog(`joined ${mode} call as ${context.clientLabel}`)
  }

  async function startScreenShare() {
    if (!context.callJoined || context.screenStreamRef.current) return
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
    const [screenTrack] = stream.getVideoTracks()
    if (!screenTrack) return
    context.screenStreamRef.current = stream
    context.setScreenSharing(true)
    if (context.localVideoRef.current) {
      context.localVideoRef.current.srcObject = stream
      context.localVideoRef.current.muted = true
      await context.localVideoRef.current.play().catch(() => undefined)
    }

    for (const connection of context.peerConnectionsRef.current.values()) {
      const videoSender = connection.getSenders().find((sender) => sender.track?.kind === 'video')
      if (videoSender) {
        await videoSender.replaceTrack(screenTrack)
      } else {
        connection.addTrack(screenTrack, stream)
      }
      await renegotiatePeerConnection(connection)
    }
    screenTrack.onended = () => {
      void stopScreenShare()
    }
    context.pushCallLog('started screen share')
  }

  async function stopScreenShare() {
    const stream = context.screenStreamRef.current
    if (!stream) return
    const [screenTrack] = stream.getVideoTracks()
    const cameraTrack = context.localStreamRef.current?.getVideoTracks()[0] ?? null
    for (const connection of context.peerConnectionsRef.current.values()) {
      const screenSender = connection.getSenders().find((sender) => sender.track === screenTrack)
      if (screenSender) {
        if (cameraTrack) {
          await screenSender.replaceTrack(cameraTrack)
        } else {
          connection.removeTrack(screenSender)
        }
        await renegotiatePeerConnection(connection)
      }
    }
    stream.getTracks().forEach((track) => track.stop())
    context.screenStreamRef.current = null
    context.setScreenSharing(false)
    if (context.localVideoRef.current) {
      context.localVideoRef.current.srcObject = context.callMediaMode === 'video' ? context.localStreamRef.current : null
      if (context.callMediaMode === 'video') {
        await context.localVideoRef.current.play().catch(() => undefined)
      }
    }
    context.pushCallLog('stopped screen share')
  }

  function leaveCall() {
    if (!context.callJoined) return
    sendSignal({ kind: 'leave' })
    cleanupCallState()
    context.pushCallLog('left call')
  }

  return {
    handleSignal,
    cleanupCallState,
    joinCall,
    startScreenShare,
    stopScreenShare,
    leaveCall,
  }
}
