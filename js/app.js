"use strict";
import { createSession, getCurrentMeasurement, addMeasurement, advanceMeasurement, saveSession, clearSavedSession, getNextUnknownNumber, saveReference, getLatestReference, getReferenceHistory, getReferenceAgeMs, isReferenceExpired, markLightRestarted, REFERENCE_VALID_MS } from "./session.js";
import { createCameraController } from "./camera.js";
import { createRoiController } from "./roi.js";
import { extractSpectrumFromImage } from "./analysis.js";
import { drawRgbSpectrum, drawGraySpectrum } from "./chart.js";
import { downloadSpectrumCsv } from "./export.js";

const $ = id => document.getElementById(id);
const screens={setup:$("setupScreen"),measurement:$("measurementScreen"),roi:$("roiScreen"),analysis:$("analysisScreen")};
const state={selectedMode:"photo",session:null,imageElement:null,analysisResult:null,lastClassification:null};
const camera=createCameraController({cameraPreview:$("cameraPreview"),spectrumImage:$("spectrumImage"),previewPlaceholder:$("previewPlaceholder"),cameraPhotoInput:$("cameraPhotoInput"),galleryPhotoInput:$("galleryPhotoInput"),messageElement:$("measurementMessage")});
const roiController=createRoiController({canvas:$("roiCanvas"),widthInput:$("roiWidthInput"),heightInput:$("roiHeightInput"),lockButton:$("lockRoiSizeBtn"),confirmButton:$("confirmRoiBtn"),messageElement:$("roiMessage"),xValue:$("roiXValue"),yValue:$("roiYValue"),widthValue:$("roiWidthValue"),heightValue:$("roiHeightValue"),sizeSummary:$("roiSizeSummary")});

