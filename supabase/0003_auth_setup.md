# SB-0003 로그인 설정 안내 (구글·이메일) — 김PO 직접 입력용 v1.1

- 문서번호: SB-0003 / 작성: 김도현 / 받는 사람: 김PO / 날짜: 2026-10-13 / 상태: 입력 대기
- 판 기록: v1.0(DEV-25) → **v1.1: PO-DEC-006 §3 반영** — 복귀 주소를 정확한 주소 2개로 한정, DNS 는 기존 레코드 대조 후 추가(현재 레코드 조사 결과 포함), 익명 로그인은 영향 확인 후 끔, Free 요금제 명시
- 근거: PO-AUTH-001, PO-DEC-006, DEV-25 3절
- 이 파일에는 SQL 이 없습니다. 계정 월드 저장 SQL 은 SB-0004 로 드립니다.
- **비밀값(Google client secret, Resend API 키·SMTP 비밀번호)은 김도현·문서·채팅에 보내지 마세요.** 대시보드에만 넣고 "넣었어요"만 알려 주세요.
- 이 Supabase 프로젝트(`yvsqivhdwzbshpapfcsy`)와 새 Google Cloud 프로젝트는 동그란 사이 전용입니다.

## 정해진 주소 (김도현 확정)

| 용도 | 주소 |
|---|---|
| Google 이 돌려보내는 곳(Supabase 콜백) | `https://yvsqivhdwzbshpapfcsy.supabase.co/auth/v1/callback` |
| 로그인·메일 확인·비밀번호 재설정 후 게임으로 돌아오는 곳(운영) | `https://neinom.com/auth/` |
| 같은 용도(김도현 로컬 시험) | `http://localhost:4199/auth/` |
| Site URL | `https://neinom.com` |

`/auth/` 페이지는 로그인 코드를 만들 때 김도현이 추가합니다. 그 전에 등록해 두어도 문제없습니다.

## 순서 요약

| 순서 | 할 일 | 어디서 | 비용 |
|---|---|---|---|
| 1 | Google 로그인용 OAuth 클라이언트 만들기 | Google Cloud Console | 무료 |
| 2 | Supabase 에 Google 켜고 ID·secret 넣기 | Supabase | 무료 |
| 3 | Resend 가입, 도메인 추가, DNS 레코드 목록 받기 | Resend | Free(월 3,000통·일 100통, 가입 시 화면 한도 확인) |
| 4 | 레코드 목록을 김도현에게 보내 대조받기 → Cloudflare 에 추가 | Cloudflare | 무료 |
| 5 | Supabase SMTP·이메일 로그인 설정 | Supabase | 무료 |
| 6 | 주소 설정·메일 문구 | Supabase | — |
| 7 | 익명 로그인 영향 확인 후 끄기 | Supabase | — |
| 8 | 결과 알려 주기 | 김도현에게 | — |

## 1. Google Cloud Console — OAuth 클라이언트

1. https://console.cloud.google.com 에서 **새 프로젝트**를 만듭니다. 이름 예: `neinom-game1`. 다른 서비스용 프로젝트를 재사용하지 않습니다.
2. **Google Auth Platform**(또는 "API 및 서비스 → OAuth 동의 화면")
   - 사용자 유형: 외부(External)
   - 앱 이름: `동그란 사이`
   - 사용자 지원 이메일·개발자 연락처: 김PO 메일
   - 승인된 도메인: `neinom.com`
   - 범위: `openid`, `email`, `profile` 세 개만
3. **클라이언트 → OAuth 클라이언트 ID 만들기**
   - 유형: 웹 애플리케이션
   - 승인된 JavaScript 원본: `https://neinom.com`
   - 승인된 리디렉션 URI: `https://yvsqivhdwzbshpapfcsy.supabase.co/auth/v1/callback`
4. 클라이언트 ID 와 secret 을 복사해 둡니다(2단계에서 Supabase 에만 넣음).
5. 처음 상태는 "테스트"입니다. 테스트 사용자에 김PO 계정을 넣어 두면 시험할 수 있습니다. **앱 게시는 지금 하지 않습니다.** 게시와 Google 확인 필요 여부는 공개 전에 Google 화면에서 다시 확인합니다.

## 2. Supabase — Google 켜기

Authentication → Sign In / Providers → Google: Enable 켬, Client ID·Client Secret 입력, 저장.

## 3. Resend — 도메인 추가

1. https://resend.com 가입(Free). 결제 수단을 넣지 않습니다.
2. Domains → Add Domain → `neinom.com`, 지역은 기본값.
3. 화면에 나오는 **DNS 레코드 목록**(Type·Name·Value·TTL·Priority)을 그대로 복사합니다. 이 값들은 비밀이 아닙니다(공개 DNS 에 올라가는 값).
4. **Cloudflare 에 넣기 전에 김도현에게 보내 주세요.** 기존 레코드와 대조해 넣을 것만 표로 돌려드립니다.

### 현재 neinom.com DNS (2026-10-13 공개 조회, Cloudflare 관리)

| 이름 | 종류 | 값 |
|---|---|---|
| `neinom.com` | A ×4 | 185.199.108~111.153 (GitHub Pages) |
| `www.neinom.com` | CNAME | irupark1-wq.github.io |
| `neinom.com` | MX / TXT(SPF) | **없음** |
| `_dmarc.neinom.com` | TXT | **없음** |

