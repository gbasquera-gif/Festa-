import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

// expo-secure-store has no web implementation — fall back to localStorage there.
export async function getItem(key: string) {
  if (Platform.OS === "web") return localStorage.getItem(key);
  return SecureStore.getItemAsync(key);
}

export async function setItem(key: string, value: string) {
  if (Platform.OS === "web") {
    localStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function removeItem(key: string) {
  if (Platform.OS === "web") {
    localStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}
