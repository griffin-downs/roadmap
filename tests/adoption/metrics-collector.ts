/**
 * Metrics collector for adoption scenario execution.
 *
 * Records: API calls made, errors caught by protocol, timing, survey answers.
 * Produces: ScenarioResult — written as JSON per scenario.
 */

export interface ApiCall {
  fn: string;
  args?: string;
  result: 'ok' | 'error' | 'caught';
  errorMsg?: string;
  durationMs?: number;
}

export interface SurveyResponse {
  dimension: string;
  question: string;
  answer: string | number | boolean;
}

export interface ScenarioResult {
  id: string;
  name: string;
  status: 'pass' | 'fail';
  durationMs: number;
  errorMsg?: string;

  // Protocol usage
  apiCalls: ApiCall[];
  errorsProtocolCaught: string[];  // errors define/check/verify caught (not runtime throws)
  featuresExercised: string[];     // which protocol functions were used

  // Value metrics
  wouldUseInProduction: boolean;
  dagCaughtRealError: boolean;
  errorDescription?: string;
  agentBriefingClarity?: number;   // 1-5
  frictionScore?: number;          // 1-5, lower = more friction

  // Survey
  survey: SurveyResponse[];

  // Raw notes
  notes: string[];
}

export interface MetricsCollector {
  call(fn: string, result: 'ok' | 'error' | 'caught', args?: string, errorMsg?: string): void;
  errorCaught(description: string): void;
  feature(name: string): void;
  survey(dimension: string, question: string, answer: string | number | boolean): void;
  note(text: string): void;
  setVerdict(wouldUseInProduction: boolean, dagCaughtRealError: boolean, description?: string): void;
  setClarity(score: number): void;
  setFriction(score: number): void;
  finalize(status: 'pass' | 'fail', durationMs: number, errorMsg?: string): ScenarioResult;
}

export function createCollector(id: string, name: string): MetricsCollector {
  const result: ScenarioResult = {
    id,
    name,
    status: 'pass',
    durationMs: 0,
    apiCalls: [],
    errorsProtocolCaught: [],
    featuresExercised: [],
    wouldUseInProduction: false,
    dagCaughtRealError: false,
    survey: [],
    notes: [],
  };

  return {
    call(fn, res, args?, errorMsg?) {
      result.apiCalls.push({ fn, result: res, args, errorMsg });
      if (!result.featuresExercised.includes(fn)) result.featuresExercised.push(fn);
    },
    errorCaught(description) {
      result.errorsProtocolCaught.push(description);
    },
    feature(name) {
      if (!result.featuresExercised.includes(name)) result.featuresExercised.push(name);
    },
    survey(dimension, question, answer) {
      result.survey.push({ dimension, question, answer });
    },
    note(text) {
      result.notes.push(text);
    },
    setVerdict(wouldUseInProduction, dagCaughtRealError, description?) {
      result.wouldUseInProduction = wouldUseInProduction;
      result.dagCaughtRealError = dagCaughtRealError;
      result.errorDescription = description;
    },
    setClarity(score) {
      result.agentBriefingClarity = score;
    },
    setFriction(score) {
      result.frictionScore = score;
    },
    finalize(status, durationMs, errorMsg?) {
      result.status = status;
      result.durationMs = durationMs;
      if (errorMsg) result.errorMsg = errorMsg;
      return result;
    },
  };
}
