use wasm_bindgen::prelude::*;
mod rust;
use crate::rust::pathfinding::a_star_search::AStarSearch;
use crate::rust::pathfinding::breadth_first_search::{breadth_first_search, BreadthFirstSearch};
use crate::rust::pathfinding::circle_visibility_graph_search::{Circle, CircleVisibilityGraphSearch};
use crate::rust::pathfinding::jump_point_search::JumpPointSearch;
use crate::rust::pathfinding::visibility_graph_search::VisibilityGraphSearch;


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

// The module's memory, so JS can view a Pathfinder's grid in place:
// new Uint8Array(wasm_memory().buffer, pathfinder.cells_ptr(), w * h)
// Recreate the view before each use; it is detached whenever the memory grows.
#[wasm_bindgen]
pub fn wasm_memory() -> JsValue {
    wasm_bindgen::memory()
}

// Searches on a grid that lives in WASM memory, for callers that search repeatedly (every frame):
// JS writes obstacles straight into the grid (1 - blocked, anything else - free) instead of passing
// a grid on every call, and each algorithm keeps its buffers between searches.
#[wasm_bindgen]
pub struct Pathfinder {
    cells: Vec<u8>,
    w: usize,
    h: usize,
    breadth_first: Option<BreadthFirstSearch>,
    a_star: Option<AStarSearch>,
    jump_point: Option<JumpPointSearch>,
    visibility_graph: Option<VisibilityGraphSearch>,
    circle_visibility_graph: CircleVisibilityGraphSearch,
}

#[wasm_bindgen]
impl Pathfinder {
    #[wasm_bindgen(constructor)]
    pub fn new(w: u32, h: u32) -> Pathfinder {
        let (w, h) = (w as usize, h as usize);
        Pathfinder { cells: vec![0; w * h], w, h, breadth_first: None, a_star: None, jump_point: None, visibility_graph: None, circle_visibility_graph: CircleVisibilityGraphSearch::new() }
    }

    pub fn cells_ptr(&self) -> *const u8 {
        self.cells.as_ptr()
    }

    // Copies a whole grid in; an alternative to writing through a view of cells_ptr().
    pub fn set_cells(&mut self, cells: &[u8]) {
        let size = self.cells.len().min(cells.len());
        self.cells[..size].copy_from_slice(&cells[..size]);
    }

    pub fn breadth_first_search(&mut self, start: u32, end: u32, diagonal: bool) -> Vec<u32> {
        let (w, h) = (self.w, self.h);
        let search = self.breadth_first.get_or_insert_with(|| BreadthFirstSearch::new(w, h));
        if diagonal { search.search_diagonal(&self.cells, start, end) } else { search.search(&self.cells, start, end) }
    }

    pub fn a_star_search(&mut self, start: u32, end: u32, diagonal: bool) -> Vec<u32> {
        let (w, h) = (self.w, self.h);
        self.a_star.get_or_insert_with(|| AStarSearch::new(w, h)).search(&self.cells, start, end, diagonal)
    }

    pub fn jump_point_search(&mut self, start: u32, end: u32, diagonal: bool) -> Vec<u32> {
        let (w, h) = (self.w, self.h);
        self.jump_point.get_or_insert_with(|| JumpPointSearch::new(w, h)).search(&self.cells, start, end, diagonal)
    }

    // Waypoints in pixel coordinates as [x0, y0, x1, y1, ...]; see VisibilityGraphSearch.
    pub fn visibility_graph_search(&mut self, start: u32, end: u32) -> Vec<f64> {
        let (w, h) = (self.w, self.h);
        self.visibility_graph.get_or_insert_with(|| VisibilityGraphSearch::new(w, h)).search(&self.cells, start, end)
    }

    // Shortest path around round obstacles, independent of the grid: circles as [x, y, radius, ...]
    // in pixels, returns the path as [x0, y0, x1, y1, ...]; see CircleVisibilityGraphSearch.
    pub fn circle_visibility_graph_search(
        &mut self,
        circles: &[f64],
        start_x: f64,
        start_y: f64,
        end_x: f64,
        end_y: f64,
        max_step: f64,
    ) -> Vec<f64> {
        let circles: Vec<Circle> = circles.chunks_exact(3).map(|c| (c[0], c[1], c[2])).collect();
        self.circle_visibility_graph.search(&circles, (start_x, start_y), (end_x, end_y), max_step)
    }
}
