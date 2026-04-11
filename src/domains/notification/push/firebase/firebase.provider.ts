import { Injectable } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { FirebaseService, NotificationOptions, NotificationPayload } from './firebase.service';

@Injectable()
export class FirebaseProvider {
    public constructor(private readonly firebase: FirebaseService) {}

    public async sendToDevice(token: string, payload: NotificationPayload, options?: NotificationOptions): Promise<admin.messaging.SendResponse> {
        return this.firebase.sendToDevice(token, payload, options);
    }

    public async sendToMultipleDevices(tokens: string[], payload: NotificationPayload, options?: NotificationOptions): Promise<admin.messaging.BatchResponse> {
        return this.firebase.sendToMultipleDevices(tokens, payload, options);
    }

    public async sendToTopic(topic: string, payload: NotificationPayload, options?: NotificationOptions): Promise<admin.messaging.SendResponse> {
        return this.firebase.sendToTopic(topic, payload, options);
    }

    public async subscribeToTopic(tokens: string[], topic: string): Promise<admin.messaging.MessagingTopicManagementResponse> {
        return this.firebase.subscribeToTopic(tokens, topic);
    }

    public async unsubscribeFromTopic(tokens: string[], topic: string): Promise<admin.messaging.MessagingTopicManagementResponse> {
        return this.firebase.unsubscribeFromTopic(tokens, topic);
    }
}
