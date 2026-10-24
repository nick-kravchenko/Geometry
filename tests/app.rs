use geometry::{wasm_breadth_first_search, Pathfinder};
use std::collections::VecDeque;

#[test]
fn exported_bfs_finds_path() {
    // 3x2 grid, wall at (1,0) forces the path down and back up
    let grid = [0, 1, 0, 0, 0, 0];
    assert_eq!(wasm_breadth_first_search(&grid, 3, 2, 0, 2), vec![0, 3, 4, 5, 2]);
}

#[test]
fn exported_bfs_returns_empty_when_unreachable() {
    assert!(wasm_breadth_first_search(&[0, 1, 0], 3, 1, 0, 2).is_empty());
}

// xorshift32, deterministic so failures are reproducible
struct Random(u32);

impl Random {
    fn next(&mut self) -> f64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 17;
        self.0 ^= self.0 << 5;
        self.0 as f64 / u32::MAX as f64
    }
}

const W: usize = 23;
const H: usize = 17;

fn random_grid(random: &mut Random) -> (Vec<u8>, u32, u32) {
    let mut grid: Vec<u8> = (0..W * H).map(|_| (random.next() < 0.3) as u8).collect();
    let start = (random.next() * (W * H - 1) as f64) as usize;
    let end = (random.next() * (W * H - 1) as f64) as usize;
    grid[start] = 0;
    grid[end] = 0;
    (grid, start as u32, end as u32)
}

// cost of a path where diagonal steps cost √2; None if a step is not a legal move
fn path_cost(path: &[u32], grid: &[u8], diagonal: bool) -> Option<f64> {
    let mut cost = 0.0;
    for pair in path.windows(2) {
        let (a, b) = (pair[0] as usize, pair[1] as usize);
        if grid[b] == 1 { return None; }
        let (ax, ay, bx, by) = ((a % W) as i32, (a / W) as i32, (b % W) as i32, (b / W) as i32);
        let (dx, dy) = ((ax - bx).abs(), (ay - by).abs());
        if dx > 1 || dy > 1 || dx + dy == 0 { return None; }
        if dx == 1 && dy == 1 {
            if !diagonal || grid[(ay as usize) * W + bx as usize] == 1 || grid[(by as usize) * W + ax as usize] == 1 { return None; }
            cost += std::f64::consts::SQRT_2;
        } else {
            cost += 1.0;
        }
    }
    Some(cost)
}

// shortest number of steps (diagonal moves cost 1, no corner cutting), None if unreachable
fn reference_steps(grid: &[u8], start: usize, end: usize, diagonal: bool) -> Option<usize> {
    let mut steps = vec![usize::MAX; W * H];
    let mut queue = VecDeque::from([start]);
    steps[start] = 0;
    while let Some(cell) = queue.pop_front() {
        let (x, y) = ((cell % W) as i32, (cell / W) as i32);
        for (dx, dy) in [(1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)] {
            if (dx != 0 && dy != 0) && !diagonal { continue; }
            let (nx, ny) = (x + dx, y + dy);
            if nx < 0 || ny < 0 || nx >= W as i32 || ny >= H as i32 { continue; }
            let next = ny as usize * W + nx as usize;
            if grid[next] == 1 || steps[next] != usize::MAX { continue; }
            if dx != 0 && dy != 0 && (grid[y as usize * W + nx as usize] == 1 || grid[ny as usize * W + x as usize] == 1) { continue; }
            steps[next] = steps[cell] + 1;
            queue.push_back(next);
        }
    }
    (steps[end] != usize::MAX).then_some(steps[end])
}

// Dijkstra with √2 diagonals and no corner cutting
fn reference_octile_cost(grid: &[u8], start: usize, end: usize) -> Option<f64> {
    let mut dist = vec![f64::INFINITY; W * H];
    let mut done = vec![false; W * H];
    dist[start] = 0.0;
    loop {
        let cell = (0..W * H).filter(|&i| !done[i] && dist[i].is_finite()).min_by(|&a, &b| dist[a].total_cmp(&dist[b]))?;
        if cell == end { return Some(dist[end]); }
        done[cell] = true;
        let (x, y) = ((cell % W) as i32, (cell / W) as i32);
        for (dx, dy) in [(1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)] {
            let (nx, ny) = (x + dx, y + dy);
            if nx < 0 || ny < 0 || nx >= W as i32 || ny >= H as i32 { continue; }
            let next = ny as usize * W + nx as usize;
            if grid[next] == 1 { continue; }
            if dx != 0 && dy != 0 && (grid[y as usize * W + nx as usize] == 1 || grid[ny as usize * W + x as usize] == 1) { continue; }
            let cost = dist[cell] + if dx != 0 && dy != 0 { std::f64::consts::SQRT_2 } else { 1.0 };
            if cost < dist[next] { dist[next] = cost; }
        }
    }
}

