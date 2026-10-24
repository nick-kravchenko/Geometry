use wasm_bindgen::prelude::*;
mod rust;
use crate::rust::pathfinding::breadth_first_search::breadth_first_search;


#[wasm_bindgen(start)]
pub fn main_js() -> Result<(), JsValue> {
    #[cfg(debug_assertions)]
    console_error_panic_hook::set_once();

    Ok(())
}

#[wasm_bindgen]
pub fn wasm_breadth_first_search(
    blocked_cells_numbers: &[u8],
    w: u32,
    h: u32,
    start: u32,
    end: u32,
) -> Vec<u32> {
    breadth_first_search(blocked_cells_numbers, w, h, start, end)
}
