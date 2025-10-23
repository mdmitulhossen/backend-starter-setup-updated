import logger from "../logger";
import { prisma } from "../prisma";
import { addEmailJob, addNotificationJob } from "../queue";
import appEvents from "./index";

/**
 * Send notification and email when payment is completed
 */
appEvents.onEvent("payment.completed", async (payload) => {
    logger.info("Payment completed:", payload.paymentId);

    try {
        const user = await prisma.user.findUnique({
            where: { id: payload.userId },
        });

        if (!user) {
            logger.error("User not found:", payload.userId);
            return;
        }

        // Send success email
        await addEmailJob({
            to: user.email,
            subject: "Payment Successful",
            html: `
        <h2>Payment Received</h2>
        <p>Your payment of <strong>$${payload.amount.toFixed(2)}</strong> has been processed successfully.</p>
        <p><strong>Payment ID:</strong> ${payload.paymentId}</p>
        <p>Thank you for your business!</p>
      `,
        });

        // Send notification
        await addNotificationJob({
            userId: payload.userId,
            title: "Payment Successful",
            body: `Your payment of $${payload.amount.toFixed(2)} was successful.`,
        });
    } catch (error) {
        logger.error("Error handling payment.completed event:", error);
    }
});

/**
 * Handle payment failure
 */
appEvents.onEvent("payment.failed", async (payload) => {
    logger.warn("Payment failed for user:", payload.userId);

    try {
        const user = await prisma.user.findUnique({
            where: { id: payload.userId },
        });

        if (!user) return;

        await addEmailJob({
            to: user.email,
            subject: "Payment Failed",
            html: `
        <h2>Payment Failed</h2>
        <p>Unfortunately, your payment of $${payload.amount.toFixed(2)} could not be processed.</p>
        <p><strong>Reason:</strong> ${payload.reason}</p>
        <p>Please try again or contact support for assistance.</p>
      `,
        });

        await addNotificationJob({
            userId: payload.userId,
            title: "Payment Failed",
            body: `Payment failed: ${payload.reason}`,
        });
    } catch (error) {
        logger.error("Error handling payment.failed event:", error);
    }
});

export default appEvents;
