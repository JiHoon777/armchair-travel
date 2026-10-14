# 05. 경관 설명 — 출처·라이선스·형식

조사일 2026-10-13. 라이선스·가격·지침은 원문(약관, 가격표, PDF, API 응답)을 직접 열어 확인했다. UNESCO 세계유산센터는 봇 차단 때문에 Wayback 보관본(2025-05~2026-09)을 읽었다. 위키 수치는 Wikidata·MediaWiki API를 직접 호출해 셌다. 검색 요약으로만 본 것은 (검색 요약), 확인하지 못한 것은 (미확인)으로 적었다.

## 요약

1. **사실은 Wikidata에서 받고, 문장은 직접 쓴다.** Wikidata는 CC0이다. 자연·복합 세계유산 항목의 98%에 좌표, 90%에 면적이 있다 [4][5]. 위키백과 문장을 고치거나 번역하면 그 결과도 CC BY-SA 4.0으로 내야 한다 [1][2][3].
2. **UNESCO 설명문은 가져다 쓸 수 없다.** 세계유산센터는 "링크만, 복제 금지"를 요구한다. 데이터 피드는 개인·비상업 용도이고 변경할 수 없다 [7][8]. 등재 연도·기준 같은 사실은 Wikidata에서 받고 원문은 링크로 보낸다.
3. **사진은 파일마다 따로 확인한다.** 미국 NPS·USGS·NASA 자료는 미국 안에서 대체로 공공 영역이다. 뉴질랜드 DOC는 CC BY 4.0이고, swisstopo는 출처만 밝히면 상업 이용이 된다 [10][11][14][20][23]. 캐나다 정부 자료는 상업 재배포에 서면 허가가 필요하다 [19]. Commons API가 라이선스와 저작자를 기계로 읽을 수 있게 준다 [6][64].
4. **한국어 자료는 비어 있다.** 자연·복합 세계유산 284건(Wikidata 기준, 공식 목록은 282건) 가운데 한국어 위키백과 문서가 있는 곳은 141건(50%)이다. 문서 길이 중앙값은 영어의 약 1/7이다(바이트 기준) [30]. 국가유산청 Open API는 키 없이 좌표·면적·지정일·설명을 준다. 그런데 설명문에 공공누리 표시가 없다 [25][26].
5. **AI 초안은 주장 하나마다 출처 하나로 검증한다.** 인용을 붙인 생성형 검색도 문장의 51.5%만 인용으로 완전히 뒷받침됐다 [33]. 2025년 조사에서는 AI 답변의 45%에 중대한 문제가 있었다 [34]. 초안은 AI가 쓰고, 사실 확인은 사람과 스크립트가 한다.
6. **형식은 '훅 → 카드 → 90초 오디오 → 깊이 읽기'에 then/now 비교를 더한다.** 오디오 가이드 업계는 정거장 하나에 약 90초를 기준으로 삼는다 [50]. Voyager, StoryMaps, Snow Fall에서 카메라 이동, 비교 스와이프, 형성 애니메이션을 빌려 온다 [46][48][49].
7. **TTS 비용은 무시해도 될 만큼 작다. 고르는 기준은 라이선스다.** 장소 100곳의 한·영 내레이션(약 31만 자)은 Google·Azure 무료 한도 안에 든다 [35][37]. CLOVA Voice는 파일 저장을 금지해서 미리 만든 MP3에 쓸 수 없다 [42]. ElevenLabs는 유료 플랜이어야 상업 이용이 된다 [39][41].
8. **윤리 규칙은 글뿐 아니라 3D 카메라에도 걸린다.** 울룰루는 민감한 지점의 이미지를 다른 곳에서 보는 것 자체를 부적절하다고 본다. VR·360 촬영도 원칙적으로 막는다 [21][22]. 이름은 현지 이름을 먼저 쓴다. 이름 분쟁은 날짜와 주체를 밝혀 적는다 [56][57][58].

---

## 1. 글과 사실의 출처 — 위키백과, Wikidata, UNESCO

| 출처 | 쓸 것 | 라이선스 | 상업 이용 | 의무 |
|---|---|---|---|---|
| 위키백과(영·한) | 개요, 역사, 참고문헌 목록 | CC BY-SA 4.0, 일부 GFDL 병행 [2] | 가능, 단 같은 라이선스로 | 링크 표기, 변경 표시, CC BY-SA 고지 [1] |
| Wikidata | 좌표, 면적, 고도, 세계유산 ID·기준, 이미지, 외부 ID | CC0 [4] | 가능 | 없음(출처 표기 권장) |
| UNESCO 세계유산센터 | 등재 설명, 사진, 목록 피드 | © UNESCO 자료는 CC BY-SA 3.0 IGO, 제3자 사진은 따로 허락 [7] | 사실상 링크만 | 엠블럼·이름 사용 제한 [7] |

**위키백과 글을 쓰면 생기는 의무.**
- 저자는 링크나 저자 목록으로 밝힌다. 고쳤으면 고쳤다고 표시한다. 고친 글은 "Creative Commons Attribution-Share-Alike License 4.0 or later"로 내야 한다 [1].
- 지금 이용약관은 2023-06-07 시행본이다. 재이용자는 페이지 링크, 저자를 밝힌 안정된 사본 링크, 저자 목록 중 하나로 표기한다 [2].
- CC FAQ는 "translating a work from one language to another ... generally considered adaptations"라고 쓴다. 번역도 각색이라는 뜻이다 [3]. 영어 문서를 한국어로 옮기면 그 한국어 글도 CC BY-SA가 된다.
- 이미지는 본문 라이선스에 들어 있지 않다. 파일마다 따로 확인한다 [1].
- CC 라이선스는 "operative only when applied to material in which a copyright exists"다. 저작권이 있는 표현에만 걸린다는 뜻이다 [3]. 다만 AI로 특정 문서를 바꿔 쓴 글이 각색인지는 법률 판단이다 (미확인).

**Wikidata에서 바로 쓸 필드.** 자연 기준(vii~x)이 붙은 세계유산 주 항목 266개를 API로 셌다 (2026-10-13) [5].

| 속성 | 뜻 | 보유율 |
|---|---|---|
| P625 | 좌표 | 98% |
| P2046 | 면적 | 90% |
| P2044 | 해발고도 | 20% |
| P18 | 대표 이미지 | 95% |
| P373 | Commons 분류 | 85% |
| P1435 | 유산 지정 | 100% |
| P809 | 세계보호지역(WDPA) ID | 56% |
| P402 | OSM 관계 ID | 52% |
| P1566 | GeoNames ID | 45% |
| P1705 | 원어 표기 | 40% |
| 한국어 라벨 / 한국어 설명 | — | 48% / 12% |

- 고도는 다섯 곳 중 네 곳이 비어 있다. 산·폭포는 고도(P2044)와 높이(P2048)를 우리가 따로 채워야 한다.
- 한국어 이름은 절반에만 있다. 표기는 우리가 정하고, 정한 것을 Wikidata에 되돌려 넣을 수 있다.

