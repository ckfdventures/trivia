import type { ErrorRequestHandler, RequestHandler } from "express";
import multer from "multer";
import { MAX_UPLOAD_BYTES } from "../../domain/constants.js";
import { HttpError } from "../../shared/http-error.js";
import type { Logger } from "../../shared/logger.js";

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ detail: "Not Found" });
};

export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (err, req, res, _next) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ detail: err.detail });
      return;
    }
    if (err?.type === "entity.parse.failed") {
      res.status(422).json({ detail: [{ type: "json_invalid", loc: ["body"], msg: "JSON decode error" }] });
      return;
    }
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ detail: `File too large (max ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB)` });
      return;
    }
    if (err instanceof multer.MulterError) {
      res.status(422).json({ detail: [{ type: err.code, loc: ["body", err.field ?? "file"], msg: err.message }] });
      return;
    }
    logger.error(`unhandled error on ${req.method} ${req.originalUrl}`, err);
    res.status(500).json({ detail: "Internal Server Error" });
  };
}
