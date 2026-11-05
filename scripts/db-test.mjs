// Isolation test against a local Postgres: proves the RLS policies and guards
// before anything touches a Supabase project. Run: npm run db:test
// Requires DATABASE_URL (superuser) — defaults to a local cluster.
import pg from "pg";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const url = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/enablement_test";
const client = new pg.Client({ connectionString: url });
await client.connect();

const sql = (q, p) => client.query(q, p);
let failures = 0;
const ok = (name) => console.log("  ok  ", name);
const fail = (name, e) => { failures++; console.log("  FAIL", name, e?.message ?? e); };
async function expectOk(name, fn) { try { await fn(); ok(name); } catch (e) { fail(name, e); } }
async function expectErr(name, fn, re) {
  try { await fn(); fail(name, "expected an error"); }
  catch (e) { if (!re || re.test(e.message)) ok(name); else fail(name, e); }
}

// --- fresh schema ---
await sql("drop schema if exists public cascade; create schema public; drop schema if exists auth cascade; create schema auth;");
// Stand-in for Supabase's auth.uid(): reads the JWT sub claim from a session setting, as Supabase does.
await sql(`create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;`);
await sql(`do $$ begin if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; end $$;`);
await sql(readFileSync(new URL("../supabase/migrations/0001_schema.sql", import.meta.url), "utf8"));
await sql(readFileSync(new URL("../supabase/migrations/0002_rls.sql", import.meta.url), "utf8"));
await sql("grant usage on schema public to authenticated; grant all on all tables in schema public to authenticated; grant all on all sequences in schema public to authenticated; grant execute on all functions in schema public to authenticated;");

// --- seed users (as the service role would) ---
const U = { ownerA: randomUUID(), editorA: randomUUID(), viewerA: randomUUID(), ownerB: randomUUID(), outsider: randomUUID() };
for (const [k, id] of Object.entries(U)) await sql("insert into users (id,email) values ($1,$2)", [id, `${k}@test.local`]);

// Run a block as a signed-in user under RLS.
async function as(userId, fn) {
  await sql("begin");
  await sql("set local role authenticated");
  await sql(`select set_config('request.jwt.claim.sub', $1, true)`, [userId]);
  try { const r = await fn(); await sql("commit"); return r; }
  catch (e) { await sql("rollback"); throw e; }
}

console.log("Company creation and membership");
const A = (await as(U.ownerA, () => sql("select create_company_with_owner('Company A') id"))).rows[0].id;
const B = (await as(U.ownerB, () => sql("select create_company_with_owner('Company B') id"))).rows[0].id;
await as(U.ownerA, () => sql("insert into memberships (user_id,company_id,role,accepted_at) values ($1,$2,'editor',now()),($3,$2,'viewer',now())", [U.editorA, A, U.viewerA]));
await expectErr("outsider cannot create company without sign-in", () => sql("select create_company_with_owner('X')"), /not signed in/);

console.log("Read isolation");
await expectOk("owner A sees only company A", async () => {
  const r = await as(U.ownerA, () => sql("select id from companies"));
  if (r.rows.length !== 1 || r.rows[0].id !== A) throw new Error(JSON.stringify(r.rows));
});
await expectOk("owner B cannot see company A", async () => {
  const r = await as(U.ownerB, () => sql("select id from companies where id=$1", [A]));
  if (r.rows.length !== 0) throw new Error("leak");
});
await expectOk("outsider sees nothing", async () => {
  const r = await as(U.outsider, () => sql("select count(*)::int n from companies"));
  if (r.rows[0].n !== 0) throw new Error("leak");
});

console.log("Write isolation and roles");
await expectOk("editor A can insert a priority in A", () =>
  as(U.editorA, () => sql("insert into priorities (company_id,plan_year,title,objective,rank) values ($1,2027,'Grow sales','By year end sales run without the owner',1)", [A])));
