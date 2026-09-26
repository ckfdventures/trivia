import type { Collection, Db } from "mongodb";
import type { User, UserWithPassword } from "../domain/models.js";

export interface UserRepository {
  insert(user: UserWithPassword): Promise<void>;
  findByEmailWithPassword(email: string): Promise<UserWithPassword | null>;
  findById(id: string): Promise<User | null>;
  updatePasswordHash(email: string, passwordHash: string): Promise<void>;
  ensureIndexes(): Promise<void>;
}

export class MongoUserRepository implements UserRepository {
  private readonly collection: Collection<UserWithPassword>;

  constructor(db: Db) {
    this.collection = db.collection<UserWithPassword>("users");
  }

  async insert(user: UserWithPassword): Promise<void> {
    await this.collection.insertOne({ ...user });
  }

  findByEmailWithPassword(email: string): Promise<UserWithPassword | null> {
    return this.collection.findOne({ email }, { projection: { _id: 0 } });
  }

  findById(id: string): Promise<User | null> {
    return this.collection.findOne({ id }, { projection: { _id: 0, password_hash: 0 } });
  }

  async updatePasswordHash(email: string, passwordHash: string): Promise<void> {
    await this.collection.updateOne({ email }, { $set: { password_hash: passwordHash } });
  }

  async ensureIndexes(): Promise<void> {
    // Same index name pymongo's create_index("email", unique=True) produced, so this is a no-op on existing DBs.
    await this.collection.createIndex({ email: 1 }, { unique: true, name: "email_1" });
  }
}