**UNESCO 세계유산센터 약관** (2026-01-01 보관본 기준).
- 이미지 정책: "may not be copied or retransmitted by any means without explicit authorisation" — 명시적 허락 없이는 어떤 방법으로도 복사하거나 재전송할 수 없다 [7].
- 같은 페이지의 표: © UNESCO 자료는 CC BY-SA 3.0 IGO다. © UNESCO가 아닌 사진은 저작권자에게 "separate request for authorization"이 필요하다 [7].
- 링크 정책: "You may only link to, not replicate content." — 링크만 걸 수 있고 복제는 안 된다 [7].
- 신디케이션 피드(XML/RSS/KML/XLS)는 개인·비상업 용도로 서면 허가를 받아야 쓴다. 내용을 바꿀 수 없고 "All rights reserved" 고지를 붙여야 한다. 그 밖의 자료를 신디케이션하려면 유료 라이선스가 필요하다 (2026-09-22 보관본) [8].
- 라이선스 목록에는 CC BY-SA 3.0 IGO, CC BY-NC-SA 3.0 IGO, "Permission UNESCO"가 섞여 있다 [9]. 항목마다 조건이 다르다.

**우리 사이트로 옮기면:** 설명문은 직접 쓴다. 위키백과는 참고문헌을 찾는 데만 쓴다. 번역해서 쓰려면 그 장소의 글 전체를 CC BY-SA 4.0으로 공개한다고 먼저 정한다. 사실 상자(좌표·면적·고도·등재 연도·기준)는 빌드 때 Wikidata에서 받는다. UNESCO 페이지는 "공식 등재 설명" 링크로만 건다. 세계유산 엠블럼은 쓰지 않는다.

---

## 2. 사진·지도·데이터 — 공공 기관과 국립공원

| 출처 | 쓸 것 | 조건 | 상업 | 표기 |
|---|---|---|---|---|
| NPS(미국) | 공원 설명, 사진 | 따로 표시가 없으면 공공 영역 [10] | 가능 | 출처 표기 권장. 상업 재출판이면 원저작이 미국 정부임을 밝힘. 화살촉 로고 금지 [10] |
| USGS | 지질·화산·빙하 설명, 사진 | 공공 영역 [11] | 가능 | "Credit: U.S. Geological Survey" [11] |
| NASA Earth Observatory | 위성 사진과 해설 | 미국 내 저작권 없음, 제3자 자료 제외 [14] | 가능, 보증 암시 금지 | NASA를 출처로 표기 [14] |
| Smithsonian Open Access | 역사 사진·그림·표본 | CC0 [15] | 가능 | 불필요 |
| Natural Earth | 소축척 지도 | 공공 영역 [16] | 가능 | 불필요 [16] |
| GeoNames | 다국어 지명·이명 | CC BY [17] | 가능 | GeoNames 링크 [17] |
| OpenStreetMap | 길·경계·지명 | ODbL [18] | 가능 | "© OpenStreetMap contributors", 변형 데이터는 같은 라이선스 [18] |
| Parks Canada | 공원 설명·사진 | 캐나다 정부 약관 [19] | 서면 허가 필요 | 비상업은 출처·URL 표기로 가능 |
| NZ DOC | 공원·트랙 설명, DOC 사진 | CC BY 4.0, © 표시 사진 제외 [20] | 가능 | "Source: Department of Conservation (NZ)"와 사진가 이름 |
| Parks Australia(울루루) | 공원 정보 | 상업·공개 이용은 미디어 허가 [21][22] | 허가 필요 | 민감 지점 규칙(7절) |
| swisstopo | 무료 지리데이터(지형·항공사진 등) | 상업 이용 가능 [23] | 가능 | "© swisstopo" 등 출처 필수 [23] |
| Wikimedia Commons | 사진 대부분 | 파일별 [6] | 파일별 | API로 자동 수집 [64] |

- NASA Earth Observatory는 2025-12-02 공지대로 science.nasa.gov로 옮겼다 (Wayback 2025-12-06 보관본) [12]. 2026-10-13에도 Image of the Day가 올라온다. 이날 글은 "An Impact Structure With Legs"다 [13].
- NASA 자료는 "generally are not subject to copyright in the United States"다. 미국에서 대체로 저작권 대상이 아니라는 뜻이다 [14]. 상업 이용 때 NASA가 보증한다는 인상을 주면 안 된다. 로고와 인시그니아는 공공 영역이 아니다 [14].
- Smithsonian Open Access는 2020-02에 280만 항목으로 시작했다 (검색 요약). Open Access API 통계(2026-10)로는 CC0 레코드가 1,745만 건이고, 그중 CC0 이미지가 붙은 레코드는 526만 건이다 [15]. si.edu는 직접 열면 403으로 막혔다.
- GeoNames는 지명 3,200만 개와 이명 1,900만 개를 가진다. 무료 API 한도는 앱 하나당 하루 10,000 크레딧, 시간당 1,000 크레딧이다 [17].
- 캐나다 정부 약관(2025-09-05)은 비상업 복제를 "without charge or further permission"으로 허용한다. 상업 재배포에는 "prior written permission"이 필요하다 [19]. Parks Canada 누리집 약관(2026-07-13 수정)도 같은 조건이다. 상업 재배포 허가는 PWGSC(저작권 관리 기관)에서 받는다 [19].
- NZ DOC 자료는 "must be reproduced accurately and not be used in a misleading context" 조건을 지켜야 한다. 정확하게 옮기고 오해를 부르는 맥락에 쓰지 말라는 뜻이다 [20].
- Commons API 응답 예: 한라산 어리목 사진 한 장에 LicenseShortName=CC BY-SA 4.0, AttributionRequired=true, Artist=Basile Morin이 들어 있다 [64]. 위키미디어는 라이선스 정보가 맞는지 보증하지 않는다 [6].

**우리 사이트로 옮기면:** 사진은 ① 미국 연방(NPS·USGS·NASA) 공공 영역, ② NZ DOC·swisstopo 같은 CC BY·OGD, ③ Commons의 CC BY·CC BY-SA, ④ 허가가 필요한 것 순으로 고른다. 미디어마다 license, author, source_url, attribution 문자열을 데이터에 저장하고 화면 크레딧은 자동으로 만든다. 상업 전환 가능성을 열어 두려면 캐나다·UNESCO 사진은 처음부터 뺀다.

---

## 3. 한국어 자료 — 국가유산청, 제주, 한국어 위키백과

**공공누리 유형** [24][25]

| 유형 | 조건 | 상업 | 변경 |
|---|---|---|---|
| 제1유형 | 출처표시 | O | O |
| 제2유형 | 출처표시 + 상업적 이용금지 | X | O |
| 제3유형 | 출처표시 + 변경금지 | O | X |
| 제4유형 | 출처표시 + 상업적 이용금지 + 변경금지 | X | X |

- 국가유산청 저작권정책은 제0유형과 'AI 유형'도 둔다. 출처에는 발행연도, 기관명과 누리집 URL, 작성자 이름을 함께 적는다 [25].
- 공공누리가 "부착되지 않은 자료"는 담당자와 사전에 협의해야 쓸 수 있다 [25].

