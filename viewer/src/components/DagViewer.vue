<template>
  <div class="dag-viewer" :class="{ 'dag-viewer--tablet': tablet }">
    <div v-if="hasGraph && !printMode" class="dag-viewer__toolbar">
      <button
        type="button"
        class="dag-viewer__btn"
        :disabled="exporting"
        @click="onExportSvg"
      >Export SVG</button>
      <button
        type="button"
        class="dag-viewer__btn"
        :disabled="exporting"
        @click="onExportPng"
      >Export PNG</button>
    </div>
    <svg
      ref="svgRef"
      :viewBox="`0 0 ${layout.width} ${layout.height}`"
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      class="dag-svg"
      :class="{ 'dag-svg--print': printMode }"
      role="img"
      aria-label="Roadmap DAG"
    >
      <defs>
        <filter id="dag-frontier-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <!-- r2-hero: cloud-blob glow primitives · extended filter regions
             so blur is not clipped to element bbox (the rectangle artifact
             we are escaping). -->
        <filter id="glow-edge-soft"
                filterUnits="userSpaceOnUse"
                x="-5000" y="-5000" width="20000" height="20000">
          <feGaussianBlur stdDeviation="1.2" />
        </filter>
        <filter id="glow-soft" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
        <filter id="glow-medium" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="14" />
        </filter>
        <filter id="glow-heavy" x="-150%" y="-150%" width="400%" height="400%">
          <feGaussianBlur stdDeviation="28" />
        </filter>
        <filter id="glow-massive" x="-200%" y="-200%" width="500%" height="500%">
          <feGaussianBlur stdDeviation="48" />
        </filter>
        <radialGradient id="cloud-cream" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#F5E5D0" stop-opacity="0.95"/>
          <stop offset="40%" stop-color="#F5E5D0" stop-opacity="0.55"/>
          <stop offset="80%" stop-color="#F5E5D0" stop-opacity="0.15"/>
          <stop offset="100%" stop-color="#F5E5D0" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="cloud-pink" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#FF8FB5" stop-opacity="0.90"/>
          <stop offset="35%" stop-color="#FFC8DC" stop-opacity="0.55"/>
          <stop offset="80%" stop-color="#FFC8DC" stop-opacity="0.10"/>
          <stop offset="100%" stop-color="#FFC8DC" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="cloud-lavender" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#9D7EE6" stop-opacity="0.85"/>
          <stop offset="35%" stop-color="#C8B0F0" stop-opacity="0.55"/>
          <stop offset="80%" stop-color="#C8B0F0" stop-opacity="0.10"/>
          <stop offset="100%" stop-color="#C8B0F0" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="cloud-peach" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#FFB07A" stop-opacity="0.85"/>
          <stop offset="35%" stop-color="#FFD8C0" stop-opacity="0.55"/>
          <stop offset="80%" stop-color="#FFD8C0" stop-opacity="0.10"/>
          <stop offset="100%" stop-color="#FFD8C0" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="cloud-mint" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#5BC97A" stop-opacity="0.85"/>
          <stop offset="35%" stop-color="#C0E8C8" stop-opacity="0.50"/>
          <stop offset="80%" stop-color="#C0E8C8" stop-opacity="0.10"/>
          <stop offset="100%" stop-color="#C0E8C8" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="cloud-periwinkle" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#7BA0E0" stop-opacity="0.80"/>
          <stop offset="35%" stop-color="#A8C0E8" stop-opacity="0.50"/>
          <stop offset="80%" stop-color="#A8C0E8" stop-opacity="0.10"/>
          <stop offset="100%" stop-color="#A8C0E8" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="dag-rainbow-stroke" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#C68080" />
          <stop offset="20%" stop-color="#C69870" />
          <stop offset="40%" stop-color="#C6BC70" />
          <stop offset="60%" stop-color="#80C690" />
          <stop offset="80%" stop-color="#70AAC6" />
          <stop offset="100%" stop-color="#9080C6" />
        </linearGradient>
        <linearGradient id="dag-rainbow-text" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#C68080" />
          <stop offset="33%" stop-color="#C6BC70" />
          <stop offset="66%" stop-color="#80C690" />
          <stop offset="100%" stop-color="#9080C6" />
        </linearGradient>
        <linearGradient id="dag-card-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#1F1A38" stop-opacity="0.92" />
          <stop offset="1" stop-color="#1F1A38" stop-opacity="0.70" />
        </linearGradient>
        <linearGradient id="dag-card-fill-done" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#1A2D24" stop-opacity="0.92" />
          <stop offset="1" stop-color="#1A2D24" stop-opacity="0.70" />
        </linearGradient>
        <!-- r2-hero · holographic card overlays · stencil + holo + diffuse stack -->
        <linearGradient id="holo-cool" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stop-color="#FFC8DC" stop-opacity="0.6"/>
          <stop offset="33%"  stop-color="#9D7EE6" stop-opacity="0.45"/>
          <stop offset="66%"  stop-color="#A8C0E8" stop-opacity="0.45"/>
          <stop offset="100%" stop-color="#7AE695" stop-opacity="0.55"/>
        </linearGradient>
        <linearGradient id="holo-warm" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stop-color="#F5E5D0" stop-opacity="0.6"/>
          <stop offset="33%"  stop-color="#FFB07A" stop-opacity="0.45"/>
          <stop offset="66%"  stop-color="#FFC8DC" stop-opacity="0.45"/>
          <stop offset="100%" stop-color="#9D7EE6" stop-opacity="0.55"/>
        </linearGradient>
        <linearGradient id="holo-rainbow" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stop-color="#FFC8DC" stop-opacity="0.7"/>
          <stop offset="20%"  stop-color="#FFB07A" stop-opacity="0.55"/>
          <stop offset="40%"  stop-color="#F5E5D0" stop-opacity="0.55"/>
          <stop offset="60%"  stop-color="#7AE695" stop-opacity="0.55"/>
          <stop offset="80%"  stop-color="#A8C0E8" stop-opacity="0.55"/>
          <stop offset="100%" stop-color="#9D7EE6" stop-opacity="0.7"/>
        </linearGradient>
        <linearGradient id="diffuse-highlight" x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0%"   stop-color="#FFFFFF" stop-opacity="0.55"/>
          <stop offset="40%"  stop-color="#FFFFFF" stop-opacity="0.10"/>
          <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
        </linearGradient>
        <marker
          id="tip-arrow"
          viewBox="0 0 10 10"
          refX="5" refY="5"
          markerWidth="6" markerHeight="6"
          orient="auto"
        >
          <path d="M 0 0 L 10 5 L 0 10 Z" fill="#F5E5D0"/>
        </marker>
        <linearGradient id="edge-holo-gradient" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="2400" y2="0">
          <stop offset="0%"   stop-color="#FFC8DC" stop-opacity="0.95"/>
          <stop offset="33%"  stop-color="#FFD8C0" stop-opacity="0.85"/>
          <stop offset="66%"  stop-color="#A8C0E8" stop-opacity="0.85"/>
          <stop offset="100%" stop-color="#C8B0F0" stop-opacity="0.95"/>
        </linearGradient>
        <radialGradient id="milky-way" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stop-color="#C8B0F0" stop-opacity="0.55"/>
          <stop offset="55%"  stop-color="#A8C0E8" stop-opacity="0.4"/>
          <stop offset="85%"  stop-color="#FFC8DC" stop-opacity="0.2"/>
          <stop offset="100%" stop-color="#080418" stop-opacity="0"/>
        </radialGradient>
        <filter id="milky-blur"
                filterUnits="userSpaceOnUse"
                x="-5000" y="-5000" width="20000" height="20000">
          <feGaussianBlur stdDeviation="140" />
        </filter>
      </defs>

      <g ref="zoomGroupRef" class="zoom-pan-group">
        <ellipse
          v-if="printMode"
          class="milky-way-band"
          :cx="layout.width / 2"
          :cy="layout.height / 2"
          :rx="layout.width * 0.65"
          :ry="layout.height * 0.5"
          fill="url(#milky-way)"
          filter="url(#milky-blur)"
          aria-hidden="true"
        />
        <g class="edges">
          <template v-if="printMode">
            <g
              v-for="edge in layout.edges"
              :key="`${edge.from}->${edge.to}`"
              class="edge-pair"
            >
              <path
                :d="edge.dFromPath"
                class="edge edge--stencil"
                :class="edgeClass(edge)"
                fill="none"
                filter="url(#glow-edge-soft)"
              />
              <path
                :d="edge.dFromPath"
                class="edge edge--holo"
                :class="edgeClass(edge)"
                stroke="url(#edge-holo-gradient)"
                fill="none"
                filter="url(#glow-edge-soft)"
              />
            </g>
          </template>
          <template v-else>
            <path
              v-for="edge in layout.edges"
              :key="`${edge.from}->${edge.to}`"
              :d="edge.dFromPath"
              class="edge"
              :class="edgeClass(edge)"
              fill="none"
            />
          </template>
        </g>

        <g class="nodes">
          <!-- print mode · cloud-blob node treatment · stacked radial-gradient
               ellipses with extended-region SVG filters · NO bounding rect. -->
          <template v-if="printMode">
            <g
              v-for="node in layout.nodes"
              :key="node.id"
              class="node"
              :class="nodeClass(node)"
              @mouseenter="hoveredId = node.id"
              @mouseleave="clearHover"
              @click.stop="emitClick(node.id, $event)"
            >
              <!-- selected-only · gentler 3-stack halo · focal but not blinding -->
              <template v-if="selectedNodeId === node.id">
                <ellipse
                  :cx="node.x + node.width / 2"
                  :cy="node.y + rectHeight(node) / 2"
                  rx="220"
                  ry="170"
                  fill="#FFC8DC"
                  filter="url(#glow-massive)"
                  opacity="0.35"
                />
                <ellipse
                  :cx="node.x + node.width / 2"
                  :cy="node.y + rectHeight(node) / 2"
                  rx="160"
                  ry="120"
                  fill="#FFB07A"
                  filter="url(#glow-heavy)"
                  opacity="0.45"
                />
                <ellipse
                  :cx="node.x + node.width / 2"
                  :cy="node.y + rectHeight(node) / 2"
                  rx="100"
                  ry="80"
                  fill="#F5E5D0"
                  filter="url(#glow-medium)"
                  opacity="0.55"
                />
              </template>
              <!-- ghost halo · cloud-y diffuse aura · scaled per-node -->
              <ellipse
                :cx="node.x + node.width / 2"
                :cy="node.y + rectHeight(node) / 2"
                :rx="node.width * 0.9"
                :ry="rectHeight(node) * 1.1"
                :fill="`url(#${cloudFor(node)})`"
                opacity="0.55"
                filter="url(#glow-heavy)"
              />
              <ellipse
                :cx="node.x + node.width / 2"
                :cy="node.y + rectHeight(node) / 2"
                :rx="node.width * 0.42"
                :ry="rectHeight(node) * 0.5"
                :fill="`url(#${cloudFor(node)})`"
                opacity="0.95"
                filter="url(#glow-medium)"
              />
              <!-- selected · hard offset card-on-table shadow + glow ring -->
              <template v-if="selectedNodeId === node.id">
                <rect
                  :x="node.x + 8"
                  :y="node.y + 8"
                  :width="node.width"
                  :height="rectHeight(node)"
                  rx="12" ry="12"
                  fill="#000000"
                  opacity="0.85"
                />
                <rect
                  :x="node.x - 4"
                  :y="node.y - 4"
                  :width="node.width + 8"
                  :height="rectHeight(node) + 8"
                  rx="14" ry="14"
                  fill="none"
                  stroke="#F5E5D0"
                  stroke-width="3"
                  opacity="0.35"
                  filter="url(#glow-medium)"
                />
              </template>
              <!-- card drop shadow · solid offset · cheap (no filter) -->
              <rect
                :x="node.x + 6"
                :y="node.y + 6"
                :width="node.width"
                :height="rectHeight(node)"
                rx="10" ry="10"
                fill="#000000"
                opacity="0.45"
              />
              <!-- STENCIL · solid opaque base · WCAG anchor -->
              <rect
                :x="node.x"
                :y="node.y"
                :width="node.width"
                :height="rectHeight(node)"
                rx="10" ry="10"
                fill="#1A0E2A"
                :fill-opacity="selectedNodeId === node.id ? 0.96 : 0.92"
                class="card-stencil"
              />
              <!-- HOLOGRAPHIC · rainbow gradient overlay · screen blend -->
              <rect
                :x="node.x"
                :y="node.y"
                :width="node.width"
                :height="rectHeight(node)"
                rx="10" ry="10"
                :fill="`url(#holo-${cardHoloId(node)})`"
                fill-opacity="0.32"
                style="mix-blend-mode: screen"
                class="card-holo"
              />
              <!-- DIFFUSE HIGHLIGHT · top-left catch-light -->
              <rect
                :x="node.x"
                :y="node.y"
                :width="node.width"
                :height="rectHeight(node) * 0.42"
                rx="10" ry="10"
                fill="url(#diffuse-highlight)"
                fill-opacity="0.45"
                class="card-diffuse"
              />
              <!-- BORDER · cream/foil rim · contrast cue -->
              <rect
                :x="node.x"
                :y="node.y"
                :width="node.width"
                :height="rectHeight(node)"
                rx="10" ry="10"
                fill="none"
                :stroke="cardStrokeFor(node)"
                :stroke-width="selectedNodeId === node.id ? 4 : 2.5"
                class="card-border"
              />
              <text
                v-if="isMilestone(node.id)"
                :x="node.x + node.width / 2"
                :y="node.y + rectHeight(node) / 2 - (wrapId(node.id).length - 1) * 17 + 10"
                class="node-id"
                text-anchor="middle"
              >
                <tspan
                  v-for="(line, i) in wrapId(node.id)"
                  :key="i"
                  :x="node.x + node.width / 2"
                  :dy="i === 0 ? 0 : 34"
                  :textLength="line.length > 12 ? (node.width - 32) : undefined"
                  lengthAdjust="spacingAndGlyphs"
                  class="node-id-line"
                >{{ line }}</tspan>
              </text>
              <!-- frontier mark · peach indicator dot in upper-right corner -->
              <circle
                v-if="node.status === 'in-progress'"
                :cx="node.x + node.width - 14"
                :cy="node.y + 14"
                r="6"
                fill="#FFB07A"
                filter="url(#glow-soft)"
                class="frontier-mark"
              />
            </g>
          </template>
          <template v-else>
            <g
              v-for="node in layout.nodes"
              :key="node.id"
              class="node"
              :class="nodeClass(node)"
              :transform="`translate(${node.x}, ${node.y})`"
              :filter="node.isFrontier ? 'url(#dag-frontier-glow)' : undefined"
              @mouseenter="hoveredId = node.id"
              @mouseleave="clearHover"
              @click.stop="emitClick(node.id, $event)"
            >
              <rect
                :width="node.width"
                :height="rectHeight(node)"
                rx="0"
                ry="0"
                class="node-rect"
              />
              <rect
                v-if="node.status === 'in-progress'"
                :width="node.width"
                :height="rectHeight(node)"
                rx="0"
                ry="0"
                class="node-rainbow-rect"
              />
              <text :x="8" :y="18" class="node-id">
                <tspan
                  v-for="(line, i) in wrapSlug(node.id)"
                  :key="i"
                  :x="8"
                  :dy="i === 0 ? 0 : 16"
                  class="node-id-line"
                >{{ line }}</tspan>
              </text>
              <text
                v-if="selectedNodeId === node.id"
                :x="8"
                :y="18"
                class="node-id-shimmer"
              >
                <tspan
                  v-for="(line, i) in wrapSlug(node.id)"
                  :key="i"
                  :x="8"
                  :dy="i === 0 ? 0 : 16"
                >{{ line }}</tspan>
              </text>
              <text
                v-if="!tablet"
                :x="8"
                :y="rectHeight(node) - 8"
                class="node-status"
              >{{ node.status }}</text>
            </g>
          </template>
        </g>
      </g>
    </svg>
    <div v-if="!printMode" class="dag-viewer__zoom" role="group" aria-label="zoom controls">
      <div class="dag-viewer__zoom-cluster">
        <button
          type="button"
          class="dag-viewer__zoom-btn"
          aria-label="zoom in"
          @click="zoomIn"
        >+</button>
        <button
          type="button"
          class="dag-viewer__zoom-btn"
          aria-label="zoom out"
          @click="zoomOut"
        >&minus;</button>
      </div>
      <div class="dag-viewer__zoom-cluster">
        <button
          type="button"
          class="dag-viewer__zoom-btn"
          aria-label="fit to canvas"
          @click="fitToCanvas()"
        >
          <!-- four arrows pointing inward — "fit to bounds" -->
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 3 L9 9 M3 3 H7 M3 3 V7"/>
            <path d="M21 3 L15 9 M21 3 H17 M21 3 V7"/>
            <path d="M3 21 L9 15 M3 21 H7 M3 21 V17"/>
            <path d="M21 21 L15 15 M21 21 H17 M21 21 V17"/>
          </svg>
        </button>
        <button
          type="button"
          class="dag-viewer__zoom-btn"
          aria-label="center on active batch"
          @click="centerOnBatch()"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="currentColor">
            <path d="M12 3 L20 21 L12 17 L4 21 Z"/>
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// DagViewer — DUMB component (§Dumb-components). Props in, events out.
// No fetch / no state derivation / no fleet-specific assumptions. Layout
// is computed upstream by useDagLayout(payload, options).
//
// r2-hero: LOD tiers (far/mid chip-mode + cluster-hulls) ripped out — one
// render path. Print mode is a CSS-only overlay driven by ?print=1.

