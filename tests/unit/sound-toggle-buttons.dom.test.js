/**
 * @jest-environment jsdom
 *
 * The player mute button (#player-sound-toggle, on the player game screen) and
 * the header one (#sound-toggle, inside the ··· overflow menu) are wired as a
 * single group via [data-sound-toggle]. Either one flips the shared state and
 * both must reflect it.
 */

import { SettingsManager } from '../../public/js/settings/settings-manager.js';

function buildDom() {
  document.body.innerHTML = `
    <button id="sound-toggle" class="iconbtn" data-sound-toggle
            data-icon-state="on" aria-pressed="true" aria-label="Toggle sound">
      <svg class="icon-sound-on"></svg><svg class="icon-sound-off"></svg>
    </button>
    <button id="player-sound-toggle" class="iconbtn player-sound-toggle" data-sound-toggle
            data-icon-state="on" aria-pressed="true" aria-label="Toggle sound">
      <svg class="icon-sound-on"></svg><svg class="icon-sound-off"></svg>
    </button>
  `;
}

function fakeSoundManager(enabled = true) {
  return {
    enabled,
    hostMuted: false,
    isSoundsEnabled() { return this.enabled && !this.hostMuted; },
    isHostMuted() { return this.hostMuted; },
    setHostMuted(muted) { this.hostMuted = !!muted; },
    mute() { this.enabled = false; },
    unmute() { this.enabled = true; }
  };
}

function buttons() {
  return {
    header: document.getElementById('sound-toggle'),
    player: document.getElementById('player-sound-toggle')
  };
}

describe('player + header sound toggles', () => {
  let settings;
  let sound;

  beforeEach(() => {
    localStorage.clear();
    // Provided by globals.js in the app; irrelevant to sound but called on construction.
    window.applyThemeAttributes = jest.fn();
    buildDom();
    sound = fakeSoundManager(true);
    settings = new SettingsManager();
    settings.setSoundManager(sound);
    settings.initializeEventListeners();
  });

  test('starts unmuted with both buttons showing the "on" icon', () => {
    const { header, player } = buttons();
    expect(sound.isSoundsEnabled()).toBe(true);
    expect(header.dataset.iconState).toBe('on');
    expect(player.dataset.iconState).toBe('on');
    expect(player.getAttribute('aria-pressed')).toBe('true');
  });

  test('clicking the player button mutes and updates both buttons', () => {
    const { header, player } = buttons();

    player.click();

    expect(sound.isSoundsEnabled()).toBe(false);
    expect(player.dataset.iconState).toBe('off');
    expect(header.dataset.iconState).toBe('off');
    expect(player.getAttribute('aria-pressed')).toBe('false');
    expect(header.getAttribute('aria-pressed')).toBe('false');
  });

  test('clicking the player button again unmutes', () => {
    const { player } = buttons();

    player.click();
    player.click();

    expect(sound.isSoundsEnabled()).toBe(true);
    expect(player.dataset.iconState).toBe('on');
    expect(player.getAttribute('aria-pressed')).toBe('true');
  });

  test('the header button drives the player button too', () => {
    const { header, player } = buttons();

    header.click();

    expect(sound.isSoundsEnabled()).toBe(false);
    expect(player.dataset.iconState).toBe('off');
  });

  test('icon state is class-driven — the inline SVG children are never replaced', () => {
    const { player } = buttons();
    const onIcon = player.querySelector('.icon-sound-on');
    const offIcon = player.querySelector('.icon-sound-off');

    player.click();
    player.click();

    expect(player.querySelector('.icon-sound-on')).toBe(onIcon);
    expect(player.querySelector('.icon-sound-off')).toBe(offIcon);
  });

  describe('host mute-all override', () => {
    test('renders both buttons as muted and disabled', () => {
      sound.setHostMuted(true);
      settings.updateSoundToggleButtons();

      const { header, player } = buttons();
      [header, player].forEach(btn => {
        expect(btn.dataset.iconState).toBe('off');
        expect(btn.getAttribute('aria-pressed')).toBe('false');
        expect(btn.disabled).toBe(true);
        expect(btn.classList.contains('host-muted')).toBe(true);
        // aria explanation is the host-mute string, not a plain "unmute" affordance.
        // No locale is loaded under jest, so getTranslationSync echoes the key.
        expect(btn.getAttribute('aria-label')).toBe('muted_by_host');
        expect(btn.title).toBe('muted_by_host');
      });
    });

    test('the student cannot unmute while host-muted', () => {
      sound.setHostMuted(true);
      settings.updateSoundToggleButtons();

      buttons().player.click();          // disabled, but force the handler anyway
      settings.toggleSound();

      expect(sound.isSoundsEnabled()).toBe(false);
      expect(sound.enabled).toBe(true);  // personal preference untouched
    });

    test('releasing the host mute restores the personal preference', () => {
      buttons().player.click();          // student muted themselves
      sound.setHostMuted(true);
      settings.updateSoundToggleButtons();

      sound.setHostMuted(false);
      settings.updateSoundToggleButtons();

      const { player } = buttons();
      expect(sound.isSoundsEnabled()).toBe(false); // still personally muted
      expect(player.disabled).toBe(false);

      player.click();
      expect(sound.isSoundsEnabled()).toBe(true);
      expect(player.dataset.iconState).toBe('on');
    });

    test('the inline SVGs survive the host-mute state changes', () => {
      const { player } = buttons();
      const onIcon = player.querySelector('.icon-sound-on');

      sound.setHostMuted(true);
      settings.updateSoundToggleButtons();
      sound.setHostMuted(false);
      settings.updateSoundToggleButtons();

      expect(player.querySelector('.icon-sound-on')).toBe(onIcon);
    });
  });

  test('a stored mute renders as "off" on both buttons', () => {
    settings.setSoundManager(fakeSoundManager(false));

    settings.updateSoundToggleButtons();

    const { header, player } = buttons();
    expect(header.dataset.iconState).toBe('off');
    expect(player.dataset.iconState).toBe('off');
  });
});
