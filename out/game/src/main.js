// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the display's
// rate. Saltwind Dockyard — a round-based tactical FPS: Night Tide (attackers, the
// player's team) plants the beacon at A or B against Harbor Watch; rounds pay for
// kills, wins, losses and plants, and the buy menu spends it between rounds.
// ?shot=start|buy|play|end with &seed=N sets up a deterministic frame for a capture,
// renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createMap } from './map.js';
import { WEAPONS, ARMOR, ECONOMY, damageAtRange, createViewModel } from './weapons.js';
import { createBots } from './bots.js';
import { createMatch, BUY_SECONDS, ROUND_SECONDS, BOMB_SECONDS } from './rounds.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createPlayer } from './player.js';
import { createInput } from './input.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.sky), 24, 70);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const map = createMap(scene);
const bots = createBots(scene, map);
const hud = createHud();
const audio = createAudio();
const player = createPlayer(map.colliders);
const input = createInput(renderer.domElement, onLockChange);
const raycaster = new THREE.Raycaster();
const direction = new THREE.Vector3();
const tracerPool = [];

// ---- Player combat state (the movement body lives in player.js). ----
const playerCombat = {
  isPlayer: true,
  team: 'ally',
  name: 'You',
  position: player.state.position,
  velocity: player.state.velocity,
  hp: 100,
  armor: 0,
  money: ECONOMY.startMoney,
  weaponId: 'p9',
  alive: true,
};
let viewModel = createViewModel(camera, 'p9');

// ---- The planted beacon: a small blinking box that appears on plant. ----
const beacon = new THREE.Group();
const beaconBox = new THREE.Mesh(
  new THREE.BoxGeometry(0.42, 0.3, 0.42),
  new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.4, metalness: 0.3 }),
);
beaconBox.position.y = 0.15;
const beaconLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 9);
beaconLight.position.y = 0.6;
beacon.add(beaconBox, beaconLight);
beacon.visible = false;
scene.add(beacon);

function combatants() {
  const list = [playerCombat];
  for (const bot of bots.bots) list.push(bot);
  return list;
}

// ---- Tracers: short-lived lines from muzzle to impact. ----
function makeTracer() {
  const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const material = new THREE.LineBasicMaterial({ color: 0xffc27a, transparent: true, opacity: 0 });
  const line = new THREE.Line(geometry, material);
  line.visible = false;
  scene.add(line);
  return { line, life: 0 };
}
for (let i = 0; i < 16; i += 1) tracerPool.push(makeTracer());
function tracer(from, to, team) {
  const slot = tracerPool.find((entry) => entry.life <= 0) ?? tracerPool[0];
  slot.line.geometry.setFromPoints([from, to]);
  slot.line.material.color.set(team === 'enemy' ? 0xff7a5c : 0xffc27a);
  slot.line.visible = true;
  slot.life = 0.12;
}
function stepTracers(dt) {
  for (const slot of tracerPool) {
    if (slot.life <= 0) continue;
    slot.life -= dt;
    slot.line.material.opacity = Math.max(0, slot.life / 0.12) * 0.85;
    if (slot.life <= 0) slot.line.visible = false;
  }
}

// ---- Match wiring. ----
let plantProgress = 0;
let plantingSite = null;
let elapsed = 0;
let frozen = false;
let started = false;
let accumulator = 0;
let lastTime = performance.now();
let rosterLeft = 0;