import { computed, nextTick, onMounted, ref, watch } from "vue";
import type { ComputedRef, Ref } from "vue";
import * as d3 from "d3-selection";
import { zoom, zoomIdentity, type D3ZoomEvent, type ZoomBehavior } from "d3-zoom";
import type { DagLayout, LaidOutEdge, LaidOutNode } from "../composables/useDagLayout";
import { useGraphExport } from "../composables/useGraphExport";

interface Props {
  layout: DagLayout;
  tablet?: boolean;
  exportName?: string;
  selectedNodeId?: string;
  printMode?: boolean;
  milestones?: string[];
}

const props = withDefaults(defineProps<Props>(), {
  tablet: false,
  exportName: "roadmap-dag",
  selectedNodeId: "",
  printMode: false,
  milestones: () => [],
});
const milestoneSet = computed<Set<string>>(() => new Set(props.milestones));
function isMilestone(id: string): boolean {
  // sentinel "none" → all tokens, no labels
  if (milestoneSet.value.has("__none__")) return false;
  return milestoneSet.value.size === 0 || milestoneSet.value.has(id);
}
const emit = defineEmits<{
  (event: "node-selected", nodeId: string, anchorRect: DOMRect): void;
}>();

const hoveredId: Ref<string | null> = ref<string | null>(null);
const svgRef: Ref<SVGSVGElement | null> = ref<SVGSVGElement | null>(null);
const zoomGroupRef: Ref<SVGGElement | null> = ref<SVGGElement | null>(null);
const transform: Ref<{ k: number; x: number; y: number }> = ref({ k: 1, x: 0, y: 0 });
const { exporting, exportSvg, exportPng } = useGraphExport();
let zoomBehavior: ZoomBehavior<SVGSVGElement, unknown> | null = null;
// Only the FIRST URL-pin centers the camera. Subsequent clicks change the
// selection but must NOT snap the viewport — user complaint from r2-hero.
let initialPinDone = false;

