import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { FeatureFlagsController } from './feature-flags.controller';
import type { FeatureFlagsService } from './feature-flags.service';

describe('FeatureFlagsController', () => {
  it('exposes allowlisted presentation reads and no public write route', async () => {
    const service = {
      isEnabled: jest.fn(async (key: string) => key === 'catalog.new-menu'),
    } as unknown as FeatureFlagsService;
    const controller = new FeatureFlagsController(service);
    expect(Reflect.getMetadata(PATH_METADATA, FeatureFlagsController)).toBe(
      'platform/feature-flags',
    );
    await expect(controller.listPresentationFlags()).resolves.toEqual({
      'catalog.new-menu': true,
      'promotions.campaign-banner': false,
    });

    const routes = Object.getOwnPropertyNames(FeatureFlagsController.prototype)
      .filter((method) => method !== 'constructor')
      .map((method) =>
        Reflect.getMetadata(
          METHOD_METADATA,
          FeatureFlagsController.prototype[method as keyof FeatureFlagsController],
        ),
      );
    expect(routes).toEqual([RequestMethod.GET]);
  });
});
