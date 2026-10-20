/**
 * ==============================================================================
 * 🥔 감자마켓 (Gamja Market) - Supabase 실시간 클라우드 DB 연동 스크립트 (app.js)
 * ==============================================================================
 * [초보자 교육용 가이드]
 * 이 스크립트는 가짜(Mock) 데이터를 벗어나, 실제 클라우드 데이터베이스(Supabase)와
 * 직접 통신하여 상품을 조회하고, 등록하고, 수정(좋아요)하는 완전한 기능을 제공합니다.
 *
 * 1. Supabase 접속 설정:
 *    - URL 및 ANON_KEY(안전한 공개 키)를 통해 클라이언트 객체를 생성합니다.
 *    - 관리자 키(SERVICE_ROLE_KEY)는 브라우저 코드에 절대 포함하지 않아 안전합니다.
 * 2. 화면 1 (목록):
 *    - supabase.from('products').select('*, profiles(*)') 로 클라우드 DB에서 최신 상품을 조회합니다.
 *    - 검색어, 카테고리 필터, '거래 가능만 보기' 토글이 실시간으로 동작합니다.
 * 3. 화면 2 (상세 모달):
 *    - 상품 카드 클릭 시 DB에서 받아온 판매자 프로필(익명 닉네임, 매너온도, 지역)을 보여줍니다.
 *    - [관심] 버튼을 누르면 DB의 likes_count가 1 증가/감소하여 클라우드에 실제 저장됩니다.
 * 4. 화면 3 (글쓰기):
 *    - [작성 완료] 버튼을 누르면 Supabase products 테이블에 INSERT 됩니다.
 *    - 새로고침을 해도 내가 올린 상품이 사라지지 않고 영구 보존됩니다!
 * ==============================================================================
 */

// 1. Supabase 프로젝트 접속 설정 (보안이 적용된 공개 접근 키 사용)
const SUPABASE_PROJECT_URL = "https://tcipmwpvcpqqxqcywqkz.supabase.co";
const SUPABASE_PUBLIC_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjaXBtd3B2Y3BxcXhxY3l3cWt6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0ODk2MzYsImV4cCI6MjEwODA2NTYzNn0.nZahHFNgcZ8Gz7wdDGJlqbigVKEDgJm5oBdQCNL1M_s";

// Supabase 클라이언트 생성 (CDN으로 로드된 window.supabase 활용)
const supabase = window.supabase ? window.supabase.createClient(SUPABASE_PROJECT_URL, SUPABASE_PUBLIC_ANON_KEY) : null;

// 기본 대체 감자 이미지 (이미지 미입력 또는 로딩 실패 시 사용)
const DEFAULT_POTATO_IMG = "https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=600&auto=format&fit=crop&q=80";

// 기본 익명 판매자 UUID (새 상품 등록 시 연결할 기본 프로필)
const DEFAULT_SELLER_ID = "11111111-1111-1111-1111-111111111111"; // 감자조아

/**
 * 2. 전역 상태(State) 관리
 */
let productList = []; // Supabase 클라우드 DB에서 불러온 상품 배열
let currentDetailProduct = null; // 현재 상세 팝업 모달에 열려 있는 상품 객체

const state = {
  currentCategory: "전체",   // 현재 선택된 카테고리 (기본값: '전체')
  searchKeyword: "",         // 검색창 입력 키워드
  isAvailableOnly: false     // '거래 가능만 보기' 체크 여부
};


/* ==============================================================================
   3. [공통 유틸리티 함수]
   ============================================================================== */

/**
 * 숫자를 한국 원화 형식으로 포맷팅 (0원일 경우 나눔 뱃지 표시)
 * @param {number} price
 * @returns {string} 예: "45,000원" 또는 "무료 나눔 🧡"
 */
function formatPrice(price) {
  if (price === 0) return "무료 나눔 🧡";
  return price.toLocaleString("ko-KR") + "원";
}

/**
 * 판매 상태 문자열에 맞는 CSS 클래스명 반환
 * @param {string} status ('판매중' | '예약중' | '거래완료')
 * @returns {string} CSS 클래스명
 */
