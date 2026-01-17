/**
 * Sound Manager Module
 * Handles all audio and sound effects for the quiz application
 *
 * FEATURES:
 * - Web Audio API integration with fallbacks
 * - Volume persistence to localStorage
 * - Sound preloading for instant playback
 * - Timer countdown sounds
 * - Player join/leave sounds
 * - Leaderboard placement sounds
 * - Mobile audio gesture handling
 * - Mute functionality
 * - Proper cleanup/destroy method
 */

import { logger } from '../core/config.js';
import { getJSON, setJSON } from '../utils/storage-utils.js';

// Storage key for audio settings
const AUDIO_SETTINGS_KEY = 'quizAudioSettings';

// Default audio settings
const DEFAULT_SETTINGS = {
    masterVolume: 0.5,
    soundsEnabled: true
};

export class SoundManager {
    constructor() {
        this.audioContext = null;
        this.audioContextClass = null;
        this.audioCache = new Map();
        this.activeOscillators = new Set();
        this.isPreloaded = false;
        this.audioUnlocked = false;

        // Load persisted settings
        this.settings = this.loadSettings();

        // Bind methods for event listeners
        this._boundUnlockAudio = this.unlockAudio.bind(this);

        // Initialize
        this.initializeSounds();
    }

    /**
     * Load audio settings from localStorage
     */
    loadSettings() {
        const stored = getJSON(AUDIO_SETTINGS_KEY);
        return stored ? { ...DEFAULT_SETTINGS, ...stored } : { ...DEFAULT_SETTINGS };
    }

    /**
     * Save audio settings to localStorage
     */
    saveSettings() {
        setJSON(AUDIO_SETTINGS_KEY, this.settings);
    }

    /**
     * Check if sounds are enabled
     */
    isSoundsEnabled() {
        return this.settings.soundsEnabled;
    }

    /**
     * Mute all sounds
     */
    mute() {
        this.settings.soundsEnabled = false;
        this.saveSettings();
        logger.debug('Audio muted');
    }

    /**
     * Unmute all sounds
     */
    unmute() {
        this.settings.soundsEnabled = true;
        this.saveSettings();
        logger.debug('Audio unmuted');
    }

    initializeSounds() {
        this.audioContext = null;
        this.audioContextClass = null;

        // Define sound file paths
        this.soundFiles = {
            correctAnswer: 'sounds/smw_power-up.wav',
            wrongAnswer: 'sounds/smb2_bonus_chance_lose.wav',
            gameStart: 'sounds/smb2_bonus_chance_start.wav',
            questionStart: 'sounds/smb3_nspade_match.wav',
            gameComplete: 'sounds/smw_castle_clear.wav'
        };

        try {
            // Check if Web Audio API is supported without creating context
            if (window.AudioContext) {
                this.audioContextClass = window.AudioContext;
            } else if (window.webkitAudioContext) {
                this.audioContextClass = window.webkitAudioContext;
            } else {
                throw new Error('Web Audio API not supported');
            }

            logger.debug('Web Audio API supported, AudioContext will be created on first use');

            // Setup mobile audio unlock listeners
            this.setupMobileAudioUnlock();

        } catch (_e) {
            logger.debug('Web Audio API not supported');
            this.settings.soundsEnabled = false;
        }
    }

    /**
     * Setup listeners to unlock audio on mobile devices
     * Mobile browsers require user gesture before playing audio
     */
    setupMobileAudioUnlock() {
        const events = ['touchstart', 'touchend', 'mousedown', 'keydown', 'click'];

        events.forEach(event => {
            document.addEventListener(event, this._boundUnlockAudio, { once: false, passive: true });
        });
    }