init();
function init(){bind();selectMode("photo");refreshReferencePanel();showScreen("setup");}
function bind(){
  $("photoModeBtn").onclick=()=>selectMode("photo"); $("videoModeBtn").onclick=()=>selectMode("video");
  $("startSessionBtn").onclick=()=>startSession("reference"); $("startUnknownBtn").onclick=()=>startSession("unknown");
  $("lightRestartBtn").onclick=()=>{ if(confirm("광원을 껐다 다시 켰다면 기존 기준의 재측정을 권장합니다. 상태를 표시할까요?")){markLightRestarted();refreshReferencePanel();} };
  $("cameraPhotoBtn").onclick=()=>camera.openCameraInput(); $("galleryPhotoBtn").onclick=()=>camera.openGalleryInput();
  $("cameraPhotoInput").onchange=handlePhoto; $("galleryPhotoInput").onchange=handlePhoto;
  $("startVideoBtn").onclick=async()=>{try{await camera.startPreview();$("recordThreeSecondsBtn").disabled=false;}catch(e){msg($("measurementMessage"),e.message,"error")}};
  $("recordThreeSecondsBtn").onclick=async()=>{try{state.imageElement=await camera.captureThreeSeconds();$("continueToRoiBtn").disabled=false;}catch(e){msg($("measurementMessage"),e.message,"error")}};
  $("continueToRoiBtn").onclick=openRoi; $("cancelSessionBtn").onclick=returnSetup; $("returnToMeasurementBtn").onclick=openMeasurement;
  $("lockRoiSizeBtn").onclick=()=>roiController.lockSize(); $("confirmRoiBtn").onclick=analyze;
  $("returnToRoiBtn").onclick=()=>{showScreen("roi");roiController.draw();};
  $("newMeasurementBtn").onclick=saveAndNext; $("downloadRawCsvBtn").onclick=downloadCsv;
  window.addEventListener("resize",()=>{if(!screens.roi.classList.contains("hidden"))roiController.draw();});
}
function selectMode(mode){state.selectedMode=mode;const p=mode==="photo";$("photoModeBtn").classList.toggle("selected",p);$("videoModeBtn").classList.toggle("selected",!p);$("selectedModeText").textContent=p?"사진 모드":"3초 영상 모드";}
function startSession(type){
  const ref=getLatestReference();
  if(type==="unknown"){
    if(!ref){msg($("statusMessage"),"먼저 기준 측정(Blank + 5종)을 완료하세요.","error");return;}
    const warnings=[]; if(isReferenceExpired(ref)) warnings.push("기준 측정 후 4시간이 지났습니다."); if(ref.lightRestartedAt) warnings.push("광원이 재가동된 것으로 표시되어 있습니다.");
    if(warnings.length && !confirm(`${warnings.join("\n")}\n정확도를 위해 기준 재측정을 권장합니다. 기존 기준으로 계속할까요?`)) return;
  }
  state.session=createSession({projectName:$("projectName").value,sessionName:$("sessionName").value,lightSource:$("lightSource").value,measurementMode:state.selectedMode,sessionType:type,unknownNumber:type==="unknown"?getNextUnknownNumber():null});
  saveSession(state.session);openMeasurement();
}
function refreshReferencePanel(){
  const ref=getLatestReference(), el=$("referenceStatus");
  if(!ref){el.innerHTML='<strong>기준 데이터 없음</strong><span>먼저 기준 측정을 완료하세요.</span>';$("startUnknownBtn").disabled=true;return;}
  $("startUnknownBtn").disabled=false; const age=getReferenceAgeMs(ref), remain=Math.max(0,REFERENCE_VALID_MS-age), expired=age>REFERENCE_VALID_MS;
  const fmt=ms=>`${Math.floor(ms/3600000)}시간 ${Math.floor((ms%3600000)/60000)}분`;
  const light=ref.lightRestartedAt?' · ⚠ 광원 재가동 표시됨':'';
  const roiInfo=ref.roiSize?` · ROI ${ref.roiSize.width}×${ref.roiSize.height}px 고정`:'';
  el.innerHTML=`<strong>${expired?'⚠ 유효 권장시간 초과':'✓ 기준 사용 가능'}</strong><span>측정 ${fmt(age)} 경과${expired?'':' · 남은 권장시간 '+fmt(remain)}${light}</span><small>${new Date(ref.createdAt).toLocaleString('ko-KR')}${roiInfo} · 이전 기준 ${Math.max(0,getReferenceHistory().length-1)}개 보관</small>`;
}
async function handlePhoto(e){try{state.imageElement=await camera.loadSelectedImage(e);$("continueToRoiBtn").disabled=false;}catch(err){msg($("measurementMessage"),err.message,"error")}}
function openMeasurement(){camera.reset();state.imageElement=null;state.analysisResult=null;const m=getCurrentMeasurement(state.session);$("measurementTitle").textContent=`${m.displayName} 측정`;$("measurementInstruction").textContent=m.instruction;$("measurementStep").textContent=`${m.stepNumber} / ${m.totalSteps}`;$("measurementRepeat").textContent=`${m.repeatNumber} / 3회`;$("photoControls").classList.toggle("hidden",state.session.measurementMode!=="photo");$("videoControls").classList.toggle("hidden",state.session.measurementMode==="photo");$("continueToRoiBtn").disabled=true;showScreen("measurement");}
function openRoi(){
  if(!state.imageElement)return;
  roiController.setImage(state.imageElement);
  let fixedSize=null;
  if(state.session?.sessionType==="reference" && state.session.roiSize){
    fixedSize=state.session.roiSize;
  }else if(state.session?.sessionType==="unknown"){
    fixedSize=getLatestReference()?.roiSize || null;
  }
  roiController.reset({fixedSize});
  showScreen("roi");
  roiController.draw();
}
function analyze(){
  try{
    const roi=roiController.getRoi();
    if(state.session?.sessionType==="reference" && !state.session.roiSize){
      state.session.roiSize={width:roi.width,height:roi.height};
      saveSession(state.session);
    }
    state.analysisResult=extractSpectrumFromImage(state.imageElement,roi,6);
    openAnalysis();
  }catch(e){msg($("roiMessage"),e.message,"error")}
}
function openAnalysis(){const r=state.analysisResult, s=r.summary;$("analysisDataLength").textContent=s.dataLength;$("analysisRoiX").textContent=r.roi.x;$("analysisRoiY").textContent=r.roi.y;$("analysisRoiWidth").textContent=r.roi.width;$("analysisRoiHeight").textContent=r.roi.height;$("analysisPeakPixel").textContent=s.peakPixel;$("analysisPeakIntensity").textContent=Number(s.peakIntensity).toFixed(3);$("analysisMinimumPixel").textContent=s.minimumPixel;$("analysisIntensityRange").textContent=Number(s.intensityRange).toFixed(3);$("classificationCard").classList.add("hidden");$("newMeasurementBtn").textContent="측정 저장 후 다음";showScreen("analysis");drawRgbSpectrum($("rgbSpectrumCanvas"),r.spectrum);drawGraySpectrum($("graySpectrumCanvas"),r.spectrum);}
function saveAndNext(){
  if(!state.analysisResult)return; addMeasurement(state.session,state.analysisResult); const completed=advanceMeasurement(state.session); saveSession(state.session);
  if(!completed){openMeasurement();return;}
  if(state.session.sessionType==="reference"){
    const ref=buildReference(state.session);saveReference(ref);clearSavedSession();alert("기준 측정이 완료되었습니다. 이 기준은 4시간 동안 사용을 권장합니다.");returnSetup();
  }
  state.lastClassification=classifyUnknown(state.session,getLatestReference());renderClassification(state.lastClassification);clearSavedSession();$("newMeasurementBtn").textContent="새 시료 분석하기";$("newMeasurementBtn").onclick=()=>{returnSetup();startSession("unknown")};
}
function avgArrays(records,key){const arrs=records.map(r=>r.spectrum[key]);const n=Math.min(...arrs.map(a=>a.length));return Array.from({length:n},(_,i)=>arrs.reduce((sum,a)=>sum+Number(a[i]),0)/arrs.length);}
function relativeAtt(sample,blank){const n=Math.min(sample.length,blank.length);return Array.from({length:n},(_,i)=>{const b=blank[i];return Math.abs(b)<1e-9?0:1-sample[i]/b;});}
function buildReference(session){const groups={};for(const name of ["Blank","PP","PET","PS","PA","PC"])groups[name]=session.measurements.filter(r=>r.sampleType===name);const blank=avgArrays(groups.Blank,"grayMean"), spectra={};for(const p of ["PP","PET","PS","PA","PC"])spectra[p]=relativeAtt(avgArrays(groups[p],"grayMean"),blank);return {id:`REF-${Date.now()}`,createdAt:new Date().toISOString(),projectName:session.projectName,sessionName:session.sessionName,lightSource:session.lightSource,measurementMode:session.measurementMode,blank,spectra,roiSize:session.roiSize?{...session.roiSize}:null,repeatCount:3,lightRestartedAt:null};}
function euclidean(a,b){const n=Math.min(a.length,b.length);let ss=0;for(let i=0;i<n;i++){const d=a[i]-b[i];ss+=d*d;}return Math.sqrt(ss/n);}
function classifyUnknown(session,ref){const blank=ref.blank, unk=relativeAtt(avgArrays(session.measurements,"grayMean"),blank);const ranks=Object.entries(ref.spectra).map(([material,s])=>({material,distance:euclidean(unk,s)})).sort((a,b)=>a.distance-b.distance);const max=Math.max(...ranks.map(x=>x.distance)), min=Math.min(...ranks.map(x=>x.distance));ranks.forEach((x,i)=>{x.rank=i+1;x.bar=max===min?100:Math.round(28+72*(max-x.distance)/(max-min));});return {sample:`UNKNOWN-${String(session.unknownNumber).padStart(3,"0")}`,predicted:ranks[0].material,ranks};}
function renderClassification(c){$("classificationCard").classList.remove("hidden");$("predictionMaterial").textContent=c.predicted;$("predictionSample").textContent=c.sample;$("similarityRanking").innerHTML=c.ranks.map(x=>`<div class="rank-row ${x.rank===1?'winner':''}"><span class="rank-badge">${x.rank}</span><strong>${x.material}</strong><div class="rank-track"><span style="width:${x.bar}%"></span></div><small>d=${x.distance.toFixed(4)}</small></div>`).join("");$("classificationNote").textContent="막대는 Euclidean distance의 상대적 순위를 한눈에 보기 위한 표시입니다. 실제 판정은 distance가 가장 작은 재질을 선택합니다.";}
function downloadCsv(){if(!state.analysisResult)return;const m=getCurrentMeasurement(state.session);downloadSpectrumCsv({analysisResult:state.analysisResult,sessionName:state.session.sessionName,sampleName:m.displayName,repeatNumber:m.repeatNumber});}
function showScreen(name){Object.entries(screens).forEach(([n,e])=>e.classList.toggle("hidden",n!==name));window.scrollTo({top:0,behavior:"smooth"});}
function returnSetup(){camera.reset();state.session=null;state.imageElement=null;state.analysisResult=null;refreshReferencePanel();showScreen("setup");$("newMeasurementBtn").onclick=saveAndNext;}
function msg(el,text,type=""){el.className=`status-message${type?' '+type:''}`;el.textContent=text;}