const match = createMatch({
  onPhase() {
    const state = match.state;
    if (state.phase === 'buy') {
      startRoundSetup();
      hud.banner(`Round ${state.round}`, 'Buy up — press B for the shop', 3000);
    } else if (state.phase === 'live') {
      hud.banner('Plant the beacon', 'A — Crane Yard · B — Warehouse', 2600);
    } else if (state.phase === 'planted') {
      const site = map.sites[state.plantedSite];
      beacon.position.set(site.center.x, 0, site.center.z);
      beacon.visible = true;
      hud.banner('Beacon planted', `${site.name} — ${BOMB_SECONDS}s to detonation`, 3000);
      audio.plantDone();
    }
    syncHud();
  },
  onRoundEnd(state, pays) {
    const won = state.winner === 'ally';
    const pay = won ? pays.winPay : pays.lossPayAlly;
    playerCombat.money += pay;
    hud.banner(
      won ? 'Round won' : 'Round lost',
      `${state.reason} · ${won ? '+' : '+'}$${pay}`,
      3400,
    );
    audio.roundEnd(won);
    beacon.visible = false;
    syncHud();
  },
  onMatchEnd(state) {
    const won = state.scoreAlly > state.scoreEnemy;
    overlayMode = 'end';
    hud.showOverlay('start', 0);
    document.getElementById('overlay-title').textContent = won ? 'Night Tide takes the yard' : 'Harbor Watch holds the yard';
    document.getElementById('overlay-copy').textContent = `Final score ${state.scoreAlly} — ${state.scoreEnemy}. ${won ? 'The beacon did its work.' : 'The yard stays theirs — run it back.'}`;
    document.getElementById('play').textContent = 'Play again';
    if (document.pointerLockElement) document.exitPointerLock();
  },
});

let overlayMode = 'start';
hud.onPlay(() => {
  if (shot) return;
  if (overlayMode === 'end') {
    match.reset();
    overlayMode = 'start';
  }
  audio.unlock();
  input.requestLock();
});

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
    hud.hideBuy();
  } else if (match.state.phase !== 'over' && playerCombat.alive) {
    hud.showOverlay(started ? 'paused' : 'start', 0);
  }
}

function startRoundSetup() {
  // Fresh round: bots back at spawn with fresh kit, the player healed and re-armed
  // if they died (death costs the rifle and the vest, as it should).
  bots.resetRound(match.state.round, random);
  if (!playerCombat.alive) {
    playerCombat.alive = true;
    playerCombat.hp = 100;
    playerCombat.armor = 0;
    playerCombat.weaponId = 'p9';
    swapWeapon('p9');
  } else {
    playerCombat.hp = 100;
    viewModel.refill();
  }
  const spawn = map.spawns.ally[1];
  player.state.position.set(spawn[0], 0, spawn[1]);
  player.state.velocity.set(0, 0, 0);
  player.state.yaw = Math.PI;
  player.state.pitch = 0;
  plantProgress = 0;
  plantingSite = null;
  hud.channel(null, 0);
  syncHud();
}

function swapWeapon(weaponId) {
  if (viewModel) viewModel.dispose();
  viewModel = createViewModel(camera, weaponId);
  playerCombat.weaponId = weaponId;
  hud.setAmmo(viewModel.state.mag, viewModel.state.reserve, weaponId);
}

function buyWeapon(weaponId) {
  const weapon = WEAPONS[weaponId];
  if (match.state.phase !== 'buy' || !playerCombat.alive) return;
  if (playerCombat.weaponId === weaponId || playerCombat.money < weapon.price) return;
  playerCombat.money -= weapon.price;
  swapWeapon(weaponId);
  hud.showBuy(match.state.round, playerCombat.money, playerCombat.weaponId, playerCombat.armor > 0);
  syncHud();
}

function buyArmor() {
  if (match.state.phase !== 'buy' || !playerCombat.alive) return;
  if (playerCombat.armor > 0 || playerCombat.money < ARMOR.price) return;
  playerCombat.money -= ARMOR.price;
  playerCombat.armor = 100;
  hud.showBuy(match.state.round, playerCombat.money, playerCombat.weaponId, true);
  syncHud();
}

function syncCamera() {
  camera.position.set(player.state.position.x, player.state.position.y + player.state.eye, player.state.position.z);
  camera.rotation.set(player.state.pitch, player.state.yaw, 0, 'YXZ');
}

