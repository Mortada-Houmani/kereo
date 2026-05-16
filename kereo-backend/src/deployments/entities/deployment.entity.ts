import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Project } from '../../projects/entities/project.entity';

export enum DeploymentStatus {
  QUEUED = 'queued',
  CLONING = 'cloning',
  BUILDING = 'building',
  PUSHING = 'pushing',
  DEPLOYING = 'deploying',
  SUCCESS = 'success',
  FAILED = 'failed',
}

export enum DeploymentPhase {
  QUEUED = 'queued',
  BUILD = 'build',
  DATABASE = 'database',
  SECRETS = 'secrets',
  LOGGING = 'logging',
  ECS = 'ecs',
  LIVE = 'live',
  FAILED = 'failed',
}

@Entity('deployments')
export class Deployment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: DeploymentStatus,
    default: DeploymentStatus.QUEUED,
  })
  status: DeploymentStatus;

  @Column({ nullable: true })
  imageUrl: string;

  @Column({ type: 'varchar', nullable: true })
  liveUrl: string | null;

  @Column({ nullable: true })
  commitSha: string;

  @Column({
    type: 'varchar',
    default: DeploymentPhase.QUEUED,
  })
  phase: DeploymentPhase;

  @Column({ type: 'varchar', nullable: true })
  phaseLabel: string | null;

  @Column({ type: 'varchar', nullable: true })
  codebuildBuildId: string | null;

  @Column({ type: 'varchar', nullable: true })
  codebuildStatus: string | null;

  @Column({ type: 'varchar', nullable: true })
  taskDefinitionArn: string | null;

  @Column({ type: 'varchar', nullable: true })
  databaseName: string | null;

  @Column({ type: 'text', nullable: true })
  logs: string;

  @Column({ type: 'text', nullable: true })
  errorMessage: string;

  @ManyToOne(() => Project, (project) => project.deployments, {
    onDelete: 'CASCADE',
  })
  project: Project;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