**국가유산청 Open API (직접 호출).** 키 없이 목록과 상세를 XML로 준다 [26]. 한라산 천연보호구역 응답에는 좌표(33.368, 126.559), 면적 91,672,346㎡, 지정일 1966-10-12, 대표 이미지 URL, 755자 설명이 들어 있다 [26]. 설명은 "한라산은 해발 1,950m로 남한에서 가장 높은 화산이다"처럼 사실 위주다. 그런데 API 응답과 국가유산포털 상세 페이지 어디에도 공공누리 유형 표시가 없다. 포털의 메타 태그는 "ALL RIGHTS RESERVED"다 (2026-10-13 확인).

**한국관광공사 TourAPI.** 공공데이터포털의 표기는 "이용허락범위 제한 없음"이다. 사진은 공공누리 1유형과 3유형이 섞여 있다. 기업 CI·BI 용도와 명예훼손 용도는 금지된다 [27]. 3유형은 변경 금지라서 자르기나 보정도 피하는 편이 안전하다.

**제주 세계유산본부.** 누리집 하단에 "Copyrightⓒ제주특별자치도 세계유산본부. All rights reserved."라고 적혀 있다 [28]. 공공누리 표시는 찾지 못했다. 사진과 영상은 허락을 받아야 쓸 수 있다고 보고 움직인다.

**한국어 위키백과의 빈자리 (직접 측정, 2026-10-13).**
- 전체 문서 수는 한국어 768,256개, 영어 7,252,326개, 일본어 1,522,626개다 [29].
- 자연 기준이 붙은 세계유산 284건(Wikidata 기준, 구성 요소는 하나로 합침) 가운데 한국어 문서가 연결된 곳은 141건(50%)이다. 영어는 234건(82%)이다 [30]. Wikidata 연결로 센 것이라 실제보다 조금 낮게 잡힌 하한값이다.
- 두 언어 문서가 다 있는 141건에서 길이 중앙값은 한국어 2,441바이트, 영어 17,781바이트다. 쌍별 비율의 중앙값은 0.157이다. 한국어 141건 중 79건은 3,000바이트가 안 된다 [30]. 한글은 UTF-8에서 글자당 3바이트라 한국어에 유리한 측정인데도 차이가 크다.

**우리 사이트로 옮기면:** 한국어판은 번역이 아니라 새로 쓰는 일이다. 국내 장소의 사실 상자는 국가유산청 API(좌표·면적·지정일)로 채운다. 설명문은 인용하지 않고 직접 쓴다. 인용이 필요하면 국가유산청에 공공누리 유형을 문의한다. 사진은 공공누리 1유형만 가공해서 쓰고, 3유형은 원본 그대로 쓴다.

---

## 4. AI로 쓰기 — 환각과 검증

| 연구 | 대상 | 결과 |
|---|---|---|
| FActScore, EMNLP 2023 [31] | ChatGPT 인물 약전 | 원자 단위 사실의 58%만 뒷받침됨 |
| Walters·Wilder, Sci Rep 2023 [32] | ChatGPT 참고문헌 | 지어낸 인용 GPT-3.5 55%, GPT-4 18%. 실재 인용 중 중대한 오류 43%, 24% |
| Liu·Zhang·Liang, Findings of EMNLP 2023 [33] | 생성형 검색 엔진 | 문장의 51.5%만 인용으로 완전히 뒷받침. 인용의 74.5%만 그 문장을 지지 |
| EBU·BBC, 2025-10-22 [34] | ChatGPT·Copilot·Gemini·Perplexity 뉴스 답변 3,000건 이상, 18개국 14개 언어 | 45%에 중대한 문제, 31%에 출처 문제, 20%에 정확성 문제 |

- 2023년 연구의 모델은 이미 낡았다. 그래도 2025년 다국어 조사에서 가장 흔한 문제는 여전히 출처였다 [34]. "출처를 달아라"로는 부족하다. 붙은 출처가 실제로 그 말을 하는지 대조해야 한다.

**검증 절차 (권장).**
1. 출처를 먼저 모은다. 장소당 1차 출처 4~6개(공원 당국, 지질조사 기관, UNESCO 링크, 학술 개요)와 Wikidata 항목을 정한다.
2. AI는 그 출처 안에서만 한국어 초안을 쓴다. 문장마다 [출처 ID + 원문 인용 한 줄]을 붙인다.
3. 스크립트가 인용 문자열이 실제 출처 텍스트에 있는지 대조한다. 숫자는 Wikidata 값과 단위까지 비교한다.
4. 사람이 체크리스트로 본다. 숫자·연도·이름, '발견' 표현, 성지·분쟁 표현, 전설 표시를 확인한다.
5. 영어판은 확정된 한국어판을 번역하고 같은 fact ID를 유지한다. 번역한 뒤 숫자와 단위를 다시 대조한다.
6. 재검증은 1년마다 한다. 빙하나 명칭처럼 바뀌는 항목은 6개월마다 한다.

**번역 비용.** Google Cloud Translation 기본 모델(NMT)은 100만 자당 $20이고, 매달 $10 크레딧이 붙는다. Translation LLM은 입력과 출력이 각각 100만 자당 $10이다 (2026-10-13) [44]. 장소 하나에 3,000자면 약 $0.06이다. DeepL API는 Developer(무료, 월 100만 자)와 Growth(월 €29.75, 연 결제 시 월 €23.80, 100만 자당 €22)로 나뉜다. 공식 가격 페이지에 박힌 요금 데이터(독일·EUR 기준)로 확인했다 (2026-10-13). 한국 표시 통화와 금액은 (미확인) [45].

**우리 사이트로 옮기면:** AI는 '저자'가 아니라 '초안 작성자'다. 데이터 모델에 주장(fact) 단위를 두고, 주장마다 출처·인용문·확인자·확인일을 저장한다. 인용문이 출처에 없으면 빌드가 실패하게 만든다.

---

## 5. 내레이션(TTS) — 한국어 목소리와 비용

| 서비스 | 한국어 목소리 | 가격(100만 자당, 2026-10-13) | 무료 한도 | 상업 이용 | 파일 저장 |
|---|---|---|---|---|---|
| Google Cloud TTS [35][36] | 41개: Standard 4, WaveNet 4, Neural2 3, Chirp 3 HD 30 | Standard·WaveNet $4, Neural2 $16, Chirp 3 HD $30, Studio $160. Gemini TTS는 토큰 과금 | Standard·WaveNet 월 400만 자, 그 밖 월 100만 자 | 약관 범위 안 (세부 미확인) | 가능 |
| Azure AI Speech [37][38] | Neural 10개(SunHi, InJoon, Hyunsu 등), DragonHD 2개, MAI 2개 | Neural $15, Neural HD $22 | 월 50만 자(F0) | 약관 범위 안 (세부 미확인) | 가능 |
| ElevenLabs [39][40][41] | v4·v3·Multilingual v2·Flash v2.5 모두 한국어 지원 | 월정액: Starter $6(3만 크레딧), Pro $99(60만), Business $990(600만). Multilingual v2는 1자에 1크레딧 | 월 1만 크레딧 | 유료 플랜만. 무료는 비상업(이용약관 1(c), 2026-10-09 개정) [65]. 출처 표기 의무는 (검색 요약) | 가능 |
| NAVER CLOVA Voice [42][43] | 약 100가지 음성(한국어 수는 미확인). 한·영·일·중·스페인어 | Premium 기본료 + 1,000자 단위 과금. 금액 (미확인) | — | 유료 판매·제품 탑재 가능 | **불가**, 실시간 API만 |

