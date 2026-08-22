"use strict";

/**
 * 값을 최솟값과 최댓값 사이로 제한합니다.
 */
export function clamp(value, minimum, maximum) {
  return Math.min(
    Math.max(value, minimum),
    maximum
  );
}

/**
 * 숫자 배열의 평균을 계산합니다.
 */
export function mean(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return 0;
  }

  const total = values.reduce(
    (sum, value) => sum + value,
    0
  );

  return total / values.length;
}

/**
 * 표본 표준편차를 계산합니다.
 */
export function standardDeviation(values) {
  if (!Array.isArray(values) || values.length < 2) {
    return 0;
  }

  const average = mean(values);

  const squaredDifferenceSum =
    values.reduce(
      (sum, value) => {
        const difference =
          value - average;

        return (
          sum +
          difference * difference
        );
      },
      0
    );

  return Math.sqrt(
    squaredDifferenceSum /
    (values.length - 1)
  );
}

/**
 * 변동계수(CV, %)를 계산합니다.
 */
export function coefficientOfVariation(values) {
  const average = mean(values);

  if (average === 0) {
    return 0;
  }

  return (
    standardDeviation(values) /
    Math.abs(average)
  ) * 100;
}

/**
 * 배열의 최대값 위치를 반환합니다.
 */
export function indexOfMaximum(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return -1;
  }

  let maximumIndex = 0;

  for (
    let index = 1;
    index < values.length;
    index += 1
  ) {
    if (
      values[index] >
      values[maximumIndex]
    ) {
      maximumIndex = index;
    }
  }

  return maximumIndex;
}

/**
 * 다운로드 파일명에 사용할 수 없는 문자를 제거합니다.
 */
export function sanitizeFileName(fileName) {
  return String(fileName || "data")
    .replace(
      /[\\/:*?"<>|]+/g,
      "_"
    )
    .trim();
}

/**
 * 파일을 브라우저에서 다운로드합니다.
 */
export function downloadBlob(
  fileName,
  content,
  mimeType
) {
  const blob =
    content instanceof Blob
      ? content
      : new Blob(
          [content],
          {
            type:
              `${mimeType};charset=utf-8`
          }
        );

  const objectUrl =
    URL.createObjectURL(blob);

  const anchor =
    document.createElement("a");

  anchor.href =
    objectUrl;

  anchor.download =
    sanitizeFileName(fileName);

  document.body.appendChild(anchor);

  anchor.click();
  anchor.remove();

  window.setTimeout(
    () => {
      URL.revokeObjectURL(
        objectUrl
      );
    },
    1000
  );
}

/**
 * 숫자를 지정한 소수 자릿수로 변환합니다.
 */
export function toFixedNumber(
  value,
  decimalPlaces = 6
) {
  const numericValue =
    Number(value);

  if (!Number.isFinite(numericValue)) {
    return 0;
  }

  return Number(
    numericValue.toFixed(
      decimalPlaces
    )
  );
}