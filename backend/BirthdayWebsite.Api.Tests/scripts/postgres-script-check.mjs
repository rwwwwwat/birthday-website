// Local ephemeral PostgreSQL/WASM only. No TCP listener, cloud URL or real database is used.
// Setup: npm install --prefix .local/phase10-5-1-pgcheck --ignore-scripts --save-exact @electric-sql/pglite@0.5.12
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const { PGlite } = await import(pathToFileURL(resolve(root, '.local/phase10-5-1-pgcheck/node_modules/@electric-sql/pglite/dist/index.js')));
const scripts = await Promise.all(['001_create_private_wishes.sql','002_import_reviewed_wishes.sql','003_grant_runtime_permissions.sql'].map(name => readFile(resolve(root,'database/postgresql',name),'utf8')));
const queries = await readFile(resolve(root,'backend/BirthdayWebsite.Api/Data/PostgresWishQueries.cs'),'utf8');
const constants = {};
function expression(text, filter) {
  if (text.trim().startsWith('"""')) return text.trim().slice(3,-3).trim();
  return text.trim().split(/\s*\+\s*/).map(part => part.startsWith('"') ? JSON.parse(part)
    : part === 'Predicate(isRead)' ? filter === false ? ' WHERE is_read = false' : filter === true ? ' WHERE is_read = true' : ''
    : constants[part] ?? assert.fail('Unrecognized query component: '+part)).join('');
}
for (const match of queries.matchAll(/public const string (\w+) = ("""[\s\S]*?"""|[^;]+);/g)) constants[match[1]] = expression(match[2]);
function filtered(name, value) { return expression(new RegExp('public static string '+name+'\\(bool\\? isRead\\) => ([\\s\\S]*?);').exec(queries)[1],value); }
async function sql(db, text, values = {}) {
  const names=[];text=text.replace(/@(\w+)/g,(_,name)=>{let index=names.indexOf(name);if(index<0){names.push(name);index=names.length-1;}return '$'+(index+1);});
  return db.query(text,names.map(name=>values[name]));
}
const checks=[];
async function memory(operation) { const db=new PGlite('memory://');try { await db.exec(scripts[0]);await operation(db); } finally { await db.close(); } }
async function rejects(db, text, values) { await assert.rejects(()=>db.query(text,values)); }
// This is TEST-ONLY provisioning by the isolated superuser, not a production remediation script.
// A new login alone is not clean: PostgreSQL defaults include PUBLIC TEMP and LO creators.
async function prepareRuntimeEnvironment(db) {
  await db.exec(`DO $fixture$ DECLARE d record; p record; BEGIN
    FOR d IN SELECT datname FROM pg_database WHERE datallowconn LOOP
      EXECUTE format('REVOKE ALL ON DATABASE %I FROM PUBLIC', d.datname);
    END LOOP;
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO PUBLIC', current_database());
    FOR p IN SELECT oid::regprocedure::text AS signature FROM pg_proc
      WHERE pronamespace='pg_catalog'::regnamespace AND proname IN
      ('lo_create','lo_creat','lo_from_bytea','lo_import','lo_export','pg_read_file','pg_read_binary_file','pg_ls_dir','pg_write_file') LOOP
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', p.signature);
    END LOOP;
  END $fixture$;
  REVOKE ALL ON SCHEMA public FROM PUBLIC;`);
}
const insert='INSERT INTO birthday_private.wishes(content,source) VALUES ($1,$2) RETURNING wish_id';

