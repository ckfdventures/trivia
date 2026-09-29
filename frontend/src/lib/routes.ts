/**
 * Every route in the app, in one place.
 *
 * Games live under their own path prefix so the platform can add games without colliding:
 * `/trivia/*`, `/scribblex/*`. The pre-platform trivia routes (`/play/*`, `/host/*`) are kept
 * alive as permanent redirects in `next.config.ts` so invite links already in the wild keep
 * working — see DECISIONS.md D7.
 */

export const routes = {
  home: "/",

  trivia: {
    home: "/trivia",
    /** Join screen; with a PIN it pre-fills and skips straight to the nickname step. */
    join: (pin?: string) => (pin ? `/trivia/play/${pin}` : "/trivia/play"),
    playerLobby: (pin: string) => `/trivia/play/${pin}/lobby`,
    playerGame: (pin: string) => `/trivia/play/${pin}/game`,
    hostCreate: "/trivia/host/create",
    hostLobby: (pin: string) => `/trivia/host/lobby/${pin}`,
    hostGame: (pin: string) => `/trivia/host/game/${pin}`,
  },

  scribblex: {
    home: "/scribblex",
    /** Name and avatar. Carries the intent that sent the player here (`create`/`join`/`quick`). */
    profile: "/scribblex/avatar",
    room: (code: string) => `/scribblex/room/${code}`,
  },

  admin: {
    login: "/admin/login",
    root: "/admin",
    themes: "/admin/themes",
    upload: "/admin/upload",
  },
} as const;
