import {
  Global,
  Inject,
  Injectable,
  Module,
  type OnApplicationShutdown,
  type Provider,
} from '@nestjs/common';
import { MongoClient, type Db } from 'mongodb';

import { APP_CONFIG, type AppConfig } from '../config';
import { MONGO_CLIENT_OPTIONS } from './mongo-append-only-collection';

/** The application's database, or `null` when `MONGODB_URI` is not configured. */
export const MONGO_DATABASE = Symbol('MONGO_DATABASE');
const MONGO_CLIENT = Symbol('MONGO_CLIENT');

/**
 * Closes the connection pool on shutdown. The driver connects lazily on first use, so the API
 * starts even when the database is unreachable; stores then fail closed.
 */
@Injectable()
class MongoLifecycle implements OnApplicationShutdown {
  constructor(@Inject(MONGO_CLIENT) private readonly client: MongoClient | null) {}

  async onApplicationShutdown(): Promise<void> {
    await this.client?.close();
  }
}

const providers: Provider[] = [
  {
    provide: MONGO_CLIENT,
    inject: [APP_CONFIG],
    useFactory: (config: AppConfig) =>
      config.mongodb.uri === undefined
        ? null
        : new MongoClient(config.mongodb.uri, MONGO_CLIENT_OPTIONS),
  },
  {
    provide: MONGO_DATABASE,
    inject: [MONGO_CLIENT, APP_CONFIG],
    useFactory: (client: MongoClient | null, config: AppConfig): Db | null =>
      client?.db(config.mongodb.databaseName) ?? null,
  },
  MongoLifecycle,
];

/** Database connection for `apps/api` (M4.6.3a). The URI is never logged. */
@Global()
@Module({ providers, exports: [MONGO_DATABASE] })
export class PersistenceModule {}
