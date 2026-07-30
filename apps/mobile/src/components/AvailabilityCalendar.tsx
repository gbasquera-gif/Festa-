import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

interface DayAvailability {
  date: string;
  reserved: number;
  remaining: number;
  available: boolean;
}

const WEEKDAY_LABELS = ["D", "S", "T", "Q", "Q", "S", "S"];
const MONTH_LABELS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function monthKey(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function AvailabilityCalendar({
  value,
  onChange,
}: {
  value: string;
  onChange: (date: string) => void;
}) {
  const today = new Date();
  const [cursor, setCursor] = useState(new Date(Date.UTC(today.getFullYear(), today.getMonth(), 1)));

  const key = monthKey(cursor);
  const { data, isLoading } = useQuery({
    queryKey: ["availability", key],
    queryFn: () => api<DayAvailability[]>(`/availability?month=${key}`),
  });

  const byDate = new Map((data ?? []).map((d) => [d.date, d]));
  const firstWeekday = cursor.getUTCDay();
  const daysInMonth = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0)).getUTCDate();
  const todayKey = new Date().toISOString().slice(0, 10);

  const cells: (string | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${key}-${String(i + 1).padStart(2, "0")}`),
  ];

  function shiftMonth(delta: number) {
    setCursor((c) => new Date(Date.UTC(c.getUTCFullYear(), c.getUTCMonth() + delta, 1)));
  }

  return (
    <View className="gap-3 rounded-2xl border border-[#E5DCC8] bg-white p-4">
      <View className="flex-row items-center justify-between">
        <Pressable onPress={() => shiftMonth(-1)} className="px-3 py-1" hitSlop={8}>
          <Text className="text-lg font-bold text-navy">‹</Text>
        </Pressable>
        <Text className="font-bold text-navy">
          {MONTH_LABELS[cursor.getUTCMonth()]} {cursor.getUTCFullYear()}
        </Text>
        <Pressable onPress={() => shiftMonth(1)} className="px-3 py-1" hitSlop={8}>
          <Text className="text-lg font-bold text-navy">›</Text>
        </Pressable>
      </View>

      <View className="flex-row">
        {WEEKDAY_LABELS.map((w, i) => (
          <Text key={i} className="w-[14.28%] text-center text-xs font-bold text-navy/40">
            {w}
          </Text>
        ))}
      </View>

      <View className="flex-row flex-wrap">
        {cells.map((dateStr, i) => {
          if (!dateStr) return <View key={i} className="w-[14.28%] py-1" />;

          const info = byDate.get(dateStr);
          const isPast = dateStr < todayKey;
          const isSelected = dateStr === value;
          const available = info ? info.available : true;
          const disabled = isPast || !available;

          return (
            <View key={i} className="w-[14.28%] items-center py-1">
              <Pressable
                disabled={disabled}
                onPress={() => onChange(dateStr)}
                className={cellClass(isSelected, isPast, available)}
              >
                <Text className={textClass(isSelected, isPast, available)}>{Number(dateStr.slice(-2))}</Text>
              </Pressable>
            </View>
          );
        })}
      </View>

      {isLoading && <Text className="text-center text-xs text-navy/40">Carregando disponibilidade...</Text>}

      <View className="flex-row items-center justify-center gap-4 pt-1">
        <View className="flex-row items-center gap-1.5">
          <View className="h-3 w-3 rounded-full border border-green-300 bg-green-50" />
          <Text className="text-xs text-navy/60">🟢 Disponível</Text>
        </View>
        <View className="flex-row items-center gap-1.5">
          <View className="h-3 w-3 rounded-full border border-red-300 bg-red-50" />
          <Text className="text-xs text-navy/60">🔴 Indisponível</Text>
        </View>
      </View>
    </View>
  );
}

function cellClass(selected: boolean, past: boolean, available: boolean) {
  if (selected) return "h-9 w-9 items-center justify-center rounded-full bg-coral";
  if (past) return "h-9 w-9 items-center justify-center rounded-full";
  return `h-9 w-9 items-center justify-center rounded-full ${available ? "bg-green-50" : "bg-red-50"}`;
}

function textClass(selected: boolean, past: boolean, available: boolean) {
  if (selected) return "text-sm font-bold text-white";
  if (past) return "text-sm font-semibold text-navy/20";
  return `text-sm font-semibold ${available ? "text-green-700" : "text-red-400"}`;
}
