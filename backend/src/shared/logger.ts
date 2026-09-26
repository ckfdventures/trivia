export interface Logger {
  info(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

export const consoleLogger: Logger = {
  info: (message, ...args) => console.info(`${new Date().toISOString()} INFO ${message}`, ...args),
  error: (message, ...args) => console.error(`${new Date().toISOString()} ERROR ${message}`, ...args),
};

export const silentLogger: Logger = { info: () => {}, error: () => {} };
