const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, "public");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".png": "image/png",
  ".mp3": "audio/mpeg",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".ico": "image/x-icon",
};

const server = http.createServer((req, res) => {
  let urlPath = "/";
  try {
    urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  } catch {
    res.writeHead(400);
    return res.end("Bad request");
  }
  if (urlPath === "/healthz") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    return res.end("ok");
  }
  const rel = urlPath === "/" ? "index.html" : urlPath;
  const file = path.normalize(path.join(PUBLIC, rel));
  if (file !== PUBLIC && !file.startsWith(PUBLIC + path.sep)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end("Not found");
    }
    const ext = path.extname(file);
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=300",
    });
    res.end(data);
  });
});

const W = 3200;
const H = 800;
const FLOOR = 760;
const PLATS = [
  { x: 0, y: FLOOR, w: W },
  { x: 20, y: 550, w: 160 },
  { x: 200, y: 650, w: 220 },
  { x: 480, y: 560, w: 200 },
  { x: 220, y: 470, w: 200 },
  { x: 560, y: 380, w: 220 },
  { x: 760, y: 650, w: 260 },
  { x: 900, y: 380, w: 260 },
  { x: 1100, y: 650, w: 200 },
  { x: 1380, y: 560, w: 240 },
  { x: 1120, y: 470, w: 200 },
  { x: 1400, y: 370, w: 240 },
  { x: 1720, y: 280, w: 220 },
  { x: 1700, y: 650, w: 300 },
  { x: 2060, y: 560, w: 200 },
  { x: 2320, y: 470, w: 220 },
  { x: 2000, y: 380, w: 200 },
  { x: 2620, y: 650, w: 260 },
  { x: 2900, y: 560, w: 240 },
  { x: 2660, y: 470, w: 200 },
];
const GRAV = 1800;
const BOX = 32;
const HALF = BOX / 2;
const MAX_PLAYERS = 24;
const SKINS = ["realista", "gunk"];
const FLING_SPEED = 450;
const CARRY_DX = 26;
const CARRY_DY = 20;

const players = new Map();
const boxes = new Map();
let nextPlayerId = 1;
let nextBoxId = 1;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = (v, d = 0) => (typeof v === "number" && isFinite(v) ? v : d);
const cleanName = (s) =>
  String(s || "")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12);
const cleanChat = (s) =>
  String(s || "")
    .replace(/[^\x20-\x7e]/g, "?")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);

function spawnBox(near) {
  const side = Math.random() < 0.5 ? -1 : 1;
  const b = {
    id: nextBoxId++,
    x: clamp(near.x + side * 80, HALF, W - HALF),
    y: 60,
    vx: 0,
    vy: 0,
    r: 0,
    holder: 0,
    owner: near.id,
    sup: false,
    thrower: 0,
    thrownAt: 0,
  };
  boxes.set(b.id, b);
  return b;
}

const wss = new WebSocketServer({ server, maxPayload: 2048 });

function send(ws, obj) {
  if (ws.readyState === 1) ws.send(JSON.stringify(obj));
}
function broadcast(obj) {
  const s = JSON.stringify(obj);
  for (const p of players.values()) if (p.ws.readyState === 1) p.ws.send(s);
}
function sendFling(q, vx, vy, k) {
  q.g = false;
  q.vx = vx;
  q.vy = vy;
  broadcast({ t: "f", id: q.id, vx: Math.round(vx), vy: Math.round(vy), k });
}

function releaseAll(p) {
  if (p.hold) {
    const b = boxes.get(p.hold);
    p.hold = 0;
    if (b) {
      b.holder = 0;
      b.vx = 0;
      b.vy = 0;
    }
  }
  if (p.carry) {
    const q = players.get(p.carry);
    p.carry = 0;
    if (q) {
      q.carriedBy = 0;
      q.struggle = 0;
      sendFling(q, 0, 0, 0);
    }
  }
}

