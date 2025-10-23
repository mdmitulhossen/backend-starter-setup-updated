import logger from "../logger";

/**
 * Initialize all event listeners
 * Import all listener files to register them
 */
export function initializeEventListeners(): void {
    logger.info("Initializing event listeners...");

    // Import listener files to register them
    require("./user.listeners");
    require("./booking.listeners");
    require("./payment.listeners");
    require("./review.listeners");

    logger.info("✅ All event listeners initialized");
}

export default initializeEventListeners;
