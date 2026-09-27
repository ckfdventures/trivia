import { io, type Socket } from "socket.io-client";
import { BACKEND_URL, SOCKET_PATH } from "../api";
import { withVoiceOpusParams } from "./sdp";

/** A mic turned off for this long is released, so the browser's mic indicator goes away. */
const MIC_RELEASE_MS = 60_000;
const LEVEL_POLL_MS = 150;
/** RMS level (0–1) above which a stream counts as speaking, and how long speaking lingers after it drops. */
const SPEAKING_LEVEL = 0.035;
const SPEAKING_HOLD_MS = 400;

export interface VoiceRosterMember {
  player_id: string;
  session_id: string;
  mic_on: boolean;
  speaker_on: boolean;
  connected: boolean;
}

export type VoiceStatus = "idle" | "joining" | "joined" | "full";
export type PeerLink = "connecting" | "connected" | "failed";

export interface VoiceSnapshot {
  status: VoiceStatus;
  micOn: boolean;
  speakerOn: boolean;
  /** Mic permission was refused, so this player is listen-only. */
  micDenied: boolean;
  /** The browser blocked audio playback until the next tap. */
  audioBlocked: boolean;
  /** Bumped each time the host mutes everyone, so the UI can show a notice. */
  mutedByHostAt: number | null;
  capacity: number;
  roster: VoiceRosterMember[];
  /** Player ids currently speaking, including this player. */
  speaking: string[];
  links: Record<string, PeerLink>;
}

type SignalData = { description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit | null };

interface Peer {
  id: string;
  session: string;
  pc: RTCPeerConnection;
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  audio: HTMLAudioElement;
  analyser: AnalyserNode | null;
}

const newSessionId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);

/**
 * One player's voice chat in one room: a Socket.IO "voice" socket for roster and signaling, plus one
 * RTCPeerConnection per other member (a full mesh). Uses the perfect-negotiation pattern; the player with the
 * lower id is the polite side. Only the impolite side adds the first transceiver, so setup has no offer collisions.
 */
export class VoiceManager {
  private socket: Socket | null = null;
  private readonly peers = new Map<string, Peer>();
  private listeners = new Set<() => void>();
  private snapshot: VoiceSnapshot = {
    status: "idle",
    micOn: false,
    speakerOn: true,
    micDenied: false,
    audioBlocked: false,
    mutedByHostAt: null,
    capacity: 8,
    roster: [],
    speaking: [],
    links: {},
  };
  private wantJoined = false;
  /** Set once the mic request has settled; only then may a (re)connect send `voice:join`, so it is sent once. */
  private joinReady = false;
  private sessionId: string | null = null;
  private iceServers: RTCIceServer[] = [];
  private micTrack: MediaStreamTrack | null = null;
  private micAnalyser: AnalyserNode | null = null;
  private micReleaseTimer: ReturnType<typeof setTimeout> | null = null;
  private audioContext: AudioContext | null = null;
  private levelTimer: ReturnType<typeof setInterval> | null = null;
  private lastLoud = new Map<string, number>();
  private destroyed = false;

  constructor(
    readonly pin: string,
    readonly playerId: string,
    private readonly token: string,
  ) {}

