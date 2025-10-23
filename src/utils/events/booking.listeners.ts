import logger from "../logger";
import { prisma } from "../prisma";
import { addEmailJob, addNotificationJob } from "../queue";
import appEvents from "./index";

/**
 * Send confirmation email and notification when booking is created
 */
appEvents.onEvent("booking.created", async (payload) => {
    logger.info("Booking created:", payload.bookingId);

    try {
        // Fetch booking details with user and service info
        const booking = await prisma.booking.findUnique({
            where: { id: payload.bookingId },
            include: {
                serviceDetails: true,
            },
        });

        if (!booking) {
            logger.error("Booking not found:", payload.bookingId);
            return;
        }

        const user = await prisma.user.findUnique({
            where: { id: payload.userId },
        });

        if (!user) {
            logger.error("User not found:", payload.userId);
            return;
        }

        // Send email
        await addEmailJob({
            to: user.email,
            subject: "Booking Confirmation",
            html: `
        <h2>Booking Confirmed!</h2>
        <p>Your booking for <strong>${booking.serviceDetails.name}</strong> has been confirmed.</p>
        <p><strong>Date:</strong> ${booking.date.toLocaleDateString()}</p>
        <p><strong>Location:</strong> ${booking.location}</p>
        <p><strong>Status:</strong> ${booking.status}</p>
      `,
        });

        // Send notification
        await addNotificationJob({
            userId: payload.userId,
            title: "Booking Confirmed",
            body: `Your booking for ${booking.serviceDetails.name} has been confirmed.`,
        });
    } catch (error) {
        logger.error("Error handling booking.created event:", error);
    }
});

/**
 * Send notification when booking status is updated
 */
appEvents.onEvent("booking.updated", async (payload) => {
    logger.info("Booking updated:", payload.bookingId);

    try {
        const user = await prisma.user.findUnique({
            where: { id: payload.userId },
        });

        if (!user) return;

        // Send status update notification
        await addNotificationJob({
            userId: payload.userId,
            title: "Booking Status Updated",
            body: `Your booking status has been changed to ${payload.status}`,
        });

        // Send email for important status changes
        if (payload.status === "CONFIRMED" || payload.status === "COMPLETED") {
            await addEmailJob({
                to: user.email,
                subject: `Booking ${payload.status}`,
                html: `
          <h2>Booking Status Update</h2>
          <p>Your booking has been ${payload.status.toLowerCase()}.</p>
        `,
            });
        }
    } catch (error) {
        logger.error("Error handling booking.updated event:", error);
    }
});

/**
 * Handle booking cancellation
 */
appEvents.onEvent("booking.cancelled", async (payload) => {
    logger.info("Booking cancelled:", payload.bookingId);

    try {
        const user = await prisma.user.findUnique({
            where: { id: payload.userId },
        });

        if (!user) return;

        await addEmailJob({
            to: user.email,
            subject: "Booking Cancelled",
            html: `
        <h2>Booking Cancelled</h2>
        <p>Your booking has been cancelled.</p>
        ${payload.reason ? `<p><strong>Reason:</strong> ${payload.reason}</p>` : ""}
        <p>If you have any questions, please contact support.</p>
      `,
        });

        await addNotificationJob({
            userId: payload.userId,
            title: "Booking Cancelled",
            body: payload.reason || "Your booking has been cancelled.",
        });
    } catch (error) {
        logger.error("Error handling booking.cancelled event:", error);
    }
});

export default appEvents;