function getStatusClass(status) {
  if (status === "예약중") return "reserved";
  if (status === "거래완료" || status === "거래 완료") return "completed";
  return "selling";
}

/**
 * 데이터베이스의 ISO 날짜 문자열을 한국어 상대 시간으로 변환
 * @param {string} dateString ISO 8601 일시 (예: "2026-10-20T11:45:00Z")
 * @returns {string} 예: "방금 전", "5분 전", "3시간 전", "2일 전"
 */
function formatTimeAgo(dateString) {
  if (!dateString) return "방금 전";

  const date = new Date(dateString);
  const now = new Date();
  const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffSeconds < 60) return "방금 전";
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}분 전`;
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}시간 전`;
  if (diffSeconds < 86400 * 7) return `${Math.floor(diffSeconds / 86400)}일 전`;
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}


/* ==============================================================================
   4. [화면 1] Supabase 클라우드 DB 상품 불러오기 및 렌더링
   ============================================================================== */

/**
 * Supabase 클라우드 데이터베이스에서 상품 목록 및 판매자 프로필을 JOIN하여 가져오는 함수
 */
async function loadProductsFromSupabase() {
  const productGrid = document.getElementById("productGrid");

  if (!supabase) {
    console.error("Supabase 클라이언트가 초기화되지 않았습니다.");
    return;
  }

  try {
    // products 테이블과 연결된 profiles 테이블 정보를 함께 조회합니다 (id 기준 내림차순 정렬)
    const { data, error } = await supabase
      .from("products")
      .select(`
        id,
        seller_id,
        title,
        category,
        price,
        location,
        status,
        image_url,
        description,
        likes_count,
        created_at,
        profiles (
          id,
          nickname,
          avatar_url,
          region,
          manner_temp
        )
      `)
      .order("id", { ascending: false });

    if (error) {
      console.error("상품 목록 조회 실패:", error);
      if (productGrid) {
        productGrid.innerHTML = `
          <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #D9381E;">
            ⚠️ Supabase 데이터베이스 연결 중 오류가 발생했습니다.<br/>(${error.message})
          </div>
        `;
      }
      return;
    }

    // 성공적으로 가져온 데이터를 전역 productList에 저장
    productList = data || [];
    console.log(`🥔 Supabase로부터 ${productList.length}개의 실제 상품 데이터를 불러왔습니다.`);

    // 화면 필터링 및 렌더링 실행
    filterAndRender();

  } catch (err) {
    console.error("데이터 로드 예외 발생:", err);
  }
}

/**
 * 상품 1건에 대한 HTML 카드를 생성하는 함수
 * @param {object} item 상품 데이터
 * @returns {string} HTML 템플릿 문자열
 */
function createProductCardHTML(item) {
  const statusClass = getStatusClass(item.status);
  const isCompleted = item.status === "거래완료" || item.status === "거래 완료";
  const completedModifier = isCompleted ? "is-completed" : "";
  const timeText = formatTimeAgo(item.created_at);

  return `
    <article class="product-card ${completedModifier}" onclick="openProductModalById(${item.id})">
      <!-- 썸네일 이미지 영역 (상단 배지 포함) -->
      <div class="product-thumb-box">
        <span class="status-badge ${statusClass}">${item.status}</span>
        <img 
          src="${item.image_url || DEFAULT_POTATO_IMG}" 
          alt="${item.title}" 
          class="product-thumb" 
          loading="lazy"
          onerror="this.src='${DEFAULT_POTATO_IMG}'"
        />
      </div>

      <!-- 카드 하단 정보 텍스트 영역 -->
      <div class="product-info">
        <h3 class="product-card-title" title="${item.title}">${item.title}</h3>
        
        <div class="product-meta-row">
          <span>${item.location}</span>
          <span class="dot">•</span>
          <span>${timeText}</span>
        </div>

        <div class="product-price-row">
          <span class="product-card-price">${formatPrice(item.price)}</span>
          <span class="product-card-category">${item.category}</span>
        </div>
      </div>
    </article>
  `;
}

/**
 * 필터링된 배열을 받아 화면의 상품 그리드를 갱신하는 함수
 * @param {Array} products 
 */
