// Server-only login orchestration.
import { CDSC_URLS, CdscError, cdscRequestWithHeaders } from "./cdsc.server";
import { fetchCapitals, fetchOwnDetail } from "./api.server";
import { getMeroShareSession } from "./session.server";
import type { OwnDetail, SessionUser } from "./types";

const SESSION_TTL_MS = 1000 * 60 * 60 * 2;

/**
 * CDSC pads the username with leading zeros in profile responses (e.g.
 * "00612609") but sign-in uses the unpadded form ("612609"). Normalize so the
 * session always holds the real login username.
 */
export function normalizeUsername(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (/^\d+$/.test(raw)) {
    const stripped = raw.replace(/^0+/, "");
    if (stripped) return stripped;
  }
  return raw;
}

export function toSessionUser(
  detail: OwnDetail,
  capitalId: number,
  expiresAt: number,
): SessionUser {
  return {
    name: String(detail.name ?? ""),
    username: normalizeUsername(detail.username),
    demat: String(detail.demat ?? ""),
    boid: String(detail.boid ?? ""),
    clientCode: String(detail.clientCode ?? ""),
    capitalId,
    accountNumber: String(detail.accountNumber ?? ""),
    renderDashboard: Boolean(detail.renderDashboard),
    passwordExpiryDate: (detail.passwordExpiryDateStr as string) ?? null,
    expiresAt,
  };
}

export async function performLogin(input: {
  capitalId: number;
  username: string;
  password: string;
}): Promise<SessionUser> {
  const capitals = await fetchCapitals();
  if (!capitals.some((c) => c.id === input.capitalId)) {
    throw new CdscError("Please pick your depository participant from the list.", 400);
  }

  const { data, headers } = await cdscRequestWithHeaders<Record<string, unknown>>(CDSC_URLS.login, {
    method: "POST",
    body: {
      clientId: input.capitalId,
      username: input.username,
      password: input.password,
    },
  });

  const token = headers.get("Authorization") ?? headers.get("authorization");
  if (!token) {
    const message =
      typeof data?.["message"] === "string"
        ? (data["message"] as string)
        : "MeroShare rejected those credentials.";
    throw new CdscError(message, 401);
  }

  const expiresAt = Date.now() + SESSION_TTL_MS;
  const detail = await fetchOwnDetail({
    token,
    demat: "",
    boid: "",
    clientCode: "",
    name: "",
    username: input.username,
    accountNumber: "",
  });

  const user = toSessionUser(detail, input.capitalId, expiresAt);

  const session = await getMeroShareSession();
  await session.update({
    token,
    name: user.name,
    username: user.username,
    demat: user.demat,
    boid: user.boid,
    clientCode: user.clientCode,
    capitalId: input.capitalId,
    accountNumber: user.accountNumber,
    renderDashboard: user.renderDashboard,
    passwordExpiryDate: user.passwordExpiryDate,
    expiresAt,
  });

  return user;
}
