import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { ProjectsService } from './projects.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateProjectDto } from './dto/create-project.dto';

@UseGuards(JwtAuthGuard)
@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
  ) {}

  @Post()
  create(
    @Body() createProjectDto: CreateProjectDto,
    @Req() req,
  ) {
    return this.projectsService.create(
      createProjectDto,
      req.user.id,
    );
  }

  @Get()
  findAll(@Req() req) {
    return this.projectsService.findAll(req.user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req) {
    return this.projectsService.findOne(
      id,
      req.user.id,
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req) {
    return this.projectsService.remove(
      id,
      req.user.id,
    );
  }
}