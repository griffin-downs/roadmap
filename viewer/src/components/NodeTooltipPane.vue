<template>
  <Transition name="dag-tooltip">
    <div
      v-if="nodeData"
      ref="paneRef"
      class="dag-tooltip dag-foil-halo"
      :class="{
        'dag-tooltip--expanded': expanded,
      }"
      :style="paneStyle"
      role="dialog"
      :aria-label="`Node ${nodeData.id}`"
      @click.stop
    >
      <header class="dag-tooltip__head">
        <span class="dag-tooltip__status" :data-status="nodeData.status">
          {{ nodeData.status }}
        </span>
        <span class="dag-tooltip__id">{{ nodeData.id }}</span>
        <button type="button" class="dag-tooltip__close" aria-label="close" @click="emit('close')">
          ×
        </button>
      </header>

      <p v-if="firstLine" class="dag-tooltip__desc">{{ firstLine }}</p>

      <section v-if="!expanded && hasProduces" class="dag-tooltip__section">
        <div class="dag-tooltip__label">produces</div>
        <div v-for="p in nodeData.produces" :key="p" class="dag-tooltip__row">{{ p }}</div>
      </section>

      <section v-if="!expanded && hasValidate" class="dag-tooltip__section">
        <div class="dag-tooltip__label">validate</div>
        <div v-for="(v, i) in nodeData.validate" :key="i" class="dag-tooltip__row">
          {{ v.type }}<span v-if="v.command"> · {{ v.command }}</span>
        </div>
      </section>

      <section v-if="expanded" class="dag-tooltip__expand">
        <FieldExpander
          :data="nodeData"
          :path="`$.nodes[${JSON.stringify(nodeData.id)}]`"
          :search="''"
        />
      </section>

      <footer class="dag-tooltip__actions">
        <button type="button" class="dag-tooltip__btn" @click="emit('expand')">
          {{ expanded ? 'collapse' : 'expand' }}
        </button>
        <button type="button" class="dag-tooltip__btn" @click="emit('pin-to-side')">
          pin to side
        </button>
      </footer>
    </div>
  </Transition>
</template>

<script setup lang="ts">
// NodeTooltipPane — DUMB click-adjacent inspector. §Dumb-components.
//   props: nodeData, anchorRect, expanded
//   emits: close, expand, pin-to-side
// No fetch / no timer / no derivation beyond pure computed. Position is
// computed once per nodeData/anchorRect change in the orchestrator and
// passed in via positionStyle for compositor-friendly transform/opacity.

import { computed, ref, watch, nextTick } from "vue";
import type { ComputedRef, Ref } from "vue";
import FieldExpander from "./FieldExpander.vue";
import { computeTooltipPosition, type AnchorRect } from "../composables/useTooltipPosition";

// Loose shape — accepts any node-like record with at least id.
type NodeData = Record<string, unknown> & {
  id: string;
  status?: string;
  desc?: string;
  produces?: string[];
  validate?: Array<{ type: string; command?: string; statement?: string }>;
};

interface Props {
  nodeData: NodeData | null;
  anchorRect: AnchorRect | null;
  expanded?: boolean;
}

const props = withDefaults(defineProps<Props>(), { expanded: false });
const emit = defineEmits<{
  (e: "close"): void;
  (e: "expand"): void;
  (e: "pin-to-side"): void;
}>();

const paneRef: Ref<HTMLElement | null> = ref<HTMLElement | null>(null);
const measuredSize: Ref<{ width: number; height: number }> = ref({ width: 320, height: 200 });

const firstLine: ComputedRef<string> = computed(() => {
  const d = props.nodeData?.desc ?? "";
  const newline = d.indexOf("\n");
  return newline === -1 ? d : d.slice(0, newline);
});

const hasProduces: ComputedRef<boolean> = computed(() =>
  Array.isArray(props.nodeData?.produces) && (props.nodeData?.produces?.length ?? 0) > 0,
);
const hasValidate: ComputedRef<boolean> = computed(() =>
  Array.isArray(props.nodeData?.validate) && (props.nodeData?.validate?.length ?? 0) > 0,
);
const paneStyle: ComputedRef<Record<string, string>> = computed<Record<string, string>>(() => {
  const a = props.anchorRect;
  if (a === null) return { display: "none" } as Record<string, string>;
  const pos = computeTooltipPosition({
    anchorRect: a,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    paneSize: measuredSize.value,
  });
  return {
    top: `${pos.top}px`,
    left: `${pos.left}px`,
    "--tooltip-placement": pos.placement,
  } as Record<string, string>;
});

