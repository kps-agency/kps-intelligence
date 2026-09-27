import type { Request } from "express";
import type { AuthenticatedUser } from "../users/users.types";

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}
