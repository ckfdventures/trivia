import type { User } from "../domain/models.js";
import type { UserRepository } from "../repositories/user.repository.js";
import { forbidden, unauthorized } from "../shared/http-error.js";
import { newId } from "../shared/ids.js";
import { nowIso } from "../shared/time.js";
import type { PasswordHasher } from "./password-hasher.js";
import type { TokenService } from "./token-service.js";

export interface AuthResult {
  token: string;
  user: Pick<User, "id" | "email" | "name" | "role">;
}

export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
  ) {}

  async login(input: { email: string; password: string }): Promise<AuthResult> {
    const email = input.email.toLowerCase().trim();
    const user = await this.users.findByEmailWithPassword(email);
    if (!user || !(await this.hasher.verify(input.password, user.password_hash))) {
      throw unauthorized("Invalid email or password");
    }
    if (user.role !== "admin") throw forbidden("Admin access required");
    return {
      token: this.tokens.issue({ sub: user.id, email }),
      user: { id: user.id, email: user.email, name: user.name ?? "", role: user.role ?? "host" },
    };
  }

  /** Resolve a bearer token to its user, or throw 401. */
  async authenticate(token: string): Promise<User> {
    const claims = this.tokens.verify(token);
    const user = await this.users.findById(claims.sub);
    if (!user) throw unauthorized("User not found");
    return user;
  }

  /**
   * Ensure the configured admin account exists. The password in the environment is the source of truth:
   * if it changed, the stored hash is updated on startup.
   */
  async seedAdmin(email: string, password: string): Promise<void> {
    const existing = await this.users.findByEmailWithPassword(email);
    if (!existing) {
      await this.users.insert({
        id: newId(),
        email,
        name: "Admin",
        password_hash: await this.hasher.hash(password),
        role: "admin",
        created_at: nowIso(),
      });
    } else if (!(await this.hasher.verify(password, existing.password_hash))) {
      await this.users.updatePasswordHash(email, await this.hasher.hash(password));
    }
    await this.users.ensureIndexes();
  }
}
