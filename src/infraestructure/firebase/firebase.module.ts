import { Global, Module } from '@nestjs/common';
import { initializeApp, getApps, App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { ConfigService } from '@nestjs/config';

export const FIRESTORE = Symbol('FIRESTORE');

@Global()
@Module({
  providers: [
    {
      provide: FIRESTORE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const emulatorHost = config.get<string>('FIRESTORE_EMULATOR_HOST');

        if (emulatorHost) {
          process.env.FIREBASE_EMULATOR_HOST = emulatorHost;
        }
        const app: App =
          getApps().length > 0
            ? getApps()[0]
            : initializeApp({
                projectId: config.get<string>('FIREBASE_PROJECT_ID'),
              });

        return getFirestore(app);
      },
    },
  ],
  exports: [FIRESTORE],
})
export class FirebaseModule {}
