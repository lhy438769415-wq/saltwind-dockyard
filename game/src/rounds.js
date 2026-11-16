// The match: rounds, phases, the economy and the win conditions. One match is first
// to 5 rounds (at most 9). Phases: buy (12 s, shop open, no fighting) -> live
// (100 s, plant or eliminate) -> planted (35 s to detonation) -> round end.
// The economy pays for kills, wins, losses (with a growing loss bonus) and plants.
import { ECONOMY } from './weapons.js';

export const BUY_SECONDS = 12;
export const ROUND_SECONDS = 100;
export const BOMB_SECONDS = 35;
export const WIN_ROUNDS = 5;
export const MAX_ROUNDS = 9;

export function createMatch(events) {
  const state = {
    round: 1,
    scoreAlly: 0,
    scoreEnemy: 0,
    phase: 'buy', // buy | live | planted | over
    phaseLeft: BUY_SECONDS,
    plantedSite: null,
    bombLeft: 0,
    lossStreakAlly: 0,
    lossStreakEnemy: 0,
    winner: null,
    reason: '',
    carrierAlive: true,
  };

  function lossBonus(streak) {
    return Math.min(ECONOMY.lossBonusMax, ECONOMY.lossReward + ECONOMY.lossBonusStep * (streak - 1));
  }

  function startRound() {
    state.phase = 'buy';
    state.phaseLeft = BUY_SECONDS;
    state.plantedSite = null;
    state.bombLeft = 0;
    events.onPhase(state);
  }

  function startLive() {
    state.phase = 'live';
    state.phaseLeft = ROUND_SECONDS;
    events.onPhase(state);
  }

  function plant(site) {
    if (state.phase !== 'live') return;
    state.phase = 'planted';
    state.plantedSite = site;
    state.bombLeft = BOMB_SECONDS;
    state.phaseLeft = BOMB_SECONDS;
    events.onPhase(state);
  }

  function endRound(winner, reason) {
    if (state.phase === 'over') return;
    if (winner === 'ally') {
      state.scoreAlly += 1;
      state.lossStreakAlly = 0;
      state.lossStreakEnemy += 1;
    } else {
      state.scoreEnemy += 1;
      state.lossStreakEnemy = 0;
      state.lossStreakAlly += 1;
    }
    state.winner = winner;
    state.reason = reason;
    events.onRoundEnd(state, {
      winPay: ECONOMY.winReward,
      lossPayAlly: lossBonus(state.lossStreakAlly),
      lossPayEnemy: lossBonus(state.lossStreakEnemy),
    });
    if (state.scoreAlly >= WIN_ROUNDS || state.scoreEnemy >= WIN_ROUNDS || state.round >= MAX_ROUNDS) {
      state.phase = 'over';
      events.onMatchEnd(state);
      return;
    }
    state.round += 1;
    startRound();
  }

  function tick(dt) {
    if (state.phase === 'over') return;
    state.phaseLeft -= dt;
    if (state.phase === 'buy' && state.phaseLeft <= 0) startLive();
    else if (state.phase === 'live' && state.phaseLeft <= 0) endRound('enemy', 'Time expired — Harbor Watch holds the yard');
    else if (state.phase === 'planted') {
      state.bombLeft -= dt;
      if (state.bombLeft <= 0) endRound('ally', 'Beacon detonated — the yard is Night Tide\u2019s');
    }
  }

  function reset() {
    state.round = 1;
    state.scoreAlly = 0;
    state.scoreEnemy = 0;
    state.phase = 'buy';
    state.phaseLeft = BUY_SECONDS;
    state.plantedSite = null;
    state.bombLeft = 0;
    state.lossStreakAlly = 0;
    state.lossStreakEnemy = 0;
    state.winner = null;
    state.reason = '';
    events.onPhase(state);
  }

  return { state, startRound, startLive, plant, endRound, tick, reset };
}