    /**
     * Unlock audio context on user interaction (required for mobile)
     */
    async unlockAudio() {
        if (this.audioUnlocked) return;

        try {
            // Create AudioContext if needed
            if (!this.audioContext && this.audioContextClass) {
                this.audioContext = new this.audioContextClass();
                logger.debug('AudioContext created on user gesture');
            }

            // Resume if suspended
            if (this.audioContext && this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
                logger.debug('AudioContext resumed');
            }

            // Play a silent buffer to fully unlock
            if (this.audioContext) {
                const buffer = this.audioContext.createBuffer(1, 1, 22050);
                const source = this.audioContext.createBufferSource();
                source.buffer = buffer;
                source.connect(this.audioContext.destination);
                source.start(0);
            }

            this.audioUnlocked = true;

            // Remove unlock listeners
            const events = ['touchstart', 'touchend', 'mousedown', 'keydown', 'click'];
            events.forEach(event => {
                document.removeEventListener(event, this._boundUnlockAudio);
            });

            // Preload sounds after unlock
            if (!this.isPreloaded) {
                this.preloadSounds();
            }

            logger.debug('Audio unlocked successfully');
        } catch (e) {
            logger.debug('Failed to unlock audio:', e);
        }
    }

    /**
     * Preload all sound files for instant playback
     */
    async preloadSounds() {
        if (this.isPreloaded) return;

        logger.debug('Preloading sound files...');

        const loadPromises = Object.values(this.soundFiles).map(url =>
            this.loadAudioFile(url).catch(e => {
                logger.debug(`Failed to preload ${url}:`, e);
                return null;
            })
        );

        await Promise.all(loadPromises);
        this.isPreloaded = true;

        logger.debug(`Preloaded ${this.audioCache.size} sound files`);
    }

    async loadAudioFile(url) {
        if (this.audioCache.has(url)) {
            return this.audioCache.get(url);
        }

        try {
            const audio = new Audio(url);
            audio.preload = 'auto';

            // Return promise that resolves when audio can play
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Audio load timeout'));
                }, 10000);

                audio.addEventListener('canplaythrough', () => {
                    clearTimeout(timeout);
                    this.audioCache.set(url, audio);
                    resolve(audio);
                }, { once: true });

                audio.addEventListener('error', (e) => {
                    clearTimeout(timeout);
                    reject(e);
                }, { once: true });