function centerSelected(): void {
  if (!props.selectedNodeId) return;
  if (!svgRef.value || !zoomBehavior) return;
  const target = props.layout.nodes.find((n) => n.id === props.selectedNodeId);
  if (!target) return;
  // Work entirely in SVG user-coords. The svg's viewBox is "0 0 layoutW layoutH"
  // and that user-space maps 1:1 onto the visible SVG element. The d3-zoom
  // transform's translate() is in user-coords too (post-viewBox-mapping).
  const svg = svgRef.value as SVGSVGElement;
  const rect = svg.getBoundingClientRect();
  const layoutW = props.layout.width;
  const layoutH = props.layout.height;
  // viewBox preserveAspectRatio defaults to xMidYMid meet — letterbox.
  // Compute the user-units-per-screen-px ratio (min of x and y scales).
  const sx = rect.width > 0 ? layoutW / rect.width : 1;
  const sy = rect.height > 0 ? layoutH / rect.height : 1;
  const userPerPx = Math.max(sx, sy); // meet → contain · larger ratio wins
  const panelOccUserX = props.printMode ? 520 * userPerPx : 0;
  const visibleUserW = Math.max(layoutW - panelOccUserX, 1);
  const visibleCenterUserX = visibleUserW / 2;
  const visibleCenterUserY = layoutH / 2;
  const cx = target.x + target.width / 2;
  const cy = target.y + rectHeight(target) / 2;
  const k = transform.value.k || 1;
  const tx = visibleCenterUserX - cx * k;
  const ty = visibleCenterUserY - cy * k;
  const sel = d3.select(svg);
  sel.call(zoomBehavior.transform, zoomIdentity.translate(tx, ty).scale(k));
}

