"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { BACKEND_URL, SOCKET_PATH } from "../lib/api";
import { mergeStroke, type DrawOp, type FillOp, type StrokeOp } from "../lib/scribblex/drawing";
import { addXp, XP_PER_CORRECT_GUESS, XP_PER_MATCH } from "../lib/scribblex/profile";
import { CHAT_MIN_INTERVAL_MS } from "../lib/scribblex/constants";
import type {
  ChatMessage,
  MatchStandings,
  RoomState,
  SettingsPatch,
  TurnEnd,
  TurnStart,
} from "../lib/scribblex/types";

interface Options {
  code: string;
  playerId: string | undefined;
  token: string | undefined;
}

export interface RoomActions {
  updateSettings(patch: SettingsPatch): void;
  setReady(ready: boolean): void;
  kick(playerId: string): void;
  leave(): void;
  start(): void;
  playAgain(): void;
  pickWord(index: number): void;
  guess(text: string): void;
}

/** Everything about the turn in progress that this player is allowed to know. */
export interface TurnView {
  /** The answer — only ever set once this player has drawn it or guessed it. */
  word: string | null;
  /** Per character: a letter if revealed, a space between words, otherwise null. */
  mask: (string | null)[];
  /** The three options, when it is this player's turn to choose. */
  choices: string[];
  /** Set during REVEAL: the word and who scored what. */
  ended: TurnEnd | null;
  /** Set at the end of the match. */
  standings: MatchStandings | null;
}

/** What changed on the canvas, so a painter can decide between an incremental draw and a replay. */
export type CanvasChange =
  | { type: "op"; op: DrawOp }
  | { type: "replay" };

export interface CanvasChannel {
  /** The live op log. Mutable and deliberately outside React state — see the note below. */
  ops: React.RefObject<DrawOp[]>;
  subscribe(listener: (change: CanvasChange) => void): () => void;
  /** Paint points the local player just made, without touching the network. */
  paintLocal(op: Omit<StrokeOp, "kind">): void;
  /** Hand accumulated points to the server. Paints nothing. */
  sendStroke(op: Omit<StrokeOp, "kind">): void;
  sendFill(op: Omit<FillOp, "kind">): void;
  undo(): void;
  redo(): void;
  clear(): void;
}

export interface ScribbleRoom {
  connected: boolean;
  state: RoomState | null;
  error: string | null;
  removed: boolean;
  actions: RoomActions;
  canvas: CanvasChannel;
  turn: TurnView;
  chat: ChatMessage[];
  dismissError(): void;
}

/** Enough scrollback to read the room; older lines fall off rather than growing forever. */
const MAX_CHAT_LINES = 120;

/**
 * Live connection to one ScribbleX room: lobby state and the shared canvas over one socket.
 *
 * The server is authoritative for room state, and nothing is applied optimistically — a
 * rejected settings change simply never arrives rather than flickering in and out.
 *
 * Canvas ops are the exception to that, in two ways. They live in a ref rather than React
 * state, because a stroke produces dozens of updates a second and re-rendering the lobby for
 * each would be hopeless; painters subscribe and draw imperatively instead. And the local
 * player's own marks are painted immediately rather than waiting for the round trip, because
 * a drawing tool that lags behind the finger feels broken — the server never echoes them back.
 */