watch(
  () => [props.nodeData, props.anchorRect, props.expanded],
  async () => {
    await nextTick();
    const el = paneRef.value;
    if (el) {
      const r = el.getBoundingClientRect();
      measuredSize.value = { width: r.width, height: r.height };
    }
  },
);
</script>

<style scoped>
.dag-tooltip {
  position: fixed;
  z-index: 1000;
  min-width: 280px;
  max-width: 420px;
  max-height: 70vh;
  overflow: auto;
  padding: 12px;
  background: var(--card-fill, rgba(28, 31, 42, 0.95));
  border: 1.5px solid var(--foil, #D7A432);
  box-shadow: 0 0 16px var(--foil-50, rgba(215, 164, 50, 0.5)),
              6px 6px 0 var(--shadow-soft, rgba(0, 0, 0, 0.6));
  font-family: var(--font-mono, 'Fira Code', ui-monospace, monospace);
  color: var(--ink-white, #F5F2E8);
  border-radius: 0;
  will-change: transform, opacity;
}
.dag-tooltip--expanded { min-width: 380px; max-width: 560px; }

.dag-tooltip__head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.dag-tooltip__status {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 2px 6px;
  border: 1px solid var(--foil-30, rgba(215, 164, 50, 0.3));
  color: var(--foil, #D7A432);
}
.dag-tooltip__status[data-status="in-progress"],
.dag-tooltip__status[data-status="frontier"] {
  color: var(--foil, #D7A432);
  border-color: var(--foil, #D7A432);
}
.dag-tooltip__status[data-status="done"],
.dag-tooltip__status[data-status="completed"] {
  color: oklch(0.70 0.12 145);
  border-color: oklch(0.70 0.12 145 / 0.4);
}
.dag-tooltip__id {
  flex: 1;
  font-weight: 500;
  font-size: 12px;
  color: var(--foil, #D7A432);
  letter-spacing: 0.5px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dag-tooltip__close {
  background: none;
  border: 1px solid var(--foil-30, rgba(215, 164, 50, 0.3));
  color: var(--ink-dim, #B8B0A0);
  font: inherit;
  font-size: 14px;
  line-height: 1;
  padding: 0 6px;
  cursor: pointer;
}
.dag-tooltip__close:hover { color: var(--foil, #D7A432); border-color: var(--foil, #D7A432); }

.dag-tooltip__desc {
  margin: 0 0 10px 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--ink-white, #F5F2E8);
}
.dag-tooltip__section { margin-bottom: 8px; }
.dag-tooltip__label {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--ink-dim, #B8B0A0);
  margin-bottom: 2px;
}
.dag-tooltip__row {
  font-size: 10px;
  color: var(--ink-white, #F5F2E8);
  word-break: break-all;
  padding: 1px 0;
}
.dag-tooltip__expand {
  max-height: 50vh;
  overflow: auto;
  padding-top: 4px;
  border-top: 1px solid var(--foil-30, rgba(215, 164, 50, 0.3));
}
.dag-tooltip__actions {
  display: flex;
  gap: 6px;
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--foil-30, rgba(215, 164, 50, 0.3));
}
.dag-tooltip__btn {
  flex: 1;
  padding: 4px 8px;
  background: transparent;
  border: 1px solid var(--foil, #D7A432);
  color: var(--foil, #D7A432);
  font-family: inherit;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  cursor: pointer;
  transition: background 120ms;
}
.dag-tooltip__btn:hover {
  background: var(--foil-30, rgba(215, 164, 50, 0.3));
  color: var(--ink-white, #F5F2E8);
}

/* Open animation — 120ms fade + scale-in. Compositor-friendly. */
.dag-tooltip-enter-active { transition: transform 120ms ease-out, opacity 120ms ease-out; }
.dag-tooltip-leave-active { transition: transform 120ms ease-in, opacity 120ms ease-in; }
.dag-tooltip-enter-from,
.dag-tooltip-leave-to { transform: scale(0.95); opacity: 0; }

@media (prefers-reduced-motion: reduce) {
  .dag-tooltip-enter-active, .dag-tooltip-leave-active { transition: opacity 80ms; }
  .dag-tooltip-enter-from, .dag-tooltip-leave-to { transform: none; }
}
</style>
