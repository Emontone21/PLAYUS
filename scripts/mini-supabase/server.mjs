// mini-supabase: emulación mínima de Supabase Auth (GoTrue) y PostgREST sobre
// un Postgres común, para desarrollar y correr los tests E2E donde no hay
// Docker. NO es Supabase: cubre solo lo que la app usa.
//
//   Auth:  POST /auth/v1/signup (anónimo)   GET /auth/v1/user
//          POST /auth/v1/token?grant_type=refresh_token   POST /auth/v1/logout
//   REST:  GET/POST/PATCH/DELETE /rest/v1/<tabla>  con select, filtros eq/neq/
//          gt/gte/lt/lte/is/in/like/ilike, order, limit, offset, Prefer y
//          Accept de objeto único. Sin recursos embebidos: la app usa
//          consultas planas.
//          POST /rest/v1/rpc/<función>
//
// Cada petición corre en una transacción con `set local role <rol del JWT>` y
// `request.jwt.claims`, así RLS y auth.uid() funcionan igual que en Supabase.
//
// Variables: PORT (54321), DATABASE_URL, JWT_SECRET (el default de Supabase local).

import http from "node:http";
import crypto from "node:crypto";
import pg from "pg";
import jwt from "jsonwebtoken";

const PORT = Number(process.env.PORT ?? 54321);
const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/playus_dev";
const JWT_SECRET =
  process.env.JWT_SECRET ?? "super-secret-jwt-token-with-at-least-32-characters-long";
const INSTANCE_ID = "00000000-0000-0000-0000-000000000000";

const pool = new pg.Pool({ connectionString: DATABASE_URL });
const refreshTokens = new Map(); // refresh_token -> user id

// ---------------------------------------------------------------------------
// utilidades http
// ---------------------------------------------------------------------------

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, prefer, accept, x-client-info, accept-profile, content-profile, x-supabase-api-version, range, x-upsert",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
  "Access-Control-Expose-Headers": "content-range, x-supabase-api-version",
};

function send(res, status, body, extraHeaders = {}) {
  const headers = { ...CORS, ...extraHeaders };
  if (body === undefined) {
    res.writeHead(status, headers);
    res.end();
    return;
  }
  headers["Content-Type"] = "application/json; charset=utf-8";
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      if (!data) return resolve(null);
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

class HttpError extends Error {
  constructor(status, body) {
    super(body.message ?? body.msg ?? "error");
    this.status = status;
    this.body = body;
  }
}

// ---------------------------------------------------------------------------
// auth
// ---------------------------------------------------------------------------

function userJson(row) {
  return {
    id: row.id,
    aud: row.aud ?? "authenticated",
    role: row.role ?? "authenticated",
    email: row.email ?? "",
    phone: "",
    app_metadata: row.raw_app_meta_data ?? {},
    user_metadata: row.raw_user_meta_data ?? {},
    identities: [],
    created_at: row.created_at,
    updated_at: row.updated_at,
    is_anonymous: row.is_anonymous,
  };
}

function issueSession(row) {
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = 3600;
  const claims = {
    iss: `http://127.0.0.1:${PORT}/auth/v1`,
    sub: row.id,
    aud: "authenticated",
    exp: now + expiresIn,
    iat: now,
    email: row.email ?? "",
    phone: "",
    app_metadata: row.raw_app_meta_data ?? {},
    user_metadata: row.raw_user_meta_data ?? {},
    role: "authenticated",
    aal: "aal1",
    amr: [{ method: "anonymous", timestamp: now }],
    session_id: crypto.randomUUID(),
    is_anonymous: row.is_anonymous,
  };
  const access_token = jwt.sign(claims, JWT_SECRET, { algorithm: "HS256" });
  const refresh_token = crypto.randomBytes(24).toString("base64url");
  refreshTokens.set(refresh_token, row.id);
  return {
    access_token,
    token_type: "bearer",
    expires_in: expiresIn,
    expires_at: now + expiresIn,
    refresh_token,
    user: userJson(row),
  };
}

async function loadUser(id) {
  const { rows } = await pool.query("select * from auth.users where id = $1", [id]);
  if (!rows[0]) throw new HttpError(404, { code: 404, msg: "user not found" });
  return rows[0];
}

function bearer(req) {
  const h = req.headers.authorization ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1] : null;
}

function verify(token) {
  try {
    return jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
  } catch {
    return null;
  }
}

