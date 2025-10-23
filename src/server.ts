import { Server } from "http";
import app from "./app";
import { PrismaConnection } from "./app/db/prismaConnection";
import config from "./config/index";
import { initializeCronJobs } from "./utils/cron";
import { initializeEventListeners } from "./utils/events/loader";
import logger from "./utils/logger";
import { disconnectPrisma } from "./utils/prisma";

const port = config.port || 5000;

let server: Server;

async function main() {
  try {
    // Initialize database and seed admin
    await PrismaConnection();

    // Initialize event listeners
    initializeEventListeners();
    logger.info("📡 Event system initialized");

    // Initialize cron jobs
    if (config.NODE_ENV === "production" || config.NODE_ENV === "development") {
      initializeCronJobs();
      logger.info("⏰ Cron jobs initialized");
    }

    // Start server
    server = app.listen(port, () => {
      logger.info(`🚀 Server is running on port ${port}`);
      logger.info(`📝 Environment: ${config.NODE_ENV}`);
      logger.info(`📚 API Docs: http://localhost:${port}/api-docs`);
      logger.info(`❤️  Health Check: http://localhost:${port}/health`);
    });
  } catch (error) {
    logger.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

/**
 * Graceful shutdown handler
 */
const gracefulShutdown = async (signal: string) => {
  logger.info(`\n🛑 ${signal} received. Starting graceful shutdown...`);

  if (server) {
    server.close(async () => {
      logger.info("✅ HTTP server closed");

      try {
        // Disconnect Prisma
        await disconnectPrisma();

        logger.info("✅ Graceful shutdown completed");
        process.exit(0);
      } catch (error) {
        logger.error("❌ Error during shutdown:", error);
        process.exit(1);
      }
    });

    // Force shutdown after 30 seconds
    setTimeout(() => {
      logger.error("⚠️  Forcing shutdown after timeout");
      process.exit(1);
    }, 30000);
  } else {
    process.exit(0);
  }
};

// Handle uncaught exceptions
process.on("uncaughtException", (error: Error) => {
  logger.error("❌ UNCAUGHT EXCEPTION! Shutting down...", {
    error: error.message,
    stack: error.stack,
  });
  gracefulShutdown("UNCAUGHT EXCEPTION");
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason: any) => {
  logger.error("❌ UNHANDLED REJECTION! Shutting down...", {
    reason: reason?.message || reason,
  });
  gracefulShutdown("UNHANDLED REJECTION");
});

// Handle termination signals
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Start the server
main();
