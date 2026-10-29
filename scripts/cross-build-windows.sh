#!/usr/bin/env bash
# 리눅스(Ubuntu 24.04)에서 Windows 설치 파일(.exe)을 교차 빌드한다. — 개발자용
#
# 보통은 `rustup target add x86_64-pc-windows-gnu` 한 줄이면 되지만,
# rustup 서버에 접근할 수 없는 환경을 위해 표준 라이브러리를 소스에서 직접 빌드한다 (-Zbuild-std).
#
# 준비물
#   apt:  mingw-w64 nsis
#   현재 rustc 와 "정확히 같은 버전"의 표준 라이브러리 소스를 sysroot 에 둘 것:
#     V=$(rustc -V | cut -d' ' -f2)
#     git clone --depth 1 --filter=blob:none --sparse --branch $V https://github.com/rust-lang/rust rust-src
#     (cd rust-src && git sparse-checkout set library && git submodule update --init --depth 1 library/backtrace)
#     cp -r rust-src/library "$(rustc --print sysroot)/lib/rustlib/src/rust/library"
#   (Debian 의 rust-*-src 패키지는 Windows 의존성이 빠져 있어 쓸 수 없다)
#
# 결과: $CARGO_TARGET_DIR(기본 src-tauri/target)/x86_64-pc-windows-gnu/release/bundle/nsis/HanWord_*_x64-setup.exe
set -euo pipefail
cd "$(dirname "$0")/.."

export RUSTC_BOOTSTRAP=1   # 안정판 컴파일러에서 -Zbuild-std 허용
export CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER=x86_64-w64-mingw32-gcc
export CC_x86_64_pc_windows_gnu=x86_64-w64-mingw32-gcc
export AR_x86_64_pc_windows_gnu=x86_64-w64-mingw32-ar

# Tauri CLI 는 `rustup target list` 에서 "(installed)" 표시로 대상을 확인하므로,
# 표준 라이브러리를 소스로 빌드하는 이 방식에서는 대상이 있다고 알려 주는 래퍼를 앞에 둔다.
SHIM="$(mktemp -d)"
REAL_RUSTUP="$(command -v rustup)"
cat > "$SHIM/rustup" <<SH
#!/usr/bin/env bash
if [ "\$1" = "target" ] && [ "\$2" = "list" ]; then
  echo "x86_64-unknown-linux-gnu (installed)"
  echo "x86_64-pc-windows-gnu (installed)"
  exit 0
fi
exec "$REAL_RUSTUP" "\$@"
SH
chmod +x "$SHIM/rustup"
export PATH="$SHIM:$PATH"

npx tauri build \
  --target x86_64-pc-windows-gnu \
  --bundles nsis \
  -- -Zbuild-std=std,panic_abort

ls -la "${CARGO_TARGET_DIR:-src-tauri/target}/x86_64-pc-windows-gnu/release/bundle/nsis/"