async function handleAuth(req, res, url, path) {
  const method = req.method;

  if (path === "/auth/v1/health" && method === "GET") {
    return send(res, 200, { name: "mini-supabase", version: "0", description: "emulación local" });
  }

  if (path === "/auth/v1/signup" && method === "POST") {
    const body = (await readJson(req)) ?? {};
    if (body.email || body.phone) {
      throw new HttpError(501, { code: 501, msg: "mini-supabase solo soporta registro anónimo" });
    }
    const { rows } = await pool.query(
      `insert into auth.users (id, instance_id, aud, role, raw_app_meta_data, raw_user_meta_data, is_anonymous, created_at, updated_at)
       values (gen_random_uuid(), $1, 'authenticated', 'authenticated',
               '{"provider":"anonymous","providers":["anonymous"]}'::jsonb, $2::jsonb, true, now(), now())
       returning *`,
      [INSTANCE_ID, JSON.stringify(body.data ?? {})],
    );
    return send(res, 200, issueSession(rows[0]));
  }

  if (path === "/auth/v1/token" && method === "POST") {
    const grant = url.searchParams.get("grant_type");
    if (grant !== "refresh_token") {
      throw new HttpError(400, { code: 400, error_code: "unsupported_grant_type", msg: "solo refresh_token" });
    }
    const body = (await readJson(req)) ?? {};
    const userId = refreshTokens.get(body.refresh_token);
    if (!userId) {
      throw new HttpError(400, { code: 400, error_code: "refresh_token_not_found", msg: "Invalid Refresh Token: Refresh Token Not Found" });
    }
    refreshTokens.delete(body.refresh_token);
    const user = await loadUser(userId);
    return send(res, 200, issueSession(user));
  }

  if (path === "/auth/v1/user") {
    const token = bearer(req);
    const claims = token ? verify(token) : null;
    if (!claims?.sub) {
      throw new HttpError(401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
    }
    const user = await loadUser(claims.sub);
    if (method === "GET") return send(res, 200, userJson(user));
    if (method === "PUT") {
      const body = (await readJson(req)) ?? {};
      if (body.password !== undefined || body.phone !== undefined) {
        throw new HttpError(501, { code: 501, msg: "mini-supabase no soporta contraseña ni teléfono" });
      }
      // Vincular email: Supabase real manda un magic link y deja el email
      // pendiente en new_email hasta confirmarlo. Acá se guarda directo.
      const { rows } = await pool.query(
        `update auth.users
            set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || $2::jsonb,
                email = coalesce($3, email),
                is_anonymous = case when $3 is null then is_anonymous else false end,
                updated_at = now()
          where id = $1 returning *`,
        [claims.sub, JSON.stringify(body.data ?? {}), body.email ?? null],
      );
      return send(res, 200, userJson(rows[0]));
    }
  }

  if (path === "/auth/v1/logout" && method === "POST") {
    return send(res, 204);
  }

  throw new HttpError(404, { code: 404, msg: `sin ruta de auth: ${method} ${path}` });
}

// ---------------------------------------------------------------------------
// rest
// ---------------------------------------------------------------------------

const IDENT = /^[a-z_][a-z0-9_]*$/;

function ident(name) {
  if (!IDENT.test(name)) throw new HttpError(400, { code: "PGRST100", message: `identificador inválido: ${name}` });
  return `"${name}"`;
}

// select=a,b:c,*  → lista de columnas SQL. Sin embebidos.
function parseSelect(param) {
  if (!param || param === "*") return "*";
  if (param.includes("(")) {
    throw new HttpError(400, { code: "PGRST200", message: "mini-supabase no soporta recursos embebidos; usá consultas planas" });
  }
  return param
    .split(",")
    .map((item) => {
      const [left, right] = item.split(":");
      if (right) return `${ident(right.trim())} as ${ident(left.trim())}`;
      const col = left.trim();
      return col === "*" ? "*" : ident(col);
    })
    .join(", ");
}

function splitList(text) {
  // (a,b,"c,d")
  const inner = text.slice(1, -1);
  const out = [];
  let cur = "";
  let quoted = false;
  for (const ch of inner) {
    if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur.length || out.length) out.push(cur);
  return out;
}

const OPS = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=", like: "like", ilike: "ilike" };
const RESERVED = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);

function parseFilters(url, alias, params) {
  const clauses = [];
  for (const [key, raw] of url.searchParams) {
    if (RESERVED.has(key)) continue;
    const col = `${alias}.${ident(key)}`;
    const dot = raw.indexOf(".");
    const op = dot === -1 ? raw : raw.slice(0, dot);
    const value = dot === -1 ? "" : raw.slice(dot + 1);
    if (op === "is") {
      if (value === "null") clauses.push(`${col} is null`);
      else if (value === "true" || value === "false") clauses.push(`${col} is ${value}`);
      else throw new HttpError(400, { code: "PGRST100", message: `is.${value} no soportado` });
    } else if (op === "in") {
      const list = splitList(value);
      params.push(list);
      clauses.push(`${col} = any($${params.length})`);
    } else if (op in OPS) {
      params.push(value);
      clauses.push(`${col} ${OPS[op]} $${params.length}`);
    } else {
      throw new HttpError(400, { code: "PGRST100", message: `operador no soportado: ${op}` });
    }
  }
  return clauses.length ? ` where ${clauses.join(" and ")}` : "";
}

