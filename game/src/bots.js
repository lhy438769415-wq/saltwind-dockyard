// Bots: four Night Tide teammates and five Harbor Watch defenders. Each bot walks
// the waypoint graph, holds or pushes a site, and fights with the same guns and
// damage numbers as the player — reaction time, aim error and bursts instead of
// aimbot certainty. A bot is a body of boxes with head/torso/legs hit meshes, so the
// player's raycast treats it exactly like a target.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { WEAPONS, damageAtRange } from './weapons.js';

const RADIUS = 0.34;
const HEIGHT = 1.72;
const WALK_SPEED = 4.1;
const PLANT_TIME = 3.0;
const DEFUSE_TIME = 4.0;

const ALLY_NAMES = ['Gull', 'Tern', 'Plover', 'Skua'];
const ENEMY_NAMES = ['Crane', 'Heron', 'Egret', 'Osprey', 'Kittiwake'];

function botColor(team) {
  return team === 'ally' ? PALETTE.ally : PALETTE.enemy;
}

export function createBots(scene, map) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 60;
  const bots = [];
  const hitMeshes = [];
  const probe = new THREE.Box3();

  function overlaps(x, y, z, colliders) {
    probe.min.set(x - RADIUS, y + 0.05, z - RADIUS);
    probe.max.set(x + RADIUS, y + HEIGHT - 0.05, z + RADIUS);
    for (const collider of colliders) if (probe.intersectsBox(collider)) return true;
    return false;
  }

  function hasLineOfSight(from, to) {
    const direction = new THREE.Vector3().subVectors(to, from);
    const distance = direction.length();
    if (distance > 55) return false;
    direction.normalize();
    raycaster.set(from, direction);
    raycaster.far = distance;
    const hit = raycaster.intersectObjects(map.shootables, false)[0];
    return !hit;
  }

  function makeBot(team, name, index) {
    const color = new THREE.Color(botColor(team));
    const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.slate), roughness: 0.8 });
    const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0.1 });
    const headMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.6 });

    const group = new THREE.Group();
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.8, 0.28), dark);
    legs.position.y = 0.4;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.72, 0.32), bodyMat);
    torso.position.y = 1.16;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), headMat);
    head.position.y = 1.68;
    const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.4), bodyMat);
    helmet.position.y = 1.82;
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.62), dark);
    gun.position.set(0.22, 1.25, -0.3);
    group.add(legs, torso, head, helmet, gun);
    group.traverse((mesh) => {
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    scene.add(group);

    const bot = {
      id: `${team}-${index}`,
      team,
      name,
      index,
      group,
      torso,
      head,
      legs,
      position: new THREE.Vector3(),
      yaw: 0,
      pitch: 0,
      hp: 100,
      armor: 0,
      alive: true,
      weaponId: 'p9',
      money: 800,
      // AI state
      mode: 'idle',
      path: [],
      pathIndex: 0,
      targetNode: 0,
      holdNode: 0,
      target: null,
      reactLeft: 0,
      burstLeft: 0,
      pauseLeft: 0,
      fireLeft: 0,
      strafeDir: 1,
      strafeLeft: 0,
      repathLeft: 0,
      holdLeft: 0,
      channel: null, // { kind: 'plant'|'defuse', progress }
      channelSite: null,
      carrier: false,
      fall: 0,
      lastDamageAt: -10,
    };
    torso.userData.bot = bot;
    torso.userData.part = 'torso';
    head.userData.bot = bot;
    head.userData.part = 'head';
    legs.userData.bot = bot;
    legs.userData.part = 'legs';
    hitMeshes.push(torso, head, legs);
    bots.push(bot);
    return bot;
  }

  for (let i = 0; i < ALLY_NAMES.length; i += 1) makeBot('ally', ALLY_NAMES[i], i);
  for (let i = 0; i < ENEMY_NAMES.length; i += 1) makeBot('enemy', ENEMY_NAMES[i], i);

  function resetRound(roundNumber, random) {
    for (const bot of bots) {
      bot.hp = 100;
      bot.alive = true;
      bot.fall = 0;
      bot.group.rotation.set(0, 0, 0);
      bot.group.position.y = 0;
      bot.channel = null;
      bot.channelSite = null;
      bot.target = null;
      bot.burstLeft = 0;
      bot.pauseLeft = 0;
      bot.fireLeft = 0;
      bot.strafeLeft = 0;
      bot.repathLeft = 0;
      bot.carrier = false;
      // Simple bot economy: pistols round one, rifles once the money is there.
      bot.money += roundNumber === 1 ? 0 : 1900;
      if (bot.money >= 2700 && random() < 0.7) {
        bot.weaponId = 'longshore';
        bot.money -= 2700;
      } else if (bot.money >= 1500 && random() < 0.6) {
        bot.weaponId = 'squall';
        bot.money -= 1500;
      } else {
        bot.weaponId = 'p9';
      }
      if (bot.money >= 650 && random() < 0.5) {
        bot.armor = 100;
        bot.money -= 650;
      } else {
        bot.armor = 0;
      }
      const spawn = map.spawns[bot.team][bot.index % map.spawns[bot.team].length];
      bot.position.set(spawn[0], 0, spawn[1]);
      bot.yaw = bot.team === 'ally' ? Math.PI : 0;
      bot.group.position.copy(bot.position);
      bot.group.rotation.y = bot.yaw;
      // Attackers pick a site as a team: 60% A, 40% B. Defenders split 2/2/1.
      if (bot.team === 'ally') {
        bot.targetNode = random() < 0.6 ? 10 : 11;
        bot.mode = 'toSite';
      } else {
        const holds = [13, 14, 13, 14, 8];
        bot.holdNode = holds[bot.index];
        bot.targetNode = bot.holdNode;
        bot.mode = 'hold';
      }
      bot.path = [];
      bot.pathIndex = 0;
      bot.holdLeft = 2 + random() * 4;
    }
    // One attacker carries the beacon: the first ally bot.
    const carrier = bots.find((bot) => bot.team === 'ally');
    if (carrier) carrier.carrier = true;
  }

  function eyeOf(bot) {
    return new THREE.Vector3(bot.position.x, bot.position.y + 1.6, bot.position.z);
  }

  function chestOf(target) {
    if (target.isPlayer) return new THREE.Vector3(target.position.x, target.position.y + 1.35, target.position.z);
    return new THREE.Vector3(target.position.x, target.position.y + 1.2, target.position.z);
  }

  function nearestVisibleEnemy(bot, combatants) {
    let best = null;
    let bestDist = Infinity;
    for (const other of combatants) {
      if (!other.alive || other.team === bot.team) continue;
      const to = chestOf(other);
      const from = eyeOf(bot);
      const dist = from.distanceTo(to);
      if (dist > 48 || dist >= bestDist) continue;
      if (!hasLineOfSight(from, to)) continue;
      best = other;
      bestDist = dist;
    }
    return best ? { target: best, distance: bestDist } : null;
  }

  function faceToward(bot, point, dt) {
    const dx = point.x - bot.position.x;
    const dz = point.z - bot.position.z;
    const want = Math.atan2(-dx, -dz);
    let diff = want - bot.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    bot.yaw += diff * Math.min(1, dt * 8);
  }

  function moveToward(bot, point, dt, speed) {
    const dx = point.x - bot.position.x;
    const dz = point.z - bot.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) return true;
    const step = Math.min(dist, speed * dt);
    const nx = bot.position.x + (dx / dist) * step;
    if (!overlaps(nx, bot.position.y, bot.position.z, map.colliders)) bot.position.x = nx;
    const nz = bot.position.z + (dz / dist) * step;
    if (!overlaps(bot.position.x, bot.position.y, nz, map.colliders)) bot.position.z = nz;
    faceToward(bot, point, dt);
    return dist < 0.6;
  }

  function followPath(bot, dt, random) {
    if (bot.pathIndex >= bot.path.length) return true;
    const node = map.waypoints[bot.path[bot.pathIndex]];
    const arrived = moveToward(bot, new THREE.Vector3(node[0], 0, node[1]), dt, WALK_SPEED);
    if (arrived) bot.pathIndex += 1;
    return bot.pathIndex >= bot.path.length;
  }

  function repath(bot) {
    const from = map.nearestWaypoint(bot.position.x, bot.position.z);
    bot.path = map.findPath(from, bot.targetNode);
    bot.pathIndex = 0;
  }

  // A bot fires at its target: a probabilistic hit using the same damage table as
  // the player, so range, armor and headshots all behave the same way.
  function botShoot(bot, target, distance, ctx, random) {
    const weapon = WEAPONS[bot.weaponId];
    bot.fireLeft = weapon.fireGap;
    const targetSpeed = target.isPlayer ? Math.hypot(target.velocity.x, target.velocity.z) : 2.5;
    let hitP = 0.72 - distance * 0.008 - targetSpeed * 0.03;
    hitP = Math.max(0.08, Math.min(0.72, hitP));
    const from = eyeOf(bot);
    const to = chestOf(target);
    // Muzzle flash + tracer either way: the shot is visible, the hit is the roll.
    const tracerEnd = to.clone();
    if (random() < hitP) {
      const head = random() < 0.1;
      const part = head ? 'head' : 'torso';
      let damage = damageAtRange(weapon, distance, part);
      if (target.armor > 0) {
        const absorbed = Math.min(target.armor, damage * 0.5);
        target.armor -= absorbed;
        damage -= absorbed;
      }
      ctx.applyDamage(target, damage, bot, part);
    } else {
      // Miss: the tracer lands past the target, into the world.
      tracerEnd.add(new THREE.Vector3((random() - 0.5) * 2, (random() - 0.5) * 1.2, (random() - 0.5) * 2));
    }
    ctx.tracer(from, tracerEnd, bot.team);
    ctx.gunshot(from, weapon);
  }

  function update(dt, ctx, random) {
    const now = ctx.time;
    for (const bot of bots) {
      if (!bot.alive) {
        if (bot.fall < 1) {
          bot.fall = Math.min(1, bot.fall + dt / 0.4);
          bot.group.rotation.x = -bot.fall * 1.45;
          bot.group.position.y = -bot.fall * 0.08;
        }
        continue;
      }
      bot.fireLeft = Math.max(0, bot.fireLeft - dt);
      bot.repathLeft -= dt;
      bot.holdLeft -= dt;

      // --- Perception: nearest visible enemy. ---
      const seen = nearestVisibleEnemy(bot, ctx.combatants);
      if (seen) {
        if (bot.target !== seen.target) {
          bot.target = seen.target;
          bot.reactLeft = 0.35 + random() * 0.35;
        }
      } else {
        bot.target = null;
      }

      // --- Channel (plant/defuse) breaks when the bot takes damage. ---
      if (bot.channel && now - bot.lastDamageAt < 1.0) {
        bot.channel = null;
        bot.channelSite = null;
      }

      // --- Combat: face the target, burst fire. ---
      if (bot.target) {
        const to = chestOf(bot.target);
        faceToward(bot, to, dt);
        bot.reactLeft -= dt;
        if (bot.reactLeft <= 0) {
          if (bot.burstLeft <= 0 && bot.pauseLeft <= 0) {
            bot.burstLeft = 3 + Math.floor(random() * 3);
            bot.pauseLeft = 0;
          }
          if (bot.burstLeft > 0 && bot.fireLeft <= 0) {
            botShoot(bot, bot.target, seen.distance, ctx, random);
            bot.burstLeft -= 1;
            if (bot.burstLeft === 0) bot.pauseLeft = 0.4 + random() * 0.5;
          } else if (bot.pauseLeft > 0) {
            bot.pauseLeft -= dt;
          }
          // Sidestep while duelling so the player has a moving target.
          bot.strafeLeft -= dt;
          if (bot.strafeLeft <= 0) {
            bot.strafeDir = random() < 0.5 ? -1 : 1;
            bot.strafeLeft = 0.5 + random() * 0.8;
          }
          const strafe = new THREE.Vector3(Math.cos(bot.yaw) * bot.strafeDir, 0, -Math.sin(bot.yaw) * bot.strafeDir);
          const nx = bot.position.x + strafe.x * 1.6 * dt;
          const nz = bot.position.z + strafe.z * 1.6 * dt;
          if (!overlaps(nx, bot.position.y, bot.position.z, map.colliders)) bot.position.x = nx;
          if (!overlaps(bot.position.x, bot.position.y, nz, map.colliders)) bot.position.z = nz;
        }
        // While fighting, the bot holds its ground: no waypoint progress.
        bot.group.position.copy(bot.position);
        bot.group.rotation.y = bot.yaw;
        continue;
      }

      // --- No enemy in sight: work the objective. ---
      // Defenders converge on a planted site; attackers hold around it.
      if (ctx.phase === 'planted') {
        if (bot.team === 'enemy') {
          bot.targetNode = ctx.plantedSite === 'A' ? 10 : 11;
          bot.mode = 'toSite';
        } else {
          bot.targetNode = ctx.plantedSite === 'A' ? 13 : 14;
          bot.mode = 'hold';
        }
      }

      // Carrier plants when it reaches its site and the site is clear.
      if (bot.carrier && ctx.phase === 'live') {
        const site = bot.targetNode === 10 ? map.sites.A : map.sites.B;
        if (map.inSite(bot.position, site)) {
          if (!bot.channel) {
            bot.channel = { kind: 'plant', progress: 0 };
            bot.channelSite = bot.targetNode === 10 ? 'A' : 'B';
          }
          bot.channel.progress += dt / PLANT_TIME;
          ctx.channelProgress(bot, bot.channel.progress);
          if (bot.channel.progress >= 1) {
            ctx.onPlanted(bot.channelSite, bot);
            bot.channel = null;
            bot.channelSite = null;
          }
          bot.group.position.copy(bot.position);
          bot.group.rotation.y = bot.yaw;
          continue;
        }
      }
      // A defender defuses when it reaches the planted site.
      if (bot.team === 'enemy' && ctx.phase === 'planted') {
        const site = map.sites[ctx.plantedSite];
        if (map.inSite(bot.position, site)) {
          if (!bot.channel) {
            bot.channel = { kind: 'defuse', progress: 0 };
            bot.channelSite = ctx.plantedSite;
          }
          bot.channel.progress += dt / DEFUSE_TIME;
          ctx.channelProgress(bot, bot.channel.progress);
          if (bot.channel.progress >= 1) {
            ctx.onDefused(bot);
            bot.channel = null;
            bot.channelSite = null;
          }
          bot.group.position.copy(bot.position);
          bot.group.rotation.y = bot.yaw;
          continue;
        }
      }

      // Move along the waypoint path; re-path when the goal changes or on a timer.
      if (bot.path.length === 0 || bot.pathIndex >= bot.path.length || bot.repathLeft <= 0) {
        repath(bot);
        bot.repathLeft = 2;
      }
      if (bot.mode === 'hold') {
        // Hold: stand near the hold node, peek to a neighbour now and then.
        const node = map.waypoints[bot.holdNode];
        const atHold = Math.hypot(bot.position.x - node[0], bot.position.z - node[1]) < 1.2;
        if (!atHold) {
          followPath(bot, dt, random);
        } else if (bot.holdLeft <= 0) {
          bot.holdLeft = 4 + random() * 4;
          bot.targetNode = random() < 0.5 ? bot.holdNode : (bot.holdNode === 13 ? 7 : 9);
          repath(bot);
          bot.repathLeft = 2;
        } else {
          // Watch the likely approach: face the lane the attackers come down.
          const watch = bot.holdNode === 13 ? new THREE.Vector3(-8, 0, 4) : new THREE.Vector3(8, 0, 4);
          faceToward(bot, watch, dt);
        }
      } else {
        followPath(bot, dt, random);
      }
      bot.group.position.copy(bot.position);
      bot.group.rotation.y = bot.yaw;
    }
  }

  function aliveCount(team) {
    return bots.filter((bot) => bot.team === team && bot.alive).length;
  }

  return {
    bots,
    hitMeshes,
    update,
    resetRound,
    aliveCount,
    damage(bot, amount) {
      if (!bot.alive) return false;
      bot.hp -= amount;
      bot.lastDamageAt = 0; // set by caller via ctx time; see applyDamage path
      if (bot.hp <= 0) {
        bot.hp = 0;
        bot.alive = false;
        bot.fall = 0;
        bot.channel = null;
        bot.channelSite = null;
        return true;
      }
      return false;
    },
    markDamaged(bot, time) {
      bot.lastDamageAt = time;
    },
  };
}