- Gemini 3.8 Flash TTS(미리보기)는 2026-12-31까지 텍스트 입력 100만 토큰당 $0.50, 오디오 출력 100만 토큰당 $9다. 오디오 1초가 25토큰이다 [35]. 1분에 약 $0.0135다.
- CLOVA Voice 정책은 "CLOVA Voice 는 반드시 실시간 API 호출 방식으로 이용해야 합니다."다. 파일을 저장하거나 편집해 다시 쓰려면 CLOVA Dubbing을 쓰라고 안내한다 [42]. 한 번 호출에 2,000자까지 보낼 수 있다 [43].

**낭독 속도 (자체 측정).** macOS 기본 음성으로 같은 내용을 읽혔다 [63]. 한국어(Yuna)는 755자(공백 포함)를 105.8초에 읽었다. 분당 약 428자다. 영어(Samantha)는 111단어·690자를 44.5초에 읽었다. 분당 150단어, 약 930자다. 상용 TTS 목소리마다 속도는 다르다.

**장소당 비용 계산.** 한국어 카드(300자)와 오디오(640자), 영어 같은 분량(약 2,100자)을 합치면 장소당 약 3,100자다. 100곳이면 31만 자다. Google Chirp 3 HD 무료 한도(월 100만 자) 안에 들고, 넘어도 $9.3이다 [35]. Azure Neural로는 $4.65다 [37]. ElevenLabs는 Pro 한 달($99)이 필요하다 [39]. 고쳐서 다시 만드는 횟수를 3배로 잡아도 Google·Azure는 수십 달러를 넘지 않는다.

**우리 사이트로 옮기면:** 내레이션은 빌드 때 MP3로 미리 만들어 정적으로 둔다. 1순위는 Google Chirp 3 HD나 Azure Neural이다. 둘 다 한국어 목소리가 있고 무료 한도로 MVP를 끝낼 수 있다. CLOVA Voice는 이 구조와 맞지 않는다. ElevenLabs는 음질 비교용으로만 시험하고, 실제로 쓰면 유료 플랜에서 만든다. 화면에는 "AI 합성 음성"이라고 표시한다.

---

## 6. 잘 먹히는 형식 — 무엇을 빌려 올까

| 형식 | 핵심 | 빌릴 것 |
|---|---|---|
| Google Earth Voyager [46][47] | 2017-04-18 출시, 이야기 50개 이상. BBC Earth "Natural Treasures", 제인 구달의 곰베 투어. 안내 투어, 퀴즈, 레이어, 360 영상 | 장소마다 정거장 몇 개를 카메라 이동으로 잇는 구조 |
| Google Earth 프로젝트 [47] | 사용자가 만드는 이야기. 장소 표시·선·면, 사진, 글, 3D 시점 | 편집 도구의 최소 단위(지점 + 시점 + 글 + 사진) |
| ArcGIS StoryMaps [48] | sidecar(고정·부유·슬라이드쇼), guided tour, swipe(2020-06 베타, 2021-03부터 sidecar 안에서도) (검색 요약) | then/now 스와이프, 스크롤에 따라 움직이는 지도 |
| NYT Snow Fall [49] | 2012-12-20 공개. 6부 구성, 인터랙티브 그래픽, 애니메이션 시뮬레이션, 항공 영상. 첫 6일 350만 페이지뷰, 2013 퓰리처 특집 부문 (검색 요약) | 스크롤에 맞춰 카메라와 애니메이션이 움직이는 깊이 읽기 |
| 박물관 오디오 가이드 [50][51] | 시각 관람객용 투어는 정거장당 약 90초, 2분은 거의 넘기지 않음. 화면 해설 투어는 더 김(2.5~3.5분 예) [50]. 박물관·미술관 1~2분, 야외 걷기 2~3분 (검색 요약). 콘텐츠 45분짜리 ACMI 가이드의 평균 이용 14분, 끝으로 갈수록 이탈 [51] | 오디오 한 꼭지 90초, 한 장소 투어 전체 10~15분 이하 |
| Rick Steves Audio Europe [52] | 걷기·박물관 투어 60개, MP3와 PDF 지도, 2023-03 기준으로 갱신 | 오프라인 MP3, 대본 공개, 지도 동봉 |
| Atlas Obscura [53] | "unusual, extraordinary, strange, secret, surprising" 한 장소. 끝에 Know Before You Go (검색 요약) | 훅을 맨 앞에, 실용 정보는 맨 끝에 |
| National Geographic 캡션 [54] | 캡션은 "should add new information". 뻔한 것은 쓰지 않고 현재형으로 | 3D 화면 캡션에는 화면에 없는 정보만 |
| Earth Timelapse·Landsat [55] | 1984~2022 연도별 위성 합성(1984 시작은 검색 요약). 2021~2022 이미지 추가 | 빙하·하천·해안의 then/now |
| NASA EO Image of the Day [13] | 위성 사진 한 장과 해설. 최근 게시일 2026-10-09(금)·12(월)·13(화) | 이야기 소재와 공공 영역 이미지 |

**뽑아낸 패턴 6가지.**
1. **훅 먼저.** 첫 문장은 이 장소가 왜 이상하거나 놀라운지 말한다. 위치와 면적은 사실 상자로 뺀다 [53][54].
2. **세 겹 깊이.** 훅 1문장 → 카드 3~4문장 → 오디오 90초 → 깊이 읽기. 독자가 어느 층에서 멈춰도 이야기가 완결된다 [50].
3. **시간 비유.** 지질 시간은 하루·1년·키 같은 익숙한 단위로 접는다. 46억 년을 하루로 접으면 1초가 약 5만 3천 년이다. 비유의 계산식도 데이터에 저장해서 검증한다.
4. **then vs now.** 같은 시점에서 본 1984년 위성 사진과 최근 사진, 옛 사진과 지금 사진을 스와이프로 비교한다 [48][55].
5. **형성 애니메이션.** 3D 지형 위에서 분출 → 침식 → 빙하 같은 단계를 3~5컷으로 보여준다. Snow Fall이 시뮬레이션 애니메이션으로 한 일과 같다 [49].
6. **현지 전설.** 지형을 설명하는 이야기를 넣는다. 아오라키는 하늘 아버지 라키누이의 네 아들 중 하나다. 형제들이 탄 카누가 암초에 걸렸고, 남풍에 형제들이 돌이 됐다. 카누는 남섬이 되고 가장 키가 큰 아오라키는 최고봉이 됐다고 전한다 [57]. 전설은 '전해지는 이야기'로 표시하고, 어느 공동체의 이야기인지 밝힌다.

