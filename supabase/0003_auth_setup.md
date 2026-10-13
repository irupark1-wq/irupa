# SB-0003 로그인 설정 안내 (구글·이메일) — 김PO 직접 입력용

- 문서번호: SB-0003 / 작성: 김도현 / 받는 사람: 김PO / 날짜: 2026-10-13 / 상태: 입력 대기
- 근거: PO-AUTH-001, PO-HAND-007, DEV-25 3절
- 이 파일에는 SQL 이 없습니다. 계정 월드 저장 SQL 은 다음 파일(SB-0004)로 드립니다.
- **비밀값(Google client secret, SMTP 비밀번호)은 김도현에게 보내지 마세요.** 대시보드에만 넣고 "넣었어요"만 알려 주세요.
- 이 Supabase 프로젝트(`yvsqivhdwzbshpapfcsy`)와 아래 Google Cloud 프로젝트는 동그란 사이 전용입니다. 다른 프로젝트 설정을 바꾸지 않습니다.

## 순서 요약

| 순서 | 할 일 | 어디서 | 비용 |
|---|---|---|---|
| 1 | Google 로그인용 OAuth 클라이언트 만들기 | Google Cloud Console | 무료 |
| 2 | Supabase 에 Google 켜고 ID·secret 넣기 | Supabase 대시보드 | 무료 |
| 3 | 메일 발송 서비스 준비(SMTP) | 메일 서비스 + 도메인 DNS | 무료 요금제 가능 |
| 4 | Supabase 에 SMTP·이메일 로그인 설정 | Supabase 대시보드 | 무료 |
| 5 | 주소(URL) 설정 | Supabase 대시보드 | — |
| 6 | 메일 문구(한국어) 넣기 | Supabase 대시보드 | — |
| 7 | 익명 로그인 끄기 | Supabase 대시보드 | — |
| 8 | 결과 알려 주기 | 김도현에게 | — |

## 1. Google Cloud Console — OAuth 클라이언트

1. https://console.cloud.google.com 에서 **새 프로젝트**를 만듭니다. 이름 예: `neinom-game1`. 다른 서비스용 프로젝트를 재사용하지 않습니다.
2. 왼쪽 메뉴 **Google Auth Platform**(또는 "API 및 서비스 → OAuth 동의 화면")으로 갑니다.
   - 사용자 유형: **외부(External)**
   - 앱 이름: `동그란 사이`
   - 사용자 지원 이메일·개발자 연락처: 김PO 메일
   - 승인된 도메인: `neinom.com`
   - 범위(Scopes): `openid`, `email`, `profile` 세 개만. 다른 범위는 추가하지 않습니다.
3. **클라이언트(Credentials) → OAuth 클라이언트 ID 만들기**
   - 애플리케이션 유형: **웹 애플리케이션**
   - 승인된 JavaScript 원본: `https://neinom.com`
   - 승인된 리디렉션 URI: `https://yvsqivhdwzbshpapfcsy.supabase.co/auth/v1/callback`
4. 만들어진 **클라이언트 ID** 와 **클라이언트 보안 비밀(secret)** 을 복사해 둡니다. 2단계에서 Supabase 에만 넣습니다.
5. 처음에는 "테스트" 상태라 등록한 테스트 사용자만 로그인됩니다. 외부 공개 전에 **앱 게시(Publish)** 를 누릅니다. 위 세 범위만 쓰면 Google 심사는 보통 필요 없습니다.

## 2. Supabase — Google 켜기

대시보드 → **Authentication → Sign In / Providers → Google**

- Enable: 켬
- Client ID: 1단계의 클라이언트 ID
- Client Secret: 1단계의 secret
- 저장

## 3. 메일 발송 서비스(SMTP) 준비

Supabase 기본 메일은 **프로젝트 팀원 주소로만, 한 시간에 2통**만 보냅니다. 실제 사용자 가입 확인·비밀번호 재설정 메일을 보내려면 메일 서비스가 필요합니다.

권장: **Resend**(무료 요금제가 있습니다. 한도는 가입할 때 Resend 화면에서 확인해 주세요). Postmark, AWS SES, Brevo 도 됩니다.

