import { Queue, QueueEvents } from "bullmq";
import config from "../../config";
import logger from "../logger";

// Create connection for BullMQ
const connection = {
    host: config.REDIS_HOST,
    port: config.REDIS_PORT,
    password: config.REDIS_PASSWORD,
};

// Email Queue
export const emailQueue = new Queue("email", { connection });

// Notification Queue
export const notificationQueue = new Queue("notification", { connection });

// Image Processing Queue
export const imageProcessingQueue = new Queue("image-processing", { connection });

// Report Generation Queue
export const reportQueue = new Queue("report", { connection });

// Background Jobs Queue
export const backgroundJobsQueue = new Queue("background-jobs", { connection });

// Queue Events for monitoring
const emailQueueEvents = new QueueEvents("email", { connection });
const notificationQueueEvents = new QueueEvents("notification", { connection });

// Email Queue Event Listeners
emailQueueEvents.on("completed", ({ jobId }) => {
    logger.info(`Email job ${jobId} completed successfully`);
});

emailQueueEvents.on("failed", ({ jobId, failedReason }) => {
    logger.error(`Email job ${jobId} failed:`, failedReason);
});

// Notification Queue Event Listeners
notificationQueueEvents.on("completed", ({ jobId }) => {
    logger.info(`Notification job ${jobId} completed successfully`);
});

notificationQueueEvents.on("failed", ({ jobId, failedReason }) => {
    logger.error(`Notification job ${jobId} failed:`, failedReason);
});

// Helper functions to add jobs to queues

/**
 * Add email to queue
 */
export const addEmailJob = async (
    emailData: {
        to: string;
        subject: string;
        html: string;
        from?: string;
    },
    options?: {
        delay?: number;
        attempts?: number;
        priority?: number;
    }
) => {
    try {
        const job = await emailQueue.add(
            "send-email",
            emailData,
            {
                attempts: options?.attempts || 3,
                backoff: {
                    type: "exponential",
                    delay: 2000,
                },
                delay: options?.delay || 0,
                priority: options?.priority || 1,
                removeOnComplete: 100, // Keep last 100 completed jobs
                removeOnFail: 50, // Keep last 50 failed jobs
            }
        );
        logger.info(`Email job added to queue: ${job.id}`);
        return job;
    } catch (error) {
        logger.error("Failed to add email job to queue:", error);
        throw error;
    }
};

/**
 * Add notification to queue
 */
export const addNotificationJob = async (
    notificationData: {
        userId: string;
        title: string;
        body: string;
        data?: any;
    },
    options?: {
        delay?: number;
        priority?: number;
    }
) => {
    try {
        const job = await notificationQueue.add(
            "send-notification",
            notificationData,
            {
                attempts: 3,
                backoff: {
                    type: "exponential",
                    delay: 1000,
                },
                delay: options?.delay || 0,
                priority: options?.priority || 1,
                removeOnComplete: 100,
                removeOnFail: 50,
            }
        );
        logger.info(`Notification job added to queue: ${job.id}`);
        return job;
    } catch (error) {
        logger.error("Failed to add notification job to queue:", error);
        throw error;
    }
};

/**
 * Add image processing job to queue
 */
export const addImageProcessingJob = async (
    imageData: {
        imageUrl: string;
        userId: string;
        operations: string[]; // ['resize', 'compress', 'watermark']
    },
    options?: {
        priority?: number;
    }
) => {
    try {
        const job = await imageProcessingQueue.add(
            "process-image",
            imageData,
            {
                attempts: 2,
                backoff: {
                    type: "fixed",
                    delay: 5000,
                },
                priority: options?.priority || 1,
                removeOnComplete: 50,
                removeOnFail: 25,
            }
        );
        logger.info(`Image processing job added to queue: ${job.id}`);
        return job;
    } catch (error) {
        logger.error("Failed to add image processing job to queue:", error);
        throw error;
    }
};

/**
 * Add report generation job to queue
 */
export const addReportJob = async (
    reportData: {
        userId: string;
        reportType: string;
        filters: any;
    },
    options?: {
        priority?: number;
    }
) => {
    try {
        const job = await reportQueue.add(
            "generate-report",
            reportData,
            {
                attempts: 2,
                backoff: {
                    type: "fixed",
                    delay: 10000,
                },
                priority: options?.priority || 1,
                removeOnComplete: 50,
                removeOnFail: 25,
            }
        );
        logger.info(`Report generation job added to queue: ${job.id}`);
        return job;
    } catch (error) {
        logger.error("Failed to add report job to queue:", error);
        throw error;
    }
};

/**
 * Add background job to queue
 */
export const addBackgroundJob = async (
    jobName: string,
    jobData: any,
    options?: {
        delay?: number;
        repeat?: {
            pattern: string; // Cron pattern
        };
    }
) => {
    try {
        const job = await backgroundJobsQueue.add(
            jobName,
            jobData,
            {
                attempts: 3,
                backoff: {
                    type: "exponential",
                    delay: 2000,
                },
                delay: options?.delay || 0,
                repeat: options?.repeat,
                removeOnComplete: 100,
                removeOnFail: 50,
            }
        );
        logger.info(`Background job added to queue: ${job.id}`);
        return job;
    } catch (error) {
        logger.error("Failed to add background job to queue:", error);
        throw error;
    }
};

// Export queues for external access
export const queues = {
    email: emailQueue,
    notification: notificationQueue,
    imageProcessing: imageProcessingQueue,
    report: reportQueue,
    backgroundJobs: backgroundJobsQueue,
};

// Graceful shutdown
export const closeQueues = async () => {
    await Promise.all([
        emailQueue.close(),
        notificationQueue.close(),
        imageProcessingQueue.close(),
        reportQueue.close(),
        backgroundJobsQueue.close(),
        emailQueueEvents.close(),
        notificationQueueEvents.close(),
    ]);
    logger.info("✅ All queues closed");
};
