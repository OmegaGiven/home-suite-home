import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { createBrowserSpeechRecognition, type BrowserSpeechRecognition } from './shortcuts'
import { defaultVoiceMemoTitle } from './ui-helpers'
import type { TranscriptionJob, VoiceMemo } from './types'

type CreateVoiceActionsContext = {
  recording: boolean
  memos: VoiceMemo[]
  mediaRecorderRef: MutableRefObject<MediaRecorder | null>
  recordingStreamRef: MutableRefObject<MediaStream | null>
  recordingAudioContextRef: MutableRefObject<AudioContext | null>
  recordingAnalyserRef: MutableRefObject<AnalyserNode | null>
  recordingLevelFrameRef: MutableRefObject<number | null>
  audioChunksRef: MutableRefObject<Blob[]>
  speechRecognitionRef: MutableRefObject<BrowserSpeechRecognition | null>
  speechTranscriptRef: MutableRefObject<string>
  setRecording: Dispatch<SetStateAction<boolean>>
  setVoiceInputLevel: Dispatch<SetStateAction<number>>
  setMemos: Dispatch<SetStateAction<VoiceMemo[]>>
  setSelectedVoiceMemoId: Dispatch<SetStateAction<string | null>>
  uploadVoiceMemoRecord: (title: string, file: Blob, browserTranscript?: string) => Promise<VoiceMemo>
  listVoiceMemos: () => Promise<VoiceMemo[]>
  getVoiceJob: (memoId: string) => Promise<TranscriptionJob>
  retryVoiceJob: (memoId: string) => Promise<TranscriptionJob>
  showActionNotice: (message: string) => void
}

export function createVoiceActions(context: CreateVoiceActionsContext) {
  function stopRecordingLevelTracking() {
    if (context.recordingLevelFrameRef.current != null) {
      window.cancelAnimationFrame(context.recordingLevelFrameRef.current)
      context.recordingLevelFrameRef.current = null
    }
    context.recordingAnalyserRef.current = null
    if (context.recordingAudioContextRef.current) {
      void context.recordingAudioContextRef.current.close().catch(() => undefined)
      context.recordingAudioContextRef.current = null
    }
    if (context.recordingStreamRef.current) {
      context.recordingStreamRef.current.getTracks().forEach((track) => track.stop())
      context.recordingStreamRef.current = null
    }
    context.setVoiceInputLevel(0)
  }

  function startRecordingLevelTracking(stream: MediaStream) {
    stopRecordingLevelTracking()
    const AudioContextCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextCtor) return

    const audioContext = new AudioContextCtor()
    const analyser = audioContext.createAnalyser()
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.82
    audioContext.createMediaStreamSource(stream).connect(analyser)

    const buffer = new Uint8Array(analyser.fftSize)
    context.recordingStreamRef.current = stream
    context.recordingAudioContextRef.current = audioContext
    context.recordingAnalyserRef.current = analyser

    const tick = () => {
      if (!context.recordingAnalyserRef.current) return
      context.recordingAnalyserRef.current.getByteTimeDomainData(buffer)
      let sum = 0
      for (let index = 0; index < buffer.length; index += 1) {
        const centered = (buffer[index] - 128) / 128
        sum += centered * centered
      }
      const rms = Math.sqrt(sum / buffer.length)
      const normalized = Math.max(0, Math.min(1, rms * 4.5))
      context.setVoiceInputLevel((current) => current * 0.52 + normalized * 0.48)
      context.recordingLevelFrameRef.current = window.requestAnimationFrame(tick)
    }

    context.recordingLevelFrameRef.current = window.requestAnimationFrame(tick)
  }

  async function toggleRecording() {
    if (context.recording) {
      context.speechRecognitionRef.current?.stop()
      context.mediaRecorderRef.current?.stop()
      context.setRecording(false)
      stopRecordingLevelTracking()
      return
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const recorder = new MediaRecorder(stream)
    startRecordingLevelTracking(stream)
    context.audioChunksRef.current = []
    context.speechTranscriptRef.current = ''

    const recognition = createBrowserSpeechRecognition()
    if (recognition) {
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = navigator.language || 'en-US'
      recognition.onresult = (event) => {
        let transcript = ''
        for (let index = 0; index < event.results.length; index += 1) {
          const result = event.results[index]
          transcript += result[0]?.transcript ?? ''
        }
        context.speechTranscriptRef.current = transcript.trim()
      }
      recognition.onerror = () => undefined
      recognition.onend = () => {
        context.speechRecognitionRef.current = null
      }
      try {
        recognition.start()
        context.speechRecognitionRef.current = recognition
      } catch {
        context.speechRecognitionRef.current = null
      }
    }

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) context.audioChunksRef.current.push(event.data)
    }
    recorder.onstop = async () => {
      const blob = new Blob(context.audioChunksRef.current, { type: 'audio/webm' })
      const transcript = context.speechTranscriptRef.current.trim()
      const memo = await context.uploadVoiceMemoRecord(defaultVoiceMemoTitle(), blob, transcript || undefined)
      context.setMemos((current) => {
        const withoutExisting = current.filter((entry) => entry.id !== memo.id)
        return [memo, ...withoutExisting].sort((left, right) => right.created_at.localeCompare(left.created_at))
      })
      context.setSelectedVoiceMemoId(memo.id)
      context.speechTranscriptRef.current = ''
      stopRecordingLevelTracking()
    }
    recorder.start()
    context.mediaRecorderRef.current = recorder
    context.setRecording(true)
  }

  function openRecorderPanel() {
    if (!context.recording) {
      void toggleRecording()
    }
  }

  async function pollTranscript(memo: VoiceMemo) {
    const job: TranscriptionJob = await context.getVoiceJob(memo.id)
    if (job.status === 'failed') {
      await context.retryVoiceJob(memo.id)
    }
    const nextMemos = await context.listVoiceMemos()
    context.setMemos(nextMemos)
  }

  async function uploadAudioFile(file: File) {
    const title = defaultVoiceMemoTitle()
    const memo = await context.uploadVoiceMemoRecord(title, file)
    context.setMemos((current) => {
      const withoutExisting = current.filter((entry) => entry.id !== memo.id)
      return [memo, ...withoutExisting].sort((left, right) => right.created_at.localeCompare(left.created_at))
    })
    context.setSelectedVoiceMemoId(memo.id)
  }

  return {
    stopRecordingLevelTracking,
    startRecordingLevelTracking,
    toggleRecording,
    openRecorderPanel,
    pollTranscript,
    uploadAudioFile,
  }
}
