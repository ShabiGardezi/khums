import { Global, Module } from '@nestjs/common';

import { CLOCK, systemClock } from '../../auth/auth.tokens';

/** The server clock for every module (tests override `CLOCK`). */
@Global()
@Module({ providers: [{ provide: CLOCK, useValue: systemClock }], exports: [CLOCK] })
export class ClockModule {}
