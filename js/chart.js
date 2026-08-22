"use strict";

/**
 * Canvas 크기를 화면과 기기 해상도에 맞춥니다.
 */
function prepareCanvas(
  canvas,
  minimumWidth = 620,
  height = 340
) {
  if (!canvas) {
    throw new Error(
      "그래프 Canvas가 없습니다."
    );
  }

  const containerWidth =
    canvas.parentElement
      ?.clientWidth || minimumWidth;

  const displayWidth =
    Math.max(
      minimumWidth,
      containerWidth
    );

  const devicePixelRatio =
    Math.max(
      1,
      window.devicePixelRatio || 1
    );

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

  canvas.style.width =
    `${displayWidth}px`;

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
    displayHeight:
      height
  };
}

/**
 * RGB 그래프를 그립니다.
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
        values:
          spectrum.redRaw,
        strokeStyle:
          "#dc2626"
      },
      {
        name: "Green",
        values:
          spectrum.greenRaw,
        strokeStyle:
          "#16a34a"
      },
      {
        name: "Blue",
        values:
          spectrum.blueRaw,
        strokeStyle:
          "#2563eb"
      }
    ]
  );
}

/**
 * Gray 그래프를 그립니다.
 */
export function drawGraySpectrum(
  canvas,
  spectrum
) {
  drawSpectrumChart(
    canvas,
    [
      {
        name:
          "Gray BT.601",
        values:
          spectrum.grayBt601,
        strokeStyle:
          "#111827"
      },
      {
        name:
          "Gray Mean",
        values:
          spectrum.grayMean,
        strokeStyle:
          "#7c3aed"
      }
    ]
  );
}

/**
 * 공통 선 그래프 함수
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

  const {
    context,
    displayWidth,
    displayHeight
  } = prepareCanvas(canvas);

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

  const padding = {
    left: 50,
    right: 18,
    top: 34,
    bottom: 42
  };

  const graphWidth =
    displayWidth -
    padding.left -
    padding.right;

  const graphHeight =
    displayHeight -
    padding.top -
    padding.bottom;

  drawGrid(
    context,
    padding,
    graphWidth,
    graphHeight
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

  context.fillStyle =
    "#64748b";

  context.font =
    "12px sans-serif";

  context.fillText(
    "ROI pixel",
    padding.left +
      graphWidth / 2 -
      25,
    displayHeight - 11
  );
}

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
    "11px sans-serif";

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
      8,
      y + 4
    );
  }
}

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
    1.7;

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
          normalizedValue / 255
        ) *
        graphHeight;

      if (pointIndex === 0) {
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

function drawLegend(
  context,
  series,
  seriesIndex,
  padding
) {
  const startX =
    padding.left +
    seriesIndex * 140;

  context.fillStyle =
    series.strokeStyle;

  context.fillRect(
    startX,
    14,
    14,
    3
  );

  context.fillStyle =
    "#334155";

  context.font =
    "12px sans-serif";

  context.fillText(
    series.name,
    startX + 19,
    19
  );
}