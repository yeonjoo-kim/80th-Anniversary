/* SQL/RLS tests in an isolated PostgreSQL WASM instance.
   Optional dependency: @electric-sql/pglite@0.3.14. Never connects to Supabase. */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { PGlite } = require("@electric-sql/pglite");
const OWNER = "12345678-1234-4234-8234-123456789012";
const OTHER = "87654321-4321-4321-8321-210987654321";
const ID = "00000000-0000-4000-8000-000000000001";
const DRAFT = "00000000-0000-4000-8000-000000000002";
let db;
async function role(name, uid, sql, params = []) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [
    uid || "",
  ]);
  await db.exec("set role " + name);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec("reset role");
  }
}
before(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema storage;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    grant usage on schema auth, storage, public to anon, authenticated;
    create table storage.buckets(id text primary key, name text, public boolean,
      file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id bigint generated always as identity, bucket_id text, name text);
    alter table storage.objects enable row level security;
    grant select,insert,update on storage.objects to anon,authenticated;
    grant usage on all sequences in schema storage to anon,authenticated;
    create function storage.foldername(name text) returns text[] language sql immutable as $$
      select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1];
    $$;
  `);
  const setup = fs.readFileSync(
    path.join(__dirname, "../supabase/setup.sql"),
    "utf8",
  );
  await db.exec(setup);
  await db.exec(setup);
  for (const [id, ready] of [
    [ID, true],
    [DRAFT, false],
  ]) {
    await db.query(
      `insert into public.creations(id,owner_id,captured_at,ready,photo_path,arrows_path,poster_path)
      values ($1,$2,now(),$3,$4,$5,$6)`,
      [
        id,
        OWNER,
        ready,
        ...["photo.jpg", "arrows.png", "poster.png"].map(
          (f) => `${OWNER}/${id}/${f}`,
        ),
      ],
    );
  }
});
after(async () => {
  if (db) await db.close();
});
test("setup is repeatable and creates the bounded public image bucket", async () => {
  const { rows } = await db.query(
    "select * from storage.buckets where id='trajectory-images'",
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].public, true);
  assert.equal(rows[0].file_size_limit, 15728640);
  assert.deepEqual(rows[0].allowed_mime_types, ["image/jpeg", "image/png"]);
});
test("guest cannot list the table, exact-ID RPC exposes only completed records", async () => {
  await assert.rejects(() =>
    role("anon", null, "select * from public.creations"),
  );
  const { rows } = await role(
    "anon",
    null,
    "select * from public.get_creation($1)",
    [ID],
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, ID);
  assert(!("owner_id" in rows[0]));
  assert.equal(
    (await role("anon", null, "select * from public.get_creation($1)", [DRAFT]))
      .rows.length,
    0,
  );
});
test("owners see their rows, another authenticated visitor sees none", async () => {
  assert.equal(
    (await role("authenticated", OWNER, "select * from public.creations")).rows
      .length,
    2,
  );
  assert.equal(
    (await role("authenticated", OTHER, "select * from public.creations")).rows
      .length,
    0,
  );
  assert.equal(
    (
      await role(
        "authenticated",
        OTHER,
        "update public.creations set ready=false where id=$1 returning id",
        [ID],
      )
    ).rows.length,
    0,
  );
});
test("authenticated visitors cannot forge another owner or change image paths", async () => {
  const id = "00000000-0000-4000-8000-000000000003";
  await assert.rejects(() =>
    role(
      "authenticated",
      OTHER,
      `insert into public.creations(id,owner_id,captured_at,photo_path,arrows_path,poster_path)
    values($1,$2,now(),$3,$4,$5)`,
      [
        id,
        OWNER,
        ...["photo.jpg", "arrows.png", "poster.png"].map(
          (f) => `${OWNER}/${id}/${f}`,
        ),
      ],
    ),
  );
  await assert.rejects(() =>
    role(
      "authenticated",
      OWNER,
      "update public.creations set photo_path=$1 where id=$2",
      [`${OTHER}/${ID}/photo.jpg`, ID],
    ),
  );
});
test("storage inserts and retries stay in the owner folder and use approved filenames", async () => {
  const own = `${OWNER}/${ID}/photo.jpg`;
  await role(
    "authenticated",
    OWNER,
    "insert into storage.objects(bucket_id,name) values($1,$2)",
    ["trajectory-images", own],
  );
  assert.equal(
    (await role("authenticated", OWNER, "select * from storage.objects")).rows
      .length,
    1,
  );
  assert.equal(
    (await role("authenticated", OTHER, "select * from storage.objects")).rows
      .length,
    0,
  );
  assert.equal(
    (await role("anon", null, "select * from storage.objects")).rows.length,
    0,
  );
  await assert.rejects(() =>
    role(
      "authenticated",
      OTHER,
      "insert into storage.objects(bucket_id,name) values($1,$2)",
      ["trajectory-images", own],
    ),
  );
  await assert.rejects(() =>
    role(
      "authenticated",
      OWNER,
      "insert into storage.objects(bucket_id,name) values($1,$2)",
      ["trajectory-images", `${OWNER}/${ID}/unexpected.svg`],
    ),
  );
  await assert.rejects(() =>
    role(
      "authenticated",
      OWNER,
      "update storage.objects set name=$1 where name=$2",
      [`${OTHER}/${ID}/photo.jpg`, own],
    ),
  );
});
