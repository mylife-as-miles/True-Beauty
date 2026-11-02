import { z } from "zod";
export const FeatureState = z.enum([
  "implemented-verified",
  "implemented-unverified",
  "in-progress",
  "planned",
  "blocked",
]);
export const RemoteConsent = z.object({
  uploadConsent: z.literal(true),
  costAuthorized: z.literal(true),
  maxCost: z.number().nonnegative().max(20),
});
export type Space =
  | "studio"
  | "skin"
  | "wardrobe"
  | "discover"
  | "journal"
  | "intelligence"
  | "canvas";
export type StudioMode = "makeup" | "hair" | "style";
export type SourceMode = "demo" | "camera" | "upload";
export interface ToastMessage {
  id: string;
  message: string;
  tone: "success" | "error" | "info";
}
