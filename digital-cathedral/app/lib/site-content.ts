/**
 * Site Content — File-based editable content store.
 *
 * Stores admin-editable text in a JSON file (.cathedral/site-content.json).
 * Falls back to hardcoded defaults when no file exists.
 */

import fs from "fs";
import path from "path";

const IS_VERCEL = !!process.env.VERCEL;
const CONTENT_DIR = IS_VERCEL
  ? path.join("/tmp", ".cathedral")
  : path.join(process.cwd(), ".cathedral");
const CONTENT_PATH = path.join(CONTENT_DIR, "site-content.json");

export const DEFAULT_VETERAN_STORY = [
  "As a veteran, I know what it means to carry responsibility both while you\u2019re wearing the uniform and long after it\u2019s folded away. During my time in service and especially after I transitioned to civilian life, I saw something that really bothered me. A lot of military families believed their standard coverage was enough\u2026 but they were never given the full picture about the life insurance options actually available to them.",
  "Too many of us were left in the dark. That\u2019s why I created this platform.",
  "My mission is simple: to make sure every service member and their families finally get clear, honest information so they can make the best decisions for the people they love.",
  "When you request a review, we\u2019ll connect you with trusted, independent, licensed professionals who truly understand the unique needs of military families. No pressure. Just real guidance and options that actually fit your life.",
  "Because the service we gave our country doesn\u2019t end when we take the uniform off \u2014 and neither should the protection we give our families. \uD83C\uDDFA\uD83C\uDDF8",
].join("\n");

export interface SiteContent {
  veteranStory: string;
}

export function getSiteContent(): SiteContent {
  try {
    if (fs.existsSync(CONTENT_PATH)) {
      const raw = fs.readFileSync(CONTENT_PATH, "utf-8");
      const data = JSON.parse(raw);
      return {
        veteranStory: data.veteranStory || DEFAULT_VETERAN_STORY,
      };
    }
  } catch {
    // Fall through to defaults
  }
  return { veteranStory: DEFAULT_VETERAN_STORY };
}

export function setSiteContent(content: Partial<SiteContent>): void {
  const current = getSiteContent();
  const updated = { ...current, ...content };

  if (!fs.existsSync(CONTENT_DIR)) {
    fs.mkdirSync(CONTENT_DIR, { recursive: true });
  }
  fs.writeFileSync(CONTENT_PATH, JSON.stringify(updated, null, 2), "utf-8");
}