  // ---------- Store interface (for useSyncExternalStore) ----------

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): VoiceSnapshot => this.snapshot;

  private update(patch: Partial<VoiceSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const l of this.listeners) l();
  }

  // ---------- Public controls ----------

  /** Open the voice socket to see the roster. Holding a slot needs `join`. */
  connect(): void {
    if (this.socket || this.destroyed) return;
    const socket = io(BACKEND_URL, {
      path: SOCKET_PATH,
      auth: { pin: this.pin, role: "voice", token: this.token },
      reconnectionDelay: 1500,
      reconnectionDelayMax: 3000,
    });
    this.socket = socket;
    socket.on("connect", () => {
      if (this.wantJoined && this.joinReady) this.sendJoin();
    });
    socket.on("disconnect", () => {
      // The server holds our slot briefly; peers drop their links to us, so drop ours and rebuild on rejoin.
      this.closeAllPeers();
      if (this.wantJoined) this.update({ status: "joining" });
    });
    socket.on("voice:roster", (roster: { capacity: number; members: VoiceRosterMember[] }) => {
      this.update({ roster: roster.members, capacity: roster.capacity });
      this.reconcilePeers();
    });
    socket.on("voice:joined", (data: { session_id: string; ice_servers: RTCIceServer[] }) => {
      if (data.session_id !== this.sessionId) return;
      this.iceServers = data.ice_servers;
      this.update({ status: "joined" });
      this.reconcilePeers();
    });
    socket.on("voice:full", () => {
      this.wantJoined = false;
      this.joinReady = false;
      this.releaseMic();
      this.update({ status: "full", micOn: false });
    });
    socket.on("voice:signal", (msg: { from: string; from_session: string; to_session: string; data: SignalData }) => {
      void this.onSignal(msg);
    });
    socket.on("voice:muted_by_host", () => {
      this.setMicEnabled(false);
      this.update({ mutedByHostAt: Date.now() });
      this.sendState();
    });
  }

  /**
   * Take a voice slot. Call from a tap: it asks for the mic (falling back to listen-only if refused)
   * and unlocks audio playback, which mobile browsers only allow after a user gesture.
   */
  async join(options: { mic: boolean } = { mic: true }): Promise<void> {
    if (this.destroyed || this.wantJoined) return;
    this.wantJoined = true;
    this.update({ status: "joining" });
    this.ensureAudioContext();
    if (options.mic) await this.acquireMic();
    if (!this.wantJoined) return;
    this.joinReady = true;
    this.connect();
    // If the socket isn't connected yet, its "connect" handler sends the join instead.
    if (this.socket?.connected) this.sendJoin();
  }

  leave(): void {
    this.wantJoined = false;
    this.joinReady = false;
    this.socket?.emit("voice:leave");
    this.closeAllPeers();
    this.releaseMic();
    this.sessionId = null;
    this.update({ status: "idle", micOn: false, speaking: [] });
  }

  async setMic(on: boolean): Promise<void> {
    if (on) {
      if (!this.micTrack || this.micTrack.readyState === "ended") await this.acquireMic();
      else this.setMicEnabled(true);
    } else {
      this.setMicEnabled(false);
    }
    this.sendState();
  }

  setSpeaker(on: boolean): void {
    for (const peer of this.peers.values()) peer.audio.muted = !on;
    this.update({ speakerOn: on });
    if (on) this.unlockAudio();
    this.sendState();
  }

  /** Retry playback after the browser blocked autoplay; call from a tap. */
  unlockAudio(): void {
    this.ensureAudioContext();
    void this.audioContext?.resume();
    for (const peer of this.peers.values()) this.play(peer.audio);
    this.update({ audioBlocked: false });
  }

  destroy(): void {
    if (this.destroyed) return;
    this.leave();
    this.destroyed = true;
    this.socket?.close();
    this.socket = null;
    if (this.levelTimer) clearInterval(this.levelTimer);
    this.levelTimer = null;
    void this.audioContext?.close();
    this.audioContext = null;
    this.listeners.clear();
  }

  // ---------- Mic ----------

  private async acquireMic(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const track = stream.getAudioTracks()[0];
      if (!track) throw new Error("No audio track");
      if (this.destroyed || !this.wantJoined) {
        track.stop();
        return;
      }
      this.micTrack?.stop();
      this.micTrack = track;
      this.micAnalyser = this.createAnalyser(new MediaStream([track]));
      for (const peer of this.peers.values()) void this.senderOf(peer)?.replaceTrack(track);
      this.setMicEnabled(true);
      this.update({ micDenied: false });
    } catch {
      this.update({ micDenied: true, micOn: false });
    }
  }

  private setMicEnabled(on: boolean): void {
    if (this.micReleaseTimer) clearTimeout(this.micReleaseTimer);
    this.micReleaseTimer = null;
    if (!this.micTrack) {
      this.update({ micOn: false });
      return;
    }
    this.micTrack.enabled = on;
    if (!on) this.micReleaseTimer = setTimeout(() => this.releaseMic(), MIC_RELEASE_MS);
    this.update({ micOn: on });
  }

  private releaseMic(): void {
    if (this.micReleaseTimer) clearTimeout(this.micReleaseTimer);
    this.micReleaseTimer = null;
    this.micTrack?.stop();
    this.micTrack = null;
    this.micAnalyser?.disconnect();
    this.micAnalyser = null;
    for (const peer of this.peers.values()) void this.senderOf(peer)?.replaceTrack(null);
  }

  // ---------- Signaling ----------

  private sendJoin(): void {
    this.sessionId = newSessionId();
    this.socket?.emit("voice:join", {
      session_id: this.sessionId,
      mic_on: this.snapshot.micOn,
      speaker_on: this.snapshot.speakerOn,
    });
  }

  private sendState(): void {
    if (this.snapshot.status !== "joined") return;
    this.socket?.emit("voice:state", { mic_on: this.snapshot.micOn, speaker_on: this.snapshot.speakerOn });
  }

  private sendSignal(peer: Peer, data: SignalData): void {
    this.socket?.emit("voice:signal", { to: peer.id, to_session: peer.session, data });
  }

  /** Match peer connections to the roster: one per other connected member, rebuilt when their session changes. */
  private reconcilePeers(): void {
    if (this.snapshot.status !== "joined") return;
    const wanted = new Map(
      this.snapshot.roster
        .filter((m) => m.connected && m.player_id !== this.playerId)
        .map((m) => [m.player_id, m.session_id]),
    );
    for (const peer of [...this.peers.values()]) {
      if (wanted.get(peer.id) !== peer.session) this.closePeer(peer.id);
    }
    for (const [id, session] of wanted) {
      if (!this.peers.has(id)) this.createPeer(id, session);
    }
  }

  private createPeer(id: string, session: string): Peer {
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    const audio = document.createElement("audio");
    audio.autoplay = true;
    audio.setAttribute("playsinline", "");
    audio.muted = !this.snapshot.speakerOn;
    audio.style.display = "none";
    document.body.appendChild(audio);

    const peer: Peer = { id, session, pc, polite: this.playerId < id, makingOffer: false, ignoreOffer: false, audio, analyser: null };
    this.peers.set(id, peer);
    this.setLink(id, "connecting");

    pc.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true;
        await pc.setLocalDescription();
        this.sendDescription(peer);
      } catch (err) {
        console.warn("voice: offer failed", err);
      } finally {
        peer.makingOffer = false;
      }
    };
    pc.onicecandidate = ({ candidate }) => this.sendSignal(peer, { candidate: candidate?.toJSON() ?? null });
    pc.ontrack = ({ track, streams }) => {
      const stream = streams[0] ?? new MediaStream([track]);
      audio.srcObject = stream;
      peer.analyser?.disconnect();
      peer.analyser = this.createAnalyser(stream);
      this.play(audio);
    };
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === "connected") this.setLink(id, "connected");
      else if (state === "failed") this.setLink(id, "failed");
      else if (state === "connecting" || state === "new") this.setLink(id, "connecting");
    };
    // A network switch (Wi-Fi <-> 4G) fails the old ICE path; restart ICE instead of dropping the call.
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "failed") pc.restartIce();
    };

    // The impolite side opens the connection; the polite side answers with a transceiver from the offer.
    if (!peer.polite) pc.addTransceiver(this.micTrack ?? "audio", { direction: "sendrecv" });
    return peer;
  }

  private sendDescription(peer: Peer): void {
    const desc = peer.pc.localDescription;
    if (!desc) return;
    this.sendSignal(peer, { description: { type: desc.type, sdp: withVoiceOpusParams(desc.sdp) } });
  }

  private async onSignal(msg: { from: string; from_session: string; to_session: string; data: SignalData }): Promise<void> {
    if (this.snapshot.status !== "joined" || msg.to_session !== this.sessionId) return;
    let peer = this.peers.get(msg.from);
    if (peer && peer.session !== msg.from_session) {
      this.closePeer(msg.from);
      peer = undefined;
    }
    // The server vouches for the sender; the roster update announcing them may simply not have arrived yet.
    peer ??= this.createPeer(msg.from, msg.from_session);
    const { pc } = peer;
    const { description, candidate } = msg.data;

    try {
      if (description) {
        const collision = description.type === "offer" && (peer.makingOffer || pc.signalingState !== "stable");
        peer.ignoreOffer = !peer.polite && collision;
        if (peer.ignoreOffer) return;
        await pc.setRemoteDescription(description);
        if (description.type === "offer") {
          const transceiver = pc.getTransceivers()[0];
          if (transceiver && transceiver.direction !== "sendrecv") transceiver.direction = "sendrecv";
          if (transceiver && transceiver.sender.track !== this.micTrack) await transceiver.sender.replaceTrack(this.micTrack);
          await pc.setLocalDescription();
          this.sendDescription(peer);
        }
      } else if (candidate !== undefined) {
        try {
          await pc.addIceCandidate(candidate ?? undefined);
        } catch (err) {
          if (!peer.ignoreOffer) throw err;
        }
      }
    } catch (err) {
      console.warn("voice: signaling failed", err);
    }
  }

  private senderOf(peer: Peer): RTCRtpSender | undefined {
    return peer.pc.getTransceivers()[0]?.sender;
  }

  private closePeer(id: string): void {
    const peer = this.peers.get(id);
    if (!peer) return;
    this.peers.delete(id);
    peer.pc.onnegotiationneeded = null;
    peer.pc.onicecandidate = null;
    peer.pc.ontrack = null;
    peer.pc.onconnectionstatechange = null;
    peer.pc.oniceconnectionstatechange = null;
    peer.pc.close();
    peer.analyser?.disconnect();
    peer.audio.srcObject = null;
    peer.audio.remove();
    this.lastLoud.delete(id);
    const links = { ...this.snapshot.links };
    delete links[id];
    this.update({ links });
  }

  private closeAllPeers(): void {
    for (const id of [...this.peers.keys()]) this.closePeer(id);
  }

  private setLink(id: string, link: PeerLink): void {
    if (this.snapshot.links[id] === link) return;
    this.update({ links: { ...this.snapshot.links, [id]: link } });
  }

  // ---------- Audio ----------

  private play(audio: HTMLAudioElement): void {
    audio.play().catch(() => this.update({ audioBlocked: true }));
  }

  private ensureAudioContext(): void {
    if (this.audioContext || typeof window === "undefined") return;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.audioContext = new Ctx();
    void this.audioContext.resume();
    this.levelTimer = setInterval(() => this.pollLevels(), LEVEL_POLL_MS);
  }

  /** An analyser tap for speaking detection. It is not connected to the speakers; the <audio> element plays the sound. */
  private createAnalyser(stream: MediaStream): AnalyserNode | null {
    if (!this.audioContext) return null;
    const analyser = this.audioContext.createAnalyser();
    analyser.fftSize = 512;
    this.audioContext.createMediaStreamSource(stream).connect(analyser);
    return analyser;
  }

  private pollLevels(): void {
    const now = Date.now();
    const sources: [string, AnalyserNode | null][] = [
      [this.playerId, this.snapshot.micOn ? this.micAnalyser : null],
      ...[...this.peers.values()].map((p): [string, AnalyserNode | null] => [p.id, p.analyser]),
    ];
    const speaking: string[] = [];
    for (const [id, analyser] of sources) {
      if (analyser && rms(analyser) > SPEAKING_LEVEL) this.lastLoud.set(id, now);
      if (now - (this.lastLoud.get(id) ?? 0) < SPEAKING_HOLD_MS) speaking.push(id);
    }
    const prev = this.snapshot.speaking;
    if (speaking.length !== prev.length || speaking.some((id, i) => prev[i] !== id)) this.update({ speaking });
  }
}

const levelBuffer = new Uint8Array(512);

function rms(analyser: AnalyserNode): number {
  analyser.getByteTimeDomainData(levelBuffer);
  let sum = 0;
  for (let i = 0; i < analyser.fftSize; i++) {
    const v = (levelBuffer[i]! - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / analyser.fftSize);
}
