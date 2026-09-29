import { createServer } from "node:http";
import { corsOrigin, createApp } from "./app.js";
import { loadConfig } from "./config/env.js";
import { createContainer } from "./container.js";
import { connectMongo } from "./infrastructure/mongo.js";
import { JobScheduler } from "./jobs/scheduler.js";
import { attachSocketGateway } from "./realtime/socket-gateway.js";
import { consoleLogger as logger } from "./shared/logger.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const mongo = await connectMongo(config.mongoUrl, config.dbName);
  const container = createContainer(config, mongo.db, logger);
  await container.initialize();

  const httpServer = createServer(createApp(container));
  const io = attachSocketGateway(
    httpServer,
    {
      presence: container.presence,
      voice: container.voiceService,
      scribbleRooms: container.scribbleRooms,
      scribbleNotifier: container.scribbleNotifier,
      logger,
    },
    corsOrigin(config.corsOrigins),
  );
  const scheduler = new JobScheduler(logger);
  scheduler.start(container.jobs);

  httpServer.listen(config.port, () => logger.info(`TriviaStream API listening on :${config.port}`));

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down`);
    scheduler.stop();
    await io.close();
    await mongo.client.close();
    process.exit(0);
  };
  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error("failed to start", err);
  process.exit(1);
});
