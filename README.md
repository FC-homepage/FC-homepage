# 모든것의해답42

`index.html`에서 시작하는 GitHub Pages용 정적 복제본입니다. HTML, CSS, 이미지와 글꼴은 저장소 안의 파일을 사용합니다.

원본의 메뉴에 남아 있는 `/8`은 원본에서도 페이지 없음 화면이 표시되어, 그 화면을 `8.html`로 보존했습니다.

## 게시글

`posts/000_글유형_제목.json`으로 저장합니다. 세 자리 번호는 글마다 고유하게 부여합니다.

- `001_emph_황금의 유산(7.0) 패치 대비 부대사이트 수정진행.json`
- `002_emph_(완)부대 5주년 이벤트 안내.json`
- `003_공지_7.0 - 고난도 컨텐츠 입문자 부대 지원 안내.json`

JSON의 `title`, `date`, `contentHtml`을 수정한 뒤 `npm run build`를 실행하면 게시판 목록과 글 읽기 HTML이 갱신됩니다. 파일명에 사용할 수 없는 문자는 `-`로 바꿉니다. `contentHtml`의 이미지 경로는 `assets/파일명`처럼 사이트 루트를 기준으로 적습니다.

새 글은 기존 JSON을 바탕으로 번호·유형·제목·본문을 변경해 추가합니다. 공지사항의 `boardId`는 `tYQOFY`, 부대공지의 `boardId`는 `tCdWBr`입니다. `sourceId`는 기존 글과 겹치지 않는 값으로 지정합니다. 원본의 공개 댓글은 읽기 전용으로 보존했습니다.

## GitHub Pages

저장소의 **Settings > Pages > Deploy from a branch**에서 배포할 브랜치와 **/(root)**를 지정합니다. 생성된 HTML과 `assets`, `posts`, `data`, `.nojekyll`을 함께 올립니다. GitHub Pages 자체에서는 빌드할 필요가 없습니다.

`npm run preview`로 로컬 미리보기를 열 수 있습니다. 원본을 다시 수집하는 `npm run import`는 현재 HTML과 JSON을 원본 사이트의 내용으로 다시 생성합니다.
