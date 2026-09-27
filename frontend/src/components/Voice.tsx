"use client";

import React, { useEffect, useState } from "react";
import { Microphone, MicrophoneSlash, SpeakerHigh, SpeakerSlash, SpeakerSimpleHigh, WifiSlash } from "@phosphor-icons/react";
import { voiceChoiceKey } from "../hooks/useVoice";
import { errorMessage } from "../lib/api";
import { hostMuteAll } from "../lib/game";
import type { VoiceManager, VoiceSnapshot } from "../lib/voice/VoiceManager";

interface VoiceProps {
  pin: string;
  voice: VoiceManager | null;
  snapshot: VoiceSnapshot;
}

function rememberChoice(pin: string, choice: "on" | "off"): void {
  try {
    window.localStorage.setItem(voiceChoiceKey(pin), choice);
  } catch {
    /* storage unavailable */
  }
}

/** First-visit explainer shown before the browser's mic prompt. */
export function VoicePrompt({ pin, voice, snapshot }: VoiceProps) {
  const [decided, setDecided] = useState(true);
  useEffect(() => {
    let choice: string | null = null;
    try {
      choice = window.localStorage.getItem(voiceChoiceKey(pin));
    } catch {
      /* storage unavailable */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
    setDecided(choice !== null);
  }, [pin]);

  if (decided || !voice || snapshot.status !== "idle") return null;
  const choose = (join: boolean) => {
    rememberChoice(pin, join ? "on" : "off");
    setDecided(true);
    if (join) void voice.join();
  };
  const full = snapshot.roster.length >= snapshot.capacity;

  return (
    <div className="fixed inset-0 z-50 bg-indigo-950/70 backdrop-blur-sm flex items-center justify-center p-6" data-testid="voice-prompt">
      <div className="max-w-md w-full bg-white rounded-3xl p-8 card-lift">
        <div className="h-14 w-14 rounded-2xl bg-orange-300 grid place-items-center">
          <Microphone size={30} weight="fill" className="text-indigo-950" />
        </div>
        <h3 className="font-display font-black text-3xl text-indigo-950 mt-5">Talk with the other players?</h3>
        <p className="text-indigo-950/70 font-semibold mt-3">
          Voice chat lets up to {snapshot.capacity} players hear each other during the game. Your browser will ask for
          your mic next; if you say no, you can still listen. You can mute yourself or the room at any time.
        </p>
        <p className="text-indigo-950/50 font-semibold text-sm mt-3">Voice uses mobile data, up to about 100 MB an hour.</p>
        {full && <p className="text-red-600 font-bold text-sm mt-3">Voice is full right now ({snapshot.capacity} players).</p>}
        <div className="mt-8 flex gap-3 justify-end">
          <button
            onClick={() => choose(false)}
            data-testid="voice-prompt-skip"
            className="rounded-full border-2 border-indigo-200 hover:bg-indigo-50 font-bold px-5 h-12 text-indigo-950"
          >
            Not now
          </button>
          <button
            onClick={() => choose(true)}
            disabled={full}
            data-testid="voice-prompt-join"
            className="btn-arcade rounded-full font-black px-6 h-12 bg-orange-300 hover:bg-orange-400 text-indigo-950 disabled:opacity-50"
          >
            Join voice
          </button>
        </div>
      </div>
    </div>
  );
}

const pill = "rounded-full h-9 inline-flex items-center justify-center gap-2 text-xs font-black transition-colors";

/** Header controls: join voice, or the mic and speaker toggles once in. */
export function VoiceControls({ pin, voice, snapshot }: VoiceProps) {
  if (!voice) return null;
  const { status } = snapshot;

  if (status === "idle" || status === "full") {
    const full = status === "full" || snapshot.roster.length >= snapshot.capacity;
    return (
      <button
        onClick={() => {
          rememberChoice(pin, "on");
          void voice.join();
        }}
        disabled={full}
        data-testid="voice-join-btn"
        aria-label={full ? "Voice full" : "Join voice"}
        className={`${pill} px-3 bg-white/10 text-white border border-white/20 hover:bg-white/20 disabled:opacity-60`}
      >
        <Microphone size={16} weight="bold" />
        <span className="hidden min-[380px]:inline">{full ? "VOICE FULL" : "VOICE"}</span>
      </button>
    );
  }

  const joining = status === "joining";
  return (
    <div className="flex items-center gap-1.5">
      {snapshot.audioBlocked && (
        <button
          onClick={() => voice.unlockAudio()}
          data-testid="voice-unlock-btn"
          className={`${pill} px-3 bg-orange-300 text-indigo-950 animate-pulse`}
        >
          <SpeakerSimpleHigh size={16} weight="fill" /> TAP TO HEAR
        </button>
      )}
      <button
        onClick={() => void voice.setMic(!snapshot.micOn)}
        disabled={joining}
        data-testid="voice-mic-btn"
        aria-label={snapshot.micOn ? "Mute mic" : snapshot.micDenied ? "Mic blocked — tap to retry" : "Unmute mic"}
        aria-pressed={snapshot.micOn}
        title={snapshot.micDenied ? "Mic permission was refused. Allow it in your browser settings, then tap." : undefined}
        className={`${pill} w-9 ${snapshot.micOn ? "bg-white/15 text-white" : "bg-red-500/25 text-red-200"} disabled:opacity-50`}
      >
        {snapshot.micOn ? <Microphone size={18} weight="fill" /> : <MicrophoneSlash size={18} weight="fill" />}
      </button>
      <button
        onClick={() => voice.setSpeaker(!snapshot.speakerOn)}
        disabled={joining}
        data-testid="voice-speaker-btn"
        aria-label={snapshot.speakerOn ? "Turn speaker off" : "Turn speaker on"}
        aria-pressed={snapshot.speakerOn}
        className={`${pill} w-9 ${snapshot.speakerOn ? "bg-white/15 text-white" : "bg-red-500/25 text-red-200"} disabled:opacity-50`}
      >
        {snapshot.speakerOn ? <SpeakerHigh size={18} weight="fill" /> : <SpeakerSlash size={18} weight="fill" />}
      </button>
    </div>
  );
}

interface RosterProps {
  snapshot: VoiceSnapshot;
  selfId: string | undefined;
  players: { id: string; nickname: string }[];
  className?: string;
}

/** Who's in voice: a speaking glow, and badges for a muted mic, speaker off or a failed link. */
export function VoiceRoster({ snapshot, selfId, players, className = "" }: RosterProps) {
  const [notice, setNotice] = useState(false);
  useEffect(() => {
    if (!snapshot.mutedByHostAt) return undefined;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- showing a timed notice for a voice event
    setNotice(true);
    const t = setTimeout(() => setNotice(false), 4000);
    return () => clearTimeout(t);
  }, [snapshot.mutedByHostAt]);

  if (snapshot.roster.length === 0 && !notice) return null;
  const names = new Map(players.map((p) => [p.id, p.nickname]));

  return (
    <div className={className} data-testid="voice-roster">
      {notice && (
        <div className="mb-2 rounded-full bg-orange-300 text-indigo-950 text-xs font-black px-4 py-2 text-center" data-testid="voice-muted-notice">
          The host muted everyone. Tap the mic to talk again.
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {snapshot.roster.map((m) => {
          const isSelf = m.player_id === selfId;
          const speaking = snapshot.speaking.includes(m.player_id);
          const name = names.get(m.player_id) ?? "Player";
          const failed = !isSelf && snapshot.links[m.player_id] === "failed";
          return (
            <div
              key={m.player_id}
              data-testid={`voice-member-${m.player_id}`}
              data-speaking={speaking}
              className={
                "relative inline-flex items-center gap-1.5 rounded-full pl-1 pr-3 h-8 text-xs font-bold border transition-all " +
                (speaking
                  ? "bg-green-400/25 border-green-300 text-white shadow-[0_0_14px_rgba(74,222,128,0.7)]"
                  : "bg-white/10 border-white/15 text-white/90") +
                (m.connected ? "" : " opacity-50")
              }
            >
              <span
                className={
                  "h-6 w-6 rounded-full grid place-items-center text-[11px] font-black " +
                  (speaking ? "bg-green-300 text-indigo-950" : "bg-white/20 text-white")
                }
              >
                {name.slice(0, 1).toUpperCase()}
              </span>
              <span className="max-w-[7rem] truncate">{isSelf ? `${name} (you)` : name}</span>
              {!m.mic_on && <MicrophoneSlash size={13} weight="fill" className="text-red-300" aria-label="Mic off" />}
              {!m.speaker_on && <SpeakerSlash size={13} weight="fill" className="text-red-300" aria-label="Can't hear" />}
              {failed && <WifiSlash size={13} weight="bold" className="text-orange-300" aria-label="Can't connect" />}
            </div>
          );
        })}
        <span className="text-white/40 text-xs font-bold">
          {snapshot.roster.length}/{snapshot.capacity} in voice
        </span>
      </div>
    </div>
  );
}

/** Host control: mute every player's mic (the host's own stays on). Players can unmute themselves. */
export function HostMuteAllButton({ pin, hostToken }: { pin: string; hostToken: string | undefined }) {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState("");
  const muteAll = async () => {
    if (!hostToken) return;
    setState("busy");
    setError("");
    try {
      await hostMuteAll(pin, hostToken);
      setState("done");
      setTimeout(() => setState("idle"), 2000);
    } catch (e) {
      setError(errorMessage(e));
      setState("idle");
    }
  };
  return (
    <button
      onClick={muteAll}
      disabled={state === "busy"}
      data-testid="host-mute-all-btn"
      aria-label="Mute everyone"
      title={error || "Mute every player's mic"}
      className="rounded-full bg-white/10 hover:bg-white/20 text-white font-bold px-3 sm:px-4 h-10 inline-flex items-center gap-2 border border-white/20 disabled:opacity-60"
    >
      <MicrophoneSlash size={16} weight="fill" />
      <span className="hidden sm:inline">{state === "done" ? "Muted!" : "Mute everyone"}</span>
    </button>
  );
}
