/**
 * Neon Bay — top-down open-world crime game
 * Static, offline, keyboard + mouse. Original setting (not Rockstar IP).
 */
const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");
const mm = document.getElementById("mm");
const mctx = mm.getContext("2d");
const hud = document.getElementById("hud");
const banner = document.getElementById("banner");
const startBtn = document.getElementById("start");
const titleWrap = document.getElementById("titlewrap");

let W = 0, H = 0, running = false, t0 = 0;
const WORLD = 3600;
const rnd = (a, b) => a + Math.random() * (b - a);

function resize() {
  W = canvas.width = Math.min(1280, window.innerWidth);
  H = canvas.height = Math.min(720, window.innerHeight);
}
window.addEventListener("resize", resize);
resize();

// --- world generation ---
const roads = [];
for (let i = 0; i < 9; i++) {
  roads.push({ x: 180 + i * 380, y: 0, w: 90, h: WORLD });
  roads.push({ x: 0, y: 180 + i * 380, w: WORLD, h: 90 });
}
const buildings = [];
for (let i = 0; i < 90; i++) {
  const x = rnd(40, WORLD - 140), y = rnd(40, WORLD - 140);
  const w = rnd(48, 110), h = rnd(48, 130);
  const hit = roads.some((r) => x < r.x + r.w && x + w > r.x && y < r.y + r.h && y + h > r.y);
  if (!hit) buildings.push({ x, y, w, h, c: `hsl(${210 + rnd(0, 50)},35%,${16 + rnd(0, 14)}%)` });
}

// --- entities ---
const player = {
  x: WORLD * 0.5, y: WORLD * 0.5, a: 0, hp: 100, wanted: 0, cash: 0, score: 0, inCar: null,
};
const keys = Object.create(null);
const mouse = { x: 0, y: 0 };
window.addEventListener("keydown", (e) => { keys[e.key.toLowerCase()] = true; if ([" ","e","f"].includes(e.key.toLowerCase())) e.preventDefault(); });
window.addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; });
canvas.addEventListener("mousemove", (e) => {
  const r = canvas.getBoundingClientRect();
  mouse.x = (e.clientX - r.left) * (W / r.width);
  mouse.y = (e.clientY - r.top) * (H / r.height);
});

const cars = [];
for (let i = 0; i < 22; i++) {
  const r = roads[(Math.random() * roads.length) | 0];
  cars.push({
    x: r.x + rnd(10, Math.max(20, r.w - 20)),
    y: r.y + rnd(10, Math.max(20, r.h - 20)),
    a: r.w > r.h ? (Math.random() < 0.5 ? 0 : Math.PI) : (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2),
    spd: rnd(1.1, 2.4),
    color: `hsl(${rnd(0, 360)},65%,48%)`,
  });
}
const peds = [];
for (let i = 0; i < 55; i++) {
  peds.push({ x: rnd(0, WORLD), y: rnd(0, WORLD), a: rnd(0, Math.PI * 2), spd: rnd(0.35, 0.7), c: `hsl(${rnd(20, 50)},45%,${rnd(40, 65)}%)` });
}
const cops = [];
function spawnCop() {
  const ang = rnd(0, Math.PI * 2), d = rnd(550, 900);
  cops.push({ x: player.x + Math.cos(ang) * d, y: player.y + Math.sin(ang) * d, a: 0, spd: 2.35, hp: 45, dead: false });
}

const missions = [
  { text: "Steal a car (press E near a vehicle)", ok: () => !!player.inCar, pay: 250 },
  { text: "Drive to the north waterfront (top of map)", ok: () => player.y < 280, pay: 350 },
  { text: "Reach wanted level ★★ then escape the heat", ok: () => player.wanted >= 2 && cops.filter((c) => !c.dead).every((c) => Math.hypot(c.x - player.x, c.y - player.y) > 520), pay: 600 },
  { text: "Bank $1500 total cash", ok: () => player.cash >= 1500, pay: 500 },
];
let mission = 0, toastT = 0, punches = [];

function toast(msg, t = 160) { banner.style.display = "block"; banner.textContent = msg; toastT = t; }
function save() {
  try { localStorage.setItem("neonbay_v1", JSON.stringify({ x: player.x, y: player.y, cash: player.cash, score: player.score, mission, wanted: player.wanted, hp: player.hp })); } catch {}
}
function load() {
  try {
    const d = JSON.parse(localStorage.getItem("neonbay_v1") || "null");
    if (d) { Object.assign(player, d); mission = d.mission || 0; }
  } catch {}
}

