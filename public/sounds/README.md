# Sound Effects

This folder contains audio files for quiz events. The SoundManager supports **sound pools** - multiple sounds per event type with random selection for variety.

## Adding Sounds

1. Drop your sound files (`.wav`, `.mp3`, `.ogg`) into this folder
2. Edit `public/js/audio/sound-manager.js` and add files to the appropriate pool:

```javascript
soundPools = {
    correctAnswer: [
        'sounds/smw_power-up.wav',
        'sounds/correct-1.wav',    // Add your files here
        'sounds/correct-2.wav',
    ],
    wrongAnswer: [
        'sounds/smb2_bonus_chance_lose.wav',
        'sounds/wrong-1.wav',
    ],
    // ... other pools
}
```

## Available Sound Pools

| Pool Key | Triggered When |
|----------|----------------|
| `correctAnswer` | Player answers correctly |
| `wrongAnswer` | Player answers incorrectly |
| `gameStart` | Quiz game begins |
| `questionStart` | New question appears |
| `gameComplete` | Quiz ends |
| `playerJoin` | Player joins lobby (pool not read, see below) |
| `playerLeave` | Player leaves game (pool not read, see below) |
| `timerTick` | Timer countdown (5, 3, 2, 1 seconds) (pool not read, see below) |
| `timerExpired` | Timer reaches zero (pool not read, see below) |

Only the first five pools are played from files (`playAudioFile()`). The
`playerJoin`, `playerLeave`, `timerTick` and `timerExpired` pools are declared
but empty, and their events always play synthesized Web Audio tones
(`playPlayerJoinSound()`, `playPlayerLeaveSound()`, `playCountdownTick()`,
`playTimerExpired()`), so adding files to those four pools has no effect.

## Files in this folder

Referenced by a pool: `smw_power-up.wav` (correctAnswer),
`smb2_bonus_chance_lose.wav` (wrongAnswer), `smb2_bonus_chance_start.wav`
(gameStart), `smb3_nspade_match.wav` (questionStart), `smw_castle_clear.wav`
(gameComplete).

Not referenced anywhere in the code: `bell-notification.mp3`,
`correct-answer.mp3`, `game-complete.mp3`, `question-start.mp3`,
`wrong-answer.mp3`.

## File Naming Convention

Suggested naming: `{event}-{number}.{ext}`

Examples:
- `correct-1.wav`, `correct-2.wav`, `correct-3.wav`
- `wrong-1.mp3`, `wrong-2.mp3`
- `join-chime.wav`

## Runtime API

You can also add sounds dynamically via JavaScript:

```javascript
// Add a sound to a pool
soundManager.addSoundToPool('correctAnswer', 'sounds/my-sound.wav');

// Remove a sound from a pool
soundManager.removeSoundFromPool('correctAnswer', 'sounds/old-sound.wav');

// Get all sounds in a pool
const sounds = soundManager.getSoundPool('correctAnswer');
```

## Notes

- Sounds are preloaded on first user interaction for instant playback
- If a file fails to load or play, the five file-backed events fall back to
  synthetic (generated) sounds (`playFallbackSound()`). If one of those pools
  is empty, nothing plays.
- Keep files small (<500KB) for fast loading
- Supported formats: WAV (best quality), MP3 (smaller), OGG (good compression)
