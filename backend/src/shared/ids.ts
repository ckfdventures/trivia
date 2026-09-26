import { randomInt, randomUUID } from "node:crypto";

export const newId = (): string => randomUUID();

export function randomDigits(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += String(randomInt(10));
  return out;
}
