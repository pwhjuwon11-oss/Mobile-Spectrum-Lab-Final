"use strict";

import {
  downloadBlob,
  sanitizeFileName
} from "./utils.js";

/**
 * 분석 결과를 CSV 문자열로 변환합니다.
 */
export function spectrumToCsv(
  analysisResult
) {
  if (
    !analysisResult ||
    !analysisResult.spectrum
  ) {
    throw new Error(
      "CSV로 저장할 분석 결과가 없습니다."
    );
  }

  const spectrum =
    analysisResult.spectrum;

  const rows = [
    [
      "pixel",
      "red_raw",
      "green_raw",
      "blue_raw",
      "gray_bt601",
      "gray_mean"
    ].join(",")
  ];

  for (
    let index = 0;
    index <
    spectrum.pixel.length;
    index += 1
  ) {
    rows.push(
      [
        spectrum.pixel[index],

        Number(
          spectrum.redRaw[index]
        ).toFixed(6),

        Number(
          spectrum.greenRaw[index]
        ).toFixed(6),

        Number(
          spectrum.blueRaw[index]
        ).toFixed(6),

        Number(
          spectrum.grayBt601[index]
        ).toFixed(6),

        Number(
          spectrum.grayMean[index]
        ).toFixed(6)
      ].join(",")
    );
  }

  return (
    "\uFEFF" +
    rows.join("\n")
  );
}

/**
 * 분석 결과 CSV를 다운로드합니다.
 */
export function downloadSpectrumCsv({
  analysisResult,
  sessionName = "session",
  sampleName = "Blank",
  repeatNumber = 1
}) {
  const csv =
    spectrumToCsv(
      analysisResult
    );

  const safeSessionName =
    sanitizeFileName(
      sessionName
    );

  const safeSampleName =
    sanitizeFileName(
      sampleName
    );

  const repeatText =
    String(repeatNumber)
      .padStart(2, "0");

  const fileName =
    `${safeSessionName}_` +
    `${safeSampleName}_` +
    `${repeatText}_raw.csv`;

  downloadBlob(
    fileName,
    csv,
    "text/csv"
  );
}

/**
 * 분석 결과 JSON을 다운로드합니다.
 */
export function downloadSpectrumJson({
  analysisResult,
  sessionName = "session",
  sampleName = "Blank",
  repeatNumber = 1
}) {
  const safeSessionName =
    sanitizeFileName(
      sessionName
    );

  const safeSampleName =
    sanitizeFileName(
      sampleName
    );

  const repeatText =
    String(repeatNumber)
      .padStart(2, "0");

  const fileName =
    `${safeSessionName}_` +
    `${safeSampleName}_` +
    `${repeatText}.json`;

  downloadBlob(
    fileName,
    JSON.stringify(
      analysisResult,
      null,
      2
    ),
    "application/json"
  );
}