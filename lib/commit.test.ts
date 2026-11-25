import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const passenger = "11111111-1111-4111-8111-111111111111";
const passenger2 = "22222222-2222-4222-8222-222222222222";
const admin = "55555555-5555-4555-8555-555555555555";
const drillRoom = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
const drillBid = "dddddddd-dddd-4ddd-8ddd-ddddddddddd3";

describe("commit_booking", () => {
  it("holds seats once, repeats safely, and refuses a seat past capacity", async () => {
    const db = new PGlite();
    await db.waitReady;
    const schema = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/0001_init.sql"), "utf8");
    const seed = fs.readFileSync(path.join(process.cwd(), "supabase/seed.sql"), "utf8");
    await db.exec(schema);
    await db.exec(seed);
    for (const id of [passenger, passenger2, admin]) {
      await db.query(
        `insert into drop_members (room_id, passenger_id, seats, commitment_status) values ($1, $2, 1, 'interested')`,
        [drillRoom, id],
      );
    }

    const first = await call(db, passenger, "key-1");
    const repeat = await call(db, passenger, "key-1");
    const second = await call(db, passenger2, "key-2");
    const third = await call(db, admin, "key-3");

    expect(first.ok).toBe(true);
    expect(first.idempotent).toBe(false);
    expect(repeat.ok).toBe(true);
    expect(repeat.idempotent).toBe(true);
    expect(second.ok).toBe(true);
    expect(third.ok).toBe(false);
    expect(third.error).toBe("capacity_exceeded");
    await db.close();
  }, 60000);
});

async function call(db: PGlite, userId: string, key: string) {
  const result = await db.query<{ result: { ok: boolean; idempotent?: boolean; error?: string } | string }>(
    `select commit_booking($1, $2, $3, $4, 1, 0.75) as result`,
    [drillRoom, drillBid, userId, key],
  );
  const value = result.rows[0].result;
  return typeof value === "string" ? (JSON.parse(value) as { ok: boolean; idempotent?: boolean; error?: string }) : value;
}
