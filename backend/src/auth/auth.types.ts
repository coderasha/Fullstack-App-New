export type Role = 'WORKER' | 'SUPERVISOR';

export type AuthenticatedUser = {
  sub: string;
  email: string;
  role: Role;
  name: string;
};

export type AccessTokenPayload = AuthenticatedUser & {
  iss: string;
  aud: string;
  iat: number;
  exp: number;
  nbf: number;
};