function aimAt(point) {
  const body = player.state;
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function syncHud() {
  const state = match.state;
  hud.setAmmo(viewModel.state.mag, viewModel.state.reserve, playerCombat.weaponId);
  hud.setVitals(playerCombat.hp, playerCombat.armor, playerCombat.money);
  hud.setScores(state.scoreAlly, state.scoreEnemy);
  hud.setClock(state.phase === 'planted' ? state.bombLeft : state.phaseLeft, state.phase === 'planted');
  const allies = [{ name: 'You', alive: playerCombat.alive, you: true }]
    .concat(bots.bots.filter((bot) => bot.team === 'ally').map((bot) => ({ name: bot.name, alive: bot.alive })));
  const enemies = bots.bots.filter((bot) => bot.team === 'enemy').map((bot) => ({ name: bot.name, alive: bot.alive }));
  hud.setRosters(allies, enemies);
}

// ---- Damage: one path for every shooter, player or bot. ----
function applyDamage(target, amount, attacker, part) {
  if (!target.alive) return;
  if (target.isPlayer) {
    target.hp -= amount;
    audio.hurt();
    if (target.hp <= 0) {
      target.hp = 0;
      target.alive = false;
      plantProgress = 0;
      hud.channel(null, 0);
      if (document.pointerLockElement) document.exitPointerLock();
      hud.showOverlay('dead', 0);
      passCarrier();
      if (bots.aliveCount('ally') === 0) checkElimination();
    }
  } else {
    bots.markDamaged(target, elapsed);
    const killed = bots.damage(target, amount);
    if (killed) {
      const headshot = part === 'head';
      hud.killFeed(attacker.isPlayer ? 'You' : attacker.name, target.name, attacker.team, headshot);
      if (attacker.isPlayer) {
        playerCombat.money += ECONOMY.killReward;
        hud.setVitals(playerCombat.hp, playerCombat.armor, playerCombat.money);
      }
      if (target.carrier) passCarrier();
      checkElimination();
    }
  }
  syncHud();
}

function passCarrier() {
  const next = bots.bots.find((bot) => bot.team === 'ally' && bot.alive);
  if (next) {
    for (const bot of bots.bots) bot.carrier = false;
    next.carrier = true;
  }
}

function checkElimination() {
  const state = match.state;
  if (state.phase !== 'live' && state.phase !== 'planted') return;
  if (bots.aliveCount('enemy') === 0) {
    match.endRound('ally', 'Harbor Watch cleared');
  } else if (bots.aliveCount('ally') === 0 && !playerCombat.alive) {
    match.endRound('enemy', state.phase === 'planted' ? 'Defenders cleared — beacon fizzles' : 'Night Tide cleared');
  }
}

// ---- The player's shot: hitscan against the world and the bots. ----
function shoot(spread) {
  if (!viewModel.takeRound()) return false;
  camera.getWorldDirection(direction);
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, direction);
  raycaster.far = WEAPONS[playerCombat.weaponId].range;
  const shootables = map.shootables.concat(bots.hitMeshes);
  const hit = raycaster.intersectObjects(shootables, false)[0];
  const muzzle = camera.position.clone().addScaledVector(direction, 0.6);
  if (hit) {
    tracer(muzzle, hit.point, 'ally');
    const bot = hit.object.userData.bot;
    if (bot && bot.alive) {
      const weapon = WEAPONS[playerCombat.weaponId];
      const damage = damageAtRange(weapon, hit.distance, hit.object.userData.part);
      let finalDamage = damage;
      if (bot.armor > 0) {
        const absorbed = Math.min(bot.armor, damage * 0.5);
        bot.armor -= absorbed;
        finalDamage -= absorbed;
      }
      const killed = hit.object.userData.part === 'head' && bot.hp - finalDamage <= 0;
      applyDamage(bot, finalDamage, playerCombat, hit.object.userData.part);
      hud.hitMarker(killed, shot ? 4000 : 90);
      audio.hit(killed);
    }
  } else {
    tracer(muzzle, camera.position.clone().addScaledVector(direction, 40), 'ally');
  }
  viewModel.pullTrigger();
  audio.shot(playerCombat.weaponId);
  player.recoil(0.009 + random() * 0.004, (random() * 2 - 1) * 0.004);
  hud.setAmmo(viewModel.state.mag, viewModel.state.reserve, playerCombat.weaponId);
  return true;
}