wss.on("connection", (ws) => {
  if (players.size >= MAX_PLAYERS) {
    send(ws, { t: "full" });
    return ws.close();
  }
  const id = nextPlayerId++;
  const p = {
    id,
    ws,
    name: "Realista" + String(Math.floor(Math.random() * 900) + 100),
    skin: "realista",
    x: 1300 + Math.random() * 600,
    y: 200,
    vx: 0,
    vy: 0,
    f: 1,
    g: false,
    ra: false,
    lastPosAt: Date.now(),
    hold: 0,
    carry: 0,
    carriedBy: 0,
    struggle: 0,
    flingUntil: 0,
    lastChat: 0,
    lastAct: 0,
    lastName: 0,
    lastSkin: 0,
    lastStruggle: 0,
  };
  players.set(id, p);
  spawnBox(p);

  send(ws, { t: "w", id, name: p.name, x: p.x, y: p.y, plats: PLATS, W, H });
  ws.isAlive = true;
  ws.on("pong", () => (ws.isAlive = true));

  ws.on("message", (raw) => {
    let m;
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    if (!m || typeof m !== "object") return;
    const now = Date.now();

    if (m.t === "p") {
      if (p.carriedBy) return;
      p.x = clamp(num(m.x, p.x), 16, W - 16);
      p.y = clamp(num(m.y, p.y), 0, FLOOR);
      p.vx = clamp(num(m.vx), -1500, 1500);
      p.vy = clamp(num(m.vy), -2000, 2000);
      p.lastPosAt = now;
      p.f = m.f === -1 ? -1 : 1;
      p.g = !!m.g;
      p.ra = !!m.ra;
    } else if (m.t === "a") {
      if (p.carriedBy || now - p.lastAct < 150) return;
      p.lastAct = now;
      if (p.hold) {
        const b = boxes.get(p.hold);
        p.hold = 0;
        if (b) {
          b.holder = 0;
          b.vx = p.f * 620 + p.vx * 0.4;
          b.vy = -340;
          b.thrower = p.id;
          b.thrownAt = now;
        }
      } else if (p.carry) {
        const q = players.get(p.carry);
        p.carry = 0;
        if (q) {
          q.carriedBy = 0;
          q.struggle = 0;
          sendFling(q, p.f * 620 + p.vx * 0.4, -340, 1);
        }
      } else {
        let best = null;
        let bd = 80;
        for (const b of boxes.values()) {
          if (b.holder) continue;
          const d = Math.hypot(b.x - p.x, b.y - (p.y - 30));
          if (d < bd) {
            bd = d;
            best = b;
          }
        }
        if (best) {
          best.holder = p.id;
          best.thrower = 0;
          p.hold = best.id;
        } else {
          let who = null;
          let wd = 70;
          for (const q of players.values()) {
            if (q === p || q.carriedBy || q.carry || q.hold) continue;
            const d = Math.hypot(q.x - p.x, q.y - p.y);
            if (d < wd) {
              wd = d;
              who = q;
            }
          }
          if (who) {
            p.carry = who.id;
            who.carriedBy = p.id;
            who.struggle = 0;
          }
        }
      }
    } else if (m.t === "d") {
      if (p.carriedBy) return;
      if (p.hold) {
        const b = boxes.get(p.hold);
        p.hold = 0;
        if (b) {
          b.holder = 0;
          b.vx = p.vx * 0.4;
          b.vy = 0;
        }
      } else if (p.carry) {
        const q = players.get(p.carry);
        p.carry = 0;
        if (q) {
          q.carriedBy = 0;
          q.struggle = 0;
          sendFling(q, p.vx * 0.4, 0, 0);
        }
      }
    } else if (m.t === "b") {
      if (!p.carriedBy || now - p.lastStruggle < 100) return;
      p.lastStruggle = now;
      if (++p.struggle >= 5) {
        const c = players.get(p.carriedBy);
        p.carriedBy = 0;
        p.struggle = 0;
        if (c) {
          c.carry = 0;
          sendFling(p, -c.f * 220, -460, 0);
        }
      }
    } else if (m.t === "c") {
      if (now - p.lastChat < 500) return;
      const text = cleanChat(m.m);
      if (!text) return;
      p.lastChat = now;
      broadcast({ t: "c", id: p.id, name: p.name, m: text });
    } else if (m.t === "n") {
      if (now - p.lastName < 300) return;
      const n = cleanName(m.n);
      if (n) {
        p.lastName = now;
        p.name = n;
      }
    } else if (m.t === "k") {
      const k = m.k === "guy" ? "realista" : m.k;
      if (now - p.lastSkin < 100) return;
      if (SKINS.includes(k)) {
        p.lastSkin = now;
        p.skin = k;
      }
    }
  });

  ws.on("close", () => {
    releaseAll(p);
    if (p.carriedBy) {
      const c = players.get(p.carriedBy);
      if (c) c.carry = 0;
    }
    players.delete(id);
    for (const b of [...boxes.values()]) {
      if (b.owner === id) {
        boxes.delete(b.id);
        const h = players.get(b.holder);
        if (h) h.hold = 0;
      } else if (b.holder === id) {
        b.holder = 0;
      }
    }
  });
});

setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 25000);

function settleRot(b, dt) {
  const q = Math.PI / 2;
  const target = Math.round(b.r / q) * q;
  b.r += (target - b.r) * Math.min(1, 14 * dt);
}

function hitPlayer(p, b, now) {
  const bvx = b.vx;
  let vx = clamp(bvx * 0.9, -900, 900);
  if (Math.abs(bvx) < 150) vx = (Math.sign(p.x - b.x) || 1) * 260;
  releaseAll(p);
  p.flingUntil = now + 1200;
  sendFling(p, vx, -420, 1);
  b.vx *= 0.35;
  b.vy *= 0.3;
}

function simIdle(p, dt) {
  if (p.g) {
    const f = 1400 * dt;
    p.vx = Math.abs(p.vx) <= f ? 0 : p.vx - Math.sign(p.vx) * f;
  }
  p.x += p.vx * dt;
  if (p.x < 16) {
    p.x = 16;
    p.vx = 0;
  } else if (p.x > W - 16) {
    p.x = W - 16;
    p.vx = 0;
  }
  const prevY = p.y;
  p.vy += GRAV * dt;
  p.y += p.vy * dt;
  p.g = false;
  for (const pl of PLATS) {
    if (p.vy >= 0 && prevY <= pl.y + 0.5 && p.y >= pl.y && p.x + 13 > pl.x && p.x - 13 < pl.x + pl.w) {
      p.y = pl.y;
      p.vy = 0;
      p.g = true;
    }
  }
  p.y = clamp(p.y, 0, FLOOR);
  p.ra = false;
}

