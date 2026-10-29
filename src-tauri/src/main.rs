// 배포판에서 검은 콘솔 창이 뜨지 않게 한다 (지우지 말 것)
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    hanword_lib::run();
}
