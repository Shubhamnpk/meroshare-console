import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fetchCapitals } from "./api.server";
import { performLogin } from "./auth.server";
import { getMeroShareSession, readSession } from "./session.server";
import { logoutCdsc } from "./api.server";
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
  .inputValidator((input: unknown) =>
    z
      .object({
        capitalId: z.number().int().positive(),
        username: z.string().trim().min(1).max(64),
        password: z.string().min(1).max(128),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<SessionUser> => performLogin(data));

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  const data = await readSession();
  if (data.token) {
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
    if (!data.token || !data.demat) return null;
    if (data.expiresAt && Date.now() > data.expiresAt) return null;
    return {
      name: data.name ?? "",
      username: data.username ?? "",
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