// Auto-fit the full DAG bbox to the visible canvas at mount, so users on
// small windows don't have to zoom out manually. Mutually exclusive with
// the URL-pin path (centerSelected) — caller decides which to invoke.
// maxScale clamps zoom-in for fit/center operations. fit-to-canvas uses
// FIT_MAX_SCALE (1.0 — never zoom *past* native, only in to fit). center-on-batch
// passes a smaller maxScale so single-node frontiers don't zoom past readability.
const FIT_MAX_SCALE = 1.0;
const CENTER_MAX_SCALE = 1.8;

function fitToCanvas(margin: number = 24, subset?: LaidOutNode[], maxScale: number = FIT_MAX_SCALE): void {
  if (!svgRef.value || !zoomBehavior) return;
  const svg = svgRef.value as SVGSVGElement;
  // Use the parent container's box as the true visible canvas — the svg's
  // own getBoundingClientRect can be the layout's nominal width/height when
  // CSS doesn't constrain it, defeating fit.
  const container = (svg.parentElement as HTMLElement | null) ?? svg;
  const rect = container.getBoundingClientRect();
  const nominalW = props.layout.width;
  const nominalH = props.layout.height;
  if (rect.width <= 0 || rect.height <= 0 || nominalW <= 0 || nominalH <= 0) return;
  // Compute the layout's TRUE bbox from rendered node positions — the
  // nominal layout.width/height can under- or over-state actual extent.
  const source = subset && subset.length > 0 ? subset : props.layout.nodes;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of source) {
    const h = rectHeight(n);
    if (n.x < minX) minX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.x + n.width > maxX) maxX = n.x + n.width;
    if (n.y + h > maxY) maxY = n.y + h;
  }
  if (!isFinite(minX) || !isFinite(minY)) {
    minX = 0; minY = 0; maxX = nominalW; maxY = nominalH;
  }
  const bboxW = Math.max(maxX - minX, 1);
  const bboxH = Math.max(maxY - minY, 1);
  // viewBox is "0 0 nominalW nominalH" with preserveAspectRatio meet, so
  // user-units-per-screen-px is the meet ratio against nominal dims.
  const userPerPx = Math.max(nominalW / rect.width, nominalH / rect.height);
  const marginUser = margin * userPerPx;
  // Scale that fits the TRUE bbox (with margin) into the viewBox.
  // SVG is now width/height=100% with preserveAspectRatio meet, so the
  // viewBox IS the visible region (with letterboxing on the off-axis).
  // Clamp to maxScale to prevent over-zoom on tiny subsets (centerOnBatch).
  const k = Math.min(
    (nominalW - marginUser * 2) / bboxW,
    (nominalH - marginUser * 2) / bboxH,
    maxScale,
  );
  // Translate so the bbox center lands on the nominal viewBox center.
  const cxBbox = (minX + maxX) / 2;
  const cyBbox = (minY + maxY) / 2;
  const tx = nominalW / 2 - cxBbox * k;
  const ty = nominalH / 2 - cyBbox * k;
  d3.select(svg).call(zoomBehavior.transform, zoomIdentity.translate(tx, ty).scale(k));
}