Resend 는 보통 아래 레코드를 요구합니다(실제 값은 Resend 화면 기준).

| 이름 | 종류 | 용도 | 기존과 겹침 |
|---|---|---|---|
| `resend._domainkey` | TXT | DKIM(서명) | 없음 |
| `send` | MX | 반송 처리(서브도메인) | 없음, 루트 MX 아님 |
| `send` | TXT | SPF(서브도메인) | 없음, 루트 SPF 아님 |
| `_dmarc` | TXT | DMARC(선택) | 없음. 넣는다면 `v=DMARC1; p=none;` 처럼 영향 낮은 값만, 김PO 결정 후 |

지키는 것: 루트의 A·www CNAME(웹사이트)은 건드리지 않습니다. 루트 MX·루트 SPF 는 만들지 않습니다(메일 수신 없음). Cloudflare 에서 메일 레코드는 프록시(주황 구름)를 쓰지 않습니다.

## 4. Cloudflare — 레코드 추가 (김도현 대조 후)

Cloudflare → neinom.com → DNS → Records → Add record. 김도현이 돌려드린 표대로만 넣습니다. 넣은 뒤 Resend 에서 **Verify** 를 누르고 "Verified" 가 되면 다음으로 갑니다.

## 5. Supabase — SMTP·이메일 로그인

Resend → API Keys → Create(권한: Sending access, 도메인 neinom.com). 이 키가 SMTP 비밀번호입니다(비밀값).

Authentication → Emails → SMTP Settings

| 항목 | 값 |
|---|---|
| Enable custom SMTP | 켬 |
| Sender email | `noreply@neinom.com` |
| Sender name | `동그란 사이` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | Resend API 키 |

Authentication → Sign In / Providers → Email

| 항목 | 값 |
|---|---|
| Enable Email provider | 켬 |
| Confirm email | 켬 |
| Secure email change / Secure password change | 켬 |
| Minimum password length | 10 (시험 설정 후보) |
| Password requirements | 영문 소문자·대문자·숫자 |
| Leaked password protection | **Free 라서 사용하지 않음**(증거에 그대로 적음) |

Authentication → Rate Limits: 이메일 발송 시간당 30(기본). Resend Free 일 100통 안에 들어갑니다. 가입 확인·재설정·재발송이 모두 이 한도를 씁니다.

## 6. Supabase — 주소·메일 문구

Authentication → URL Configuration

- Site URL: `https://neinom.com`
- Redirect URLs: **아래 두 개만** 넣습니다. 이미 `/**` 같은 넓은 주소가 있으면 지웁니다.
  - `https://neinom.com/auth/`
  - `http://localhost:4199/auth/`

Authentication → Emails → Templates (`{{ .ConfirmationURL }}` 은 그대로)

Confirm signup — 제목 `동그란 사이 가입을 확인해 주세요`
```html
<h2>동그란 사이</h2>
<p>아래 버튼을 눌러 이메일 주소를 확인해 주세요.</p>
<p><a href="{{ .ConfirmationURL }}">이메일 확인하기</a></p>
<p>가입하지 않으셨다면 이 메일을 무시해 주세요.</p>
```

Reset Password — 제목 `동그란 사이 비밀번호 재설정`
```html
<h2>동그란 사이</h2>
<p>아래 버튼을 눌러 새 비밀번호를 정해 주세요. 링크는 한 번만 쓸 수 있고 곧 만료됩니다.</p>
<p><a href="{{ .ConfirmationURL }}">비밀번호 다시 정하기</a></p>
<p>요청하지 않으셨다면 이 메일을 무시해 주세요. 비밀번호는 바뀌지 않습니다.</p>
```

## 7. 익명 로그인 — 영향 확인 후 끄기

- 게임 코드는 지금까지 Supabase 에 연결한 적이 없습니다(`prototype/index.html` 의 CSP `connect-src 'self'`). 그래서 게임 사용자에게는 영향이 없습니다.
- 확인: Authentication → Users 에서 익명(Anonymous) 사용자가 있는지 봅니다. SB-0002 시험은 끝에서 되돌렸으므로 없을 것으로 예상합니다. 있으면 수를 알려 주세요(지우지 말고).
- 확인 후 Authentication → Sign In / Providers → Anonymous sign-ins: 끔.

## 8. 김도현에게 알려 주실 것 (비밀값 제외)

- Google: 클라이언트 만듦, Supabase 입력 완료, 테스트 사용자 등록 여부
- Resend: 도메인 상태(Verified 여부), Supabase SMTP 저장 완료
- 이메일 설정(확인 메일 켬, 최소 길이), Redirect URLs 두 개만 있는지
- 익명 사용자 수, 익명 로그인 끔 여부
- Advisors → Security 경고 수

## 참고

- Supabase 메일: https://supabase.com/docs/guides/auth/auth-smtp
- Supabase 비밀번호 보안: https://supabase.com/docs/guides/auth/password-security
- Supabase Google 로그인: https://supabase.com/docs/guides/auth/social-login/auth-google
- Supabase 계정 연결: https://supabase.com/docs/guides/auth/auth-identity-linking
- Resend SMTP: https://resend.com/docs/send-with-smtp
