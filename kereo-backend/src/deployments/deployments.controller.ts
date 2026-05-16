import {
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { DeploymentsService } from './deployments.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller()
export class DeploymentsController {
  constructor(
    private readonly deploymentsService: DeploymentsService,
  ) {}

  @Post('projects/:projectId/deploy')
  create(@Param('projectId') projectId: string, @Req() req) {
    return this.deploymentsService.create(projectId, req.user.id);
  }

  @Get('projects/:projectId/deployments')
  findByProject(@Param('projectId') projectId: string, @Req() req) {
    return this.deploymentsService.findByProject(projectId, req.user.id);
  }

  @Get('deployments/:id')
  findOne(@Param('id') id: string, @Req() req) {
    return this.deploymentsService.findOne(id, req.user.id);
  }
}