function step(dt) {
  const now = Date.now();

  for (const p of players.values()) {
    if (!p.carriedBy && now - p.lastPosAt > 400) simIdle(p, dt);
  }

  for (const p of players.values()) {
    if (!p.carry) continue;
    const q = players.get(p.carry);
    if (!q) {
      p.carry = 0;
      continue;
    }
    q.x = p.x + p.f * CARRY_DX;
    q.y = p.y - CARRY_DY;
    q.vx = 0;
    q.f = p.f;
    q.g = false;
  }

  const free = [];
  for (const b of boxes.values()) {
    if (b.holder) {
      const p = players.get(b.holder);
      if (!p) {
        b.holder = 0;
      } else {
        b.x = p.x + p.f * 36;
        b.y = p.y - 32;
        b.vx = b.vy = 0;
        settleRot(b, dt);
        continue;
      }
    }
    free.push(b);
    b.sup = false;
    b.vy += GRAV * dt;
    const prevBottom = b.y + HALF;
    b.x += b.vx * dt;
    b.y += b.vy * dt;

    if (b.x < HALF) {
      b.x = HALF;
      b.vx = Math.abs(b.vx) > 150 ? -b.vx * 0.3 : 0;
    } else if (b.x > W - HALF) {
      b.x = W - HALF;
      b.vx = Math.abs(b.vx) > 150 ? -b.vx * 0.3 : 0;
    }
    if (b.y < HALF) {
      b.y = HALF;
      b.vy = Math.abs(b.vy) * 0.3;
    }
    for (const pl of PLATS) {
      if (
        b.vy >= 0 &&
        prevBottom <= pl.y + 1 &&
        b.y + HALF >= pl.y &&
        b.x + HALF > pl.x &&
        b.x - HALF < pl.x + pl.w
      ) {
        b.y = pl.y - HALF;
        if (b.vy > 200) b.vy = -b.vy * 0.3;
        else {
          b.vy = 0;
          b.sup = true;
        }
      }
    }
  }

  for (const b of free) {
    if (Math.hypot(b.vx, b.vy) < FLING_SPEED) continue;
    for (const p of players.values()) {
      if (p.carriedBy || p.flingUntil > now) continue;
      if (b.thrower === p.id && now - b.thrownAt < 500) continue;
      if (Math.abs(b.x - p.x) < 13 + HALF && Math.abs(b.y - (p.y - 29)) < 29 + HALF) {
        hitPlayer(p, b, now);
        break;
      }
    }
  }

  for (const p of players.values()) {
    if (Math.abs(p.vx) < 20 || p.carriedBy) continue;
    const dir = Math.sign(p.vx);
    for (const b of free) {
      if (Math.hypot(b.vx, b.vy) > 300) continue;
      if (Math.abs(b.x - p.x) < 13 + HALF && Math.abs(b.y - (p.y - 29)) < 29 + HALF && Math.sign(b.x - p.x) === dir) {
        b.vx = p.vx * 1.15;
        b.x = clamp(p.x + dir * (13 + HALF), HALF, W - HALF);
      }
    }
  }

  for (let i = 0; i < free.length; i++) {
    for (let j = i + 1; j < free.length; j++) {
      const a = free[i];
      const c = free[j];
      const dx = c.x - a.x;
      const dy = c.y - a.y;
      const ox = BOX - Math.abs(dx);
      const oy = BOX - Math.abs(dy);
      if (ox <= 0 || oy <= 0) continue;
      if (ox < oy) {
        const s = Math.sign(dx) || 1;
        a.x -= (s * ox) / 2;
        c.x += (s * ox) / 2;
        const va = a.vx;
        a.vx = c.vx * 0.7;
        c.vx = va * 0.7;
      } else {
        const top = a.y < c.y ? a : c;
        const bot = top === a ? c : a;
        top.y -= oy;
        if (top.vy > 0) top.vy = 0;
        top.sup = true;
        top.vx += (bot.vx - top.vx) * 0.2;
      }
    }
  }

  for (const b of free) {
    if (b.sup) {
      const f = 1400 * dt;
      b.vx = Math.abs(b.vx) <= f ? 0 : b.vx - Math.sign(b.vx) * f;
      settleRot(b, dt);
    } else {
      b.r += b.vx * 0.006 * dt;
    }
  }
}

let last = Date.now();
let tick = 0;
setInterval(() => {
  const now = Date.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  step(dt);
  if (++tick % 2 === 0 && players.size) {
    broadcast({
      t: "s",
      p: [...players.values()].map((p) => [
        p.id,
        p.name,
        Math.round(p.x),
        Math.round(p.y),
        Math.round(p.vx),
        p.f,
        p.g ? 1 : 0,
        p.ra ? 1 : 0,
        p.hold,
        p.carry,
        p.skin,
      ]),
      b: [...boxes.values()].map((b) => [
        b.id,
        Math.round(b.x * 10) / 10,
        Math.round(b.y * 10) / 10,
        Math.round(b.r * 100) / 100,
        b.holder,
      ]),
    });
  }
}, 1000 / 60);

server.listen(PORT, () => console.log("Realista Party running on port " + PORT));
