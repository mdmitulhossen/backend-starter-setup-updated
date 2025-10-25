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
 * Payment Events Worker
 * Handles payment-related events: completed, failed
 */
const paymentEventsWorker = new Worker(
    "payment-events",
    async (job: Job) => {
        const { name, data } = job;
        logger.info(`Processing payment event: ${name}`, { jobId: job.id });

        try {
            switch (name) {
                case "payment.completed":
                    await handlePaymentCompleted(data);
                    break;

                case "payment.failed":
                    await handlePaymentFailed(data);
                    break;

                default:
                    logger.warn(`Unknown payment event type: ${name}`);
            }

            logger.info(`Payment event processed successfully: ${name}`);
            return { success: true, event: name };
        } catch (error) {
            logger.error(`Error processing payment event ${name}:`, error);
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
 * Handle payment completed event
 */
async function handlePaymentCompleted(data: {
    paymentId?: string;
    userId: string;
    amount: number;
    bookingId?: string;
}) {
    logger.info("Payment completed:", data.paymentId);

    try {
        const user = await prisma.user.findUnique({
            where: { id: data.userId },
        });

        if (!user) {
            logger.error("User not found:", data.userId);
            return;
        }

        // Get booking details if bookingId is provided
        let bookingInfo = "";
        if (data.bookingId) {
            const booking = await prisma.booking.findUnique({
                where: { id: data.bookingId },
                include: { serviceDetails: true },
            });

            if (booking) {
                bookingInfo = `
                    <div class="booking-info">
                        <h3>Booking Details:</h3>
                        <p><strong>Service:</strong> ${booking.serviceDetails.name}</p>
                        <p><strong>Date:</strong> ${booking.date.toLocaleDateString()}</p>
                        <p><strong>Location:</strong> ${booking.location}</p>
                    </div>
                `;
            }
        }

        // Send success email with receipt
        await addEmailJob({
            to: user.email,
            subject: "Payment Successful - Receipt",
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                        .header { background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                        .content { background: #f9f9f9; padding: 30px; }
                        .receipt { background: white; padding: 20px; border-radius: 5px; margin: 20px 0; border: 2px solid #11998e; }
                        .amount { font-size: 32px; color: #11998e; font-weight: bold; text-align: center; margin: 20px 0; }
                        .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
                        .booking-info { background: #e8f5e9; padding: 15px; border-radius: 5px; margin: 15px 0; }
                        .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>✅ Payment Successful!</h1>
                        </div>
                        <div class="content">
                            <p>Hi ${user.name || "there"},</p>
                            <p>We've received your payment. Thank you for your business!</p>
                            
                            <div class="receipt">
                                <h3 style="text-align: center; color: #11998e;">Payment Receipt</h3>
                                <div class="amount">$${data.amount.toFixed(2)}</div>
                                
                                <div class="detail-row">
                                    <span><strong>Payment ID:</strong></span>
                                    <span>${data.paymentId || "N/A"}</span>
                                </div>
                                <div class="detail-row">
                                    <span><strong>Date:</strong></span>
                                    <span>${new Date().toLocaleDateString()}</span>
                                </div>
                                <div class="detail-row">
                                    <span><strong>Amount:</strong></span>
                                    <span>$${data.amount.toFixed(2)}</span>
                                </div>
                                <div class="detail-row">
                                    <span><strong>Status:</strong></span>
                                    <span style="color: #11998e; font-weight: bold;">PAID</span>
                                </div>
                            </div>

                            ${bookingInfo}

                            <p>This is your official payment confirmation. Please keep this email for your records.</p>
                            <p>If you have any questions, feel free to contact our support team.</p>
                        </div>
                        <div class="footer">
                            <p>© ${new Date().getFullYear()} Cadence. All rights reserved.</p>
                            <p>This is an automated receipt. Please do not reply to this email.</p>
                        </div>
                    </div>
                </body>
                </html>
            `,
        });

        // Send notification
        await addNotificationJob({
            userId: data.userId,
            title: "Payment Successful! 💳",
            body: `Your payment of $${data.amount.toFixed(2)} was processed successfully.`,
            data: {
                type: "payment_completed",
                paymentId: data.paymentId,
                amount: data.amount,
                bookingId: data.bookingId,
                action: "view_receipt",
            },
        });

        // If booking exists, update booking status to PAID
        if (data.bookingId) {
            await prisma.booking.update({
                where: { id: data.bookingId },
                data: { isPaid: true },
            });
            logger.info(`Booking ${data.bookingId} marked as paid`);
        }
    } catch (error) {
        logger.error("Error handling payment.completed:", error);
        throw error;
    }
}

/**
 * Handle payment failed event
 */
async function handlePaymentFailed(data: {
    userId: string;
    amount: number;
    reason?: string;
    bookingId?: string;
}) {
    logger.warn("Payment failed for user:", data.userId);

    try {
        const user = await prisma.user.findUnique({
            where: { id: data.userId },
        });

        if (!user) return;

        // Get booking details if provided
        let bookingInfo = "";
        if (data.bookingId) {
            const booking = await prisma.booking.findUnique({
                where: { id: data.bookingId },
                include: { serviceDetails: true },
            });

            if (booking) {
                bookingInfo = `
                    <p>This payment was for your booking of <strong>${booking.serviceDetails.name}</strong> on ${booking.date.toLocaleDateString()}.</p>
                `;
            }
        }

        await addEmailJob({
            to: user.email,
            subject: "Payment Failed - Action Required",
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                        .header { background: #e74c3c; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                        .error-box { background: #ffebee; border-left: 4px solid #e74c3c; padding: 15px; margin: 20px 0; }
                        .amount { font-size: 24px; font-weight: bold; color: #e74c3c; }
                        .button { display: inline-block; background: #e74c3c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
                        .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>❌ Payment Failed</h1>
                        </div>
                        <div class="content">
                            <p>Hi ${user.name || "there"},</p>
                            <p>Unfortunately, we couldn't process your payment of <span class="amount">$${data.amount.toFixed(2)}</span>.</p>
                            
                            ${bookingInfo}

                            <div class="error-box">
                                <h3 style="margin-top: 0; color: #e74c3c;">❗ Reason:</h3>
                                <p>${data.reason || "Unknown error. Please contact your bank or try a different payment method."}</p>
                            </div>

                            <h3>What to do next:</h3>
                            <ul>
                                <li>✅ Check your card details and try again</li>
                                <li>✅ Ensure you have sufficient funds</li>
                                <li>✅ Contact your bank if the issue persists</li>
                                <li>✅ Try a different payment method</li>
                            </ul>

                            <a href="https://cadence.com/payment/retry" class="button">Retry Payment</a>

                            <p>If you continue to experience issues, please contact our support team for assistance.</p>
                        </div>
                        <div class="footer">
                            <p>© ${new Date().getFullYear()} Cadence. All rights reserved.</p>
                        </div>
                    </div>
                </body>
                </html>
            `,
        });

        await addNotificationJob({
            userId: data.userId,
            title: "Payment Failed ❌",
            body: `Payment failed: ${data.reason || "Please try again"}`,
            data: {
                type: "payment_failed",
                amount: data.amount,
                reason: data.reason,
                bookingId: data.bookingId,
                action: "retry_payment",
            },
        });
    } catch (error) {
        logger.error("Error handling payment.failed:", error);
        throw error;
    }
}

// Event handlers
paymentEventsWorker.on("completed", (job) => {
    logger.info(`Payment event job completed: ${job.id}`);
});

paymentEventsWorker.on("failed", (job, error) => {
    logger.error(`Payment event job failed: ${job?.id}`, error);
});

paymentEventsWorker.on("error", (error) => {
    logger.error("Payment events worker error:", error);
});

logger.info("✅ Payment events worker started");

export default paymentEventsWorker;
