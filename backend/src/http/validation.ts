import type { Request } from "express";
import type { z } from "zod";
import { HttpError } from "../shared/http-error.js";

type Location = "body" | "query";

/** Parse `req[location]` with `schema`, or throw a 422 in FastAPI's `{ detail: [...] }` shape. */
function parse<T extends z.ZodType>(schema: T, req: Request, location: Location): z.infer<T> {
  const result = schema.safeParse(req[location] ?? undefined, { reportInput: true });
  if (result.success) return result.data;
  const detail = result.error.issues.map((issue) => {
    const missing = issue.code === "invalid_type" && issue.input === undefined;
    return {
      type: missing ? "missing" : issue.code,
      loc: [location, ...issue.path.map(String)],
      msg: missing ? "Field required" : issue.message,
    };
  });
  throw new HttpError(422, detail);
}

export const parseBody = <T extends z.ZodType>(schema: T, req: Request) => parse(schema, req, "body");
export const parseQuery = <T extends z.ZodType>(schema: T, req: Request) => parse(schema, req, "query");
