/** A WebRTC ICE server entry, in the shape browsers accept in `RTCConfiguration.iceServers`. */
export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/** Hands voice clients the STUN/TURN servers they connect through. */
export interface IceServerProvider {
  getIceServers(): Promise<IceServer[]>;
}

/** Free public STUN: enough when peers can reach each other directly, with no relay fallback. */
export const PUBLIC_STUN: IceServer[] = [{ urls: "stun:stun.cloudflare.com:3478" }];

export class StunOnlyIceServers implements IceServerProvider {
  getIceServers(): Promise<IceServer[]> {
    return Promise.resolve(PUBLIC_STUN);
  }
}

/** Short-lived Cloudflare Realtime TURN credentials, generated per request. */
export class CloudflareTurnIceServers implements IceServerProvider {
  constructor(
    private readonly keyId: string,
    private readonly apiToken: string,
    private readonly ttlSeconds = 4 * 60 * 60,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async getIceServers(): Promise<IceServer[]> {
    const res = await this.fetchImpl(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(this.keyId)}/credentials/generate-ice-servers`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ttl: this.ttlSeconds }),
      },
    );
    if (!res.ok) throw new Error(`Cloudflare TURN credentials request failed with ${res.status}`);
    const body = (await res.json()) as { iceServers?: IceServer | IceServer[] };
    const servers = Array.isArray(body.iceServers) ? body.iceServers : body.iceServers ? [body.iceServers] : [];
    return servers.map(withoutPort53).filter((s) => s.urls.length > 0);
  }
}

/** Browsers block port 53, so Cloudflare's port-53 URLs only make ICE gathering wait for a timeout. */
function withoutPort53(server: IceServer): IceServer {
  const urls = (Array.isArray(server.urls) ? server.urls : [server.urls]).filter((u) => !/:53(\?|$)/.test(u));
  return { ...server, urls };
}
