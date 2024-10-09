extern crate console_error_panic_hook;
use std::panic;
use wasm_bindgen::prelude::*;

mod pathfinding;
use crate::pathfinding::a_star_search::a_star_search;
use crate::pathfinding::breadth_first_search::breadth_first_search;

#[wasm_bindgen(start)]
pub fn main() {
  panic::set_hook(Box::new(console_error_panic_hook::hook));
}

#[wasm_bindgen]
pub fn wasm_breadth_first_search(
  blocked_cells_numbers: &[u8], // Adjusted the type to match the earlier function
  w: u32,
  h: u32,
  start: u32,
  end: u32,
  diagonal: bool, // Added diagonal flag to match the original logic
) -> Vec<u32> {
  breadth_first_search(blocked_cells_numbers, w, h, start, end, diagonal)
}

#[wasm_bindgen]
pub fn wasm_a_star_search(
  blocked_cells_numbers: &[usize],
  w: usize,
  h: usize,
  start: usize,
  end: usize,
) -> Vec<usize> {
  a_star_search(blocked_cells_numbers, w, h, start, end)
}

#[wasm_bindgen]
extern "C" {
  #[wasm_bindgen(js_namespace = console)]
  fn log(s: &str);

  pub fn memory() -> js_sys::WebAssembly::Memory;
}
