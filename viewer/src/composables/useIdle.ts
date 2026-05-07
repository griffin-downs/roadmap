// useIdle · idle = OR(hidden, !focus, inactivity ≥ thresholdMs)
import { ref, onMounted, onScopeDispose, type Ref } from "vue";

export const IDLE_THRESHOLD_MS = 12_000;

export function useIdle(thresholdMs: number = IDLE_THRESHOLD_MS): Ref<boolean> {
  const idle = ref(false);

  if (typeof document === "undefined" || typeof window === "undefined") return idle;

  let timer: ReturnType<typeof setTimeout> | null = null;

  const clearTimer = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const armTimer = (): void => {
    clearTimer();
    timer = setTimeout(() => { idle.value = true; }, thresholdMs);
  };

  const recompute = (): void => {
    if (document.hidden || !document.hasFocus()) {
      idle.value = true;
      return;
    }
    idle.value = false;
  };

  const onActivity = (): void => {
    idle.value = false;
    armTimer();
  };

  const onVisibility = (): void => {
    if (document.hidden) {
      idle.value = true;
      clearTimer();
      return;
    }
    idle.value = false;
    armTimer();
  };

  const onFocus = (): void => {
    idle.value = false;
    armTimer();
  };

  const onBlur = (): void => {
    idle.value = true;
    clearTimer();
  };

  onMounted(() => {
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("pointermove", onActivity);
    document.addEventListener("keydown", onActivity);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    recompute();
    armTimer();
  });

  onScopeDispose(() => {
    document.removeEventListener("visibilitychange", onVisibility);
    document.removeEventListener("pointermove", onActivity);
    document.removeEventListener("keydown", onActivity);
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("blur", onBlur);
    clearTimer();
  });

  return idle;
}
