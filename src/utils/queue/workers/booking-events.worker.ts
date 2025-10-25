import { Job, Worker } from "bullmq";
import config from "../../../config";
import logger from "../../logger";
import { prisma } from "../../prisma";
import { addEmailJob, addNotificationJob } from "../index";

const connection = {
    host: config.REDIS_HOST,
    port: config.REDIS_PORT,
    password: config.REDIS_PASSWORD,
};

/**
 * Booking Events Worker
 * Handles booking-related events: created, updated, cancelled
 */
const bookingEventsWorker = new Worker(
    "booking-events",
    async (job: Job) => {
        const { name, data } = job;
        logger.info(`Processing booking event: ${name}`, { jobId: job.id });

        try {
            switch (name) {
                case "booking.created":
                    await handleBookingCreated(data);
                    break;

                case "booking.updated":
                    await handleBookingUpdated(data);
                    break;

                case "booking.cancelled":
                    await handleBookingCancelled(data);
                    break;

                default:
                    logger.warn(`Unknown booking event type: ${name}`);
            }

            logger.info(`Booking event processed successfully: ${name}`);
            return { success: true, event: name };
        } catch (error) {
            logger.error(`Error processing booking event ${name}:`, error);
            throw error;
        }
    },
    {
        connection,
        concurrency: 5,
        limiter: {
            max: 10,
            duration: 1000,
        },
    }
);

/**
 * Handle booking created event
 */
