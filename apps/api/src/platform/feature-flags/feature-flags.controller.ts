import { Controller, Get } from '@nestjs/common';
import { getPresentationFlags } from '@cafeteria/feature-flags';
import { FeatureFlagsService } from './feature-flags.service';

@Controller('platform/feature-flags')
export class FeatureFlagsController {
  constructor(private readonly flags: FeatureFlagsService) {}

  @Get()
  async listPresentationFlags(): Promise<Record<string, boolean>> {
    return getPresentationFlags(this.flags);
  }
}
