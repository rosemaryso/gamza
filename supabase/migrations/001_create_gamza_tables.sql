-- ==============================================================================
-- 🥔 감자마켓 (Gamja Market) 데이터베이스 구축 마이그레이션 스크립트
-- ==============================================================================
-- 파일명: 001_create_gamza_tables.sql
-- 설명: 
-- 1. 개인 식별 정보(실명, 이메일, 전화번호)를 전혀 수집하지 않는 프라이버시 중심 설계
-- 2. profiles: 익명 닉네임, 프로필 사진, 활동 지역, 매너온도를 보관하는 테이블
-- 3. products: 상품 정보(제목, 카테고리, 가격, 상태, 이미지 등)를 보관하는 테이블
-- 4. product_likes: 사용자의 상품 관심(좋아요) 내역을 보관하는 테이블
-- 5. Row Level Security (RLS) 정책을 적용하여 안전한 데이터 읽기/쓰기 보장
-- ==============================================================================

-- 1. 기존 테이블이 있다면 깨끗하게 정리 (외래키 제약조건 역순 삭제)
DROP TABLE IF EXISTS public.product_likes CASCADE;
DROP TABLE IF EXISTS public.products CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;


-- ==============================================================================
-- 2. 사용자 프로필 테이블 (profiles) 생성
-- [보안 정책] 실명, 이메일, 전화번호 등 PII(개인식별정보)는 일체 포함하지 않습니다.
-- ==============================================================================
CREATE TABLE public.profiles (
    -- 사용자의 고유 식별자 (난수 기반 UUID)
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- 화면에 표시될 익명 닉네임 (예: '포슬포슬이', '감자마스터')
    nickname VARCHAR(50) NOT NULL,
    
    -- 프로필 아바타 이미지 주소
    avatar_url TEXT DEFAULT 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80',
    
    -- 활동 동네 (상세 주소가 아닌 '동' 단위의 넓은 지역 정보만 저장)
    region VARCHAR(100) NOT NULL DEFAULT '서울시 강남구 역삼동',
    
    -- 감자마켓 매너온도 (기본 36.5도, 소수점 한자리)
    manner_temp NUMERIC(3, 1) NOT NULL DEFAULT 36.5 CHECK (manner_temp >= 0 AND manner_temp <= 100),
    
    -- 계정 생성 일시
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- profiles 테이블 한글 설명 코멘트 추가
COMMENT ON TABLE public.profiles IS '감자마켓 비식별 사용자 프로필 테이블 (이메일/전화번호 미수집)';
COMMENT ON COLUMN public.profiles.id IS '사용자 고유 UUID 식별자';
COMMENT ON COLUMN public.profiles.nickname IS '사용자가 설정한 익명 닉네임';
COMMENT ON COLUMN public.profiles.avatar_url IS '프로필 아바타 이미지 URL';
COMMENT ON COLUMN public.profiles.region IS '활동 지역 (동네 단위)';
COMMENT ON COLUMN public.profiles.manner_temp IS '매너온도 (기본값 36.5)';


-- ==============================================================================
-- 3. 상품 테이블 (products) 생성
-- [기능] 중고 거래 게시글의 모든 필수 정보 보관
-- ==============================================================================
CREATE TABLE public.products (
    -- 상품 고유 일련번호 (자동 증가 BIGINT)
    id BIGSERIAL PRIMARY KEY,
    
    -- 판매자 외래키 (profiles 테이블의 UUID 참조)
    seller_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    
    -- 상품명 (제목)
    title VARCHAR(150) NOT NULL,
    
    -- 카테고리 (디지털기기, 가구/인테리어, 의류, 생활가전, 도서/티켓, 기타)
    category VARCHAR(50) NOT NULL,
    
    -- 판매 가격 (0원 이상, 0원은 무료 나눔)
    price INTEGER NOT NULL DEFAULT 0 CHECK (price >= 0),
    
    -- 거래 희망 동네 (예: 역삼동)
    location VARCHAR(100) NOT NULL,
    
    -- 판매 상태 ('판매중', '예약중', '거래완료')
    status VARCHAR(20) NOT NULL DEFAULT '판매중' CHECK (status IN ('판매중', '예약중', '거래완료')),
    
    -- 대표 상품 이미지 주소
    image_url TEXT NOT NULL DEFAULT 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=600&auto=format&fit=crop&q=80',
    
    -- 상품 상세 설명 (줄바꿈 허용 긴 텍스트)
    description TEXT DEFAULT '',
    
    -- 관심(좋아요) 개수
    likes_count INTEGER NOT NULL DEFAULT 0 CHECK (likes_count >= 0),
    
    -- 등록 일시 및 최종 수정 일시
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- products 테이블 한글 설명 코멘트 추가
COMMENT ON TABLE public.products IS '중고거래 상품 게시글 테이블';
COMMENT ON COLUMN public.products.id IS '상품 고유 일련번호';
COMMENT ON COLUMN public.products.seller_id IS '판매자 프로필 고유 ID';
COMMENT ON COLUMN public.products.title IS '상품명';
COMMENT ON COLUMN public.products.category IS '카테고리';
COMMENT ON COLUMN public.products.price IS '판매 가격 (0원일 경우 나눔)';
COMMENT ON COLUMN public.products.location IS '거래 희망 동네';
COMMENT ON COLUMN public.products.status IS '판매 상태 (판매중 / 예약중 / 거래완료)';
COMMENT ON COLUMN public.products.image_url IS '대표 이미지 URL';
COMMENT ON COLUMN public.products.description IS '상품 상세 설명';
COMMENT ON COLUMN public.products.likes_count IS '관심 추가 수';


-- ==============================================================================
-- 4. 상품 관심(좋아요) 테이블 (product_likes) 생성
-- [기능] 사용자가 어떤 상품에 관심을 눌렀는지 기록
-- ==============================================================================
CREATE TABLE public.product_likes (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    
    -- 한 사용자가 같은 상품에 중복으로 관심을 누를 수 없도록 복합 유니크 제약
    CONSTRAINT unique_user_product_like UNIQUE (user_id, product_id)
);

COMMENT ON TABLE public.product_likes IS '상품 관심(좋아요) 매핑 테이블';


-- ==============================================================================
-- 5. Row Level Security (RLS) 보안 정책 설정
-- [원칙] 비회원도 상품 목록을 편하게 구경하고 등록해 볼 수 있도록 개방하되, 
--       데이터베이스 무결성을 유지합니다.
-- ==============================================================================

-- 1) profiles 보안 활성화 및 정책
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "누구나 프로필을 조회할 수 있습니다" 
ON public.profiles FOR SELECT 
USING (true);

CREATE POLICY "누구나 익명 프로필을 생성할 수 있습니다" 
ON public.profiles FOR INSERT 
WITH CHECK (true);

-- 2) products 보안 활성화 및 정책
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "누구나 상품 목록을 조회할 수 있습니다" 
ON public.products FOR SELECT 
USING (true);

