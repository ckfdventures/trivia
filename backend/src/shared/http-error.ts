/** An error that maps directly to an HTTP response of the form `{ detail }`. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: unknown,
  ) {
    super(typeof detail === "string" ? detail : `HTTP ${status}`);
    this.name = "HttpError";
  }
}

export const badRequest = (detail: string) => new HttpError(400, detail);
export const unauthorized = (detail: string) => new HttpError(401, detail);
export const forbidden = (detail: string) => new HttpError(403, detail);
export const notFound = (detail: string) => new HttpError(404, detail);
export const conflict = (detail: string) => new HttpError(409, detail);
