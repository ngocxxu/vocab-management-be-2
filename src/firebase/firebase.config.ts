import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { LoggerService } from '../modules/common';

@Injectable()
export class FirebaseConfig implements OnModuleInit {
    private firebaseApp: admin.app.App;

    public constructor(
        private readonly logger: LoggerService,
        private readonly configService: ConfigService,
    ) {}

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
            const privateKey = this.configService.getOrThrow<string>('firebase.privateKey');
            this.firebaseApp = admin.initializeApp({
                credential: admin.credential.cert({
                    projectId: this.configService.getOrThrow<string>('firebase.projectId'),
                    clientEmail: this.configService.getOrThrow<string>('firebase.clientEmail'),
                    privateKey: privateKey.replace(/\\n/g, '\n'),
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
