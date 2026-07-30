import { ActivityIndicator, Pressable, Text, type PressableProps } from "react-native";
import { cn } from "@/lib/cn";

interface ButtonProps extends Omit<PressableProps, "children"> {
  children: string;
  variant?: "primary" | "outline" | "ghost";
  loading?: boolean;
}

const VARIANT_STYLES: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-coral active:bg-coral/90",
  outline: "bg-transparent border border-navy",
  ghost: "bg-transparent",
};

const VARIANT_TEXT: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "text-white",
  outline: "text-navy",
  ghost: "text-navy",
};

export function Button({ children, variant = "primary", loading, disabled, className, ...props }: ButtonProps & { className?: string }) {
  return (
    <Pressable
      disabled={disabled || loading}
      className={cn(
        "flex-row items-center justify-center rounded-2xl px-6 py-4",
        VARIANT_STYLES[variant],
        (disabled || loading) && "opacity-60",
        className,
      )}
      {...props}
    >
      {loading && <ActivityIndicator color={variant === "primary" ? "#fff" : "#0F2A4F"} className="mr-2" />}
      <Text className={cn("text-base font-bold", VARIANT_TEXT[variant])}>{children}</Text>
    </Pressable>
  );
}