function attack() {
  const px = player.x + Math.cos(player.a) * 30;
  const py = player.y + Math.sin(player.a) * 30;
  punches.push({ x: px, y: py, life: 12 });
  for (const p of peds) {
    if (Math.hypot(p.x - px, p.y - py) < 32) {
      p.x += Math.cos(player.a) * 50; p.y += Math.sin(player.a) * 50;
      player.cash += 25; player.wanted = Math.min(5, player.wanted + 0.35);
    }
  }
  for (const c of cops) {
    if (c.dead) continue;
    if (Math.hypot(c.x - px, c.y - py) < 36) {
      c.hp -= 28; player.wanted = Math.min(5, player.wanted + 0.55);
      if (c.hp <= 0) { c.dead = true; player.cash += 120; }
    }
  }
}

function update() {
  if (!running) return;
  // aim toward mouse in world space
  const camX = player.x - W / 2, camY = player.y - H / 2;
  const wx = mouse.x + camX, wy = mouse.y + camY;
  if (!player.inCar) player.a = Math.atan2(wy - player.y, wx - player.x);

  let thr = 0;
  if (keys["w"] || keys["arrowup"]) thr += 1;
  if (keys["s"] || keys["arrowdown"]) thr -= 0.55;
  if (keys["a"] || keys["arrowleft"]) player.a -= player.inCar ? 0.045 : 0.07;
  if (keys["d"] || keys["arrowright"]) player.a += player.inCar ? 0.045 : 0.07;
  const spd = player.inCar ? 5.2 : 2.35;
  player.x = Math.max(24, Math.min(WORLD - 24, player.x + Math.cos(player.a) * thr * spd));
  player.y = Math.max(24, Math.min(WORLD - 24, player.y + Math.sin(player.a) * thr * spd));
  if (player.inCar) { player.inCar.x = player.x; player.inCar.y = player.y; player.inCar.a = player.a; }

  if (keys[" "]) { keys[" "] = false; attack(); }
  if (keys["e"]) {
    keys["e"] = false;
    if (player.inCar) player.inCar = null;
    else {
      for (const car of cars) {
        if (Math.hypot(car.x - player.x, car.y - player.y) < 52) {
          player.inCar = car; player.wanted = Math.min(5, player.wanted + 1.1);
          toast("Car stolen! Wanted level up.");
          break;
        }
      }
    }
  }

  for (const car of cars) {
    if (car === player.inCar) continue;
    car.x += Math.cos(car.a) * car.spd;
    car.y += Math.sin(car.a) * car.spd;
    if (car.x < 0 || car.x > WORLD || car.y < 0 || car.y > WORLD) {
      car.a += Math.PI * 0.5 * (Math.random() < 0.5 ? 1 : -1);
      car.x = Math.max(0, Math.min(WORLD, car.x));
      car.y = Math.max(0, Math.min(WORLD, car.y));
    }
  }
  for (const p of peds) {
    p.a += (Math.random() - 0.5) * 0.12;
    p.x = (p.x + Math.cos(p.a) * p.spd + WORLD) % WORLD;
    p.y = (p.y + Math.sin(p.a) * p.spd + WORLD) % WORLD;
  }
  for (const c of cops) {
    if (c.dead) continue;
    const dx = player.x - c.x, dy = player.y - c.y;
    c.a = Math.atan2(dy, dx);
    c.x += Math.cos(c.a) * c.spd;
    c.y += Math.sin(c.a) * c.spd;
    if (Math.hypot(dx, dy) < 30) {
      player.hp -= 0.55;
      if (player.hp <= 0) {
        player.hp = 100; player.x = WORLD / 2; player.y = WORLD / 2; player.wanted = 0;
        player.cash = Math.max(0, player.cash - 200); player.inCar = null; cops.length = 0;
        toast("Wasted — respawned at city center.");
      }
    }
  }
  for (let i = cops.length - 1; i >= 0; i--) if (cops[i].dead) cops.splice(i, 1);

  if (player.wanted > 0 && Math.random() < 0.0018) player.wanted = Math.max(0, player.wanted - 0.08);
  while (cops.filter((c) => !c.dead).length < Math.floor(player.wanted) && player.wanted >= 1) spawnCop();

  if (mission < missions.length && missions[mission].ok()) {
    player.cash += missions[mission].pay;
    player.score += missions[mission].pay;
    toast(`Mission complete! +$${missions[mission].pay}`);
    mission++;
    save();
  }
  punches = punches.filter((p) => --p.life > 0);
  if (toastT > 0) { toastT--; if (toastT === 0) banner.style.display = "none"; }
  player.score = Math.max(player.score, player.cash);
}

