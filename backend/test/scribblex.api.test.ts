import type { Db } from "mongodb";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { AppConfig } from "../src/config/env.js";
import { createContainer } from "../src/container.js";
import { silentLogger } from "../src/shared/logger.js";

/**
 * Drives the ScribbleX HTTP surface over real requests.
 *
 * No MongoDB is needed: none of these routes read or write it, and the container only touches
 * the database inside `initialize()`, which is never called here. That keeps the REST contract
 * — status codes included — under test without standing a database up.
 */

const config: AppConfig = {
  port: 0,
  mongoUrl: "mongodb://unused",
  dbName: "test",
  corsOrigins: ["*"],
  jwtSecret: "test-secret",
  jwtExpiresHours: 1,
  adminEmail: "admin@example.com",
  adminPassword: "password123",
  turn: null,
};

/**
 * The repositories grab their collections when they are constructed, so the stub has to answer
 * `collection()`. Nothing beyond that is ever reached: no ScribbleX route reads or writes Mongo,
 * and any accidental use would fail loudly rather than silently passing.
 */
const stubDb = () => ({ collection: () => ({}) }) as unknown as Db;

function app() {
  return createApp(createContainer(config, stubDb(), silentLogger));
}

const profile = (name: string) => ({ profile: { name, avatar_id: "pip", hat_id: null } });

describe("POST /api/scribblex/rooms", () => {
  it("opens a room and returns a seat", async () => {
    const res = await request(app()).post("/api/scribblex/rooms").send(profile("Host"));

    expect(res.status).toBe(201);
    expect(res.body.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(res.body.display_code).toBe(`${res.body.code.slice(0, 3)}-${res.body.code.slice(3)}`);
    expect(res.body.player_id).toEqual(expect.any(String));
    expect(res.body.session_token).toEqual(expect.any(String));
    expect(res.body.room.players).toHaveLength(1);
    expect(res.body.room.phase).toBe("LOBBY");
  });

  it("accepts opening settings", async () => {
    const res = await request(app())
      .post("/api/scribblex/rooms")
      .send({ ...profile("Host"), settings: { rounds: 8, turn_seconds: 45, is_private: true } });

    expect(res.status).toBe(201);
    expect(res.body.room.settings.rounds).toBe(8);
    expect(res.body.room.settings.turn_seconds).toBe(45);
    expect(res.body.room.settings.is_private).toBe(true);
  });

  it("rejects a missing profile with 422", async () => {
    const res = await request(app()).post("/api/scribblex/rooms").send({});
    expect(res.status).toBe(422);
    expect(res.body.detail[0]).toMatchObject({ type: "missing", loc: ["body", "profile"] });
  });

  it("rejects a rounds value outside the allowed set", async () => {
    const res = await request(app())
      .post("/api/scribblex/rooms")
      .send({ ...profile("Host"), settings: { rounds: 4 } });
    expect(res.status).toBe(422);
  });
});

describe("POST /api/scribblex/rooms/:code/join", () => {
  it("seats a second player", async () => {
    const server = app();
    const created = await request(server).post("/api/scribblex/rooms").send(profile("Host"));
    const res = await request(server)
      .post(`/api/scribblex/rooms/${created.body.code}/join`)
      .send(profile("Guest"));

    expect(res.status).toBe(201);
    expect(res.body.room.players).toHaveLength(2);
    expect(res.body.player_id).not.toBe(created.body.player_id);
    expect(res.body.session_token).not.toBe(created.body.session_token);
  });

  it("accepts the displayed form of the code", async () => {
    const server = app();
    const created = await request(server).post("/api/scribblex/rooms").send(profile("Host"));
    const res = await request(server)
      .post(`/api/scribblex/rooms/${created.body.display_code.toLowerCase()}/join`)
      .send(profile("Guest"));

    expect(res.status).toBe(201);
  });

  it("answers 404 for an unknown code", async () => {
    const res = await request(app()).post("/api/scribblex/rooms/ZZZZZZ/join").send(profile("Guest"));
    expect(res.status).toBe(404);
    expect(res.body.detail).toMatch(/no room/i);
  });

  it("answers 409 when the room is full", async () => {
    const server = app();
    const created = await request(server)
      .post("/api/scribblex/rooms")
      .send({ ...profile("Host"), settings: { max_players: 2 } });
    await request(server).post(`/api/scribblex/rooms/${created.body.code}/join`).send(profile("Guest"));

    const res = await request(server)
      .post(`/api/scribblex/rooms/${created.body.code}/join`)
      .send(profile("Third"));
    expect(res.status).toBe(409);
    expect(res.body.detail).toMatch(/full/i);
  });
});

describe("GET /api/scribblex/rooms/:code", () => {
  it("returns room state without any session token", async () => {
    const server = app();
    const created = await request(server).post("/api/scribblex/rooms").send(profile("Host"));

    const res = await request(server).get(`/api/scribblex/rooms/${created.body.code}`);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain(created.body.session_token);
    expect(res.body.players[0].id).toBe(created.body.player_id);
  });

  it("answers 404 for an unknown code", async () => {
    const res = await request(app()).get("/api/scribblex/rooms/ZZZZZZ");
    expect(res.status).toBe(404);
  });
});

describe("GET /api/scribblex/rooms", () => {
  it("lists public lobbies and hides private ones", async () => {
    const server = app();
    const open = await request(server).post("/api/scribblex/rooms").send(profile("Open"));
    const hidden = await request(server)
      .post("/api/scribblex/rooms")
      .send({ ...profile("Hidden"), settings: { is_private: true } });

    const res = await request(server).get("/api/scribblex/rooms");
    expect(res.status).toBe(200);
    const codes = res.body.map((r: { code: string }) => r.code);
    expect(codes).toContain(open.body.code);
    expect(codes).not.toContain(hidden.body.code);
  });
});

describe("POST /api/scribblex/rooms/quick-play", () => {
  it("opens a room when there is nothing to join", async () => {
    const res = await request(app()).post("/api/scribblex/rooms/quick-play").send(profile("Solo"));
    expect(res.status).toBe(201);
    expect(res.body.room.players).toHaveLength(1);
  });

  it("drops the player into an existing public lobby", async () => {
    const server = app();
    const created = await request(server).post("/api/scribblex/rooms").send(profile("Host"));

    const res = await request(server).post("/api/scribblex/rooms/quick-play").send(profile("Drifter"));
    expect(res.status).toBe(201);
    expect(res.body.code).toBe(created.body.code);
    expect(res.body.room.players).toHaveLength(2);
  });

  it("never drops the player into a private room", async () => {
    const server = app();
    const hidden = await request(server)
      .post("/api/scribblex/rooms")
      .send({ ...profile("Hidden"), settings: { is_private: true } });

    const res = await request(server).post("/api/scribblex/rooms/quick-play").send(profile("Drifter"));
    expect(res.body.code).not.toBe(hidden.body.code);
  });
});
