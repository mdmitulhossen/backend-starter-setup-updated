import logger from "../logger";
import { addEmailJob } from "../queue";
import appEvents from "./index";

/**
 * Send welcome email when a user is created
 */
appEvents.onEvent("user.created", async (payload) => {
    logger.info("Sending welcome email for new user:", payload.userId);

    await addEmailJob({
        to: payload.email,
        subject: "Welcome to Our Platform!",
        html: `
      <h1>Welcome ${payload.name || "User"}!</h1>
      <p>Thank you for joining our platform.</p>
      <p>We're excited to have you on board.</p>
    `,
    });
});

/**
 * Send notification when a user profile is updated
 */
appEvents.onEvent("user.updated", async (payload) => {
    logger.info("User profile updated:", payload.userId);

    // You can track analytics, send notifications, etc.
    // Example: Track in analytics service
    // await trackEvent('user_profile_updated', payload);
});

/**
 * Cleanup user data when account is deleted
 */
appEvents.onEvent("user.deleted", async (payload) => {
    logger.warn("User account deleted:", payload.userId);

    // Perform cleanup tasks
    // - Remove from cache
    // - Cancel pending bookings
    // - Send confirmation email

    await addEmailJob({
        to: payload.email,
        subject: "Account Deletion Confirmation",
        html: `
      <h2>Account Deleted</h2>
      <p>Your account has been successfully deleted.</p>
      <p>We're sorry to see you go.</p>
    `,
    });
});

export default appEvents;
