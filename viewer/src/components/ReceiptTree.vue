<template>
  <div class="receipt-tree" :style="{ paddingLeft: depth === 0 ? '0' : '12px' }">
    <span v-if="isPrimitive" class="receipt-prim" :class="`receipt-prim--${primKind}`">
      <span v-if="path !== ''" class="receipt-key">{{ path }}: </span>
      <span class="receipt-value">{{ formatPrim(node) }}</span>
    </span>

    <details v-else-if="isArray" class="receipt-collapsible" :open="depth < 1">
      <summary class="receipt-summary">
        <span v-if="path !== ''" class="receipt-key">{{ path }}: </span>
        <span class="receipt-meta">[{{ (node as unknown[]).length }}]</span>
      </summary>
      <ReceiptTree
        v-for="(child, index) in (node as unknown[])"
        :key="index"
        :node="child"
        :depth="depth + 1"
        :path="String(index)"
      />
    </details>

    <details v-else-if="isObject" class="receipt-collapsible" :open="depth < 1">
      <summary class="receipt-summary">
        <span v-if="path !== ''" class="receipt-key">{{ path }}: </span>
        <span class="receipt-meta">{{ "{" + Object.keys(node as object).length + "}" }}</span>
      </summary>
      <ReceiptTree
        v-for="(value, key) in (node as Record<string, unknown>)"
        :key="key"
        :node="value"
        :depth="depth + 1"
        :path="String(key)"
      />
    </details>
  </div>
</template>

<script setup lang="ts">
// ReceiptTree — DUMB recursive collapsible JSON viewer. Props in only.
// Pure function of input · no state · no events.

import { computed } from "vue";
import type { ComputedRef } from "vue";

interface Props {
  node: unknown;
  depth: number;
  path: string;
}

const props = defineProps<Props>();

const isArray: ComputedRef<boolean> = computed<boolean>(() => Array.isArray(props.node));
const isObject: ComputedRef<boolean> = computed<boolean>(
  () => !isArray.value && typeof props.node === "object" && props.node !== null,
);
const isPrimitive: ComputedRef<boolean> = computed<boolean>(
  () => !isArray.value && !isObject.value,
);

const primKind: ComputedRef<string> = computed<string>(() => {
  if (props.node === null) return "null";
  if (typeof props.node === "boolean") return "bool";
  if (typeof props.node === "number") return "num";
  return "str";
});

function formatPrim(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return `"${value}"`;
  return String(value);
}
</script>

<style scoped>
.receipt-tree { font-size: 11px; line-height: 1.5; }
.receipt-key { color: var(--text-primary, #eee); font-weight: 600; }
.receipt-meta { color: var(--text-meta, #888); }
.receipt-collapsible > summary { cursor: pointer; list-style: revert; }
.receipt-prim--str .receipt-value { color: oklch(0.7 0.12 150); }
.receipt-prim--num .receipt-value { color: oklch(0.7 0.12 60); }
.receipt-prim--bool .receipt-value { color: var(--accent-red, #d33); }
.receipt-prim--null .receipt-value { color: var(--text-meta, #888); font-style: italic; }
</style>
