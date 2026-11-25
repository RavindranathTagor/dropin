import fs from "fs";
import path from "path";
import { Pool, type PoolClient } from "pg";

type Row = Record<string, unknown>;

export type DbClient = {
  query<T extends Row = Row>(text: string, params?: unknown[]): Promise<T[]>;
};

type PgliteTx = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Row[] }>;
};

type PgliteDb = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Row[] }>;
  exec: (text: string) => Promise<unknown>;
  transaction: <T>(fn: (tx: PgliteTx) => Promise<T>) => Promise<T>;
  waitReady: Promise<void>;
  close?: () => Promise<void>;
};

let pool: Pool | null = null;
let pglite: PgliteDb | null = null;
let queue: Promise<unknown> = Promise.resolve();
let started: Promise<void> | null = null;

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function ready() {
  if (!started) {
    started = init().catch((error) => {
      started = null;
      throw error;
    });
  }
  return started;
}

function migrationFiles() {
  const dir = path.join(process.cwd(), "supabase/migrations");
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => fs.readFileSync(path.join(dir, name), "utf8"));
}

async function init() {
  const migrations = migrationFiles();
  const seed = fs.readFileSync(path.join(process.cwd(), "supabase/seed.sql"), "utf8");
  if (process.env.DATABASE_URL) {
    const local = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL);
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: local ? undefined : { rejectUnauthorized: false },
      max: 10,
    });
    for (const sql of migrations) await pool.query(sql);
    await pool.query(seed);
    return;
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const dir = path.join(process.cwd(), ".data", "ghardrop");
  fs.mkdirSync(dir, { recursive: true });
  const db = new PGlite(dir);
  await db.waitReady;
  for (const sql of migrations) await db.exec(sql);
  await db.exec(seed);
  pglite = db;
}

async function rawQuery<T extends Row>(text: string, params: unknown[] = []) {
  if (pool) {
    const result = await pool.query<T>(text, params);
    return result.rows;
  }
  if (!pglite) throw new Error("database_not_ready");
  const result = await pglite.query(text, params);
  return result.rows as T[];
}

function schedule<T>(task: () => Promise<T>) {
  if (pool) return task();
  return enqueue(task);
}

export async function query<T extends Row = Row>(text: string, params: unknown[] = []) {
  await ready();
  return schedule(() => rawQuery<T>(text, params));
}

export async function transaction<T>(fn: (client: DbClient) => Promise<T>) {
  await ready();
  return schedule(async () => {
    if (pool) {
      const client: PoolClient = await pool.connect();
      try {
        await client.query("BEGIN");
        const tx = {
          query: async (text: string, params: unknown[] = []) => {
            const result = await client.query(text, params);
            return result.rows as Row[];
          },
        } as DbClient;
        const value = await fn(tx);
        await client.query("COMMIT");
        return value;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }

    if (!pglite) throw new Error("database_not_ready");
    return pglite.transaction(async (tx) => {
      const client = {
        query: async (text: string, params: unknown[] = []) => {
          const result = await tx.query(text, params);
          return result.rows as Row[];
        },
      } as DbClient;
      return fn(client);
    });
  });
}

export function jsonValue<T>(value: unknown): T {
  if (typeof value === "string") return JSON.parse(value) as T;
  return value as T;
}
