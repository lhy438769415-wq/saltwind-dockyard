// Sound, synthesised: no audio files, just WebAudio. A gunshot is filtered noise,
// a hit is a short blip, planting ticks, and a round win is two notes. Everything
// is best-effort: if the browser has no audio, the game plays on silently.
export function createAudio() {
  let context = null;

  function ensure() {
    if (context) return context;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;
      context = new AudioContextClass();
    } catch {
      context = null;
    }
    return context;
  }

  function noiseBurst(duration, frequency, gainValue) {
    const audio = ensure();
    if (!audio) return;
    try {
      const length = Math.max(1, Math.floor(audio.sampleRate * duration));
      const buffer = audio.createBuffer(1, length, audio.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
      const source = audio.createBufferSource();
      source.buffer = buffer;
      const filter = audio.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = frequency;
      const gain = audio.createGain();
      gain.gain.value = gainValue;
      source.connect(filter);
      filter.connect(gain);
      gain.connect(audio.destination);
      source.start();
    } catch {
      // Audio is decoration; never let it break the game.
    }
  }

  function tone(frequency, duration, gainValue, type = 'sine') {
    const audio = ensure();
    if (!audio) return;
    try {
      const oscillator = audio.createOscillator();
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      const gain = audio.createGain();
      gain.gain.setValueAtTime(gainValue, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start();
      oscillator.stop(audio.currentTime + duration);
    } catch {
      // Audio is decoration; never let it break the game.
    }
  }

  return {
    unlock() {
      ensure();
    },
    shot(weaponId) {
      noiseBurst(weaponId === 'harborlight' ? 0.22 : 0.09, weaponId === 'p9' ? 1800 : 1200, 0.25);
    },
    distantShot() {
      noiseBurst(0.12, 700, 0.07);
    },
    hit(killed) {
      tone(killed ? 1320 : 990, 0.07, 0.12, 'square');
    },
    hurt() {
      tone(180, 0.12, 0.15, 'sawtooth');
    },
    tick() {
      tone(1200, 0.05, 0.08, 'square');
    },
    plantDone() {
      tone(660, 0.12, 0.12, 'square');
      setTimeout(() => tone(880, 0.18, 0.12, 'square'), 120);
    },
    roundEnd(won) {
      if (won) {
        tone(523, 0.15, 0.12);
        setTimeout(() => tone(784, 0.25, 0.12), 150);
      } else {
        tone(392, 0.2, 0.12);
        setTimeout(() => tone(262, 0.3, 0.12), 200);
      }
    },
  };
}
