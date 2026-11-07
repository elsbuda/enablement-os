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
await sql(`create or replace function auth.email() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claim.email', true), '') $$;`);
await sql(`do $$ begin if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; end $$;`);
await sql(readFileSync(new URL("../supabase/migrations/0001_schema.sql", import.meta.url), "utf8"));
await sql(readFileSync(new URL("../supabase/migrations/0002_rls.sql", import.meta.url), "utf8"));
await sql(readFileSync(new URL("../supabase/migrations/0003_invitations.sql", import.meta.url), "utf8"));
await sql("grant usage on schema public to authenticated; grant all on all tables in schema public to authenticated; grant all on all sequences in schema public to authenticated; grant execute on all functions in schema public to authenticated;");

// --- seed users (as the service role would) ---
const EMAILS = {};
const U = { ownerA: randomUUID(), editorA: randomUUID(), viewerA: randomUUID(), ownerB: randomUUID(), outsider: randomUUID() };
for (const [k, id] of Object.entries(U)) await sql("insert into users (id,email) values ($1,$2)", [id, `${k}@test.local`]);

// Run a block as a signed-in user under RLS.
async function as(userId, fn) {
  await sql("begin");
  await sql("set local role authenticated");
  await sql(`select set_config('request.jwt.claim.sub', $1, true)`, [userId]);
  const em = (await sql("select email from users where id=$1", [userId])).rows[0]?.email ?? EMAILS[userId] ?? "";
  await sql(`select set_config('request.jwt.claim.email', $1, true)`, [em]);
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

console.log("Stage 4 flow under RLS (plan -> period -> actions -> actuals -> close)");
await expectOk("owner A builds a plan with targets, starts a period, adds actions, enters actuals, closes the period", async () => {
  await sql("update subscriptions set status='active' where company_id=$1", [A]);
  const pid = (await as(U.ownerA, () => sql("insert into priorities (company_id,plan_year,title,objective,rank,source_area_key) values ($1,2027,'Grow sales without the owner','By year end the reps run the process',1,'sales') returning id", [A]))).rows[0].id;
  const kid = (await as(U.ownerA, () => sql("insert into kpis (company_id,name,unit,direction,target_value,perspective,owner_user_id) values ($1,'Proposals issued','count','higher_better',6,'customer',$2) returning id", [A, U.ownerA]))).rows[0].id;
  await as(U.ownerA, () => sql("insert into targets (company_id,priority_id,measure,kpi_id,target_value,unit,direction,owner_user_id,due_quarter) values ($1,$2,'Proposals issued',$3,72,'count','higher_better',$4,'Q4')", [A, pid, kid, U.ownerA]));
  const per = (await as(U.ownerA, () => sql("insert into periods (company_id,label,start_date,end_date,status) values ($1,'Q1 2027','2027-01-01','2027-04-01','active') returning id", [A]))).rows[0].id;
  const init = (await as(U.ownerA, () => sql("insert into initiatives (company_id,priority_id,title,owner_user_id) values ($1,$2,'Win back lapsed accounts',$3) returning id", [A, pid, U.ownerA]))).rows[0].id;
  await as(U.editorA, () => sql("insert into actions (company_id,initiative_id,period_id,title,owner_user_id,due_date,kpi_id) values ($1,$2,$3,'Call top 10 accounts',$4,'2027-02-03',$5)", [A, init, per, U.editorA, kid]));
  await as(U.editorA, () => sql("insert into kpi_actuals (kpi_id,company_id,period_month,actual_value,entered_by) values ($1,$2,'2027-01-01',4,$3) on conflict (kpi_id,period_month) do update set actual_value=excluded.actual_value", [kid, A, U.editorA]));
  const r = await as(U.ownerA, () => sql("select (select count(*) from targets where company_id=$1)::int t, (select count(*) from actions where company_id=$1)::int a, (select actual_value from kpi_actuals where kpi_id=$2 and period_month='2027-01-01') v", [A, kid]));
  if (r.rows[0].t !== 1 || r.rows[0].a !== 1 || Number(r.rows[0].v) !== 4) throw new Error(JSON.stringify(r.rows[0]));
  await as(U.ownerA, () => sql("update targets set result=0.7, status='done' where company_id=$1", [A]));
  await as(U.ownerA, () => sql("insert into reviews (company_id,period_id,held_on,achieved_text,created_by) values ($1,$2,'2027-04-01','Process defined',$3)", [A, per, U.ownerA]));
});
await expectErr("a second active period for the same company is refused", () =>
  as(U.ownerA, () => sql("insert into periods (company_id,label,start_date,end_date,status) values ($1,'Dup','2027-01-01','2027-04-01','active')", [A])), /periods_one_active/);
await expectOk("owner B sees none of A's plan, actions or actuals", async () => {
  const r = await as(U.ownerB, () => sql("select (select count(*) from priorities)::int p, (select count(*) from targets)::int t, (select count(*) from actions)::int a, (select count(*) from kpi_actuals)::int k, (select count(*) from periods)::int pe"));
  const z = r.rows[0]; if (z.p + z.t + z.a + z.k + z.pe !== 0) throw new Error(JSON.stringify(z));
});
await expectErr("viewer A cannot enter actuals", () =>
  as(U.viewerA, () => sql("insert into kpi_actuals (kpi_id,company_id,period_month,actual_value) select id,$1,'2027-02-01',1 from kpis where company_id=$1", [A])), /policy/);

console.log("Invitations");
const newbie = randomUUID(); EMAILS[newbie] = "newbie@test.local";
const stranger = randomUUID(); EMAILS[stranger] = "stranger@test.local";
await sql("update subscriptions set seats=10 where company_id=$1", [A]);
let token;
await expectOk("admin creates an editor invitation", async () => {
  const r = await as(U.ownerA, () => sql("insert into invitations (company_id,email,role,invited_by) values ($1,'Newbie@Test.local','editor',$2) returning token", [A, U.ownerA]));
  token = r.rows[0].token; if (!token || token.length < 40) throw new Error("no token");
});
await expectErr("editor cannot create invitations", () =>
  as(U.editorA, () => sql("insert into invitations (company_id,email,role,invited_by) values ($1,'x@test.local','viewer',$2)", [A, U.editorA])), /policy/);
await expectErr("an owner-role invitation is refused", () =>
  as(U.ownerA, () => sql("insert into invitations (company_id,email,role,invited_by) values ($1,'y@test.local','owner',$2)", [A, U.ownerA])), /check/);
await expectOk("preview works without membership", async () => {
  const r = await as(stranger, () => sql("select * from invitation_preview($1)", [token]));
  if (r.rows[0].company_name !== "Company A" || r.rows[0].role !== "editor") throw new Error(JSON.stringify(r.rows));
});
await expectErr("the wrong signed-in email cannot accept", () => as(stranger, () => sql("select accept_invitation($1)", [token])), /sent to/);
await expectOk("the invitee accepts and becomes an editor of A", async () => {
  const r = await as(newbie, () => sql("select accept_invitation($1) cid", [token]));
  if (r.rows[0].cid !== A) throw new Error("wrong company");
  const m = await as(newbie, () => sql("select role from memberships where user_id=$1", [newbie]));
  if (m.rows[0].role !== "editor") throw new Error(JSON.stringify(m.rows));
});
await expectErr("the same token cannot be used twice", () => as(newbie, () => sql("select accept_invitation($1)", [token])), /already/);
await expectOk("new editor can write in A and sees nothing of B", async () => {
  await as(newbie, () => sql("insert into priorities (company_id,plan_year,title,objective,rank) values ($1,2027,'Newbie priority','Written by the invited editor',4)", [A]));
  const r = await as(newbie, () => sql("select count(*)::int n from companies where id=$1", [B]));
  if (r.rows[0].n !== 0) throw new Error("leak");
});
await expectErr("admin cannot demote the owner", () => as(U.ownerA, () => sql("update memberships set role='viewer' where company_id=$1 and role='owner'", [A])), /owner role/);
await expectOk("editor's delete of the owner row affects 0 rows (policy)", async () => {
  const r = await as(U.editorA, () => sql("delete from memberships where company_id=$1 and role='owner'", [A]));
  if (r.rowCount !== 0) throw new Error("editor deleted a row");
});
await expectErr("owner row cannot be deleted even by an admin-level user", () => as(U.ownerA, () => sql("delete from memberships where company_id=$1 and role='owner'", [A])), /owner|yourself/);
await expectOk("admin changes the new editor to viewer and removes them", async () => {
  await as(U.ownerA, () => sql("update memberships set role='viewer' where user_id=$1", [newbie]));
  const r = await as(U.ownerA, () => sql("delete from memberships where user_id=$1", [newbie]));
  if (r.rowCount !== 1) throw new Error("not removed");
});
await expectErr("seat limit applies to accepted invitations", async () => {
  await sql("update subscriptions set seats=2 where company_id=$1", [A]); // owner + editor already = 2
  const t = (await as(U.ownerA, () => sql("insert into invitations (company_id,email,role,invited_by) values ($1,'stranger@test.local','editor',$2) returning token", [A, U.ownerA]))).rows[0].token;
  await as(stranger, () => sql("select accept_invitation($1)", [t]));
}, /seat limit/);

await client.end();
console.log(failures ? `\n${failures} FAILED` : "\nAll isolation checks passed");
process.exit(failures ? 1 : 0);
