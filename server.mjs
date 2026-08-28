#!/usr/bin/env node
/*
  Grid Planner — local helper server.

  Exists for exactly one reason: the OAuth code-for-token exchange needs your Meta
  app SECRET, and a secret cannot live in browser JavaScript. So the browser never
  sees a token at all — it asks this server for media, and this server talks to
  Instagram. That also sidesteps two CORS problems for free (the Graph API call and
  the CDN image fetches, the latter of which would otherwise taint the canvas and
  break the brightness analysis).

    node server.mjs              http  on 127.0.0.1:8000
    node server.mjs --https      https on 127.0.0.1:8443 (self-signed, via openssl)
    node server.mjs --port 9000

  Config: copy config.example.json -> config.json and fill it in, or set
  IG_APP_ID / IG_APP_SECRET / IG_REDIRECT_URI in the environment.

  Binds to loopback only. Never expose this to a network — it holds a live token.
*/

import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = n => argv.includes(n);
const opt  = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i+1] ? argv[i+1] : d; };

const USE_HTTPS = flag("--https");
const PORT = parseInt(opt("--port", USE_HTTPS ? "8443" : "8000"), 10);
const TOKEN_FILE = path.join(DIR, ".token.json");
const CONFIG_FILE = path.join(DIR, "config.json");

/* ---------------- config ---------------- */
function loadConfig(){
  let file = {};
  try{ file = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")); }catch(_){ }
  const origin = `${USE_HTTPS ? "https" : "http"}://localhost:${PORT}`;
  return {
    appId:     process.env.IG_APP_ID     || file.appId     || "",
    appSecret: process.env.IG_APP_SECRET || file.appSecret || "",
    redirectUri: process.env.IG_REDIRECT_URI || file.redirectUri || `${origin}/auth/callback`
  };
}
let CFG = loadConfig();
const configured = () => !!(CFG.appId && CFG.appSecret && CFG.redirectUri);

/* ---------------- token store (server-side only) ---------------- */
let TOKEN = null;   // {access_token, user_id, expires_at, username}
try{ TOKEN = JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8")); }catch(_){ }
function saveToken(t){
  TOKEN = t;
  try{
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(t, null, 1), {mode:0o600});
  }catch(e){ console.warn("! could not persist token:", e.message); }
}
function clearToken(){
  TOKEN = null;
  try{ fs.unlinkSync(TOKEN_FILE); }catch(_){ }
}

const pending = new Map();   // oauth state -> issued-at, for CSRF protection

/* ---------------- helpers ---------------- */
const MIME = {".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",
  ".css":"text/css; charset=utf-8",".json":"application/json; charset=utf-8",
  ".md":"text/plain; charset=utf-8",".png":"image/png",".jpg":"image/jpeg",".svg":"image/svg+xml",
  ".ico":"image/x-icon"};

function sendJSON(res, code, obj){
  const body = JSON.stringify(obj);
  res.writeHead(code, {"content-type":"application/json; charset=utf-8",
                       "content-length":Buffer.byteLength(body),
                       "cache-control":"no-store"});
  res.end(body);
}
function sendPage(res, code, title, msg, detail){
  const body = `<!doctype html><meta charset="utf-8"><title>${title}</title>
<style>body{background:#0a0a0b;color:#e8e8ea;font:14px/1.6 system-ui,sans-serif;
display:grid;place-items:center;height:100vh;margin:0;text-align:center}
div{max-width:520px;padding:0 24px}h1{font-size:16px;letter-spacing:.3px}
code{background:#1a1a1e;padding:2px 6px;border-radius:4px;font-size:12.5px}
a{color:#8ab4ff}p{color:#8a8a92}</style>
<div><h1>${msg}</h1><p>${detail||""}</p><p><a href="/">← back to the planner</a></p></div>`;
  res.writeHead(code, {"content-type":"text/html; charset=utf-8"});
  res.end(body);
}

/* fetch with a hard timeout so a hung upstream can't wedge the server */
async function upstream(url, init={}, ms=20000){
  const ac = new AbortController();
  const t = setTimeout(()=>ac.abort(), ms);
  try{ return await fetch(url, {...init, signal: ac.signal}); }
  finally{ clearTimeout(t); }
}

/* ---------------- oauth ---------------- */
function authorizeUrl(state){
  const p = new URLSearchParams({
    client_id: CFG.appId,
    redirect_uri: CFG.redirectUri,
    response_type: "code",
    scope: "instagram_business_basic",
    state
  });
  return "https://www.instagram.com/oauth/authorize?" + p;
}

async function exchangeCode(code){
  // 1. short-lived token (this is the call that needs the app secret)
  const form = new URLSearchParams({
    client_id: CFG.appId,
    client_secret: CFG.appSecret,
    grant_type: "authorization_code",
    redirect_uri: CFG.redirectUri,
    code
  });
  const r1 = await upstream("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: {"content-type":"application/x-www-form-urlencoded"},
    body: form.toString()
  });
  const j1 = await r1.json().catch(()=>({}));
  if(!r1.ok || !j1.access_token)
    throw new Error(j1.error_message || j1.error?.message || `token exchange failed (${r1.status})`);

  // 2. upgrade to a long-lived token (60 days) so you aren't reconnecting hourly
  let token = j1.access_token, expiresIn = 3600;
  try{
    const p = new URLSearchParams({
      grant_type: "ig_exchange_token",
      client_secret: CFG.appSecret,
      access_token: j1.access_token
    });
    const r2 = await upstream("https://graph.instagram.com/access_token?" + p);
    const j2 = await r2.json().catch(()=>({}));
    if(r2.ok && j2.access_token){ token = j2.access_token; expiresIn = j2.expires_in || 5184000; }
  }catch(_){ /* keep the short-lived token rather than failing the whole login */ }

  let username = "";
  try{
    const r3 = await upstream("https://graph.instagram.com/me?fields=username&access_token=" +
                              encodeURIComponent(token));
    const j3 = await r3.json().catch(()=>({}));
    username = j3.username || "";
  }catch(_){ }

  return { access_token: token, user_id: j1.user_id || null, username,
           expires_at: Date.now() + expiresIn*1000 };
}

