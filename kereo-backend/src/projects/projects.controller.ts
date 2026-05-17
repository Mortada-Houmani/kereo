import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { ProjectsService } from './projects.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { UpsertProjectEnvVarDto } from './dto/upsert-project-env-var.dto';
import { VerifiedEmailGuard } from '../auth/verified-email.guard';

@UseGuards(JwtAuthGuard)
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @UseGuards(VerifiedEmailGuard)
  @Post()
  create(
    @Body() createProjectDto: CreateProjectDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.projectsService.create(createProjectDto, req.user.id);
  }

  @Get()
  findAll(@Req() req: AuthenticatedRequest) {
    return this.projectsService.findAll(req.user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.projectsService.findOne(id, req.user.id);
  }

  @UseGuards(VerifiedEmailGuard)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateProjectDto: UpdateProjectDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.projectsService.update(id, req.user.id, updateProjectDto);
  }

  @Get(':id/env')
  listEnvVars(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.projectsService.listEnvVars(id, req.user.id);
  }

  @UseGuards(VerifiedEmailGuard)
  @Post(':id/env')
  upsertEnvVar(
    @Param('id') id: string,
    @Body() envVarDto: UpsertProjectEnvVarDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.projectsService.upsertEnvVar(id, req.user.id, envVarDto);
  }

  @UseGuards(VerifiedEmailGuard)
  @Patch(':id/env/:envVarId')
  updateEnvVar(
    @Param('id') id: string,
    @Param('envVarId') envVarId: string,
    @Body() envVarDto: UpsertProjectEnvVarDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.projectsService.upsertEnvVar(
      id,
      req.user.id,
      envVarDto,
      envVarId,
    );
  }

  @UseGuards(VerifiedEmailGuard)
  @Delete(':id/env/:envVarId')
  removeEnvVar(
    @Param('id') id: string,
    @Param('envVarId') envVarId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.projectsService.removeEnvVar(id, envVarId, req.user.id);
  }

  @UseGuards(VerifiedEmailGuard)
  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.projectsService.remove(id, req.user.id);
  }
}
