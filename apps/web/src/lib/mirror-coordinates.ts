export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}
/** Source-normalized geometry through object-fit:cover and a transformed canvas box. */
export function sourceCoordinates(
  client: { x: number; y: number },
  box: Box,
  source: { width: number; height: number },
  position = { x: 0.5, y: 0.5 },
  fit: "cover" | "contain" = "cover",
) {
  const scale = (fit === "contain" ? Math.min : Math.max)(
      box.width / source.width,
      box.height / source.height,
    ),
    width = source.width * scale,
    height = source.height * scale;
  return {
    x: (client.x - box.left - (box.width - width) * position.x) / width,
    y: (client.y - box.top - (box.height - height) * position.y) / height,
  };
}
export function objectPosition(value: string) {
  const parts = value.split(/\s+/);
  const axis = (part: string | undefined) =>
    part === "left" || part === "top"
      ? 0
      : part === "right" || part === "bottom"
        ? 1
        : part?.endsWith("%")
          ? parseFloat(part) / 100
          : 0.5;
  return { x: axis(parts[0]), y: axis(parts[1]) };
}