function renderProductList(products) {
  const productGrid = document.getElementById("productGrid");
  const totalCount = document.getElementById("totalCount");
  const emptyState = document.getElementById("emptyState");

  if (!productGrid) return;

  // 총 상품 개수 표시
  if (totalCount) {
    totalCount.textContent = products.length;
  }

  // 검색/필터 결과가 없을 경우 빈 화면 표시
  if (products.length === 0) {
    productGrid.innerHTML = "";
    if (emptyState) emptyState.style.display = "block";
    return;
  }

  // 상품이 존재할 때
  if (emptyState) emptyState.style.display = "none";
  productGrid.innerHTML = products.map(item => createProductCardHTML(item)).join("");
}

/**
 * 카테고리, 검색어, 거래가능 토글 상태를 종합해 데이터를 필터링하고 화면을 다시 그리는 함수
 */
function filterAndRender() {
  const filtered = productList.filter(item => {
    // 1) 카테고리 필터링
    const matchCategory = (state.currentCategory === "전체") || (item.category === state.currentCategory);

    // 2) 검색어 실시간 필터링 (제목 대소문자 무관 검색)
    const keyword = state.searchKeyword.trim().toLowerCase();
    const matchKeyword = keyword === "" || item.title.toLowerCase().includes(keyword);

    // 3) 거래 가능만 보기 필터링 (켜져 있으면 거래완료 제외)
    const isCompleted = item.status === "거래완료" || item.status === "거래 완료";
    const matchAvailable = !state.isAvailableOnly || !isCompleted;

    return matchCategory && matchKeyword && matchAvailable;
  });

  renderProductList(filtered);
}

/**
 * 카테고리 버튼 클릭 핸들러
 */
function handleCategoryClick(event) {
  const btn = event.target.closest(".category-btn");
  if (!btn) return;

  // 버튼 active 스타일 갱신
  document.querySelectorAll(".category-btn").forEach(el => el.classList.remove("active"));
  btn.classList.add("active");

  // 상태 변경 후 화면 갱신
  state.currentCategory = btn.dataset.category;
  filterAndRender();
}

/**
 * 검색어 실시간 입력 이벤트 핸들러
 */
function handleSearchInput(event) {
  state.searchKeyword = event.target.value;
  filterAndRender();
}

/**
 * '거래 가능만 보기' 토글 변경 이벤트 핸들러
 */
function handleToggleChange(event) {
  state.isAvailableOnly = event.target.checked;
  filterAndRender();
}

/**
 * 로고 클릭 시 모든 필터 초기화
 */
function resetFilters(event) {
  if (event) event.preventDefault();

  state.currentCategory = "전체";
  state.searchKeyword = "";
  state.isAvailableOnly = false;

  const searchInput = document.getElementById("searchInput");
  const availableToggle = document.getElementById("availableToggle");

  if (searchInput) searchInput.value = "";
  if (availableToggle) availableToggle.checked = false;

  document.querySelectorAll(".category-btn").forEach(el => {
    if (el.dataset.category === "전체") {
      el.classList.add("active");
    } else {
      el.classList.remove("active");
    }
  });

  filterAndRender();
}

/**
 * 상단 로그인 버튼 클릭 안내 (자리용)
 */
function handleLoginClick() {
  alert("🥔 감자마켓 로그인 기능은 다음 단계(인증/회원가입 파트)에서 연결될 예정입니다!");
}


/* ==============================================================================
   5. [화면 2] 상품 상세 팝업 (모달) 기능 & 관심(좋아요) DB 연동
   ============================================================================== */

/**
 * 상품 ID로 상세 모달을 열어주는 진입 함수
 * @param {number} productId 
 */
function openProductModalById(productId) {
  const found = productList.find(item => item.id === productId);
  if (found) {
    openProductModal(found);
  }
}

/**
 * 상세 모달을 띄우고 전달받은 데이터를 각 HTML 요소에 바인딩
 * @param {object} product 상품 객체
 */
