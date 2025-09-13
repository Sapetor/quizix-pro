# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with this repository.

## Project Overview

**Quizix Pro** - Advanced interactive quiz platform for local networks with mobile optimization, cloud deployment, and modern ES6 architecture.

**Status**: Production-ready with comprehensive mobile optimizations, unified theme management, enhanced carousel functionality, multi-language support, and Railway cloud deployment.

## Commands

**Development:**
- `npm start` - Start production server
- `npm run dev` - Start development server with auto-restart

**Building:**
- `npm run build` - Build optimized CSS bundle
- `npm run build:prod` - Complete production build

**Debugging:**
- Logging controlled via `DEBUG.ENABLED` and `DEBUG.CURRENT_LEVEL` in `/public/js/core/config.js`
- Use `logger.debug()`, `logger.info()`, `logger.warn()`, `logger.error()` instead of console statements
- Set `DEBUG.ENABLED = false` for production builds

## Architecture

**Core Structure:**
- **Modular ES6** with proper imports/exports
- **Service-oriented** architecture with dedicated services
- **Centralized configuration** in `public/js/core/config.js`
- **Unified error handling** via `unified-error-handler.js`
- **Encrypted security** layer for sensitive data

**Key Files:**
- `public/js/game/game-manager.js` - Main game logic
- `public/js/quiz/quiz-manager.js` - Quiz creation and editing
- `public/js/core/app.js` - Application initialization
- `public/js/utils/unified-error-handler.js` - Unified error handling
- `public/js/settings/settings-manager.js` - Unified settings and theme management
- `public/js/utils/mobile-carousel.js` - Mobile quickstart carousel with auto-play
- `public/js/utils/main-menu-carousel.js` - Mobile preview carousel with auto-play
- `public/js/utils/mobile-question-carousel.js` - Mobile quiz editing carousel
- `services/cors-validation-service.js` - CORS validation

## Development Guidelines

**Critical Rules:**
1. **Always check imports/exports** before deleting functions
2. **Search entire codebase** for function usage before removing code
3. **Never clear innerHTML** of containers with required child elements
4. **Use logger instead of console** for all debugging
5. **Test imports after refactoring** utility files
6. **Check timing dependencies** - mobile carousels have delays for proper DOM population
7. **Validate translation keys** - ensure all UI elements have proper translations in all 8 languages
8. **Test zoom compatibility** - buttons and layouts should work at 150%+ zoom levels

**Best Practices:**
- Keep functions focused on single responsibilities
- Use ES6 modules with proper imports/exports
- Preserve DOM structure in manipulations
- Document complex algorithms
- Use unified SettingsManager for all theme/settings operations
- Implement auto-play carousels with intelligent pause/resume
- Handle mobile viewport differences with responsive CSS

## Production Deployment

**Pre-Production Checklist:**
- Set `DEBUG.ENABLED = false` in `/public/js/core/config.js`
- Run `npm run build` for optimized CSS
- Verify no console.log statements remain
- Test MathJax rendering on target browsers

## Railway Cloud Deployment

**Auto-Deployment Active:**
- **Trigger**: Any push to `modular-architecture` branch
- **URL**: `https://quizix-pro-production.up.railway.app`
- **Deployment time**: ~2-3 minutes
- **Branch safety**: Only `modular-architecture` triggers deploy

**Deploy Changes:**
```bash
git add .
git commit -m "Your changes"
git push origin modular-architecture  # Triggers Railway deploy
```

## Mobile Optimizations

**Recent Improvements:**
- **Quiz Alternatives Fix**: Fixed mobile quiz alternatives not appearing for calculated questions
- **Mobile Editor**: Resolved duplicate question creation without alternatives during quiz loading
- **Mobile Lobby**: Optimized QR code sizing and player list with proper scrolling
- **Responsive Design**: Fixed button overflow at 150%+ zoom levels
- **Connection Status**: Compact 32px circular design with optimized space usage

**Mobile Carousels:**
- **Quickstart Carousel**: Auto-advancing with 6-second intervals and intelligent pause/resume
- **Preview Carousel**: Enhanced auto-play with 5-second intervals and comprehensive interaction handling
- **Question Carousel**: Proper timing delays to prevent race conditions during DOM population

