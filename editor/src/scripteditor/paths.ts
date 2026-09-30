import { type ScriptLanguage } from "../scripteditor/types.js";

export function languageForPath(path: string): ScriptLanguage {
  const extension = path.includes(".") ? path.slice(path.lastIndexOf(".") + 1).toLowerCase() : "";
  if (extension === "js" || extension === "mjs") return "javascript";
  if (extension === "ts") return "typescript";
  if (extension === "json") return "json";
  if (extension === "obx" || extension === "frag" || extension === "vert" || extension === "wgsl") return "obx-shader";
  return "text";
}