function openProductModal(product) {
  currentDetailProduct = product;

  const modal = document.getElementById("productDetailModal");
  if (!modal) return;

  // 1. 상단 대표 이미지
  const imgEl = document.getElementById("modalProductImg");
  imgEl.src = product.image_url || DEFAULT_POTATO_IMG;
  imgEl.alt = product.title;
  imgEl.onerror = () => { imgEl.src = DEFAULT_POTATO_IMG; };

  // 2. 판매 상태 배지
  const badgeEl = document.getElementById("modalProductBadge");
  const statusClass = getStatusClass(product.status);
  badgeEl.className = `status-badge ${statusClass}`;
  badgeEl.textContent = product.status;

  // 3. 카테고리
  document.getElementById("modalProductCategory").textContent = product.category;

  // 4. 상품명
  document.getElementById("modalProductTitle").textContent = product.title;

  // 5. 판매 위치 & 업로드 시간
  document.getElementById("modalProductLocation").textContent = product.location;
  document.getElementById("modalProductTimeAgo").textContent = formatTimeAgo(product.created_at);

  // 6. 가격
  document.getElementById("modalProductPrice").textContent = formatPrice(product.price);

  // 7. 상품 설명
  document.getElementById("modalProductDescription").textContent = product.description || "작성된 상세 설명이 없습니다.";

  // 8. 판매자 정보 (Supabase profiles 테이블에서 JOIN된 실제 데이터)
  const seller = product.profiles || {
    nickname: "동네감자",
    manner_temp: 36.5,
    region: product.location,
    avatar_url: DEFAULT_POTATO_IMG
  };

  const sellerAvatarEl = document.getElementById("modalSellerAvatar");
  sellerAvatarEl.src = seller.avatar_url || DEFAULT_POTATO_IMG;
  sellerAvatarEl.alt = `${seller.nickname}님의 프로필`;

  document.getElementById("modalSellerNickname").textContent = seller.nickname;
  document.getElementById("modalSellerRegion").textContent = seller.region || product.location;
  
  // 매너온도 계산 및 게이지 바 세팅
  const mannerTemp = Number(seller.manner_temp) || 36.5;
  document.getElementById("modalSellerMannerTemp").textContent = `${mannerTemp.toFixed(1)}℃`;
  const gaugePercent = Math.min(Math.max((mannerTemp / 60) * 100, 10), 100);
  document.getElementById("modalMannerProgressBar").style.width = `${gaugePercent}%`;

  // 9. 관심 버튼 상태 업데이트
  updateDetailLikeButtonUI(Boolean(product.isLiked), product.likes_count || 0);

  // 모달 표시 및 배경 스크롤 방지
  modal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

/**
 * 상세 모달 닫기
 */
function closeProductModal() {
  const modal = document.getElementById("productDetailModal");
  if (modal) {
    modal.classList.add("hidden");
    document.body.style.overflow = "auto";
  }
}

/**
 * 관심(하트) 토글 버튼 클릭 처리 (Supabase DB likes_count 실시간 UPDATE)
 */
async function toggleLike() {
  if (!currentDetailProduct || !supabase) return;

  const isCurrentlyLiked = Boolean(currentDetailProduct.isLiked);
  const newIsLiked = !isCurrentlyLiked;
  const change = newIsLiked ? 1 : -1;
  const newCount = Math.max(0, (currentDetailProduct.likes_count || 0) + change);

  // 1) 메모리 상태 선반영 (즉각적인 사용자 반응성)
  currentDetailProduct.isLiked = newIsLiked;
  currentDetailProduct.likes_count = newCount;
  updateDetailLikeButtonUI(newIsLiked, newCount);

  // 2) Supabase 클라우드 데이터베이스에 실시간 UPDATE
  try {
    const { error } = await supabase
      .from("products")
      .update({ likes_count: newCount })
      .eq("id", currentDetailProduct.id);

    if (error) {
      console.error("좋아요 DB 업데이트 실패:", error);
    } else {
      console.log(`🥔 상품 [${currentDetailProduct.id}]의 관심 수가 ${newCount}개로 DB에 저장되었습니다.`);
    }
  } catch (err) {
    console.error("좋아요 업데이트 예외:", err);
  }
}

/**
 * 관심 버튼 UI 갱신 함수
 */
function updateDetailLikeButtonUI(isLiked, count) {
  const btn = document.getElementById("btnDetailLike");
  const heartIcon = document.getElementById("likeHeartIcon");
  const countText = document.getElementById("likeCountText");

  if (!btn) return;

  if (isLiked) {
    btn.classList.add("is-liked");
    heartIcon.textContent = "♥";
  } else {
    btn.classList.remove("is-liked");
    heartIcon.textContent = "♡";
  }
  countText.textContent = `(${count})`;
}

/**
 * [채팅 시작하기] 버튼 클릭 안내 (자리용)
 */
function handleChatClick() {
  if (!currentDetailProduct) return;
  const sellerName = currentDetailProduct.profiles?.nickname || "판매자";
  alert(`🥔 [${sellerName}]님과의 1:1 감자채팅창이 준비 중입니다!`);
}


/* ==============================================================================
   6. [화면 3] 상품 등록 글쓰기 기능 (Supabase DB 실제 INSERT)
   ============================================================================== */

/**
 * 글쓰기 모달 열기
 */
function openWriteModal() {
  const modal = document.getElementById("writeModal");
  if (modal) {
    modal.classList.remove("hidden");
    document.body.style.overflow = "hidden";
  }
}

/**
 * 글쓰기 모달 닫기 및 폼 리셋
 */
function closeWriteModal() {
  const modal = document.getElementById("writeModal");
  const form = document.getElementById("writeProductForm");

  if (modal) {
    modal.classList.add("hidden");
    document.body.style.overflow = "auto";
  }

  if (form) {
    form.reset();
  }

  // 미리보기 및 0원 나눔 뱃지 초기화
  handleImagePreview(DEFAULT_POTATO_IMG);
  handlePriceChange("");
}

/**
 * 이미지 URL 입력 시 실시간 미리보기 갱신
 * @param {string} url
 */
function handleImagePreview(url) {
  const previewImg = document.getElementById("imagePreview");
  if (!previewImg) return;

  const cleanUrl = url ? url.trim() : "";
  if (cleanUrl !== "") {
    previewImg.src = cleanUrl;
    previewImg.onerror = () => { previewImg.src = DEFAULT_POTATO_IMG; };
  } else {
    previewImg.src = DEFAULT_POTATO_IMG;
  }
}

/**
 * 추천 감자 프리셋 이미지 원클릭 적용
 * @param {string} presetUrl 
 */
function applyImagePreset(presetUrl) {
  const imageInput = document.getElementById("productImage");
  if (imageInput) {
    imageInput.value = presetUrl;
    handleImagePreview(presetUrl);
  }
}

/**
 * 가격 입력 감지: 0원이 입력되면 '따뜻한 무료 나눔' 뱃지 표시
 * @param {string|number} value 
 */
function handlePriceChange(value) {
  const badge = document.getElementById("freeShareBadge");
  if (!badge) return;

  const num = Number(value);
  if (value !== "" && num === 0) {
    badge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
  }
}

/**
 * 글쓰기 폼 제출 핸들러 (Supabase DB에 실제 INSERT 저장)
 * @param {Event} event 
 */
async function handleProductSubmit(event) {
  event.preventDefault();

  const btnSubmit = document.getElementById("btnSubmitProduct");

  // 1) 폼 필드 엘리먼트 가져오기
  const titleInput = document.getElementById("productTitle");
  const categorySelect = document.getElementById("productCategory");
  const priceInput = document.getElementById("productPrice");
  const locationInput = document.getElementById("productLocation");
  const descInput = document.getElementById("productDescription");
  const imageInput = document.getElementById("productImage");
  const statusRadio = document.querySelector('input[name="productStatus"]:checked');

  const title = titleInput.value.trim();
  const category = categorySelect.value;
  const priceVal = priceInput.value.trim();
  const location = locationInput.value.trim();
  const description = descInput ? descInput.value.trim() : "";
  const imageUrl = (imageInput && imageInput.value.trim()) ? imageInput.value.trim() : DEFAULT_POTATO_IMG;
  const status = statusRadio ? statusRadio.value : "판매중";

  // 2) 유효성 검사
  if (!title) {
    alert("🥔 상품명을 입력해주세요!");
    titleInput.focus();
    return;
  }

  if (!category) {
    alert("🥔 카테고리를 선택해주세요!");
    categorySelect.focus();
    return;
  }

  if (priceVal === "" || isNaN(Number(priceVal)) || Number(priceVal) < 0) {
    alert("🥔 올바른 가격을 입력해주세요! (0원 이상)");
    priceInput.focus();
    return;
  }

  if (!location) {
    alert("🥔 거래할 동네를 입력해주세요!");
    locationInput.focus();
    return;
  }

  // 3) Supabase DB INSERT 요청 객체 구성 (개인식별정보 없음)
  const newProductPayload = {
    seller_id: DEFAULT_SELLER_ID,
    title: title,
    category: category,
    price: Number(priceVal),
    location: location,
    status: status,
    image_url: imageUrl,
    description: description,
    likes_count: 0
  };

  // 버튼 비활성화 (중복 제출 방지)
  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.textContent = "수파베이스에 저장 중... 🥔";
  }

  try {
    // 4) Supabase products 테이블에 INSERT
    const { data, error } = await supabase
      .from("products")
      .insert([newProductPayload])
      .select(`
        id,
        seller_id,
        title,
        category,
        price,
        location,
        status,
        image_url,
        description,
        likes_count,
        created_at,
        profiles (
          id,
          nickname,
          avatar_url,
          region,
          manner_temp
        )
      `);

    if (error) {
      console.error("상품 등록 실패:", error);
      alert(`🥔 상품 등록 실패: ${error.message}`);
      return;
    }

    console.log("🥔 Supabase DB에 새 상품 등록 완료:", data);

    // 5) 최신 상품을 목록 배열 최상단(unshift)에 추가
    if (data && data.length > 0) {
      productList.unshift(data[0]);
    } else {
      // 혹시 데이터가 즉시 반환되지 않은 경우 DB 전체 재조회
      await loadProductsFromSupabase();
    }

    // 6) 카테고리 필터를 '전체'로 맞추고 목록 화면 재렌더링
    state.currentCategory = "전체";
    document.querySelectorAll(".category-btn").forEach(el => {
      if (el.dataset.category === "전체") el.classList.add("active");
      else el.classList.remove("active");
    });
    filterAndRender();

    // 7) 모달 닫기
    closeWriteModal();

    // 8) 새로 등록된 상품을 볼 수 있도록 최상단으로 부드럽게 스크롤 이동
    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });

    alert("🥔 축하합니다! 새 상품이 Supabase 데이터베이스에 안전하게 저장되었습니다.\n(새로고침을 해도 사라지지 않습니다!)");

  } catch (err) {
    console.error("등록 예외 발생:", err);
    alert("오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
  } finally {
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.textContent = "작성 완료 🥔";
    }
  }
}