await memory(async db=>{
  const columns=(await db.query("SELECT column_name,is_nullable,data_type,is_identity,identity_generation FROM information_schema.columns WHERE table_schema='birthday_private' AND table_name='wishes' ORDER BY ordinal_position")).rows;
  assert.equal(columns.length,6);assert.ok(columns.every(c=>c.is_nullable==='NO'));
  assert.equal(columns[0].identity_generation,'BY DEFAULT');
  const result=await db.query("INSERT INTO birthday_private.wishes(content) VALUES ('synthetic default test') RETURNING wish_id,is_read,source,created_at_100ns_remainder,isfinite(created_at) AS finite");
  assert.equal(Number(result.rows[0].wish_id),1);assert.equal(result.rows[0].is_read,false);assert.equal(result.rows[0].source,constants.Source);assert.equal(result.rows[0].created_at_100ns_remainder,0);assert.equal(result.rows[0].finite,true);
  const indexes=(await db.query("SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='birthday_private' ORDER BY indexname")).rows;
  assert.equal(indexes.length,3);assert.ok(indexes.filter(i=>i.indexname.startsWith('ix_')).every(i=>i.indexdef.includes('created_at DESC, created_at_100ns_remainder DESC, wish_id DESC')));
  assert.match(indexes.find(i=>i.indexname==='ix_wishes_unread_created_at').indexdef,/WHERE \(is_read = false\)/);
  checks.push('six non-null physical columns, BY DEFAULT identity, real defaults, primary key and two precision-aware indexes');
});
await memory(async db=>{
  for(const text of ['', ' ', '\t\n\r ', ' \r\t\n']) await rejects(db,insert,[text,'source']);
  await rejects(db,insert,['valid','\t\n\r ']);await rejects(db,insert,[null,'source']);await rejects(db,insert,['valid',null]);
  await db.query(insert,['x'.repeat(2000),'s'.repeat(100)]);await rejects(db,insert,['x'.repeat(2001),'source']);await rejects(db,insert,['valid','s'.repeat(101)]);
  await db.query(insert,['😀'.repeat(1000),'😀'.repeat(50)]);await rejects(db,insert,['😀'.repeat(1001),'source']);await rejects(db,insert,['valid','😀'.repeat(51)]);
  // Original SQL CHECK permits NBSP; the existing API separately rejects Unicode-only whitespace.
  await db.query(insert,['\u00a0','source']);
  assert.equal((await db.query("SELECT birthday_private.utf16_length('') AS empty,birthday_private.utf16_length('a😀中') AS units")).rows[0].units,4);
  assert.equal((await db.query("SELECT birthday_private.utf16_length('') AS units")).rows[0].units,0);
  for(const value of [-1,10]) await rejects(db,'INSERT INTO birthday_private.wishes(content,created_at_100ns_remainder) VALUES ($1,$2)',['valid',value]);
  for(const value of ['infinity','-infinity','10000-01-01T00:00:00Z']) await rejects(db,'INSERT INTO birthday_private.wishes(content,created_at) VALUES ($1,$2::timestamptz)',['valid',value]);
  checks.push('actual PostgreSQL constraints: UTF16/emoji lengths, NULL, exact TAB/LF/CR/ASCII-space rules, remainder and finite .NET time range');
});
async function configureImport(db,payload,identity='150') {
  await db.query("SELECT set_config('birthday_migration.payload',$1,false),set_config('birthday_migration.source_identity',$2,false)",[JSON.stringify(payload),identity]);
}
const synthetic=[
  {wishId:101,content:'synthetic A\n😀 ',createdAtUtc:'2020-01-02T03:04:05.1772829Z',isRead:true,source:'synthetic source'},
  {wishId:102,content:'synthetic B',createdAtUtc:'2020-01-02T03:04:05.1772821Z',isRead:false,source:'synthetic source'},
];
await memory(async db=>{
  await configureImport(db,synthetic);await db.exec(scripts[1]);
  const rows=(await db.query("SELECT wish_id,content,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US') AS micro,created_at_100ns_remainder AS rem,is_read,source FROM birthday_private.wishes ORDER BY "+constants.Ordering)).rows;
  assert.deepEqual(rows.map(row=>Number(row.wish_id)),[101,102]);
  for(let i=0;i<rows.length;i++){assert.equal(rows[i].micro+rows[i].rem+'Z',synthetic[i].createdAtUtc);assert.equal(rows[i].content,synthetic[i].content);assert.equal(rows[i].is_read,synthetic[i].isRead);assert.equal(rows[i].source,synthetic[i].source);}
  const next=await db.query(insert,['synthetic next','source']);assert.equal(Number(next.rows[0].wish_id),151);
  await assert.rejects(()=>db.exec(scripts[1]));await db.exec('ROLLBACK');assert.equal(Number((await db.query('SELECT count(*) FROM birthday_private.wishes')).rows[0].count),3);
  checks.push('synthetic migration preserves exact text, ID, UTC seven digits, IsRead/Source; ordering retains 100ns; sequence advances past source counter; nonempty reimport refuses');
});
await memory(async db=>{
  const invalid=[[],[{...synthetic[0],createdAtUtc:'2020-01-02T03:04:05.177282Z'}],[{...synthetic[0],createdAtUtc:'2020-01-02T03:04:60.1772829Z'}],
    [{...synthetic[0],extra:'not allowed'}],[{...synthetic[0],isRead:'false'}],[{...synthetic[0],content:'x'.repeat(2001)}],[synthetic[0],synthetic[0]]];
  for(const payload of invalid){await configureImport(db,payload);await assert.rejects(()=>db.exec(scripts[1]));await db.exec('ROLLBACK');assert.equal(Number((await db.query('SELECT count(*) FROM birthday_private.wishes')).rows[0].count),0);}
  await configureImport(db,synthetic,'100');await assert.rejects(()=>db.exec(scripts[1]));await db.exec('ROLLBACK');
  await assert.rejects(()=>db.exec(scripts[0]));await db.exec('ROLLBACK');assert.equal(Number((await db.query('SELECT count(*) FROM birthday_private.wishes')).rows[0].count),0);
  checks.push('invalid/duplicate/oversized/type-mismatched import rolls back all synthetic rows; timestamp normalization refused; bootstrap repeat stops without overwriting');
});
await memory(async db=>{
  const minimum={...synthetic[0],createdAtUtc:'0001-01-01T00:00:00.0000000Z'};
  const maximum={...synthetic[1],createdAtUtc:'9999-12-31T23:59:59.9999999Z'};
  await configureImport(db,[minimum,maximum]);await db.exec(scripts[1]);
  const rows=(await db.query("SELECT to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US') || created_at_100ns_remainder::text || 'Z' AS exact FROM birthday_private.wishes ORDER BY wish_id")).rows;
  assert.equal(rows[0].exact,minimum.createdAtUtc);assert.equal(rows[1].exact,maximum.createdAtUtc);
  checks.push('full .NET UTC minimum and maximum survive actual PostgreSQL import/reconstruction without rounding or infinity');
});
await memory(async db=>{
  const a=(await sql(db,constants.Insert,{content:"synthetic '); never SQL",source:constants.Source})).rows[0];
  const b=(await sql(db,constants.Insert,{content:'synthetic second',source:constants.Source})).rows[0];
  assert.ok(Number(b.wish_id)>Number(a.wish_id));assert.equal(a.created_at_100ns_remainder,0);
  await sql(db,constants.MarkRead,{id:a.wish_id});
  for(const filter of [null,false,true]){
    const count=Number((await sql(db,filtered('Count',filter))).rows[0].count);
    const page=(await sql(db,filtered('Page',filter),{size:100,offset:0})).rows;
    assert.equal(page.length,count);if(filter!==null)assert.ok(page.every(row=>row.is_read===filter));
  }
  const stats=(await sql(db,constants.Stats)).rows[0];assert.equal(Number(stats.total_count),2);assert.equal(Number(stats.unread_count),1);assert.equal(Number(stats.latest_wish_id),Number(b.wish_id));
  assert.equal((await sql(db,constants.Detail,{id:a.wish_id})).rows[0].is_read,true);assert.equal((await sql(db,constants.Detail,{id:999})).rows.length,0);assert.equal((await sql(db,constants.Latest)).rows.length,1);
  checks.push('actual C# query constants execute: parameterized RETURNING/identity, detail, mark-read, filtered pagination/counts, statistics and latest time');
});
await memory(async db=>{
  await prepareRuntimeEnvironment(db);
  await db.exec('CREATE ROLE birthday_test_runtime LOGIN NOSUPERUSER NOBYPASSRLS; CREATE ROLE anon; CREATE ROLE authenticated;');
  await db.query("SELECT set_config('birthday_runtime.role',$1,false)",['birthday_test_runtime']);await db.exec(scripts[2]);
  await db.exec('SET ROLE birthday_test_runtime');
  await db.query(insert,['synthetic role test','source']);await db.exec('UPDATE birthday_private.wishes SET is_read=true');
  await rejects(db,"UPDATE birthday_private.wishes SET content='not allowed'");await rejects(db,'DELETE FROM birthday_private.wishes');await rejects(db,'CREATE TABLE birthday_private.not_allowed(id int)');
  await db.exec('RESET ROLE; SET ROLE anon');await rejects(db,'SELECT * FROM birthday_private.wishes');await db.exec('RESET ROLE; SET ROLE authenticated');await rejects(db,'SELECT * FROM birthday_private.wishes');await db.exec('RESET ROLE');
  checks.push('runtime role can read/insert/mark-read but cannot change content/delete/create; anon/authenticated cannot read private schema');
});
// A-H use one brand-new engine PER SUBCASE. No catalog or ACL carries over between cases.
const permissionCases=[];
async function fingerprint(db) {
  const queries=[
    'SELECT oid,datacl::text FROM pg_database ORDER BY oid',
    'SELECT oid,nspacl::text FROM pg_namespace ORDER BY oid',
    'SELECT oid,relacl::text FROM pg_class WHERE relacl IS NOT NULL ORDER BY oid',
    'SELECT attrelid,attnum,attacl::text FROM pg_attribute WHERE attacl IS NOT NULL ORDER BY attrelid,attnum',
    'SELECT oid,proacl::text FROM pg_proc WHERE proacl IS NOT NULL ORDER BY oid',
    'SELECT * FROM pg_auth_members ORDER BY roleid,member,grantor',
  ];
  return JSON.stringify(await Promise.all(queries.map(async query=>(await db.query(query)).rows)));
}
async function deny(db,query,values) {
  await assert.rejects(()=>db.query(query,values),error=>{assert.equal(error.code,'42501',query);return true;});
}
async function permissionCase(group,label,setup,expectedError,verify) {
  await memory(async db=>{
    await prepareRuntimeEnvironment(db);
    await db.exec("CREATE ROLE birthday_runtime_test LOGIN NOSUPERUSER NOBYPASSRLS; INSERT INTO birthday_private.wishes(wish_id,content) VALUES(700,'SYNTHETIC PERMISSION TEST')");
    if(setup)await setup(db);
    await db.query("SELECT set_config('birthday_runtime.role',$1,false)",['birthday_runtime_test']);
    if(expectedError){
      const before=await fingerprint(db);
      await assert.rejects(()=>db.exec(scripts[2]),error=>{
        assert.equal(error.code,'42501');assert.match(error.message,/birthday_runtime_test/);assert.match(error.message,expectedError);return true;
      });
      await db.exec('ROLLBACK');
      assert.equal(await fingerprint(db),before,'Refusal must leave preexisting ACL/memberships unchanged');
    }else{
      await db.exec(scripts[2]);
      // SET ROLE alone retains the original superuser's session identity and would mis-test SET ROLE.
      await db.exec('SET SESSION AUTHORIZATION birthday_runtime_test');
      assert.equal((await db.query('SELECT session_user AS name')).rows[0].name,'birthday_runtime_test');
      assert.equal((await db.query('SELECT content FROM birthday_private.wishes WHERE wish_id=700')).rows[0].content,'SYNTHETIC PERMISSION TEST');
      const row=(await sql(db,constants.Insert,{content:'SYNTHETIC NEW WISH',source:constants.Source})).rows[0];
      assert.equal(row.is_read,false);assert.ok(row.created_at);assert.equal(row.source,constants.Source);
      assert.equal((await sql(db,constants.MarkRead,{id:row.wish_id})).rows[0].is_read,true);
      assert.equal((await db.query("SELECT birthday_private.utf16_length('a😀') AS units")).rows[0].units,3);
      assert.ok(Number((await db.query("SELECT nextval('birthday_private.wishes_wish_id_seq') AS id")).rows[0].id)>0);
      for(const query of [
        "UPDATE birthday_private.wishes SET content='forbidden'", "UPDATE birthday_private.wishes SET source='forbidden'",
        'UPDATE birthday_private.wishes SET created_at=clock_timestamp()', 'UPDATE birthday_private.wishes SET created_at_100ns_remainder=1',
        'UPDATE birthday_private.wishes SET wish_id=999', 'DELETE FROM birthday_private.wishes', 'TRUNCATE birthday_private.wishes',
        'CREATE TABLE birthday_private.not_allowed(id int)', 'CREATE TABLE public.no_public_table(id int)', 'CREATE TEMP TABLE no_temp(id int)', 'CREATE SCHEMA no_schema',
        'ALTER TABLE birthday_private.wishes ADD COLUMN no_column integer', 'SELECT lo_create(0)',
        'CREATE INDEX no_index ON birthday_private.wishes(content)', 'DROP TABLE birthday_private.wishes',
        "SELECT setval('birthday_private.wishes_wish_id_seq',900)", 'SET ROLE postgres',
        'ALTER ROLE birthday_runtime_test SUPERUSER',
      ]) await deny(db,query);
      // Explicit restore: PGlite's RESET SESSION AUTHORIZATION retains the changed default.
      await db.exec('SET SESSION AUTHORIZATION postgres; RESET ROLE');
      if(verify)await verify(db);
    }
  });
  permissionCases.push({group,label,passed:true});
}
await permissionCase('A','clean dedicated login allows only read/insert/is_read',null,null);
await permissionCase('B','inherited DELETE and content UPDATE',async db=>{
  await db.exec('CREATE ROLE inherited_power NOLOGIN; GRANT USAGE ON SCHEMA birthday_private TO inherited_power; GRANT DELETE, UPDATE(content) ON birthday_private.wishes TO inherited_power; GRANT inherited_power TO birthday_runtime_test');
  assert.equal((await db.query("SELECT pg_has_role('birthday_runtime_test','inherited_power','USAGE') AS inherited")).rows[0].inherited,true);
},/membership\/INHERIT\/SET ROLE.*inherited_power/);
await permissionCase('B','transitive inheritance is blocked at its first edge',async db=>{
  await db.exec('CREATE ROLE outer_power NOLOGIN; CREATE ROLE bridge_role NOLOGIN; GRANT DELETE ON birthday_private.wishes TO outer_power; GRANT outer_power TO bridge_role; GRANT bridge_role TO birthday_runtime_test');
  assert.equal((await db.query("SELECT pg_has_role('birthday_runtime_test','outer_power','USAGE') AS inherited")).rows[0].inherited,true);
},/membership\/INHERIT\/SET ROLE.*bridge_role/);
await permissionCase('C','NOINHERIT with SET TRUE still rejected',async db=>{
  await db.exec('ALTER ROLE birthday_runtime_test NOINHERIT; CREATE ROLE set_power NOLOGIN; GRANT USAGE ON SCHEMA birthday_private TO set_power; GRANT DELETE ON birthday_private.wishes TO set_power; GRANT set_power TO birthday_runtime_test WITH INHERIT FALSE, SET TRUE');
  const state=(await db.query("SELECT pg_has_role('birthday_runtime_test','set_power','USAGE') AS inherited,pg_has_role('birthday_runtime_test','set_power','SET') AS can_set")).rows[0];
  assert.equal(state.inherited,false);assert.equal(state.can_set,true);
  await db.exec('SET SESSION AUTHORIZATION birthday_runtime_test; SET ROLE set_power');
  // WHERE/RETURNING would additionally require column SELECT. DELETE alone can still erase rows.
  await db.exec('DELETE FROM birthday_private.wishes');
  await db.exec('SET SESSION AUTHORIZATION postgres; RESET ROLE');
  assert.equal(Number((await db.query('SELECT count(*) FROM birthday_private.wishes WHERE wish_id=700')).rows[0].count),0);
},/membership\/INHERIT\/SET ROLE.*set_power/);
await permissionCase('C','another role can SET ROLE into runtime',async db=>{
  await db.exec('CREATE ROLE incoming_member LOGIN; GRANT birthday_runtime_test TO incoming_member WITH INHERIT FALSE, SET TRUE');
},/membership\/INHERIT\/SET ROLE.*incoming_member/);
for(const [label,grantSql,expected] of [
  ['DELETE','GRANT DELETE ON birthday_private.wishes TO birthday_runtime_test',/DELETE.*birthday_private.wishes/],
  ['column UPDATE(content)','GRANT UPDATE(content) ON birthday_private.wishes TO birthday_runtime_test',/UPDATE.*wishes.content/],
  ['TRUNCATE','GRANT TRUNCATE ON birthday_private.wishes TO birthday_runtime_test',/TRUNCATE.*wishes/],
  ['schema CREATE','GRANT CREATE ON SCHEMA birthday_private TO birthday_runtime_test',/CREATE.*schema birthday_private/],
  ['table UPDATE','GRANT UPDATE ON birthday_private.wishes TO birthday_runtime_test',/UPDATE.*table birthday_private.wishes/],
  ['column UPDATE(created_at)','GRANT UPDATE(created_at) ON birthday_private.wishes TO birthday_runtime_test',/UPDATE.*created_at/],
  ['column UPDATE(source)','GRANT UPDATE(source) ON birthday_private.wishes TO birthday_runtime_test',/UPDATE.*source/],
  ['database CREATE','GRANT CREATE ON DATABASE postgres TO birthday_runtime_test',/CREATE.*database postgres/],
  ['database TEMP','GRANT TEMP ON DATABASE postgres TO birthday_runtime_test',/TEMPORARY.*database postgres/],
  ['sequence reset','GRANT UPDATE ON SEQUENCE birthday_private.wishes_wish_id_seq TO birthday_runtime_test',/UPDATE.*sequence/],
  ['grant option','GRANT SELECT ON birthday_private.wishes TO birthday_runtime_test WITH GRANT OPTION',/SELECT WITH GRANT OPTION/],
  ['other routine EXECUTE',"CREATE FUNCTION public.unlisted() RETURNS integer LANGUAGE sql AS 'SELECT 1'; REVOKE ALL ON FUNCTION public.unlisted() FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.unlisted() TO birthday_runtime_test",/EXECUTE.*routine public.unlisted/],
]) await permissionCase('D',label,db=>db.exec(grantSql),expected);
for(const [label,setup,expected] of [
  ['table owner','ALTER TABLE birthday_private.wishes OWNER TO birthday_runtime_test',/OWNER.*table birthday_private.wishes/],
  ['schema owner','ALTER SCHEMA birthday_private OWNER TO birthday_runtime_test',/OWNER.*schema birthday_private/],
  ['identity sequence owner (follows table owner)','ALTER TABLE birthday_private.wishes OWNER TO birthday_runtime_test',/OWNER.*sequence birthday_private.wishes_wish_id_seq/],
  ['helper owner','ALTER FUNCTION birthday_private.utf16_length(text) OWNER TO birthday_runtime_test',/OWNER.*function birthday_private.utf16_length/],
  ['database owner','ALTER DATABASE postgres OWNER TO birthday_runtime_test',/OWNER.*database postgres/],
]) await permissionCase('E',label,async db=>{
  await db.exec(setup);
  if(label.startsWith('identity'))assert.equal((await db.query("SELECT r.rolname FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner WHERE c.oid='birthday_private.wishes_wish_id_seq'::regclass")).rows[0].rolname,'birthday_runtime_test');
},expected);
for(const attribute of ['SUPERUSER','BYPASSRLS','CREATEROLE','CREATEDB','REPLICATION','NOLOGIN'])
  await permissionCase('F',attribute,db=>db.exec('ALTER ROLE birthday_runtime_test '+attribute),new RegExp('attributes.*'+attribute));