export function useScribbleRoom({ code, playerId, token }: Options): ScribbleRoom {
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState<RoomState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [turn, setTurn] = useState<TurnView>({
    word: null,
    mask: [],
    choices: [],
    ended: null,
    standings: null,
  });

  const socketRef = useRef<Socket | null>(null);
  /** When the next guess may go out, so a fast typist never loses one to the rate limit. */
  const nextGuessAtRef = useRef(0);
  const opsRef = useRef<DrawOp[]>([]);
  const listenersRef = useRef(new Set<(change: CanvasChange) => void>());

  const notify = useCallback((change: CanvasChange) => {
    for (const listener of listenersRef.current) listener(change);
  }, []);

  useEffect(() => {
    if (!code || !playerId || !token) return undefined;

    // Captured for the cleanup below: the ref may point elsewhere by the time it runs.
    const listeners = listenersRef.current;
    const socket = io(BACKEND_URL, {
      path: SOCKET_PATH,
      auth: { role: "scribblex", code, playerId, token },
      reconnectionDelay: 1500,
      reconnectionDelayMax: 1500,
    });
    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("room:state", (data: RoomState) => setState(data));
    socket.on("room:error", (data: { message?: string }) =>
      setError(data?.message ?? "Something went wrong."),
    );
    socket.on("room:kicked", () => {
      setRemoved(true);
      socket.close();
    });

    // ── Match
    socket.on("turn:start", (data: TurnStart) => {
      // A new turn wipes what the last one revealed, including this player's copy of the word.
      setTurn({ word: null, mask: data.word_mask ?? [], choices: [], ended: null, standings: null });
      setChat([]);
    });
    socket.on("turn:wordChoices", (data: { words: string[] }) => {
      setTurn((t) => ({ ...t, choices: data.words ?? [] }));
    });
    socket.on("turn:word", (data: { word: string }) => {
      setTurn((t) => ({ ...t, word: data.word, choices: [] }));
    });
    socket.on("turn:hint", (data: { word_mask: (string | null)[] }) => {
      setTurn((t) => ({ ...t, mask: data.word_mask ?? t.mask }));
    });
    socket.on("turn:end", (data: TurnEnd) => {
      setTurn((t) => ({ ...t, ended: data, word: data.word, choices: [] }));
    });
    socket.on("match:end", (data: MatchStandings) => {
      setTurn((t) => ({ ...t, standings: data, ended: null, choices: [] }));
      // Progression is awarded here, where each event arrives exactly once, rather than from a
      // render that could run again. It lives in this browser only (PRD §13.7).
      addXp(XP_PER_MATCH);
    });
    socket.on("chat:message", (data: ChatMessage) => {
      setChat((lines) => [...lines, data].slice(-MAX_CHAT_LINES));
      if (data.kind === "correct" && data.from?.id === playerId) addXp(XP_PER_CORRECT_GUESS);
    });

    // ── Canvas
    socket.on("draw:sync", (data: { generation: number; ops: DrawOp[] }) => {
      opsRef.current = data.ops ?? [];
      notify({ type: "replay" });
    });
    socket.on("draw:stroke", (data: StrokeOp & { player_id: string }) => {
      const { ops, merged } = mergeStroke(opsRef.current, { ...data, kind: "stroke" });
      opsRef.current = ops;
      // The merged stroke, not the batch: the painter indexes points absolutely.
      notify({ type: "op", op: merged });
    });
    socket.on("draw:fill", (data: FillOp & { player_id: string }) => {
      const op: FillOp = { ...data, kind: "fill" };
      opsRef.current = [...opsRef.current, op];
      notify({ type: "op", op });
    });
    socket.on("draw:undo", (data: { op_id: string }) => {
      opsRef.current = opsRef.current.filter((o) => o.id !== data.op_id);
      // A removed mark cannot be un-painted incrementally; everyone repaints from the log.
      notify({ type: "replay" });
    });
    socket.on("draw:redo", (data: { op: DrawOp }) => {
      opsRef.current = [...opsRef.current, data.op];
      notify({ type: "replay" });
    });
    socket.on("draw:clear", () => {
      opsRef.current = [];
      notify({ type: "replay" });
    });

    return () => {
      socketRef.current = null;
      listeners.clear();
      socket.close();
    };
  }, [code, playerId, token, notify]);

  const emit = useCallback((event: string, payload?: unknown) => {
    socketRef.current?.emit(event, payload);
  }, []);

  const actions = useMemo<RoomActions>(
    () => ({
      updateSettings: (patch) => emit("room:updateSettings", patch),
      setReady: (ready) => emit("room:ready", { ready }),
      kick: (id) => emit("room:kick", { player_id: id }),
      leave: () => emit("room:leave"),
      start: () => emit("room:start"),
      playAgain: () => emit("room:playAgain"),
      pickWord: (index) => emit("turn:pickWord", { index }),
      guess: (text) => {
        // The server drops anything sent faster than its limit. Players in a guessing game
        // type fast and in bursts, and a guess that vanishes with no feedback reads as the
        // game being broken — so pace them here instead of losing them there.
        const now = Date.now();
        const wait = Math.max(0, nextGuessAtRef.current - now);
        nextGuessAtRef.current = now + wait + CHAT_MIN_INTERVAL_MS;
        if (wait === 0) emit("chat:guess", { text });
        else window.setTimeout(() => emit("chat:guess", { text }), wait);
      },
    }),
    [emit],
  );

  const canvas = useMemo<CanvasChannel>(
    () => ({
      ops: opsRef,
      subscribe(listener) {
        listenersRef.current.add(listener);
        return () => listenersRef.current.delete(listener);
      },
      // Painting and sending are separate so the pen never waits for the network. Points are
      // painted the moment they arrive from the pointer, then sent in batches; the server
      // never echoes the author's own strokes back, so there is no double-draw.
      paintLocal(op) {
        const { ops, merged } = mergeStroke(opsRef.current, { ...op, kind: "stroke" });
        opsRef.current = ops;
        notify({ type: "op", op: merged });
      },
      sendStroke(op) {
        emit("draw:stroke", op);
      },
      sendFill(op) {
        const local: FillOp = { ...op, kind: "fill" };
        opsRef.current = [...opsRef.current, local];
        notify({ type: "op", op: local });
        emit("draw:fill", op);
      },
      // Undo, redo and clear wait for the server: it owns the op order, and guessing at it
      // locally would put this client out of step with everyone else.
      undo: () => emit("draw:undo"),
      redo: () => emit("draw:redo"),
      clear: () => emit("draw:clear"),
    }),
    [emit, notify],
  );

  const dismissError = useCallback(() => setError(null), []);

  return { connected, state, error, removed, actions, canvas, turn, chat, dismissError };
}