await expectOk("viewer A cannot insert in A (0 rows / policy error)", async () => {
  let threw = false;
  try { await as(U.viewerA, () => sql("insert into priorities (company_id,plan_year,title,objective,rank) values ($1,2027,'Viewer try','Should not be allowed to write',2)", [A])); }
  catch { threw = true; }
  if (!threw) throw new Error("viewer wrote a row");
});
await expectErr("owner B cannot insert into company A", () =>
  as(U.ownerB, () => sql("insert into priorities (company_id,plan_year,title,objective,rank) values ($1,2027,'Cross-tenant','Owner B writing into A must fail',1)", [A])), /policy/);
await expectOk("owner B reads zero priorities of A", async () => {
  const r = await as(U.ownerB, () => sql("select count(*)::int n from priorities where company_id=$1", [A]));
  if (r.rows[0].n !== 0) throw new Error("leak");
});
await expectOk("update by B of A's row affects 0 rows", async () => {
  const r = await as(U.ownerB, () => sql("update priorities set title='Hacked title' where company_id=$1", [A]));
  if (r.rowCount !== 0) throw new Error("cross-tenant update");
});

console.log("Subscription gate");
await sql("update subscriptions set status='read_only' where company_id=$1", [A]);
await expectErr("editor A cannot write when subscription is read_only", () =>
  as(U.editorA, () => sql("insert into priorities (company_id,plan_year,title,objective,rank) values ($1,2027,'Lapsed write','Writes must be refused when lapsed',3)", [A])), /policy/);
await expectOk("editor A can still read when read_only", async () => {
  const r = await as(U.editorA, () => sql("select count(*)::int n from priorities where company_id=$1", [A]));
  if (r.rows[0].n !== 1) throw new Error("read blocked");
});
await sql("update subscriptions set status='active' where company_id=$1", [A]);

console.log("Seat limit");
await expectErr("4th non-viewer seat on a 3-seat BUILD is refused", async () => {
  const u3 = randomUUID(), u4 = randomUUID();
  await sql("insert into users (id,email) values ($1,$2),($3,$4)", [u3, "u3@test.local", u4, "u4@test.local"]);
  await as(U.ownerA, () => sql("insert into memberships (user_id,company_id,role,accepted_at) values ($1,$2,'editor',now())", [u3, A]));
  await as(U.ownerA, () => sql("insert into memberships (user_id,company_id,role,accepted_at) values ($1,$2,'editor',now())", [u4, A]));
}, /seat limit/);

console.log("Template publication guard");
const body = { rules: [{ op: "avg", over: "x", as: "y" }] };
await expectErr("requires_confirmation cannot be published", () =>
  sql("insert into templates (tool_key,version,kind,category,title,body,permission_status,publication_status) values ('okr',1,'tool','strategy','Priorities and Targets',$1,'requires_confirmation','published')", [body]), /publication_guard/);
await expectErr("licensed_confirmed without licence_reference cannot be published", () =>
  sql("insert into templates (tool_key,version,kind,category,title,body,permission_status,publication_status) values ('okr',1,'tool','strategy','Priorities and Targets',$1,'licensed_confirmed','published')", [body]), /publication_guard/);
await expectOk("original can be published", () =>
  sql("insert into templates (tool_key,version,kind,category,title,body,permission_status,publication_status) values ('health_check',1,'health_check','core','Business Health Check',$1,'original','published')", [body]));
await expectErr("rule with a non-allowed op is rejected", () =>
  sql("insert into templates (tool_key,version,kind,category,title,body,permission_status,publication_status) values ('bad',1,'tool','core','Bad',$1,'original','draft')", [{ rules: [{ op: "eval", expr: "1+1" }] }]), /rules_allowed/);
await expectOk("draft requires_confirmation template is allowed and invisible to customers", async () => {
  await sql("insert into templates (tool_key,version,kind,category,title,body,permission_status,publication_status) values ('okr',1,'tool','strategy','Priorities and Targets',$1,'requires_confirmation','review')", [body]);
  const r = await as(U.ownerA, () => sql("select tool_key from templates"));
  if (r.rows.length !== 1 || r.rows[0].tool_key !== "health_check") throw new Error(JSON.stringify(r.rows));
});

await client.end();
console.log(failures ? `\n${failures} FAILED` : "\nAll isolation checks passed");
process.exit(failures ? 1 : 0);