// Center camera on the current frontier (orient `position[]` equivalent).
// Frontier is encoded on the layout nodes via isFrontier; fall back to
// status-based ready/in-progress if no isFrontier flags are present.
function centerOnBatch(margin: number = 64): void {
  const flagged = props.layout.nodes.filter((n) => n.isFrontier);
  const source = flagged.length > 0
    ? flagged
    : props.layout.nodes.filter((n) => n.status === "ready" || n.status === "in-progress");
  if (source.length === 0) {
    fitToCanvas();
    return;
  }
  fitToCanvas(margin, source, CENTER_MAX_SCALE);
}

onMounted(() => {
  if (!svgRef.value || !zoomGroupRef.value) return;
  const sel = d3.select(svgRef.value as SVGSVGElement);
  const z = zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.2, 4])
    // §click-passthrough · let mousedown on a .node element bypass d3-zoom so
    // pan-drag does not capture the pointer and swallow the subsequent click.
    // r4-fix · disable wheel-zoom entirely so the page scrolls naturally;
    // zoom is driven only by the +/− buttons. Pan via background drag still works.
    .filter((event: Event) => {
      if (event.type === "wheel") return false;
      const t = event.target as Element | null;
      if (t?.closest?.(".node")) return false;
      // Default d3-zoom filter: ignore secondary buttons + ctrl-key wheel.
      const me = event as MouseEvent;
      return (!me.ctrlKey || event.type === "wheel") && (me.button === 0 || me.button === undefined);
    })
    .on("zoom", (e: D3ZoomEvent<SVGSVGElement, unknown>) => {
      const t = e.transform;
      transform.value = { k: t.k, x: t.x, y: t.y };
      zoomGroupRef.value!.setAttribute("transform", `translate(${t.x},${t.y}) scale(${t.k})`);
    });
  sel.call(z);
  zoomBehavior = z;
  // Initial pin · seed identity then center after layout settles
  sel.call(z.transform, zoomIdentity);
  nextTick(() => {
    if (props.selectedNodeId) {
      centerSelected();
      initialPinDone = true;
      setTimeout(() => centerSelected(), 50);
      setTimeout(() => centerSelected(), 200);
    } else {
      // No URL pin · auto-fit the DAG bbox to the canvas (mutually exclusive
      // with the pin path above). Mark pin done unconditionally so the
      // selectedNodeId watch below does NOT teleport the camera on first click.
      initialPinDone = true;
      fitToCanvas();
    }
  });
});

