// turndown-plugin-gfm no publica .d.ts. Solo se usan `gfm` (que ya incluye
// tables) y `tables`; el resto se declara para no mentir sobre la superficie.
declare module "turndown-plugin-gfm" {
  import type TurndownService from "turndown";
  export const gfm: TurndownService.Plugin;
  export const tables: TurndownService.Plugin;
  export const strikethrough: TurndownService.Plugin;
  export const taskListItems: TurndownService.Plugin;
  export const highlightedCodeBlock: TurndownService.Plugin;
}
