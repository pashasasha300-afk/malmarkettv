import test from "node:test";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("migrations execute; anonymous public reads; two-user isolation; admin spoof rejected", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(
      `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.uid',true),'')::uuid$$;create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt',true),''),'{}')::jsonb$$;grant usage on schema auth to anon,authenticated;grant execute on all functions in schema auth to anon,authenticated;`,
    );
    for (const file of [
      "202610150001_initial.sql",
      "202610150002_directory.sql",
      "202610150003_stream_url_hash.sql",
    ])
      await pg.exec(
        (
          await readFile(
            new URL("../supabase/migrations/" + file, import.meta.url),
            "utf8",
          )
        ).replace(/^\uFEFF/, ""),
      );
    await pg.exec(
      `insert into auth.users values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');insert into countries values('US','United States',38,-97),('ZZ','No source',0,0);insert into channels(id,name,country,hidden) values('a','Alpha','US',false),('hidden','Hidden','US',true);insert into streams(id,channel_id,url,source) values('s','a','https://example.com/a.m3u8','test'),('h','hidden','https://example.com/h.m3u8','test');set role anon;`,
    );
    await pg.exec("reset role");
    const longURL =
      "https://example.com/live.m3u8?token=" +
      Array.from({ length: 120 }, (_, i) =>
        createHash("sha256").update(String(i)).digest("hex"),
      ).join("");
    await pg.query(
      "insert into streams(id,channel_id,url,source) values('long','a',$1,'test')",
      [longURL],
    );
    await assert.rejects(
      pg.query(
        "insert into streams(id,channel_id,url,source) values('duplicate','a',$1,'test')",
        [longURL],
      ),
    );
    await pg.exec("delete from streams where id='long';set role anon;");
    assert.equal((await pg.query("select * from channels")).rows.length, 1);
    assert.equal((await pg.query("select * from streams")).rows.length, 1);
    const counts = (await pg.query("select * from country_counts()")).rows;
    assert.equal(Number(counts.find((x) => x.code === "ZZ").count), 0);
    assert.equal(
      (await pg.query("select search_channels() data")).rows[0].data[0].id,
      "a",
    );
    await assert.rejects(
      pg.exec(
        `insert into favorites values('00000000-0000-0000-0000-000000000001','a')`,
      ),
    );
    await pg.exec(
      `reset role;set role authenticated;set request.uid='00000000-0000-0000-0000-000000000001';insert into favorites values('00000000-0000-0000-0000-000000000001','a');insert into watch_history(user_id,channel_id) values('00000000-0000-0000-0000-000000000001','a');`,
    );
    assert.equal((await pg.query("select * from favorites")).rows.length, 1);
    await pg.exec(`set request.uid='00000000-0000-0000-0000-000000000002';`);
    assert.equal((await pg.query("select * from favorites")).rows.length, 0);
    assert.equal(
      (await pg.query("select * from watch_history")).rows.length,
      0,
    );
    await assert.rejects(
      pg.exec(
        `insert into favorites values('00000000-0000-0000-0000-000000000001','a')`,
      ),
    );
    await pg.exec(
      `set request.jwt='{"user_metadata":{"role":"admin"}}';update channels set hidden=true where id='a';`,
    );
    assert.equal(
      (await pg.query(`select * from channels where id='a'`)).rows.length,
      1,
    );
    await pg.exec(
      `set request.jwt='{"app_metadata":{"role":"admin"}}';update channels set hidden=true where id='a';`,
    );
    assert.equal(
      (await pg.query(`select hidden from channels where id='a'`)).rows[0]
        .hidden,
      true,
    );
  } finally {
    await pg.close();
  }
});
