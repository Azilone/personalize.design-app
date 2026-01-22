export const TEMPLATE_ASPECT_RATIOS = [
  "ratio_1_1",
  "ratio_3_4",
  "ratio_4_3",
  "ratio_9_16",
  "ratio_16_9",
] as const;

export type TemplateAspectRatio = (typeof TEMPLATE_ASPECT_RATIOS)[number];

export const DEFAULT_TEMPLATE_ASPECT_RATIO: TemplateAspectRatio = "ratio_1_1";

export const TEMPLATE_ASPECT_RATIO_LABELS: Record<
  TemplateAspectRatio,
  string
> = {
  ratio_1_1: "1:1",
  ratio_3_4: "3:4",
  ratio_4_3: "4:3",
  ratio_9_16: "9:16",
  ratio_16_9: "16:9",
};
