import { Module } from '@nestjs/common';

import { AwsProvisioningService } from './aws-provisioning.service';

@Module({
  providers: [AwsProvisioningService],
  exports: [AwsProvisioningService],
})
export class AwsModule {}
