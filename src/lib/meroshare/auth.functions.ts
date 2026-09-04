import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fetchCapitals } from "./api.server";
import { normalizeUsername, performLogin } from "./auth.server";
import { getMeroShareSession, readSession } from "./session.server";
import { logoutCdsc } from "./api.server";
import { DEMO_USER } from "./demo-data";
import type { Capital, SessionUser } from "./types";

export const getCapitals = createServerFn({ method: "GET" }).handler(
  async (): Promise<Capital[]> => {
    const capitals = await fetchCapitals();
    return capitals
      .map((c) => ({ id: c.id, code: c.code, name: c.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
);

export const login = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        capitalId: z.number().int().positive(),
        username: z.string().trim().min(1).max(64),
        password: z.string().min(1).max(128),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<SessionUser> => performLogin(data));

/** Enter demo mode - no CDSC credentials required. */
export const loginDemo = createServerFn({ method: "POST" }).handler(
  async (): Promise<SessionUser> => {
    const session = await getMeroShareSession();
    const expiresAt = Date.now() + 60 * 60 * 24; // 24 h for demo
    await session.update({
      demo: true,
      token: "demo-token",
      name: DEMO_USER.name ?? "Demo User",
      username: "demo",
      demat: DEMO_USER.demat ?? "12345678",
      boid: DEMO_USER.boid ?? "NP0000000000000001",
      clientCode: DEMO_USER.clientCode ?? "DEMO001",
      capitalId: 0,
      accountNumber: DEMO_USER.demat ?? "001234567890",
      renderDashboard: false,
      passwordExpiryDate: null,
      expiresAt,
    });
    return {
      name: DEMO_USER.name ?? "Demo User",
      username: "demo",
      demat: DEMO_USER.demat ?? "12345678",
      boid: DEMO_USER.boid ?? "NP0000000000000001",
      clientCode: DEMO_USER.clientCode ?? "DEMO001",
      capitalId: 0,
      accountNumber: DEMO_USER.demat ?? "001234567890",
      renderDashboard: false,
      passwordExpiryDate: null,
      expiresAt,
    };
  },
);

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  const data = await readSession();
  if (!data.demo && data.token !== "demo-token" && data.token) {
    await logoutCdsc({
      token: data.token,
      demat: data.demat ?? "",
      boid: data.boid ?? "",
      clientCode: data.clientCode ?? "",
      name: data.name ?? "",
      username: data.username ?? "",
      accountNumber: data.accountNumber ?? "",
    });
  }
  const session = await getMeroShareSession();
  await session.clear();
  return { ok: true };
});

export const getCurrentUser = createServerFn({ method: "GET" }).handler(
  async (): Promise<SessionUser | null> => {
    const data = await readSession();

    // Demo mode - bypass all CDSC auth checks.
    if (data.demo || data.token === "demo-token") {
      return {
        name: DEMO_USER.name ?? "Demo User",
        username: "demo",
        demat: DEMO_USER.demat ?? "12345678",
        boid: DEMO_USER.boid ?? "NP0000000000000001",
        clientCode: DEMO_USER.clientCode ?? "DEMO001",
        capitalId: 0,
        accountNumber: DEMO_USER.demat ?? "001234567890",
        renderDashboard: false,
        passwordExpiryDate: null,
        expiresAt: data.expiresAt ?? 0,
      };
    }

    if (!data.token || !data.demat) return null;
    if (data.expiresAt && Date.now() > data.expiresAt) return null;
    return {
      name: data.name ?? "",
      username: normalizeUsername(data.username ?? ""),
      demat: data.demat,
      boid: data.boid ?? "",
      clientCode: data.clientCode ?? "",
      capitalId: data.capitalId ?? 0,
      accountNumber: data.accountNumber ?? "",
      renderDashboard: Boolean(data.renderDashboard),
      passwordExpiryDate: data.passwordExpiryDate ?? null,
      expiresAt: data.expiresAt ?? 0,
    };
  },
);
