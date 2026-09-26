import { MongoClient, type Db } from "mongodb";

export interface MongoConnection {
  client: MongoClient;
  db: Db;
}

export async function connectMongo(url: string, dbName: string): Promise<MongoConnection> {
  const client = new MongoClient(url);
  await client.connect();
  return { client, db: client.db(dbName) };
}
