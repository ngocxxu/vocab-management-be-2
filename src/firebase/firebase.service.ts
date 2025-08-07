import { Injectable } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { LoggerService } from '../modules/common';
import { FirebaseConfig } from './firebase.config';

export interface NotificationPayload {
    title: string;
    body: string;
    data?: Record<string, string>;
    imageUrl?: string;
    clickAction?: string;
}

export interface NotificationOptions {
    priority?: 'normal' | 'high';
    timeToLive?: number;
    collapseKey?: string;
    mutableContent?: boolean;
}

@Injectable()
export class FirebaseService {
    public constructor(
        private readonly firebaseConfig: FirebaseConfig,
        private readonly logger: LoggerService,
    ) {}

    /**
     * Send notification to a single device
     */
    public async sendToDevice(
        token: string,
        payload: NotificationPayload,
        options: NotificationOptions = {},
    ): Promise<admin.messaging.SendResponse> {
        try {
            const messaging = this.firebaseConfig.getMessaging();

            const message: admin.messaging.Message = {
                token,
                notification: {
                    title: payload.title,
                    body: payload.body,
                    imageUrl: payload.imageUrl,
                },
                data: payload.data,
                android: {
                    priority: options.priority === 'high' ? 'high' : 'normal',
                    ttl: options.timeToLive ? options.timeToLive * 1000 : undefined,
                    collapseKey: options.collapseKey,
                },
                apns: {
                    payload: {
                        aps: {
                            'mutable-content': options.mutableContent ? 1 : 0,
                        },
                    },
                },
                webpush: {
                    headers: {
                        Urgency: options.priority === 'high' ? 'high' : 'normal',
                    },
                    notification: {
                        icon: '/favicon.ico',
                        badge: '/badge.png',
                        tag: options.collapseKey,
                    },
                },
            };

            const response = await messaging.send(message);
            this.logger.info(`Notification sent to device ${token}: ${response}`);

            return response as unknown as admin.messaging.SendResponse;
        } catch (error) {
            this.logger.error(
                `Failed to send notification to device ${token}: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
            throw error;
        }
    }

    /**
     * Send notification to multiple devices
     */
    public async sendToMultipleDevices(
        tokens: string[],
        payload: NotificationPayload,
        options: NotificationOptions = {},
    ): Promise<admin.messaging.BatchResponse> {
        try {
            const messaging = this.firebaseConfig.getMessaging();

            const message: admin.messaging.MulticastMessage = {
                tokens,
                notification: {
                    title: payload.title,
                    body: payload.body,
                    imageUrl: payload.imageUrl,
                },
                data: payload.data,
                android: {
                    priority: options.priority === 'high' ? 'high' : 'normal',
                    ttl: options.timeToLive ? options.timeToLive * 1000 : undefined,
                    collapseKey: options.collapseKey,
                },
                apns: {
                    payload: {
                        aps: {
                            'mutable-content': options.mutableContent ? 1 : 0,
                        },
                    },
                },
                webpush: {
                    headers: {
                        Urgency: options.priority === 'high' ? 'high' : 'normal',
                    },
                    notification: {
                        icon: '/favicon.ico',
                        badge: '/badge.png',
                        tag: options.collapseKey,
                    },
                },
            };

            const response = await messaging.sendEachForMulticast(message);
            this.logger.info(
                `Notification sent to ${response.successCount}/${tokens.length} devices`,
            );

            if (response.failureCount > 0) {
                this.logger.warn(`Failed to send to ${response.failureCount} devices`);
                response.responses.forEach((resp, idx) => {
                    if (!resp.success) {
                        this.logger.error(
                            `Failed to send to token ${tokens[idx]}: ${resp.error?.message}`,
                        );
                    }
                });
            }

            return response;
        } catch (error) {
            this.logger.error(
                `Failed to send multicast notification: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
            throw error;
        }
    }

    /**
     * Send notification to a topic
     */
    public async sendToTopic(
        topic: string,
        payload: NotificationPayload,
        options: NotificationOptions = {},
    ): Promise<admin.messaging.SendResponse> {
        try {
            const messaging = this.firebaseConfig.getMessaging();

            const message: admin.messaging.Message = {
                topic,
                notification: {
                    title: payload.title,
                    body: payload.body,
                    imageUrl: payload.imageUrl,
                },
                data: payload.data,
                android: {
                    priority: options.priority === 'high' ? 'high' : 'normal',
                    ttl: options.timeToLive ? options.timeToLive * 1000 : undefined,
                    collapseKey: options.collapseKey,
                },
                apns: {
                    payload: {
                        aps: {
                            'mutable-content': options.mutableContent ? 1 : 0,
                        },
                    },
                },
                webpush: {
                    headers: {
                        Urgency: options.priority === 'high' ? 'high' : 'normal',
                    },
                    notification: {
                        icon: '/favicon.ico',
                        badge: '/badge.png',
                        tag: options.collapseKey,
                    },
                },
            };

            const response = await messaging.send(message);
            this.logger.info(`Notification sent to topic ${topic}: ${response}`);

            return response as unknown as admin.messaging.SendResponse;
        } catch (error) {
            this.logger.error(
                `Failed to send notification to topic ${topic}: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
            throw error;
        }
    }

    /**
     * Subscribe devices to a topic
     */
    public async subscribeToTopic(
        tokens: string[],
        topic: string,
    ): Promise<admin.messaging.MessagingTopicManagementResponse> {
        try {
            const messaging = this.firebaseConfig.getMessaging();
            const response = await messaging.subscribeToTopic(tokens, topic);

            this.logger.info(
                `Subscribed ${response.successCount}/${tokens.length} devices to topic ${topic}`,
            );

            if (response.failureCount > 0) {
                this.logger.warn(
                    `Failed to subscribe ${response.failureCount} devices to topic ${topic}`,
                );
            }

            return response;
        } catch (error) {
            this.logger.error(
                `Failed to subscribe to topic ${topic}: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
            throw error;
        }
    }

    /**
     * Unsubscribe devices from a topic
     */
    public async unsubscribeFromTopic(
        tokens: string[],
        topic: string,
    ): Promise<admin.messaging.MessagingTopicManagementResponse> {
        try {
            const messaging = this.firebaseConfig.getMessaging();
            const response = await messaging.unsubscribeFromTopic(tokens, topic);

            this.logger.info(
                `Unsubscribed ${response.successCount}/${tokens.length} devices from topic ${topic}`,
            );

            if (response.failureCount > 0) {
                this.logger.warn(
                    `Failed to unsubscribe ${response.failureCount} devices from topic ${topic}`,
                );
            }

            return response;
        } catch (error) {
            this.logger.error(
                `Failed to unsubscribe from topic ${topic}: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
            throw error;
        }
    }
}