#[test]
fn pathfinder_searches_match_references_when_reused_across_changing_grids() {
    // one Pathfinder for every grid, like a game updating obstacles each frame
    let mut pathfinder = Pathfinder::new(W as u32, H as u32);
    let mut random = Random(0x9E3779B9);
    for _ in 0..500 {
        let (grid, start, end) = random_grid(&mut random);
        pathfinder.set_cells(&grid);
        let steps = reference_steps(&grid, start as usize, end as usize, false);
        let diagonal_steps = reference_steps(&grid, start as usize, end as usize, true);
        let octile_cost = reference_octile_cost(&grid, start as usize, end as usize);

        let check_steps = |path: Vec<u32>, expected: Option<usize>, diagonal: bool| match expected {
            None => assert!(path.is_empty()),
            Some(steps) => {
                assert_eq!((path[0], *path.last().unwrap()), (start, end));
                assert_eq!(path.len() - 1, steps);
                assert!(path_cost(&path, &grid, diagonal).is_some());
            }
        };
        check_steps(pathfinder.breadth_first_search(start, end, false), steps, false);
        check_steps(pathfinder.breadth_first_search(start, end, true), diagonal_steps, true);
        check_steps(pathfinder.a_star_search(start, end, false), steps, false);
        check_steps(pathfinder.a_star_search(start, end, true), diagonal_steps, true);
        check_steps(pathfinder.jump_point_search(start, end, false), steps, false);

        let path = pathfinder.jump_point_search(start, end, true);
        match octile_cost {
            None => assert!(path.is_empty()),
            Some(cost) => {
                assert_eq!((path[0], *path.last().unwrap()), (start, end));
                assert!((path_cost(&path, &grid, true).unwrap() - cost).abs() < 1e-9);
            }
        }
    }
}

#[test]
fn pathfinder_handles_edge_cases() {
    let mut pathfinder = Pathfinder::new(2, 2);
    pathfinder.set_cells(&[0, 1, 0, 0]);
    for diagonal in [false, true] {
        assert!(pathfinder.a_star_search(0, 4, diagonal).is_empty()); // end out of bounds
        assert!(pathfinder.jump_point_search(9, 0, diagonal).is_empty()); // start out of bounds
        assert!(pathfinder.jump_point_search(0, 1, diagonal).is_empty()); // end blocked
        assert_eq!(pathfinder.a_star_search(3, 3, diagonal), vec![3]); // start equals end
    }
    assert!(pathfinder.breadth_first_search(0, 1, false).is_empty());
    assert!(pathfinder.breadth_first_search(0, 1, true).is_empty());
    assert!(Pathfinder::new(0, 0).breadth_first_search(0, 0, true).is_empty()); // empty grid
}

#[test]
fn pathfinder_visibility_graph_reaches_end_like_diagonal_bfs_and_beats_grid_paths() {
    let mut pathfinder = Pathfinder::new(W as u32, H as u32);
    let mut random = Random(0x2545F491);
    for _ in 0..500 {
        let (grid, start, end) = random_grid(&mut random);
        pathfinder.set_cells(&grid);
        let points = pathfinder.visibility_graph_search(start, end);
        match reference_octile_cost(&grid, start as usize, end as usize) {
            None => assert!(points.is_empty()),
            Some(cost) => {
                let center = |cell: u32| [(cell as usize % W) as f64 + 0.5, (cell as usize / W) as f64 + 0.5];
                assert_eq!(points[..2], center(start));
                assert_eq!(points[points.len() - 2..], center(end));
                // an any-angle path is never longer than the best path along grid moves
                let length: f64 = points.chunks(2).zip(points.chunks(2).skip(1))
                    .map(|(a, b)| (b[0] - a[0]).hypot(b[1] - a[1])).sum();
                assert!(length <= cost + 1e-9, "{length} > {cost}");
            }
        }
    }
}

