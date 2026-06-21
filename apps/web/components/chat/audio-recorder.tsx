'use client';

import { useCallback, useRef, useState } from 'react';

import { Loader2, Mic, MicOff, Square } from 'lucide-react';

/**
 * -------------------------------------------------------
 * Audio Recorder Component
 * Étape 23 — Phase 6: Multimodal
 *
 * Uses the browser MediaRecorder API to capture audio,
 * then sends it to /api/chat/transcribe for STT.
 *
 * States: idle → recording → transcribing → idle
 * -------------------------------------------------------
 */

type RecordingState = 'idle' | 'recording' | 'transcribing';

export function AudioRecorder({
  onTranscribed,
  disabled,
}: {
  onTranscribed: (text: string) => void;
  disabled?: boolean;
}) {
  const [state, setState] = useState<RecordingState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startRecording = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      });

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm',
      });

      chunksRef.current = [];
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Stop all tracks
        stream.getTracks().forEach((track) => track.stop());

        // Clear timer
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }

        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        if (blob.size < 100) {
          setState('idle');
          setError('Recording too short');
          return;
        }

        // Send to transcription API
        setState('transcribing');
        try {
          const formData = new FormData();
          formData.append('audio', blob, 'recording.webm');

          const res = await fetch('/api/chat/transcribe', {
            method: 'POST',
            body: formData,
          });

          const data = await res.json();

          if (res.ok && data.text) {
            onTranscribed(data.text);
          } else {
            setError(data.error || 'Transcription failed');
          }
        } catch {
          setError('Network error during transcription');
        } finally {
          setState('idle');
          setDuration(0);
        }
      };

      mediaRecorder.start(250); // collect data every 250ms
      setState('recording');
      setDuration(0);

      // Start duration timer
      timerRef.current = setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);
    } catch {
      setError('Microphone access denied');
      setState('idle');
    }
  }, [onTranscribed]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (state === 'transcribing') {
    return (
      <div className="flex items-center gap-1.5">
        <div className="flex h-9 items-center gap-1.5 rounded-lg bg-violet-500/10 px-3">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-500" />
          <span className="text-xs font-medium text-violet-600 dark:text-violet-400">
            Transcribing…
          </span>
        </div>
      </div>
    );
  }

  if (state === 'recording') {
    return (
      <div className="flex items-center gap-1.5">
        <div className="flex h-9 items-center gap-1.5 rounded-lg bg-red-500/10 px-3">
          <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
          <span className="text-xs font-medium tabular-nums text-red-600 dark:text-red-400">
            {formatDuration(duration)}
          </span>
        </div>
        <button
          onClick={stopRecording}
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-500 text-white shadow-sm transition-all hover:bg-red-600"
          title="Stop recording"
        >
          <Square className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      <button
        onClick={startRecording}
        disabled={disabled}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-all hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        title="Record voice message"
      >
        {error ? (
          <MicOff className="h-4 w-4 text-red-400" />
        ) : (
          <Mic className="h-4 w-4" />
        )}
      </button>
      {error && (
        <span className="mt-0.5 max-w-[120px] text-center text-[9px] text-red-400">
          {error}
        </span>
      )}
    </div>
  );
}
