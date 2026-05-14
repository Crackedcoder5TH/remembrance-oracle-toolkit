/**
 * Site Content — Database-backed editable content store.
 *
 * Stores admin-editable text in the database (site_content table).
 * Falls back to hardcoded defaults when no database entry exists.
 */

import { getDbSiteContent, setDbSiteContent } from "./database";

export const DEFAULT_VETERAN_STORY = [
  "As a veteran, I know what it means to carry responsibility both while you\u2019re wearing the uniform and long after it\u2019s folded away. During my time in service and especially after I transitioned to civilian life, I saw something that really bothered me. A lot of military families believed their standard coverage was enough\u2026 but they were never given the full picture about the life insurance options actually available to them.",
  "Too many of us were left in the dark. That\u2019s why I created this platform.",
  "My mission is simple: to make sure every service member and their families finally get clear, honest information so they can make the best decisions for the people they love.",
  "When you request a review, we\u2019ll connect you with trusted, independent, licensed professionals who truly understand the unique needs of military families. No pressure. Just real guidance and options that actually fit your life.",
  "Because the service we gave our country doesn\u2019t end when we take the uniform off, and neither should the protection we give our families.",
].join("\n");

export interface SiteContent {
  veteranStory: string;
}

export async function getSiteContent(): Promise<SiteContent> {
  const result = await getDbSiteContent("veteranStory");
  if (result.ok && result.value) {
    return { veteranStory: result.value };
  }
  return { veteranStory: DEFAULT_VETERAN_STORY };
}

export async function setSiteContent(content: Partial<SiteContent>): Promise<void> {
  if (content.veteranStory) {
    await setDbSiteContent("veteranStory", content.veteranStory);
  }
}
