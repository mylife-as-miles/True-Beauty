/** Runtime-neutral source validation. Decoded images stay in request memory. */
export function imageBytes(
  base64: string,
  mime: "image/png" | "image/jpeg",
): Uint8Array {
  if (
    base64.length > 5_600_000 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      base64,
    )
  )
    throw new Error("Malformed image encoding.");
  const decoded = atob(base64);
  if (decoded.length < 100 || decoded.length > 4 * 1024 * 1024)
    throw new Error("Images must be between 100 bytes and 4 MB.");
  const bytes = Uint8Array.from(decoded, (c) => c.charCodeAt(0));
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n);
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if ((mime === "image/png" && !png) || (mime === "image/jpeg" && !jpeg)) {
    bytes.fill(0);
    throw new Error("Image file signature does not match its declared type.");
  }
  return bytes;
}
