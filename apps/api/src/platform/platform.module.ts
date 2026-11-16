import { Module } from '@nestjs/common';
import { FeatureFlagsModule } from './feature-flags/feature-flags.module';
@Module({ imports: [FeatureFlagsModule] })
export class PlatformModule {}
