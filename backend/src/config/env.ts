import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8001),
  MONGO_URL: z.string().min(1),
  DB_NAME: z.string().min(1),
  CORS_ORIGINS: z.string().default("*"),
  JWT_SECRET: z.string().min(1),
  JWT_EXPIRES_HOURS: z.coerce.number().positive().default(24),
  ADMIN_EMAIL: z.email(),
  ADMIN_PASSWORD: z.string().min(8, "ADMIN_PASSWORD must be at least 8 characters"),
});

export interface AppConfig {
  port: number;
  mongoUrl: string;
  dbName: string;
  corsOrigins: string[];
  jwtSecret: string;
  jwtExpiresHours: number;
  adminEmail: string;
  adminPassword: string;
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration — ${problems}`);
  }
  const env = parsed.data;
  return {
    port: env.PORT,
    mongoUrl: env.MONGO_URL,
    dbName: env.DB_NAME,
    corsOrigins: env.CORS_ORIGINS.split(","),
    jwtSecret: env.JWT_SECRET,
    jwtExpiresHours: env.JWT_EXPIRES_HOURS,
    adminEmail: env.ADMIN_EMAIL.toLowerCase(),
    adminPassword: env.ADMIN_PASSWORD,
  };
}
