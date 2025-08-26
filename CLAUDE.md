# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with this repository.

## Project Overview

**Quizix Pro** - Advanced interactive quiz platform for local networks with mobile optimization, cloud deployment, and modern ES6 architecture.

**Status**: Production-ready with comprehensive mobile optimizations, unified error handling, and Railway cloud deployment.

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
- `services/cors-validation-service.js` - CORS validation

## Development Guidelines

**Critical Rules:**
1. **Always check imports/exports** before deleting functions
2. **Search entire codebase** for function usage before removing code
3. **Never clear innerHTML** of containers with required child elements
4. **Use logger instead of console** for all debugging
5. **Test imports after refactoring** utility files

**Best Practices:**
- Keep functions focused on single responsibilities
- Use ES6 modules with proper imports/exports
- Preserve DOM structure in manipulations
- Document complex algorithms

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

## Debug Tools

**Available Tools:**
- `http://localhost:3000/debug/ui-debug-showcase.html` - Primary debug tool
- `http://localhost:3000/debug/advanced-ui-debugger.html` - Advanced features

**Features:**
- Real game state simulation with `UIStateManager.setState()`
- Mobile viewport testing
- Theme switching
- Header visibility verification

## Server Notes

- Server runs on port 3000 by default
- No hot reload - refresh browser after JS changes
- **Important**: Server is currently running - no need to restart

## Security

- Designed for local network use
- AES-GCM encryption for API keys
- CORS configured for local network access
- Image upload restrictions with size limits