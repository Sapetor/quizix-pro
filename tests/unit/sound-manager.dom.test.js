/**
 * @jest-environment jsdom
 *
 * Covers the single mute gate (SoundManager.isSoundsEnabled) that the player
 * mute button drives, plus its localStorage persistence.
 */

import { SoundManager } from '../../public/js/audio/sound-manager.js';

const AUDIO_SETTINGS_KEY = 'quizAudioSettings';

/** Minimal AudioContext stub — records every oscillator that gets created. */
function installAudioContextStub() {
  const created = [];
  class FakeAudioContext {
    constructor() {
      this.state = 'running';
      this.currentTime = 0;
      this.destination = {};
    }
    createOscillator() {
      const osc = {
        frequency: { setValueAtTime: jest.fn() },
        type: 'sine',
        connect: jest.fn(),
        start: jest.fn(),
        stop: jest.fn(),
        onended: null
      };
      created.push(osc);
      return osc;
    }
    createGain() {
      return {
        connect: jest.fn(),
        gain: {
          setValueAtTime: jest.fn(),
          linearRampToValueAtTime: jest.fn(),
          exponentialRampToValueAtTime: jest.fn()
        }
      };
    }
    createBuffer() { return {}; }
    createBufferSource() { return { buffer: null, connect: jest.fn(), start: jest.fn() }; }
    close() {}
  }
  window.AudioContext = FakeAudioContext;
  return created;
}

describe('SoundManager mute gate', () => {
  let oscillators;
  let manager;

  beforeEach(() => {
    localStorage.clear();
    jest.useFakeTimers();
    oscillators = installAudioContextStub();
  });

  afterEach(() => {
    manager?.destroy();
    manager = null;
    jest.useRealTimers();
  });

  describe('persistence', () => {
    test('defaults to sounds ON when nothing is stored', () => {
      manager = new SoundManager();
      expect(manager.isSoundsEnabled()).toBe(true);
    });

    test('mute() writes the preference to localStorage', () => {
      manager = new SoundManager();
      manager.mute();

      expect(manager.isSoundsEnabled()).toBe(false);
      expect(JSON.parse(localStorage.getItem(AUDIO_SETTINGS_KEY)).soundsEnabled).toBe(false);
    });

    test('a muted preference survives into a new session', () => {
      localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify({ soundsEnabled: false }));

      manager = new SoundManager();

      expect(manager.isSoundsEnabled()).toBe(false);
      // Unrelated defaults are preserved, not clobbered by the partial payload
      expect(manager.settings.masterVolume).toBe(0.5);
    });

    test('unmute() restores sound and persists it', () => {
      localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify({ soundsEnabled: false }));
      manager = new SoundManager();

      manager.unmute();

      expect(manager.isSoundsEnabled()).toBe(true);
      expect(JSON.parse(localStorage.getItem(AUDIO_SETTINGS_KEY)).soundsEnabled).toBe(true);
    });
  });

  describe('gating', () => {
    test('oscillator sounds play while unmuted', () => {
      manager = new SoundManager();

      manager.playEnhancedSound(440, 0.1, 'sine', 0.1);

      expect(oscillators).toHaveLength(1);
    });

    test('muting silences oscillator sounds', () => {
      manager = new SoundManager();
      manager.mute();

      manager.playEnhancedSound(440, 0.1, 'sine', 0.1);
      manager.playSound(440, 0.1);
      manager.playTimerExpired();
      manager.playLeaderboardPlacement(1);
      manager.playCountdownTick(1);
      jest.runAllTimers();

      expect(oscillators).toHaveLength(0);
    });

    test('muting silences sample playback', async () => {
      manager = new SoundManager();
      const loadSpy = jest.spyOn(manager, 'loadAudioFile');
      manager.mute();

      await manager.playAudioFile('correctAnswer', 0.7);
      await manager.playCorrectAnswerSound();

      expect(loadSpy).not.toHaveBeenCalled();
    });

    test('muting mid-melody silences notes already scheduled with setTimeout', () => {
      manager = new SoundManager();

      manager.playLeaderboardPlacement(1); // 6-note fanfare spread over ~1.2s
      jest.advanceTimersByTime(150);       // let the first notes fire
      expect(oscillators.length).toBeGreaterThan(0);
      const beforeMute = oscillators.length;

      manager.mute();
      jest.runAllTimers();

      expect(oscillators).toHaveLength(beforeMute);
    });

    test('host mute wins over a locally unmuted device', () => {
      manager = new SoundManager();
      expect(manager.isSoundsEnabled()).toBe(true);

      manager.setHostMuted(true);

      expect(manager.isSoundsEnabled()).toBe(false);
      expect(manager.isHostMuted()).toBe(true);

      manager.playEnhancedSound(440, 0.1, 'sine', 0.1);
      expect(oscillators).toHaveLength(0);
    });

    test('a local unmute cannot defeat the host override', () => {
      manager = new SoundManager();
      manager.setHostMuted(true);

      manager.unmute();

      expect(manager.settings.soundsEnabled).toBe(true);
      expect(manager.isSoundsEnabled()).toBe(false);
    });

    test('host unmute restores the personal preference, muted or not', () => {
      manager = new SoundManager();
      manager.mute();                 // student chose silence
      manager.setHostMuted(true);
      manager.setHostMuted(false);

      // Host released the override; the student's own mute still stands
      expect(manager.isSoundsEnabled()).toBe(false);

      manager.unmute();
      expect(manager.isSoundsEnabled()).toBe(true);
    });

    test('the host override is never written to localStorage', () => {
      manager = new SoundManager();
      manager.setHostMuted(true);

      const stored = JSON.parse(localStorage.getItem(AUDIO_SETTINGS_KEY) || '{}');
      expect(stored.hostMuted).toBeUndefined();
      expect(stored.soundsEnabled).not.toBe(false);
    });

    test('the host override does not survive into a new session', () => {
      manager = new SoundManager();
      manager.setHostMuted(true);
      manager.destroy();

      manager = new SoundManager();
      expect(manager.isHostMuted()).toBe(false);
      expect(manager.isSoundsEnabled()).toBe(true);
    });

    test('ensureAudioContext reports the gate, not just context availability', () => {
      manager = new SoundManager();
      expect(manager.ensureAudioContext()).toBe(true);

      manager.mute();
      expect(manager.ensureAudioContext()).toBe(false);
    });
  });
});
