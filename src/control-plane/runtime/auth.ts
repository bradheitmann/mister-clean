import { createHash, timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";

export interface LocalAuthenticator {
  authenticateAuthorizationHeader(value: string | null): boolean;
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/** Holds only a digest and compares fixed-length buffers in constant time. */
export class StaticBearerAuthenticator implements LocalAuthenticator {
  readonly #expectedDigest: Buffer;

  constructor(token: string) {
    if (token.length < 32 || token.length > 4096 || /\s/u.test(token)) {
      throw new Error("Local control-plane bearer tokens must contain between 32 and 4096 non-whitespace characters");
    }
    this.#expectedDigest = digest(token);
  }

  authenticateAuthorizationHeader(value: string | null): boolean {
    if (value === null || !value.startsWith("Bearer ")) return false;
    const presented = value.slice("Bearer ".length);
    if (presented.length === 0 || /[\s\r\n]/.test(presented)) return false;
    return timingSafeEqual(this.#expectedDigest, digest(presented));
  }
}
