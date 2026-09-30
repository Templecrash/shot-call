import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { parseContactHandles } from "../lib/people";
import {
  listPeople,
  matchContacts,
  peopleState,
  setPeopleFollowing,
} from "../lib/people-store";

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  for (const name of readdirSync(new URL("../drizzle/", import.meta.url))
    .filter((n) => n.endsWith(".sql"))
    .sort())
    sqlite.exec(
      readFileSync(new URL(`../drizzle/${name}`, import.meta.url), "utf8"),
    );
  function add(id: string, user: string, handle: string, name = handle) {
    sqlite
      .prepare(
        "INSERT INTO creator_profiles (id,user_id,name,twitter_handle,bio,updated_at) VALUES (?,?,?,?,?,?)",
      )
      .run(id, user, name, handle, "", 1);
  }
  add("self-profile", "self", "myself");
  add("alice-profile", "alice", "Alice_X", "Alice");
  add("bob-profile", "bob", "bob", "Bob");
  let fail = false;
  class Statement {
    values: (string | number | null)[] = [];
    constructor(public sql: string) {}
    bind(...values: (string | number | null)[]) {
      this.values = values;
      return this;
    }
    async first() {
      return sqlite.prepare(this.sql).get(...this.values) || null;
    }
    async all() {
      return {
        results: sqlite.prepare(this.sql).all(...this.values),
        success: true,
      };
    }
  }
  const db = {
    prepare: (sql: string) => new Statement(sql),
    async batch(statements: Statement[]) {
      sqlite.exec("BEGIN");
      try {
        const results = statements.map((s, i) => {
          if (fail && i === 1) throw new Error("injected failure");
          return {
            meta: sqlite.prepare(s.sql).run(...s.values),
            success: true,
          };
        });
        sqlite.exec("COMMIT");
        return results;
      } catch (e) {
        sqlite.exec("ROLLBACK");
        throw e;
      }
    },
  } as unknown as D1Database;
  return {
    db,
    sqlite,
    add,
    fail: () => {
      fail = true;
    },
  };
}