/* ==============================================================================
   7. [키보드 & 배경 클릭 이벤트 리스너]
   ============================================================================== */

// ESC 키를 누르면 열려 있는 모달을 닫음
document.addEventListener("keydown", function(e) {
  if (e.key === "Escape") {
    closeProductModal();
    closeWriteModal();
  }
});

// 모달 바깥 어두운 배경(오버레이)을 클릭했을 때 모달 닫기
document.addEventListener("click", function(e) {
  const detailModal = document.getElementById("productDetailModal");
  const writeModal = document.getElementById("writeModal");

  if (e.target === detailModal) {
    closeProductModal();
  }
  if (e.target === writeModal) {
    closeWriteModal();
  }
});


/* ==============================================================================
   8. [애플리케이션 진입 초기화 (init)]
   ============================================================================== */
function init() {
  const searchInput = document.getElementById("searchInput");
  const categoryList = document.getElementById("categoryList");

  if (searchInput) {
    searchInput.addEventListener("input", handleSearchInput);
  }
  if (categoryList) {
    categoryList.addEventListener("click", handleCategoryClick);
  }

  // Supabase 클라우드 데이터베이스로부터 실시간 데이터 로드 시작
  loadProductsFromSupabase();

  console.log("🥔 감자마켓 Supabase 실시간 연동 초기화 완료!");
}

// 브라우저 DOM 로드가 완료되면 실행
document.addEventListener("DOMContentLoaded", init);