#[test]
fn pathfinder_circle_visibility_graph_stays_out_of_circles() {
    let mut pathfinder = Pathfinder::new(1, 1);
    let mut random = Random(0x1B873593);
    for _ in 0..300 {
        let size = 200.0;
        let (start, end) = ((random.next() * size, random.next() * size), (random.next() * size, random.next() * size));
        // disjoint circles that leave start and end free
        let mut circles: Vec<(f64, f64, f64)> = Vec::new();
        for _ in 0..300 {
            let radius = 4.0 + random.next() * 16.0;
            let (x, y) = (radius + random.next() * (size - 2.0 * radius), radius + random.next() * (size - 2.0 * radius));
            let apart = circles.iter().all(|&(cx, cy, r)| (x - cx).hypot(y - cy) > radius + r + 2.0);
            let clear = [start, end].iter().all(|&(px, py)| (x - px).hypot(y - py) > radius + 1.0);
            if apart && clear && circles.len() < 12 { circles.push((x, y, radius)); }
        }
        let flat: Vec<f64> = circles.iter().flat_map(|&(x, y, r)| [x, y, r]).collect();
        let path = pathfinder.circle_visibility_graph_search(&flat, start.0, start.1, end.0, end.1, 1.0);
        assert_eq!((path[0], path[1]), start);
        assert_eq!((path[path.len() - 2], path[path.len() - 1]), end);
        for (a, b) in path.chunks(2).zip(path.chunks(2).skip(1)) {
            for &(cx, cy, radius) in &circles {
                // distance from the center to the segment; flattened arcs cut in by at most step² / (8 · radius)
                let (dx, dy) = (b[0] - a[0], b[1] - a[1]);
                let t = (((cx - a[0]) * dx + (cy - a[1]) * dy) / (dx * dx + dy * dy).max(1e-12)).clamp(0.0, 1.0);
                let distance = (a[0] + t * dx - cx).hypot(a[1] + t * dy - cy);
                assert!(distance > radius - 1.0 / (8.0 * radius) - 1e-9, "{distance} < {radius}");
            }
        }
    }
}

#[test]
fn pathfinder_navigation_graph_finds_paths_close_to_the_exact_visibility_graph() {
    let mut random = Random(0x2545F491);
    let size = 100usize;
    let mut pathfinder = Pathfinder::new(size as u32, size as u32);
    for _ in 0..20 {
        // rectangles kept 6 pixels apart and from the edge, so no passage is too narrow for the graph
        let mut grid = vec![0u8; size * size];
        let mut taken = vec![false; size * size];
        for _ in 0..60 {
            let (x0, y0) = (6 + (random.next() * 80.0) as usize, 6 + (random.next() * 80.0) as usize);
            let (x1, y1) = ((x0 + 3 + (random.next() * 20.0) as usize).min(size - 7), (y0 + 3 + (random.next() * 20.0) as usize).min(size - 7));
            if (y0..y1).any(|y| (x0..x1).any(|x| taken[y * size + x])) { continue; }
            for y in y0.saturating_sub(6)..(y1 + 6).min(size) { for x in x0.saturating_sub(6)..(x1 + 6).min(size) { taken[y * size + x] = true; } }
            for y in y0..y1 { for x in x0..x1 { grid[y * size + x] = 1; } }
        }
        pathfinder.set_cells(&grid);
        pathfinder.build_navigation_graph(1.5);
        for _ in 0..10 {
            let (from, to) = ((random.next() * (size * size) as f64) as u32, (random.next() * (size * size) as f64) as u32);
            if grid[from as usize] == 1 || grid[to as usize] == 1 { continue; }
            let center = |cell: u32| ((cell as usize % size) as f64 + 0.5, (cell as usize / size) as f64 + 0.5);
            let ((sx, sy), (ex, ey)) = (center(from), center(to));
            let path = pathfinder.navigation_graph_search(sx, sy, ex, ey);
            let reachable = !pathfinder.breadth_first_search(from, to, false).is_empty();
            assert_eq!(!path.is_empty(), reachable);
            if !reachable { continue; }
            let length = |path: &[f64]| -> f64 { path.chunks(2).zip(path.chunks(2).skip(1)).map(|(a, b)| (b[0] - a[0]).hypot(b[1] - a[1])).sum() };
            let exact = length(&pathfinder.visibility_graph_search(from, to));
            let bends = (path.len() / 2 - 2) as f64;
            // nodes sit just off the corners, so each bend may cost a few pixels
            assert!(length(&path) <= exact + 3.0 * bends + 1.0, "{} > {exact}", length(&path));
        }
    }
}