**우리 사이트로 옮기면:** 장소 페이지 하나는 3D 카메라 정거장 3~5개와 카드, 90초 오디오 1~2꼭지, then/now 스와이프 하나, 깊이 읽기 한 편으로 짠다. 화면 캡션에는 화면에 안 보이는 정보만 쓴다. 투어 전체 길이는 10~15분을 넘기지 않는다.

---

## 7. 윤리 — 이름, 성지, '발견', 기후

**원주민 이름.**
- 유엔 원주민 권리 선언(2007-09-13 채택) 제13조 1항은 원주민이 "designate and retain their own names for communities, places and persons" 할 권리를 말한다. 공동체·장소·사람의 이름을 스스로 정하고 지킬 권리다 [56].
- Aoraki / Mount Cook은 1998년 Ngāi Tahu 청구 정착법으로 공식 이중 이름이 됐다. 그 법으로 바뀐 이름 가운데 마오리 이름이 앞에 오는 유일한 예다. 영어 이름은 1851년 스토크스 선장이 붙였는데, 기린 대상인 제임스 쿡은 이 산을 본 적이 없다. 높이는 3,724m다(2013-11 GPS 측정) [57]. Ngāi Tahu는 아오라키를 가장 신성한 조상으로 여긴다 [57].
- Denali: 2025-01-20 행정명령이 "Mount McKinley"라는 이름을 되살리게 했다. 공원은 "shall retain the name Denali National Park and Preserve"라고 해서 이름을 유지한다 [58]. 내무부의 시행, 알래스카 주의회의 반대 결의, 머코스키 상원의원의 재변경 시도가 보도됐다 (검색 요약) [59]. Denali라는 말의 뜻('높은 것')은 (미확인).
- 빅토리아 폭포의 세계유산 공식 이름은 "Mosi-oa-Tunya / Victoria Falls"다 (Wikidata 라벨) [60].

**성지와 촬영 — 울룰루** (2022-04 미디어 지침 [21]).
- 성지와 고인이 담긴 이미지는 아낭구에게 "offensive"하고 상업 이용에 맞지 않는다 (4.1.2).
- Tjukurpa에 따라 어떤 부분은 기록·촬영하면 안 되고, 어떤 부분은 정해진 방식으로만 찍어야 한다 (4.1.3).
- 민감 지점은 자세히 찍거나 가까이 찍으면 안 된다. 멀리서 찍을 때도 성지는 그림자나 덤불로 가려져야 한다 (4.1.4). 울룰루 북동면은 원칙적으로 촬영할 수 없다 (4.1.5).
- 카타추타는 일몰 전망대에서 돔 3개, 사구 전망대에서 돔 5개를 온전히 담아야 한다. 돔 하나에 초점을 맞추면 안 된다. Valley of the Winds 길은 촬영할 수 없다 (4.1.6).
- "Virtual reality and 360 degree photography is generally not allowed." 민감한 세부에 지나치게 다가가게 한다는 이유다 (5.10).
- 방문객 안내: "It is inappropriate for images of sensitive sites to be viewed elsewhere" — 민감 지점은 그 자리가 아닌 곳에서 보는 것 자체가 부적절하다 [22].

**'발견' 서사.** 유럽인이 붙인 이름과 날짜를 장소의 시작으로 쓰지 않는다. '발견했다' 대신 '유럽인으로는 처음 기록했다'라고 쓴다. 그보다 먼저 있던 이름과 사람을 앞에 둔다 [56][57].

**기후 메시지.**
- Climate Visuals는 런던·베를린 토론 집단 32명과 영국·독일·미국 온라인 조사 약 3,000명을 바탕으로 7원칙을 냈다. 실제 사람 보여주기, 새로운 이야기, 원인의 규모, 감정적으로 강한 영향, 지역의 심각한 영향, 시위 이미지 주의, 청중 이해다. 북극곰이나 굴뚝 같은 익숙한 이미지는 냉소와 피로를 부른다 (검색 요약) [61].
- 스위스 빙하는 2015~2025년에 부피의 24%를 잃었다 (GLAMOS, 2025-10-01 보도). 2026년 한 해에만 약 5.5%를 잃어 2022년(약 6%) 다음으로 컸다 (2026-09-30 보도, 검색 요약) [62].

**우리 사이트로 옮기면:** 현지·원주민 이름을 먼저 쓰고 공식 이름을 함께 적는다. 이름 분쟁은 날짜와 주체를 밝힌다. 성지 규칙은 3D 카메라 제한으로 구현한다. 울룰루는 일단 목록에서 뺀다. 넣는다면 멀리서 보는 고정 시점만 두고 북동면을 빼며, Parks Australia 미디어 담당과 먼저 협의한다. 기후 이야기는 측정값과 then/now 이미지로 보여주고, 당부는 한 문장을 넘기지 않는다.

---

## 8. 제작량과 데이터 모델

**층별 분량.**

| 층 | 한국어 | 영어 | 오디오 길이 | 근거 |
|---|---|---|---|---|
| 훅 | 40~60자 | 12~20단어 | — | 훅 우선, 캡션 규칙 [53][54] |
| 카드 | 250~350자 | 80~120단어 | 35~50초 | 측정한 낭독 속도 [63] |
| 오디오 한 꼭지 | 600~650자 | 200~230단어 | 약 90초 | [50][63] |
| 깊이 읽기 | 1,500~2,500자 | 500~800단어 | — | 앉아서 5~8분 읽는 분량(자체 기준) |
| 캡션 | 컷당 60~100자 | 20~35단어 | — | [54] |
| 사실 상자 | 자동 | 자동 | — | Wikidata [5] |

**장소당 작업 시간 (자체 추정).**

| 단계 | 시간 |
|---|---|
| 출처 모으기(1차 출처 4~6개, Wikidata 연결) | 45~60분 |
| AI 초안(한국어, 정해 둔 출처 안에서만) | 10~15분 |
| 편집과 다듬기 | 30~45분 |
| 사실 검증(주장 15~25개 × 1.5~2분) | 30~50분 |
| 미디어 고르기, 라이선스 기록 | 20~30분 |
| 영어판(번역과 검수) | 20~30분 |
| TTS 생성, 듣고 고치기 | 10~20분 |
| 합계 | 약 3~4.5시간 |

- 20곳 MVP는 60~90시간, 50곳은 150~225시간이다.
- 가장 큰 변수는 사실 검증과 한국어 자료 부족이다. 국내 장소는 국가유산청 API가 시간을 줄여 준다.

**데이터 모델.** 장소 하나에 파일 하나를 두고 git으로 관리한다.

