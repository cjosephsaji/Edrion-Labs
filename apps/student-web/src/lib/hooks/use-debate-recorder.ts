'use client';
import { useCallback, useRef, useState } from 'react';
import { useStudentClient } from '../student-client';

export function useDebateRecorder(roundId: string, turnId: string | undefined) {
  const client = useStudentClient();
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunkIdx = useRef(0);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    if (!turnId) return;
    setError(null);
    chunkIdx.current = 0;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
    recorder.ondataavailable = async (ev) => {
      if (!ev.data.size) return;
      const buf = await ev.data.arrayBuffer();
      const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      await client.post(`/debate/rounds/${roundId}/turns/${turnId}/chunks`, {
        chunkIdx: chunkIdx.current++,
        mimeType: 'audio/webm',
        dataBase64: b64,
      });
    };
    recorder.start(5000);
    recorderRef.current = recorder;
    setRecording(true);
  }, [client, roundId, turnId]);

  const stop = useCallback(async () => {
    const rec = recorderRef.current;
    if (!rec || !turnId) return;
    await new Promise<void>((resolve) => {
      rec.onstop = () => resolve();
      rec.stop();
      rec.stream.getTracks().forEach((t) => t.stop());
    });
    recorderRef.current = null;
    setRecording(false);
    await client.post(`/debate/rounds/${roundId}/turns/${turnId}/finalise`, {});
  }, [client, roundId, turnId]);

  return { start, stop, recording, error };
}
