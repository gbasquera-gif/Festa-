import { ActivityIndicator, Pressable, Text, type PressableProps } from "react-native";
import { cn } from "@/lib/cn";
import { colors } from "@/theme";

interface ButtonProps extends Omit<PressableProps, "children"> {
  children: string;
  variant?: "primary" | "navy" | "outline" | "ghost";
  loading?: boolean;
}

const VARIANT_STYLES: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-coral active:bg-coral/90",
  navy: "bg-navy active:bg-navy/90",
  outline: "bg-transparent border border-navy",
  ghost: "bg-transparent",
};

const VARIANT_TEXT: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "text-white",
  navy: "text-white",
  outline: "text-navy",
  ghost: "text-navy",
};

const SPINNER_COLOR: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: colors.white,
  navy: colors.white,
  outline: colors.navy,
  ghost: colors.navy,
};

export function Button({
  children,
  variant = "primary",
  loading,
  disabled,
  className,
  ...props
}: ButtonProps & { className?: string }) {
  return (
    <Pressable
      disabled={disabled || loading}
      className={cn(
        "flex-row items-center justify-center rounded-full px-6 py-4",
        VARIANT_STYLES[variant],
        (disabled || loading) && "opacity-60",
        className,
      )}
      {...props}
    >
      {loading && <ActivityIndicator color={SPINNER_COLOR[variant]} className="mr-2" />}
      {/* numberOfLines evita que rótulos longos quebrem o botão em duas linhas
          quando ele divide a largura com outro controle. */}
      <Text numberOfLines={1} className={cn("text-base font-sans-bold", VARIANT_TEXT[variant])}>
        {children}
      </Text>
    </Pressable>
  );
}
