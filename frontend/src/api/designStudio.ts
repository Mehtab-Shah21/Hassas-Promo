import { apiClient } from "./client";

export type DocKind = "invoice" | "quotation";

export interface TemplateConfig {
  layout_preset: "classic" | "modern" | "minimal";
  primary_color: string;
  accent_color: string;
  font_family: "sans" | "serif" | "mono";
  font_size: "small" | "normal" | "large";
  logo_enabled: boolean;
  logo_position: "left" | "center" | "right";
  show_sender_block: boolean;
  show_tax_breakdown: boolean;
  show_notes: boolean;
  show_terms: boolean;
  show_signature: boolean;
  show_amount_in_words: boolean;
  table_style: "simple" | "striped" | "bordered";
  bill_to_fields: string[];
  margins: "narrow" | "normal" | "wide";
  show_border: boolean;
}

export async function getDefaultTemplateConfig(docType: DocKind): Promise<TemplateConfig> {
  const res = await apiClient.get<TemplateConfig>("/api/design-studio/defaults", { params: { doc_type: docType } });
  return res.data;
}

export async function fetchPreviewHtml(docType: DocKind, config: TemplateConfig): Promise<string> {
  const res = await apiClient.get<string>("/api/design-studio/preview", {
    params: { doc_type: docType, config: JSON.stringify(config) },
    responseType: "text",
  });
  return res.data;
}

export interface ThermalConfig {
  logo_enabled: boolean;
  header_text: string;
  footer_text: string;
  font_size: "small" | "normal" | "large";
  show_customer_name: boolean;
  show_payment_method: boolean;
  show_tax_breakdown: boolean;
  show_reprint_notice: boolean;
}

export async function getDefaultThermalConfig(): Promise<ThermalConfig> {
  const res = await apiClient.get<ThermalConfig>("/api/design-studio/thermal-defaults");
  return res.data;
}

export async function fetchThermalPreviewHtml(config: ThermalConfig, width: 58 | 80): Promise<string> {
  const res = await apiClient.get<string>("/api/design-studio/thermal-preview", {
    params: { config: JSON.stringify(config), width },
    responseType: "text",
  });
  return res.data;
}
