export type Role = "PARENT" | "SPECIALIST" | "ADMIN";
export type Identity = { userId: string; email: string; role: Role };
export type Credentials = { email: string; password: string };
export type Registration = Credentials & { fullName: string };
export type AuthUser = {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  status: "ACTIVE" | "PENDING" | "SUSPENDED";
};
export type LoginResult = {
  message: string;
  access_token: string;
  user: AuthUser;
};
export type RegisterResult = {
  message: string;
  user: AuthUser & { createdAt: string };
};
