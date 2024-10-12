use std::collections::VecDeque;
use std::ptr;
use chrono::prelude::*;
use web_sys::console;

pub fn breadth_first_search(
  blocked_cells_numbers: &[u8],  // Take a slice instead of Vec<u8> to avoid unnecessary copying
  w: u32,
  h: u32,
  start: u32,
  end: u32,
) -> Vec<u32> {
  let grid_size = (w * h) as usize;

  log_formatted_timestamp_to_js();
  let mut queue: VecDeque<u32> = VecDeque::new();
  let mut parents: Vec<u32> = Vec::with_capacity(grid_size);
  unsafe {
    parents.set_len(grid_size);
    ptr::write_bytes(parents.as_mut_ptr(), u32::MAX as u8, grid_size);
  }
  log_formatted_timestamp_to_js();

  queue.push_front(start);

  let w_usize = w as usize;
  let h_usize = h as usize;

  let max_x = w - 1;
  let max_y = h - 1;

  let mut current_cell: u32;
  let mut current_cell_index: usize;

  let mut px: u32;
  let mut py: u32;

  let mut left_index: usize;
  let mut right_index: usize;
  let mut up_index: usize;
  let mut down_index: usize;

  let mut can_go_left: bool;
  let mut can_go_right: bool;
  let mut can_go_up: bool;
  let mut can_go_down: bool;

  while !queue.is_empty() {
    current_cell = queue.pop_front().unwrap();
    current_cell_index = current_cell as usize;

    if current_cell == end {
      break;
    }

    px = current_cell % w;
    py = current_cell / w;

    can_go_left = px > 0;
    can_go_right = px < max_x;
    can_go_up = py > 0;
    can_go_down = py < max_y;

    if can_go_left {
      left_index = current_cell_index - 1;
      if blocked_cells_numbers[left_index] != 0x1 {
        if parents[left_index] == 0xFFFFFFFF {
          queue.push_back(current_cell - 1);
          parents[left_index] = current_cell;
        }
      }
    }
    if can_go_right {
      right_index = current_cell_index + 1;
      if blocked_cells_numbers[right_index] != 0x1 {
        if parents[right_index] == 0xFFFFFFFF {
          queue.push_back(current_cell + 1);
          parents[right_index] = current_cell;
        }
      }
    }
    if can_go_up {
      up_index = current_cell_index - w_usize;
      if blocked_cells_numbers[up_index] != 0x1 {
        if parents[up_index] == 0xFFFFFFFF {
          queue.push_back(current_cell - w);
          parents[up_index] = current_cell;
        }
      }
    }
    if can_go_down {
      down_index = current_cell_index + h_usize;
      if blocked_cells_numbers[down_index] != 0x1 {
        if parents[down_index] == 0xFFFFFFFF {
          queue.push_back(current_cell + w);
          parents[down_index] = current_cell;
        }
      }
    }
  }

  reconstruct_path(&parents, end, start)
}

#[inline]
fn reconstruct_path(parents: &[u32], end: u32, start: u32) -> Vec<u32> {
  log_formatted_timestamp_to_js();
  let mut path: Vec<u32> = Vec::new();
  let mut current = end;

  while current != u32::MAX {
    path.push(current);
    if current == start {
      break;
    }
    current = parents[current as usize];
  }

  path.reverse();
  path
}

#[inline]
fn log_formatted_timestamp_to_js() {
  let now: DateTime<Utc> = Utc::now();
  let formatted_time = format!("Current timestamp: {}", now);
  console::log_1(&formatted_time.into()); // Log to JS console
}