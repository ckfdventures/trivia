import type { Db } from "mongodb";
import type { AppConfig } from "./config/env.js";
import { ScribbleRoomCleanupJob } from "./games/scribblex/jobs/room-cleanup.job.js";
import { MongoDeckRepository } from "./games/scribblex/repositories/deck.repository.js";
import { ScribbleDeckService } from "./games/scribblex/services/deck.service.js";
import { ScribbleDrawingService } from "./games/scribblex/services/drawing.service.js";
import { ScribbleMatchService } from "./games/scribblex/services/match.service.js";
import { WordFileParser } from "./games/scribblex/services/word-file-parser.js";
import { ScribbleRoomNotifier } from "./games/scribblex/services/room-notifier.js";
import { ScribbleRoomService } from "./games/scribblex/services/room.service.js";
import { ScribbleRoomStore } from "./games/scribblex/services/room-store.js";
import { createAuthMiddleware } from "./http/middleware/auth.js";
import { RoomCleanupJob } from "./jobs/room-cleanup.job.js";
import { MongoQuestionRepository } from "./repositories/question.repository.js";
import { MongoThemeRepository } from "./repositories/theme.repository.js";
import { MongoUserRepository } from "./repositories/user.repository.js";
import { AuthService } from "./services/auth.service.js";
import { GameService } from "./services/game.service.js";
import { CloudflareTurnIceServers, StunOnlyIceServers } from "./services/ice-servers.js";
import { BcryptPasswordHasher } from "./services/password-hasher.js";
import { PresenceService } from "./services/presence.service.js";
import { WordListProfanityFilter } from "./services/profanity-filter.js";
import { QuestionFileParser } from "./services/question-file-parser.js";
import { QuestionImportService } from "./services/question-import.service.js";
import { QuestionValidator } from "./services/question-validator.js";
import { RoomNotifier } from "./services/room-notifier.js";
import { RoomStore } from "./services/room-store.js";
import { ThemeService } from "./services/theme.service.js";
import { JwtTokenService } from "./services/token-service.js";
import { VoiceService } from "./services/voice.service.js";
import type { Logger } from "./shared/logger.js";

export interface ContainerOptions {
  hostPromotionGraceMs?: number;
}

/** Composition root: the only place concrete implementations are chosen and wired together. */
export function createContainer(config: AppConfig, db: Db, logger: Logger, options: ContainerOptions = {}) {
  const userRepo = new MongoUserRepository(db);
  const themeRepo = new MongoThemeRepository(db);
  const questionRepo = new MongoQuestionRepository(db);

  const profanity = new WordListProfanityFilter();
  const validator = new QuestionValidator(profanity);
  const authService = new AuthService(
    userRepo,
    new BcryptPasswordHasher(),
    new JwtTokenService(config.jwtSecret, config.jwtExpiresHours),
  );
  const themeService = new ThemeService(themeRepo, questionRepo, validator);
  const questionFileParser = new QuestionFileParser(profanity);
  const questionImport = new QuestionImportService(validator, themeService, questionRepo);

  const roomStore = new RoomStore();
  const notifier = new RoomNotifier(roomStore);
  const gameService = new GameService(roomStore, notifier, themeService, profanity);
  const presence = new PresenceService(roomStore, notifier, gameService, logger, options.hostPromotionGraceMs);
  const iceServers = config.turn
    ? new CloudflareTurnIceServers(config.turn.keyId, config.turn.apiToken)
    : new StunOnlyIceServers();
  const voiceService = new VoiceService(roomStore, iceServers, logger);

  // ScribbleX keeps its own room registry; the two games share only the profanity filter
  // until the room layer is generalised (DECISIONS.md D5).
  const scribbleStore = new ScribbleRoomStore();
  const scribbleNotifier = new ScribbleRoomNotifier(scribbleStore);
  const deckRepo = new MongoDeckRepository(db);
  const scribbleDecks = new ScribbleDeckService(deckRepo, profanity);
  const scribbleWordParser = new WordFileParser(profanity);
  const scribbleMatch = new ScribbleMatchService(scribbleStore, scribbleNotifier, scribbleDecks, logger);
  // The room service drives lobby lifecycle and calls back into the match when a public
  // lobby's countdown expires or a drawer stays gone — a one-way hook, so the two services
  // do not have to know about each other's types.
  const scribbleRooms = new ScribbleRoomService(
    scribbleStore,
    scribbleNotifier,
    profanity,
    // These hooks fire from timers with no caller waiting on them, so a rejection here
    // would surface as an unhandled promise and take the process down.
    (room) => void scribbleMatch.autoStart(room).catch((err) => logger.error("scribblex autostart failed", err)),
    (room) => scribbleMatch.onDrawerLost(room),
  );
  const scribbleDrawing = new ScribbleDrawingService(scribbleStore, scribbleNotifier);

  return {
    config,
    logger,
    authService,
    authMiddleware: createAuthMiddleware(authService),
    themeService,
    questionFileParser,
    questionImport,
    roomStore,
    gameService,
    presence,
    voiceService,
    scribbleStore,
    scribbleNotifier,
    scribbleRooms,
    scribbleDrawing,
    scribbleDecks,
    scribbleWordParser,
    scribbleMatch,
    jobs: [
      new RoomCleanupJob(roomStore, gameService, logger),
      new ScribbleRoomCleanupJob(scribbleStore, logger),
    ],
    /** One-time startup work: indexes and the admin account. */
    async initialize(): Promise<void> {
      await Promise.all([themeRepo.ensureIndexes(), questionRepo.ensureIndexes(), deckRepo.ensureIndexes()]);
      await authService.seedAdmin(config.adminEmail, config.adminPassword);
      const seeded = await deckRepo.seedIfEmpty();
      if (seeded > 0) logger.info(`seeded ${seeded} ScribbleX word decks`);
    },
  };
}

export type Container = ReturnType<typeof createContainer>;