// Re-center only if the layout hasn't yet seeded a viewport for the URL-pin.
// Once initialPinDone is true, clicks change selection without snapping camera.
watch(
  () => [props.selectedNodeId, props.printMode, props.layout.nodes.length] as const,
  () => {
    if (initialPinDone) return;
    nextTick(() => {
      if (props.selectedNodeId) {
        centerSelected();
        initialPinDone = true;
      }
    });
  },
);

defineExpose({ transform, centerSelected });
// Expose globally for capture-hero.mjs · puppeteer can re-center after zoom
if (typeof window !== "undefined") {
  (window as unknown as { __recenterDag?: () => void }).__recenterDag = centerSelected;
}
const hasGraph: ComputedRef<boolean> = computed<boolean>(() => props.layout.nodes.length > 0);

function zoomIn(): void {
  if (!svgRef.value || !zoomBehavior) return;
  const sel = d3.select(svgRef.value as SVGSVGElement);
  zoomBehavior.scaleBy(sel.transition().duration(200), 1.4);
}
function zoomOut(): void {
  if (!svgRef.value || !zoomBehavior) return;
  const sel = d3.select(svgRef.value as SVGSVGElement);
  zoomBehavior.scaleBy(sel.transition().duration(200), 1 / 1.4);
}

async function onExportSvg(): Promise<void> {
  await exportSvg(svgRef.value, `${props.exportName}-hierarchical`);
}
async function onExportPng(): Promise<void> {
  await exportPng(svgRef.value, `${props.exportName}-hierarchical`);
}

