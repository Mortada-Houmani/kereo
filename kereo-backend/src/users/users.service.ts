import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  findById(id: string) {
    return this.usersRepository.findOne({
      where: { id },
      select: {
        id: true,
        email: true,
        isEmailVerified: true,
        githubLogin: true,
        githubAvatarUrl: true,
        githubAccessToken: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  findByEmail(email: string) {
    return this.usersRepository.findOne({
      where: { email },
      select: {
        id: true,
        email: true,
        password: true,
        isEmailVerified: true,
        emailVerificationTokenHash: true,
        emailVerificationExpiresAt: true,
        githubUserId: true,
        githubLogin: true,
        githubAvatarUrl: true,
        githubAccessToken: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  findByGithubUserId(githubUserId: string) {
    return this.usersRepository.findOne({
      where: { githubUserId },
      select: {
        id: true,
        email: true,
        password: true,
        isEmailVerified: true,
        emailVerificationTokenHash: true,
        emailVerificationExpiresAt: true,
        githubUserId: true,
        githubLogin: true,
        githubAvatarUrl: true,
        githubAccessToken: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  findByEmailVerificationTokenHash(emailVerificationTokenHash: string) {
    return this.usersRepository.findOne({
      where: { emailVerificationTokenHash },
      select: {
        id: true,
        email: true,
        password: true,
        isEmailVerified: true,
        emailVerificationTokenHash: true,
        emailVerificationExpiresAt: true,
        githubUserId: true,
        githubLogin: true,
        githubAvatarUrl: true,
        githubAccessToken: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async create(input: Partial<User>): Promise<User> {
    const user = this.usersRepository.create(input);
    return this.usersRepository.save(user);
  }

  async save(user: User) {
    return this.usersRepository.save(user);
  }

  async remove(user: User) {
    return this.usersRepository.remove(user);
  }
}