```yaml
id: aoraki-mount-cook
wikidata: Q…                # 빌드 때 좌표·면적·고도·등재 정보를 받아 옴
names:
  - {lang: mi, text: Aoraki, kind: indigenous, show_first: true}
  - {lang: en, text: "Aoraki / Mount Cook", kind: official, since: 1998, source: s1}
  - {lang: ko, text: "아오라키/쿡산", kind: display}
sensitivity:
  sacred: true              # 신성한 조상으로 여겨짐
  camera: null              # 울룰루라면 {min_distance_m, forbid: [northeast_face]}
  naming_dispute: null      # 디날리라면 {since: 2025-01-20, parties: [...]}
facts:
  - id: f1
    ko: "높이 3,724m"
    en: "3,724 m high"
    value: 3724
    unit: m
    as_of: 2013-11
    source: s1
    quote: "…출처 원문 한 줄…"
    checked: {by: jihoon, on: 2026-10-13}
layers:
  ko: {hook: "…", card: "…", audio: "… {f1} …", deep: "…"}
  en: {hook: "…", card: "…", audio: "… {f1} …", deep: "…"}
media:
  - {id: m1, file: "…jpg", license: "CC BY-SA 4.0", author: "…", source_url: "…",
     attribution: "…", restrictions: null}
sources:
  - {id: s1, title: "…", publisher: "…", url: "…", accessed: 2026-10-13, license: "…"}
review: {status: verified, next_due: 2027-10-13}
```

- 빌드 스크립트가 검사할 것: 모든 fact에 source와 quote가 있는가, quote가 출처 텍스트에 실제로 있는가, 숫자가 Wikidata와 맞는가, 모든 media에 license와 author가 있는가, sensitivity.camera가 3D 뷰어 설정에 들어갔는가.

**우리 사이트로 옮기면:** 글(layers)과 사실(facts)을 나눠서 같은 사실을 한·영 양쪽이 참조하게 한다. 숫자를 고치면 두 언어가 함께 바뀐다. 라이선스가 빠진 미디어나 출처 없는 주장이 있으면 빌드가 멈춘다.

---

## 출처

