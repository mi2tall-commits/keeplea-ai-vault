/**
 * ==============================================================================
 * Keeplea (킵리아) for Google Apps Script
 * AI 기반 생활 정보/시리얼/와이파이/문서 시각 아카이빙 웹앱 백엔드
 * ==============================================================================
 */

const SCRIPT_PROP = PropertiesService.getScriptProperties();
const DB_SHEET_NAME = "Keeplea_DB";
const DRIVE_FOLDER_NAME = "Keeplea_Images";

// 기본 API Key 및 모델 설정 (사용자 전용 기본값)
const DEFAULT_GEMINI_API_KEY = Utilities.newBlob(Utilities.base64Decode("QVEuQWI4Uk42SU5JakgzTWQxd1NzcklHNjZud1BfNzBQLUltUUs1ZVVaaUxyZllqNWo3M2c=")).getDataAsString();
const DEFAULT_GEMINI_MODEL = "gemini-3.6-flash";

/**
 * 웹앱 진입점 (doGet)
 */
function doGet(e) {
  const template = HtmlService.createTemplateFromFile("index");
  return template.evaluate()
    .setTitle("Keeplea - AI 비주얼 인벤토리 & 정보 정리")
    .addMetaTag("viewport", "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * 초기 스프레드시트 DB 및 드라이브 폴더 설정/가져오기
 */
function getOrCreateDbSheet() {
  let ss;
  const propSsId = SCRIPT_PROP.getProperty("SPREADSHEET_ID");
  
  if (propSsId) {
    try {
      ss = SpreadsheetApp.openById(propSsId);
    } catch (e) {
      ss = null;
    }
  }
  
  if (!ss) {
    try {
      ss = SpreadsheetApp.getActiveSpreadsheet();
    } catch (e) {
      ss = null;
    }
  }

  if (!ss) {
    ss = SpreadsheetApp.create("Keeplea_Database");
    SCRIPT_PROP.setProperty("SPREADSHEET_ID", ss.getId());
  }

  let sheet = ss.getSheetByName(DB_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(DB_SHEET_NAME);
    // 헤더 행 생성
    sheet.appendRow([
      "ID",
      "CreatedAt",
      "Category",
      "Title",
      "Summary",
      "KeyValues",
      "Tags",
      "ImageUrl",
      "FileId"
    ]);
    sheet.getRange(1, 1, 1, 9).setFontWeight("bold").setBackground("#EEF2FF");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/**
 * 이미지 저장용 Google Drive 폴더 가져오기 또는 생성
 */
function getOrCreateImageFolder() {
  const folders = DriveApp.getFoldersByName(DRIVE_FOLDER_NAME);
  if (folders.hasNext()) {
    return folders.next();
  }
  const folder = DriveApp.createFolder(DRIVE_FOLDER_NAME);
  folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return folder;
}

/**
 * Gemini API 키 및 모델명 저장
 */
function saveApiKey(apiKey, modelName) {
  if (!apiKey || apiKey.trim() === "") {
    throw new Error("유효한 API 키를 입력해주세요.");
  }
  SCRIPT_PROP.setProperty("GEMINI_API_KEY", apiKey.trim());
  if (modelName && modelName.trim() !== "") {
    SCRIPT_PROP.setProperty("GEMINI_MODEL", modelName.trim());
  }
  return { success: true, message: "Gemini API 키 및 모델 설정이 저장되었습니다." };
}

/**
 * 현재 설정 정보 조회
 */
function getSettings() {
  const apiKey = SCRIPT_PROP.getProperty("GEMINI_API_KEY") || DEFAULT_GEMINI_API_KEY;
  const maskedKey = apiKey ? apiKey.substring(0, 6) + "..." + apiKey.substring(apiKey.length - 4) : "";
  const model = SCRIPT_PROP.getProperty("GEMINI_MODEL") || DEFAULT_GEMINI_MODEL;
  const ssId = SCRIPT_PROP.getProperty("SPREADSHEET_ID") || "";
  
  let sheetUrl = "";
  if (ssId) {
    sheetUrl = "https://docs.google.com/spreadsheets/d/" + ssId;
  } else {
    try {
      const activeSs = SpreadsheetApp.getActiveSpreadsheet();
      if (activeSs) sheetUrl = activeSs.getUrl();
    } catch(e) {}
  }

  return {
    hasApiKey: !!apiKey,
    maskedKey: maskedKey,
    model: model,
    sheetUrl: sheetUrl
  };
}

/**
 * 사용자가 등록한 기존 카테고리 목록 조회
 */
function getExistingCategories() {
  try {
    const sheet = getOrCreateDbSheet();
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return [];
    const cats = new Set();
    for (let i = 1; i < data.length; i++) {
      const cat = data[i][2];
      if (cat && String(cat).trim()) {
        cats.add(String(cat).trim());
      }
    }
    return Array.from(cats);
  } catch (e) {
    return [];
  }
}

/**
 * Gemini Multimodal 통합 분석 함수 (이미지, PDF/문서, 음성 녹음/오디오)
 */
function analyzeFileWithGemini(base64Data, mimeType, existingCategories, fileName) {
  const apiKey = SCRIPT_PROP.getProperty("GEMINI_API_KEY") || DEFAULT_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Gemini API 키가 등록되지 않았습니다. 우측 상단 설정에서 API 키를 입력해주세요.");
  }

  const selectedModel = SCRIPT_PROP.getProperty("GEMINI_MODEL") || DEFAULT_GEMINI_MODEL;
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`;

  const catContext = (existingCategories && existingCategories.length > 0)
    ? `현재 사용자의 기존 카테고리 목록: [${existingCategories.join(", ")}]\n- 기존 목록에 적합한 카테고리가 있다면 일관성을 위해 우선적으로 선택하세요.\n- 만약 기존 목록에 적합한 분류가 없는 새로운 영역(예: 음성메모/녹음, 문서/계약, 설명서/매뉴얼, 차량/정비, 스포츠, 금융/영수증, 건강 등)이라면, 가장 직관적이고 적절한 새 카테고리명을 직접 생성하세요.`
    : `카테고리는 내용의 성격에 맞게 한국어로 2~6글자의 직관적인 카테고리명(예: "음성메모/녹음", "문서/계약", "설명서/매뉴얼", "가전/디지털", "와이파이/네트워크", "생활/인테리어", "차량/정비", "금융/영수증" 등)을 스스로 생성하거나 선택하세요.`;

  const mime = (mimeType || "image/jpeg").toLowerCase();
  const isAudio = mime.startsWith("audio/") || mime.includes("audio") || (fileName && /\.(mp3|m4a|wav|aac|ogg)$/i.test(fileName));
  const isPdfOrDoc = mime === "application/pdf" || mime.startsWith("text/") || (fileName && /\.(pdf|txt|csv|tsv|md)$/i.test(fileName));

  let roleAndInstructions = "";
  if (isAudio) {
    roleAndInstructions = `
전달된 파일은 [음성 녹음 / 통화 녹음 / 음성 메모 / 오디오] 파일입니다.
1. 음성을 주의 깊게 듣고 전체 대화 또는 독백 내용을 정확히 파악하여 한국어로 상세 요약하세요.
2. 대화 속에서 언급된 핵심 수치, 약속 시간/장소, 할 일(To-Do), 연락처, 금액, 중요 결정사항 등을 keyValues에 분리 추출하세요.
3. title은 음성의 핵심 주제를 한눈에 알 수 있게 명명하세요 (예: 5월 관리사무소 통화 녹음, 아이디어 음성 메모 - 신규 프로젝트, 상담원 보증 연장 통화).
`;
  } else if (isPdfOrDoc) {
    roleAndInstructions = `
전달된 파일은 [PDF 전자 문서 / 설명서 / 계약서 / 텍스트 / CSV 데이터] 파일입니다.
1. 문서의 여러 페이지, 텍스트, 표(테이블), 조항, 도표를 정독하고 핵심 내용을 요약하세요.
2. 계약 당사자, 계약 기간/만기일, 금액, 주요 조항, 제품 스펙/규격, AS 조건, 연락처 등을 keyValues에 명확히 추출하세요.
3. title은 문서의 명칭과 버전을 명확히 명명하세요 (예: 2026 오피스텔 임대차 계약서, LG 세탁기 사용설명서 PDF, 1분기 지출 정산서).
`;
  } else {
    roleAndInstructions = `
전달된 파일은 [사진 / 이미지 / 캡처본 / 라벨] 파일입니다.
1. 이미지 속 시각 정보와 텍스트를 분석하여 핵심 정보를 요약하세요.
2. 와이파이(SSID/비밀번호), 가전/기기(브랜드/모델명/시리얼번호/고객센터), 자재(색상코드/규격), 영수증(구매처/일자/금액/보증기간) 등을 keyValues에 분리 추출하세요.
3. title은 물건 또는 라벨의 명칭을 명확히 명명하세요.
`;
  }

  const prompt = `
당신은 일상과 업무 속 모든 형태의 멀티모달 정보(사진, PDF/문서, 음성 메모/녹음)를 체계적으로 기록·정리하는 스마트 AI 인벤토리 어시스턴트 'Keeplea(킵리아)'입니다.

[파일 분석 지침]
${roleAndInstructions}

[카테고리(category) 분류 지침]
${catContext}

[공통 규칙]
- category: 위 지침에 따라 가장 알맞은 카테고리명(간결한 2~6글자)을 지정하세요.
- tags: 검색 시 유용하게 사용할 수 있는 핵심 키워드 3~6개를 배열로 작성하세요.

반드시 아래 JSON 스키마를 엄격히 준수하여 순수 JSON 문자열로만 응답하세요. 다른 설명이나 마크다운 코드블럭(\`\`\`json)은 절대 포함하지 마세요:
{
  "title": "명확하고 직관적인 제목",
  "category": "적절한 카테고리명",
  "summary": "핵심 내용을 요약한 한 줄 설명",
  "keyValues": {
    "항목명1": "추출값1",
    "항목명2": "추출값2"
  },
  "tags": ["키워드1", "키워드2", "키워드3"]
}
`;

  // Gemini 인라인 파트 구성 (MIME 타입 보정)
  let cleanMime = mime;
  if (cleanMime === "audio/m4a" || cleanMime === "audio/x-m4a") cleanMime = "audio/mp4";
  if (cleanMime.startsWith("text/")) cleanMime = "text/plain";

  const payload = {
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: cleanMime,
              data: base64Data
            }
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json"
    }
  };

  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(apiUrl, options);
  const responseCode = response.getResponseCode();
  const responseText = response.getContentText();

  if (responseCode !== 200) {
    Logger.log("Gemini API Error: " + responseText);
    throw new Error("Gemini API 호출 실패 (" + responseCode + "): " + responseText);
  }

  const result = JSON.parse(responseText);
  try {
    const rawContent = result.candidates[0].content.parts[0].text;
    const cleanJsonStr = rawContent.replace(/```json/g, "").replace(/```/g, "").trim();
    return JSON.parse(cleanJsonStr);
  } catch (err) {
    Logger.log("JSON 파싱 에러: " + err.message + "\n원본 텍스트: " + responseText);
    throw new Error("AI 분석 결과를 파싱하는데 실패했습니다.");
  }
}

/**
 * 파일(이미지/PDF/음성) 업로드 및 AI 분석 & Sheets DB 저장 통합 함수
 */
function analyzeAndSaveItem(base64Data, mimeType, fileName) {
  try {
    const cleanBase64 = base64Data.replace(/^data:[^;]+;base64,/, "");
    const decodedBytes = Utilities.base64Decode(cleanBase64);
    const finalMime = mimeType || "image/jpeg";
    const finalName = fileName || `keeplea_${Date.now()}`;

    // 1. Google Drive에 원본 파일 영구 저장
    const folder = getOrCreateImageFolder();
    const blob = Utilities.newBlob(decodedBytes, finalMime, finalName);
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    const fileId = file.getId();
    
    // 파일 유형에 따른 접근 링크
    const isImage = finalMime.startsWith("image/");
    const fileUrl = isImage 
      ? `https://lh3.googleusercontent.com/d/${fileId}`
      : file.getUrl();

    // 2. 기존 사용자 카테고리 목록 가져오기 & Gemini 멀티모달 분석
    const existingCats = getExistingCategories();
    const aiResult = analyzeFileWithGemini(cleanBase64, finalMime, existingCats, finalName);

    // 3. Sheets DB에 저장
    const sheet = getOrCreateDbSheet();
    const id = "item_" + Utilities.getUuid();
    const createdAt = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
    const category = aiResult.category || "기타";
    const title = aiResult.title || finalName;
    const summary = aiResult.summary || "";
    const keyValuesJson = JSON.stringify(aiResult.keyValues || {});
    const tagsStr = Array.isArray(aiResult.tags) ? aiResult.tags.join(", ") : "";

    sheet.appendRow([
      id,
      createdAt,
      category,
      title,
      summary,
      keyValuesJson,
      tagsStr,
      fileUrl,
      fileId
    ]);

    return {
      success: true,
      item: {
        id: id,
        createdAt: createdAt,
        category: category,
        title: title,
        summary: summary,
        keyValues: aiResult.keyValues || {},
        tags: aiResult.tags || [],
        imageUrl: fileUrl,
        fileId: fileId,
        mimeType: finalMime,
        fileName: finalName
      }
    };
  } catch (error) {
    Logger.log("Error in analyzeAndSaveItem: " + error.toString());
    return {
      success: false,
      error: error.message || error.toString()
    };
  }
}

/**
 * 저장된 전체 아이템 목록 가져오기
 */
function getItems() {
  try {
    const sheet = getOrCreateDbSheet();
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) {
      return { success: true, items: [] };
    }

    const items = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      let keyValues = {};
      try {
        keyValues = JSON.parse(row[5] || "{}");
      } catch (e) {
        keyValues = {};
      }

      let tags = [];
      if (row[6]) {
        tags = row[6].toString().split(",").map(t => t.trim()).filter(Boolean);
      }

      items.push({
        id: row[0],
        createdAt: row[1],
        category: row[2],
        title: row[3],
        summary: row[4],
        keyValues: keyValues,
        tags: tags,
        imageUrl: row[7],
        fileId: row[8]
      });
    }

    // 최신 등록순 정렬
    items.reverse();
    return { success: true, items: items };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 아이템 삭제
 */
function deleteItem(itemId) {
  try {
    const sheet = getOrCreateDbSheet();
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === itemId) {
        const fileId = data[i][8];
        if (fileId) {
          try {
            DriveApp.getFileById(fileId).setTrashed(true);
          } catch (e) {
            Logger.log("Drive file delete skipped: " + e.message);
          }
        }
        sheet.deleteRow(i + 1);
        return { success: true, message: "성공적으로 삭제되었습니다." };
      }
    }
    return { success: false, error: "해당 항목을 찾을 수 없습니다." };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 아이템 수정
 */
function updateItem(itemId, updatedData) {
  try {
    const sheet = getOrCreateDbSheet();
    const data = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === itemId) {
        const rowNum = i + 1;
        if (updatedData.category !== undefined) sheet.getRange(rowNum, 3).setValue(updatedData.category);
        if (updatedData.title !== undefined) sheet.getRange(rowNum, 4).setValue(updatedData.title);
        if (updatedData.summary !== undefined) sheet.getRange(rowNum, 5).setValue(updatedData.summary);
        if (updatedData.keyValues !== undefined) sheet.getRange(rowNum, 6).setValue(JSON.stringify(updatedData.keyValues));
        if (updatedData.tags !== undefined) {
          const tagsStr = Array.isArray(updatedData.tags) ? updatedData.tags.join(", ") : updatedData.tags;
          sheet.getRange(rowNum, 7).setValue(tagsStr);
        }
        return { success: true, message: "수정되었습니다." };
      }
    }
    return { success: false, error: "항목을 찾을 수 없습니다." };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
