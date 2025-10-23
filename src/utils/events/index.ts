import { EventEmitter } from "events";
import logger from "../logger";

// Define event types and their payloads
export interface EventPayloads {
    "user.created": {
        userId: string;
        email: string;
        name: string | null;
        role: string;
    };
    "user.updated": {
        userId: string;
        changes: Record<string, any>;
    };
    "user.deleted": {
        userId: string;
        email: string;
    };
    "booking.created": {
        bookingId: string;
        userId: string;
        serviceId: string;
        date: Date;
    };
    "booking.updated": {
        bookingId: string;
        userId: string;
        status: string;
    };
    "booking.cancelled": {
        bookingId: string;
        userId: string;
        reason?: string;
    };
    "payment.completed": {
        paymentId: string;
        userId: string;
        amount: number;
        bookingId?: string;
    };
    "payment.failed": {
        userId: string;
        amount: number;
        reason: string;
    };
    "review.created": {
        reviewId: string;
        userId: string;
        serviceId: string;
        rating: number;
    };
    "notification.sent": {
        notificationId: string;
        userId: string;
        type: string;
    };
    "message.sent": {
        messageId: string;
        senderId: string;
        receiverId: string;
        roomId: string;
    };
}

// Type-safe event names
export type EventName = keyof EventPayloads;

/**
 * Application-wide event emitter with type safety
 */
class AppEventEmitter extends EventEmitter {
    /**
     * Emit a typed event
     */
    emitEvent<T extends EventName>(
        eventName: T,
        payload: EventPayloads[T]
    ): boolean {
        logger.debug(`Event emitted: ${eventName}`, payload);
        return this.emit(eventName, payload);
    }

    /**
     * Register a typed event listener
     */
    onEvent<T extends EventName>(
        eventName: T,
        listener: (payload: EventPayloads[T]) => void | Promise<void>
    ): this {
        return this.on(eventName, async (payload: EventPayloads[T]) => {
            try {
                await listener(payload);
            } catch (error) {
                logger.error(`Error in event listener for ${eventName}:`, error);
            }
        });
    }

    /**
     * Register a one-time typed event listener
     */
    onceEvent<T extends EventName>(
        eventName: T,
        listener: (payload: EventPayloads[T]) => void | Promise<void>
    ): this {
        return this.once(eventName, async (payload: EventPayloads[T]) => {
            try {
                await listener(payload);
            } catch (error) {
                logger.error(`Error in one-time event listener for ${eventName}:`, error);
            }
        });
    }

    /**
     * Remove a typed event listener
     */
    offEvent<T extends EventName>(
        eventName: T,
        listener: (payload: EventPayloads[T]) => void | Promise<void>
    ): this {
        return this.off(eventName, listener);
    }
}

// Create singleton instance
export const appEvents = new AppEventEmitter();

// Set max listeners to prevent memory leak warnings
appEvents.setMaxListeners(20);

// Log errors
appEvents.on("error", (error) => {
    logger.error("Event emitter error:", error);
});

export default appEvents;
