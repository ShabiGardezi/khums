import { Global, Inject, Module, type DynamicModule } from '@nestjs/common';

import { APP_CONFIG, type AppConfig } from './app-config';

/** Makes the validated `AppConfig` injectable everywhere. */
@Global()
@Module({})
export class AppConfigModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppConfigModule,
      providers: [{ provide: APP_CONFIG, useValue: config }],
      exports: [APP_CONFIG],
    };
  }
}

export const InjectAppConfig = (): ParameterDecorator => Inject(APP_CONFIG);