async function refreshIfStale(){
  if(!TOKEN) return;
  const left = TOKEN.expires_at - Date.now();
  if(left > 7*24*3600*1000 || left < 0) return;    // only refresh inside the last week
  try{
    const r = await upstream("https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token" +
                             "&access_token=" + encodeURIComponent(TOKEN.access_token));
    const j = await r.json().catch(()=>({}));
    if(r.ok && j.access_token)
      saveToken({...TOKEN, access_token:j.access_token, expires_at: Date.now() + (j.expires_in||5184000)*1000});
  }catch(_){ }
}

/* ---------------- api proxy ---------------- */
const FIELDS = "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp";

async function fetchMedia(limit){
  let url = `https://graph.instagram.com/me/media?fields=${FIELDS}&limit=${Math.min(100,limit)}` +
            `&access_token=${encodeURIComponent(TOKEN.access_token)}`;
  const out = [];
  while(url && out.length < limit){
    const r = await upstream(url);
    const j = await r.json().catch(()=>({}));
    if(j.error) throw new Error(j.error.message || "Instagram API error");
    if(!Array.isArray(j.data)) throw new Error("unexpected response from Instagram");
    out.push(...j.data);
    url = j.paging?.next || null;
  }
  return out.slice(0, limit);
}

// only ever proxy Instagram/Facebook CDN hosts — this must not become an open proxy
const CDN_OK = h => /(^|\.)(cdninstagram\.com|fbcdn\.net)$/i.test(h);

/* ---------------- static ---------------- */
// secrets live in this folder, so the static handler must refuse to hand them out
const SECRET_FILE = n => n === "config.json" || n === ".token.json" ||
                         n.startsWith(".") || /-(key|cert)\.pem$/i.test(n);

function serveStatic(req, res, pathname){
  const rel = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  const full = path.resolve(DIR, rel);
  if(!full.startsWith(DIR)){ res.writeHead(403).end("forbidden"); return; }        // traversal guard
  if(SECRET_FILE(path.basename(full))){ res.writeHead(403).end("forbidden"); return; }
  fs.readFile(full, (err, buf)=>{
    if(err){ res.writeHead(404, {"content-type":"text/plain"}).end("not found"); return; }
    res.writeHead(200, {"content-type": MIME[path.extname(full).toLowerCase()] || "application/octet-stream",
                        "cache-control":"no-store"});
    res.end(buf);
  });
}