function parseOrder(url, alias) {
  const order = url.searchParams.get("order");
  if (!order) return "";
  const parts = order.split(",").map((item) => {
    const [col, ...mods] = item.split(".");
    let sql = `${alias}.${ident(col)}`;
    if (mods.includes("desc")) sql += " desc";
    else sql += " asc";
    if (mods.includes("nullsfirst")) sql += " nulls first";
    if (mods.includes("nullslast")) sql += " nulls last";
    return sql;
  });
  return ` order by ${parts.join(", ")}`;
}

function parsePrefer(req) {
  const prefer = (req.headers.prefer ?? "").split(",").map((s) => s.trim());
  const get = (k) => prefer.find((p) => p.startsWith(`${k}=`))?.slice(k.length + 1);
  return { return: get("return"), resolution: get("resolution"), count: get("count") };
}

function wantsObject(req) {
  return (req.headers.accept ?? "").includes("application/vnd.pgrst.object+json");
}

function roleFromRequest(req) {
  const token = bearer(req);
  if (!token) return { role: "anon", claims: { role: "anon" } };
  const claims = verify(token);
  if (!claims) throw new HttpError(401, { code: "PGRST301", message: "JWT inválido" });
  const role = claims.role ?? "anon";
  if (!["anon", "authenticated", "service_role"].includes(role)) {
    throw new HttpError(401, { code: "PGRST301", message: `rol desconocido: ${role}` });
  }
  return { role, claims };
}

