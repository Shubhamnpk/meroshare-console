// Server-only session handling for the MeroShare integration.
// The CDSC bearer token lives ONLY inside an encrypted, httpOnly cookie.
import { useSession } from "@tanstack/react-start/server";

export interface MeroShareSessionData {
  token?: string;
  name?: string;
  username?: string;
  demat?: string;
  boid?: string;
  clientCode?: string;
  capitalId?: number;
  accountNumber?: string;
  renderDashboard?: boolean;
  passwordExpiryDate?: string | null;
  expiresAt?: number;
  /** Demo mode - bypasses CDSC auth, uses mock data. */
  demo?: boolean;
}

// CDSC tokens are short lived; keep the cookie in the same ballpark.
const MAX_AGE = 60 * 60 * 2;

function sessionConfig() {
  const password = process.env["SESSION_SECRET"];
  if (!password || password.length < 32) {
    throw new Error("SESSION_SECRET is missing or too short");
  }
  return {
    password,
    name: "ms_session",
    maxAge: MAX_AGE,
    cookie: {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: true,
      path: "/",
    },
  };
}

export async function getMeroShareSession() {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useSession<MeroShareSessionData>(sessionConfig());
}

export async function readSession(): Promise<MeroShareSessionData> {
  const session = await getMeroShareSession();
  return session.data ?? {};
}

export class SessionExpiredError extends Error {
  constructor(message = "Your MeroShare session has expired. Please sign in again.") {
    super(message);
    this.name = "SessionExpiredError";
  }
}

export interface AuthContext {
  token: string;
  demat: string;
  boid: string;
  clientCode: string;
  name: string;
  username: string;
  accountNumber: string;
  demo?: boolean;
}

export async function requireAuth(): Promise<AuthContext> {
  const data = await readSession();

  // Demo mode: bypass all CDSC auth and expiry checks.
  if (data.demo || data.token === "demo-token") {
    return {
      token: "demo-token",
      demat: data.demat ?? "12345678",
      boid: data.boid ?? "NP0000000000000001",
      clientCode: data.clientCode ?? "DEMO001",
      name: data.name ?? "Demo User",
      username: data.username ?? "demo",
      accountNumber: data.accountNumber ?? "001234567890",
      demo: true,
    };
  }

  if (!data.token || !data.demat) {
    throw new SessionExpiredError();
  }
  if (data.expiresAt && Date.now() > data.expiresAt) {
    const session = await getMeroShareSession();
    await session.clear();
    throw new SessionExpiredError();
  }
  return {
    token: data.token,
    demat: data.demat,
    boid: data.boid ?? "",
    clientCode: data.clientCode ?? "",
    name: data.name ?? "",
    username: data.username ?? "",
    accountNumber: data.accountNumber ?? "",
  };
}