/* ---------------- router ---------------- */
async function handle(req, res){
  const origin = `${USE_HTTPS ? "https" : "http"}://localhost:${PORT}`;

  // DNS-rebinding guard: a hostile site can point a domain it controls at 127.0.0.1,
  // but it cannot change the Host header the browser sends.
  const host = (req.headers.host || "").split(":")[0].toLowerCase();
  if(host && host !== "localhost" && host !== "127.0.0.1" && host !== "[::1]"){
    res.writeHead(403, {"content-type":"text/plain"});
    return res.end("forbidden host");
  }

  const u = new URL(req.url, origin);
  const p = u.pathname;

  if(p === "/auth/status"){
    CFG = loadConfig();
    await refreshIfStale();
    return sendJSON(res, 200, {
      server: true,
      configured: configured(),
      connected: !!TOKEN,
      username: TOKEN?.username || null,
      expiresAt: TOKEN?.expires_at || null,
      redirectUri: CFG.redirectUri
    });
  }

  if(p === "/auth/login"){
    CFG = loadConfig();
    if(!configured())
      return sendPage(res, 400, "Not configured", "This app isn't configured yet",
        "Copy <code>config.example.json</code> to <code>config.json</code> and fill in your Instagram app ID and secret, then restart the server.");
    const state = crypto.randomBytes(16).toString("hex");
    pending.set(state, Date.now());
    for(const [k,t] of pending) if(Date.now()-t > 10*60*1000) pending.delete(k);
    res.writeHead(302, {location: authorizeUrl(state)});
    return res.end();
  }

  if(p === "/auth/callback"){
    const {code, state, error, error_description} = Object.fromEntries(u.searchParams);
    if(error)
      return sendPage(res, 400, "Login failed", "Instagram declined the login", escapeHtml(error_description || error));
    if(!state || !pending.has(state))
      return sendPage(res, 400, "Login failed", "Stale or forged login attempt",
        "The one-time state value didn't match. Start again from the planner.");
    pending.delete(state);
    if(!code) return sendPage(res, 400, "Login failed", "No authorization code came back", "");
    try{
      saveToken(await exchangeCode(code));
      console.log(`  ✓ connected as @${TOKEN.username || TOKEN.user_id}`);
      res.writeHead(302, {location: "/?connected=1"});
      return res.end();
    }catch(e){
      return sendPage(res, 502, "Login failed", "Couldn't exchange the code for a token", escapeHtml(e.message));
    }
  }

  if(p === "/auth/logout"){
    // POST-only: as a GET, any web page could log you out with an <img> tag
    if(req.method !== "POST") return sendJSON(res, 405, {error:"POST required"});
    clearToken();
    console.log("  · token cleared");
    return sendJSON(res, 200, {ok:true});
  }

  if(p === "/api/media"){
    if(!TOKEN) return sendJSON(res, 401, {error:"Not connected to Instagram yet."});
    const limit = Math.max(1, Math.min(500, parseInt(u.searchParams.get("limit") || "30", 10) || 30));
    try{
      return sendJSON(res, 200, {data: await fetchMedia(limit)});
    }catch(e){
      return sendJSON(res, 502, {error: e.message});
    }
  }

  if(p === "/api/img"){
    const raw = u.searchParams.get("u") || "";
    let target;
    try{ target = new URL(raw); }catch(_){ return sendJSON(res, 400, {error:"bad url"}); }
    if(target.protocol !== "https:" || !CDN_OK(target.hostname))
      return sendJSON(res, 403, {error:"only Instagram CDN urls may be proxied"});
    try{
      const r = await upstream(target.href, {}, 30000);
      if(!r.ok) return sendJSON(res, 502, {error:"upstream "+r.status});
      const buf = Buffer.from(await r.arrayBuffer());
      res.writeHead(200, {"content-type": r.headers.get("content-type") || "image/jpeg",
                          "content-length": buf.length, "cache-control":"no-store"});
      return res.end(buf);
    }catch(e){
      return sendJSON(res, 502, {error: e.message});
    }
  }

  if(req.method !== "GET") { res.writeHead(405).end("method not allowed"); return; }
  return serveStatic(req, res, p);
}

const escapeHtml = s => String(s).replace(/[&<>"']/g,
  c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

/* ---------------- tls ---------------- */
function ensureCert(){
  const key = path.join(DIR, "localhost-key.pem"), cert = path.join(DIR, "localhost-cert.pem");
  if(fs.existsSync(key) && fs.existsSync(cert)) return {key:fs.readFileSync(key), cert:fs.readFileSync(cert)};
  console.log("· generating a self-signed certificate for localhost…");
  try{
    execFileSync("openssl", ["req","-x509","-newkey","rsa:2048","-nodes","-days","825",
      "-keyout",key,"-out",cert,"-subj","/CN=localhost",
      "-addext","subjectAltName=DNS:localhost,IP:127.0.0.1"], {stdio:"pipe"});
  }catch(e){
    console.error("✗ openssl failed — install it, or run without --https.\n", e.message);
    process.exit(1);
  }
  return {key:fs.readFileSync(key), cert:fs.readFileSync(cert)};
}

/* ---------------- boot ---------------- */
const wrapped = (req,res) => handle(req,res).catch(e=>{
  console.error("! " + e.message);
  if(!res.headersSent) sendJSON(res, 500, {error:e.message});
});
const server = USE_HTTPS ? https.createServer(ensureCert(), wrapped) : http.createServer(wrapped);

server.listen(PORT, "127.0.0.1", ()=>{
  const origin = `${USE_HTTPS ? "https" : "http"}://localhost:${PORT}`;
  console.log(`\n  Grid Planner  →  ${origin}\n`);
  if(!configured()){
    console.log("  Instagram login is OFF — no app credentials found.");
    console.log("  Copy config.example.json to config.json and fill it in, then restart.\n");
  }else{
    console.log(`  Instagram app ${CFG.appId}`);
    console.log(`  Redirect URI  ${CFG.redirectUri}`);
    console.log("  ↑ this must match a Valid OAuth Redirect URI in your Meta app, exactly.\n");
    if(TOKEN) console.log(`  Already connected as @${TOKEN.username || TOKEN.user_id}\n`);
  }
  console.log("  Ctrl+C to stop.\n");
});
server.on("error", e=>{
  if(e.code === "EADDRINUSE") console.error(`\n✗ Port ${PORT} is busy. Try:  node server.mjs --port 8001\n`);
  else console.error("\n✗ " + e.message + "\n");
  process.exit(1);
});