test("contact handles deduplicate case-insensitively and reject posts, emails and lookalike URLs", () => {
  assert.deepEqual(
    parseContactHandles(
      "@Alice_X, https://x.com/alice_x\nhttps://twitter.com/bob",
    ),
    { handles: ["Alice_X", "bob"], invalid: [], tooMany: false },
  );
  assert.equal(
    parseContactHandles(
      "https://x.com/alice/status/123 https://x.com.evil.test/alice friend@example.com @home",
    ).invalid.length,
    4,
  );
  assert.equal(
    parseContactHandles(
      Array.from({ length: 101 }, (_, i) => `@person${i}`).join("\n"),
    ).tooMany,
    true,
  );
});
test("following is idempotent, durable and scoped to the signed-in follower", async () => {
  const f = fixture();
  assert.deepEqual((await peopleState(f.db)).followingIds, []);
  let result = await setPeopleFollowing(
    f.db,
    "self",
    ["alice-profile", "alice-profile", "editorial"],
    true,
  );
  assert.equal(result.selfId, "self-profile");
  assert.deepEqual(
    new Set(result.followingIds),
    new Set(["alice-profile", "editorial"]),
  );
  await setPeopleFollowing(f.db, "self", ["alice-profile"], true);
  assert.equal(
    f.sqlite.prepare("SELECT COUNT(*) AS n FROM people_follows").get()?.n,
    2,
  );
  assert.deepEqual((await peopleState(f.db, "bob")).followingIds, []);
  await setPeopleFollowing(f.db, "bob", ["alice-profile"], false);
  assert.equal((await peopleState(f.db, "self")).followingIds.length, 2);
  await setPeopleFollowing(f.db, "self", ["alice-profile"], false);
  assert.deepEqual((await peopleState(f.db, "self")).followingIds, [
    "editorial",
  ]);
  f.sqlite.close();
});
test("self-follow, unavailable people and invalid batches do not change following", async () => {
  const f = fixture();
  await assert.rejects(
    setPeopleFollowing(f.db, "self", ["self-profile"], true),
    /own profile/,
  );
  await assert.rejects(
    setPeopleFollowing(f.db, "self", ["alice-profile", "missing"], true),
    /no longer available/,
  );
  await assert.rejects(
    setPeopleFollowing(f.db, "self", [], true),
    /between 1 and 100/,
  );
  f.fail();
  await assert.rejects(
    setPeopleFollowing(f.db, "self", ["alice-profile", "bob-profile"], true),
    /injected/,
  );
  assert.deepEqual((await peopleState(f.db, "self")).followingIds, []);
  f.sqlite.close();
});
test("contacts are matched without following anyone, with ambiguous and unmatched handles preserved", async () => {
  const f = fixture();
  f.add("other-alice", "other", "alice_x", "Different Alice");
  const matches = await matchContacts(f.db, "self", [
    "ALICE_X",
    "bob",
    "missing",
    "myself",
  ]);
  assert.deepEqual(
    matches.map((m) => m.people.length),
    [2, 1, 0, 0],
  );
  assert.equal(
    matches[0].people[0].creator.twitterUrl,
    "https://x.com/Alice_X",
  );
  assert.deepEqual((await peopleState(f.db, "self")).followingIds, []);
  assert.equal(
    f.sqlite.prepare("SELECT COUNT(*) AS n FROM people_follows").get()?.n,
    0,
  );
  f.sqlite.close();
});
test("directory search treats wildcard characters literally and pages without skipping editorial or profiles", async () => {
  const f = fixture();
  for (let i = 0; i < 85; i++)
    f.add(`profile-${i}`, `user-${i}`, `handle_${i}`, `Person ${i}`);
  const first = await listPeople(f.db, "self", "", false, 0);
  assert.equal(first.people.length, 40);
  assert.equal(first.total, 88);
  assert.equal(first.nextOffset, 40);
  const second = await listPeople(f.db, "self", "", false, first.nextOffset!);
  const third = await listPeople(f.db, "self", "", false, second.nextOffset!);
  assert.equal(
    new Set(
      [...first.people, ...second.people, ...third.people].map(
        (p) => p.creator.id,
      ),
    ).size,
    88,
  );
  assert.equal(third.nextOffset, null);
  assert.equal((await listPeople(f.db, "self", "%", false, 0)).total, 0);
  assert.equal((await listPeople(f.db, "self", "Alice_X", false, 0)).total, 1);
  await setPeopleFollowing(f.db, "self", ["bob-profile", "editorial"], true);
  const following = await listPeople(f.db, "self", "", true, 0);
  assert.equal(following.total, 2);
  assert.equal(
    following.people.find((p) => p.creator.id === "bob-profile")?.followerCount,
    1,
  );
  f.sqlite.close();
});
test("handle changes preserve social follows and financial records are untouched", async () => {
  const f = fixture();
  f.sqlite
    .prepare("INSERT INTO accounts (user_id,balance) VALUES ('self',123456)")
    .run();
  f.sqlite
    .prepare(
      "INSERT INTO thesis_follows (user_id,thesis_id,creator_id,active,accepted_at) VALUES ('self','take','alice',1,1)",
    )
    .run();
  await setPeopleFollowing(f.db, "self", ["alice-profile"], true);
  f.sqlite
    .prepare(
      "UPDATE creator_profiles SET twitter_handle='newalice' WHERE id='alice-profile'",
    )
    .run();
  assert.deepEqual((await peopleState(f.db, "self")).followingIds, [
    "alice-profile",
  ]);
  assert.equal(
    (await matchContacts(f.db, "self", ["newalice"]))[0].people.length,
    1,
  );
  await setPeopleFollowing(f.db, "self", ["alice-profile"], false);
  assert.equal(
    f.sqlite.prepare("SELECT balance FROM accounts WHERE user_id='self'").get()
      ?.balance,
    123456,
  );
  assert.equal(
    f.sqlite
      .prepare("SELECT active FROM thesis_follows WHERE user_id='self'")
      .get()?.active,
    1,
  );
  assert.equal(
    f.sqlite.prepare("SELECT COUNT(*) AS n FROM orders").get()?.n,
    0,
  );
  assert.equal(
    f.sqlite.prepare("SELECT COUNT(*) AS n FROM creator_earnings").get()?.n,
    0,
  );
  f.sqlite.close();
});
