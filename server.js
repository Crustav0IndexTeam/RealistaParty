// Pixel Box Party - tiny multiplayer server (Node + ws, no other dependencies)
const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, "public");

// ---------- static files ----------
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".png": "image/png",
  ".js": "text/javascript",
  ".css": "text/css",
  ".ico": "image/x-icon",
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (urlPath === "/healthz") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    return res.end("ok");
  }
  const rel = urlPath === "/" ? "index.html" : urlPath;
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end("Not found");
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(data);
  });
});

// ---------- world ----------
const W = 960;
const H = 540;
const PLATS = [
  { x: 0, y: 500, w: 960 }, // floor
  { x: 130, y: 390, w: 220 },
  { x: 610, y: 390, w: 220 },
  { x: 370, y: 280, w: 220 },
];
const GRAV = 1800;
const BOX = 32; // box size in world units
const HALF = BOX / 2;
const MAX_PLAYERS = 24;

const players = new Map();
const boxes = new Map();
let nextPlayerId = 1;
let nextBoxId = 1;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = (v, d = 0) => (typeof v === "number" && isFinite(v) ? v : d);

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
  };
  boxes.set(b.id, b);
  return b;
}

// ---------- connections ----------
const wss = new WebSocketServer({ server, maxPayload: 2048 });

function send(ws, obj) {
  if (ws.readyState === 1) ws.send(JSON.stringify(obj));
}
function broadcast(obj) {
  const s = JSON.stringify(obj);
  for (const p of players.values()) if (p.ws.readyState === 1) p.ws.send(s);
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
    name: "Guy" + String(Math.floor(Math.random() * 900) + 100),
    x: 100 + Math.random() * (W - 200),
    y: 100,
    vx: 0,
    f: 1,
    g: false,
    ra: false,
    hold: 0,
    lastChat: 0,
    lastAct: 0,
  };
  players.set(id, p);
  spawnBox(p); // every player gets at least one box

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

    if (m.t === "p") {
      p.x = clamp(num(m.x, p.x), 16, W - 16);
      p.y = clamp(num(m.y, p.y), 0, 500);
      p.vx = clamp(num(m.vx), -400, 400);
      p.f = m.f === -1 ? -1 : 1;
      p.g = !!m.g;
      p.ra = !!m.ra;
    } else if (m.t === "a") {
      const now = Date.now();
      if (now - p.lastAct < 150) return;
      p.lastAct = now;
      if (p.hold) {
        // throw
        const b = boxes.get(p.hold);
        p.hold = 0;
        if (b) {
          b.holder = 0;
          b.vx = p.f * 620 + p.vx * 0.4;
          b.vy = -340;
        }
      } else {
        // grab nearest free box in reach
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
          p.hold = best.id;
        }
      }
    } else if (m.t === "d") {
      if (p.hold) {
        const b = boxes.get(p.hold);
        p.hold = 0;
        if (b) {
          b.holder = 0;
          b.vx = p.vx * 0.4;
          b.vy = 0;
        }
      }
    } else if (m.t === "c") {
      const now = Date.now();
      if (now - p.lastChat < 500) return;
      let text = String(m.m || "")
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .trim()
        .slice(0, 100);
      if (!text) return;
      p.lastChat = now;
      broadcast({ t: "c", id: p.id, name: p.name, m: text });
    }
  });

  ws.on("close", () => {
    players.delete(id);
    // remove this player's boxes; free anyone holding them
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

// keep connections alive / drop dead ones
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

// ---------- physics ----------
function settleRot(b, dt) {
  const q = Math.PI / 2;
  const target = Math.round(b.r / q) * q;
  b.r += (target - b.r) * Math.min(1, 14 * dt);
}

function step(dt) {
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

  // players shove boxes by walking into them
  for (const p of players.values()) {
    if (Math.abs(p.vx) < 20) continue;
    const dir = Math.sign(p.vx);
    for (const b of free) {
      if (Math.abs(b.x - p.x) < 13 + HALF && Math.abs(b.y - (p.y - 29)) < 29 + HALF && Math.sign(b.x - p.x) === dir) {
        b.vx = p.vx * 1.15;
        b.x = p.x + dir * (13 + HALF);
      }
    }
  }

  // box vs box
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

  // friction + rotation
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

server.listen(PORT, () => console.log("Pixel Box Party running on port " + PORT));
