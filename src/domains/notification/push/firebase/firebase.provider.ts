import { Injectable } from '@nestjs/common';
import * as admin from 'firebase-admin';
import {
    FirebaseService,
    NotificationOptions,
    NotificationPayload,
} from './firebase.service';

@Injectable()
export class FirebaseProvider {
    public constructor(private readonly firebase: FirebaseService) {}

    public sendToDevice(
        token: string,
        payload: NotificationPayload,
        options?: NotificationOptions,
    ): Promise<admin.messaging.SendResponse> {
        return this.firebase.sendToDevice(token, payload, options);
    }

    public sendToMultipleDevices(
        tokens: string[],
        payload: NotificationPayload,
        options?: NotificationOptions,
    ): Promise<admin.messaging.BatchResponse> {
        return this.firebase.sendToMultipleDevices(tokens, payload, options);
    }

    public sendToTopic(
        topic: string,
        payload: NotificationPayload,
        options?: NotificationOptions,
    ): Promise<admin.messaging.SendResponse> {
        return this.firebase.sendToTopic(topic, payload, options);
    }

    public subscribeToTopic(
        tokens: string[],
        topic: string,
    ): Promise<admin.messaging.MessagingTopicManagementResponse> {
        return this.firebase.subscribeToTopic(tokens, topic);
    }

    public unsubscribeFromTopic(
        tokens: string[],
        topic: string,
    ): Promise<admin.messaging.MessagingTopicManagementResponse> {
        return this.firebase.unsubscribeFromTopic(tokens, topic);
    }
}
