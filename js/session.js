"use strict";

export const REFERENCE_ORDER = ["Blank", "PP", "PET", "PS", "PA", "PC"];
export const REPEAT_COUNT = 3;
export const REFERENCE_VALID_MS = 4 * 60 * 60 * 1000;
const SESSION_KEY = "msl-v2-current-session";
const REFERENCE_KEY = "msl-v2-reference-library";
const UNKNOWN_COUNTER_KEY = "msl-v2-unknown-counter";

export function createSession({projectName, sessionName, lightSource, measurementMode, sessionType="reference", unknownNumber=null}) {
  const measurementOrder = sessionType === "reference" ? [...REFERENCE_ORDER] : ["Unknown"];
  return {
    version: "2.2.4",
    projectName: (projectName || "2026 과학전람회").trim(),
    sessionName: (sessionName || "측정").trim(),
    lightSource: lightSource || "6500K LED",
    measurementMode,
    sessionType,
    unknownNumber,
    measurementOrder,
    repeatCount: REPEAT_COUNT,
    currentStepIndex: 0,
    currentRepeatIndex: 0,
    measurements: [],
    roi: null,
    roiSize: null,
    currentAnalysis: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export function getCurrentMeasurement(session) {
  const sampleType = session.measurementOrder[session.currentStepIndex];
  if (!sampleType) throw new Error("현재 측정 단계를 찾을 수 없습니다.");
  const displayName = sampleType === "Unknown" && session.unknownNumber
    ? `UNKNOWN-${String(session.unknownNumber).padStart(3,"0")}` : sampleType;
  return {
    sampleType, displayName,
    repeatNumber: session.currentRepeatIndex + 1,
    stepNumber: session.currentStepIndex + 1,
    totalSteps: session.measurementOrder.length,
    instruction: sampleType === "Blank"
      ? "광 경로에 시료와 지지체를 두지 않은 상태로 측정하세요."
      : sampleType === "Unknown"
        ? `${displayName} 시료를 장치에 고정한 채 측정하세요.`
        : `${sampleType} 표준 시료를 장치에 고정한 채 측정하세요.`
  };
}

export function addMeasurement(session, analysisResult) {
  const cur = getCurrentMeasurement(session);
  session.measurements.push({
    sampleType: cur.sampleType,
    displayName: cur.displayName,
    repeatNumber: cur.repeatNumber,
    roi: {...analysisResult.roi},
    spectrum: analysisResult.spectrum,
    summary: analysisResult.summary,
    capturedAt: new Date().toISOString()
  });
  session.updatedAt = new Date().toISOString();
}

export function advanceMeasurement(session) {
  session.currentRepeatIndex += 1;
  if (session.currentRepeatIndex >= session.repeatCount) {
    session.currentRepeatIndex = 0;
    session.currentStepIndex += 1;
  }
  session.updatedAt = new Date().toISOString();
  return session.currentStepIndex >= session.measurementOrder.length;
}

export function saveSession(session) { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); }
export function loadSession() { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; } }
export function clearSavedSession() { localStorage.removeItem(SESSION_KEY); }

export function getNextUnknownNumber() {
  const next = Number(localStorage.getItem(UNKNOWN_COUNTER_KEY) || "0") + 1;
  localStorage.setItem(UNKNOWN_COUNTER_KEY, String(next));
  return next;
}

export function saveReference(reference) {
  const all = getReferenceHistory();
  all.unshift(reference);
  localStorage.setItem(REFERENCE_KEY, JSON.stringify(all.slice(0, 30)));
}
export function getReferenceHistory() { try { return JSON.parse(localStorage.getItem(REFERENCE_KEY) || "[]"); } catch { return []; } }
export function getLatestReference() { return getReferenceHistory()[0] || null; }
export function getReferenceAgeMs(ref) { return ref ? Date.now() - new Date(ref.createdAt).getTime() : Infinity; }
export function isReferenceExpired(ref) { return getReferenceAgeMs(ref) > REFERENCE_VALID_MS; }
export function markLightRestarted() {
  const ref = getLatestReference();
  if (!ref) return;
  const all = getReferenceHistory();
  all[0] = {...all[0], lightRestartedAt: new Date().toISOString()};
  localStorage.setItem(REFERENCE_KEY, JSON.stringify(all));
}
