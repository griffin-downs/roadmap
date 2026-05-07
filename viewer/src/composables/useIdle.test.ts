// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createApp, defineComponent, h, type App, type Ref } from "vue";
import { useIdle, IDLE_THRESHOLD_MS } from "./useIdle";

// Mount the composable inside a real component so onMounted fires.
function mount(thresholdMs?: number): { idle: Ref<boolean>; app: App; host: HTMLElement } {
  const host = document.createElement("div");
  document.body.appendChild(host);
  let idle!: Ref<boolean>;
  const Component = defineComponent({
    setup() {
      idle = useIdle(thresholdMs);
      return () => h("div");
    },
  });
  const app = createApp(Component);
  app.mount(host);
  return { idle, app, host };
}

let addCount = 0;
let removeCount = 0;
let origDocAdd: typeof document.addEventListener;
let origDocRemove: typeof document.removeEventListener;
let origWinAdd: typeof window.addEventListener;
let origWinRemove: typeof window.removeEventListener;

function patchListenerCounters(): void {
  addCount = 0;
  removeCount = 0;
  origDocAdd = document.addEventListener.bind(document);
  origDocRemove = document.removeEventListener.bind(document);
  origWinAdd = window.addEventListener.bind(window);
  origWinRemove = window.removeEventListener.bind(window);
  document.addEventListener = ((t: string, l: EventListenerOrEventListenerObject, o?: AddEventListenerOptions | boolean) => { addCount++; return origDocAdd(t, l, o); }) as typeof document.addEventListener;
  document.removeEventListener = ((t: string, l: EventListenerOrEventListenerObject, o?: EventListenerOptions | boolean) => { removeCount++; return origDocRemove(t, l, o); }) as typeof document.removeEventListener;
  window.addEventListener = ((t: string, l: EventListenerOrEventListenerObject, o?: AddEventListenerOptions | boolean) => { addCount++; return origWinAdd(t, l, o); }) as typeof window.addEventListener;
  window.removeEventListener = ((t: string, l: EventListenerOrEventListenerObject, o?: EventListenerOptions | boolean) => { removeCount++; return origWinRemove(t, l, o); }) as typeof window.removeEventListener;
}

function restoreListeners(): void {
  document.addEventListener = origDocAdd;
  document.removeEventListener = origDocRemove;
  window.addEventListener = origWinAdd;
  window.removeEventListener = origWinRemove;
}

beforeEach(() => {
  vi.useFakeTimers();
  // jsdom default: hidden=false, hasFocus()=true (we override per-test)
  Object.defineProperty(document, "hidden", { get: () => false, configurable: true });
  document.hasFocus = () => true;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useIdle", () => {
  it("starts non-idle when visible · focused · no inactivity", () => {
    const { idle, app, host } = mount();
    expect(idle.value).toBe(false);
    app.unmount();
    host.remove();
  });

  it("flips idle on visibilitychange when document.hidden = true", () => {
    const { idle, app, host } = mount();
    Object.defineProperty(document, "hidden", { get: () => true, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(idle.value).toBe(true);
    app.unmount();
    host.remove();
  });

  it("flips idle on window blur", () => {
    const { idle, app, host } = mount();
    window.dispatchEvent(new Event("blur"));
    expect(idle.value).toBe(true);
    app.unmount();
    host.remove();
  });

  it("flips idle after thresholdMs of inactivity", () => {
    const { idle, app, host } = mount();
    expect(idle.value).toBe(false);
    vi.advanceTimersByTime(IDLE_THRESHOLD_MS);
    expect(idle.value).toBe(true);
    app.unmount();
    host.remove();
  });

  it("resets to non-idle on pointermove", () => {
    const { idle, app, host } = mount();
    vi.advanceTimersByTime(IDLE_THRESHOLD_MS);
    expect(idle.value).toBe(true);
    document.dispatchEvent(new Event("pointermove"));
    expect(idle.value).toBe(false);
    app.unmount();
    host.remove();
  });

  it("cleanup · unmount removes all listeners it added", () => {
    patchListenerCounters();
    try {
      const { app, host } = mount();
      const added = addCount;
      app.unmount();
      host.remove();
      expect(removeCount).toBe(added);
      expect(removeCount).toBeGreaterThan(0);
    } finally {
      restoreListeners();
    }
  });
});
