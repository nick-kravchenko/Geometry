use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::js_sys::Uint8Array;
mod rust;
use crate::rust::pathfinding::breadth_first_search::breadth_first_search;

// When the `wee_alloc` feature is enabled, this uses `wee_alloc` as the global
// allocator.
//
// If you don't want to use `wee_alloc`, you can safely delete this.
#[cfg(feature = "wee_alloc")]
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;


// This is like the `main` function, except for JavaScript.
#[wasm_bindgen(start)]
pub fn main_js() -> Result<(), JsValue> {
    // This provides better error messages in debug mode.
    // It's disabled in release mode so it doesn't bloat up the file size.
    #[cfg(debug_assertions)]
    console_error_panic_hook::set_once();

    Ok(())
}

#[wasm_bindgen]
pub fn wasm_breadth_first_search(
    memory: JsValue, // Adjusted the type to match the earlier function
    w: u32,
    h: u32,
    start: u32,
    end: u32,
    diagonal: bool, // Added diagonal flag to match the original logic
) -> Vec<u32> {
    let memory = Uint8Array::new(&memory);
    let blocked_cells_numbers = memory.to_vec();
    breadth_first_search(blocked_cells_numbers, w, h, start, end, diagonal)
}