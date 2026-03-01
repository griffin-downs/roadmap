// @module intake-cluster
// @exports clusterCommits, buildProposedNodes, jaccardSimilarity
// @entry roadmap

import type { IntakeCommit, DetectedCluster, ProposedNodeSpec } from './intake.ts';

/** Jaccard similarity: |intersection| / |union|. Returns 0 if both empty. */
export function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const x of setA) {
    if (setB.has(x)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Greedy single-linkage clustering on touchedPaths Jaccard similarity.
 * Deterministic: sorts commits by sha before clustering.
 */
export function clusterCommits(commits: IntakeCommit[], threshold = 0.3): DetectedCluster[] {
  const sorted = [...commits].sort((a, b) => a.sha.localeCompare(b.sha));

  const clusters: { shas: string[]; paths: Set<string>; pathArrays: string[][] }[] = [];

  for (const commit of sorted) {
    let bestCluster: (typeof clusters)[number] | null = null;
    let bestScore = -1;

    for (const cluster of clusters) {
      // avg Jaccard to all members
      let sum = 0;
      for (const memberPaths of cluster.pathArrays) {
        sum += jaccardSimilarity(commit.touchedPaths, memberPaths);
      }
      const avg = sum / cluster.pathArrays.length;
      if (avg >= threshold && avg > bestScore) {
        bestScore = avg;
        bestCluster = cluster;
      }
    }

    if (bestCluster) {
      bestCluster.shas.push(commit.sha);
      bestCluster.pathArrays.push(commit.touchedPaths);
      for (const p of commit.touchedPaths) bestCluster.paths.add(p);
    } else {
      clusters.push({
        shas: [commit.sha],
        paths: new Set(commit.touchedPaths),
        pathArrays: [commit.touchedPaths],
      });
    }
  }

  return clusters.map((c, i) => {
    // avg within-cluster pairwise Jaccard
    let pairSum = 0;
    let pairCount = 0;
    for (let x = 0; x < c.pathArrays.length; x++) {
      for (let y = x + 1; y < c.pathArrays.length; y++) {
        pairSum += jaccardSimilarity(c.pathArrays[x], c.pathArrays[y]);
        pairCount++;
      }
    }

    return {
      clusterId: `cluster-${i}`,
      commitShas: c.shas,
      paths: [...c.paths].sort(),
      jaccardScore: pairCount > 0 ? pairSum / pairCount : 1,
    };
  });
}

/** One ProposedNodeSpec per cluster. */
export function buildProposedNodes(clusters: DetectedCluster[], intakeId: string): ProposedNodeSpec[] {
  return clusters.map(c => ({
    id: `intake::${intakeId}::${c.clusterId}`,
    desc: `Intake cluster ${c.clusterId} — ${c.paths.length} paths`,
    produces: [...c.paths].sort(),
    consumes: [],
    deps: [],
  }));
}