**Touch & Gesture Support:**
- Comprehensive swipe gesture handling for all mobile carousels
- Enhanced touch event management with passive listeners
- Desktop mouse events for testing and development

## Theme Management

**Unified System:**
- **SettingsManager**: Centralized theme management across desktop and mobile
- **Consistent Emojis**: ☀️ for light mode, 🌙 for dark mode (showing current state)
- **Multi-Button Support**: Synchronized theme toggles in header, mobile, and settings
- **Persistent Storage**: Uses `quizSettings` localStorage format

**Fixed Issues:**
- Resolved emoji inconsistency (random moon/sun variations)
- Fixed mobile theme toggle using fallback instead of SettingsManager
- Eliminated conflicting event listeners between app.js and SettingsManager
- Standardized button sizes (44x44px) with flex-shrink protection

## Internationalization

**Multi-Language Support:**
- **8 Languages**: English, Spanish, French, German, Italian, Portuguese, Polish, Japanese, Chinese
- **Translation Files**: Located in `public/js/utils/translations/`
- **Mobile Menu**: Complete translations for all mobile editor tools
- **Dynamic Updates**: Real-time language switching with UI updates

**Fixed Translation Issues:**
- Removed duplicate "tools" entries causing Polish parsing conflicts
- Added missing mobile menu keys across all languages
- Fixed shift key triggering from translation conflicts

## Debug Tools

**Available Tools:**
- `http://localhost:3000/debug/ui-debug-showcase.html` - Primary debug tool
- `http://localhost:3000/debug/advanced-ui-debugger.html` - Advanced features

**Features:**
- Real game state simulation with `UIStateManager.setState()`
- Mobile viewport testing with zoom compatibility
- Theme switching validation
- Header visibility verification
- Carousel auto-play testing

## Server Notes

- Server runs on port 3000 by default
- No hot reload - refresh browser after JS changes
- **Important**: Server is currently running - no need to restart

## Recent Fixes & Improvements

**Quiz System:**
- Fixed mobile quiz alternatives not rendering for calculated questions (`calculate(5,3)`)
- Resolved mobile editor creating duplicate questions without alternatives
- Enhanced question renderer with dynamic `.player-option` element creation

**User Interface:**
- Unified theme toggle system with consistent ☀️/🌙 emoji behavior
- Fixed Create Lobby button width consistency across zoom levels (150%+)
- Optimized connection status indicator from 110px to 32px circular design
- Standardized all control buttons to 44x44px with overflow protection

**Mobile Experience:**
- Enhanced mobile lobby with proper QR code sizing and scrollable player list
- Implemented auto-advancing carousels with intelligent pause/resume functionality
- Fixed translation system conflicts causing unintended keyboard events
- Added comprehensive touch gesture support for all interactive elements

**Translation System:**
- Complete 8-language support with missing key additions
- Fixed Polish language parsing conflicts from duplicate entries
- Enhanced mobile menu translations for all supported languages

## Security

- Designed for local network and cloud deployment
- AES-GCM encryption for API keys
- CORS configured for local network and cloud platform access
- Image upload restrictions with size limits
- I usually have the server running. Let me know that you want to restart it and I will do it, otherwise just let me check, unless I tell you to do it yourself.

## Known Patterns & Architecture Notes

**Timing Dependencies:**
- Mobile carousels require 150ms delays for proper DOM population before cloning
- Theme toggle requires DOM-based state checking for accuracy
- Auto-play carousels need proper pause/resume logic during user interactions

**File Organization:**
- Theme management centralized in `settings-manager.js`
- Mobile-specific carousels in separate utility files
- Translation files follow `/[language].js` naming convention
- All mobile UI components have corresponding CSS in `responsive.css`

**Testing Considerations:**
- Always test theme toggles across desktop and mobile variants
- Verify carousel auto-play behavior during user interactions
- Test zoom compatibility at 150%+ levels for layout integrity
- Validate translation keys across all 8 supported languages