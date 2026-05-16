import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Deployment } from '../../deployments/entities/deployment.entity';

export enum ProjectRuntimeType {
  WEB_SERVER = 'web-server',
  STATIC_SITE = 'static-site',
}

@Entity('projects')
export class Project {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  repoUrl: string;

  @Column({ default: 'main' })
  branch: string;

  @Column({ default: 'Dockerfile' })
  dockerfilePath: string;

  @Column({ default: '.' })
  buildContext: string;

  @Column({ default: 3000 })
  port: number;

  @Column({
    type: 'varchar',
    default: ProjectRuntimeType.WEB_SERVER,
  })
  runtimeType: ProjectRuntimeType;

  @Column({ default: '/' })
  healthCheckPath: string;

  @Column({ nullable: true })
  slug: string;

  @Column({ nullable: true })
  ecsServiceName: string;

  @Column({ nullable: true })
  ecsTaskFamily: string;

  @Column({ nullable: true })
  targetGroupArn: string;

  @Column({ nullable: true })
  listenerRuleArn: string;

  @Column({ nullable: true })
  ecsSecurityGroupId: string;

  @Column({ nullable: true })
  publicUrl: string;

  @ManyToOne(() => User, (user) => user.projects, {
    onDelete: 'CASCADE',
  })
  user: User;

  @OneToMany(() => Deployment, (deployment) => deployment.project)
  deployments: Deployment[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
