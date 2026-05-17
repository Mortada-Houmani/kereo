import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Project } from '../../projects/entities/project.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ type: 'varchar', select: false, nullable: true })
  password: string | null;

  @Column({ default: false })
  isEmailVerified: boolean;

  @Column({ type: 'varchar', select: false, nullable: true })
  emailVerificationTokenHash: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  emailVerificationExpiresAt: Date | null;

  @Column({ type: 'varchar', unique: true, nullable: true })
  githubUserId: string | null;

  @Column({ type: 'varchar', nullable: true })
  githubLogin: string | null;

  @Column({ type: 'varchar', nullable: true })
  githubAvatarUrl: string | null;

  @Column({ type: 'text', select: false, nullable: true })
  githubAccessToken: string | null;

  @OneToMany(() => Project, (project) => project.user)
  projects: Project[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
