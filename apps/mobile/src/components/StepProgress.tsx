import { Text, View } from "react-native";

const STEP_LABELS = ["Sua festa", "Kit", "Extras", "Resumo"] as const;
const TOTAL_STEPS = STEP_LABELS.length;

export function StepProgress({ step }: { step: 1 | 2 | 3 | 4 }) {
  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <Text className="text-xs font-bold uppercase tracking-wide text-navy/50">
          Passo {step} de {TOTAL_STEPS} · {STEP_LABELS[step - 1]}
        </Text>
        <Text className="text-xs font-bold text-coral">⏱️ ~2-3 min</Text>
      </View>
      <View className="h-1.5 w-full overflow-hidden rounded-full bg-sand">
        <View className="h-full rounded-full bg-coral" style={{ width: `${(step / TOTAL_STEPS) * 100}%` }} />
      </View>
    </View>
  );
}
