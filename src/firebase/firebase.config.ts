import { Injectable, OnModuleInit } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { LoggerService } from '../modules/common';

@Injectable()
export class FirebaseConfig implements OnModuleInit {
    private firebaseApp: admin.app.App;

    public constructor(private readonly logger: LoggerService) {}

    public onModuleInit(): void {
        this.initializeFirebase();
    }

    public getApp(): admin.app.App {
        if (!this.firebaseApp) {
            throw new Error('Firebase not initialized');
        }
        return this.firebaseApp;
    }

    public getMessaging(): admin.messaging.Messaging {
        return this.getApp().messaging();
    }

    private initializeFirebase(): void {
        try {
            // Check if Firebase is already initialized
            if (admin.apps.length > 0) {
                this.firebaseApp = admin.apps[0] as admin.app.App;
                this.logger.info('Firebase already initialized');
                return;
            }

            // Initialize Firebase Admin SDK
            this.firebaseApp = admin.initializeApp({
                credential: admin.credential.cert({
                    projectId: process.env.FCM_PROJECT_ID,
                    clientEmail: process.env.FCM_CLIENT_EMAIL,
                    privateKey: process.env.FCM_PRIVATE_KEY?.replace(/\\n/g, '\n'),
                }),
            });

            this.logger.info('Firebase initialized successfully');
        } catch (error) {
            this.logger.error(
                `Failed to initialize Firebase: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
            throw error;
        }
    }
}
