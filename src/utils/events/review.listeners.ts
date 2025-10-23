import logger from "../logger";
import { prisma } from "../prisma";
import { addNotificationJob } from "../queue";
import appEvents from "./index";

/**
 * Notify service owner when a review is created
 */
appEvents.onEvent("review.created", async (payload) => {
    logger.info("Review created:", payload.reviewId);

    try {
        const review = await prisma.review.findUnique({
            where: { id: payload.reviewId },
            include: {
                userDetails: true,
                serviceDetails: true,
            },
        });

        if (!review) {
            logger.error("Review not found:", payload.reviewId);
            return;
        }

        // Notify the reviewer (thank you message)
        await addNotificationJob({
            userId: payload.userId,
            title: "Thank You for Your Review!",
            body: `Thank you for reviewing ${review.serviceDetails.name}. Your feedback helps us improve!`,
        });

        // You can also notify service providers or admins about new reviews
        logger.info(`New ${payload.rating}-star review for service ${payload.serviceId}`);
    } catch (error) {
        logger.error("Error handling review.created event:", error);
    }
});

export default appEvents;
