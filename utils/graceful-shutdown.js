/**
 * Graceful Shutdown Handler
 * Ensures clean shutdown of server resources on termination signals
 */

class GracefulShutdown {
    constructor(logger, options = {}) {
        this.logger = logger;
        this.server = null;
        this.io = null;
        this.services = [];
        this.forceTimeout = options.forceTimeout || 10000;
        this.isShuttingDown = false;
    }

    /**
     * Register the HTTP server for graceful shutdown
     * @param {object} server - HTTP server instance
     */
    setServer(server) {
        this.server = server;
    }

    /**
     * Register Socket.IO server for graceful shutdown
     * @param {object} io - Socket.IO server instance
     */
    setSocketIO(io) {
        this.io = io;
    }

    /**
     * Register a service with shutdown handler
     * Services must implement a shutdown() or stopPeriodicCleanup() method
     * @param {object} service - Service instance
     * @param {string} name - Service name for logging
     */
    registerService(service, name) {
        this.services.push({ service, name });
    }

    /**
     * Perform graceful shutdown
     * @param {string} signal - The signal that triggered shutdown
     */
    async shutdown(signal) {
        if (this.isShuttingDown) {
            this.logger.warn('Shutdown already in progress...');
            return;
        }

        this.isShuttingDown = true;
        this.logger.info(`Received ${signal}. Shutting down gracefully...`);

        // Set force shutdown timer
        const forceTimer = setTimeout(() => {
            this.logger.warn(`Forcing server shutdown after ${this.forceTimeout}ms...`);
            process.exit(1);
        }, this.forceTimeout);

        try {
            // Stop accepting new HTTP connections
            if (this.server) {
                await new Promise((resolve) => {
                    this.server.close(() => {
                        this.logger.info('HTTP server closed');
                        resolve();
                    });
                });
            }

            // Close Socket.IO connections
            if (this.io) {
                await new Promise((resolve) => {
                    this.io.close(() => {
                        this.logger.info('Socket.IO server closed');
                        resolve();
                    });
                });
            }

            // Shutdown all registered services
            for (const { service, name } of this.services) {
                try {
                    if (typeof service.shutdown === 'function') {
                        service.shutdown();
                    } else if (typeof service.stopPeriodicCleanup === 'function') {
                        service.stopPeriodicCleanup();
                    } else if (typeof service.stopCleanup === 'function') {
                        service.stopCleanup();
                    } else if (typeof service.clear === 'function') {
                        service.clear();
                    }
                    this.logger.info(`${name} shutdown complete`);
                } catch (error) {
                    this.logger.error(`Error shutting down ${name}:`, error);
                }
            }

            clearTimeout(forceTimer);
            this.logger.info('Server shutdown complete');
            process.exit(0);
        } catch (error) {
            this.logger.error('Error during graceful shutdown:', error);
            clearTimeout(forceTimer);
            process.exit(1);
        }
    }

    /**
     * Register all process signal handlers
     */
    registerSignalHandlers() {
        const signals = ['SIGINT', 'SIGTERM', 'SIGQUIT'];

        for (const signal of signals) {
            process.on(signal, () => this.shutdown(signal));
        }

        process.on('uncaughtException', (error) => {
            this.logger.error('Uncaught Exception:', error);
            this.shutdown('uncaughtException');
        });

        process.on('unhandledRejection', (reason, promise) => {
            this.logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
            this.shutdown('unhandledRejection');
        });

        // Handle Windows-specific signals
        if (process.platform === 'win32') {
            const readline = require('readline');
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });

            rl.on('SIGINT', () => {
                this.shutdown('SIGINT');
            });
        }
    }
}

module.exports = { GracefulShutdown };