// ---- Bot combat context: what the bot AI may call back into. ----
const botCtx = {
  get time() { return elapsed; },
  get phase() { return match.state.phase; },
  get plantedSite() { return match.state.plantedSite; },
  get combatants() { return combatants(); },
  applyDamage(target, amount, attacker, part) {
    applyDamage(target, amount, attacker, part);
  },
  tracer(from, to, team) {
    tracer(from, to, team);
  },
  gunshot(from) {
    if (from.distanceTo(camera.position) < 45) audio.distantShot();
  },
  channelProgress(bot, progress) {
    if (bot.team === 'enemy' && bot.channel?.kind === 'defuse') {
      hud.channel('Harbor Watch is defusing…', progress);
    }
  },
  onPlanted(site, bot) {
    playerCombat.money += ECONOMY.plantReward;
    match.plant(site);
  },
  onDefused() {
    beacon.visible = false;
    hud.channel(null, 0);
    match.endRound('enemy', 'Beacon defused');
  },
};

function step(dt) {
  elapsed += dt;
  const state = match.state;
  match.tick(dt);
  if ((state.phase === 'live' || state.phase === 'planted') && !shot) {
    bots.update(dt, botCtx, random);
  }
  if (playerCombat.alive) player.step(dt, input.state.keys);
  viewModel.step(dt);
  stepTracers(dt);

  // Planting: hold E inside a site while alive, during the live phase.
  const inPlantPhase = state.phase === 'live' && playerCombat.alive;
  if (inPlantPhase && input.state.keys.has('KeyE')) {
    const siteKey = map.inSite(player.state.position, map.sites.A) ? 'A'
      : map.inSite(player.state.position, map.sites.B) ? 'B' : null;
    if (siteKey) {
      if (plantingSite !== siteKey) {
        plantingSite = siteKey;
        plantProgress = 0;
      }
      plantProgress += dt / 3.0;
      hud.channel(`Planting beacon at ${siteKey}…`, plantProgress);
      if (plantProgress >= 1) {
        hud.channel(null, 0);
        plantProgress = 0;
        plantingSite = null;
        playerCombat.money += ECONOMY.plantReward;
        match.plant(siteKey);
      }
    } else {
      plantingSite = null;
      plantProgress = 0;
      hud.channel(null, 0);
    }
  } else if (plantProgress > 0) {
    plantProgress = 0;
    plantingSite = null;
    if (!botCtx.channelProgress) hud.channel(null, 0);
    else hud.channel(null, 0);
  }

  // Buy keys, only during the buy phase.
  if (state.phase === 'buy' && playerCombat.alive) {
    for (const weapon of Object.values(WEAPONS)) {
      if (input.state.keys.has(`Digit${weapon.key}`)) buyWeapon(weapon.id);
    }
    if (input.state.keys.has('Digit5')) buyArmor();
  }

  // Rosters and the clock, a few times a second.
  rosterLeft -= dt;
  if (rosterLeft <= 0) {
    rosterLeft = 0.25;
    syncHud();
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    if (playerCombat.alive) player.look(look.x, look.y);
    if (input.state.firing && playerCombat.alive && viewModel.ready()) {
      shoot(shot ? 0 : viewModel.spread(player.groundSpeed()));
    }
    if (input.state.keys.has('KeyR')) viewModel.reload();
    if (input.state.keys.has('KeyB') && !frame.bPressed) {
      frame.bPressed = true;
      if (hud.buyVisible()) hud.hideBuy();
      else if (match.state.phase === 'buy') hud.showBuy(match.state.round, playerCombat.money, playerCombat.weaponId, playerCombat.armor > 0);
    }
    if (!input.state.keys.has('KeyB')) frame.bPressed = false;
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
    if (beacon.visible) beaconLight.intensity = 6 + Math.sin(elapsed * 6) * 4;
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function runShot(name) {
  // Deterministic staged frames. Bots are placed by hand (seeded), the match is
  // staged, and the frame freezes after two paints.
  hud.hideOverlay();
  hud.hideBuy();
  hud.hideBanner();
  player.state.pitch = 0;
  player.state.yaw = 0;
  bots.resetRound(3, random);
  match.state.round = 3;

  if (name === 'start') {
    match.state.scoreAlly = 0;
    match.state.scoreEnemy = 0;
    match.state.phase = 'buy';
    match.state.phaseLeft = BUY_SECONDS;
    startRoundSetup();
    player.state.position.set(0, 0, 15);
    aimAt(new THREE.Vector3(-13, 3, -11));
    hud.showOverlay('start', 0);
  } else if (name === 'buy') {
    match.state.scoreAlly = 1;
    match.state.scoreEnemy = 1;
    match.state.phase = 'buy';
    match.state.phaseLeft = 8;
    startRoundSetup();
    playerCombat.money = 2700;
    player.state.position.set(0, 0, 9);
    aimAt(new THREE.Vector3(13, 2, -11));
    hud.showBuy(3, 2700, 'p9', false);
    syncHud();
  } else if (name === 'play') {
    match.state.scoreAlly = 2;
    match.state.scoreEnemy = 1;
    match.state.phase = 'live';
    match.state.phaseLeft = 64;
    startRoundSetup();
    // Stage the duel: one defender down in the A lane, one more in sight.
    const enemy0 = bots.bots.find((bot) => bot.team === 'enemy' && bot.index === 0);
    const enemy1 = bots.bots.find((bot) => bot.team === 'enemy' && bot.index === 1);
    enemy0.armor = 0;
    enemy1.armor = 0;
    enemy0.position.set(-11, 0, -4);
    enemy0.group.position.copy(enemy0.position);
    enemy0.group.rotation.y = Math.PI;
    enemy1.position.set(-7, 0, -8);
    enemy1.group.position.copy(enemy1.position);
    enemy1.group.rotation.y = Math.PI * 0.75;
    player.state.position.set(-4, 0, 2);
    settle(10);
    for (let round = 0; round < 3; round += 1) {
      aimAt(new THREE.Vector3(enemy0.position.x, 1.2, enemy0.position.z));
      shoot(0);
      settle(4);
    }
    aimAt(new THREE.Vector3(enemy1.position.x, 1.2, enemy1.position.z));
    shoot(0);
    settle(6);
    syncHud();
  } else {
    // end: the beacon is planted at A, the round is won, two defenders are down.
    match.state.scoreAlly = 3;
    match.state.scoreEnemy = 2;
    match.state.phase = 'planted';
    match.state.plantedSite = 'A';
    match.state.bombLeft = 12;
    match.state.phaseLeft = 12;
    startRoundSetup();
    beacon.position.set(map.sites.A.center.x, 0, map.sites.A.center.z);
    beacon.visible = true;
    const enemy0 = bots.bots.find((bot) => bot.team === 'enemy' && bot.index === 0);
    const enemy1 = bots.bots.find((bot) => bot.team === 'enemy' && bot.index === 1);
    for (const bot of [enemy0, enemy1]) {
      bot.alive = false;
      bot.fall = 1;
      bot.group.rotation.x = -1.45;
      bot.group.position.y = -0.08;
      bot.group.position.copy(bot.position);
    }
    enemy0.position.set(-11, 0, -8);
    enemy0.group.position.set(-11, -0.08, -8);
    enemy1.position.set(-15, 0, -13);
    enemy1.group.position.set(-15, -0.08, -13);
    player.state.position.set(-7, 0, -5);
    settle(10);
    aimAt(new THREE.Vector3(map.sites.A.center.x, 0.6, map.sites.A.center.z));
    hud.banner('Beacon planted', 'A — Crane Yard · 12s to detonation', 4000);
    syncHud();
  }
  hud.setAmmo(viewModel.state.mag, viewModel.state.reserve, playerCombat.weaponId);
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

syncCamera();
match.startRound();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
