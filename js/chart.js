"use strict";

/**
 * Canvas 크기를 현재 화면 폭과
 * 기기 해상도(DPR)에 맞춥니다.
 */
function prepareCanvas(
  canvas,
  height = 250
) {
  if (!canvas) {
    throw new Error(
      "그래프 Canvas가 없습니다."
    );
  }

  const containerWidth =
    canvas.parentElement?.clientWidth ||
    canvas.clientWidth ||
    320;

  /*
   * 기존처럼 최소 620px을 강제하지 않고
   * 실제 부모 요소의 폭을 그대로 사용합니다.
   */
  const displayWidth =
    Math.max(
      1,
      Math.floor(containerWidth)
    );

  const devicePixelRatio =
    Math.max(
      1,
      window.devicePixelRatio || 1
    );

  /*
   * 실제 Canvas 내부 픽셀은 DPR만큼 크게 만들어
   * 고해상도로 렌더링합니다.
   */
  canvas.width =
    Math.round(
      displayWidth *
      devicePixelRatio
    );

  canvas.height =
    Math.round(
      height *
      devicePixelRatio
    );

  /*
   * 화면에 표시되는 크기는
   * 스마트폰 화면 폭에 맞춥니다.
   */
  canvas.style.width =
    "100%";

  canvas.style.maxWidth =
    "100%";

  canvas.style.height =
    `${height}px`;

  const context =
    canvas.getContext("2d");

  context.setTransform(
    devicePixelRatio,
    0,
    0,
    devicePixelRatio,
    0,
    0
  );

  return {
    context,
    displayWidth,
    displayHeight: height
  };
}

/**
 * RGB 그래프
 */
export function drawRgbSpectrum(
  canvas,
  spectrum
) {
  drawSpectrumChart(
    canvas,
    [
      {
        name: "Red",
        values: spectrum.redRaw,
        strokeStyle: "#dc2626"
      },
      {
        name: "Green",
        values: spectrum.greenRaw,
        strokeStyle: "#16a34a"
      },
      {
        name: "Blue",
        values: spectrum.blueRaw,
        strokeStyle: "#2563eb"
      }
    ]
  );
}

/**
 * Gray 그래프
 */
export function drawGraySpectrum(
  canvas,
  spectrum
) {
  drawSpectrumChart(
    canvas,
    [
      {
        name: "Gray BT.601",
        values:
          spectrum.grayBt601,
        strokeStyle:
          "#111827"
      },
      {
        name: "Gray Mean",
        values:
          spectrum.grayMean,
        strokeStyle:
          "#7c3aed"
      }
    ]
  );
}

/**
 * 공통 스펙트럼 선 그래프
 */
export function drawSpectrumChart(
  canvas,
  seriesList
) {
  if (
    !Array.isArray(seriesList) ||
    seriesList.length === 0
  ) {
    throw new Error(
      "그래프 데이터가 없습니다."
    );
  }

  /*
   * RGB와 Gray 모두 동일한 높이
   */
  const {
    context,
    displayWidth,
    displayHeight
  } = prepareCanvas(
    canvas,
    250
  );

  context.clearRect(
    0,
    0,
    displayWidth,
    displayHeight
  );

  context.fillStyle =
    "#ffffff";

  context.fillRect(
    0,
    0,
    displayWidth,
    displayHeight
  );

  /*
   * 스마트폰에서도 축 숫자가 잘리지 않도록
   * 좌우 여백을 확보합니다.
   */
  const padding = {
    left: 42,
    right: 16,
    top: 34,
    bottom: 45
  };

  const graphWidth =
    Math.max(
      1,
      displayWidth -
        padding.left -
        padding.right
    );

  const graphHeight =
    Math.max(
      1,
      displayHeight -
        padding.top -
        padding.bottom
    );

  /*
   * 실제 데이터 길이 확인
   */
  const dataLength =
    Math.max(
      ...seriesList.map(
        series =>
          Array.isArray(series.values)
            ? series.values.length
            : 0
      )
    );

  const maxPixel =
    Math.max(
      1,
      dataLength - 1
    );

  drawGrid(
    context,
    padding,
    graphWidth,
    graphHeight
  );

  drawXAxis(
    context,
    padding,
    graphWidth,
    graphHeight,
    maxPixel
  );

  seriesList.forEach(
    (
      series,
      seriesIndex
    ) => {
      drawSeries(
        context,
        series,
        seriesIndex,
        padding,
        graphWidth,
        graphHeight
      );
    }
  );

  /*
   * X축 제목
   */
  context.fillStyle =
    "#64748b";

  context.font =
    "11px sans-serif";

  context.textAlign =
    "center";

  context.fillText(
    "ROI pixel",
    padding.left +
      graphWidth / 2,
    displayHeight - 8
  );

  context.textAlign =
    "start";
}

