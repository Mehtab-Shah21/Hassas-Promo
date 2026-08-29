import { apiClient } from "./client";

export interface TemplateConfig {
  layout_preset: string;
  primary_color: string;
  accent_color: string;
  font_family: "sans" | "serif";
  font_size: "small" | "normal" | "large";
  logo_enabled: boolean;
  logo_position: "left" | "center" | "right";
  show_sender_block: boolean;
  show_tax_breakdown: boolean;
  show_notes: boolean;
  show_terms: boolean;
  show_signature: boolean;
  show_watermark: boolean;
  show_amount_in_words: boolean;
  table_style: "simple" | "striped" | "bordered";
  bill_to_fields: string[];
}

export async function getDefaultTemplateConfig(): Promise<TemplateConfig> {
  const res = await apiClient.get<TemplateConfig>("/api/design-studio/defaults");
  return res.data;
}

export async function fetchPreviewHtml(config: TemplateConfig): Promise<string> {
  const res = await apiClient.get<string>("/api/design-studio/preview", {
    params: { config: JSON.stringify(config) },
    responseType: "text",
  });
  return res.data;
}