CREATE POLICY "누구나 새 상품을 등록할 수 있습니다" 
ON public.products FOR INSERT 
WITH CHECK (true);

CREATE POLICY "누구나 상품 정보를 수정할 수 있습니다" 
ON public.products FOR UPDATE 
USING (true);

-- 3) product_likes 보안 활성화 및 정책
ALTER TABLE public.product_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "누구나 관심 목록을 조회할 수 있습니다" 
ON public.product_likes FOR SELECT 
USING (true);

CREATE POLICY "누구나 관심을 추가하거나 취소할 수 있습니다" 
ON public.product_likes FOR ALL 
USING (true);


-- ==============================================================================
-- 6. 초기 가짜 데이터 6종 시드 데이터 적재 (초기 구동용)
-- ==============================================================================

-- 1) 6명의 익명 판매자 프로필 등록 (이메일/실명 없음)
INSERT INTO public.profiles (id, nickname, avatar_url, region, manner_temp)
VALUES 
    ('11111111-1111-1111-1111-111111111111', '감자조아', 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80', '서울시 강남구 역삼동', 37.5),
    ('22222222-2222-2222-2222-222222222222', '포테이토킹', 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=100&auto=format&fit=crop&q=80', '서울시 서초구 서초동', 42.1),
    ('33333333-3333-3333-3333-333333333333', '따뜻한겨울', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop&q=80', '서울시 강남구 논현동', 36.5),
    ('44444444-4444-4444-4444-444444444444', '홈카페마스터', 'https://images.unsplash.com/photo-1527980965255-d3b416303d12?w=100&auto=format&fit=crop&q=80', '서울시 강남구 대치동', 39.8),
    ('55555555-5555-5555-5555-555555555555', '책읽는감자', 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&auto=format&fit=crop&q=80', '서울시 강남구 역삼동', 38.2),
    ('66666666-6666-6666-6666-666666666666', '캠퍼포테토', 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&auto=format&fit=crop&q=80', '서울시 서초구 양재동', 36.8)
ON CONFLICT (id) DO NOTHING;

-- 2) 가짜 상품 6종 등록
INSERT INTO public.products (id, seller_id, title, category, price, location, status, image_url, description, likes_count, created_at)
VALUES
    (
        1,
        '11111111-1111-1111-1111-111111111111',
        '아이패드 에어 5세대 64GB WiFi 스페이스그레이 (풀박스)',
        '디지털기기',
        580000,
        '역삼동',
        '판매중',
        'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=600&auto=format&fit=crop&q=80',
        '실사용 3개월 미만이고 배터리 효율 99%입니다. 강화유리 필름 붙어있고 정품 충전 케이블 함께 드립니다. 역삼역 3번 출구 직거래 희망합니다 🥔',
        5,
        now() - INTERVAL '10 minutes'
    ),
    (
        2,
        '22222222-2222-2222-2222-222222222222',
        '원목 감성 빈티지 침대 협탁 사이드테이블',
        '가구/인테리어',
        35000,
        '서초동',
        '예약중',
        'https://images.unsplash.com/photo-1532372320572-cda25653a26d?w=600&auto=format&fit=crop&q=80',
        '이사 가게 되어 아끼던 원목 협탁 내놓습니다. 흠집 거의 없고 튼튼합니다. 부피가 있어 직접 차로 실어가셔야 해요!',
        12,
        now() - INTERVAL '45 minutes'
    ),
    (
        3,
        '33333333-3333-3333-3333-333333333333',
        '오버핏 베이지 울 케이블 니트 (Free 사이즈 남녀공용)',
        '의류',
        24000,
        '논현동',
        '판매중',
        'https://images.unsplash.com/photo-1576871337622-98d48d1cf531?w=600&auto=format&fit=crop&q=80',
        '집에서 시착만 해보고 보관 중인 사실상 새 옷입니다. 울 함유량 높아서 부드럽고 따뜻해요. 감자마켓 매너거래 원해요!',
        3,
        now() - INTERVAL '2 hours'
    ),
    (
        4,
        '44444444-4444-4444-4444-444444444444',
        '드롱기 데디카 반자동 에스프레소 커피머신',
        '생활가전',
        110000,
        '대치동',
        '거래완료',
        'https://images.unsplash.com/photo-1517668808822-9ebb02f2a0e6?w=600&auto=format&fit=crop&q=80',
        '가정에서 홈카페용으로 소중히 사용했습니다. 스팀 피처와 템퍼 함께 드립니다. 좋은 분께 거래 완료되었습니다.',
        18,
        now() - INTERVAL '5 hours'
    ),
    (
        5,
        '55555555-5555-5555-5555-555555555555',
        '베스트셀러 인문 소설 5권 일괄 판매',
        '도서/티켓',
        28000,
        '역삼동',
        '판매중',
        'https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=600&auto=format&fit=crop&q=80',
        '한 번씩만 정독해서 책 상태 아주 깨끗합니다. 형광펜 밑줄이나 접힘 전혀 없어요. 책 좋아하시는 분 연락주세요 📚',
        7,
        now() - INTERVAL '1 day'
    ),
    (
        6,
        '66666666-6666-6666-6666-666666666666',
        '캠핑용 감성 충전식 LED 레트로 랜턴 조명',
        '기타',
        18000,
        '양재동',
        '거래완료',
        'https://images.unsplash.com/photo-1508873696983-2df5703bc20d?w=600&auto=format&fit=crop&q=80',
        '캠핑 차박 갈 때 2번 정도 썼습니다. 은은한 불빛이 너무 예쁩니다. C타입 충전 케이블 동봉되어 있습니다.',
        9,
        now() - INTERVAL '2 days'
    )
ON CONFLICT (id) DO UPDATE 
SET 
    title = EXCLUDED.title,
    price = EXCLUDED.price,
    status = EXCLUDED.status,
    description = EXCLUDED.description;

-- BIGSERIAL 시퀀스 값 동기화 (새 상품 등록 시 7번부터 시작하도록)
SELECT setval('products_id_seq', (SELECT MAX(id) FROM public.products));