await permissionCase('F','unreviewed LOGIN settings',db=>db.exec('ALTER ROLE birthday_runtime_test SET search_path TO public'),/LOGIN configuration.*search_path/);
for(const [label,grantSql,expected] of [
  ['PUBLIC DELETE','GRANT DELETE ON birthday_private.wishes TO PUBLIC',/PUBLIC.*DELETE/],
  ['PUBLIC content UPDATE','GRANT UPDATE(content) ON birthday_private.wishes TO PUBLIC',/PUBLIC.*UPDATE.*content/],
  ['PUBLIC TRUNCATE','GRANT TRUNCATE ON birthday_private.wishes TO PUBLIC',/PUBLIC.*TRUNCATE/],
  ['PUBLIC schema CREATE','GRANT CREATE ON SCHEMA birthday_private TO PUBLIC',/PUBLIC.*CREATE.*schema/],
  ['PUBLIC database TEMP','GRANT TEMP ON DATABASE postgres TO PUBLIC',/PUBLIC.*TEMPORARY.*database/],
  ['PUBLIC table SELECT is not a dedicated-role grant','GRANT SELECT ON birthday_private.wishes TO PUBLIC',/PUBLIC.*SELECT/],
  ['PUBLIC schema USAGE','GRANT USAGE ON SCHEMA birthday_private TO PUBLIC',/PUBLIC.*USAGE.*schema/],
  ['PUBLIC security-definer routine',"CREATE FUNCTION public.unreviewed() RETURNS integer LANGUAGE sql SECURITY DEFINER AS 'SELECT 1'",/PUBLIC.*EXECUTE.*unreviewed/],
  ['PUBLIC large-object creator','GRANT EXECUTE ON FUNCTION pg_catalog.lo_create(oid) TO PUBLIC',/PUBLIC.*EXECUTE.*lo_create/],
  ['PUBLIC other database CONNECT','GRANT CONNECT ON DATABASE template1 TO PUBLIC',/PUBLIC.*CONNECT.*database template1/],
  ['PUBLIC system secret catalog SELECT','GRANT SELECT ON pg_catalog.pg_authid TO PUBLIC',/PUBLIC.*SELECT.*pg_catalog.pg_authid/],
]) await permissionCase('G',label,db=>db.exec(grantSql),expected);
await permissionCase('G','RLS requires separate review rather than a false ACL-only success',db=>db.exec('ALTER TABLE birthday_private.wishes ENABLE ROW LEVEL SECURITY'),/unreviewed RLS.*birthday_private.wishes/);
await permissionCase('H','valid existing allowlisted ACLs and repeated audit',async db=>{
  await db.exec(`GRANT USAGE ON SCHEMA birthday_private TO birthday_runtime_test;
    GRANT SELECT,INSERT ON birthday_private.wishes TO birthday_runtime_test;
    GRANT UPDATE(is_read) ON birthday_private.wishes TO birthday_runtime_test;
    GRANT EXECUTE ON FUNCTION birthday_private.utf16_length(text) TO birthday_runtime_test;
    GRANT USAGE ON SEQUENCE birthday_private.wishes_wish_id_seq TO birthday_runtime_test;`);
},null,async db=>{
  const before=await fingerprint(db);await db.exec(scripts[2]);assert.equal(await fingerprint(db),before);
});
const report={passed:true,engine:'PGlite 0.5.12, ephemeral in-memory PostgreSQL/WASM',checks,permissionCases,permissionGroups:[...new Set(permissionCases.map(item=>item.group))],realSqlServerConnections:0,supabaseConnections:0,realWishWrites:0};
await writeFile(resolve(root,'.local/phase10-5-postgres-script-result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
await writeFile(resolve(root,'.local/phase10-5-1-postgres-script-result.json'),JSON.stringify(report,null,2));
