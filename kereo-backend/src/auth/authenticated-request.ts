import { Request } from 'express';

type AuthenticatedUser = {
  id: string;
  email: string;
};

export type AuthenticatedRequest = Request & {
  user: AuthenticatedUser;
};
