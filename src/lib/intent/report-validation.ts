// @module intent/report-validation
// @exports REQUIRED_SECTIONS, validateReport, isReportPrompt, ReportValidationResult, SectionResult

// Structured report validation — replaces minResponseLength.
// Parses prompt answers for required section headers and validates each is present + non-empty.

export const REQUIRED_SECTIONS = [
  'COMMIT STATUS',
  'TEST EVIDENCE',
  'UNVALIDATED ASSUMPTIONS',
  'FAILURE SURFACE',
  'SCOPE DECISIONS',
  'AUDIT TRAIL',
] as const;

export type SectionName = typeof REQUIRED_SECTIONS[number];

export interface SectionResult {
  section: SectionName;
  present: boolean;
  empty: boolean;
}

export interface ReportValidationResult {
  valid: boolean;
  sections: SectionResult[];
  missingSections: SectionName[];
  emptySections: SectionName[];
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Build a regex that matches any section header (for splitting)
const SECTION_HEADER_RE = new RegExp(
  `(?:^|\\n)\\s*(?:\\d+\\.?\\s*)?(?:${REQUIRED_SECTIONS.map(escapeRegExp).join('|')})\\s*:`,
  'i',
);

/**
 * Detect whether a prompt string is asking for a structured report
 * (contains >= 3 of the 6 required section names).
 */
export function isReportPrompt(promptText: string): boolean {
  const upper = promptText.toUpperCase();
  return REQUIRED_SECTIONS.filter(s => upper.includes(s)).length >= 3;
}

/**
 * Validate that text contains all required report sections, each non-empty.
 */
export function validateReport(text: string): ReportValidationResult {
  const sections: SectionResult[] = [];
  const missingSections: SectionName[] = [];
  const emptySections: SectionName[] = [];

  for (const section of REQUIRED_SECTIONS) {
    const headerRe = new RegExp(
      `(?:^|\\n)\\s*(?:\\d+\\.?\\s*)?${escapeRegExp(section)}\\s*:`,
      'i',
    );
    const match = headerRe.exec(text);

    if (!match) {
      sections.push({ section, present: false, empty: true });
      missingSections.push(section);
      continue;
    }

    // Extract content after header until next section header or end of string
    const afterHeader = text.slice(match.index + match[0].length);
    const nextMatch = SECTION_HEADER_RE.exec(afterHeader);
    const content = nextMatch
      ? afterHeader.slice(0, nextMatch.index).trim()
      : afterHeader.trim();

    const empty = content.length === 0;
    sections.push({ section, present: true, empty });
    if (empty) emptySections.push(section);
  }

  return {
    valid: missingSections.length === 0 && emptySections.length === 0,
    sections,
    missingSections,
    emptySections,
  };
}
