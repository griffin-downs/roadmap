<template>
  <!--
    FieldExpander — DUMB recursive JSON viewer.
    Props in: data (any), path (current json-path), search (live filter), depth (recursion guard).
    Events out: copy-path (string).
    No fetch · no setInterval · no derivation in script setup beyond pure computed (§Dumb-components).
  -->
  <div
    v-if="visible"
    class="fx-row"
    :class="{ 'fx-row--match': isMatch }"
  >
    <div class="fx-line">
      <button
        v-if="isContainer"
        type="button"
        class="fx-toggle"
        :aria-expanded="open"
        @click="toggle"
        @keydown.enter.prevent="toggle"
        @keydown.space.prevent="toggle"
        @keydown.right.prevent="open = true"
        @keydown.left.prevent="open = false"
      >{{ open ? '▼' : '▶' }}</button>
      <span v-else class="fx-bullet">·</span>

      <span v-if="keyLabel !== undefined" class="fx-key">{{ keyLabel }}</span>
      <span v-if="keyLabel !== undefined" class="fx-colon">:</span>

      <span v-if="!isContainer" class="fx-val" :class="`fx-val--${kind}`">{{ display }}</span>
      <span v-else class="fx-summary">
        {{ summary }}
      </span>

      <span v-if="hint" class="fx-hint">{{ hint }}</span>

      <button
        type="button"
        class="fx-copy"
        :title="`copy path: ${path}`"
        @click.stop="copy"
      >⧉</button>
    </div>

    <div v-if="isContainer && open" class="fx-children">
      <FieldExpander
        v-for="entry in entries"
        :key="entry.key"
        :data="entry.value"
        :data-key="entry.key"
        :path="entry.path"
        :search="search"
        :depth="depth + 1"
        :force-open="forceOpenChildren"
        @copy-path="(p) => emit('copy-path', p)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { ComputedRef, Ref } from "vue";

interface Props {
  data: unknown;
  path?: string;
  dataKey?: string | number;
  search?: string;
  depth?: number;
  forceOpen?: boolean;
}
const props = withDefaults(defineProps<Props>(), {
  path: "$",
  dataKey: undefined,
  search: "",
  depth: 0,
  forceOpen: false,
});

const emit = defineEmits<{ (e: "copy-path", path: string): void }>();

const open: Ref<boolean> = ref(props.depth < 1);

const isContainer: ComputedRef<boolean> = computed(() => {
  const d = props.data;
  return d !== null && typeof d === "object";
});

const isArray: ComputedRef<boolean> = computed(() => Array.isArray(props.data));

const kind: ComputedRef<string> = computed(() => {
  const d = props.data;
  if (d === null) return "null";
  if (Array.isArray(d)) return "array";
  return typeof d;
});

const display: ComputedRef<string> = computed(() => {
  const d = props.data;
  if (d === null) return "null";
  if (typeof d === "string") return `"${d}"`;
  return String(d);
});

const hint: ComputedRef<string> = computed(() => {
  const d = props.data;
  if (typeof d !== "string") return "";
  if (/^[0-9a-f]{7,40}$/i.test(d)) return "sha";
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) return "date";
  if (/^(\.|\/|~)/.test(d) && d.length < 200) return "path";
  return "";
});

const keyLabel: ComputedRef<string | undefined> = computed(() => {
  if (props.dataKey === undefined) return undefined;
  return String(props.dataKey);
});

const entries: ComputedRef<Array<{ key: string; value: unknown; path: string }>> = computed(() => {
  if (!isContainer.value) return [];
  const d = props.data as Record<string, unknown> | unknown[];
  if (Array.isArray(d)) {
    return d.map((value, i) => ({ key: String(i), value, path: `${props.path}[${i}]` }));
  }
  return Object.keys(d).map((k) => ({
    key: k,
    value: (d as Record<string, unknown>)[k],
    path: pathJoin(props.path, k),
  }));
});

function pathJoin(base: string, key: string): string {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return `${base}.${key}`;
  return `${base}[${JSON.stringify(key)}]`;
}

const summary: ComputedRef<string> = computed(() => {
  if (!isContainer.value) return "";
  if (isArray.value) return `[${entries.value.length} items]`;
  return `{${entries.value.length} keys}`;
});

const subtreeText: ComputedRef<string> = computed(() => {
  try { return JSON.stringify(props.data).toLowerCase(); } catch { return ""; }
});

const isMatch: ComputedRef<boolean> = computed(() => {
  const q = (props.search ?? "").trim().toLowerCase();
  if (!q) return false;
  const k = keyLabel.value?.toLowerCase() ?? "";
  if (k.includes(q)) return true;
  if (!isContainer.value) return display.value.toLowerCase().includes(q);
  return false;
});

const subtreeHasMatch: ComputedRef<boolean> = computed(() => {
  const q = (props.search ?? "").trim().toLowerCase();
  if (!q) return false;
  return subtreeText.value.includes(q);
});

const visible: ComputedRef<boolean> = computed(() => {
  const q = (props.search ?? "").trim();
  if (!q) return true;
  return isMatch.value || subtreeHasMatch.value || props.forceOpen;
});

const forceOpenChildren: ComputedRef<boolean> = computed(() => subtreeHasMatch.value);

watch(
  () => (props.search ?? "").trim(),
  (q) => {
    if (q && subtreeHasMatch.value) open.value = true;
  },
);

function toggle(): void {
  open.value = !open.value;
}

async function copy(): Promise<void> {
  try { await navigator.clipboard.writeText(props.path); } catch { /* clipboard unavailable */ }
  emit("copy-path", props.path);
}
</script>

<style scoped>
.fx-row {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 11px;
  line-height: 1.5;
}
.fx-row--match > .fx-line {
  background: oklch(0.55 0.18 25 / 0.12);
  outline: 1px solid oklch(0.55 0.18 25 / 0.4);
}
.fx-line {
  display: flex;
  gap: 4px;
  align-items: baseline;
  padding: 1px 2px;
}
.fx-toggle {
  background: transparent;
  border: none;
  color: var(--text-meta, #888);
  cursor: pointer;
  font: inherit;
  padding: 0;
  width: 12px;
  text-align: center;
}
.fx-toggle:focus-visible { outline: 1px solid var(--accent-red, #d33); }
.fx-bullet { color: var(--text-meta, #888); width: 12px; text-align: center; }
.fx-key { color: var(--text-primary, #eee); }
.fx-colon { color: var(--text-meta, #888); margin-right: 2px; }
.fx-val { word-break: break-all; }
.fx-val--string { color: oklch(0.75 0.10 145); }
.fx-val--number { color: oklch(0.75 0.10 240); }
.fx-val--boolean { color: oklch(0.75 0.10 60); }
.fx-val--null { color: var(--text-meta, #888); font-style: italic; }
.fx-summary { color: var(--text-meta, #888); }
.fx-hint {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-meta, #888);
  border: 1px solid var(--chrome-25, #333);
  padding: 0 3px;
  margin-left: 4px;
}
.fx-copy {
  background: transparent;
  border: none;
  color: var(--text-meta, #888);
  cursor: pointer;
  font: inherit;
  padding: 0 2px;
  margin-left: auto;
  opacity: 0;
  transition: opacity 120ms;
}
.fx-line:hover .fx-copy { opacity: 1; }
.fx-copy:hover { color: var(--accent-red, #d33); }
.fx-children {
  margin-left: 12px;
  border-left: 1px solid var(--chrome-15, #222);
  padding-left: 4px;
}
</style>
