/**
 * Sound Manager Module
 * Handles all audio and sound effects for the quiz application
 * 
 * EXTRACTION NOTES:
 * - Extracted from script.js lines 2069-2130, 3708-3773
 * - Includes Web Audio API integration with fallbacks
 * - Manages question start sounds, answer submission feedback, and victory fanfares
 * - Browser compatibility handling for webkit audio contexts
 * - Dependencies: None (standalone module)
 */

import { logger, AUDIO, TIMING } from '../core/config.js';

export class SoundManager {
    constructor() {
        this.audioContext = null;
        this.soundsEnabled = true;
        this.audioCache = new Map();
        this.initializeSounds();
    }

    initializeSounds() {
        // Don't create AudioContext immediately - wait for user interaction
        this.audioContext = null;
        this.soundsEnabled = true;
        this.audioContextClass = null;
        
        // Define sound file paths
        this.soundFiles = {
            correctAnswer: 'sounds/smw_power-up.wav',
            wrongAnswer: 'sounds/smb2_bonus_chance_lose.wav',
            gameStart: 'sounds/smb2_bonus_chance_start.wav',
            questionStart: 'sounds/smb3_nspade_match.wav',
            gameComplete: 'sounds/smw_castle_clear.wav',
            bellNotification: 'sounds/bell-notification.mp3'
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
        } catch (e) {
            logger.debug('Web Audio API not supported');
            this.soundsEnabled = false;
        }
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
                audio.addEventListener('canplaythrough', () => {
                    this.audioCache.set(url, audio);
                    resolve(audio);
                });
                audio.addEventListener('error', reject);
            });
        } catch (e) {
            logger.debug('Failed to load audio file:', url, e);
            return null;
        }
    }

    async playAudioFile(soundKey, volume = 0.1) {
        if (!this.soundsEnabled) return;
        
        const soundUrl = this.soundFiles[soundKey];
        if (!soundUrl) {
            logger.debug('Unknown sound key:', soundKey);
            return;
        }

        try {
            let audio = this.audioCache.get(soundUrl);
            
            if (!audio) {
                audio = await this.loadAudioFile(soundUrl);
            }
            
            if (audio) {
                // Clone the audio for concurrent playback
                const audioClone = audio.cloneNode();
                audioClone.volume = volume;
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
            case 'bellNotification':
                this.playAnswerSubmissionSynthetic();
                break;
            default:
                this.playEnhancedSound(800, 0.2, 'triangle', 0.1);
        }
    }

    playSound(frequency, duration, type = 'sine') {
        if (!this.soundsEnabled) return;
        
        // Create AudioContext on first use (after user interaction)
        if (!this.audioContext && this.audioContextClass) {
            try {
                this.audioContext = new this.audioContextClass();
                logger.debug('AudioContext created on first use');
            } catch (e) {
                logger.debug('Failed to create AudioContext on first use:', e);
                this.soundsEnabled = false;
                return;
            }
        }
        
        if (!this.audioContext) return;
        
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
            
            gainNode.gain.setValueAtTime(0.05, this.audioContext.currentTime); // Reduced volume
            gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);
            
            oscillator.start(this.audioContext.currentTime);
            oscillator.stop(this.audioContext.currentTime + duration);
        } catch (e) {
            logger.debug('Sound playback failed:', e);
        }
    }

    playEnhancedSound(frequency, duration, type = 'sine', volume = 0.05) {
        if (!this.soundsEnabled) return;
        
        // Create AudioContext on first use (after user interaction)
        if (!this.audioContext && this.audioContextClass) {
            try {
                this.audioContext = new this.audioContextClass();
                logger.debug('AudioContext created on first use for enhanced sound');
            } catch (e) {
                logger.debug('Failed to create AudioContext for enhanced sound:', e);
                this.soundsEnabled = false;
                return;
            }
        }
        
        if (!this.audioContext) return;
        
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
            
            // Enhanced volume envelope for smoother, more pleasant sounds
            const startTime = this.audioContext.currentTime;
            const endTime = startTime + duration;
            
            // Quick fade in
            gainNode.gain.setValueAtTime(0, startTime);
            gainNode.gain.linearRampToValueAtTime(volume * 0.5, startTime + 0.01);
            
            // Sustain
            gainNode.gain.setValueAtTime(volume * 0.5, endTime - 0.1);
            
            // Smooth fade out
            gainNode.gain.exponentialRampToValueAtTime(0.001, endTime);
            
            oscillator.start(startTime);
            oscillator.stop(endTime);
        } catch (e) {
            logger.debug('Enhanced sound playback failed:', e);
        }
    }

    playVictorySound() {
        if (!this.soundsEnabled) return;
        
        // Ensure AudioContext exists before playing
        if (!this.audioContext && this.audioContextClass) {
            this.playSound(0, 0); // This will create the context
        }
        if (!this.audioContext) return;
        
        try {
            // Simplified victory melody - fewer notes for better performance
            const notes = [
                { freq: 523, time: 0, duration: 0.3 },     // C
                { freq: 659, time: 0.15, duration: 0.3 },  // E
                { freq: 784, time: 0.3, duration: 0.4 },   // G
                { freq: 1047, time: 0.5, duration: 0.5 }   // C (higher) - finale
            ];
            
            notes.forEach(note => {
                setTimeout(() => {
                    this.playEnhancedSound(note.freq, note.duration, 'triangle', 0.12);
                }, note.time * 1000);
            });
        } catch (e) {
            logger.debug('Victory sound playback failed:', e);
        }
    }


    // Main sound effect methods - use audio files with fallback to synthetic
    playQuestionStartSound() {
        logger.debug('🔊 Playing question start sound');
        this.playAudioFile('questionStart', 0.6);
    }

    playAnswerSubmissionSound() {
        logger.debug('🔊 Playing answer submission sound');
        this.playAudioFile('bellNotification', 0.4);
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

    // Synthetic fallback methods
    playQuestionStartSynthetic() {
        // Attention-getting but pleasant question start sound
        this.playEnhancedSound(800, 0.25, 'triangle', 0.1); // Warmer triangle wave
    }

    playAnswerSubmissionSynthetic() {
        // Pleasant confirmation sound for answer submission
        this.playEnhancedSound(600, 0.15, 'sine', 0.12); // Softer, shorter confirmation
    }

    playCorrectAnswerSynthetic() {
        logger.debug('🔊 Playing correct answer sound (pleasant ascending melody)');
        // Beautiful correct answer melody - uplifting and rewarding
        // Play a pleasant ascending melody with harmonics
        const correctMelody = [
            { freq: 523, time: 0, duration: 0.25, type: 'sine' },      // C4
            { freq: 659, time: 0.1, duration: 0.25, type: 'sine' },    // E4
            { freq: 784, time: 0.2, duration: 0.4, type: 'sine' },     // G4
            { freq: 1047, time: 0.35, duration: 0.5, type: 'triangle' } // C5 (octave higher)
        ];
        
        correctMelody.forEach(note => {
            setTimeout(() => {
                this.playEnhancedSound(note.freq, note.duration, note.type, 0.15);
            }, note.time * 1000);
        });
        
        // Add a subtle harmonic accompaniment
        setTimeout(() => {
            this.playEnhancedSound(523, 0.6, 'triangle', 0.08); // Bass C
        }, 100);
    }

    playIncorrectAnswerSynthetic() {
        logger.debug('🔊 Playing incorrect answer sound (gentle disappointed tone)');
        // Gentle incorrect answer sound - not harsh, just mildly disappointed
        // Two-tone descending pattern that's informative but not punishing
        const incorrectTones = [
            { freq: 400, time: 0, duration: 0.3, type: 'sine' },       // F4 (softer than original)
            { freq: 350, time: 0.2, duration: 0.4, type: 'triangle' }  // F3 (gentler descent)
        ];
        
        incorrectTones.forEach(note => {
            setTimeout(() => {
                this.playEnhancedSound(note.freq, note.duration, note.type, 0.12);
            }, note.time * 1000);
        });
    }

    playGameStartSynthetic() {
        logger.debug('🔊 Playing game start sound (synthetic)');
        // Exciting game start fanfare - energetic and welcoming
        const startMelody = [
            { freq: 392, time: 0, duration: 0.2, type: 'sine' },      // G4
            { freq: 523, time: 0.15, duration: 0.2, type: 'sine' },   // C5
            { freq: 659, time: 0.3, duration: 0.3, type: 'triangle' }, // E5
            { freq: 784, time: 0.5, duration: 0.4, type: 'triangle' }  // G5 - triumphant ending
        ];
        
        startMelody.forEach(note => {
            setTimeout(() => {
                this.playEnhancedSound(note.freq, note.duration, note.type, 0.15);
            }, note.time * 1000);
        });
    }

    playGameEndingFanfareSynthetic() {
        if (!this.soundsEnabled) return;
        
        // Ensure AudioContext exists before playing
        if (!this.audioContext && this.audioContextClass) {
            this.playSound(0, 0); // This will create the context
        }
        if (!this.audioContext) return;
        
        try {
            // Play an elaborate game ending fanfare (triumph-like melody)
            const fanfareNotes = [
                // Opening triumphant notes
                { freq: 523, time: 0, duration: 0.3 },     // C
                { freq: 659, time: 0.1, duration: 0.3 },   // E
                { freq: 784, time: 0.2, duration: 0.3 },   // G
                { freq: 1047, time: 0.3, duration: 0.4 },  // C (higher)
                
                // Rising sequence
                { freq: 659, time: 0.8, duration: 0.2 },   // E
                { freq: 784, time: 1.0, duration: 0.2 },   // G
                { freq: 1047, time: 1.2, duration: 0.2 },  // C
                { freq: 1319, time: 1.4, duration: 0.4 },  // E (higher)
                
                // Grand finale
                { freq: 1047, time: 2.0, duration: 0.3 },  // C
                { freq: 1319, time: 2.2, duration: 0.3 },  // E
                { freq: 1568, time: 2.4, duration: 0.6 },  // G (highest)
                { freq: 2093, time: 2.8, duration: 0.8 }   // C (very high)
            ];
            
            fanfareNotes.forEach(note => {
                setTimeout(() => {
                    this.playSound(note.freq, note.duration, 'triangle');
                }, note.time * 1000);
            });
            
            // Add some harmonic accompaniment
            setTimeout(() => {
                this.playSound(523, 1.5, 'sawtooth'); // Bass C
                setTimeout(() => this.playSound(659, 1.0, 'sawtooth'), 500);
                setTimeout(() => this.playSound(784, 1.2, 'sawtooth'), 1000);
            }, 1500);
            
        } catch (e) {
            logger.debug('Game ending fanfare playback failed:', e);
        }
    }

    // Utility methods
    isEnabled() {
        return this.soundsEnabled && (this.audioContext !== null || this.audioContextClass !== null);
    }

    enable() {
        this.soundsEnabled = true;
        // AudioContext will be created on first sound play
        // This prevents the browser warning about AudioContext not being allowed to start
    }

    disable() {
        this.soundsEnabled = false;
    }

    // Resume audio context if suspended (required for some browsers)
    async resumeAudioContext() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            try {
                await this.audioContext.resume();
                logger.debug('Audio context resumed');
            } catch (e) {
                logger.debug('Failed to resume audio context:', e);
            }
        }
    }
}