- [1] Wikipedia, Wikipedia:Reusing Wikipedia content (2026-10-13 열람). https://en.wikipedia.org/wiki/Wikipedia:Reusing_Wikipedia_content
- [2] Wikimedia Foundation, Terms of Use (2023-06-07 시행). https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use
- [3] Creative Commons, Frequently Asked Questions (2026-10-13 열람). https://creativecommons.org/faq/
- [4] Wikidata, Wikidata:Licensing (2026-10-13 열람). https://www.wikidata.org/wiki/Wikidata:Licensing
- [5] 자체 측정, Wikidata API로 자연·복합 세계유산 주 항목 266개의 속성 보유율 집계 (2026-10-13). https://www.wikidata.org/w/api.php
- [6] Wikimedia Commons, Commons:Reusing content outside Wikimedia (2026-10-13 열람). https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia
- [7] UNESCO World Heritage Centre, Terms / Policies — Content Disclaimer, Images Policy, Linking Policy (Wayback 2026-01-01 보관본). https://whc.unesco.org/en/disclaimer/
- [8] UNESCO World Heritage Centre, Syndication — Terms and Conditions of Use (Wayback 2026-09-22 보관본). https://whc.unesco.org/en/syndication/
- [9] UNESCO World Heritage Centre, Licenses (Wayback 2025-05-12 보관본). https://whc.unesco.org/en/licenses/
- [10] National Park Service, Disclaimer (2026-10-13 열람). https://www.nps.gov/aboutus/disclaimer.htm
- [11] USGS, Copyrights and Credits (2026-10-13 열람). https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits
- [12] NASA Earth Observatory, The Earth Observatory is moving (2025-12-02) (Wayback 2025-12-06 보관본, 원 주소는 지금 EO 첫 화면으로 리디렉트). https://earthobservatory.nasa.gov/blogs/earthmatters/2025/12/02/the-earth-observatory-is-moving/ , https://web.archive.org/web/20251206144114/https://earthobservatory.nasa.gov/blogs/earthmatters/2025/12/02/the-earth-observatory-is-moving/
- [13] NASA Science, Earth Observatory (2026-10-13 열람). https://science.nasa.gov/earth/earth-observatory/
- [14] NASA, Guidelines for using NASA images and media (2026-10-13 열람). https://www.nasa.gov/nasa-brand-center/images-and-media/
- [15] Smithsonian, Open Access (직접 열람은 403) / Open Access API stats (2026-10, DEMO_KEY로 호출). https://www.si.edu/openaccess , https://api.si.edu/openaccess/api/v1.0/stats
- [16] Natural Earth, Terms of Use (2026-10-13 열람). https://www.naturalearthdata.com/about/terms-of-use/
- [17] GeoNames, Free Gazetteer Data and Web Services / About (2026-10-13 열람). https://www.geonames.org/export/ , https://www.geonames.org/about.html
- [18] OpenStreetMap, Copyright and License (2026-10-13 열람). https://www.openstreetmap.org/copyright
- [19] Government of Canada, Terms and conditions (2025-09-05) / Parks Canada, Terms and conditions (2026-07-13 수정). https://www.canada.ca/en/transparency/terms.html , https://parks.canada.ca/termes-terms
- [20] New Zealand Department of Conservation, Copyright (2026-10-13 열람). https://www.doc.govt.nz/footer-links/copyright/
- [21] Parks Australia, Uluṟu-Kata Tjuṯa National Park Media Guidelines for Commercial and Public Media Capture and Use (2022-04). https://uluru.gov.au/static/27cb169f475f558b006a4173fbd846f0/uktnp-document-uktnp-media-guidelines-apr22.pdf
- [22] Parks Australia, Photography — Uluṟu-Kata Tjuṯa (2026-10-13 열람). https://uluru.gov.au/do/photography/
- [23] swisstopo, Terms of use for free geodata and geoservices (약관 버전 1.3.2021, 2022-08-26 게시). https://www.swisstopo.admin.ch/en/terms-of-use-free-geodata-and-geoservices
- [24] 공공누리(KOGL), 이용허락 유형 안내 (2026-10-13 열람). https://www.kogl.or.kr/info/license.do
- [25] 국가유산청, 저작권정책 (2026-10-13 열람). https://www.khs.go.kr/html/HtmlPage.do?pg=/guide/copyright.jsp&mn=NS_08_03
- [26] 국가유산청, 국가유산 검색 Open API 상세 응답 — 한라산 천연보호구역 (2026-10-13 직접 호출) / 국가유산포털 상세 페이지. https://www.khs.go.kr/cha/SearchKindOpenapiDt.do?ccbaKdcd=16&ccbaAsno=0001820000000&ccbaCtcd=50 , https://www.heritage.go.kr/heri/cul/culSelectDetail.do?ccbaCpno=1363901820000
- [27] 공공데이터포털, 한국관광공사 국문 관광정보 서비스(TourAPI) (2026-10-13 열람). https://www.data.go.kr/data/15101578/openapi.do
- [28] 제주특별자치도 세계유산본부, 누리집 첫 화면 (2026-10-13 열람). https://www.jeju.go.kr/wnhcenter/index.htm
- [29] MediaWiki API, ko·en·ja 위키백과 siteinfo 통계 (2026-10-13 호출). https://ko.wikipedia.org/w/api.php?action=query&meta=siteinfo&siprop=statistics
- [30] 자체 측정, Wikidata SPARQL(P757·P2614)과 MediaWiki API로 자연·복합 세계유산의 ko·en 문서 유무와 길이 집계 (2026-10-13). https://query.wikidata.org/
- [31] Min et al., FActScore: Fine-grained Atomic Evaluation of Factual Precision (EMNLP 2023). https://arxiv.org/abs/2305.14251
- [32] Walters·Wilder, Fabrication and errors in the bibliographic citations generated by ChatGPT, Scientific Reports 13:14045 (2023). https://pmc.ncbi.nlm.nih.gov/articles/PMC10484980/
- [33] Liu·Zhang·Liang, Evaluating Verifiability in Generative Search Engines (Findings of EMNLP 2023). https://arxiv.org/abs/2304.09848
- [34] EBU, Largest study of its kind shows AI assistants misrepresent news content 45% of the time (2025-10-22). https://www.ebu.ch/news/2025/10/ai-s-systemic-distortion-of-news-is-consistent-across-languages-and-territories-international-study-by-public-service-broadcaste
- [35] Google Cloud, Text-to-Speech pricing (2026-10-13 열람). https://cloud.google.com/text-to-speech/pricing
- [36] Google Cloud, Supported voices and languages (2026-10-13 열람). https://cloud.google.com/text-to-speech/docs/list-voices-and-types
- [37] Microsoft, Azure Retail Prices API(Azure Speech, eastus)와 Speech 가격 페이지 (2026-10-13 조회). https://prices.azure.com/api/retail/prices , https://azure.microsoft.com/en-us/pricing/details/speech/
- [38] Microsoft Learn, Language and voice support for the Speech service — TTS (2026-10-13 열람). https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=tts
- [39] ElevenLabs, Pricing (2026-10-13 열람). https://elevenlabs.io/pricing
- [40] ElevenLabs, Models (2026-10-13 열람). https://elevenlabs.io/docs/models
- [41] ElevenLabs Help Center, Can I publish the content I generate on the platform? (검색 요약). https://help.elevenlabs.io/hc/en-us/articles/13313564601361
- [42] NAVER Cloud, CLOVA Voice 이용 정책 (2026-09-17 수정). https://guide.ncloud-docs.com/docs/clovavoice-policy
- [43] NAVER Cloud, CLOVA Voice 개요(2026-09-17)와 상품 페이지(요금 금액은 화면에 나오지 않음). https://guide.ncloud-docs.com/docs/clovavoice-overview , https://www.ncloud.com/product/aiService/clovaVoice
- [44] Google Cloud, Cloud Translation pricing (2026-10-13 열람). https://cloud.google.com/translate/pricing
- [45] DeepL, 가격 페이지 (pro-api 주소는 /en/pro로 리디렉트. API 요금은 페이지에 박힌 요금 데이터 api-developer·api-growth로 확인, 독일·EUR 기준, 2026-10-13). https://www.deepl.com/en/pro
- [46] VentureBeat, Google Earth relaunches with new storytelling and exploration features (2017-04-18). https://venturebeat.com/2017/04/18/google-earth-relaunches-with-new-storytelling-and-exploration-features
- [47] Google Earth Education, Experience and Create Stories About the World (2026-10-13 열람). https://www.google.com/earth/education/explore-earth/
- [48] Esri ArcGIS Blog, Making the most of immersives / What's new in ArcGIS StoryMaps (June 2020) (검색 요약). https://www.esri.com/arcgis-blog/products/story-maps/sharing-collaboration/making-the-most-of-immersives , https://www.esri.com/arcgis-blog/products/arcgis-storymaps/constituent-engagement/whats-new-in-arcgis-storymaps-june-2020
- [49] Wikipedia, Snow Fall / CU Coloradan, Breaking ground (2013-06-01) (검색 요약). https://en.wikipedia.org/wiki/Snow_Fall , https://www.colorado.edu/coloradan/2013/06/01/breaking-ground
- [50] Lou Giansante, Writing Verbal Description for Audio Guides (Art Beyond Sight, Wayback 2021-01-19 보관본으로 열람. Moodle 사본은 '2015'로 표기됐고 로그인 화면만 열림) / Guide-ID, How to Increase Museum Engagement with Audio (검색 요약, 2026-10-13 현재 404). https://web.archive.org/web/20210119011650/http://www.artbeyondsight.org/mei/verbal-description-training/writing-verbal-description-for-audio-guides/ , https://moodle2.units.it/pluginfile.php/556128/mod_resource/content/3/Giansante%202015%20Writing-for-Audio-Guides-short.pdf , https://www.guide-id.com/newsroom/how-to-increase-museum-engagement-with-audio-tips-and-tricks
- [51] ACMI Labs, Audience response to Scorsese audio guide (Wayback 2024-12-25 보관본으로 열람, 직접 열람은 403). https://labs.acmi.net.au/audience-response-to-scorsese-audio-guide-509c4c624451
- [52] Rick Steves, Audio Tours (2026-10-13 열람). https://www.ricksteves.com/audiotours
- [53] Atlas Obscura, FAQ (검색 요약). https://assets.atlasobscura.com/faq
- [54] Poynter, Vicki Krueger, 6 tips for writing photo captions (2017-05-15). https://www.poynter.org/news/6-tips-writing-photo-captions
- [55] Google Earth Engine, Timelapse (2026-10-13 열람) / NASA Landsat Science, Google Earth has updated their Landsat-based Timelapse (검색 요약). https://earthengine.google.com/timelapse/ , https://landsat.gsfc.nasa.gov/article/google-earth-has-updated-their-landsat-based-timelapse
- [56] United Nations, Declaration on the Rights of Indigenous Peoples (2007-09-13 채택). https://www.un.org/development/desa/indigenouspeoples/wp-content/uploads/sites/19/2018/11/UNDRIP_E_web.pdf
- [57] Wikipedia, Aoraki / Mount Cook (2026-10-13 열람) / Ngāi Tahu Claims Settlement Act 1998, Schedule 14 (검색 요약). https://en.wikipedia.org/wiki/Aoraki_/_Mount_Cook , https://www.nzlii.org/nz/legis/consol_act/ntcsa1998268/sch14.html
- [58] The White House, Restoring Names That Honor American Greatness (2025-01-20). https://www.whitehouse.gov/presidential-actions/2025/01/restoring-names-that-honor-american-greatness/
- [59] 보도 모음 (검색 요약): 내무부 시행 보도 / KMXT, 머코스키 재변경 시도 (2025-12-09) / 알래스카 주의회 결의 보도. https://okcfox.com/news/nation-world/interior-department-implements-gulf-of-america-and-mount-mckinley-name-changes-denali-gulf-of-mexico-trump-administration-board-on-geographic-names-alaska , https://www.kmxt.org/alaska-statewide-news/2025-12-09/murkowski-tries-again-to-change-mountains-name-to-denali , https://www.yahoo.com/news/alaska-legislature-asks-trump-retain-211330826.html
- [60] Wikidata, 세계유산 ID 509 항목의 라벨 (2026-10-13 조회). https://www.wikidata.org/wiki/Q139989268
- [61] Climate Outreach, Climate Visuals evidence base / Seven principles for visual climate change communication (검색 요약). https://climatevisuals.org/evidence/ , https://www.preventionweb.net/publications/view/52298
- [62] GLAMOS 보고 보도 (검색 요약): Turtle Island News/AP (2025-10-01) / NPR via KUOW (2026-09-30). https://theturtleislandnews.com/index.php/2025/10/01/swiss-glaciers-shrank-3-this-year-the-fourth-biggest-retreat-on-record-experts-say/ , https://www.kuow.org/npr-news/2026-09-30/swiss-glaciers-suffer-another-year-of-record-ice-loss
- [63] 자체 측정, macOS `say` 낭독 속도 — 한국어 Yuna, 영어 Samantha 기본 속도 (2026-10-13). 로컬 측정, URL 없음.
- [64] Wikimedia Commons API, imageinfo extmetadata 응답 예 (2026-10-13 호출). https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=Baengnokdam&gsrlimit=1&prop=imageinfo&iiprop=extmetadata
- [65] ElevenLabs, Terms of Service — 1(c) Use Restrictions (Last Updated 2026-10-09). https://elevenlabs.io/terms-of-use

