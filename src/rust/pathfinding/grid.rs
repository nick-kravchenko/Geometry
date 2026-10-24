pub const BLOCKED: u8 = 0x1;

// Copy of a grid with a one-cell blocked border, so neighbors never need bounds checks and every
// cell is addressed by a single index: left/right is ±1, up/down is ±padded_w.
// Cells hold BLOCKED or 0; searches may use the other bits as per-search state.
pub struct PaddedGrid {
  pub w: usize,
  pub h: usize,
  pub padded_w: usize,
  pub cells: Vec<u8>,
}

impl PaddedGrid {
  pub fn new(w: usize, h: usize) -> PaddedGrid {
    let padded_w = w + 2;
    PaddedGrid { w, h, padded_w, cells: vec![BLOCKED; padded_w * (h + 2)] }
  }

  // Loads a w * h grid where 1 is blocked and anything else is free, clearing any search state.
  pub fn load(&mut self, blocked_cells: &[u8]) {
    for (y, row) in blocked_cells.chunks_exact(self.w).take(self.h).enumerate() {
      let offset = (y + 1) * self.padded_w + 1;
      for (cell, &value) in self.cells[offset..offset + self.w].iter_mut().zip(row) {
        *cell = (value == 1) as u8;
      }
    }
  }

  #[inline]
  pub fn to_padded(&self, cell: u32) -> usize {
    let cell = cell as usize;
    (cell / self.w + 1) * self.padded_w + cell % self.w + 1
  }

  #[inline]
  pub fn from_padded(&self, cell: usize) -> u32 {
    ((cell / self.padded_w - 1) * self.w + cell % self.padded_w - 1) as u32
  }

  #[inline]
  pub fn x(&self, cell: usize) -> i32 {
    (cell % self.padded_w) as i32
  }

  #[inline]
  pub fn y(&self, cell: usize) -> i32 {
    (cell / self.padded_w) as i32
  }
}

// Validates a search request the same way the TypeScript searches do.
// None - a search is needed; Some(path) - the answer without searching.
pub fn trivial_path(blocked_cells: &[u8], w: u32, h: u32, start: u32, end: u32) -> Option<Vec<u32>> {
  let grid_size = w as usize * h as usize;
  if grid_size == 0 || blocked_cells.len() < grid_size { return Some(Vec::new()); } // empty or undersized grid
  if start as usize >= grid_size || end as usize >= grid_size { return Some(Vec::new()); } // start or end out of bounds
  if blocked_cells[start as usize] == 1 || blocked_cells[end as usize] == 1 { return Some(Vec::new()); } // start or end blocked
  if start == end { return Some(vec![start]); }
  None
}

// Per-search markers: a cell's scratch values are valid only while its stamp equals the current
// generation, so buffers never need clearing between searches.
pub struct Generations {
  stamps: Vec<u32>,
  current: u32,
}

impl Generations {
  pub fn new(size: usize) -> Generations {
    Generations { stamps: vec![0; size], current: 0 }
  }

  pub fn next(&mut self) {
    self.current = self.current.wrapping_add(1);
    if self.current == 0 { // wrapped around: old stamps could look current again
      self.stamps.fill(0);
      self.current = 1;
    }
  }

  #[inline]
  pub fn current(&self) -> u32 {
    self.current
  }

  #[inline]
  pub fn is_current(&self, cell: usize) -> bool {
    self.stamps[cell] == self.current
  }

  #[inline]
  pub fn mark(&mut self, cell: usize) {
    self.stamps[cell] = self.current;
  }
}

#[cfg(test)]
mod tests {
  use super::Generations;

  #[test]
  fn generations_restart_cleanly_after_wrapping() {
    let mut generations = Generations::new(2);
    generations.next();
    generations.mark(0);
    generations.current = u32::MAX; // pretend many searches ran; cell 0 still holds a stamp of 1
    generations.next(); // wraps: every stamp must be forgotten
    assert_eq!(generations.current(), 1);
    assert!(!generations.is_current(0));
  }
}
