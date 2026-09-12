"use strict";

const VIDEO_DURATION_MS = 3000;
const VIDEO_FRAME_INTERVAL_MS = 200;
const VIDEO_FRAME_COUNT = Math.round(
  VIDEO_DURATION_MS / VIDEO_FRAME_INTERVAL_MS
);

/*
 * 180° 장착 모드에서는 body 전체가 180° 회전한다.
 * 분석 데이터에는 손대지 않고 실시간 cameraPreview만 다시 180° 회전해
 * 화면상 스펙트럼 방향을 원래대로 보이게 한다.
 * Canvas drawImage(video, ...)에는 CSS transform이 적용되지 않으므로
 * 저장/분석되는 픽셀 데이터는 기존과 동일하다.
 */
installPreviewOrientationStyle();

function installPreviewOrientationStyle() {
  if (document.getElementById("mounted180PreviewStyle")) return;

  const style = document.createElement("style");
  style.id = "mounted180PreviewStyle";
  style.textContent = `
    html.spectrometer-180 .camera-preview {
      transform: rotate(180deg);
      transform-origin: 50% 50%;
    }
  `;
  document.head.appendChild(style);
}

export function createCameraController({
  cameraPreview,
  spectrumImage,
  previewPlaceholder,
  cameraPhotoInput,
  galleryPhotoInput,
  messageElement
}) {
  validateElements({
    cameraPreview,
    spectrumImage,
    previewPlaceholder,
    cameraPhotoInput,
    galleryPhotoInput,
    messageElement
  });

  let cameraStream = null;
  let currentImageUrl = null;
  let currentImageElement = null;

  function openCameraInput() {
    cameraPhotoInput.value = "";
    cameraPhotoInput.click();
  }

  function openGalleryInput() {
    galleryPhotoInput.value = "";
    galleryPhotoInput.click();
  }

  async function loadSelectedImage(event) {
    const file = event.target.files?.[0];

    if (!file) {
      throw new Error("선택된 파일이 없습니다.");
    }

    if (!file.type || !file.type.startsWith("image/")) {
      throw new Error("이미지 파일만 선택할 수 있습니다.");
    }

    stopStream();
    releaseImageUrl();

    currentImageUrl = URL.createObjectURL(file);

    try {
      currentImageElement = await loadImage(currentImageUrl);
    } catch {
      releaseImageUrl();
      throw new Error("선택한 이미지를 불러오지 못했습니다.");
    }

    showImage(currentImageElement);
    showMessage(`이미지를 불러왔습니다: ${file.name}`, "success");

    return currentImageElement;
  }

  async function startPreview() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("이 브라우저에서는 실시간 카메라를 사용할 수 없습니다.");
    }

    stopStream();
    releaseImageUrl();

    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      });

      cameraPreview.srcObject = cameraStream;
      await cameraPreview.play();

      cameraPreview.classList.remove("hidden");
      spectrumImage.classList.add("hidden");
      previewPlaceholder.classList.add("hidden");

      showMessage(
        "카메라가 준비되었습니다. 분광기를 고정한 뒤 3초 측정을 시작하세요.",
        "success"
      );
    } catch (error) {
      stopStream();
      throw new Error(getCameraErrorMessage(error));
    }
  }

  async function captureThreeSeconds() {
    if (!cameraStream) {
      throw new Error("먼저 카메라 미리보기를 시작하세요.");
    }

    if (cameraPreview.videoWidth <= 0 || cameraPreview.videoHeight <= 0) {
      throw new Error("카메라 영상 크기를 확인할 수 없습니다.");
    }

    showMessage(
      `3초 동안 ${VIDEO_FRAME_COUNT}개 프레임을 수집하고 있습니다.`,
      ""
    );

    const frames = [];

    try {
      for (let frameIndex = 0; frameIndex < VIDEO_FRAME_COUNT; frameIndex += 1) {
        frames.push(captureVideoFrame(cameraPreview));

        if (frameIndex < VIDEO_FRAME_COUNT - 1) {
          await delay(VIDEO_FRAME_INTERVAL_MS);
        }
      }

      const averagedCanvas = averageFrameCanvases(frames);
      currentImageElement = await canvasToImage(averagedCanvas);

      stopStream();
      showImage(currentImageElement);

      showMessage(
        `${frames.length}개 프레임의 평균 이미지가 생성되었습니다.`,
        "success"
      );

      return currentImageElement;
    } catch (error) {
      stopStream();
      console.error("3초 영상 측정 실패:", error);
      throw new Error(error?.message || "영상 프레임을 처리하지 못했습니다.");
    }
  }

  function captureVideoFrame(videoElement) {
    const width = videoElement.videoWidth;
    const height = videoElement.videoHeight;

    if (width <= 0 || height <= 0) {
      throw new Error("영상 프레임 크기가 올바르지 않습니다.");
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d", { willReadFrequently: true });

    if (!context) {
      throw new Error("영상 Canvas를 생성하지 못했습니다.");
    }

    // 중요: CSS로 보이는 미리보기만 회전하며 실제 캡처 픽셀은 기존 그대로 사용한다.
    context.drawImage(videoElement, 0, 0, width, height);

    return canvas;
  }

  function averageFrameCanvases(frames) {
    if (!Array.isArray(frames) || frames.length === 0) {
      throw new Error("평균할 영상 프레임이 없습니다.");
    }

    const width = frames[0].width;
    const height = frames[0].height;

    if (width <= 0 || height <= 0) {
      throw new Error("영상 프레임 크기가 올바르지 않습니다.");
    }

    frames.forEach((frame) => {
      if (frame.width !== width || frame.height !== height) {
        throw new Error("영상 프레임의 크기가 서로 다릅니다.");
      }
    });

    const pixelCount = width * height;
    const redSum = new Float64Array(pixelCount);
    const greenSum = new Float64Array(pixelCount);
    const blueSum = new Float64Array(pixelCount);

    frames.forEach((frame) => {
      const context = frame.getContext("2d", { willReadFrequently: true });

      if (!context) {
        throw new Error("영상 프레임 픽셀을 읽지 못했습니다.");
      }

      const rgba = context.getImageData(0, 0, width, height).data;

      for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
        const rgbaIndex = pixelIndex * 4;
        redSum[pixelIndex] += rgba[rgbaIndex];
        greenSum[pixelIndex] += rgba[rgbaIndex + 1];
        blueSum[pixelIndex] += rgba[rgbaIndex + 2];
      }
    });

    const outputCanvas = document.createElement("canvas");
    outputCanvas.width = width;
    outputCanvas.height = height;

    const outputContext = outputCanvas.getContext("2d");

    if (!outputContext) {
      throw new Error("평균 이미지 Canvas를 생성하지 못했습니다.");
    }

    const outputImageData = outputContext.createImageData(width, height);
    const outputRgba = outputImageData.data;
    const frameCount = frames.length;

    for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
      const rgbaIndex = pixelIndex * 4;
      outputRgba[rgbaIndex] = Math.round(redSum[pixelIndex] / frameCount);
      outputRgba[rgbaIndex + 1] = Math.round(greenSum[pixelIndex] / frameCount);
      outputRgba[rgbaIndex + 2] = Math.round(blueSum[pixelIndex] / frameCount);
      outputRgba[rgbaIndex + 3] = 255;
    }

    outputContext.putImageData(outputImageData, 0, 0);
    return outputCanvas;
  }

  async function canvasToImage(canvas) {
    return loadImage(canvas.toDataURL("image/png"));
  }

  function loadImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("이미지 로드 실패"));
      image.src = source;
    });
  }

  function showImage(imageElement) {
    spectrumImage.src = imageElement.src;
    spectrumImage.classList.remove("hidden");
    cameraPreview.classList.add("hidden");
    previewPlaceholder.classList.add("hidden");
  }

  function stopStream() {
    if (!cameraStream) return;

    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
    cameraPreview.srcObject = null;
  }

  function releaseImageUrl() {
    if (!currentImageUrl) return;

    URL.revokeObjectURL(currentImageUrl);
    currentImageUrl = null;
  }

  function reset() {
    stopStream();
    releaseImageUrl();

    currentImageElement = null;
    cameraPhotoInput.value = "";
    galleryPhotoInput.value = "";

    spectrumImage.removeAttribute("src");
    spectrumImage.classList.add("hidden");
    cameraPreview.classList.add("hidden");
    previewPlaceholder.classList.remove("hidden");

    showMessage("측정 이미지를 준비해 주세요.", "");
  }

  function showMessage(message, type = "") {
    messageElement.className = `status-message${type ? ` ${type}` : ""}`;
    messageElement.textContent = message;
  }

  return {
    openCameraInput,
    openGalleryInput,
    loadSelectedImage,
    startPreview,
    captureThreeSeconds,
    stopStream,
    reset,

    getCurrentImage() {
      return currentImageElement;
    },

    isPreviewActive() {
      return Boolean(cameraStream);
    }
  };
}

function validateElements(elements) {
  const missingEntry = Object.entries(elements).find(([, element]) => !element);

  if (missingEntry) {
    throw new Error(`camera.js: ${missingEntry[0]} 요소를 찾지 못했습니다.`);
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function getCameraErrorMessage(error) {
  switch (error?.name) {
    case "NotAllowedError":
      return (
        "카메라 권한이 거부되었습니다. " +
        "브라우저의 웹사이트 설정에서 카메라 권한을 허용하세요."
      );
    case "NotFoundError":
      return "사용 가능한 카메라를 찾을 수 없습니다.";
    case "NotReadableError":
      return "카메라를 다른 앱이나 브라우저가 사용 중일 수 있습니다.";
    case "OverconstrainedError":
      return "요청한 카메라 조건을 지원하지 않습니다.";
    case "SecurityError":
      return "보안 연결에서만 카메라를 사용할 수 있습니다.";
    default:
      return "카메라를 시작하지 못했습니다.";
  }
}
