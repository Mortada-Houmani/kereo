import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Project } from './project.entity';

@Entity('project_env_vars')
export class ProjectEnvVar {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  key: string;

  @Column({ type: 'text', select: false })
  value: string;

  @Column({ default: false })
  isSecret: boolean;

  @ManyToOne(() => Project, (project) => project.envVars, {
    onDelete: 'CASCADE',
  })
  project: Project;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