1. 메일 서비스에 가입하고 도메인 `neinom.com` 을 추가합니다.
2. 메일 서비스가 알려 주는 **DNS 레코드(SPF·DKIM, 권장 DMARC)** 를 neinom.com 의 DNS 관리 화면에 넣습니다. 기존 GitHub Pages 용 레코드(A/CNAME)는 그대로 둡니다.
3. 도메인 인증이 "Verified" 가 되면 SMTP 정보(호스트, 포트, 사용자명, 비밀번호)를 확인합니다.

## 4. Supabase — 이메일 로그인과 SMTP

대시보드 → **Authentication → Sign In / Providers → Email**

| 항목 | 값 |
|---|---|
| Enable Email provider | 켬 |
| Confirm email | **켬** (가입 후 메일 확인해야 로그인) |
| Secure email change | 켬 |
| Secure password change | 켬 |
| Minimum password length | **10** |
| Password requirements | 영문 소문자·대문자·숫자 포함(가능하면 기호까지) |
| Leaked password protection | Pro 요금제에서만 켤 수 있습니다. Free 면 꺼진 채로 두고 알려 주세요(DEV-25 3.5절) |

대시보드 → **Authentication → Emails → SMTP Settings**

- Enable custom SMTP: 켬
- Sender email: `noreply@neinom.com`
- Sender name: `동그란 사이`
- Host·Port·Username·Password: 3단계 값

대시보드 → **Authentication → Rate Limits**

- 이메일 발송: 시간당 30(기본값 그대로 두어도 됩니다)
- 로그인·가입 시도 제한: 기본값 유지

## 5. 주소(URL) 설정

대시보드 → **Authentication → URL Configuration**

- Site URL: `https://neinom.com`
- Redirect URLs(추가):
  - `https://neinom.com/**`
  - `http://localhost:4199/**` (김도현 로컬 시험용. 정식 공개 때 지워도 됩니다)

## 6. 메일 문구(한국어)

대시보드 → **Authentication → Emails → Templates**. `{{ .ConfirmationURL }}` 은 그대로 둡니다.

**Confirm signup**
- 제목: `동그란 사이 가입을 확인해 주세요`
- 본문:
```html
<h2>동그란 사이</h2>
<p>아래 버튼을 눌러 이메일 주소를 확인해 주세요.</p>
<p><a href="{{ .ConfirmationURL }}">이메일 확인하기</a></p>
<p>가입하지 않으셨다면 이 메일을 무시해 주세요.</p>
```

**Reset Password**
- 제목: `동그란 사이 비밀번호 재설정`
- 본문:
```html
<h2>동그란 사이</h2>
<p>아래 버튼을 눌러 새 비밀번호를 정해 주세요. 링크는 한 번만 쓸 수 있고 곧 만료됩니다.</p>
<p><a href="{{ .ConfirmationURL }}">비밀번호 다시 정하기</a></p>
<p>요청하지 않으셨다면 이 메일을 무시해 주세요. 비밀번호는 바뀌지 않습니다.</p>
```

## 7. 익명 로그인 끄기

대시보드 → **Authentication → Sign In / Providers → Anonymous sign-ins: 끔**

SB-0002 때 켰지만, PO-AUTH-001 에서 "계정 없이 하기"는 이 기기 저장만 쓰기로 해서 서버 익명 계정이 필요 없습니다. 꺼 두면 쓸모없는 익명 사용자가 쌓이지 않습니다.

## 8. 김도현에게 알려 주실 것 (비밀값 제외)

- Supabase 요금제: Free / Pro
- Google 제공자: 켬 / 앱 게시 상태(테스트·게시)
- 메일 서비스 이름, 도메인 인증 완료 여부, Supabase SMTP 저장 완료 여부
- Confirm email 켬 여부, 최소 비밀번호 길이
- URL 설정 완료 여부, 익명 로그인 끔 여부
- 대시보드 **Advisors → Security** 경고 수

## 참고

- Supabase 메일 설정: https://supabase.com/docs/guides/auth/auth-smtp
- Supabase 비밀번호 보안: https://supabase.com/docs/guides/auth/password-security
- Supabase Google 로그인: https://supabase.com/docs/guides/auth/social-login/auth-google
