use wasm_bindgen::prelude::*;
use web_sys::js_sys::Uint8Array;
mod rust;
use crate::rust::pathfinding::breadth_first_search::breadth_first_search;

#[cfg(feature = "wee_alloc")]
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;


#[wasm_bindgen(start)]
pub fn main_js() -> Result<(), JsValue> {
    #[cfg(debug_assertions)]
    console_error_panic_hook::set_once();

    Ok(())
}

#[wasm_bindgen]
pub fn wasm_breadth_first_search(
    memory: JsValue,
    w: u32,
    h: u32,
    start: u32,
    end: u32,
    diagonal: bool,
) -> Vec<u32> {
    let memory: Uint8Array = Uint8Array::new(&memory);
    let blocked_cells_numbers: Vec<u8> = memory.to_vec();
    let path: Vec<u32> = breadth_first_search(&blocked_cells_numbers, w, h, start, end, diagonal);
    path
}