/**
 * Y축 및 가로 격자
 */
function drawGrid(
  context,
  padding,
  graphWidth,
  graphHeight
) {
  context.strokeStyle =
    "#e2e8f0";

  context.fillStyle =
    "#64748b";

  context.lineWidth = 1;

  context.font =
    "10px sans-serif";

  context.textAlign =
    "right";

  for (
    let lineIndex = 0;
    lineIndex <= 5;
    lineIndex += 1
  ) {
    const ratio =
      lineIndex / 5;

    const y =
      padding.top +
      graphHeight *
        ratio;

    context.beginPath();

    context.moveTo(
      padding.left,
      y
    );

    context.lineTo(
      padding.left +
        graphWidth,
      y
    );

    context.stroke();

    const intensity =
      255 -
      Math.round(
        255 * ratio
      );

    context.fillText(
      String(intensity),
      padding.left - 7,
      y + 4
    );
  }

  context.textAlign =
    "start";
}

/**
 * X축 눈금
 * 0 / 80 / 160 / 240 / 319
 */
function drawXAxis(
  context,
  padding,
  graphWidth,
  graphHeight,
  maxPixel
) {
  const requestedTicks =
    [0, 80, 160, 240, 319];

  /*
   * 정상적인 320개 데이터에서는
   * 그대로 0,80,160,240,319 표시.
   * 데이터가 짧은 경우 범위를 벗어난
   * 눈금은 자동 제외합니다.
   */
  const ticks =
    requestedTicks.filter(
      tick =>
        tick <= maxPixel
    );

  /*
   * 마지막 데이터 번호도
   * 반드시 표시되도록 처리
   */
  if (
    !ticks.includes(maxPixel) &&
    maxPixel !== 319
  ) {
    ticks.push(maxPixel);
  }

  context.font =
    "10px sans-serif";

  context.fillStyle =
    "#64748b";

  context.strokeStyle =
    "#cbd5e1";

  context.lineWidth = 1;

  ticks.forEach(
    tick => {
      const ratio =
        tick /
        Math.max(
          1,
          maxPixel
        );

      const x =
        padding.left +
        ratio *
          graphWidth;

      const axisY =
        padding.top +
        graphHeight;

      /*
       * 짧은 세로 눈금선
       */
      context.beginPath();

      context.moveTo(
        x,
        axisY
      );

      context.lineTo(
        x,
        axisY + 5
      );

      context.stroke();

      /*
       * 양 끝 숫자가 잘리지 않도록
       * 정렬을 다르게 처리
       */
      if (tick === 0) {
        context.textAlign =
          "left";
      } else if (
        tick === maxPixel
      ) {
        context.textAlign =
          "right";
      } else {
        context.textAlign =
          "center";
      }

      context.fillText(
        String(tick),
        x,
        axisY + 17
      );
    }
  );

  context.textAlign =
    "start";
}

/**
 * 스펙트럼 선
 */
function drawSeries(
  context,
  series,
  seriesIndex,
  padding,
  graphWidth,
  graphHeight
) {
  const values =
    series.values;

  if (
    !Array.isArray(values) ||
    values.length === 0
  ) {
    return;
  }

  context.beginPath();

  context.strokeStyle =
    series.strokeStyle;

  context.lineWidth =
    1.5;

  context.lineJoin =
    "round";

  context.lineCap =
    "round";

  values.forEach(
    (
      value,
      pointIndex
    ) => {
      const x =
        padding.left +
        (
          pointIndex /
          Math.max(
            1,
            values.length - 1
          )
        ) *
          graphWidth;

      const normalizedValue =
        Math.min(
          Math.max(
            Number(value),
            0
          ),
          255
        );

      const y =
        padding.top +
        (
          1 -
          normalizedValue /
            255
        ) *
          graphHeight;

      if (
        pointIndex === 0
      ) {
        context.moveTo(
          x,
          y
        );
      } else {
        context.lineTo(
          x,
          y
        );
      }
    }
  );

  context.stroke();

  drawLegend(
    context,
    series,
    seriesIndex,
    padding
  );
}

/**
 * 범례
 */
function drawLegend(
  context,
  series,
  seriesIndex,
  padding
) {
  /*
   * 스마트폰에서도 RGB 3개 범례가
   * 한 줄에 들어갈 수 있도록 간격 축소
   */
  const startX =
    padding.left +
    seriesIndex * 82;

  context.fillStyle =
    series.strokeStyle;

  context.fillRect(
    startX,
    14,
    12,
    3
  );

  context.fillStyle =
    "#334155";

  context.font =
    "10px sans-serif";

  context.fillText(
    series.name,
    startX + 16,
    19
  );
}