async function handleBookingCreated(data: {
    bookingId: string;
    userId: string;
    serviceId?: string;
    date?: Date;
}) {
    logger.info("Booking created:", data.bookingId);

    try {
        // Fetch booking details
        const booking = await prisma.booking.findUnique({
            where: { id: data.bookingId },
            include: {
                serviceDetails: true,
            },
        });

        if (!booking) {
            logger.error("Booking not found:", data.bookingId);
            return;
        }

        const user = await prisma.user.findUnique({
            where: { id: data.userId },
        });

        if (!user) {
            logger.error("User not found:", data.userId);
            return;
        }

        // Send confirmation email
        await addEmailJob({
            to: user.email,
            subject: "Booking Confirmation - " + booking.serviceDetails.name,
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                        .content { background: #f9f9f9; padding: 30px; }
                        .booking-details { background: white; padding: 20px; border-radius: 5px; margin: 20px 0; }
                        .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
                        .label { font-weight: bold; color: #667eea; }
                        .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>✅ Booking Confirmed!</h1>
                        </div>
                        <div class="content">
                            <p>Hi ${user.name || "there"},</p>
                            <p>Your booking has been successfully confirmed. Here are the details:</p>
                            
                            <div class="booking-details">
                                <div class="detail-row">
                                    <span class="label">Service:</span>
                                    <span>${booking.serviceDetails.name}</span>
                                </div>
                                <div class="detail-row">
                                    <span class="label">Date:</span>
                                    <span>${booking.date.toLocaleDateString()}</span>
                                </div>
                                <div class="detail-row">
                                    <span class="label">Location:</span>
                                    <span>${booking.location}</span>
                                </div>
                                <div class="detail-row">
                                    <span class="label">Status:</span>
                                    <span>${booking.status}</span>
                                </div>
                                <div class="detail-row">
                                    <span class="label">Booking ID:</span>
                                    <span>${booking.id}</span>
                                </div>
                            </div>

                            <p>We'll send you a reminder before your appointment.</p>
                            <a href="https://cadence.com/bookings/${booking.id}" class="button">View Booking</a>
                        </div>
                    </div>
                </body>
                </html>
            `,
        });

        // Send notification
        await addNotificationJob({
            userId: data.userId,
            title: "Booking Confirmed! 🎉",
            body: `Your booking for ${booking.serviceDetails.name} on ${booking.date.toLocaleDateString()} is confirmed.`,
            data: {
                type: "booking_confirmed",
                bookingId: data.bookingId,
                action: "view_booking",
            },
        });
    } catch (error) {
        logger.error("Error handling booking.created:", error);
        throw error;
    }
}

/**
 * Handle booking updated event
 */
async function handleBookingUpdated(data: {
    bookingId: string;
    userId: string;
    status?: string;
}) {
    logger.info("Booking updated:", data.bookingId);

    try {
        const user = await prisma.user.findUnique({
            where: { id: data.userId },
        });

        if (!user) return;

        const booking = await prisma.booking.findUnique({
            where: { id: data.bookingId },
            include: { serviceDetails: true },
        });

        if (!booking) return;

        // Send status update notification
        await addNotificationJob({
            userId: data.userId,
            title: "Booking Status Updated",
            body: `Your booking for ${booking.serviceDetails.name} is now ${data.status}`,
            data: {
                type: "booking_updated",
                bookingId: data.bookingId,
                status: data.status,
            },
        });

        // Send email for important status changes
        if (data.status === "CONFIRMED" || data.status === "COMPLETED") {
            await addEmailJob({
                to: user.email,
                subject: `Booking ${data.status} - ${booking.serviceDetails.name}`,
                html: `
                    <h2>Booking Status Update</h2>
                    <p>Hi ${user.name || "there"},</p>
                    <p>Your booking for <strong>${booking.serviceDetails.name}</strong> has been ${data.status?.toLowerCase()}.</p>
                    <p><strong>Booking ID:</strong> ${booking.id}</p>
                    <p><strong>Date:</strong> ${booking.date.toLocaleDateString()}</p>
                    ${data.status === "COMPLETED" ? "<p>Thank you for using our service! We'd love to hear your feedback.</p>" : ""}
                `,
            });
        }
    } catch (error) {
        logger.error("Error handling booking.updated:", error);
        throw error;
    }
}

/**
 * Handle booking cancelled event
 */
async function handleBookingCancelled(data: {
    bookingId: string;
    userId: string;
    reason?: string;
}) {
    logger.info("Booking cancelled:", data.bookingId);

    try {
        const user = await prisma.user.findUnique({
            where: { id: data.userId },
        });

        if (!user) return;

        const booking = await prisma.booking.findUnique({
            where: { id: data.bookingId },
            include: { serviceDetails: true },
        });

        if (!booking) return;

        await addEmailJob({
            to: user.email,
            subject: "Booking Cancelled - " + booking.serviceDetails.name,
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                        .header { background: #e74c3c; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                        .booking-details { background: white; padding: 20px; border-radius: 5px; margin: 20px 0; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>❌ Booking Cancelled</h1>
                        </div>
                        <div class="content">
                            <p>Hi ${user.name || "there"},</p>
                            <p>Your booking has been cancelled.</p>
                            
                            <div class="booking-details">
                                <p><strong>Service:</strong> ${booking.serviceDetails.name}</p>
                                <p><strong>Date:</strong> ${booking.date.toLocaleDateString()}</p>
                                <p><strong>Booking ID:</strong> ${booking.id}</p>
                                ${data.reason ? `<p><strong>Reason:</strong> ${data.reason}</p>` : ""}
                            </div>

                            <p>If you have any questions, please contact our support team.</p>
                            <p>We hope to serve you again soon!</p>
                        </div>
                    </div>
                </body>
                </html>
            `,
        });

        await addNotificationJob({
            userId: data.userId,
            title: "Booking Cancelled",
            body: data.reason || `Your booking for ${booking.serviceDetails.name} has been cancelled.`,
            data: {
                type: "booking_cancelled",
                bookingId: data.bookingId,
            },
        });
    } catch (error) {
        logger.error("Error handling booking.cancelled:", error);
        throw error;
    }
}

// Event handlers
bookingEventsWorker.on("completed", (job) => {
    logger.info(`Booking event job completed: ${job.id}`);
});

bookingEventsWorker.on("failed", (job, error) => {
    logger.error(`Booking event job failed: ${job?.id}`, error);
});

bookingEventsWorker.on("error", (error) => {
    logger.error("Booking events worker error:", error);
});

logger.info("✅ Booking events worker started");

export default bookingEventsWorker;
