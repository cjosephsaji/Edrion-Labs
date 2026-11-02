import { tapSpeech } from '../world-v3/audio';
import type { Beat } from './beat-scheduler';
export type VoiceStatus =
  | 'disconnected'
  | 'connecting'
  | 'ready'
  | 'listening'
  | 'thinking'
  | 'speaking';
export interface VoiceProvider {
  connect(): Promise<void>;
  disconnect(): void;
  interrupt(forgetPending?: boolean): void;
  microphone(on: boolean): void;
  speak(text: string, signal: AbortSignal): Promise<void>;
}
interface Callbacks {
  status: (s: VoiceStatus) => void;
  transcript: (text: string, kind: 'student' | 'petros') => void;
  interrupt: () => void;
  question: (
    question: string,
  ) => Promise<{ beats: Beat[]; observations: unknown } | null>;
  ready: (result: unknown) => void;
  error: (message: string) => void;
  event?: (type: string) => void;
}
/** GA WebRTC. Keys are ephemeral; SDP is exchanged directly with the provider. */
export class RealtimeVoice implements VoiceProvider {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private stream: MediaStream | null = null;
  private audio: HTMLAudioElement | null = null;
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private finish: (() => void) | null = null;
  private fail: ((e: Error) => void) | null = null;
  private output = '';
  private speaking = false;
  private usedCalls = new Set<string>();
  private sessionEpoch = 0;
  private pendingQuestion = '';
  private connectAbort: AbortController | null = null;
  private speechEpoch = 0;
  private pendingNarration: string | null = null;
  private narrationResponse: string | null = null;
  private currentResponse = '';
  private ignoredResponses = new Set<string>();
  constructor(
    private api: string,
    private callbacks: Callbacks,
  ) {}
  private send(e: object) {
    if (this.dc?.readyState === 'open') this.dc.send(JSON.stringify(e));
  }
  async connect() {
    this.disconnect();
    const epoch = ++this.sessionEpoch;
    this.connectAbort = new AbortController();
    this.callbacks.status('connecting');
    try {
      const response = await fetch(`${this.api}/voice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        signal: this.connectAbort.signal,
      });
      const token = await response.json();
      if (!response.ok) throw Error(token.error ?? 'Voice unavailable.');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      if (epoch !== this.sessionEpoch) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.stream = stream;
      const pc = new RTCPeerConnection();
      this.pc = pc;
      this.audio = new Audio();
      this.audio.autoplay = true;
      tapSpeech(this.audio);
      pc.ontrack = (e) => {
        if (this.audio) {
          this.audio.srcObject = e.streams[0];
          void this.audio
            .play()
            .catch(() =>
              this.callbacks.error('Tap voice to allow audio playback.'),
            );
        }
      };
      stream.getTracks().forEach((t) => {
        t.enabled = false;
        pc.addTrack(t, stream);
      });
      pc.onconnectionstatechange = () => {
        if (['failed', 'disconnected'].includes(pc.connectionState)) {
          this.callbacks.error('Voice disconnected. Reconnect to continue.');
          this.disconnect();
        }
      };
      const dc = pc.createDataChannel('oai-events');
      this.dc = dc;
      dc.onmessage = (e) => {
        try {
          void this.event(JSON.parse(e.data)).catch((err) =>
            this.callbacks.error(
              err instanceof Error ? err.message : 'Voice event failed',
            ),
          );
        } catch {
          this.callbacks.error('Voice returned an invalid event.');
        }
      };
      const opened = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(Error('Voice connection timed out.')),
          20000,
        );
        dc.onopen = () => {
          clearTimeout(timer);
          this.callbacks.status('ready');
          resolve();
        };
        dc.onerror = () => {
          clearTimeout(timer);
          reject(Error('Voice data connection failed.'));
        };
      });
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const sdp = await fetch('https://api.openai.com/v1/realtime/calls', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token.value}`,
          'Content-Type': 'application/sdp',
        },
        body: offer.sdp,
        signal: this.connectAbort.signal,
      });
      if (!sdp.ok) throw Error('The voice provider rejected the connection.');
      await pc.setRemoteDescription({ type: 'answer', sdp: await sdp.text() });
      await opened;
      this.timeout = setTimeout(
        () => {
          this.callbacks.error(
            'Five-minute voice budget reached. Reconnect for another session.',
          );
          this.disconnect();
        },
        Math.min(300, token.maxSeconds ?? 300) * 1000,
      );
    } catch (e) {
      this.disconnect();
      throw e;
    }
  }
  async event(e: Record<string, any>) {
    if (e.response_id && this.ignoredResponses.has(e.response_id)) return;
    if (
      [
        'input_audio_buffer.speech_started',
        'input_audio_buffer.speech_stopped',
        'conversation.item.input_audio_transcription.completed',
        'response.function_call_arguments.done',
        'response.done',
        'output_audio_buffer.started',
        'output_audio_buffer.stopped',
        'error',
      ].includes(e.type)
    )
      this.callbacks.event?.(
        e.type + (e.type === 'error' ? ':' + e.error?.code : ''),
      );
    if (e.type === 'input_audio_buffer.speech_started') {
      this.interrupt();
      this.callbacks.interrupt();
      this.callbacks.status('listening');
    }
    if (e.type === 'input_audio_buffer.speech_stopped')
      this.callbacks.status('thinking');
    if (e.type === 'conversation.item.input_audio_transcription.completed')
      this.callbacks.transcript(String(e.transcript ?? ''), 'student');
    if (e.type === 'response.output_audio_transcript.delta') {
      this.output += String(e.delta ?? '');
      this.callbacks.transcript(this.output, 'petros');
    }
    if (e.type === 'response.created') {
      const id = String(e.response?.id ?? '');
      const beat = e.response?.metadata?.petros_beat;
      if (beat && beat !== this.pendingNarration) {
        this.ignoredResponses.add(id);
        return;
      }
      this.currentResponse = id;
      this.output = '';
      if (e.response?.metadata?.petros_beat === this.pendingNarration)
        this.narrationResponse = String(e.response.id);
    }
    if (e.type === 'output_audio_buffer.started') {
      this.speaking = true;
      this.callbacks.status('speaking');
    }
    if (e.type === 'output_audio_buffer.stopped') {
      // A late completion from cancelled speech must never release the next beat.
      if (this.finish && e.response_id !== this.narrationResponse) return;
      this.speaking = false;
      this.finish?.();
      this.finish = null;
      this.fail = null;
      this.callbacks.status('ready');
    }
    if (
      e.type === 'response.function_call_arguments.done' &&
      e.name === 'teach' &&
      !this.usedCalls.has(e.call_id)
    ) {
      this.usedCalls.add(e.call_id);
      if (this.usedCalls.size > 80) {
        this.disconnect();
        throw Error('Voice tool-call budget reached.');
      }
      const args = JSON.parse(e.arguments);
      const epoch = this.sessionEpoch;
      const isStop = /^\s*(stop|pause)\s*[.!]?$/i.test(args.question);
      if (isStop) this.pendingQuestion = '';
      const question = isStop
        ? args.question
        : (this.pendingQuestion
            ? this.pendingQuestion + '\n' + args.question
            : args.question
          ).slice(-1200);
      if (!isStop) this.pendingQuestion = question;
      const result = await this.callbacks.question(question);
      if (result && this.pendingQuestion === question)
        this.pendingQuestion = '';
      if (epoch !== this.sessionEpoch) return;
      this.send({
        type: 'conversation.item.create',
        item: {
          type: 'function_call_output',
          call_id: e.call_id,
          output: JSON.stringify(
            result
              ? {
                  observations: result.observations,
                  status:
                    'Teaching beats prepared; client will request each narration.',
                }
              : {
                  error:
                    'Request interrupted or failed. Do not invent a result.',
                },
          ),
        },
      });
      if (result) this.callbacks.ready(result);
    }
    if (
      e.type === 'error' &&
      ![
        'response_cancel_not_active',
        'input_audio_buffer_commit_empty',
      ].includes(e.error?.code)
    ) {
      this.fail?.(Error(e.error?.message ?? 'Voice error'));
      this.callbacks.error(e.error?.message ?? 'Voice error');
    }
  }
  microphone(on: boolean) {
    this.stream?.getAudioTracks().forEach((t) => (t.enabled = on));
    this.callbacks.status(on ? 'listening' : 'ready');
    if (on) {
      this.interrupt();
      this.callbacks.interrupt();
    }
  }
  interrupt(forgetPending = false) {
    if (forgetPending) this.pendingQuestion = '';
    this.send({ type: 'response.cancel' });
    this.send({ type: 'output_audio_buffer.clear' });
    this.speaking = false;
    if (this.currentResponse) this.ignoredResponses.add(this.currentResponse);
    if (this.ignoredResponses.size > 80)
      this.ignoredResponses.delete(
        this.ignoredResponses.values().next().value!,
      );
    this.pendingNarration = null;
    this.narrationResponse = null;
    this.fail?.(Error('Interrupted'));
    this.finish = null;
    this.fail = null;
  }
  speak(text: string, signal: AbortSignal): Promise<void> {
    if (this.dc?.readyState !== 'open')
      return Promise.reject(Error('Voice disconnected.'));
    const narration = `beat-${++this.speechEpoch}`;
    this.pendingNarration = narration;
    this.narrationResponse = null;
    return new Promise((resolve, reject) => {
      let settled = false;
      const done = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        this.finish = null;
        this.fail = null;
        if (this.pendingNarration === narration) this.pendingNarration = null;
        error ? reject(error) : resolve();
      };
      const abort = () => {
        this.interrupt();
        done(Error('Interrupted'));
      };
      const timer = setTimeout(
        () => done(Error('Audio completion was not confirmed.')),
        45000,
      );
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) {
        abort();
        return;
      }
      this.finish = () => done();
      this.fail = (e) => done(e);
      this.send({
        type: 'response.create',
        response: {
          metadata: { petros_beat: narration },
          instructions: `Read this exact verified teaching beat aloud in English, without additions or tool calls: ${JSON.stringify(text)}`,
          tool_choice: 'none',
        },
      });
    });
  }
  disconnect() {
    this.sessionEpoch++;
    this.pendingQuestion = '';
    this.pendingNarration = null;
    this.narrationResponse = null;
    this.connectAbort?.abort();
    this.connectAbort = null;
    this.fail?.(Error('Disconnected'));
    this.finish = null;
    this.fail = null;
    if (this.timeout) clearTimeout(this.timeout);
    this.timeout = null;
    this.dc?.close();
    this.pc?.close();
    this.stream?.getTracks().forEach((t) => t.stop());
    if (this.audio) {
      this.audio.pause();
      this.audio.srcObject = null;
    }
    this.audio = null;
    this.stream = null;
    this.dc = null;
    this.pc = null;
    this.usedCalls.clear();
    this.ignoredResponses.clear();
    this.currentResponse = '';
    this.callbacks.status('disconnected');
  }
}
