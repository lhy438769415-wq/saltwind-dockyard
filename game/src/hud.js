// The DOM HUD: crosshair, hit marker, ammo, health, money, the round clock, both
// rosters, the kill feed, the buy menu and the overlay panels. It never touches the
// simulation; main.js pushes numbers in and reads callbacks out.
import { WEAPONS, ARMOR } from './weapons.js';

const COPY = {
  start: {
    title: 'Saltwind Dockyard',
    copy: 'Night Tide versus Harbor Watch in a dusk container yard. Plant the beacon at A or B — or clear the other team. Click to play.',
    action: 'Click to play',
  },
  paused: {
    title: 'Saltwind Dockyard',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  dead: {
    title: 'You are down',
    copy: 'Your team fights on. Next round starts soon.',
    action: 'Keep watching',
  },
};

export function createHud() {
  const overlay = document.getElementById('overlay');
  const title = document.getElementById('overlay-title');
  const copy = document.getElementById('overlay-copy');
  const play = document.getElementById('play');
  const ammo = document.getElementById('ammo');
  const ammoMag = document.getElementById('ammo-mag');
  const ammoReserve = document.getElementById('ammo-reserve');
  const weaponName = document.getElementById('weapon-name');
  const healthFill = document.getElementById('health-fill');
  const healthValue = document.getElementById('health-value');
  const armorValue = document.getElementById('armor-value');
  const moneyValue = document.getElementById('money-value');
  const timer = document.getElementById('timer');
  const scoreAlly = document.getElementById('score-ally');
  const scoreEnemy = document.getElementById('score-enemy');
  const rosterAlly = document.getElementById('roster-ally');
  const rosterEnemy = document.getElementById('roster-enemy');
  const feed = document.getElementById('feed');
  const banner = document.getElementById('banner');
  const channel = document.getElementById('channel');
  const channelLabel = document.getElementById('channel-label');
  const channelFill = document.getElementById('channel-fill');
  const hitmarker = document.getElementById('hitmarker');
  const buy = document.getElementById('buy');
  const buyRows = document.getElementById('buy-rows');
  const buyMoney = document.getElementById('buy-money');
  const buyRound = document.getElementById('buy-round');

  let hitTimer = 0;
  let bannerTimer = 0;
  let lastMag = -1;
  let lastReserve = -1;
  let lastWeapon = '';
  let lastHp = -1;
  let lastArmor = -1;
  let lastMoney = -1;

  function formatTime(seconds) {
    const value = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
  }

  return {
    setAmmo(mag, reserve, weaponId) {
      const name = WEAPONS[weaponId]?.name ?? weaponId;
      if (mag !== lastMag || reserve !== lastReserve || name !== lastWeapon) {
        lastMag = mag;
        lastReserve = reserve;
        lastWeapon = name;
        ammoMag.textContent = String(mag);
        ammoReserve.textContent = `/ ${reserve}`;
        weaponName.textContent = name;
        ammo.classList.toggle('empty', mag === 0);
      }
    },
    setVitals(hp, armor, money) {
      if (hp !== lastHp || armor !== lastArmor || money !== lastMoney) {
        lastHp = hp;
        lastArmor = armor;
        lastMoney = money;
        healthValue.textContent = String(Math.max(0, Math.ceil(hp)));
        armorValue.textContent = String(Math.max(0, Math.ceil(armor)));
        moneyValue.textContent = `$${money}`;
        healthFill.style.width = `${Math.max(0, Math.min(100, hp))}%`;
        healthFill.classList.toggle('low', hp <= 30);
      }
    },
    setClock(seconds, planted) {
      timer.textContent = formatTime(seconds);
      timer.classList.toggle('planted', planted);
    },
    setScores(ally, enemy) {
      scoreAlly.textContent = String(ally);
      scoreEnemy.textContent = String(enemy);
    },
    setRosters(allies, enemies) {
      rosterAlly.innerHTML = allies.map((p) => {
        const cls = `${p.alive ? '' : 'dead'}${p.you ? ' you' : ''}`.trim();
        return `<div class="${cls}">${p.alive ? '●' : '○'} ${p.name}${p.you ? ' (you)' : ''}</div>`;
      }).join('');
      rosterEnemy.innerHTML = enemies.map((p) => {
        const cls = p.alive ? '' : 'dead';
        return `<div class="${cls}">${p.alive ? '●' : '○'} ${p.name}</div>`;
      }).join('');
    },
    killFeed(killer, victim, killerTeam, headshot) {
      const line = document.createElement('div');
      const killerClass = killerTeam === 'enemy' ? 'kill-enemy' : '';
      line.innerHTML = `<b>${killer}</b> <span class="${killerClass}">✕</span> <b>${victim}</b>${headshot ? ' ⌖' : ''}`;
      feed.prepend(line);
      while (feed.children.length > 5) feed.removeChild(feed.lastChild);
      setTimeout(() => line.remove(), 6000);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.style.transform = killed ? 'translate(-50%, -50%) rotate(45deg) scale(1.25)' : '';
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => {
        hitmarker.classList.remove('on');
        hitmarker.style.transform = '';
      }, holdMs);
    },
    banner(main, sub, holdMs = 2600) {
      banner.innerHTML = `${main}${sub ? `<small>${sub}</small>` : ''}`;
      banner.hidden = false;
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => {
        banner.hidden = true;
      }, holdMs);
    },
    hideBanner() {
      banner.hidden = true;
      clearTimeout(bannerTimer);
    },
    channel(label, progress) {
      if (label === null) {
        channel.hidden = true;
        return;
      }
      channel.hidden = false;
      channelLabel.textContent = label;
      channelFill.style.width = `${Math.max(0, Math.min(100, progress * 100))}%`;
    },
    showOverlay(mode, score) {
      const text = COPY[mode];
      title.textContent = text.title;
      copy.textContent = mode === 'dead' && typeof score === 'number' ? `${text.copy}` : text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
    showBuy(round, money, ownedWeaponId, hasArmor) {
      buy.hidden = false;
      buyRound.textContent = String(round);
      buyMoney.textContent = `$${money}`;
      const rows = Object.values(WEAPONS).map((weapon) => {
        const owned = weapon.id === ownedWeaponId;
        const cant = !owned && money < weapon.price;
        const role = weapon.id === 'p9' ? 'Free · close quarters' : weapon.id === 'squall' ? 'Spray · close' : weapon.id === 'longshore' ? 'Tap-fire · all ranges' : 'One tap · long lanes';
        return `<tr class="${owned ? 'owned' : ''}${cant ? ' cant' : ''}"><td class="key">${weapon.key}</td><td>${weapon.name}${owned ? ' — owned' : ''}</td><td>${role}</td><td class="price">${owned ? '—' : `$${weapon.price}`}</td></tr>`;
      }).join('');
      const armorRow = `<tr class="${hasArmor ? 'owned' : ''}${!hasArmor && money < ARMOR.price ? ' cant' : ''}"><td class="key">${ARMOR.key}</td><td>${ARMOR.name}${hasArmor ? ' — owned' : ''}</td><td>Halves damage taken</td><td class="price">${hasArmor ? '—' : `$${ARMOR.price}`}</td></tr>`;
      buyRows.innerHTML = rows + armorRow;
    },
    hideBuy() {
      buy.hidden = true;
    },
    buyVisible() {
      return !buy.hidden;
    },
  };
}