function draw() {
  const camX = player.x - W / 2, camY = player.y - H / 2;
  ctx.fillStyle = "#0e1430";
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(-camX, -camY);

  ctx.fillStyle = "#25253a";
  for (const r of roads) ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = "#666";
  ctx.setLineDash([18, 16]);
  ctx.lineWidth = 2;
  for (const r of roads) {
    ctx.beginPath();
    if (r.w > r.h) { ctx.moveTo(r.x, r.y + r.h / 2); ctx.lineTo(r.x + r.w, r.y + r.h / 2); }
    else { ctx.moveTo(r.x + r.w / 2, r.y); ctx.lineTo(r.x + r.w / 2, r.y + r.h); }
    ctx.stroke();
  }
  ctx.setLineDash([]);

  for (const b of buildings) {
    ctx.fillStyle = b.c;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = "rgba(255,210,90,0.12)";
    ctx.fillRect(b.x + 6, b.y + 8, b.w - 12, 10);
  }
  for (const p of peds) {
    ctx.fillStyle = p.c;
    ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2); ctx.fill();
  }
  for (const car of cars) {
    ctx.save();
    ctx.translate(car.x, car.y); ctx.rotate(car.a);
    ctx.fillStyle = car.color;
    ctx.fillRect(-20, -11, 40, 22);
    ctx.fillStyle = "#111"; ctx.fillRect(8, -8, 9, 16);
    ctx.restore();
  }
  for (const c of cops) {
    if (c.dead) continue;
    ctx.save();
    ctx.translate(c.x, c.y); ctx.rotate(c.a);
    ctx.fillStyle = "#1a3a9a"; ctx.fillRect(-17, -10, 34, 20);
    ctx.fillStyle = "#ffcc00"; ctx.fillRect(9, -7, 7, 14);
    ctx.restore();
  }
  if (!player.inCar) {
    ctx.save();
    ctx.translate(player.x, player.y); ctx.rotate(player.a);
    ctx.fillStyle = "#3cf";
    ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.fillRect(5, -5, 12, 10);
    ctx.restore();
  }
  ctx.fillStyle = "rgba(255,190,40,0.75)";
  for (const p of punches) { ctx.beginPath(); ctx.arc(p.x, p.y, 15, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();

  if (running) {
    hud.style.display = "block";
    const stars = "★".repeat(Math.floor(player.wanted)) + "☆".repeat(5 - Math.floor(player.wanted));
    hud.innerHTML = `HP ${Math.max(0, player.hp) | 0}<br>Cash $${player.cash | 0}<br>Wanted ${stars}<br>${player.inCar ? "VEHICLE" : "ON FOOT"}`;
    if (toastT <= 0) {
      banner.style.display = "block";
      banner.textContent = mission < missions.length ? "Mission: " + missions[mission].text : "All missions clear — explore Neon Bay";
    }
    mctx.fillStyle = "#0a0a14"; mctx.fillRect(0, 0, 132, 132);
    const s = 132 / WORLD;
    mctx.fillStyle = "#333";
    for (const r of roads) mctx.fillRect(r.x * s, r.y * s, Math.max(2, r.w * s), Math.max(2, r.h * s));
    mctx.fillStyle = "#3cf"; mctx.beginPath(); mctx.arc(player.x * s, player.y * s, 3, 0, Math.PI * 2); mctx.fill();
    mctx.fillStyle = "#48f";
    for (const c of cops) if (!c.dead) { mctx.beginPath(); mctx.arc(c.x * s, c.y * s, 2.2, 0, Math.PI * 2); mctx.fill(); }
  }
}

function loop(t) {
  if (!t0) t0 = t;
  update();
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

startBtn.onclick = () => {
  running = true;
  startBtn.style.display = "none";
  titleWrap.style.display = "none";
  load();
  toast(mission < missions.length ? "Mission: " + missions[mission].text : "Explore freely");
  save();
};
