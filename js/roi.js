"use strict";

/* =========================
   ROI 기본 설정
========================= */

const DEFAULT_ROI_WIDTH = 320;
const DEFAULT_ROI_HEIGHT = 40;

const MINIMUM_ROI_SIZE = 10;

const ROI_STORAGE_KEY =
  "msl-v2-roi-size";

/* =========================
   ROI 컨트롤러 생성
========================= */

/**
 * 고정 크기 ROI의 생성, 표시, 이동을 관리합니다.
 *
 * @param {Object} elements
 * @returns {Object}
 */
export function createRoiController({
  canvas,
  widthInput,
  heightInput,
  lockButton,
  confirmButton,
  messageElement,
  xValue,
  yValue,
  widthValue,
  heightValue,
  sizeSummary
}) {
  validateElements({
    canvas,
    widthInput,
    heightInput,
    lockButton,
    confirmButton,
    messageElement,
    xValue,
    yValue,
    widthValue,
    heightValue,
    sizeSummary
  });

  const context =
    canvas.getContext("2d");

  if (!context) {
    throw new Error(
      "roi.js: Canvas 컨텍스트를 생성하지 못했습니다."
    );
  }

  let imageElement = null;

  let displayScale = 1;

  let roi = {
    x: 0,
    y: 0,
    width: DEFAULT_ROI_WIDTH,
    height: DEFAULT_ROI_HEIGHT
  };

  let sizeLocked = false;

  let dragging = false;
  let resizing = false;
  let resizeHandle = null;
  let resizeStart = null;

  let dragOffsetX = 0;
  let dragOffsetY = 0;

  initialize();

  /* =========================
     초기화
  ========================= */

  function initialize() {
    loadSavedRoiSize();

    canvas.addEventListener(
      "pointerdown",
      startDrag
    );

    // 이동 중 포인터가 ROI/캔버스 밖으로 벗어나도 계속 추적합니다.
    window.addEventListener("pointermove", moveDrag, { passive: false });
    window.addEventListener("pointerup", endDrag, { passive: false });
    window.addEventListener("pointercancel", endDrag, { passive: false });

    canvas.addEventListener(
      "lostpointercapture",
      () => {
        // 일부 모바일 브라우저는 캔버스 재그리기 중 capture를 잃을 수 있습니다.
        // 포인터가 실제로 종료되기 전까지 dragging 상태는 유지합니다.
      }
    );

    canvas.addEventListener("keydown", handleKeyboardMove);

    const nudgeButtons = document.querySelectorAll("[data-roi-nudge]");
    nudgeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const direction = button.dataset.roiNudge;
        const step = Number(button.dataset.roiStep || 5);
        nudge(direction, step);
      });
    });

    widthInput.addEventListener("input", applyInputSizeLive);
    heightInput.addEventListener("input", applyInputSizeLive);

    updateInformation();
  }

  /* =========================
     이미지 설정
  ========================= */

  /**
   * ROI를 적용할 원본 이미지를 설정합니다.
   *
   * @param {HTMLImageElement} image
   */
  function setImage(image) {
    if (!image) {
      throw new Error(
        "ROI에 표시할 이미지가 없습니다."
      );
    }

    const imageWidth =
      image.naturalWidth ||
      image.width;

    const imageHeight =
      image.naturalHeight ||
      image.height;

    if (
      imageWidth <= 0 ||
      imageHeight <= 0
    ) {
      throw new Error(
        "ROI 이미지 크기를 확인할 수 없습니다."
      );
    }

    imageElement = image;
  }

  /* =========================
     ROI 초기 상태
  ========================= */

  function reset() {
    if (!imageElement) {
      throw new Error(
        "ROI를 설정할 이미지가 없습니다."
      );
    }

    sizeLocked = false;
    dragging = false;

    widthInput.disabled = false;
    heightInput.disabled = false;

    lockButton.disabled = false;

    lockButton.textContent =
      "ROI 크기 적용·고정";

    confirmButton.disabled = true;

    const imageWidth =
      getImageWidth();

    const imageHeight =
      getImageHeight();

    const requestedWidth =
      normalizeInputValue(
        widthInput.value,
        DEFAULT_ROI_WIDTH
      );

    const requestedHeight =
      normalizeInputValue(
        heightInput.value,
        DEFAULT_ROI_HEIGHT
      );

    roi.width =
      Math.min(
        requestedWidth,
        imageWidth
      );

    roi.height =
      Math.min(
        requestedHeight,
        imageHeight
      );

    roi.x =
      Math.round(
        (
          imageWidth -
          roi.width
        ) / 2
      );

    roi.y =
      Math.round(
        (
          imageHeight -
          roi.height
        ) / 2
      );

    widthInput.value =
      roi.width;

    heightInput.value =
      roi.height;

    updateInformation();

    showMessage(
      "ROI 크기를 확인한 뒤 적용·고정 버튼을 누르세요.",
      ""
    );
  }

  /* =========================
     ROI 크기 고정
  ========================= */

  function lockSize() {
    if (!imageElement) {
      showMessage(
        "ROI를 설정할 이미지가 없습니다.",
        "error"
      );
      return;
    }

    // 고정된 상태에서 다시 누르면 크기 조정 모드로 전환합니다.
    if (sizeLocked) {
      sizeLocked = false;
      dragging = false;
      resizing = false;
      resizeHandle = null;

      widthInput.disabled = false;
      heightInput.disabled = false;
      lockButton.disabled = false;
      lockButton.textContent = "ROI 크기 다시 고정";
      confirmButton.disabled = true;

      updateInformation();
      draw();
      showMessage(
        "크기 조정 모드입니다. 숫자를 입력하거나 노란색 조절점을 드래그하세요.",
        ""
      );
      return;
    }

    const imageWidth = getImageWidth();
    const imageHeight = getImageHeight();
    const requestedWidth = Math.round(Number(widthInput.value));
    const requestedHeight = Math.round(Number(heightInput.value));

    if (!Number.isFinite(requestedWidth) || requestedWidth < MINIMUM_ROI_SIZE) {
      showMessage(`ROI 가로폭은 ${MINIMUM_ROI_SIZE}px 이상이어야 합니다.`, "error");
      return;
    }

    if (!Number.isFinite(requestedHeight) || requestedHeight < MINIMUM_ROI_SIZE) {
      showMessage(`ROI 세로폭은 ${MINIMUM_ROI_SIZE}px 이상이어야 합니다.`, "error");
      return;
    }

    if (requestedWidth > imageWidth) {
      showMessage("ROI 가로폭이 원본 이미지보다 큽니다.", "error");
      return;
    }

    if (requestedHeight > imageHeight) {
      showMessage("ROI 세로폭이 원본 이미지보다 큽니다.", "error");
      return;
    }

    roi.width = requestedWidth;
    roi.height = requestedHeight;
    roi.x = clamp(roi.x, 0, imageWidth - roi.width);
    roi.y = clamp(roi.y, 0, imageHeight - roi.height);

    sizeLocked = true;
    widthInput.disabled = true;
    heightInput.disabled = true;
    lockButton.disabled = false;
    lockButton.textContent = "ROI 크기 다시 조정";
    confirmButton.disabled = false;

    saveRoiSize();
    updateInformation();
    draw();

    showMessage(
      "ROI 크기만 고정되었습니다. 스마트폰에서도 ROI 안쪽을 손가락으로 드래그하여 위치는 계속 이동할 수 있습니다.",
      "success"
    );
  }

  function applyInputSizeLive() {
    if (!imageElement || sizeLocked) return;

    const imageWidth = getImageWidth();
    const imageHeight = getImageHeight();
    const w = Math.round(Number(widthInput.value));
    const h = Math.round(Number(heightInput.value));

    if (!Number.isFinite(w) || !Number.isFinite(h)) return;
    if (w < MINIMUM_ROI_SIZE || h < MINIMUM_ROI_SIZE) return;

    const nextWidth = Math.min(w, imageWidth);
    const nextHeight = Math.min(h, imageHeight);
    const centerX = roi.x + roi.width / 2;
    const centerY = roi.y + roi.height / 2;

    roi.width = nextWidth;
    roi.height = nextHeight;
    roi.x = clamp(Math.round(centerX - nextWidth / 2), 0, imageWidth - nextWidth);
    roi.y = clamp(Math.round(centerY - nextHeight / 2), 0, imageHeight - nextHeight);

    updateInformation();
    draw();
  }

  /* =========================
     ROI 표시
  ========================= */

  function draw() {
    if (!imageElement) {
      return;
    }

    const sourceWidth =
      getImageWidth();

    const sourceHeight =
      getImageHeight();

    const parentWidth =
      canvas.parentElement
        ?.clientWidth || 320;

    const availableWidth =
      Math.min(
        860,
        Math.max(
          280,
          parentWidth - 4
        )
      );

    displayScale =
      Math.min(
        1,
        availableWidth /
          sourceWidth
      );

    const displayWidth =
      Math.max(
        1,
        Math.round(
          sourceWidth *
          displayScale
        )
      );

    const displayHeight =
      Math.max(
        1,
        Math.round(
          sourceHeight *
          displayScale
        )
      );

    // 매 pointermove마다 canvas.width/height를 다시 설정하면
    // 일부 브라우저에서 드래그 포인터 캡처가 끊길 수 있습니다.
    // 실제 표시 크기가 바뀔 때만 캔버스 버퍼를 재설정합니다.
    if (canvas.width !== displayWidth) {
      canvas.width = displayWidth;
    }
    if (canvas.height !== displayHeight) {
      canvas.height = displayHeight;
    }

    context.clearRect(
      0,
      0,
      displayWidth,
      displayHeight
    );

    context.drawImage(
      imageElement,
      0,
      0,
      displayWidth,
      displayHeight
    );

    drawShade(
      displayWidth,
      displayHeight
    );

    drawRoiRectangle();
  }

  /* =========================
     ROI 외부 어둡게 표시
  ========================= */

  function drawShade(
    displayWidth,
    displayHeight
  ) {
    const displayRoi =
      getDisplayRoi();

    context.save();

    context.fillStyle =
      "rgba(0, 0, 0, 0.34)";

    context.fillRect(
      0,
      0,
      displayWidth,
      displayRoi.y
    );

    context.fillRect(
      0,
      displayRoi.y +
        displayRoi.height,
      displayWidth,
      displayHeight -
        displayRoi.y -
        displayRoi.height
    );

    context.fillRect(
      0,
      displayRoi.y,
      displayRoi.x,
      displayRoi.height
    );

    context.fillRect(
      displayRoi.x +
        displayRoi.width,
      displayRoi.y,
      displayWidth -
        displayRoi.x -
        displayRoi.width,
      displayRoi.height
    );

    context.restore();
  }

  /* =========================
     ROI 테두리 표시
  ========================= */

  function drawRoiRectangle() {
    const displayRoi =
      getDisplayRoi();

    context.save();

    context.strokeStyle =
      "#facc15";

    context.lineWidth =
      Math.max(
        2,
        3 * displayScale
      );

    context.setLineDash([
      8,
      5
    ]);

    context.strokeRect(
      displayRoi.x,
      displayRoi.y,
      displayRoi.width,
      displayRoi.height
    );

    context.setLineDash([]);

    context.fillStyle =
      "rgba(250, 204, 21, 0.12)";

    context.fillRect(
      displayRoi.x,
      displayRoi.y,
      displayRoi.width,
      displayRoi.height
    );

    drawMoveGrip(displayRoi);

    if (!sizeLocked) {
      drawResizeHandles(displayRoi);
    }

    context.restore();
  }

  function drawMoveGrip(displayRoi) {
    // ROI가 얇아도 쉽게 잡을 수 있도록 중앙에 큰 이동 손잡이를 표시합니다.
    const gripWidth = Math.min(88, Math.max(52, displayRoi.width * 0.34));
    const gripHeight = Math.min(28, Math.max(20, displayRoi.height));
    const x = displayRoi.x + displayRoi.width / 2 - gripWidth / 2;
    const y = displayRoi.y + displayRoi.height / 2 - gripHeight / 2;

    context.save();
    context.setLineDash([]);
    context.fillStyle = "rgba(15, 23, 42, 0.70)";
    context.strokeStyle = "#facc15";
    context.lineWidth = 1.5;
    context.beginPath();
    if (typeof context.roundRect === "function") {
      context.roundRect(x, y, gripWidth, gripHeight, 8);
    } else {
      context.rect(x, y, gripWidth, gripHeight);
    }
    context.fill();
    context.stroke();
    context.fillStyle = "#facc15";
    context.font = "600 12px system-ui, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("↔ 이동", x + gripWidth / 2, y + gripHeight / 2);
    context.restore();
  }

  function drawResizeHandles(displayRoi) {
    const size = 14;
    const half = size / 2;
    const points = [
      [displayRoi.x, displayRoi.y],
      [displayRoi.x + displayRoi.width / 2, displayRoi.y],
      [displayRoi.x + displayRoi.width, displayRoi.y],
      [displayRoi.x + displayRoi.width, displayRoi.y + displayRoi.height / 2],
      [displayRoi.x + displayRoi.width, displayRoi.y + displayRoi.height],
      [displayRoi.x + displayRoi.width / 2, displayRoi.y + displayRoi.height],
      [displayRoi.x, displayRoi.y + displayRoi.height],
      [displayRoi.x, displayRoi.y + displayRoi.height / 2]
    ];

    context.save();
    context.setLineDash([]);
    context.fillStyle = "#facc15";
    context.strokeStyle = "#111827";
    context.lineWidth = 2;
    for (const [x, y] of points) {
      context.fillRect(x - half, y - half, size, size);
      context.strokeRect(x - half, y - half, size, size);
    }
    context.restore();
  }

  function getDisplayRoi() {
    return {
      x:
        roi.x *
        displayScale,

      y:
        roi.y *
        displayScale,

      width:
        roi.width *
        displayScale,

      height:
        roi.height *
        displayScale
    };
  }

  /* =========================
     드래그 시작
  ========================= */

  function startDrag(event) {
    const point = getSourcePoint(event);

    // 중요: sizeLocked는 가로/세로 크기만 고정합니다.
    // 위치 이동은 잠그지 않습니다. 따라서 스마트폰에서도
    // 크기 고정 후 ROI 내부를 드래그하면 계속 위치를 바꿀 수 있습니다.

    if (!sizeLocked) {
      const handle = getResizeHandle(point);
      if (handle) {
        resizing = true;
        resizeHandle = handle;
        resizeStart = {
          pointerX: point.x,
          pointerY: point.y,
          x: roi.x,
          y: roi.y,
          width: roi.width,
          height: roi.height
        };
        canvas.classList.add("resizing");
        capturePointer(event);
        event.preventDefault();
        return;
      }
    }

    if (!isPointInsideRoi(point, true)) return;

    // 키보드 화살표 이동도 바로 사용할 수 있게 포커스를 줍니다.
    try { canvas.focus({ preventScroll: true }); } catch { canvas.focus(); }

    dragging = true;
    dragOffsetX = point.x - roi.x;
    dragOffsetY = point.y - roi.y;
    canvas.classList.add("dragging");
    capturePointer(event);
    event.preventDefault();
  }

  function capturePointer(event) {
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // Pointer Capture 미지원 환경
    }
  }

  function getResizeHandle(point) {
    const tolerance = Math.max(12 / Math.max(displayScale, 0.01), 10);
    const left = roi.x;
    const right = roi.x + roi.width;
    const top = roi.y;
    const bottom = roi.y + roi.height;
    const midX = (left + right) / 2;
    const midY = (top + bottom) / 2;

    const near = (a, b) => Math.abs(a - b) <= tolerance;
    const candidates = [
      ["nw", left, top], ["n", midX, top], ["ne", right, top],
      ["e", right, midY], ["se", right, bottom], ["s", midX, bottom],
      ["sw", left, bottom], ["w", left, midY]
    ];

    for (const [name, x, y] of candidates) {
      if (near(point.x, x) && near(point.y, y)) return name;
    }
    return null;
  }

  /* =========================
     ROI 이동
  ========================= */

  function moveDrag(event) {
    if (!dragging && !resizing) return;

    const point = getSourcePoint(event);
    const imageWidth = getImageWidth();
    const imageHeight = getImageHeight();

    if (resizing && resizeStart) {
      const start = resizeStart;
      let left = start.x;
      let top = start.y;
      let right = start.x + start.width;
      let bottom = start.y + start.height;

      if (resizeHandle.includes("w")) left = clamp(point.x, 0, right - MINIMUM_ROI_SIZE);
      if (resizeHandle.includes("e")) right = clamp(point.x, left + MINIMUM_ROI_SIZE, imageWidth);
      if (resizeHandle.includes("n")) top = clamp(point.y, 0, bottom - MINIMUM_ROI_SIZE);
      if (resizeHandle.includes("s")) bottom = clamp(point.y, top + MINIMUM_ROI_SIZE, imageHeight);

      roi.x = Math.round(left);
      roi.y = Math.round(top);
      roi.width = Math.round(right - left);
      roi.height = Math.round(bottom - top);

      widthInput.value = roi.width;
      heightInput.value = roi.height;
      updateInformation();
      draw();
      event.preventDefault();
      return;
    }

    roi.x = Math.round(clamp(point.x - dragOffsetX, 0, imageWidth - roi.width));
    roi.y = Math.round(clamp(point.y - dragOffsetY, 0, imageHeight - roi.height));
    updateInformation();
    draw();
    event.preventDefault();
  }

  /* =========================
     드래그 종료
  ========================= */

  function endDrag(event) {
    if (!dragging && !resizing) {
      return;
    }

    dragging = false;
    resizing = false;
    resizeHandle = null;
    resizeStart = null;

    canvas.classList.remove("dragging");
    canvas.classList.remove("resizing");

    try {
      if (
        canvas.hasPointerCapture(
          event.pointerId
        )
      ) {
        canvas.releasePointerCapture(
          event.pointerId
        );
      }
    } catch {
      // Pointer Capture 미지원 환경
    }
  }

  function cancelDrag() {
    dragging = false;
    resizing = false;
    resizeHandle = null;
    resizeStart = null;
    canvas.classList.remove("dragging");
    canvas.classList.remove("resizing");
  }

  /* =========================
     화면 좌표 → 원본 이미지 좌표
  ========================= */

  function getSourcePoint(
    event
  ) {
    const rect =
      canvas.getBoundingClientRect();

    if (
      rect.width <= 0 ||
      rect.height <= 0
    ) {
      return {
        x: 0,
        y: 0
      };
    }

    const canvasX =
      (
        event.clientX -
        rect.left
      ) *
      (
        canvas.width /
        rect.width
      );

    const canvasY =
      (
        event.clientY -
        rect.top
      ) *
      (
        canvas.height /
        rect.height
      );

    return {
      x:
        canvasX /
        displayScale,

      y:
        canvasY /
        displayScale
    };
  }

  function isPointInsideRoi(point, useComfortHitArea = false) {
    // 화면상 최소 약 44px 높이의 드래그 영역을 보장해
    // 세로폭이 작은 ROI도 손가락으로 쉽게 잡을 수 있게 합니다.
    const comfort = useComfortHitArea
      ? Math.max(0, (44 / Math.max(displayScale, 0.01) - roi.height) / 2)
      : 0;

    return (
      point.x >= roi.x &&
      point.x <= roi.x + roi.width &&
      point.y >= roi.y - comfort &&
      point.y <= roi.y + roi.height + comfort
    );
  }

  function nudge(direction, step = 5) {
    if (!imageElement) return;
    const amount = Math.max(1, Math.round(step));
    let dx = 0;
    let dy = 0;
    if (direction === "left") dx = -amount;
    if (direction === "right") dx = amount;
    if (direction === "up") dy = -amount;
    if (direction === "down") dy = amount;
    moveRoiBy(dx, dy);
  }

  function moveRoiBy(dx, dy) {
    const imageWidth = getImageWidth();
    const imageHeight = getImageHeight();
    roi.x = Math.round(clamp(roi.x + dx, 0, imageWidth - roi.width));
    roi.y = Math.round(clamp(roi.y + dy, 0, imageHeight - roi.height));
    updateInformation();
    draw();
  }

  function handleKeyboardMove(event) {
    const step = event.shiftKey ? 10 : 1;
    const map = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step]
    };
    const delta = map[event.key];
    if (!delta) return;
    event.preventDefault();
    moveRoiBy(delta[0], delta[1]);
  }

  /* =========================
     ROI 정보 표시
  ========================= */

  function updateInformation() {
    const roundedX =
      Math.round(
        roi.x
      );

    const roundedY =
      Math.round(
        roi.y
      );

    const roundedWidth =
      Math.round(
        roi.width
      );

    const roundedHeight =
      Math.round(
        roi.height
      );

    xValue.textContent =
      String(
        roundedX
      );

    yValue.textContent =
      String(
        roundedY
      );

    widthValue.textContent =
      String(
        roundedWidth
      );

    heightValue.textContent =
      String(
        roundedHeight
      );

    sizeSummary.textContent =
      `${roundedWidth} × ` +
      `${roundedHeight} px`;
  }

  /* =========================
     ROI 크기 저장
  ========================= */

  function saveRoiSize() {
    const size = {
      width:
        Math.round(
          roi.width
        ),

      height:
        Math.round(
          roi.height
        )
    };

    try {
      localStorage.setItem(
        ROI_STORAGE_KEY,
        JSON.stringify(
          size
        )
      );
    } catch (error) {
      console.error(
        "ROI 크기 저장 실패:",
        error
      );
    }
  }

  /* =========================
     ROI 크기 불러오기
  ========================= */

  function loadSavedRoiSize() {
    try {
      const raw =
        localStorage.getItem(
          ROI_STORAGE_KEY
        );

      if (!raw) {
        widthInput.value =
          DEFAULT_ROI_WIDTH;

        heightInput.value =
          DEFAULT_ROI_HEIGHT;

        return;
      }

      const saved =
        JSON.parse(
          raw
        );

      const savedWidth =
        Number(
          saved.width
        );

      const savedHeight =
        Number(
          saved.height
        );

      if (
        Number.isFinite(
          savedWidth
        ) &&
        savedWidth >=
          MINIMUM_ROI_SIZE
      ) {
        widthInput.value =
          Math.round(
            savedWidth
          );
      }

      if (
        Number.isFinite(
          savedHeight
        ) &&
        savedHeight >=
          MINIMUM_ROI_SIZE
      ) {
        heightInput.value =
          Math.round(
            savedHeight
          );
      }
    } catch (error) {
      console.error(
        "저장된 ROI 크기 불러오기 실패:",
        error
      );

      widthInput.value =
        DEFAULT_ROI_WIDTH;

      heightInput.value =
        DEFAULT_ROI_HEIGHT;
    }
  }

  /* =========================
     현재 ROI 반환
  ========================= */

  function getRoi() {
    if (!imageElement) {
      throw new Error(
        "ROI 이미지가 설정되지 않았습니다."
      );
    }

    if (!sizeLocked) {
      throw new Error(
        "ROI 크기를 먼저 고정하세요."
      );
    }

    return {
      x:
        Math.round(
          roi.x
        ),

      y:
        Math.round(
          roi.y
        ),

      width:
        Math.round(
          roi.width
        ),

      height:
        Math.round(
          roi.height
        )
    };
  }

  /* =========================
     이미지 크기
  ========================= */

  function getImageWidth() {
    return (
      imageElement?.naturalWidth ||
      imageElement?.width ||
      0
    );
  }

  function getImageHeight() {
    return (
      imageElement?.naturalHeight ||
      imageElement?.height ||
      0
    );
  }

  /* =========================
     메시지 표시
  ========================= */

  function showMessage(
    message,
    type = ""
  ) {
    messageElement.className =
      `status-message${
        type
          ? ` ${type}`
          : ""
      }`;

    messageElement.textContent =
      message;
  }

  /* =========================
     외부 공개 기능
  ========================= */

  return {
    setImage,
    reset,
    draw,
    lockSize,
    getRoi,

    isSizeLocked() {
      return sizeLocked;
    },

    getImage() {
      return imageElement;
    }
  };
}

/* =========================
   필수 요소 검사
========================= */

function validateElements(
  elements
) {
  const missingEntry =
    Object.entries(
      elements
    ).find(
      ([, element]) =>
        !element
    );

  if (missingEntry) {
    throw new Error(
      `roi.js: ${missingEntry[0]} 요소를 찾지 못했습니다.`
    );
  }
}

/* =========================
   숫자 처리
========================= */

function normalizeInputValue(
  value,
  fallback
) {
  const numericValue =
    Math.round(
      Number(value)
    );

  if (
    !Number.isFinite(
      numericValue
    ) ||
    numericValue <
      MINIMUM_ROI_SIZE
  ) {
    return fallback;
  }

  return numericValue;
}

function clamp(
  value,
  minimum,
  maximum
) {
  return Math.min(
    Math.max(
      value,
      minimum
    ),
    maximum
  );
}