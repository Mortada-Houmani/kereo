import { Request } from 'express';

type AuthenticatedUser = {
  id: string;
  email: string;
  isEmailVerified: boolean;
  githubLogin: string | null;
  githubAvatarUrl: string | null;
  githubAccessToken?: string | null;
};

export type AuthenticatedRequest = Request & {
  user: AuthenticatedUser;
};
