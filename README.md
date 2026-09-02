# 🗂️ Keeplea (킵리아) - AI 멀티모달 시각 인벤토리 & 스마트 볼트

> **사진 한 장, PDF 계약서 문서, 음성 메모 녹음으로 모든 것을 깔끔하게 기억하고 정리하는 개인용 AI 인벤토리 웹앱**

---

## 🌟 주요 기능 (Key Features)

1. **📷 실시간 카메라 촬영 및 0.05초 초고속 압축 (Canvas Client Compression)**
   - 스마트폰에서 촬영한 대용량 사진(10MB)을 브라우저에서 0.05초 만에 150KB 수준으로 스마트 리사이징 및 압축
   - 모바일 환경에서도 1~2초 만에 초고속 AI 시각 분석 완료

2. **📄 PDF / 전자 문서 / CSV 정독 및 메타데이터 추출**
   - 가전제품 사용설명서, 전월세 계약서, 영수증, 보증서, CSV 표 데이터 업로드 지원
   - Gemini 3.6이 여러 페이지의 문서 및 조항을 분석하여 핵심 요약, 만기일, 금액, 당사자, AS 번호 분리 추출

3. **🎙️ 음성 메모 / 통화 녹음 자동 전사 (STT) & To-Do 추출**
   - M4A, MP3, WAV, AAC 음성 파일 업로드 지원
   - Gemini 3.6 네이티브 오디오 인지 엔진이 음성을 듣고 한국어 받아쓰기 + 핵심 결정사항 및 할 일 목록 자동 생성

4. **🏷️ 능동형 스마트 카테고리 & 실시간 동적 탭**
   - 사용자가 등록하는 물건에 맞춰 Gemini가 능동적으로 카테고리를 자동 생성 및 분류 (가전/디지털, 와이파이/네트워크, 문서/계약, 음성메모/회의, 차량/정비, 와인/미식, 생활/인테리어 등)
   - 카테고리별 실시간 아이콘 뱃지 및 아이템 개수 카운트 제공

5. **📶 손님용 와이파이 QR 코드 원클릭 생성**
   - 공유기 라벨 사진을 찍으면 SSID와 비밀번호를 자동 인식
   - 원클릭으로 QR 코드를 화면에 띄워 손님이 카메라로 스캔만 하면 비번 입력 없이 즉시 연결

6. **🔒 개인정보 보호 & 오프라인/온라인 하이브리드 지원**
   - **GitHub Pages (클라이언트 모드)**: 브라우저 IndexedDB에 사진과 데이터를 안전하게 보관 (JSON 백업/복원 지원)
   - **Google Apps Script (클라우드 모드)**: Google Drive 영구 저장 및 Google Sheets DB 실시간 동기화 지원

---

## 🚀 라이브 웹앱 바로가기

👉 **[https://mi2tall-commits.github.io/keeplea-ai-vault/](https://mi2tall-commits.github.io/keeplea-ai-vault/)**

---

## 🛠️ 기술 스택 (Tech Stack)

* **Frontend**: HTML5, Tailwind CSS, Vanilla JavaScript (ES6+), QRCode.js, IndexedDB
* **AI Engine**: Google Gemini 3.6 Flash / Gemini 3.6 Multimodal API
* **Backend (Optional)**: Google Apps Script (GAS), Google Drive API, Google Sheets API
* **Hosting**: GitHub Pages