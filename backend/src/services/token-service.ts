import jwt from "jsonwebtoken";
import { unauthorized } from "../shared/http-error.js";

export interface AccessTokenClaims {
  sub: string;
  email: string;
}

export interface TokenService {
  issue(claims: AccessTokenClaims): string;
  /** Returns the claims, or throws a 401 HttpError. */
  verify(token: string): AccessTokenClaims;
}

const ALGORITHM = "HS256";

export class JwtTokenService implements TokenService {
  constructor(
    private readonly secret: string,
    private readonly expiresHours: number,
  ) {}

  issue({ sub, email }: AccessTokenClaims): string {
    const exp = Math.floor(Date.now() / 1000 + this.expiresHours * 3600);
    return jwt.sign({ sub, email, exp, type: "access" }, this.secret, { algorithm: ALGORITHM, noTimestamp: true });
  }

  verify(token: string): AccessTokenClaims {
    let payload: jwt.JwtPayload | string;
    try {
      payload = jwt.verify(token, this.secret, { algorithms: [ALGORITHM] });
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) throw unauthorized("Token expired");
      throw unauthorized("Invalid token");
    }
    if (typeof payload === "string" || typeof payload.sub !== "string") throw unauthorized("Invalid token");
    if (payload.type !== "access") throw unauthorized("Invalid token type");
    return { sub: payload.sub, email: String(payload.email ?? "") };
  }
}
