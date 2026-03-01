export const expand = (parent: string) => ({
  parent,
  description: "Expand CLI-quality metaflows into fine-grained batches",
  batches: [
    {
      name: "Phase-1-Design",
      nodes: [
        "design-hints",
        "design-errors", 
        "design-parallel-help"
      ]
    },
    {
      name: "Phase-1-Implement",
      deps: ["Phase-1-Design"],
      nodes: [
        "impl-hints",
        "impl-errors",
        "impl-help"
      ]
    },
    {
      name: "Phase-1-Test",
      deps: ["Phase-1-Implement"],
      nodes: [
        "test-hints",
        "test-errors",
        "test-dispatch"
      ]
    },
    {
      name: "Phase-1-Mining",
      deps: ["Phase-1-Test"],
      nodes: [
        "mine-abandon-rate",
        "mine-error-recovery",
        "mine-parallel-adoption"
      ]
    },
    {
      name: "Phase-2-Design",
      deps: ["Phase-1-Mining"],
      nodes: [
        "design-patterns",
        "design-latency",
        "design-scripting"
      ]
    },
    {
      name: "Phase-2-Implement",
      deps: ["Phase-2-Design"],
      nodes: [
        "impl-patterns",
        "impl-latency",
        "impl-scripting"
      ]
    },
    {
      name: "Phase-2-Test",
      deps: ["Phase-2-Implement"],
      nodes: [
        "test-patterns",
        "test-latency",
        "test-scripting"
      ]
    },
    {
      name: "Phase-2-Mining",
      deps: ["Phase-2-Test"],
      nodes: [
        "mine-patterns",
        "mine-latency-bench",
        "mine-scripting"
      ]
    },
    {
      name: "Phase-3-Implement",
      deps: ["Phase-2-Mining"],
      nodes: [
        "impl-cache-metrics",
        "impl-tests",
        "impl-docs"
      ]
    },
    {
      name: "Phase-3-Validation",
      deps: ["Phase-3-Implement"],
      nodes: [
        "validate-cache",
        "validate-tests",
        "validate-docs"
      ]
    }
  ]
});
