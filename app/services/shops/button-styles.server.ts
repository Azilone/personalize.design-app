import prisma from "../../db.server";

export type ButtonStyles = {
  use_custom: boolean;
  background_color: string | null;
  text_color: string | null;
  border_radius: string | null;
  font_size: string | null;
  font_weight: string | null;
  letter_spacing: string | null;
  padding_x: string | null;
  padding_y: string | null;
  border_width: string | null;
  border_color: string | null;
  box_shadow: string | null;
  hover_background_color: string | null;
  hover_text_color: string | null;
  hover_box_shadow: string | null;
  disabled_background_color: string | null;
  disabled_text_color: string | null;
};

export type ButtonStylesInput = {
  shopId: string;
  use_custom: boolean;
  background_color?: string | null;
  text_color?: string | null;
  border_radius?: string | null;
  font_size?: string | null;
  font_weight?: string | null;
  letter_spacing?: string | null;
  padding_x?: string | null;
  padding_y?: string | null;
  border_width?: string | null;
  border_color?: string | null;
  box_shadow?: string | null;
  hover_background_color?: string | null;
  hover_text_color?: string | null;
  hover_box_shadow?: string | null;
  disabled_background_color?: string | null;
  disabled_text_color?: string | null;
};

export const getButtonStyles = async (
  shopId: string,
): Promise<ButtonStyles> => {
  const settings = await prisma.shopButtonStyles.findUnique({
    where: { shop_id: shopId },
  });

  return {
    use_custom: settings?.use_custom ?? false,
    background_color: settings?.background_color ?? null,
    text_color: settings?.text_color ?? null,
    border_radius: settings?.border_radius ?? null,
    font_size: settings?.font_size ?? null,
    font_weight: settings?.font_weight ?? null,
    letter_spacing: settings?.letter_spacing ?? null,
    padding_x: settings?.padding_x ?? null,
    padding_y: settings?.padding_y ?? null,
    border_width: settings?.border_width ?? null,
    border_color: settings?.border_color ?? null,
    box_shadow: settings?.box_shadow ?? null,
    hover_background_color: settings?.hover_background_color ?? null,
    hover_text_color: settings?.hover_text_color ?? null,
    hover_box_shadow: settings?.hover_box_shadow ?? null,
    disabled_background_color: settings?.disabled_background_color ?? null,
    disabled_text_color: settings?.disabled_text_color ?? null,
  };
};

export const upsertButtonStyles = async (input: ButtonStylesInput) => {
  const data = {
    use_custom: input.use_custom,
    background_color: input.background_color ?? null,
    text_color: input.text_color ?? null,
    border_radius: input.border_radius ?? null,
    font_size: input.font_size ?? null,
    font_weight: input.font_weight ?? null,
    letter_spacing: input.letter_spacing ?? null,
    padding_x: input.padding_x ?? null,
    padding_y: input.padding_y ?? null,
    border_width: input.border_width ?? null,
    border_color: input.border_color ?? null,
    box_shadow: input.box_shadow ?? null,
    hover_background_color: input.hover_background_color ?? null,
    hover_text_color: input.hover_text_color ?? null,
    hover_box_shadow: input.hover_box_shadow ?? null,
    disabled_background_color: input.disabled_background_color ?? null,
    disabled_text_color: input.disabled_text_color ?? null,
  };

  return prisma.shopButtonStyles.upsert({
    where: { shop_id: input.shopId },
    update: data,
    create: {
      shop_id: input.shopId,
      ...data,
    },
  });
};

export const getButtonStylesForStorefront = async (shopId: string) => {
  const styles = await getButtonStyles(shopId);

  return {
    use_custom: styles.use_custom,
    styles: styles.use_custom
      ? {
          background_color: styles.background_color,
          text_color: styles.text_color,
          border_radius: styles.border_radius,
          font_size: styles.font_size,
          font_weight: styles.font_weight,
          letter_spacing: styles.letter_spacing,
          padding_x: styles.padding_x,
          padding_y: styles.padding_y,
          border_width: styles.border_width,
          border_color: styles.border_color,
          box_shadow: styles.box_shadow,
          hover_background_color: styles.hover_background_color,
          hover_text_color: styles.hover_text_color,
          hover_box_shadow: styles.hover_box_shadow,
          disabled_background_color: styles.disabled_background_color,
          disabled_text_color: styles.disabled_text_color,
        }
      : null,
  };
};