const directDeps: ComputedRef<Set<string>> = computed<Set<string>>(() => {
  const current = hoveredId.value;
  if (current === null) return new Set<string>();
  const node = props.layout.nodes.find((entry) => entry.id === current);
  if (node === undefined) return new Set<string>();
  return new Set<string>(node.deps);
});

const directDependents: ComputedRef<Set<string>> = computed<Set<string>>(() => {
  const current = hoveredId.value;
  if (current === null) return new Set<string>();
  return new Set<string>(
    props.layout.nodes.filter((entry) => entry.deps.includes(current)).map((entry) => entry.id),
  );
});

function nodeClass(node: LaidOutNode): Record<string, boolean> {
  const id = node.id;
  return {
    [`node--${node.status}`]: true,
    "node--frontier": node.isFrontier,
    "node--selected": props.selectedNodeId === id,
    "node--hovered": hoveredId.value === id,
    "node--related":
      hoveredId.value !== null && (directDeps.value.has(id) || directDependents.value.has(id)),
    "node--dim":
      hoveredId.value !== null &&
      hoveredId.value !== id &&
      !directDeps.value.has(id) &&
      !directDependents.value.has(id),
  };
}

function edgeClass(edge: LaidOutEdge): Record<string, boolean> {
  const hovered = hoveredId.value;
  const touchesHover = hovered !== null && (edge.from === hovered || edge.to === hovered);
  const sel = props.selectedNodeId;
  const touchesSelected = !!sel && (edge.from === sel || edge.to === sel);
  return {
    "edge--active": touchesHover,
    "edge--dim": hovered !== null && !touchesHover,
    "edge--to-selected": touchesSelected,
  };
}

function cardStrokeFor(node: LaidOutNode): string {
  if (props.selectedNodeId === node.id) return "#F5E5D0";
  if (node.status === "in-progress") return "#FFB07A";
  if (node.status === "blocked") return "#9D7EE6";
  if (node.status === "ready") return "#FF8FB5";
  if (node.status === "done") return "#5BC97A";
  return "#F5E5D0";
}

function cardHoloId(node: LaidOutNode): string {
  if (props.selectedNodeId === node.id) return "rainbow";
  if (node.status === "in-progress" || node.status === "ready") return "warm";
  return "cool";
}