                // Start loading
                audio.load();
            });
        } catch (e) {
            logger.debug('Failed to load audio file:', url, e);
            return null;
        }
    }

    /**
     * Calculate effective volume with master volume applied
     */
    getEffectiveVolume(baseVolume) {
        return baseVolume * this.settings.masterVolume;
    }

    async playAudioFile(soundKey, volume = 0.1) {
        if (!this.settings.soundsEnabled) return;

        const soundUrl = this.soundFiles[soundKey];
        if (!soundUrl) {
            logger.debug('Unknown sound key:', soundKey);
            return;
        }

        const effectiveVolume = this.getEffectiveVolume(volume);

        try {
            let audio = this.audioCache.get(soundUrl);

            if (!audio) {
                audio = await this.loadAudioFile(soundUrl);
            }

            if (audio) {
                // Clone the audio for concurrent playback
                const audioClone = audio.cloneNode();
                audioClone.volume = effectiveVolume;
                audioClone.currentTime = 0;

                const playPromise = audioClone.play();
                if (playPromise !== undefined) {
                    playPromise.catch(e => {
                        logger.debug('Audio playback failed:', e);
                    });
                }
            }
        } catch (e) {
            logger.debug('Failed to play audio file:', soundKey, e);
            // Fallback to synthetic sound
            this.playFallbackSound(soundKey);
        }
    }

    playFallbackSound(soundKey) {
        // Fallback to original synthetic sounds if audio files fail
        switch (soundKey) {
            case 'correctAnswer':
                this.playCorrectAnswerSynthetic();
                break;
            case 'wrongAnswer':
                this.playIncorrectAnswerSynthetic();
                break;
            case 'questionStart':
                this.playQuestionStartSynthetic();
                break;
            case 'gameComplete':
                this.playGameEndingFanfareSynthetic();
                break;
            case 'gameStart':
                this.playGameStartSynthetic();
                break;
            default:
                this.playEnhancedSound(800, 0.2, 'triangle', 0.1);
        }
    }

    /**
     * Ensure AudioContext is ready before playing
     */
    ensureAudioContext() {
        if (!this.settings.soundsEnabled) return false;

        if (!this.audioContext && this.audioContextClass) {
            try {
                this.audioContext = new this.audioContextClass();
                logger.debug('AudioContext created');
            } catch (e) {
                logger.debug('Failed to create AudioContext:', e);
                return false;
            }
        }

        return !!this.audioContext;
    }

    playSound(frequency, duration, type = 'sine') {
        if (!this.ensureAudioContext()) return;

        try {
            // Validate parameters
            if (!isFinite(frequency) || frequency <= 0) {
                logger.debug('Invalid frequency:', frequency);
                return;
            }
            if (!isFinite(duration) || duration <= 0) {
                logger.debug('Invalid duration:', duration);
                return;
            }

            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);

            oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
            oscillator.type = type;

            const effectiveVolume = this.getEffectiveVolume(0.05);
            gainNode.gain.setValueAtTime(effectiveVolume, this.audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);

            oscillator.start(this.audioContext.currentTime);
            oscillator.stop(this.audioContext.currentTime + duration);

            // Track for cleanup
            this.activeOscillators.add(oscillator);
            oscillator.onended = () => this.activeOscillators.delete(oscillator);

        } catch (e) {
            logger.debug('Sound playback failed:', e);
        }
    }

    playEnhancedSound(frequency, duration, type = 'sine', volume = 0.05) {
        if (!this.ensureAudioContext()) return;

        try {
            // Validate parameters
            if (!isFinite(frequency) || frequency <= 0) return;
            if (!isFinite(duration) || duration <= 0) return;

            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);

            oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
            oscillator.type = type;

            const effectiveVolume = this.getEffectiveVolume(volume);
            const startTime = this.audioContext.currentTime;
            const endTime = startTime + duration;

            // Quick fade in
            gainNode.gain.setValueAtTime(0, startTime);
            gainNode.gain.linearRampToValueAtTime(effectiveVolume * 0.5, startTime + 0.01);

            // Sustain and fade out (handle short durations)
            const sustainTime = Math.max(startTime + 0.02, endTime - 0.1);
            gainNode.gain.setValueAtTime(effectiveVolume * 0.5, sustainTime);

            // Smooth fade out
            gainNode.gain.exponentialRampToValueAtTime(0.001, endTime);

            oscillator.start(startTime);
            oscillator.stop(endTime);

            // Track for cleanup
            this.activeOscillators.add(oscillator);
            oscillator.onended = () => this.activeOscillators.delete(oscillator);

        } catch (e) {
            logger.debug('Enhanced sound playback failed:', e);
        }
    }

    // ==========================================
    // TIMER COUNTDOWN SOUNDS
    // ==========================================

    /**
     * Play countdown tick sound for remaining seconds
     * @param {number} secondsRemaining - Seconds left on timer
     */
    playCountdownTick(secondsRemaining) {
        if (!this.settings.soundsEnabled) return;

        // Only play for 5, 3, 2, 1 seconds
        if (![5, 3, 2, 1].includes(secondsRemaining)) return;

        const frequencies = {
            5: 440,  // A4
            3: 523,  // C5
            2: 587,  // D5
            1: 784   // G5 - highest urgency
        };

        const freq = frequencies[secondsRemaining];
        const duration = secondsRemaining === 1 ? 0.4 : 0.15;
        const volume = secondsRemaining === 1 ? 0.2 : 0.12;

        this.playEnhancedSound(freq, duration, 'sine', volume);

        // Add urgency beeps for final second
        if (secondsRemaining === 1) {
            setTimeout(() => {
                if (this.settings.soundsEnabled) this.playEnhancedSound(784, 0.1, 'sine', 0.15);
            }, 200);
            setTimeout(() => {
                if (this.settings.soundsEnabled) this.playEnhancedSound(880, 0.15, 'sine', 0.18);
            }, 400);
        }
    }

    /**
     * Play timer expired sound
     */
    playTimerExpired() {
        if (!this.settings.soundsEnabled) return;

        // Descending buzzer-like sound
        this.playEnhancedSound(600, 0.2, 'square', 0.15);
        setTimeout(() => {
            if (this.settings.soundsEnabled) this.playEnhancedSound(400, 0.3, 'square', 0.12);
        }, 150);
    }

    // ==========================================
    // PLAYER JOIN/LEAVE SOUNDS
    // ==========================================

    /**
     * Play sound when a player joins the game
     */
    playPlayerJoinSound() {
        if (!this.settings.soundsEnabled) return;

        logger.debug('🔊 Playing player join sound');

        // Pleasant ascending chime
        const joinNotes = [
            { freq: 523, time: 0, duration: 0.15, type: 'sine' },     // C5
            { freq: 659, time: 0.08, duration: 0.15, type: 'sine' },  // E5
            { freq: 784, time: 0.16, duration: 0.2, type: 'triangle' } // G5
        ];

        joinNotes.forEach(note => {
            setTimeout(() => {
                if (this.settings.soundsEnabled) this.playEnhancedSound(note.freq, note.duration, note.type, 0.12);
            }, note.time * 1000);
        });
    }

    /**
     * Play sound when a player leaves the game
     */
    playPlayerLeaveSound() {
        if (!this.settings.soundsEnabled) return;

        logger.debug('🔊 Playing player leave sound');

        // Gentle descending tone
        this.playEnhancedSound(500, 0.15, 'sine', 0.08);
        setTimeout(() => {
            if (this.settings.soundsEnabled) this.playEnhancedSound(400, 0.2, 'sine', 0.06);
        }, 100);
    }

    // ==========================================
    // LEADERBOARD PLACEMENT SOUNDS
    // ==========================================

    /**
     * Play sound for leaderboard position reveal
     * @param {number} position - 1 for first, 2 for second, 3 for third
     */
    playLeaderboardPlacement(position) {
        if (!this.settings.soundsEnabled) return;

        logger.debug(`🔊 Playing placement sound for position ${position}`);

        switch (position) {
            case 1:
                this.playFirstPlaceSound();
                break;
            case 2:
                this.playSecondPlaceSound();
                break;
            case 3:
                this.playThirdPlaceSound();
                break;
            default:
                // Generic placement sound for other positions
                this.playEnhancedSound(523, 0.2, 'triangle', 0.1);
        }
    }

    playFirstPlaceSound() {
        // Grand triumphant fanfare for first place
        const melody = [
            { freq: 523, time: 0, duration: 0.2 },      // C5
            { freq: 659, time: 0.1, duration: 0.2 },    // E5
            { freq: 784, time: 0.2, duration: 0.2 },    // G5
            { freq: 1047, time: 0.3, duration: 0.3 },   // C6
            { freq: 1319, time: 0.5, duration: 0.4 },   // E6
            { freq: 1568, time: 0.7, duration: 0.5 }    // G6 - triumphant high note
        ];

        melody.forEach(note => {
            setTimeout(() => {
                if (this.settings.soundsEnabled) this.playEnhancedSound(note.freq, note.duration, 'triangle', 0.18);
            }, note.time * 1000);
        });

        // Add bass accompaniment
        setTimeout(() => {
            if (this.settings.soundsEnabled) this.playEnhancedSound(262, 0.6, 'sine', 0.1);
        }, 200);
    }

    playSecondPlaceSound() {
        // Nice ascending melody for second place
        const melody = [
            { freq: 440, time: 0, duration: 0.15 },     // A4
            { freq: 523, time: 0.1, duration: 0.15 },   // C5
            { freq: 659, time: 0.2, duration: 0.2 },    // E5
            { freq: 784, time: 0.35, duration: 0.3 }    // G5
        ];

        melody.forEach(note => {
            setTimeout(() => {
                if (this.settings.soundsEnabled) this.playEnhancedSound(note.freq, note.duration, 'triangle', 0.14);
            }, note.time * 1000);
        });
    }

    playThirdPlaceSound() {
        // Simple pleasant chime for third place
        const melody = [
            { freq: 392, time: 0, duration: 0.15 },     // G4
            { freq: 494, time: 0.1, duration: 0.15 },   // B4
            { freq: 587, time: 0.2, duration: 0.25 }    // D5
        ];

        melody.forEach(note => {
            setTimeout(() => {
                if (this.settings.soundsEnabled) this.playEnhancedSound(note.freq, note.duration, 'triangle', 0.12);
            }, note.time * 1000);
        });
    }

    // ==========================================
    // MAIN SOUND EFFECT METHODS
    // ==========================================

    playVictorySound() {
        if (!this.ensureAudioContext()) return;

        try {
            // Simplified victory melody
            const notes = [
                { freq: 523, time: 0, duration: 0.3 },
                { freq: 659, time: 0.15, duration: 0.3 },
                { freq: 784, time: 0.3, duration: 0.4 },
                { freq: 1047, time: 0.5, duration: 0.5 }
            ];

            notes.forEach(note => {
                setTimeout(() => {
                    if (this.settings.soundsEnabled) this.playEnhancedSound(note.freq, note.duration, 'triangle', 0.12);
                }, note.time * 1000);
            });
        } catch (e) {
            logger.debug('Victory sound playback failed:', e);
        }
    }

    playQuestionStartSound() {
        logger.debug('🔊 Playing question start sound');
        this.playAudioFile('questionStart', 0.6);
    }

    playCorrectAnswerSound() {
        logger.debug('🔊 Playing correct answer sound');
        this.playAudioFile('correctAnswer', 0.7);
    }

    playIncorrectAnswerSound() {
        logger.debug('🔊 Playing incorrect answer sound');
        this.playAudioFile('wrongAnswer', 0.6);
    }

    playGameEndingFanfare() {
        logger.debug('🔊 Playing game ending fanfare');
        this.playAudioFile('gameComplete', 0.8);
    }

    playGameStartSound() {
        logger.debug('🔊 Playing game start sound');
        this.playAudioFile('gameStart', 0.7);
    }

    // ==========================================
    // SYNTHETIC FALLBACK METHODS
    // ==========================================

    playQuestionStartSynthetic() {
        this.playEnhancedSound(800, 0.25, 'triangle', 0.1);
    }

    playCorrectAnswerSynthetic() {
        logger.debug('🔊 Playing correct answer sound (synthetic)');
        const correctMelody = [
            { freq: 523, time: 0, duration: 0.25, type: 'sine' },
            { freq: 659, time: 0.1, duration: 0.25, type: 'sine' },
            { freq: 784, time: 0.2, duration: 0.4, type: 'sine' },
            { freq: 1047, time: 0.35, duration: 0.5, type: 'triangle' }
        ];

        correctMelody.forEach(note => {
            setTimeout(() => {
                if (this.settings.soundsEnabled) this.playEnhancedSound(note.freq, note.duration, note.type, 0.15);
            }, note.time * 1000);
        });

        setTimeout(() => {
            if (this.settings.soundsEnabled) this.playEnhancedSound(523, 0.6, 'triangle', 0.08);
        }, 100);
    }

    playIncorrectAnswerSynthetic() {
        logger.debug('🔊 Playing incorrect answer sound (synthetic)');
        const incorrectTones = [
            { freq: 400, time: 0, duration: 0.3, type: 'sine' },
            { freq: 350, time: 0.2, duration: 0.4, type: 'triangle' }
        ];

        incorrectTones.forEach(note => {
            setTimeout(() => {
                if (this.settings.soundsEnabled) this.playEnhancedSound(note.freq, note.duration, note.type, 0.12);
            }, note.time * 1000);
        });
    }

    playGameStartSynthetic() {
        logger.debug('🔊 Playing game start sound (synthetic)');
        const startMelody = [
            { freq: 392, time: 0, duration: 0.2, type: 'sine' },
            { freq: 523, time: 0.15, duration: 0.2, type: 'sine' },
            { freq: 659, time: 0.3, duration: 0.3, type: 'triangle' },
            { freq: 784, time: 0.5, duration: 0.4, type: 'triangle' }
        ];

        startMelody.forEach(note => {
            setTimeout(() => {
                if (this.settings.soundsEnabled) this.playEnhancedSound(note.freq, note.duration, note.type, 0.15);
            }, note.time * 1000);
        });
    }

    playGameEndingFanfareSynthetic() {
        if (!this.ensureAudioContext()) return;

        try {
            const fanfareNotes = [
                { freq: 523, time: 0, duration: 0.3 },
                { freq: 659, time: 0.1, duration: 0.3 },
                { freq: 784, time: 0.2, duration: 0.3 },
                { freq: 1047, time: 0.3, duration: 0.4 },
                { freq: 659, time: 0.8, duration: 0.2 },
                { freq: 784, time: 1.0, duration: 0.2 },
                { freq: 1047, time: 1.2, duration: 0.2 },
                { freq: 1319, time: 1.4, duration: 0.4 },
                { freq: 1047, time: 2.0, duration: 0.3 },
                { freq: 1319, time: 2.2, duration: 0.3 },
                { freq: 1568, time: 2.4, duration: 0.6 },
                { freq: 2093, time: 2.8, duration: 0.8 }
            ];

            fanfareNotes.forEach(note => {
                setTimeout(() => {
                    if (this.settings.soundsEnabled) this.playSound(note.freq, note.duration, 'triangle');
                }, note.time * 1000);
            });

            setTimeout(() => {
                if (!this.settings.soundsEnabled) return;
                this.playSound(523, 1.5, 'sawtooth');
                setTimeout(() => {
                    if (this.settings.soundsEnabled) this.playSound(659, 1.0, 'sawtooth');
                }, 500);
                setTimeout(() => {
                    if (this.settings.soundsEnabled) this.playSound(784, 1.2, 'sawtooth');
                }, 1000);
            }, 1500);

        } catch (e) {
            logger.debug('Game ending fanfare playback failed:', e);
        }
    }

    // ==========================================
    // UTILITY METHODS
    // ==========================================

    /**
     * Check if sounds are enabled and audio is available
     */
    isEnabled() {
        return this.settings.soundsEnabled && (this.audioContext !== null || this.audioContextClass !== null);
    }

    /**
     * Clean up all resources
     */
    destroy() {
        logger.debug('Destroying SoundManager...');

        // Stop all active oscillators
        this.activeOscillators.forEach(osc => {
            try {
                osc.stop();
            } catch (_e) {
                // Already stopped
            }
        });
        this.activeOscillators.clear();

        // Remove unlock listeners
        const events = ['touchstart', 'touchend', 'mousedown', 'keydown', 'click'];
        events.forEach(event => {
            document.removeEventListener(event, this._boundUnlockAudio);
        });

        // Close audio context
        if (this.audioContext) {
            try {
                this.audioContext.close();
            } catch (e) {
                logger.debug('Failed to close AudioContext:', e);
            }
        }

        // Clear caches
        this.audioCache.clear();

        // Reset state
        this.audioContext = null;
        this.isPreloaded = false;
        this.audioUnlocked = false;

        logger.debug('SoundManager destroyed');
    }
}