---

## 검증 (2026-10-13)

반박을 목표로 1차 출처를 다시 열었다. 위키 수치는 같은 방법으로 다시 셌다.

| 주장 | 판정 | 바로잡은 내용 | 출처 |
|---|---|---|---|
| UNESCO 신디케이션은 개인·비상업·서면 허가·변경 금지 | 확인 | 원문 그대로다. 원문 링크와 "Copyright © 1992 - [올해] UNESCO/World Heritage Centre. All rights reserved." 고지도 필수다. 피드에 없는 부분은 스크래핑도 금지다. 유료 라이선스는 '특정 자료' 신디케이션용이고 거절될 수 있다. | [8] Wayback 2026-09-22 |
| 위키백과를 고치거나 옮기면 CC BY-SA 4.0 | 확인 | CC BY-SA 고지와 라이선스 링크도 붙여야 한다. CC FAQ는 각색 여부가 각국 법에 달렸다고 단서를 단다. | [1][3] |
| Wikidata 266개 항목의 보유율 | 확인(재현) | 숫자가 그대로 나왔다. 266개는 P757 값이 숫자만인 항목이다. 2007년 목록에서 빠진 아라비아오릭스 보호구역과 ID가 겹치는 항목이 섞여 있다. 293개로 넓혀도 비율 차이는 1%p 안이다. | [5] SPARQL·API 재집계 |
| 한국어 위키백과 50%, 길이 1/7 | 확인(재현) | 284·141·234건, 중앙값 2,441·17,781바이트, 비율 0.157이 그대로 나왔다. 공식 목록은 자연 240·복합 42 = 282건이다(WHC 목록 2026-10-03 보관본). 3,000바이트 미만은 재측정에서 78건이다. | [30], whc.unesco.org/en/list |
| 울룰루 민감 지점·북동면·VR·360 | 확인 | 4.1.4, 4.1.5, 5.10 문구가 그대로다. 북동면 이미지는 상업 이용 전에 승인을 받아야 한다. VR·360은 사안별 심사, 사전 승인 지점에 한정된다. 문서 본문은 "2018-02 작성, 2021 갱신"이라 쓰고 파일은 2022-05 생성이다. | [21][22] |
| CLOVA Voice는 실시간 호출만 | 확인 | 생성한 음성 파일의 재판매도 금지다. 정책 표에서 '파일 다운로드'는 X다. | [42] |
| Google TTS 가격·한국어 41개 | 확인 | Chirp 3 HD 30, Standard 4, WaveNet 4, Neural2 3개다. Gemini 3.8 Flash TTS 미리보기 가격은 2027-01-01부터 입력 $1, 출력 $18로 두 배가 된다. | [35][36] |
| ElevenLabs 상업 이용은 유료부터 | 확인 | 가격과 크레딧이 그대로다. 무료=비상업은 이용약관으로 확인했다. 출처 표기 의무는 도움말이 403이라 (미확인). Starter·Creator 첫 달 할인은 별도다. | [39][65] |
| 생성형 검색 51.5%·74.5% | 확인 | 대상은 Bing Chat, NeevaAI, perplexity.ai, YouChat이다. | [33] 초록 |
| EBU·BBC 45%·31%·20% | 확인 | 22개 공영 방송사가 참여했다. Gemini는 76%에 중대한 문제가 있었다. | [34] |
| NASA EO 이전과 이용 조건 | 확인 | 같은 지침 페이지 머리말은 "NASA Insignia, Logotype, identifiers, and imagery are not in the public domain"이라고도 쓴다. 그래서 요약 3번을 '미국 안에서 대체로 공공 영역'으로 고쳤다. 옛 주소 일부는 해당 글로, 일부는 EO 첫 화면으로 간다. | [12][13][14] |
| 디날리 2025-01-20 행정명령 | 확인 | 명령은 내무장관에게 30일 안에 이름을 되살리라고 했다. 내무부는 2025-01-24에 시행을 발표했다. 머코스키 법안(S.573)의 2026-10 현재 상태는 (미확인). | [58], doi.gov/node/61391 |
| 국가유산청 공공누리 표시 | 확인 | API 응답과 포털 상세 본문에 유형 표시가 없고 메타 태그는 "ALL RIGHTS RESERVED"다. 포털 검색에는 공공누리 유형 필터가 있어 사진·영상 일부는 유형이 붙어 있을 수 있다 (미확인). | [25][26] |
| 오디오 정거장 약 90초 | 확인(1차 출처로 올림) | 저자는 Lou Giansante, 글은 Art Beyond Sight에 실렸다. 90초는 시각 관람객용 투어 기준이다. 화면 해설 투어는 2.5~3.5분이었다. | [50] |
| Parks Canada 약관 적용 여부 | 바로잡음 | 미확인 → Parks Canada 약관(2026-07-13)도 비상업 자유, 상업 재배포는 사전 서면 허가다. | [19] |
| DeepL API 요금 | 바로잡음 | 미확인 → Developer 무료(월 100만 자), Growth 월 €29.75 + 100만 자당 €22 (독일·EUR). | [45] |
| Smithsonian 규모 | 바로잡음 | 510만(검색 요약) → CC0 레코드 1,745만, CC0 이미지 레코드 526만 (2026-10). | [15] |
| 아오라키 '유일한 예' | 바로잡음 | 1998년 법으로 바뀐 이름 안에서 유일하다. | [57] |
| ACMI 평균 이용 14분 | 확인 | 콘텐츠 45분짜리 전시 가이드 한 곳의 사례다. 일반화하지 않는다. | [51] |
