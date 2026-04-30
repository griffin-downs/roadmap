<script setup lang="ts">
// SearchBar — dumb component. Props in (modelValue, hitCounts, placeholder),
// events out (update:modelValue, submit, clear). All search intelligence
// lives in useViewerSearch composable.
//
// §Dumb-components: intelligence lives in composable, not in <script setup>.
// Zero fetch / async / setTimeout / imperative DOM here. Template binds
// to the modelValue ref only.

defineProps<{
  modelValue: string;
  hitCounts?: { nodes: number; trailEvents: number; lanes: number };
  placeholder?: string;
}>();

defineEmits<{
  (e: "update:modelValue", value: string): void;
  (e: "submit"): void;
  (e: "clear"): void;
}>();
</script>

<template>
  <form class="search-bar" role="search" @submit.prevent="$emit('submit')">
    <input
      class="search-bar-input"
      type="search"
      :value="modelValue"
      :placeholder="placeholder ?? 'search · status:done · lane:fleet · cite:§Spec'"
      aria-label="search nodes, trail events, and lanes"
      @input="
        $emit(
          'update:modelValue',
          ($event.target as HTMLInputElement).value,
        )
      "
    />
    <button
      v-if="modelValue.length > 0"
      type="button"
      class="search-bar-clear"
      aria-label="clear search"
      @click="$emit('clear')"
    >
      ×
    </button>
    <div v-if="hitCounts && modelValue.length > 0" class="search-bar-counts">
      <span class="hit hit--nodes">{{ hitCounts.nodes }} nodes</span>
      <span class="hit hit--trail">{{ hitCounts.trailEvents }} events</span>
      <span class="hit hit--lanes">{{ hitCounts.lanes }} lanes</span>
    </div>
  </form>
</template>

<style scoped>
.search-bar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border, #444);
  border-radius: 6px;
  background: var(--bg-elev, #1a1a1a);
}

.search-bar-input {
  flex: 1;
  min-width: 0;
  padding: 0.35rem 0.5rem;
  border: none;
  background: transparent;
  color: var(--fg, #e0e0e0);
  font-family: inherit;
  font-size: 0.9rem;
}

.search-bar-input:focus {
  outline: 1px solid var(--accent, #7aa);
  outline-offset: 1px;
}

.search-bar-clear {
  border: none;
  background: transparent;
  color: var(--fg-muted, #999);
  font-size: 1.1rem;
  line-height: 1;
  cursor: pointer;
  padding: 0 0.25rem;
}

.search-bar-clear:hover {
  color: var(--fg, #e0e0e0);
}

.search-bar-counts {
  display: flex;
  gap: 0.5rem;
  font-size: 0.75rem;
  color: var(--fg-muted, #999);
  white-space: nowrap;
}

.hit {
  padding: 0.1rem 0.4rem;
  border-radius: 3px;
  background: var(--bg-deep, #0d0d0d);
}

.hit--nodes {
  color: var(--accent, #7aa);
}
</style>
