var Q=Object.prototype.toString,v="[object Uint8Array]",q="[object ArrayBuffer]";function K(t,e,r){return t?t.constructor===e?!0:Q.call(t)===r:!1}function tt(t){return K(t,Uint8Array,v)}function P(t){return K(t,ArrayBuffer,q)}function et(t){return tt(t)||P(t)}function E(t){return P(t)?new Uint8Array(t):t}function C(t){if(!et(t))throw new TypeError(`Expected \`Uint8Array\` or \`ArrayBuffer\`, got \`${typeof t}\``)}function O(t){if(t instanceof ArrayBuffer)return new Uint8Array(t);if(ArrayBuffer.isView(t))return new Uint8Array(t.buffer,t.byteOffset,t.byteLength);throw new TypeError(`Unsupported value, got \`${typeof t}\`.`)}function I(t,e){if(t.length===0)return new Uint8Array(0);e??=t.reduce((o,i)=>o+i.byteLength,0);let r=new Uint8Array(e),n=0;for(let o of t)C(o),o=E(o),r.set(o,n),n+=o.length;return r}var lt={utf8:new globalThis.TextDecoder("utf8")};function L(t){if(typeof t!="string")throw new TypeError(`Expected \`string\`, got \`${typeof t}\``)}var rt=new globalThis.TextEncoder;function c(t){return L(t),rt.encode(t)}function nt(t){return t.replaceAll("+","-").replaceAll("/","_").replace(/=+$/,"")}function ot(t){let e=t.replaceAll("-","+").replaceAll("_","/"),r=(4-e.length%4)%4;return e+"=".repeat(r)}var B=65535;function j(t,{urlSafe:e=!1}={}){C(t),t=E(t);let r="";for(let n=0;n<t.length;n+=B){let o=t.subarray(n,n+B);r+=globalThis.btoa(String.fromCodePoint.apply(void 0,o))}return e?nt(r):r}function h(t){return L(t),Uint8Array.from(globalThis.atob(ot(t)),e=>e.codePointAt(0))}var dt=Array.from({length:256},(t,e)=>e.toString(16).padStart(2,"0"));function D(t){let e=new Uint8Array(4);return new DataView(e.buffer).setUint32(0,t),e}function s(t,e){if(!t)throw new Error(e)}async function H(t){let e=h(t.keys.p256dh),r=h(t.keys.auth);return s(e.byteLength===65&&e[0]===4,"Subscription p256dh is not an uncompressed P-256 point"),s(r.byteLength===16,"Subscription auth secret is not 16 bytes"),{publicKeyBytes:e,publicKey:await crypto.subtle.importKey("raw",e,{name:"ECDH",namedCurve:"P-256"},!1,[]),authSecretBytes:r}}function M(t){let e=crypto.subtle.importKey("raw",t,{name:"HMAC",hash:"SHA-256"},!1,["sign"]);return{hash:async r=>{let n=await e;return crypto.subtle.sign("HMAC",n,r)}}}async function m(t,e){let r=M(t).hash(e).then(n=>M(n));return{extract:async(n,o)=>{let i=await r,u=await Array.from({length:Math.ceil(o/32)},(p,a)=>a).reduce(async(p,a)=>{let y=await p,l=await i.hash(new Uint8Array([...y.at(-1)??[],...n,a+1]));return[...y,new Uint8Array(l)]},Promise.resolve([]));return I(u).slice(0,o)}}}function $(t,e){return new Uint8Array([...c("WebPush: info\0"),...t,...e])}function b(t){return c(`Content-Encoding: ${t}\0`)}async function N(){let t=await crypto.subtle.generateKey({name:"ECDH",namedCurve:"P-256"},!1,["deriveBits"]);return{privateKey:t.privateKey,publicKeyBytes:new Uint8Array(await crypto.subtle.exportKey("raw",t.publicKey))}}async function V(){return crypto.getRandomValues(new Uint8Array(16))}var _=4096,it=86,A=_-it-17;async function w(t,e,r={}){s(e.byteLength<=A,`Payload is ${e.byteLength} bytes, the maximum is ${A}`);let n=await H(t),o=await V(),i=await N(),u=await crypto.subtle.deriveBits({name:"ECDH",public:n.publicKey},i.privateKey,256),p=$(n.publicKeyBytes,i.publicKeyBytes),a=b("aes128gcm"),y=b("nonce"),k=await(await m(n.authSecretBytes,u)).extract(p,32),S=await m(o,k),W=await S.extract(a,16),X=await S.extract(y,12),Y=await crypto.subtle.importKey("raw",W,{name:"AES-GCM",length:128},!1,["encrypt"]),Z=r.pad??!0?A:e.byteLength,g=new Uint8Array(Z+1);g.set(e),g[e.byteLength]=2;let F=await crypto.subtle.encrypt({name:"AES-GCM",iv:X},Y,g);return new Uint8Array([...o,...D(_),i.publicKeyBytes.byteLength,...i.publicKeyBytes,...new Uint8Array(F)])}function d(t){return j(O(t),{urlSafe:!0})}function x(t){return d(c(JSON.stringify(t)))}async function R(t,e){let r=x({typ:"JWT",alg:"ES256"}),n=x({iat:Math.floor(Date.now()/1e3),...t}),o=`${r}.${n}`,i=await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},e,c(o));return`${o}.${d(i)}`}async function U(t,e){s(e.subject,"Vapid subject is empty"),s(e.privateKey,"Vapid private key is empty"),s(e.publicKey,"Vapid public key is empty");let r=new URL(t.endpoint);s(r.protocol==="https:",`Subscription endpoint is not https: ${r.protocol}`);let n=h(e.publicKey),o=await crypto.subtle.importKey("jwk",{kty:"EC",crv:"P-256",x:d(n.slice(1,33)),y:d(n.slice(33,65)),d:e.privateKey},{name:"ECDSA",namedCurve:"P-256"},!1,["sign"]);return{headers:{authorization:`vapid t=${await R({aud:r.origin,exp:Math.floor(Date.now()/1e3)+720*60,sub:e.subject},o)}, k=${e.publicKey}`}}}async function T(t,e,r){let{headers:n}=await U(e,r),o=await w(e,c(typeof t.data=="string"||typeof t.data=="number"?t.data.toString():JSON.stringify(t.data)));return{headers:{...n,ttl:(t.options?.ttl||60).toString(),...t.options?.urgency&&{urgency:t.options.urgency},...t.options?.topic&&{topic:t.options.topic},"content-encoding":"aes128gcm","content-length":o.byteLength.toString(),"content-type":"application/octet-stream"},method:"post",body:o}}// ---- 무수한 실모 알림 서버: 요청 처리 부분 ----
// 새 방식(v2): { room, to, text, token } — token은 보낸 사람의 로그인 토큰. 이 토큰을 그대로 붙여 서버를 읽으므로
//   서버 규칙이 "방 멤버만 읽기"를 지켜 줌(서비스 계정 열쇠가 필요 없음). 보낸 사람 ID는 토큰 안의 계정 ID.
// 옛 방식: { room, from, to, text } — 옛 구조(/rooms/...)를 읽음. 옛 앱을 쓰는 친구가 있는 동안 계속 받음.
var DB_URL = "https://infinitesilmo-default-rtdb.asia-southeast1.firebasedatabase.app";
var APP_ORIGIN = "https://danny0119g.github.io";
var PUB = "BJLJ-_VzE5N-C0Sf-XdDQMuy-oYOCTV0AXJuwS8UTifQ36P43TT9i_MolHWsmsautZcNqPZlENfdrTEkPapPgeA";
var SUBJECT = "https://danny0119g.github.io/Infinity-silmo/";
var ROOM_RE = /^[a-z0-9]{6,12}$/, OLD_ID_RE = /^[a-z0-9]{6,20}$/, UID_RE = /^[A-Za-z0-9]{20,40}$/;
function corsHeaders(extra) {
  return Object.assign({ "Access-Control-Allow-Origin": APP_ORIGIN, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400", Vary: "Origin" }, extra || {});
}
function reply(obj, status) { return new Response(JSON.stringify(obj), { status: status || 200, headers: corsHeaders({ "Content-Type": "application/json" }) }); }
async function dbGet(path, token) {                  // { ok, v } — 실패(권한 없음 포함)하면 ok:false
  try {
    var r = await fetch(DB_URL + path + ".json" + (token ? "?auth=" + encodeURIComponent(token) : ""));
    return r.ok ? { ok: true, v: await r.json() } : { ok: false, v: null, status: r.status };
  } catch (e) { return { ok: false, v: null }; }
}
function recentSignal(n) {                           // 상대가 앱을 보고 있다는 신호(초 단위 시각)가 10초 이내인지
  var now = Date.now() / 1000;
  return typeof n === "number" && Number.isFinite(n) && now - n <= 10 && n - now <= 30;
}
function subFromString(str) {                        // 알림 주소(base64url JSON {e,p,a}) → 구독 정보
  if (typeof str !== "string" || str.length > 600) return null;
  try {
    var o = JSON.parse(atob(str.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(str.length / 4) * 4, "=")));
    if (typeof o.e !== "string" || !/^https:\/\//.test(o.e) || typeof o.p !== "string" || typeof o.a !== "string") return null;
    return { endpoint: o.e, expirationTime: null, keys: { p256dh: o.p, auth: o.a } };
  } catch (e) { return null; }
}
function uidFromToken(tok) {                         // 로그인 토큰(JWT)의 계정 ID. 서명 검증은 서버(Firebase)가 토큰을 받아들이는 것으로 갈음됨
  try {
    var parts = tok.split(".");
    if (parts.length !== 3) return "";
    var p = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(parts[1].length / 4) * 4, "=")));
    var id = p.user_id || p.sub;
    return typeof id === "string" ? id : "";
  } catch (e) { return ""; }
}
function cleanText(t) { return String(t).replace(/\s+/g, " ").trim().slice(0, 60); }
async function sendPush(sub, name, text, fromId, env) {
  var req = await T({ data: { t: name.slice(0, 12), b: text, g: fromId }, options: { ttl: 600, urgency: "high" } }, sub, { subject: SUBJECT, publicKey: PUB, privateKey: env.VAPID_PRIVATE_KEY });
  var res = await fetch(sub.endpoint, req);
  return reply({ ok: res.ok, sent: res.ok, status: res.status });
}
async function notifyV2(n, env) {
  var token = n.token, from = uidFromToken(token);
  if (!ROOM_RE.test(n.room || "") || !UID_RE.test(n.to || "") || typeof n.text !== "string" || typeof token !== "string" || token.length > 4000 || !UID_RE.test(from) || from === n.to) return reply({ ok: false, error: "bad request" }, 400);
  var text = cleanText(n.text);
  if (!text) return reply({ ok: false, error: "empty" }, 400);
  var base = "/v2/rooms/" + n.room;
  var got = await Promise.all([dbGet(base + "/members/" + from, token), dbGet(base + "/members/" + n.to + "/on", token), dbGet(base + "/push/" + n.to, token)]);
  var me = got[0], on = got[1], push = got[2];
  if (!me.ok || !me.v || typeof me.v !== "object" || typeof me.v.name !== "string") return reply({ ok: false, error: "not a member" }, 403);
  if (on.ok && recentSignal(on.v)) return reply({ ok: true, sent: false, skipped: "viewing" });
  var sub = subFromString(push.ok ? push.v : null);
  if (!sub) return reply({ ok: true, sent: false });
  return sendPush(sub, me.v.name, text, from, env);
}
function legacyViewing(subjects) {                   // 옛 구조: 친구 칸 안의 "~온|<초>" 신호
  if (!subjects || typeof subjects !== "object") return false;
  var k = Object.keys(subjects).find(function (x) { return x.indexOf("~\uC628|") === 0; });
  return k ? recentSignal(Number(k.slice(3))) : false;
}
function legacySub(subjects) {                       // 옛 구조: 친구 칸 안의 "~푸시|<알림 주소>"
  if (!subjects || typeof subjects !== "object") return null;
  var k = Object.keys(subjects).find(function (x) { return x.indexOf("~\uD478\uC2DC|") === 0; });
  return k ? subFromString(k.slice(4)) : null;
}
async function notifyLegacy(n, env) {
  if (!ROOM_RE.test(n.room || "") || !OLD_ID_RE.test(n.from || "") || !OLD_ID_RE.test(n.to || "") || typeof n.text !== "string" || n.from === n.to) return reply({ ok: false, error: "bad request" }, 400);
  var text = cleanText(n.text);
  if (!text) return reply({ ok: false, error: "empty" }, 400);
  var base = "/rooms/" + n.room + "/members/";
  var got = await Promise.all([dbGet(base + n.from), dbGet(base + n.to + "/subjects")]);
  var me = got[0].v, subjects = got[1].v;
  if (!me || typeof me !== "object" || typeof me.name !== "string") return reply({ ok: false, error: "not a member" }, 403);
  if (legacyViewing(subjects)) return reply({ ok: true, sent: false, skipped: "viewing" });
  var sub = legacySub(subjects);
  if (!sub) return reply({ ok: true, sent: false });
  return sendPush(sub, me.name, text, n.from, env);
}
var worker = {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });
    var url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/notify") return reply({ ok: false, error: "not found" }, 404);
    if (!env.VAPID_PRIVATE_KEY) return reply({ ok: false, error: "no key" }, 500);
    var n;
    try { n = await request.json(); } catch (e) { return reply({ ok: false, error: "bad json" }, 400); }
    if (!n || typeof n !== "object") return reply({ ok: false, error: "bad request" }, 400);
    return typeof n.token === "string" ? notifyV2(n, env) : notifyLegacy(n, env);
  }
};
export { worker as default };