function wrapSlug(id: string, maxLineChars: number = 14): string[] {
  const parts = id.split("-");
  const lines: string[] = [];
  let cur = "";
  for (const p of parts) {
    const next = cur ? `${cur}-${p}` : p;
    if (next.length > maxLineChars && cur) {
      lines.push(cur);
      cur = p;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines.length > 0 ? lines : [id];
}

/**
 * Derive a short descriptive label from a node id.
 * Strips common cluster-prefix tokens and round-refs, keeps meaningful tail.
 */
const ACRONYMS = new Set(["qr", "jq", "url", "api", "json", "svg", "png", "pdf"]);

function shortLabel(id: string): string {
  if (id === "_term") return "Term";
  if (id === "init-r2") return "Init r2";
  if (id === "init-r2-hero") return "Init r2 hero";
  const stripped = id
    .replace(/^(c|d|e|i|p|v|s|pap|pst|pre|post|term)-/, "")
    .replace(/^A-/, "")
    .replace(/-r\d+(?=-|$)/g, "")
    .replace(/^r\d+(?=-|$)/, "");
  const parts = stripped.split("-").filter(Boolean);
  if (parts.length === 0) return id;
  let kept = parts.slice(0, 3);
  while (kept.join(" ").length > 22 && kept.length > 1) kept.pop();
  return kept.map((p, i) => {
    if (ACRONYMS.has(p.toLowerCase())) return p.toUpperCase();
    return i === 0 ? p[0].toUpperCase() + p.slice(1) : p;
  }).join(" ");
}

function wrapId(id: string, maxLineChars: number = 10): string[] {
  // hyphens become spaces so labels read as natural words; wrap on word breaks
  const words = id.split("-");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > maxLineChars && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines.length > 0 ? lines : [id];
}

function wrapShortLabel(id: string, maxLineChars: number = 10): string[] {
  const label = shortLabel(id);
  const words = label.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > maxLineChars && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines.length > 0 ? lines : [label];
}

function rectHeight(node: LaidOutNode): number {
  if (props.printMode) {
    const lines = wrapId(node.id).length;
    const lineHeight = 28;
    const padding = 32;
    return Math.max(node.height, lines * lineHeight + padding);
  }
  const lines = wrapSlug(node.id).length;
  const dynamic = lines * 26 + 36;
  return Math.max(node.height, dynamic);
}

function cloudFor(node: LaidOutNode): string {
  // Status takes precedence for live signal · in-progress / blocked / ready
  // are visually distinct regardless of cluster.
  if (node.status === "in-progress") return "cloud-peach";
  if (node.status === "blocked") return "cloud-periwinkle";
  if (node.status === "ready") return "cloud-pink";
  // For 'done' (most common in this DAG), tint by round/cluster so the
  // graph is multicolor instead of monochromatic mint.
  const m = node.id.match(/(?:^|-)r(\d+)(?:-|$)/);
  if (m) {
    const round = parseInt(m[1], 10);
    if (round === 1) return "cloud-periwinkle";
    if (round === 41) return "cloud-lavender";
    if (round === 2) return "cloud-mint";
  }
  if (node.id.startsWith("pap-")) return "cloud-pink";
  if (node.id.startsWith("pst-")) return "cloud-peach";
  if (node.id.startsWith("c-")) return "cloud-mint";
  if (node.id.startsWith("p-")) return "cloud-lavender";
  return "cloud-cream";
}

function clearHover(): void {
  hoveredId.value = null;
}

function emitClick(nodeId: string, ev: MouseEvent): void {
  const target = ev.currentTarget as SVGGraphicsElement | null;
  const rect = target ? target.getBoundingClientRect() : new DOMRect(ev.clientX, ev.clientY, 0, 0);
  emit("node-selected", nodeId, rect);
}
</script>

<style scoped>
.dag-viewer {
  position: relative;
  overflow: auto;
  width: 100%;
  height: 100%;
  background: var(--chrome-05, #0a0a0a);
  border: 1px solid var(--chrome-25, #333);
}
.dag-viewer__toolbar {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 4px;
  z-index: 2;
}
.dag-viewer__btn {
  padding: 4px 8px;
  font-size: 11px;
  font-family: var(--font-mono, ui-monospace, monospace);
  background: var(--chrome-10, #151515);
  color: var(--text-primary, #eee);
  border: 1px solid var(--chrome-25, #333);
  cursor: pointer;
}
.dag-viewer__btn:hover { border-color: var(--accent-red, #d33); }
.dag-viewer__btn:disabled { opacity: 0.5; cursor: wait; }
.dag-viewer__zoom {
  position: absolute;
  bottom: 12px;
  right: 12px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  z-index: 2;
}
.dag-viewer__zoom-cluster {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.dag-viewer__zoom-btn {
  width: 28px;
  height: 28px;
  font-size: 14px;
  font-family: var(--font-mono, ui-monospace, monospace);
  background: var(--chrome-10, #151515);
  color: var(--text-primary, #eee);
  border: 1px solid var(--chrome-25, #333);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.dag-viewer__zoom-btn:hover { border-color: var(--accent-red, #d33); }
.dag-viewer__zoom-btn:focus-visible { outline: 2px solid var(--accent-red, #d33); outline-offset: 1px; }
.dag-svg { display: block; font-family: var(--font-mono, ui-monospace, monospace); }
.edge {
  stroke: var(--chrome-30, #444);
  stroke-width: 1.5;
  transition: stroke 120ms, opacity 120ms;
}
.edge--active { stroke: var(--accent-red, #d33); stroke-width: 2.25; }
.edge--dim { opacity: 0.25; }
.node { cursor: pointer; transition: opacity 120ms; }
.node-rect {
  stroke: var(--chrome-30, #444);
  stroke-width: 1;
  fill: var(--chrome-10, #151515);
  transition: fill 120ms, stroke 120ms;
}
.node--done .node-rect {
  fill: var(--status-nominal, oklch(0.28 0.09 150));
  stroke: oklch(0.55 0.14 150);
}
.node--in-progress .node-rect {
  fill: var(--status-active, oklch(0.32 0.12 60));
  stroke: var(--accent-red, #d33);
  stroke-width: 2;
}
.node--blocked .node-rect { fill: var(--chrome-10, #151515); stroke: var(--chrome-25, #333); }
.node--plan-mode .node-rect {
  fill: transparent;
  stroke: var(--accent-red, #d33);
  stroke-dasharray: 4 3;
}
.node--frontier .node-rect { stroke-width: 2.5; }
.node--hovered .node-rect { stroke: var(--accent-red, #d33); stroke-width: 2.5; }
.node--related .node-rect { stroke: var(--accent-red, #d33); }
.node--dim { opacity: 0.3; }
.node-id {
  fill: var(--text-primary, #eee);
  font-size: 11px;
  font-weight: 600;
  pointer-events: none;
}
.node-status {
  fill: var(--text-meta, #888);
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  pointer-events: none;
}
.dag-viewer--tablet .node-id { font-size: 10px; }
@media (prefers-reduced-motion: reduce) {
  .edge, .node, .node-rect { transition: none; }
}
</style>