async function withRole(req, fn) {
  const { role, claims } = roleFromRequest(req);
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    await client.query(`set local role ${ident(role)}`);
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function primaryKey(client, table) {
  const { rows } = await client.query(
    `select a.attname from pg_index i
       join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
      where i.indrelid = ('public.' || quote_ident($1))::regclass and i.indisprimary
      order by array_position(i.indkey, a.attnum)`,
    [table],
  );
  return rows.map((r) => r.attname);
}

function pgErrorToHttp(e) {
  if (!e.code || e instanceof HttpError) return e;
  const status =
    e.code === "42501" ? 403
    : e.code === "42P01" ? 404
    : e.code.startsWith("23") ? 409
    : 400;
  return new HttpError(status, { code: e.code, message: e.message, details: e.detail ?? null, hint: e.hint ?? null });
}

function respondRows(req, res, rows, status = 200, extra = {}) {
  if (wantsObject(req)) {
    if (rows.length !== 1) {
      return send(res, 406, {
        code: "PGRST116",
        message: "JSON object requested, multiple (or no) rows returned",
        details: `The result contains ${rows.length} rows`,
        hint: null,
      });
    }
    return send(res, status, rows[0], extra);
  }
  return send(res, status, rows, extra);
}

async function handleTable(req, res, url, table) {
  const method = req.method;
  const alias = "t";
  const prefer = parsePrefer(req);
  const select = parseSelect(url.searchParams.get("select"));

  return withRole(req, async (client) => {
    try {
      if (method === "GET" || method === "HEAD") {
        const params = [];
        const where = parseFilters(url, alias, params);
        const order = parseOrder(url, alias);
        const limit = url.searchParams.get("limit");
        const offset = url.searchParams.get("offset");
        let sql = `select ${select} from public.${ident(table)} ${alias}${where}${order}`;
        if (limit) sql += ` limit ${Number(limit)}`;
        if (offset) sql += ` offset ${Number(offset)}`;
        const { rows } = await client.query(sql, params);
        const extra = {};
        if (prefer.count === "exact") {
          const { rows: c } = await client.query(`select count(*)::int as n from public.${ident(table)} ${alias}${where}`, params);
          extra["Content-Range"] = `${Number(offset ?? 0)}-${Math.max(0, Number(offset ?? 0) + rows.length - 1)}/${c[0].n}`;
        } else {
          extra["Content-Range"] = `0-${Math.max(0, rows.length - 1)}/*`;
        }
        return respondRows(req, res, rows, 200, extra);
      }

      if (method === "POST") {
        const body = await readJson(req);
        const items = Array.isArray(body) ? body : [body];
        const cols = [...new Set(items.flatMap((o) => Object.keys(o)))];
        if (cols.length === 0) throw new HttpError(400, { code: "PGRST102", message: "body vacío" });
        const colList = cols.map(ident).join(", ");
        let sql = `insert into public.${ident(table)} (${colList}) select ${colList} from jsonb_populate_recordset(null::public.${ident(table)}, $1::jsonb)`;
        if (prefer.resolution === "merge-duplicates") {
          const conflict = url.searchParams.get("on_conflict")?.split(",") ?? (await primaryKey(client, table));
          const updates = cols.filter((c) => !conflict.includes(c)).map((c) => `${ident(c)} = excluded.${ident(c)}`);
          sql += ` on conflict (${conflict.map(ident).join(", ")}) do ${updates.length ? `update set ${updates.join(", ")}` : "nothing"}`;
        } else if (prefer.resolution === "ignore-duplicates") {
          sql += " on conflict do nothing";
        }
        if (prefer.return === "representation") sql += ` returning ${select}`;
        const { rows } = await client.query(sql, [JSON.stringify(items)]);
        if (prefer.return === "representation") return respondRows(req, res, rows, 201);
        return send(res, 201);
      }

      if (method === "PATCH") {
        const body = await readJson(req);
        const cols = Object.keys(body ?? {});
        if (cols.length === 0) throw new HttpError(400, { code: "PGRST102", message: "body vacío" });
        const params = [JSON.stringify(body)];
        const where = parseFilters(url, alias, params);
        const sets = cols.map((c) => `${ident(c)} = r.${ident(c)}`).join(", ");
        let sql = `update public.${ident(table)} ${alias} set ${sets} from jsonb_populate_record(null::public.${ident(table)}, $1::jsonb) r${where}`;
        if (prefer.return === "representation") sql += ` returning ${select === "*" ? `${alias}.*` : select}`;
        const { rows, rowCount } = await client.query(sql, params);
        if (prefer.return === "representation") return respondRows(req, res, rows, 200);
        return send(res, 204, undefined, { "Content-Range": `0-${Math.max(0, rowCount - 1)}/*` });
      }

      if (method === "DELETE") {
        const params = [];
        const where = parseFilters(url, alias, params);
        let sql = `delete from public.${ident(table)} ${alias}${where}`;
        if (prefer.return === "representation") sql += ` returning ${select === "*" ? `${alias}.*` : select}`;
        const { rows } = await client.query(sql, params);
        if (prefer.return === "representation") return respondRows(req, res, rows, 200);
        return send(res, 204);
      }

      throw new HttpError(405, { code: "PGRST105", message: `método no soportado: ${method}` });
    } catch (e) {
      throw pgErrorToHttp(e);
    }
  });
}

async function handleRpc(req, res, url, fn) {
  if (req.method !== "POST") throw new HttpError(405, { code: "PGRST105", message: "las RPC se llaman con POST" });
  const body = (await readJson(req)) ?? {};
  return withRole(req, async (client) => {
    try {
      const { rows: meta } = await client.query(
        `select p.proretset, t.typtype
           from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
           join pg_type t on t.oid = p.prorettype
          where n.nspname = 'public' and p.proname = $1
          limit 1`,
        [fn],
      );
      if (!meta[0]) throw new HttpError(404, { code: "PGRST202", message: `no existe la función public.${fn}` });
      const keys = Object.keys(body);
      const params = keys.map((k) => body[k]);
      const args = keys.map((k, i) => `${ident(k)} := $${i + 1}`).join(", ");
      const call = `public.${ident(fn)}(${args})`;
      let sql;
      if (meta[0].proretset) {
        sql = `select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) as v from ${call} x`;
      } else if (meta[0].typtype === "c") {
        sql = `select to_jsonb(x) as v from ${call} x`;
      } else {
        sql = `select to_jsonb(${call}) as v`;
      }
      const { rows } = await client.query(sql, params);
      const value = rows[0]?.v ?? null;
      if (wantsObject(req) && Array.isArray(value)) return respondRows(req, res, value);
      return send(res, 200, value);
    } catch (e) {
      throw pgErrorToHttp(e);
    }
  });
}

// ---------------------------------------------------------------------------
// servidor
// ---------------------------------------------------------------------------

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const path = url.pathname;
  try {
    if (req.method === "OPTIONS") return send(res, 204);
    if (path.startsWith("/auth/v1/")) return await handleAuth(req, res, url, path);
    if (path.startsWith("/rest/v1/rpc/")) return await handleRpc(req, res, url, path.slice("/rest/v1/rpc/".length));
    if (path.startsWith("/rest/v1/")) return await handleTable(req, res, url, path.slice("/rest/v1/".length));
    if (path === "/") return send(res, 200, { name: "mini-supabase" });
    throw new HttpError(404, { code: 404, message: `sin ruta: ${req.method} ${path}` });
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.status, e.body);
    console.error(e);
    return send(res, 500, { code: "500", message: e.message });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`mini-supabase escuchando en http://127.0.0.1:${PORT} → ${DATABASE_URL.replace(/:[^:@]+@/, ":***@")}`);
});
