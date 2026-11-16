// Weapons and the economy: four guns plus armor, bought between rounds. Accuracy
// beats fire rate on purpose — every gun's spread blooms hard while moving, so the
// patient tap-fire wins the duel. Prices are the CS-style economy in miniature.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// damage: torso damage at close range; falloff past rangeStart down to rangeMin.
// head x2.5, legs x0.75. spreadStill is the standing cone (radians); moving adds up
// to spreadMove at full sprint. fireGap is seconds between shots.
export const WEAPONS = {
  p9: {
    id: 'p9', name: 'P9 Sidearm', key: '1', price: 0, mag: 12, reserve: 36,
    damage: 34, headMult: 2.5, legMult: 0.75, rangeStart: 12, rangeEnd: 40, rangeMin: 0.55,
    fireGap: 0.16, reloadTime: 1.4, spreadStill: 0.004, spreadMove: 0.03, auto: false,
    kick: 0.011, range: 60,
  },
  squall: {
    id: 'squall', name: 'Squall SMG', key: '2', price: 1500, mag: 28, reserve: 84,
    damage: 26, headMult: 2.5, legMult: 0.75, rangeStart: 8, rangeEnd: 26, rangeMin: 0.45,
    fireGap: 0.085, reloadTime: 1.8, spreadStill: 0.006, spreadMove: 0.042, auto: true,
    kick: 0.008, range: 55,
  },
  longshore: {
    id: 'longshore', name: 'Longshore Rifle', key: '3', price: 2700, mag: 25, reserve: 75,
    damage: 38, headMult: 2.5, legMult: 0.75, rangeStart: 14, rangeEnd: 45, rangeMin: 0.6,
    fireGap: 0.11, reloadTime: 2.1, spreadStill: 0.0022, spreadMove: 0.034, auto: true,
    kick: 0.012, range: 80,
  },
  harborlight: {
    id: 'harborlight', name: 'Harborlight DMR', key: '4', price: 4100, mag: 8, reserve: 24,
    damage: 82, headMult: 2.5, legMult: 0.75, rangeStart: 18, rangeEnd: 60, rangeMin: 0.7,
    fireGap: 0.55, reloadTime: 2.6, spreadStill: 0.0012, spreadMove: 0.05, auto: false,
    kick: 0.03, range: 100,
  },
};
export const ARMOR = { id: 'armor', name: 'Kevlar Vest', key: '5', price: 650 };

export const ECONOMY = {
  startMoney: 800,
  killReward: 300,
  winReward: 3250,
  lossReward: 1900,
  lossBonusStep: 500,
  lossBonusMax: 3400,
  plantReward: 300,
};

export function damageAtRange(weapon, distance, part) {
  let damage = weapon.damage;
  if (distance > weapon.rangeStart) {
    const t = Math.min(1, (distance - weapon.rangeStart) / Math.max(1, weapon.rangeEnd - weapon.rangeStart));
    damage *= 1 - t * (1 - weapon.rangeMin);
  }
  if (part === 'head') damage *= weapon.headMult;
  else if (part === 'legs') damage *= weapon.legMult;
  return damage;
}

// The first-person view model: a simple low-poly gun built from boxes, hung off the
// camera. One shape per weapon class, scaled by the weapon's bulk.
export function createViewModel(camera, weaponId) {
  const weapon = WEAPONS[weaponId];
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.slate), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.3 });

  const model = new THREE.Group();
  const bulk = weaponId === 'harborlight' ? 1.25 : weaponId === 'p9' ? 0.8 : 1.0;
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09 * bulk, 0.1 * bulk, 0.42 * bulk), body);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045 * bulk, 0.045 * bulk, 0.4 * bulk), grip);
  barrel.position.set(0, 0.025, -0.38 * bulk);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075 * bulk, 0.08 * bulk, 0.22 * bulk), grip);
  stock.position.set(0, -0.02, 0.3 * bulk);
  model.add(receiver, barrel, stock);
  if (weaponId === 'harborlight') {
    const scope = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.22), accent);
    scope.position.set(0, 0.09, -0.05);
    model.add(scope);
  }
  if (weaponId === 'squall') {
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.08), accent);
    mag.position.set(0, -0.12, -0.05);
    model.add(mag);
  }
  model.position.set(0.22, -0.22, -0.5);
  model.scale.setScalar(0.85);
  camera.add(model);

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);

  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const state = {
    weaponId,
    mag: weapon.mag,
    reserve: weapon.reserve,
    cooldown: 0,
    reloadLeft: 0,
    flash: 0,
    kick: 0,
  };

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    model.position.z = -0.5 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (weapon.reloadTime - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = weapon.mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }

  return {
    state,
    weapon,
    model,
    step,
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = weapon.fireGap;
      state.flash = 0.06;
      state.kick = 0.055;
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      if (state.reloadLeft > 0 || state.mag === weapon.mag || state.reserve === 0) return;
      state.reloadLeft = weapon.reloadTime;
    },
    spread(speed) {
      return weapon.spreadStill + Math.min(1, speed / 5.2) * weapon.spreadMove;
    },
    refill() {
      state.mag = weapon.mag;
      state.reserve = weapon.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
    },
    dispose() {
      camera.remove(model, flash, flashLight);
    },
  };
}
