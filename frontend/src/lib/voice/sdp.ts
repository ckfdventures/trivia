/** Opus receive preferences we ask peers to use when sending to us: mono speech, ~24 kbps, silence suppression. */
const OPUS_PARAMS: Record<string, string> = {
  stereo: "0",
  "sprop-stereo": "0",
  usedtx: "1",
  useinbandfec: "1",
  maxaveragebitrate: "24000",
};

/**
 * Rewrite the Opus `a=fmtp` line of a session description with OPUS_PARAMS. The fmtp parameters in our description
 * tell the other side how to encode what it sends us, so munging only the copy we send over signaling is enough.
 */
export function withVoiceOpusParams(sdp: string): string {
  const payloadType = /a=rtpmap:(\d+) opus\/48000/i.exec(sdp)?.[1];
  if (!payloadType) return sdp;
  const fmtpPattern = new RegExp(`a=fmtp:${payloadType} ([^\\r\\n]*)`);
  const existing = fmtpPattern.exec(sdp);
  const params = new Map<string, string>();
  for (const part of existing?.[1]?.split(";") ?? []) {
    const [key, value] = part.split("=");
    if (key?.trim()) params.set(key.trim(), (value ?? "").trim());
  }
  for (const [key, value] of Object.entries(OPUS_PARAMS)) params.set(key, value);
  const line = `a=fmtp:${payloadType} ${[...params].map(([k, v]) => `${k}=${v}`).join(";")}`;
  if (existing) return sdp.replace(fmtpPattern, line);
  return sdp.replace(new RegExp(`(a=rtpmap:${payloadType} opus/48000[^\\r\\n]*)`, "i"), `$1\r\n${line}`);
}
